import {
  getAccount,
  getAsset,
  getClock,
  getNews,
  getPositions,
  getSnapshots,
  type AlpacaNewsArticle,
  type AlpacaPosition,
  type AlpacaSnapshot,
} from "@/lib/alpaca";
import { db } from "@/lib/db";
import {
  ProposalsPanel,
  type PendingProposal,
} from "./proposals-panel";
import {
  WatchlistPanel,
  type WatchlistEntry,
} from "./watchlist-panel";
import { GuardrailsPanel } from "./guardrails-panel";
import {
  ScannersPanel,
  type ScannersPanelProps,
  type ScannerRow,
} from "./scanners-panel";
import { InsightsPanel, type InsightRow } from "./insights-panel";
import { MissionDeck } from "./mission-deck";
import { loadAllScannerConfigs } from "@/lib/scheduled-scan";

function fmtUsd(value: string | number) {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtPct(value: string | number) {
  const n = typeof value === "string" ? Number(value) : value;
  return `${(n * 100).toFixed(2)}%`;
}

async function getPendingProposals(): Promise<PendingProposal[]> {
  const { rows } = await db.query(
    `SELECT id, symbol, side, qty, order_type, limit_price, stop_loss,
            take_profit, reasoning, confidence, created_at
       FROM proposals
      WHERE status = 'pending'
      ORDER BY created_at DESC`
  );
  return rows as PendingProposal[];
}

async function backfillWatchlistNames(entries: WatchlistEntry[]): Promise<void> {
  const missing = entries.filter((e) => !e.name);
  if (missing.length === 0) return;
  await Promise.all(
    missing.map(async (e) => {
      try {
        const asset = await getAsset(e.symbol);
        if (asset.name) {
          e.name = asset.name;
          await db.query(
            "UPDATE watchlist SET name = $1 WHERE id = $2 AND name IS NULL",
            [asset.name, e.id]
          );
        }
      } catch {
        // Symbol not recognized — leave name null.
      }
    })
  );
}

async function getWatchlistWithMarketData(): Promise<{
  entries: WatchlistEntry[];
  snapshots: Record<string, AlpacaSnapshot>;
  newsBySymbol: Record<string, AlpacaNewsArticle[]>;
}> {
  const { rows } = await db.query(
    "SELECT id, symbol, name, notes, created_at FROM watchlist ORDER BY symbol"
  );
  const entries = rows as WatchlistEntry[];
  if (entries.length === 0) {
    return { entries, snapshots: {}, newsBySymbol: {} };
  }
  const symbols = entries.map((e) => e.symbol);
  const [snapshotsResult, newsResult] = await Promise.allSettled([
    getSnapshots(symbols),
    getNews(symbols, Math.min(50, symbols.length * 5)),
    backfillWatchlistNames(entries),
  ]);
  const snapshots =
    snapshotsResult.status === "fulfilled" ? snapshotsResult.value : {};
  const newsBySymbol: Record<string, AlpacaNewsArticle[]> = {};
  if (newsResult.status === "fulfilled") {
    for (const article of newsResult.value.news) {
      for (const sym of article.symbols ?? []) {
        const key = sym.toUpperCase();
        if (!newsBySymbol[key]) newsBySymbol[key] = [];
        if (newsBySymbol[key].length < 5) {
          newsBySymbol[key].push(article);
        }
      }
    }
  }
  return { entries, snapshots, newsBySymbol };
}

const SCANNER_META: Record<
  "alpaca" | "tradingview" | "polymarket" | "gaming" | "pharma",
  { label: string; description: string }
> = {
  alpaca: {
    label: "Alpaca watchlist",
    description: "Scans your watchlist and proposes equity trades",
  },
  tradingview: {
    label: "TradingView",
    description:
      "Discovers setups outside the watchlist (whitelist relaxed)",
  },
  polymarket: {
    label: "Polymarket",
    description: "Research-only. Saves insights, no trades",
  },
  gaming: {
    label: "Gaming industry",
    description: "Tracks game releases and publisher catalysts",
  },
  pharma: {
    label: "Pharma & biotech",
    description: "FDA approvals, trial readouts, PDUFA, M&A",
  },
};

function isoish(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return String(value);
}

async function getScannersPanelData(): Promise<ScannersPanelProps> {
  const configs = await loadAllScannerConfigs();
  const scanners: ScannerRow[] = configs
    .filter((c): c is typeof c & {
      scanner_key:
        | "alpaca"
        | "tradingview"
        | "polymarket"
        | "gaming"
        | "pharma";
    } => c.scanner_key in SCANNER_META)
    .map((c) => ({
      key: c.scanner_key,
      label: SCANNER_META[c.scanner_key].label,
      description: SCANNER_META[c.scanner_key].description,
      enabled: c.enabled,
      intervalMinutes: c.interval_minutes,
      lastRunAt: c.last_run_at ? isoish(c.last_run_at) : null,
    }));

  const { rows: runs } = await db.query(
    `SELECT id, trigger, started_at, finished_at, cost_usd, summary, error
       FROM agent_runs
      WHERE trigger LIKE '%-scan' OR trigger = 'cron'
      ORDER BY started_at DESC
      LIMIT 10`
  );

  return {
    scanners,
    recentRuns: runs.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      started_at: isoish(r.started_at),
      finished_at: r.finished_at ? isoish(r.finished_at) : null,
      cost_usd: r.cost_usd != null ? String(r.cost_usd) : null,
      summary: r.summary,
      error: r.error,
    })),
  };
}

async function getInsights(): Promise<InsightRow[]> {
  const { rows } = await db.query(
    `SELECT id, source, kind, title, body, symbols, created_at
       FROM insights
      ORDER BY created_at DESC
      LIMIT 20`
  );
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    kind: r.kind,
    title: r.title,
    body: r.body,
    symbols: r.symbols,
    created_at: isoish(r.created_at),
  })) as InsightRow[];
}

export default async function Dashboard() {
  let account;
  let positions: AlpacaPosition[] = [];
  let clock;
  let proposals: PendingProposal[] = [];
  let watchlistResult: {
    entries: WatchlistEntry[];
    snapshots: Record<string, AlpacaSnapshot>;
    newsBySymbol: Record<string, AlpacaNewsArticle[]>;
  } = { entries: [], snapshots: {}, newsBySymbol: {} };
  let scannersData: ScannersPanelProps | null = null;
  let insights: InsightRow[] = [];
  let error: string | null = null;

  try {
    [
      account,
      positions,
      clock,
      proposals,
      watchlistResult,
      scannersData,
      insights,
    ] = await Promise.all([
      getAccount(),
      getPositions(),
      getClock(),
      getPendingProposals(),
      getWatchlistWithMarketData(),
      getScannersPanelData(),
      getInsights(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const watchlist = watchlistResult.entries;
  const watchlistSnapshots = watchlistResult.snapshots;
  const watchlistNews = watchlistResult.newsBySymbol;

  if (error || !account || !clock || !scannersData) {
    return (
      <main className="p-6">
        <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5 text-sm text-red-300">
          <div className="font-semibold">Could not load dashboard data.</div>
          <div className="mt-1 font-mono text-xs break-all text-red-400/80">
            {error}
          </div>
          <div className="mt-2 text-red-300/80">
            Check that env vars are set correctly and the database schema is
            migrated (<code className="font-mono">npm run db:migrate</code>).
          </div>
        </div>
      </main>
    );
  }

  const equity = Number(account.equity);
  const lastEquity = Number(account.last_equity);
  const dayPnl = equity - lastEquity;
  const dayPnlPct = lastEquity > 0 ? dayPnl / lastEquity : 0;

  return (
    <main className="px-6 pb-10 space-y-6">
      <MissionDeck />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Equity" value={fmtUsd(account.equity)} big />
        <Stat
          label="Day P&L"
          value={fmtUsd(dayPnl)}
          sub={fmtPct(dayPnlPct)}
          tone={dayPnl >= 0 ? "pos" : "neg"}
          big
        />
        <Stat label="Cash" value={fmtUsd(account.cash)} />
        <Stat label="Buying power" value={fmtUsd(account.buying_power)} />
      </section>

      <GuardrailsPanel equity={equity} lastEquity={lastEquity} />

      <ProposalsPanel proposals={proposals} />

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-2">
          Positions ({positions.length})
        </h2>
        {positions.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/70 to-zinc-950/70 backdrop-blur p-8 text-sm text-zinc-500 text-center">
            No open positions.
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/70 to-zinc-950/70 backdrop-blur overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-zinc-500 border-b border-white/[0.06]">
                <tr>
                  <Th>Symbol</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Avg entry</Th>
                  <Th className="text-right">Current</Th>
                  <Th className="text-right">Market value</Th>
                  <Th className="text-right">Unrealized P&L</Th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const plNum = Number(p.unrealized_pl);
                  const plPct = Number(p.unrealized_plpc);
                  const tone =
                    plNum >= 0 ? "text-profit" : "text-loss";
                  return (
                    <tr
                      key={p.symbol}
                      className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                    >
                      <Td className="font-mono font-semibold text-zinc-100">
                        {p.symbol}
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-300">
                        {p.qty}
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-300">
                        {fmtUsd(p.avg_entry_price)}
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-300">
                        {fmtUsd(p.current_price)}
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-300">
                        {fmtUsd(p.market_value)}
                      </Td>
                      <Td
                        className={`text-right tabular-nums font-semibold ${tone}`}
                      >
                        {fmtUsd(plNum)}{" "}
                        <span className="text-xs opacity-70">
                          ({fmtPct(plPct)})
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ScannersPanel {...scannersData} />

      <InsightsPanel insights={insights} />

      <WatchlistPanel
        entries={watchlist}
        snapshots={watchlistSnapshots}
        newsBySymbol={watchlistNews}
      />
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  big,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
  big?: boolean;
}) {
  const toneClass =
    tone === "pos"
      ? "text-profit"
      : tone === "neg"
        ? "text-loss"
        : "text-zinc-100";
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/70 to-zinc-950/70 backdrop-blur p-5">
      <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-600">
        {label}
      </div>
      <div
        className={`mt-1.5 font-semibold tabular-nums ${toneClass} ${
          big ? "text-2xl" : "text-xl"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className={`text-xs font-mono tabular-nums ${toneClass} opacity-70 mt-0.5`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`font-mono font-medium px-4 py-3 text-[10px] uppercase tracking-[0.15em] ${className || "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
