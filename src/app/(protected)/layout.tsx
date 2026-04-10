import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logout } from "../login/actions";
import { ChatDrawer } from "./chat-drawer";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#07090d]/80 backdrop-blur-md">
        <div className="grid grid-cols-3 items-center px-6 py-3">
          <div />
          <div className="flex justify-center">
            <a href="/" aria-label="marcus.financial home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="marcus.financial"
                className="h-10 w-auto"
              />
            </a>
          </div>
          <div className="flex items-center justify-end gap-4">
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
      <div className="flex-1">{children}</div>
    </div>
  );
}
