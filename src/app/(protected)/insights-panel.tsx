"use client";

import { useState } from "react";

export type InsightRow = {
  id: number;
  source: string;
  kind: string;
  title: string;
  body: string;
  symbols: string[] | null;
  created_at: string;
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const SOURCE_STYLES: Record<string, string> = {
  polymarket:
    "bg-purple-500/10 text-purple-300 border-purple-400/30",
  finviz: "bg-amber-500/10 text-amber-300 border-amber-400/30",
  tradingview: "bg-accent/10 text-accent-light border-accent/30",
  chat: "bg-zinc-500/10 text-zinc-300 border-zinc-400/30",
};

export function InsightsPanel({ insights }: { insights: InsightRow[] }) {
  if (insights.length === 0) return null;

  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-2">
        Insights & research ({insights.length})
      </h2>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}
      </div>
    </section>
  );
}

function InsightCard({ insight }: { insight: InsightRow }) {
  const [expanded, setExpanded] = useState(false);
  const sourceClass =
    SOURCE_STYLES[insight.source] ??
    "bg-zinc-500/10 text-zinc-300 border-zinc-400/30";

  const preview = insight.body.slice(0, 200);
  const hasMore = insight.body.length > preview.length;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/70 to-zinc-950/70 backdrop-blur p-4">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border ${sourceClass}`}
        >
          {insight.source}
        </span>
        <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-600">
          {insight.kind}
        </span>
        {insight.symbols && insight.symbols.length > 0 && (
          <span className="text-[10px] font-mono text-zinc-500 truncate">
            {insight.symbols.slice(0, 4).join(" · ")}
            {insight.symbols.length > 4 && ` +${insight.symbols.length - 4}`}
          </span>
        )}
        <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-zinc-600">
          {timeAgo(insight.created_at)}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-zinc-100 mb-1.5 leading-snug">
        {insight.title}
      </h3>
      <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {expanded ? insight.body : preview}
        {!expanded && hasMore && "…"}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-[10px] font-mono uppercase tracking-wider text-accent hover:text-accent-light"
        >
          {expanded ? "Collapse ▴" : "Read full ▾"}
        </button>
      )}
    </div>
  );
}
