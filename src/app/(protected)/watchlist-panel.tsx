"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  addToWatchlist,
  removeFromWatchlist,
  searchAssets,
  type AssetSearchHit,
} from "./actions";
import type { AlpacaSnapshot, AlpacaNewsArticle } from "@/lib/alpaca";

export type WatchlistEntry = {
  id: number;
  symbol: string;
  name: string | null;
  notes: string | null;
  created_at: string;
};

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

type RowMetrics = {
  price: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  gapPct: number | null;
  unusualMove: boolean;
  unusualGap: boolean;
};

function computeMetrics(snapshot: AlpacaSnapshot | undefined): RowMetrics {
  const price = snapshot?.latestTrade?.p ?? snapshot?.minuteBar?.c ?? null;
  const prevClose = snapshot?.prevDailyBar?.c ?? null;
  const dayOpen = snapshot?.dailyBar?.o ?? null;
  const dayHigh = snapshot?.dailyBar?.h ?? null;
  const dayLow = snapshot?.dailyBar?.l ?? null;
  const volume = snapshot?.dailyBar?.v ?? null;

  let change: number | null = null;
  let changePct: number | null = null;
  if (price != null && prevClose != null && prevClose > 0) {
    change = price - prevClose;
    changePct = change / prevClose;
  }

  let gapPct: number | null = null;
  if (dayOpen != null && prevClose != null && prevClose > 0) {
    gapPct = (dayOpen - prevClose) / prevClose;
  }

  const unusualMove = changePct != null && Math.abs(changePct) >= 0.03;
  const unusualGap = gapPct != null && Math.abs(gapPct) >= 0.01;

  return {
    price,
    prevClose,
    change,
    changePct,
    dayOpen,
    dayHigh,
    dayLow,
    volume,
    gapPct,
    unusualMove,
    unusualGap,
  };
}

export function WatchlistPanel({
  entries,
  snapshots,
  newsBySymbol,
}: {
  entries: WatchlistEntry[];
  snapshots: Record<string, AlpacaSnapshot>;
  newsBySymbol: Record<string, AlpacaNewsArticle[]>;
}) {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AssetSearchHit[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length === 0) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchAssets(q);
        setSuggestions(res.results);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  function pickSuggestion(hit: AssetSearchHit) {
    setQuery(hit.symbol);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
  }

  function submitAdd(symbolToAdd: string) {
    setError(null);
    const trimmed = symbolToAdd.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await addToWatchlist(trimmed, notes || undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setQuery("");
      setNotes("");
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveIndex(-1);
    });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    // If the user pressed Enter with a highlighted suggestion, add that.
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      submitAdd(suggestions[activeIndex].symbol);
      return;
    }
    submitAdd(query);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        i <= 0 ? suggestions.length - 1 : i - 1
      );
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
  }

  function handleRemove(id: number) {
    startTransition(async () => {
      await removeFromWatchlist(id);
    });
  }

  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-2">
        Watchlist ({entries.length})
      </h2>
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/70 to-zinc-950/70 backdrop-blur p-5 space-y-4">
        <form
          onSubmit={handleAdd}
          className="flex flex-col sm:flex-row gap-2 relative"
          ref={boxRef}
        >
          <div className="relative sm:w-64">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Symbol or company name"
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 transition-colors"
              maxLength={60}
              disabled={isPending}
              autoComplete="off"
              spellCheck={false}
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-30 left-0 right-0 top-full mt-1 rounded-lg border border-white/[0.1] bg-[#0c0f14]/98 backdrop-blur shadow-xl max-h-80 overflow-y-auto">
                {suggestions.map((hit, i) => (
                  <li key={`${hit.symbol}-${i}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickSuggestion(hit);
                      }}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        activeIndex === i
                          ? "bg-accent/10"
                          : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="font-mono font-semibold text-zinc-100 w-16 tabular-nums">
                        {hit.symbol}
                      </span>
                      <span className="text-xs text-zinc-400 flex-1 truncate">
                        {hit.name}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
                        {hit.exchange}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="flex-1 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 transition-colors"
            disabled={isPending}
          />
          <button
            type="submit"
            disabled={isPending || !query.trim()}
            className="rounded-lg bg-accent/10 text-accent-light border border-accent/30 hover:bg-accent/20 hover:border-accent/50 px-4 py-2 text-sm font-medium disabled:opacity-30 transition-colors"
          >
            Add
          </button>
        </form>

        {error && (
          <div className="text-xs text-red-400 font-mono">{error}</div>
        )}

        {entries.length === 0 ? (
          <div className="text-xs text-zinc-500 py-2 text-center">
            No symbols yet. Add some to enable scheduled scans.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {entries.map((e) => {
              const metrics = computeMetrics(snapshots[e.symbol]);
              const news = newsBySymbol[e.symbol.toUpperCase()] ?? [];
              return (
                <WatchlistRow
                  key={e.id}
                  entry={e}
                  metrics={metrics}
                  news={news}
                  disabled={isPending}
                  onRemove={() => handleRemove(e.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function WatchlistRow({
  entry,
  metrics,
  news,
  disabled,
  onRemove,
}: {
  entry: WatchlistEntry;
  metrics: RowMetrics;
  news: AlpacaNewsArticle[];
  disabled: boolean;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasData = metrics.price != null;
  const changeTone =
    metrics.change == null
      ? "text-zinc-500"
      : metrics.change >= 0
        ? "text-profit"
        : "text-loss";

  return (
    <div className="py-2.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 text-left hover:bg-white/[0.02] transition-colors -mx-2 px-2 py-1 rounded-lg"
      >
        <span className="text-zinc-600 text-xs w-3">
          {expanded ? "▾" : "▸"}
        </span>
        <span className="font-mono font-semibold text-zinc-100 w-16 tabular-nums">
          {entry.symbol}
        </span>
        <span className="text-xs text-zinc-400 truncate w-40 md:w-56">
          {entry.name ?? ""}
        </span>
        <span
          className={`font-mono tabular-nums text-sm w-24 ${
            hasData ? "text-zinc-100" : "text-zinc-600"
          }`}
        >
          {hasData ? fmtUsd(metrics.price!) : "—"}
        </span>
        <span
          className={`font-mono tabular-nums text-sm w-28 ${changeTone}`}
        >
          {metrics.change != null
            ? `${metrics.change >= 0 ? "+" : ""}${metrics.change.toFixed(2)}`
            : "—"}
          {metrics.changePct != null && (
            <span className="ml-1 text-xs opacity-80">
              ({metrics.changePct >= 0 ? "+" : ""}
              {(metrics.changePct * 100).toFixed(2)}%)
            </span>
          )}
        </span>
        <span className="font-mono tabular-nums text-xs text-zinc-500 w-16">
          V {metrics.volume != null ? fmtCompact(metrics.volume) : "—"}
        </span>
        <div className="flex items-center gap-1 flex-1 justify-end">
          {metrics.unusualMove && (
            <span
              className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-loss/40 text-loss"
              title={`Move of ${((metrics.changePct ?? 0) * 100).toFixed(2)}% — outside normal range`}
            >
              move
            </span>
          )}
          {metrics.unusualGap && (
            <span
              className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-accent/40 text-accent-light"
              title={`Gap of ${((metrics.gapPct ?? 0) * 100).toFixed(2)}% at open`}
            >
              gap
            </span>
          )}
          {news.length > 0 && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              📰 {news.length}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 ml-6 pl-4 border-l border-white/[0.08] space-y-3 pb-1">
          {entry.notes && (
            <div className="text-xs text-zinc-400">
              <span className="text-zinc-600 font-mono uppercase tracking-wider text-[10px]">
                note ·{" "}
              </span>
              {entry.notes}
            </div>
          )}
          {hasData && (
            <div className="text-xs text-zinc-400 space-x-3 font-mono tabular-nums">
              {metrics.dayOpen != null && (
                <span>
                  <span className="text-zinc-600">open</span>{" "}
                  {fmtUsd(metrics.dayOpen)}
                </span>
              )}
              {metrics.dayLow != null && metrics.dayHigh != null && (
                <span>
                  <span className="text-zinc-600">day range</span>{" "}
                  {fmtUsd(metrics.dayLow)} – {fmtUsd(metrics.dayHigh)}
                </span>
              )}
              {metrics.prevClose != null && (
                <span>
                  <span className="text-zinc-600">prev close</span>{" "}
                  {fmtUsd(metrics.prevClose)}
                </span>
              )}
              {metrics.gapPct != null && (
                <span>
                  <span className="text-zinc-600">gap</span>{" "}
                  {metrics.gapPct >= 0 ? "+" : ""}
                  {(metrics.gapPct * 100).toFixed(2)}%
                </span>
              )}
            </div>
          )}
          {news.length > 0 ? (
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                recent news
              </div>
              <ul className="space-y-1">
                {news.slice(0, 5).map((article) => (
                  <li key={article.id} className="text-xs">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-300 hover:text-accent-light transition-colors"
                    >
                      {article.headline}
                    </a>
                    <span className="ml-2 text-zinc-600 font-mono text-[10px]">
                      {article.source} · {timeAgo(article.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-[11px] text-zinc-600 italic">
              No recent news.
            </div>
          )}
          <div className="pt-1">
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onRemove();
              }}
              disabled={disabled}
              className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 hover:text-red-400 disabled:opacity-50 transition-colors"
            >
              Remove symbol
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
