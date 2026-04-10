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
      <h2 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300 mb-2">
        Watchlist ({entries.length})
      </h2>
      <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 p-4 space-y-3">
        <form
          onSubmit={handleAdd}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol (e.g. NVDA)"
            className="rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-1.5 text-sm font-mono w-32 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black/40 dark:focus:ring-white/30"
            maxLength={10}
            disabled={isPending}
          />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="flex-1 rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-1.5 text-sm text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black/40 dark:focus:ring-white/30"
            disabled={isPending}
          />
          <button
            type="submit"
            disabled={isPending || !symbol.trim()}
            className="rounded-lg bg-black dark:bg-white text-white dark:text-black px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-30"
          >
            Add
          </button>
        </form>

        {error && (
          <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
        )}

        {entries.length === 0 ? (
          <div className="text-xs text-zinc-500 py-2">
            No symbols. Add some to enable the scheduled agent scans.
          </div>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between py-2 gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono font-semibold text-black dark:text-zinc-50">
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
                  className="text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
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
