"use client";

import { useState, useTransition } from "react";
import { addToWatchlist, removeFromWatchlist } from "./actions";

export type WatchlistEntry = {
  id: number;
  symbol: string;
  notes: string | null;
  created_at: string;
};

export function WatchlistPanel({
  entries,
}: {
  entries: WatchlistEntry[];
}) {
  const [symbol, setSymbol] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!symbol.trim()) return;
    startTransition(async () => {
      const result = await addToWatchlist(symbol, notes || undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSymbol("");
      setNotes("");
    });
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
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="SYMBOL"
            className="rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm font-mono w-28 text-zinc-100 focus:outline-none focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/30 transition-colors"
            maxLength={10}
            disabled={isPending}
          />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="flex-1 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/30 transition-colors"
            disabled={isPending}
          />
          <button
            type="submit"
            disabled={isPending || !symbol.trim()}
            className="rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-500/20 hover:border-cyan-400/50 px-4 py-2 text-sm font-medium disabled:opacity-30 transition-colors"
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
          <ul className="divide-y divide-white/[0.04]">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between py-2.5 gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono font-semibold text-zinc-100 tabular-nums">
                    {e.symbol}
                  </span>
                  {e.notes && (
                    <span className="text-xs text-zinc-500 truncate">
                      {e.notes}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(e.id)}
                  disabled={isPending}
                  className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 hover:text-red-400 disabled:opacity-50 transition-colors opacity-0 group-hover:opacity-100"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
