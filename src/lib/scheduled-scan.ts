import "server-only";
import { getClock } from "./alpaca";
import { db } from "./db";
import { runAgent, type AgentEvent } from "./agent";

export type ScannerKey = "alpaca" | "tradingview" | "polymarket" | "finviz";

export type ScanResult = {
  ok: boolean;
  scanner: ScannerKey;
  skipped?:
    | "disabled"
    | "too_soon"
    | "market_closed"
    | "empty_watchlist"
    | "clock_error";
  proposals_created?: number;
  insights_saved?: number;
  summary?: string;
  error?: string;
  next_run_eligible_at?: string | null;
};

export type ScannerConfigRow = {
  scanner_key: ScannerKey;
  enabled: boolean;
  interval_minutes: number;
  last_run_at: Date | null;
  updated_at: Date;
};

type ScannerDef = {
  key: ScannerKey;
  scheduled: boolean;
  requiresMarketOpen: boolean;
  bypassWhitelist: boolean;
  buildKickoff: (ctx: {
    now: string;
    symbols?: string[];
    query?: string;
  }) => string;
};

const SCANNERS: Record<ScannerKey, ScannerDef> = {
  alpaca: {
    key: "alpaca",
    scheduled: true,
    requiresMarketOpen: true,
    bypassWhitelist: false,
    buildKickoff: ({ now, symbols = [] }) => `[Alpaca watchlist scan · ${now}]

You're running the watchlist scan. The market is currently open.

Watchlist (${symbols.length} symbols): ${symbols.join(", ")}

Process:
1. Call get_positions and get_proposals in parallel. Build a skip-set of symbols that already have an open position OR a pending proposal on the same side. Do not propose anything on those symbols.
2. For each remaining watchlist symbol, pull calculate_indicators on 1Day timeframe (lookback 250) and recent get_news (limit 5).
3. If you find a strong setup (your honest confidence >= 0.7), call propose_trade. Use a LIMIT order with stop_loss and take_profit (bracket). Size each trade at no more than 2% of account equity.
4. Be selective. Finishing a run with ZERO proposals is the correct outcome most of the time. A bad trade is worse than no trade.
5. When finished, write a one-paragraph summary: what you scanned, what you skipped and why, and which (if any) trades you proposed with a sentence of reasoning each.

Start now.`,
  },

  tradingview: {
    key: "tradingview",
    scheduled: true,
    requiresMarketOpen: true,
    bypassWhitelist: true,
    buildKickoff: ({ now }) => `[TradingView scan · ${now}]

You're scanning TradingView for equity setups OUTSIDE the watchlist. Use web_search to find candidates, then validate them with your Alpaca tools before proposing.

Process:
1. Call get_positions and get_proposals in parallel. Build a skip-set of symbols already in play.
2. Use web_search with queries like "tradingview top oversold US equities today RSI below 30", "tradingview bullish breakout patterns this week", or "tradingview best technical setups high volume" to discover candidates.
3. For 3-5 of the most interesting candidates NOT in the skip-set, verify with calculate_indicators (1Day, 250 lookback) + get_news (5 articles). Trust Alpaca's data over TradingView's.
4. For any candidate with an honest confidence >= 0.7, call propose_trade with type='limit' and bracket stops (stop_loss + take_profit). Size each trade at no more than 2% of equity.
5. IMPORTANT: the whitelist guardrail is RELAXED for this scanner — you are permitted to propose trades on symbols outside the watchlist. Other guardrails (position size, daily cap, drawdown) still apply and will block bad proposals automatically.
6. Be ruthless on quality. A bad proposal is worse than no proposal.
7. Finish with a one-paragraph summary: what you searched, what you found, what you skipped, what you proposed.

Start now.`,
  },

  polymarket: {
    key: "polymarket",
    scheduled: true,
    requiresMarketOpen: false,
    bypassWhitelist: false,
    buildKickoff: ({ now }) => `[Polymarket scan · ${now}]

You're scanning Polymarket prediction markets for potentially mispriced opportunities. This is a RESEARCH scan — do NOT call propose_trade. Save interesting findings via save_insight.

Process:
1. Use web_fetch to GET https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=30 to pull top active markets with their current prices and volume.
2. Identify the 3-5 most interesting markets based on:
   - High 24h volume (liquidity matters)
   - Near-term resolution (< 60 days if visible)
   - Topic where current news can meaningfully move priors
3. For each candidate, use web_search to find the latest news or developments related to the underlying event.
4. Reason explicitly about whether the current yes/no price reflects the news. If you see a mispricing, state your confidence and your estimate of fair value.
5. Save each distinct finding as a separate save_insight call:
   - source: 'polymarket'
   - kind: 'market_insight'
   - title: terse headline (e.g. "Overpriced: '<market question>' at Xc vs fair ~Yc")
   - body: your full analysis with citations and numbers
   - symbols: [polymarket slug or market id]
6. Finish with a one-sentence text summary of how many insights you saved.

You CANNOT execute trades on Polymarket from this application. The user reads saved insights in the dashboard and acts manually on polymarket.com if they choose. Do NOT call propose_trade for prediction markets.

Start now.`,
  },

  finviz: {
    key: "finviz",
    scheduled: false,
    requiresMarketOpen: false,
    bypassWhitelist: false,
    buildKickoff: ({
      now,
      query,
    }) => `[Finviz research · ${now}]

Research query: ${query || "Top US equities with unusual volume and RSI < 30 on the daily timeframe"}

You're running an on-demand research task using Finviz-style screening via web_search. Do NOT propose trades. Save the findings as a single research_report via save_insight.

Process:
1. Use web_search to find Finviz screener results matching the query. Examples: "finviz screener <query>", or more targeted searches on finviz.com for the specific criteria.
2. Identify the top 5-10 tickers surfaced.
3. For the top 3-5 most interesting, pull calculate_indicators (1Day, 250 lookback) and get_news (3 articles) to add context.
4. Write a SINGLE save_insight call with:
   - source: 'finviz'
   - kind: 'research_report'
   - title: terse report title reflecting the query
   - body: a markdown report with these sections:
     * Summary of the screening criteria
     * Results table or list
     * Per-ticker: 2-4 sentence analysis with the key numbers (price, RSI, recent news)
     * Conclusion / recommended next steps (e.g. "these 2 worth adding to the watchlist", "none compelling")
   - symbols: [array of tickers analyzed]
5. Do NOT call propose_trade. This is research, not execution.
6. Finish with a one-sentence text summary of what you produced.

Start now.`,
  },
};

export async function loadScannerConfig(
  key: ScannerKey
): Promise<ScannerConfigRow | null> {
  const { rows } = await db.query<ScannerConfigRow>(
    `SELECT scanner_key, enabled, interval_minutes, last_run_at, updated_at
       FROM scanner_config WHERE scanner_key = $1`,
    [key]
  );
  return rows[0] ?? null;
}

export async function loadAllScannerConfigs(): Promise<ScannerConfigRow[]> {
  const { rows } = await db.query<ScannerConfigRow>(
    `SELECT scanner_key, enabled, interval_minutes, last_run_at, updated_at
       FROM scanner_config
      ORDER BY scanner_key`
  );
  return rows;
}

export async function runScan(
  key: ScannerKey,
  opts: { force?: boolean; query?: string } = {}
): Promise<ScanResult> {
  const def = SCANNERS[key];
  if (!def) {
    return { ok: false, scanner: key, error: `Unknown scanner: ${key}` };
  }

  if (def.scheduled) {
    const config = await loadScannerConfig(key);
    if (!config) {
      return {
        ok: false,
        scanner: key,
        error: `scanner_config row missing for ${key} — run db:migrate`,
      };
    }
    if (!opts.force) {
      if (!config.enabled) {
        return { ok: true, scanner: key, skipped: "disabled" };
      }
      if (config.last_run_at) {
        const lastMs = new Date(config.last_run_at).getTime();
        const requiredMs = config.interval_minutes * 60 * 1000;
        const elapsedMs = Date.now() - lastMs;
        if (elapsedMs < requiredMs) {
          return {
            ok: true,
            scanner: key,
            skipped: "too_soon",
            next_run_eligible_at: new Date(lastMs + requiredMs).toISOString(),
          };
        }
      }
    }
  }

  if (def.requiresMarketOpen) {
    try {
      const clock = await getClock();
      if (!clock.is_open) {
        return { ok: true, scanner: key, skipped: "market_closed" };
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        scanner: key,
        skipped: "clock_error",
        error: message,
      };
    }
  }

  let symbols: string[] | undefined;
  if (key === "alpaca") {
    const { rows } = await db.query<{ symbol: string }>(
      "SELECT symbol FROM watchlist ORDER BY symbol"
    );
    if (rows.length === 0) {
      return { ok: true, scanner: key, skipped: "empty_watchlist" };
    }
    symbols = rows.map((r) => r.symbol);
  }

  const now = new Date().toISOString();
  const kickoff = def.buildKickoff({ now, symbols, query: opts.query });

  let proposalsCreated = 0;
  let insightsSaved = 0;
  let lastError: string | null = null;
  const textChunks: string[] = [];

  try {
    await runAgent({
      trigger: `${key}-scan`,
      bypassWhitelist: def.bypassWhitelist,
      messages: [{ role: "user", content: kickoff }],
      onEvent: (event: AgentEvent) => {
        if (event.type === "text") {
          textChunks.push(event.value);
        } else if (event.type === "tool_use") {
          if (event.name === "propose_trade") proposalsCreated += 1;
          if (event.name === "save_insight") insightsSaved += 1;
        } else if (event.type === "error") {
          lastError = event.message;
        }
      },
    });
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  }

  if (def.scheduled) {
    await db.query(
      `UPDATE scanner_config
         SET last_run_at = NOW(), updated_at = NOW()
       WHERE scanner_key = $1`,
      [key]
    );
  }

  const summary = textChunks.join("").trim().slice(0, 4000);

  if (lastError) {
    return {
      ok: false,
      scanner: key,
      proposals_created: proposalsCreated,
      insights_saved: insightsSaved,
      summary,
      error: lastError,
    };
  }

  return {
    ok: true,
    scanner: key,
    proposals_created: proposalsCreated,
    insights_saved: insightsSaved,
    summary,
  };
}

export async function runAllScheduledScanners(): Promise<ScanResult[]> {
  const configs = await loadAllScannerConfigs();
  const results: ScanResult[] = [];
  for (const cfg of configs) {
    const def = SCANNERS[cfg.scanner_key];
    if (!def || !def.scheduled) continue;
    const result = await runScan(cfg.scanner_key);
    results.push(result);
  }
  return results;
}

// Legacy shim — the old /api/cron route handler used to call this name.
// Equivalent to runAllScheduledScanners, preserved so existing bookmarks/tools
// continue to work. Prefer runAllScheduledScanners in new code.
export async function runScheduledScan(
  opts: { force?: boolean } = {}
): Promise<ScanResult> {
  if (opts.force) {
    return runScan("alpaca", { force: true });
  }
  const results = await runAllScheduledScanners();
  return results[0] ?? { ok: true, scanner: "alpaca", skipped: "disabled" };
}
