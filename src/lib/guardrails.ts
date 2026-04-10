import "server-only";
import { getAccount, getLatestTrade } from "./alpaca";
import { db } from "./db";

export type GuardrailConfig = {
  maxPositionPctEquity: number;
  maxTradesPerDay: number;
  maxDayDrawdownPct: number;
  requireStopLoss: boolean;
  whitelistMode: "watchlist" | "off";
};

export function readGuardrailConfig(): GuardrailConfig {
  const num = (key: string, def: number) => {
    const v = process.env[key];
    if (!v) return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };
  const bool = (key: string, def: boolean) => {
    const v = process.env[key];
    if (!v) return def;
    return v.toLowerCase() === "true" || v === "1";
  };
  const mode = (process.env.GUARDRAIL_WHITELIST_MODE ?? "watchlist")
    .toLowerCase()
    .trim();
  return {
    maxPositionPctEquity: num("GUARDRAIL_MAX_POSITION_PCT_EQUITY", 2),
    maxTradesPerDay: num("GUARDRAIL_MAX_TRADES_PER_DAY", 5),
    maxDayDrawdownPct: num("GUARDRAIL_MAX_DAY_DRAWDOWN_PCT", 3),
    requireStopLoss: bool("GUARDRAIL_REQUIRE_STOP_LOSS", false),
    whitelistMode: mode === "off" ? "off" : "watchlist",
  };
}

export type ProposalLike = {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  order_type: "market" | "limit";
  limit_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
};

export type GuardrailResult = {
  ok: boolean;
  violations: string[];
  config: GuardrailConfig;
  context: {
    equity: number;
    lastEquity: number;
    dayReturnPct: number;
    tradesToday: number;
    estimatedNotional: number | null;
    estimatedPctEquity: number | null;
  };
};

async function getReferencePrice(p: ProposalLike): Promise<number | null> {
  if (p.order_type === "limit" && p.limit_price != null) {
    return Number(p.limit_price);
  }
  try {
    const latest = await getLatestTrade(p.symbol);
    return latest.trade.p;
  } catch {
    return null;
  }
}

async function getTradesTodayCount(): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM trades
      WHERE submitted_at >= date_trunc('day', NOW() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'`
  );
  return Number(rows[0]?.count ?? 0);
}

async function getWatchlistSet(): Promise<Set<string>> {
  const { rows } = await db.query<{ symbol: string }>(
    "SELECT symbol FROM watchlist"
  );
  return new Set(rows.map((r) => r.symbol.toUpperCase()));
}

export async function validateProposal(
  proposal: ProposalLike,
  opts: { bypassWhitelist?: boolean } = {}
): Promise<GuardrailResult> {
  const config = readGuardrailConfig();
  const violations: string[] = [];

  const [account, tradesToday, watchlist, refPrice] = await Promise.all([
    getAccount(),
    getTradesTodayCount(),
    config.whitelistMode === "watchlist" && !opts.bypassWhitelist
      ? getWatchlistSet()
      : Promise.resolve(new Set<string>()),
    getReferencePrice(proposal),
  ]);

  const equity = Number(account.equity);
  const lastEquity = Number(account.last_equity);
  const dayReturnPct =
    lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0;

  if (config.whitelistMode === "watchlist" && !opts.bypassWhitelist) {
    const sym = proposal.symbol.toUpperCase();
    if (!watchlist.has(sym)) {
      violations.push(
        `Symbol ${sym} is not on the watchlist. Whitelist mode is "watchlist" — add it via the dashboard first, or disable whitelist enforcement.`
      );
    }
  }

  if (config.requireStopLoss && proposal.stop_loss == null) {
    violations.push(
      `Stop-loss is required by GUARDRAIL_REQUIRE_STOP_LOSS=true. Use a limit order with a stop_loss.`
    );
  }

  if (tradesToday >= config.maxTradesPerDay) {
    violations.push(
      `Daily trade cap reached: ${tradesToday}/${config.maxTradesPerDay} executed today (America/New_York). Wait until tomorrow or raise GUARDRAIL_MAX_TRADES_PER_DAY.`
    );
  }

  if (-dayReturnPct >= config.maxDayDrawdownPct) {
    violations.push(
      `Daily drawdown circuit breaker tripped: day return is ${dayReturnPct.toFixed(2)}%, limit is -${config.maxDayDrawdownPct}%. No new trades until tomorrow.`
    );
  }

  let estimatedNotional: number | null = null;
  let estimatedPctEquity: number | null = null;
  if (refPrice != null && equity > 0) {
    estimatedNotional = refPrice * proposal.qty;
    estimatedPctEquity = (estimatedNotional / equity) * 100;
    if (estimatedPctEquity > config.maxPositionPctEquity) {
      violations.push(
        `Position size ${estimatedPctEquity.toFixed(2)}% of equity exceeds limit ${config.maxPositionPctEquity}%. Notional ≈ $${estimatedNotional.toFixed(0)} on equity $${equity.toFixed(0)}. Reduce qty or raise GUARDRAIL_MAX_POSITION_PCT_EQUITY.`
      );
    }
  } else if (refPrice == null) {
    violations.push(
      `Cannot size the position: no reference price available for ${proposal.symbol}. For market orders, make sure the symbol is tradeable; for limit orders, include limit_price.`
    );
  }

  return {
    ok: violations.length === 0,
    violations,
    config,
    context: {
      equity,
      lastEquity,
      dayReturnPct,
      tradesToday,
      estimatedNotional,
      estimatedPctEquity,
    },
  };
}
