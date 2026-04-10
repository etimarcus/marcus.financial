"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    null
  );

  return (
    <main className="flex-1 flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <span className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 text-black font-bold text-xl shadow-[0_0_32px_rgba(34,211,238,0.4)]">
            m
          </span>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              marcus.financial
            </h1>
            <p className="text-xs text-zinc-500 mt-1 font-mono uppercase tracking-widest">
              restricted access
            </p>
          </div>
        </div>

        <form
          action={formAction}
          className="space-y-4 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 backdrop-blur p-6"
        >
          <div>
            <label
              htmlFor="password"
              className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-2"
            >
              Access key
            </label>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2.5 text-zinc-100 font-mono focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition-colors"
              placeholder="••••••••"
            />
          </div>
          {state?.error && (
            <p className="text-xs text-red-400 font-mono">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-cyan-500 text-black py-2.5 font-semibold hover:bg-cyan-400 disabled:opacity-50 transition-colors shadow-[0_0_24px_rgba(34,211,238,0.3)]"
          >
            {pending ? "Authenticating…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-[10px] text-zinc-600 font-mono uppercase tracking-widest">
          Paper trading · Alpaca · Opus 4.6
        </p>
      </div>
    </main>
  );
}
