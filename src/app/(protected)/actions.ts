"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { createOrder } from "@/lib/alpaca";
import { validateProposal } from "@/lib/guardrails";
import { runScheduledScan, type ScanResult } from "@/lib/scheduled-scan";

async function requireAuth() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    throw new Error("Unauthorized");
  }
}

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function approveProposal(
  proposalId: number
): Promise<ActionResult> {
  await requireAuth();

  const { rows } = await db.query(
    `SELECT id, symbol, side, qty, order_type, limit_price,
            stop_loss, take_profit, status
       FROM proposals
      WHERE id = $1`,
    [proposalId]
  );
  const proposal = rows[0];
  if (!proposal) return { ok: false, error: "Proposal not found" };
  if (proposal.status !== "pending") {
    return { ok: false, error: `Proposal is already ${proposal.status}` };
  }

  const check = await validateProposal({
    symbol: proposal.symbol,
    side: proposal.side,
    qty: Number(proposal.qty),
    order_type: proposal.order_type,
    limit_price:
      proposal.limit_price != null ? Number(proposal.limit_price) : null,
    stop_loss:
      proposal.stop_loss != null ? Number(proposal.stop_loss) : null,
    take_profit:
      proposal.take_profit != null ? Number(proposal.take_profit) : null,
  });
  if (!check.ok) {
    return {
      ok: false,
      error: `Guardrails blocked execution: ${check.violations.join(" · ")}`,
    };
  }

  try {
    const order = await createOrder({
      symbol: proposal.symbol,
      qty: Number(proposal.qty),
      side: proposal.side,
      type: proposal.order_type,
      limit_price:
        proposal.limit_price != null ? Number(proposal.limit_price) : undefined,
      stop_loss:
        proposal.stop_loss != null ? Number(proposal.stop_loss) : undefined,
      take_profit:
        proposal.take_profit != null
          ? Number(proposal.take_profit)
          : undefined,
    });

    await db.query(
      `INSERT INTO trades
         (proposal_id, alpaca_order_id, symbol, side, qty,
          filled_qty, filled_avg_price, status, submitted_at, filled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        proposal.id,
        order.id,
        order.symbol,
        order.side,
        order.qty,
        order.filled_qty ?? null,
        order.filled_avg_price ?? null,
        order.status,
        order.submitted_at,
        order.filled_at ?? null,
      ]
    );

    await db.query(
      `UPDATE proposals SET status = 'executed', decided_at = NOW() WHERE id = $1`,
      [proposal.id]
    );

    revalidatePath("/");
    return {
      ok: true,
      message: `Order ${order.id} submitted (${order.status}).`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Execution failed: ${message}` };
  }
}

export async function rejectProposal(
  proposalId: number
): Promise<ActionResult> {
  await requireAuth();

  const res = await db.query(
    `UPDATE proposals
        SET status = 'rejected', decided_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING id`,
    [proposalId]
  );

  if (res.rowCount === 0) {
    return { ok: false, error: "Proposal not found or not pending" };
  }

  revalidatePath("/");
  return { ok: true, message: "Proposal rejected." };
}

export async function addToWatchlist(
  symbol: string,
  notes?: string
): Promise<ActionResult> {
  await requireAuth();

  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(normalized)) {
    return { ok: false, error: "Invalid symbol format" };
  }

  try {
    await db.query(
      `INSERT INTO watchlist (symbol, notes) VALUES ($1, $2)
       ON CONFLICT (symbol) DO UPDATE SET notes = EXCLUDED.notes`,
      [normalized, notes ?? null]
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }

  revalidatePath("/");
  return { ok: true, message: `${normalized} added to watchlist.` };
}

export async function removeFromWatchlist(
  id: number
): Promise<ActionResult> {
  await requireAuth();

  const res = await db.query(
    "DELETE FROM watchlist WHERE id = $1 RETURNING symbol",
    [id]
  );
  if (res.rowCount === 0) {
    return { ok: false, error: "Watchlist entry not found" };
  }

  revalidatePath("/");
  return { ok: true, message: `Removed ${res.rows[0].symbol}.` };
}

const ALLOWED_INTERVALS = [5, 10, 15, 30, 60, 120] as const;

export async function setCronEnabled(
  enabled: boolean
): Promise<ActionResult> {
  await requireAuth();
  await db.query(
    `INSERT INTO cron_config (id, enabled, interval_minutes, updated_at)
     VALUES (1, $1, 15, NOW())
     ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
    [enabled]
  );
  revalidatePath("/");
  return {
    ok: true,
    message: enabled ? "Scheduled scans enabled." : "Scheduled scans paused.",
  };
}

export async function setCronInterval(
  minutes: number
): Promise<ActionResult> {
  await requireAuth();
  if (!ALLOWED_INTERVALS.includes(minutes as (typeof ALLOWED_INTERVALS)[number])) {
    return {
      ok: false,
      error: `Interval must be one of ${ALLOWED_INTERVALS.join(", ")}`,
    };
  }
  await db.query(
    `INSERT INTO cron_config (id, enabled, interval_minutes, updated_at)
     VALUES (1, TRUE, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET interval_minutes = EXCLUDED.interval_minutes, updated_at = NOW()`,
    [minutes]
  );
  revalidatePath("/");
  return { ok: true, message: `Interval set to ${minutes} minutes.` };
}

export async function runCronNow(): Promise<
  ActionResult & { result?: ScanResult }
> {
  await requireAuth();
  try {
    const result = await runScheduledScan({ force: true });
    revalidatePath("/");
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? "Scan failed",
        result,
      };
    }
    return {
      ok: true,
      message: result.skipped
        ? `Skipped: ${result.skipped}`
        : `Scan complete — ${result.symbols_scanned} scanned, ${result.proposals_created} proposals.`,
      result,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
