import "server-only";
import { getClock } from "./alpaca";
import { db } from "./db";
import { runAgent, type AgentEvent } from "./agent";

export type ScanResult = {
  ok: boolean;
  skipped?:
    | "disabled"
    | "too_soon"
    | "market_closed"
    | "empty_watchlist"
    | "clock_error";
  symbols_scanned?: number;
  proposals_created?: number;
  summary?: string;
  error?: string;
  next_run_eligible_at?: string | null;
};

export type CronConfig = {
  enabled: boolean;
  interval_minutes: number;
  last_run_at: Date | null;
  updated_at: Date;
};

export async function loadCronConfig(): Promise<CronConfig> {
  await db.query(
    `INSERT INTO cron_config (id, enabled, interval_minutes)
     VALUES (1, TRUE, 15)
     ON CONFLICT (id) DO NOTHING`
  );
  const { rows } = await db.query<CronConfig>(
    `SELECT enabled, interval_minutes, last_run_at, updated_at
       FROM cron_config WHERE id = 1`
  );
  return rows[0];
}

export async function runScheduledScan(
  opts: { force?: boolean } = {}
): Promise<ScanResult> {
  const config = await loadCronConfig();

  if (!opts.force) {
    if (!config.enabled) {
      return { ok: true, skipped: "disabled" };
    }
    if (config.last_run_at) {
      const lastMs = new Date(config.last_run_at).getTime();
      const requiredMs = config.interval_minutes * 60 * 1000;
      const elapsedMs = Date.now() - lastMs;
      if (elapsedMs < requiredMs) {
        return {
          ok: true,
          skipped: "too_soon",
          next_run_eligible_at: new Date(lastMs + requiredMs).toISOString(),
        };
      }
    }
  }

  let clock;
  try {
    clock = await getClock();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, skipped: "clock_error", error: message };
  }

  if (!clock.is_open) {
    return { ok: true, skipped: "market_closed" };
  }

  const { rows: watchlistRows } = await db.query<{ symbol: string }>(
    "SELECT symbol FROM watchlist ORDER BY symbol"
  );
  if (watchlistRows.length === 0) {
    return { ok: true, skipped: "empty_watchlist" };
  }
  const symbols = watchlistRows.map((r) => r.symbol);

  const now = new Date().toISOString();
  const kickoff = `[Scheduled scan · ${now}]

You're running on the scheduled scan. The market is currently open.

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
        } else if (
          event.type === "tool_use" &&
          event.name === "propose_trade"
        ) {
          proposalsCreated += 1;
        } else if (event.type === "error") {
          lastError = event.message;
        }
      },
    });
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  }

  await db.query(
    "UPDATE cron_config SET last_run_at = NOW(), updated_at = NOW() WHERE id = 1"
  );

  const summary = textChunks.join("").trim().slice(0, 4000);

  if (lastError) {
    return {
      ok: false,
      symbols_scanned: symbols.length,
      proposals_created: proposalsCreated,
      summary,
      error: lastError,
    };
  }

  return {
    ok: true,
    symbols_scanned: symbols.length,
    proposals_created: proposalsCreated,
    summary,
  };
}
