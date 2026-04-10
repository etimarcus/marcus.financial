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
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-2">
        Risk guardrails
      </h2>
      <div
        className={`rounded-2xl border backdrop-blur p-5 grid grid-cols-2 md:grid-cols-4 gap-6 ${
          anyBlocked
            ? "border-red-500/30 bg-gradient-to-b from-red-950/20 to-zinc-950/70"
            : "border-white/[0.08] bg-gradient-to-b from-zinc-900/70 to-zinc-950/70"
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
          sub={`circuit at −${config.maxDayDrawdownPct}%`}
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
        <div className="mt-2 text-[11px] font-mono text-red-400 uppercase tracking-wider">
          ⚠ new trades blocked — limit resets at midnight ET or on equity recovery
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
      ? "text-profit"
      : tone === "neg"
        ? "text-loss"
        : "text-zinc-100";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-mono">
        {label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}
