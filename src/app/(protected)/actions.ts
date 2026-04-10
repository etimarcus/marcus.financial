"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { createOrder, getAsset } from "@/lib/alpaca";
import { validateProposal } from "@/lib/guardrails";
import {
  runScan,
  type ScanResult,
  type ScannerKey,
} from "@/lib/scheduled-scan";

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

  let companyName: string | null = null;
  try {
    const asset = await getAsset(normalized);
    companyName = asset.name || null;
  } catch {
    // Alpaca doesn't recognize the symbol — still let the user add it;
    // it just won't have a company name. Could also bail here.
  }

  try {
    await db.query(
      `INSERT INTO watchlist (symbol, notes, name) VALUES ($1, $2, $3)
       ON CONFLICT (symbol) DO UPDATE
         SET notes = EXCLUDED.notes,
             name = COALESCE(EXCLUDED.name, watchlist.name)`,
      [normalized, notes ?? null, companyName]
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

const ALLOWED_INTERVALS = [5, 10, 15, 30, 60, 120, 240] as const;
const SCHEDULED_KEYS: ScannerKey[] = ["alpaca", "tradingview", "polymarket"];

function isScheduledKey(k: string): k is ScannerKey {
  return (SCHEDULED_KEYS as string[]).includes(k);
}

export async function setScannerEnabled(
  scannerKey: string,
  enabled: boolean
): Promise<ActionResult> {
  await requireAuth();
  if (!isScheduledKey(scannerKey)) {
    return { ok: false, error: `Unknown scheduled scanner: ${scannerKey}` };
  }
  await db.query(
    `INSERT INTO scanner_config (scanner_key, enabled, interval_minutes, updated_at)
     VALUES ($1, $2, 15, NOW())
     ON CONFLICT (scanner_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
    [scannerKey, enabled]
  );
  revalidatePath("/");
  return {
    ok: true,
    message: `${scannerKey} ${enabled ? "enabled" : "paused"}.`,
  };
}

export async function setScannerInterval(
  scannerKey: string,
  minutes: number
): Promise<ActionResult> {
  await requireAuth();
  if (!isScheduledKey(scannerKey)) {
    return { ok: false, error: `Unknown scheduled scanner: ${scannerKey}` };
  }
  if (
    !ALLOWED_INTERVALS.includes(minutes as (typeof ALLOWED_INTERVALS)[number])
  ) {
    return {
      ok: false,
      error: `Interval must be one of ${ALLOWED_INTERVALS.join(", ")}`,
    };
  }
  await db.query(
    `INSERT INTO scanner_config (scanner_key, enabled, interval_minutes, updated_at)
     VALUES ($1, TRUE, $2, NOW())
     ON CONFLICT (scanner_key) DO UPDATE SET interval_minutes = EXCLUDED.interval_minutes, updated_at = NOW()`,
    [scannerKey, minutes]
  );
  revalidatePath("/");
  return {
    ok: true,
    message: `${scannerKey} interval set to ${minutes} minutes.`,
  };
}

export async function runScannerNow(
  scannerKey: string
): Promise<ActionResult & { result?: ScanResult }> {
  await requireAuth();
  if (!isScheduledKey(scannerKey)) {
    return { ok: false, error: `Unknown scheduled scanner: ${scannerKey}` };
  }
  try {
    const result = await runScan(scannerKey, { force: true });
    revalidatePath("/");
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? "Scan failed",
        result,
      };
    }
    const pieces: string[] = [];
    if (result.skipped) pieces.push(`skipped: ${result.skipped}`);
    if (result.proposals_created !== undefined && result.proposals_created > 0)
      pieces.push(`${result.proposals_created} proposals`);
    if (result.insights_saved !== undefined && result.insights_saved > 0)
      pieces.push(`${result.insights_saved} insights`);
    return {
      ok: true,
      message: pieces.length > 0 ? pieces.join(" · ") : "Scan complete.",
      result,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

export async function runResearch(
  query?: string
): Promise<ActionResult & { result?: ScanResult }> {
  await requireAuth();
  try {
    const result = await runScan("finviz", {
      force: true,
      query: query?.trim() || undefined,
    });
    revalidatePath("/");
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? "Research failed",
        result,
      };
    }
    return {
      ok: true,
      message:
        result.insights_saved && result.insights_saved > 0
          ? `Research complete — ${result.insights_saved} report saved.`
          : "Research complete — no report was saved (check recent runs).",
      result,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
