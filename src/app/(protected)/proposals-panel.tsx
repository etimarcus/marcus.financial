"use client";

import { useState, useTransition } from "react";
import { approveProposal, rejectProposal } from "./actions";

export type PendingProposal = {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  qty: string;
  order_type: "market" | "limit";
  limit_price: string | null;
  stop_loss: string | null;
  take_profit: string | null;
  reasoning: string;
  confidence: string | null;
  created_at: string;
};

export function ProposalsPanel({
  proposals,
}: {
  proposals: PendingProposal[];
}) {
  if (proposals.length === 0) return null;

  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-2">
        Pending proposals ({proposals.length})
      </h2>
      <div className="space-y-3">
        {proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
      </div>
    </section>
  );
}

function ProposalCard({ proposal }: { proposal: PendingProposal }) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const isBuy = proposal.side === "buy";
  const sideClasses = isBuy
    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-400/30"
    : "bg-red-500/10 text-red-300 border border-red-400/30";

  const confidencePct =
    proposal.confidence != null
      ? `${(Number(proposal.confidence) * 100).toFixed(0)}%`
      : null;

  function handleApprove() {
    if (
      !confirm(
        `Execute ${proposal.side.toUpperCase()} ${proposal.qty} ${proposal.symbol}?`
      )
    )
      return;
    setFeedback(null);
    startTransition(async () => {
      const result = await approveProposal(proposal.id);
      setFeedback(
        result.ok
          ? { ok: true, message: result.message }
          : { ok: false, message: result.error }
      );
    });
  }

  function handleReject() {
    setFeedback(null);
    startTransition(async () => {
      const result = await rejectProposal(proposal.id);
      setFeedback(
        result.ok
          ? { ok: true, message: result.message }
          : { ok: false, message: result.error }
      );
    });
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/70 to-zinc-950/70 backdrop-blur p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${sideClasses}`}
            >
              {proposal.side}
            </span>
            <span className="font-mono font-semibold text-zinc-100 tracking-tight">
              {proposal.symbol}
            </span>
            <span className="text-sm text-zinc-500 font-mono tabular-nums">
              {proposal.qty} sh · {proposal.order_type}
              {proposal.limit_price &&
                ` @ $${Number(proposal.limit_price).toFixed(2)}`}
            </span>
            {confidencePct && (
              <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-cyan-300">
                conf {confidencePct}
              </span>
            )}
          </div>

          {(proposal.stop_loss || proposal.take_profit) && (
            <div className="mt-2 flex items-center gap-3 text-[11px] font-mono text-zinc-500">
              {proposal.stop_loss && (
                <span>
                  stop ${Number(proposal.stop_loss).toFixed(2)}
                </span>
              )}
              {proposal.take_profit && (
                <span>
                  target ${Number(proposal.take_profit).toFixed(2)}
                </span>
              )}
            </div>
          )}

          <p className="mt-3 text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {proposal.reasoning}
          </p>

          <p className="mt-3 text-[10px] text-zinc-600 font-mono uppercase tracking-wider">
            {new Date(proposal.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={handleApprove}
            disabled={isPending}
            className="rounded-lg bg-emerald-500/90 hover:bg-emerald-400 text-black px-4 py-1.5 text-sm font-semibold disabled:opacity-50 shadow-[0_0_16px_rgba(52,211,153,0.2)] transition-all"
          >
            {isPending ? "…" : "Approve"}
          </button>
          <button
            onClick={handleReject}
            disabled={isPending}
            className="rounded-lg border border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 px-4 py-1.5 text-sm font-medium disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-3 text-xs font-mono ${
            feedback.ok ? "text-cyan-300" : "text-red-400"
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}
