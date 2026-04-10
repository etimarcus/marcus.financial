import { readGuardrailConfig } from "@/lib/guardrails";
import { db } from "@/lib/db";

async function getTodayStats() {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM trades
      WHERE submitted_at >= date_trunc('day', NOW() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'`
  );
  return { tradesToday: Number(rows[0]?.count ?? 0) };
}

export async function GuardrailsPanel({
  equity,
  lastEquity,
}: {
  equity: number;
  lastEquity: number;
}) {
  const config = readGuardrailConfig();
  const { tradesToday } = await getTodayStats();
  const dayReturnPct =
    lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0;

  const tradesExhausted = tradesToday >= config.maxTradesPerDay;
  const drawdownTripped = -dayReturnPct >= config.maxDayDrawdownPct;
  const anyBlocked = tradesExhausted || drawdownTripped;

  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300 mb-2">
        Risk guardrails
      </h2>
      <div
        className={`rounded-xl border p-4 grid grid-cols-2 md:grid-cols-4 gap-4 ${
          anyBlocked
            ? "border-red-500/40 bg-red-50 dark:bg-red-950/20"
            : "border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950"
        }`}
      >
        <Metric
          label="Max position"
          value={`${config.maxPositionPctEquity}%`}
          sub="of equity"
        />
        <Metric
          label="Trades today"
          value={`${tradesToday} / ${config.maxTradesPerDay}`}
          sub={tradesExhausted ? "CAP REACHED" : "of daily cap"}
          tone={tradesExhausted ? "neg" : undefined}
        />
        <Metric
          label="Day return"
          value={`${dayReturnPct >= 0 ? "+" : ""}${dayReturnPct.toFixed(2)}%`}
          sub={`circuit at -${config.maxDayDrawdownPct}%`}
          tone={
            drawdownTripped ? "neg" : dayReturnPct >= 0 ? "pos" : undefined
          }
        />
        <Metric
          label="Whitelist"
          value={
            config.whitelistMode === "watchlist" ? "Watchlist" : "Off"
          }
          sub={config.requireStopLoss ? "stop-loss req." : "stop-loss opt."}
        />
      </div>
      {anyBlocked && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          New trades are currently blocked by guardrails. Proposals can still
          be created, but approval will fail until the limit resets (midnight
          ET for daily cap) or equity recovers.
        </div>
      )}
    </section>
  );
}

function Metric({
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
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
