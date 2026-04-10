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

export default async function Dashboard() {
  let account;
  let positions: AlpacaPosition[] = [];
  let clock;
  let proposals: PendingProposal[] = [];
  let watchlist: WatchlistEntry[] = [];
  let error: string | null = null;

  try {
    [account, positions, clock, proposals, watchlist] = await Promise.all([
      getAccount(),
      getPositions(),
      getClock(),
      getPendingProposals(),
      getWatchlist(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !account || !clock) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <div className="rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300">
          <div className="font-semibold">Could not load Alpaca data.</div>
          <div className="mt-1 font-mono text-xs break-all">{error}</div>
          <div className="mt-2">
            Check that <code>ALPACA_API_KEY</code>,{" "}
            <code>ALPACA_API_SECRET</code>, and <code>ALPACA_BASE_URL</code> are
            set correctly.
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
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <section className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Dashboard
          </h1>
          <p className="text-sm text-zinc-500">
            Alpaca {account.status.toLowerCase()} ·{" "}
            {clock.is_open ? "Market open" : "Market closed"}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Equity" value={fmtUsd(account.equity)} />
        <Stat
          label="Day P&L"
          value={fmtUsd(dayPnl)}
          sub={fmtPct(dayPnlPct)}
          tone={dayPnl >= 0 ? "pos" : "neg"}
        />
        <Stat label="Cash" value={fmtUsd(account.cash)} />
        <Stat label="Buying power" value={fmtUsd(account.buying_power)} />
      </section>

      <ProposalsPanel proposals={proposals} />

      <WatchlistPanel entries={watchlist} />

      <section>
        <h2 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300 mb-2">
          Positions ({positions.length})
        </h2>
        {positions.length === 0 ? (
          <div className="rounded-xl border border-black/10 dark:border-white/10 p-6 text-sm text-zinc-500">
            No open positions.
          </div>
        ) : (
          <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                <tr>
                  <Th>Symbol</Th>
                  <Th>Qty</Th>
                  <Th>Avg entry</Th>
                  <Th>Current</Th>
                  <Th>Market value</Th>
                  <Th>Unrealized P&L</Th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const plNum = Number(p.unrealized_pl);
                  const plPct = Number(p.unrealized_plpc);
                  const tone =
                    plNum >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400";
                  return (
                    <tr
                      key={p.symbol}
                      className="border-t border-black/5 dark:border-white/5"
                    >
                      <Td className="font-medium">{p.symbol}</Td>
                      <Td>{p.qty}</Td>
                      <Td>{fmtUsd(p.avg_entry_price)}</Td>
                      <Td>{fmtUsd(p.current_price)}</Td>
                      <Td>{fmtUsd(p.market_value)}</Td>
                      <Td className={tone}>
                        {fmtUsd(plNum)} ({fmtPct(plPct)})
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  const toneClass =
    tone === "pos"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "neg"
        ? "text-red-600 dark:text-red-400"
        : "text-black dark:text-zinc-50";
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className={`text-xs ${toneClass}`}>{sub}</div>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left font-medium px-3 py-2 text-xs uppercase tracking-wide">
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
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
