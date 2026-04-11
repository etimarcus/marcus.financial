"use client";

import { useState, useTransition } from "react";
import {
  setScannerEnabled,
  setScannerInterval,
  runScannerNow,
  runResearch,
  runGlassnodeSnapshot,
} from "./actions";

export type ScannerRow = {
  key: "alpaca" | "tradingview" | "polymarket" | "gaming" | "pharma";
  label: string;
  description: string;
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
};

export type ScannersPanelProps = {
  scanners: ScannerRow[];
  recentRuns: Array<{
    id: number;
    trigger: string;
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
  { value: 240, label: "4 hours" },
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

export function ScannersPanel({ scanners, recentRuns }: ScannersPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [researchQuery, setResearchQuery] = useState("");

  function handleToggle(key: ScannerRow["key"], current: boolean) {
    startTransition(async () => {
      const result = await setScannerEnabled(key, !current);
      setFeedback(
        result.ok
          ? { ok: true, message: result.message }
          : { ok: false, message: result.error }
      );
    });
  }

  function handleInterval(key: ScannerRow["key"], minutes: number) {
    startTransition(async () => {
      const result = await setScannerInterval(key, minutes);
      setFeedback(
        result.ok
          ? { ok: true, message: result.message }
          : { ok: false, message: result.error }
      );
    });
  }

  function handleRun(key: ScannerRow["key"]) {
    setFeedback(null);
    startTransition(async () => {
      const result = await runScannerNow(key);
      setFeedback(
        result.ok
          ? { ok: true, message: `${key}: ${result.message}` }
          : { ok: false, message: `${key}: ${result.error}` }
      );
    });
  }

  function handleResearch() {
    setFeedback(null);
    startTransition(async () => {
      const result = await runResearch(researchQuery);
      setFeedback(
        result.ok
          ? { ok: true, message: result.message ?? "Done." }
          : { ok: false, message: result.error ?? "Failed." }
      );
      if (result.ok) setResearchQuery("");
    });
  }

  function handleGlassnode() {
    setFeedback(null);
    startTransition(async () => {
      const result = await runGlassnodeSnapshot();
      setFeedback(
        result.ok
          ? { ok: true, message: result.message ?? "Done." }
          : { ok: false, message: result.error ?? "Failed." }
      );
    });
  }

  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-2">
        Scanners
      </h2>
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/70 to-zinc-950/70 backdrop-blur p-4 space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-3">
          {scanners.map((s) => (
            <ScannerRowView
              key={s.key}
              scanner={s}
              disabled={isPending}
              onToggle={() => handleToggle(s.key, s.enabled)}
              onInterval={(m) => handleInterval(s.key, m)}
              onRun={() => handleRun(s.key)}
            />
          ))}
        </div>

        <div className="pt-4 border-t border-white/[0.06] grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
              <span className="text-sm font-medium text-zinc-100">
                Finviz research
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                on-demand
              </span>
            </div>
            <div className="text-xs text-zinc-500 mb-2">
              One-shot research via Finviz-style web screening. Saves a
              markdown report to Insights.
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={researchQuery}
                onChange={(e) => setResearchQuery(e.target.value)}
                placeholder="Query (optional)"
                disabled={isPending}
                className="flex-1 min-w-0 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 disabled:opacity-50 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleResearch();
                }}
              />
              <button
                onClick={handleResearch}
                disabled={isPending}
                className="flex-shrink-0 rounded-lg bg-accent/10 text-accent-light border border-accent/30 hover:bg-accent/20 hover:border-accent/50 px-3 py-1.5 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isPending ? "…" : "Run"}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
              <span className="text-sm font-medium text-zinc-100">
                Glassnode snapshot
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                on-demand
              </span>
            </div>
            <div className="text-xs text-zinc-500 mb-2">
              On-chain crypto read (BTC/ETH MVRV, SOPR, flows, holder
              behavior). Saves a markdown report to Insights.
            </div>
            <button
              onClick={handleGlassnode}
              disabled={isPending}
              className="rounded-lg bg-accent/10 text-accent-light border border-accent/30 hover:bg-accent/20 hover:border-accent/50 px-3 py-1.5 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {isPending ? "…" : "Run snapshot"}
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`text-xs font-mono ${
              feedback.ok ? "text-accent-light" : "text-red-400"
            }`}
          >
            {feedback.message}
          </div>
        )}

        {recentRuns.length > 0 && (
          <div className="pt-4 border-t border-white/[0.06]">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              <span>{showHistory ? "▾" : "▸"}</span>
              Recent scanner runs ({recentRuns.length})
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
                        #{run.id} · {run.trigger} · {timeAgo(run.started_at)}
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

function ScannerRowView({
  scanner,
  disabled,
  onToggle,
  onInterval,
  onRun,
}: {
  scanner: ScannerRow;
  disabled: boolean;
  onToggle: () => void;
  onInterval: (minutes: number) => void;
  onRun: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggle}
          disabled={disabled}
          className={`relative h-5 w-9 rounded-full border transition-all flex-shrink-0 ${
            scanner.enabled
              ? "bg-accent/90 border-accent"
              : "bg-zinc-800 border-white/10"
          } disabled:opacity-50`}
          aria-label={scanner.enabled ? "Disable" : "Enable"}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
              scanner.enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
        <span className="text-sm font-medium text-zinc-100 truncate">
          {scanner.label}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 flex-shrink-0">
          {scanner.key}
        </span>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <select
            value={scanner.intervalMinutes}
            onChange={(e) => onInterval(Number(e.target.value))}
            disabled={disabled || !scanner.enabled}
            className="rounded-md bg-zinc-900 border border-white/10 text-zinc-100 text-[11px] px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-50"
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={onRun}
            disabled={disabled}
            className="rounded-md bg-accent/10 text-accent-light border border-accent/30 hover:bg-accent/20 hover:border-accent/50 px-2 py-1 text-[11px] font-medium disabled:opacity-50 transition-colors"
          >
            Run
          </button>
        </div>
      </div>
      <div className="text-[11px] text-zinc-500 mt-1 pl-11 truncate">
        {scanner.description} · last run {timeAgo(scanner.lastRunAt)}
      </div>
    </div>
  );
}
