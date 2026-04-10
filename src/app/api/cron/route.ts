import { NextRequest, NextResponse } from "next/server";
import { getClock } from "@/lib/alpaca";
import { db } from "@/lib/db";
import { runAgent, type AgentEvent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let clock;
  try {
    clock = await getClock();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, skipped: "clock_error", message },
      { status: 500 }
    );
  }

  if (!clock.is_open) {
    return NextResponse.json({
      ok: true,
      skipped: "market_closed",
      next_open: clock.next_open,
    });
  }

  const { rows: watchlistRows } = await db.query(
    "SELECT symbol FROM watchlist ORDER BY symbol"
  );
  if (watchlistRows.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: "empty_watchlist",
      message: "Add symbols to the watchlist to enable scans.",
    });
  }
  const symbols = watchlistRows.map((r) => r.symbol as string);

  const now = new Date().toISOString();
  const kickoff = `[Scheduled scan · ${now}]

You're running on the 15-minute cron schedule. The market is currently open.

Watchlist (${symbols.length} symbols): ${symbols.join(", ")}

Process:
1. Call get_positions and get_proposals in parallel. Build a skip-set of symbols that already have an open position OR a pending proposal on the same side. Do not propose anything on those symbols.
2. For each remaining watchlist symbol, pull calculate_indicators on 1Day timeframe (lookback 250) and recent get_news (limit 5).
3. If you find a strong setup (your honest confidence >= 0.7), call propose_trade. Use a LIMIT order with stop_loss and take_profit (bracket). Size each trade at no more than 2% of account equity.
4. Be selective. Finishing a run with ZERO proposals is the correct outcome most of the time. A bad trade is worse than no trade.
5. When finished, write a one-paragraph summary: what you scanned, what you skipped and why, and which (if any) trades you proposed with a sentence of reasoning each.

Start now.`;

  let proposalsCreated = 0;
  let lastError: string | null = null;
  const textChunks: string[] = [];

  try {
    await runAgent({
      trigger: "cron",
      messages: [{ role: "user", content: kickoff }],
      onEvent: (event: AgentEvent) => {
        if (event.type === "text") {
          textChunks.push(event.value);
        } else if (event.type === "tool_use" && event.name === "propose_trade") {
          proposalsCreated += 1;
        } else if (event.type === "error") {
          lastError = event.message;
        }
      },
    });
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  }

  const summary = textChunks.join("").trim().slice(0, 4000);

  if (lastError) {
    return NextResponse.json(
      {
        ok: false,
        error: lastError,
        proposals_created: proposalsCreated,
        summary,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    symbols_scanned: symbols.length,
    proposals_created: proposalsCreated,
    summary,
  });
}
