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
      <div className="w-full max-w-md flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/marcus%20financial.png"
          alt="marcus.financial"
          width={417}
          height={119}
          className="max-w-full h-auto drop-shadow-[0_0_32px_rgba(86,118,220,0.25)]"
        />

        <form
          action={formAction}
          className="w-full mt-3 space-y-4 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 backdrop-blur p-6"
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
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2.5 text-zinc-100 font-mono focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
              placeholder="••••••••"
            />
          </div>
          {state?.error && (
            <p className="text-xs text-red-400 font-mono">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-accent text-black py-2.5 font-semibold hover:bg-accent-light disabled:opacity-50 transition-colors shadow-[0_0_24px_rgba(86, 118, 220,0.3)]"
          >
            {pending ? "Authenticating…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] text-zinc-600 font-mono uppercase tracking-widest">
          Paper trading · Alpaca · Opus 4.6
        </p>
      </div>
    </main>
  );
}
