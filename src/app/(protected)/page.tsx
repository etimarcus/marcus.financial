import {
  getAccount,
  getClock,
  getPositions,
  type AlpacaPosition,
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
import { CronPanel, type CronPanelProps } from "./cron-panel";

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

async function getWatchlist(): Promise<WatchlistEntry[]> {
  const { rows } = await db.query(
    "SELECT id, symbol, notes, created_at FROM watchlist ORDER BY symbol"
  );
  return rows as WatchlistEntry[];
}

async function getCronPanelData(): Promise<CronPanelProps> {
  await db.query(
    `INSERT INTO cron_config (id, enabled, interval_minutes)
     VALUES (1, TRUE, 15)
     ON CONFLICT (id) DO NOTHING`
  );
  const { rows: cfgRows } = await db.query<{
    enabled: boolean;
    interval_minutes: number;
    last_run_at: string | null;
  }>(
    "SELECT enabled, interval_minutes, last_run_at FROM cron_config WHERE id = 1"
  );
  const cfg = cfgRows[0];

  const { rows: runs } = await db.query(
    `SELECT id, started_at, finished_at, cost_usd, summary, error
       FROM agent_runs
      WHERE trigger = 'cron'
      ORDER BY started_at DESC
      LIMIT 10`
  );

  return {
    enabled: cfg.enabled,
    intervalMinutes: cfg.interval_minutes,
    lastRunAt: cfg.last_run_at,
    recentRuns: runs.map((r) => ({
      id: r.id,
      started_at: r.started_at.toISOString
        ? r.started_at.toISOString()
        : r.started_at,
      finished_at: r.finished_at
        ? r.finished_at.toISOString
          ? r.finished_at.toISOString()
          : r.finished_at
        : null,
      cost_usd: r.cost_usd != null ? String(r.cost_usd) : null,
      summary: r.summary,
      error: r.error,
    })),
  };
}

export default async function Dashboard() {
  let account;
  let positions: AlpacaPosition[] = [];
  let clock;
  let proposals: PendingProposal[] = [];
  let watchlist: WatchlistEntry[] = [];
  let cronData: CronPanelProps | null = null;
  let error: string | null = null;

  try {
    [account, positions, clock, proposals, watchlist, cronData] =
      await Promise.all([
        getAccount(),
        getPositions(),
        getClock(),
        getPendingProposals(),
        getWatchlist(),
        getCronPanelData(),
      ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !account || !clock || !cronData) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
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
    <main className="px-6 pb-10 max-w-6xl mx-auto space-y-8">
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
                    plNum >= 0 ? "text-emerald-400" : "text-red-400";
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

      <CronPanel {...cronData} />

      <WatchlistPanel entries={watchlist} />
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
      ? "text-emerald-400"
      : tone === "neg"
        ? "text-red-400"
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
