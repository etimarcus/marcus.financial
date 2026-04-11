"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    null
  );

  return (
    <main className="relative flex-1 flex items-center justify-center px-6 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url('/fractal.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          maskImage:
            "radial-gradient(circle at center, black 0%, black 20%, transparent 65%)",
          WebkitMaskImage:
            "radial-gradient(circle at center, black 0%, black 20%, transparent 65%)",
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="marcus.financial"
        width={202}
        height={144}
        className="absolute top-6 right-6 h-auto drop-shadow-[0_0_32px_rgba(86,118,220,0.25)]"
      />
      <div className="relative w-full max-w-[314px] flex flex-col items-center">
        <form
          action={formAction}
          className="w-full space-y-2 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 backdrop-blur px-4 py-3"
        >
          <div>
            <label
              htmlFor="password"
              className="block text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-[#f2d66a] mb-1"
            >
              Access key
            </label>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-1.5 text-zinc-100 font-mono focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
              placeholder="••••••••"
            />
          </div>
          {state?.error && (
            <p className="text-xs text-red-400 font-mono">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-accent text-black py-1.5 font-semibold hover:bg-accent-light disabled:opacity-50 transition-colors shadow-[0_0_24px_rgba(86, 118, 220,0.3)]"
          >
            {pending ? "Authenticating…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
