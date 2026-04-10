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
      <h2 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300 mb-2">
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

  const sideColor =
    proposal.side === "buy"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";

  const confidencePct =
    proposal.confidence != null
      ? `${(Number(proposal.confidence) * 100).toFixed(0)}%`
      : null;

  function handleApprove() {
    if (!confirm(`Execute ${proposal.side.toUpperCase()} ${proposal.qty} ${proposal.symbol}?`))
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
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 bg-white dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase ${sideColor}`}
            >
              {proposal.side}
            </span>
            <span className="font-semibold text-black dark:text-zinc-50">
              {proposal.symbol}
            </span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {proposal.qty} sh · {proposal.order_type}
              {proposal.limit_price &&
                ` @ $${Number(proposal.limit_price).toFixed(2)}`}
            </span>
            {confidencePct && (
              <span className="text-xs text-zinc-500">
                conf {confidencePct}
              </span>
            )}
          </div>

          {(proposal.stop_loss || proposal.take_profit) && (
            <div className="mt-1 text-xs text-zinc-500 space-x-3">
              {proposal.stop_loss && (
                <span>
                  stop-loss ${Number(proposal.stop_loss).toFixed(2)}
                </span>
              )}
              {proposal.take_profit && (
                <span>
                  take-profit ${Number(proposal.take_profit).toFixed(2)}
                </span>
              )}
            </div>
          )}

          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
            {proposal.reasoning}
          </p>

          <p className="mt-2 text-xs text-zinc-500">
            {new Date(proposal.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={handleApprove}
            disabled={isPending}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {isPending ? "…" : "Approve"}
          </button>
          <button
            onClick={handleReject}
            disabled={isPending}
            className="rounded-lg border border-black/10 dark:border-white/15 text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-3 text-xs ${
            feedback.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}
