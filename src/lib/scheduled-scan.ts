import "server-only";
import { getClock } from "./alpaca";
import { db } from "./db";
import { runAgent, type AgentEvent } from "./agent";

export type ScannerKey =
  | "alpaca"
  | "tradingview"
  | "polymarket"
  | "finviz"
  | "glassnode";

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
    requiresMarketOpen: false,
    bypassWhitelist: true,
    buildKickoff: ({ now }) => `[TradingView scan · ${now}]

You're scanning TradingView for equity setups, ideas, and expert analysis. This scanner runs 24/7 regardless of US market hours because TradingView publishes research around the clock. Use web_search to find candidates, then validate them with your Alpaca tools.

Process:
1. Call get_clock first so you know whether the US market is currently open. This decides how you structure any proposals:
   - Market open → you may propose market or limit orders, execution happens immediately on approval.
   - Market closed (pre-market, post-market, weekend) → only propose LIMIT orders. Market orders queued outside RTH get unexpected fills. This is not a reason to skip the scan — proposals saved during closed hours still show up in the dashboard for the user to approve when they wake up.
2. Call get_positions and get_proposals in parallel. Build a skip-set of symbols already in play.
3. Use web_search with queries like "tradingview top trade ideas today", "tradingview oversold US equities RSI below 30", "tradingview bullish breakout patterns this week", or "tradingview expert analysis <ticker>" to discover candidates and read published analysis.
4. For 3-5 of the most interesting candidates NOT in the skip-set, verify with calculate_indicators (1Day, 250 lookback) + get_news (5 articles). Trust Alpaca's data over TradingView's for current price/indicators; trust TradingView for setup narratives and expert commentary.
5. For any candidate with an honest confidence >= 0.7, call propose_trade with type='limit' and bracket stops (stop_loss + take_profit). Size each trade at no more than 2% of equity.
6. IMPORTANT: the whitelist guardrail is RELAXED for this scanner — you are permitted to propose trades on symbols outside the watchlist. Other guardrails (position size, daily cap, drawdown) still apply and will block bad proposals automatically.
7. If the setup is interesting but not actionable as a trade (e.g. longer-term thesis, sector rotation, macro call), use save_insight with source='tradingview', kind='market_insight' instead of propose_trade. Don't waste an interesting read just because it doesn't fit a same-day trade.
8. Be ruthless on quality. A bad proposal is worse than no proposal.
9. MANDATORY: finish with a one-paragraph text summary in your final assistant turn. What you searched, what you found, what you skipped, and what (if anything) you proposed or saved. Never end the turn silently — a silent turn shows as "(no summary)" in the dashboard.

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

You're running an on-demand research task. Primary tool is finviz_screen (scrapes the public HTML screener). Do NOT propose trades. Save the findings as a single research_report via save_insight.

Process:
1. Translate the user's query into Finviz filter codes and call finviz_screen with them. Common filters:
   - Market cap: cap_micro (< 300M), cap_small (300M-2B), cap_smallover (> 300M), cap_midover (> 2B), cap_largeover (> 10B), cap_megaover (> 200B)
   - Volume: sh_avgvol_o500 (> 500K), sh_avgvol_o1000 (> 1M), sh_curvol_o1000 (current > 1M), sh_relvol_o2 (relvol > 2x)
   - Technicals: ta_rsi_os30 (RSI < 30), ta_rsi_ob70 (RSI > 70), ta_highlow52w_nh (new 52w high), ta_highlow52w_nl (new 52w low), ta_sma200_pa (price > SMA200), ta_sma50_pa50 (price > SMA50)
   - Performance: ta_perf_1wup (up 1w), ta_perf_4wdown (down 4w), ta_perf_ytd20p (YTD > 20%)
   - Fundamentals: fa_pe_u15 (P/E < 15), fa_div_o1 (dividend > 1%), fa_eps5years_o10 (EPS 5y > 10%)
   - Geography/sector: geo_usa, sec_technology, sec_healthcare, sec_energy, etc.
   If you don't know the exact code, start with something reasonable and call finviz_screen.

2. If finviz_screen returns an error mentioning redirect / paywall / 0 rows / the IP being blocked, FALL BACK to web_fetch. Hit the exact URL https://finviz.com/screener.ashx?v=111&ft=4&f=<your_comma_separated_filters> via web_fetch — that call runs from Anthropic's infrastructure and typically succeeds where the server-side fetch from Vercel gets bounced to /elite. Extract tickers from the returned HTML manually by looking for data-boxover-ticker="SYM" attributes or <a class="tab-link">SYM</a> tags. Do NOT give up if finviz_screen fails — web_fetch is the mandatory fallback.

3. From the returned rows (via finviz_screen OR the web_fetch fallback), pick the top 3-5 most interesting tickers.
4. For each, call calculate_indicators (1Day, 250 lookback) and get_news (3 articles) to add your own verification.
5. Write a SINGLE save_insight call with:
   - source: 'finviz'
   - kind: 'research_report'
   - title: terse report title reflecting the query
   - body: a markdown report with these sections:
     * Summary of the screening criteria (state the exact filter string you used and the number of matches)
     * Results table or bullet list with the top tickers, their price, change, volume, sector
     * Per-ticker analysis: 2-4 sentences with RSI/MACD values, recent news, and your read
     * Conclusion / recommended next steps
   - symbols: [array of tickers analyzed]
6. Do NOT call propose_trade. This is research.
7. MANDATORY: finish with a one-sentence text summary in your final assistant turn so the run log has context. Even if everything went wrong and you saved nothing, write a sentence explaining what failed and why. Do not end the turn silently — a silent turn shows as "(no summary)" in the dashboard which gives the operator zero information.

Start now.`,
  },

  glassnode: {
    key: "glassnode",
    scheduled: false,
    requiresMarketOpen: false,
    bypassWhitelist: true,
    buildKickoff: ({ now }) => `[Glassnode snapshot · ${now}]

You're producing a point-in-time on-chain snapshot of the crypto market using Glassnode as the primary lens. This is RESEARCH — do NOT call propose_trade. Save findings via save_insight.

Process:
1. Use web_fetch and web_search against glassnode.com, studio.glassnode.com, insights.glassnode.com, and Glassnode's public "The Week On-Chain" posts to pull the current state of the most load-bearing metrics. Prefer web_fetch on specific Glassnode pages; fall back to web_search for "glassnode <metric> today" or "glassnode BTC MVRV current" style queries when pages gate data.
2. Anchor your snapshot on Bitcoin (BTC) at minimum. Cover Ethereum (ETH) as well if data is available. Try to pull current readings for:
   - MVRV Z-score
   - NUPL (Net Unrealized Profit/Loss) and the accompanying "market phase" label
   - SOPR (Spent Output Profit Ratio), both the short-term-holder and long-term-holder variants when possible
   - Realized price vs market price, and the multiple
   - Exchange net flows (inflows vs outflows over the past 7-30 days)
   - Stablecoin supply ratio (SSR) or aggregate stablecoin market cap trend
   - Hash rate / difficulty trend (for BTC)
   - LTH supply / STH supply split and whether LTH is distributing or accumulating
   Don't force metrics you can't find — note what you couldn't retrieve and move on.
3. For each metric you do retrieve, record the exact numeric value, the direction of change over the last week or month when available, and the historical regime it implies (e.g. "MVRV Z-score = 2.4, historically this sits in the 'moderate greed' band").
4. Form an overall read: is on-chain data currently painting an accumulation picture, a distribution picture, an overheated picture, or a capitulation picture? Be honest about confidence — if the data is mixed, say so.
5. Save ONE save_insight call with:
   - source: 'glassnode'
   - kind: 'market_insight'
   - title: terse snapshot title (e.g. "Glassnode snapshot — BTC MVRV cooling, LTHs accumulating")
   - body: a markdown report with these sections:
     * Headline: 1-2 sentence summary of the overall read
     * BTC metrics table/list with values + regime labels
     * ETH metrics (if pulled)
     * Flows & stablecoins: what money is doing on-chain this week
     * Holder behavior: LTH vs STH, accumulation vs distribution
     * What this implies and what would change your mind
     * Sources: list every URL you actually pulled
   - symbols: ['BTC', 'ETH'] (only what you actually covered)
6. Do NOT call propose_trade. This scanner is for situational awareness, not execution.
7. MANDATORY: finish with a one-sentence text summary in your final assistant turn describing the overall on-chain read. Never end the turn silently.

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

  const textSummary = textChunks.join("").trim();
  const actionBits: string[] = [];
  if (proposalsCreated > 0) actionBits.push(`${proposalsCreated} proposals`);
  if (insightsSaved > 0) actionBits.push(`${insightsSaved} insights`);
  const actionSummary = actionBits.join(" · ");
  const summary = (
    textSummary ||
    (actionSummary
      ? `(no text response) · produced ${actionSummary}`
      : "(agent produced no text, no proposals, no insights)")
  ).slice(0, 4000);

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
