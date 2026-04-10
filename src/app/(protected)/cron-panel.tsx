"use client";

import { useState, useTransition } from "react";
import {
  setCronEnabled,
  setCronInterval,
  runCronNow,
} from "./actions";

export type CronPanelProps = {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  recentRuns: Array<{
    id: number;
    started_at: string;
    finished_at: string | null;
    cost_usd: string | null;
    summary: string | null;
    error: string | null;
  }>;
};

const INTERVAL_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CronPanel({
  enabled,
  intervalMinutes,
  lastRunAt,
  recentRuns,
}: CronPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  function handleToggle() {
    startTransition(async () => {
      const result = await setCronEnabled(!enabled);
      setFeedback(
        result.ok
          ? { ok: true, message: result.message }
          : { ok: false, message: result.error }
      );
    });
  }

  function handleIntervalChange(value: number) {
    startTransition(async () => {
      const result = await setCronInterval(value);
      setFeedback(
        result.ok
          ? { ok: true, message: result.message }
          : { ok: false, message: result.error }
      );
    });
  }

  function handleRunNow() {
    setFeedback(null);
    startTransition(async () => {
      const result = await runCronNow();
      setFeedback(
        result.ok
          ? { ok: true, message: result.message ?? "Scan complete." }
          : { ok: false, message: result.error ?? "Scan failed." }
      );
    });
  }

  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-2">
        Scheduled scans
      </h2>
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/70 to-zinc-950/70 backdrop-blur p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleToggle}
              disabled={isPending}
              className={`relative h-7 w-12 rounded-full border transition-all ${
                enabled
                  ? "bg-cyan-500/90 border-cyan-400"
                  : "bg-zinc-800 border-white/10"
              } disabled:opacity-50`}
              aria-label={enabled ? "Disable" : "Enable"}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  enabled ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    enabled ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" : "bg-zinc-600"
                  }`}
                />
                <span className="text-sm font-medium text-zinc-100">
                  {enabled ? "Enabled" : "Paused"}
                </span>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Last run: {timeAgo(lastRunAt)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-500">Interval</label>
            <select
              value={intervalMinutes}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
              disabled={isPending || !enabled}
              className="rounded-lg bg-zinc-900 border border-white/10 text-zinc-100 text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 disabled:opacity-50"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleRunNow}
              disabled={isPending}
              className="rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-500/20 hover:border-cyan-400/50 px-3 py-1.5 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {isPending ? "…" : "Run now"}
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-3 text-xs ${
              feedback.ok
                ? "text-cyan-300"
                : "text-red-400"
            }`}
          >
            {feedback.message}
          </div>
        )}

        {recentRuns.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              <span>{showHistory ? "▾" : "▸"}</span>
              Recent runs ({recentRuns.length})
            </button>
            {showHistory && (
              <ul className="mt-3 space-y-3">
                {recentRuns.map((run) => (
                  <li
                    key={run.id}
                    className="text-xs border-l-2 border-white/10 pl-3"
                  >
                    <div className="flex items-center justify-between gap-2 text-zinc-500">
                      <span className="font-mono">
                        #{run.id} · {timeAgo(run.started_at)}
                      </span>
                      {run.cost_usd && (
                        <span className="text-zinc-600">
                          ${Number(run.cost_usd).toFixed(3)}
                        </span>
                      )}
                    </div>
                    {run.error ? (
                      <p className="mt-1 text-red-400">{run.error}</p>
                    ) : (
                      <p className="mt-1 text-zinc-400 whitespace-pre-wrap">
                        {run.summary
                          ? run.summary.slice(0, 400) +
                            (run.summary.length > 400 ? "…" : "")
                          : "(no summary)"}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
