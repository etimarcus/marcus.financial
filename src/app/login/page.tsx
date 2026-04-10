"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    null
  );

  return (
    <main className="flex-1 flex items-center justify-center px-6 bg-zinc-50 dark:bg-black">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 p-8 shadow-sm"
      >
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          marcus.financial
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Enter the access password to continue.
        </p>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black/40 dark:focus:ring-white/30"
          placeholder="Password"
        />
        {state?.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-black dark:bg-white text-white dark:text-black py-2 font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
