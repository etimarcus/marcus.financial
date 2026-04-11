import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logout } from "../login/actions";
import { ChatDrawer } from "./chat-drawer";
import { HeaderClock } from "./header-clock";
import { HeatmapButtons } from "./heatmap-buttons";
import { MissionControl } from "./mission-control";
import { getClock } from "@/lib/alpaca";

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
  try {
    clock = await getClock();
  } catch {
    // Degrade gracefully — the dashboard itself will surface the error.
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-700/60 bg-[#07090d]/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href="https://marcus.pub"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="marcus.pub"
              className="inline-block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon.png"
                alt="marcus.financial shield"
                width={48}
                height={48}
                className="h-12 w-12 drop-shadow-[0_0_12px_rgba(242,214,106,0.25)]"
              />
            </a>
            <HeaderClock />
            <span className="text-zinc-700">·</span>
            <span className="flex items-center gap-1.5 font-mono text-sm font-semibold uppercase tracking-wider text-zinc-200">
              <span
                className={`h-2 w-2 rounded-full ${
                  clock?.is_open
                    ? "bg-accent shadow-[0_0_10px_rgba(86,118,220,0.9)]"
                    : "bg-zinc-600"
                }`}
              />
              {clock ? (clock.is_open ? "market open" : "market closed") : "—"}
            </span>
          </div>
          <div className="flex items-center">
            <MissionControl />
          </div>
          <div className="flex items-center gap-3">
            <HeatmapButtons />
            <ChatDrawer />
            <form action={logout}>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 text-accent-light hover:bg-accent/20 hover:border-accent/50 px-3 py-1.5 text-xs font-medium transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex justify-end px-6 pt-4">
        <a href="/" aria-label="marcus.financial home" className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="marcus.financial"
            width={202}
            height={144}
            className="h-auto"
          />
        </a>
      </div>

      <div className="flex-1">{children}</div>
    </div>
  );
}
