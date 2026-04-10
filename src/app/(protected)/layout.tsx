import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logout } from "../login/actions";
import { NavLinks } from "./nav-links";

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
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <a href="/" className="flex items-center gap-2.5 group">
              <span className="relative flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-cyan-600 text-black font-bold text-sm shadow-[0_0_16px_rgba(34,211,238,0.4)] group-hover:shadow-[0_0_24px_rgba(34,211,238,0.6)] transition-shadow">
                m
              </span>
              <span className="text-sm font-semibold tracking-tight text-zinc-100">
                marcus.financial
              </span>
            </a>
            <NavLinks />
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
