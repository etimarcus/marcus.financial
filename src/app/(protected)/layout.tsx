import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logout } from "../login/actions";
import { ChatDrawer } from "./chat-drawer";
import { HeaderClock } from "./header-clock";
import { getAccount, getClock } from "@/lib/alpaca";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  let clock: Awaited<ReturnType<typeof getClock>> | null = null;
  let account: Awaited<ReturnType<typeof getAccount>> | null = null;
  try {
    [clock, account] = await Promise.all([getClock(), getAccount()]);
  } catch {
    // Degrade gracefully — the dashboard itself will surface the error.
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-700/60 bg-[#07090d]/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <HeaderClock />
            <span className="text-zinc-700">·</span>
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  clock?.is_open
                    ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                    : "bg-zinc-600"
                }`}
              />
              {clock ? (clock.is_open ? "market open" : "market closed") : "—"}
            </span>
            <span className="text-zinc-700">·</span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">
              {account?.status?.toLowerCase() ?? "—"}
            </span>
            <span className="text-zinc-700">·</span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">
              paper
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ChatDrawer />
            <form action={logout}>
              <button
                type="submit"
                className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex justify-center py-10">
        <a href="/" aria-label="marcus.financial home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="marcus.financial"
            width={417}
            height={119}
            className="max-w-full h-auto"
          />
        </a>
      </div>

      <div className="flex-1">{children}</div>
    </div>
  );
}
