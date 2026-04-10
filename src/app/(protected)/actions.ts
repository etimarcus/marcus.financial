"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { createOrder } from "@/lib/alpaca";

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
