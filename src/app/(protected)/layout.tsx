import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logout } from "../login/actions";

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
      <header className="border-b border-black/10 dark:border-white/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a
            href="/"
            className="font-semibold tracking-tight text-black dark:text-zinc-50"
          >
            marcus.financial
          </a>
          <nav className="flex items-center gap-4 text-sm">
            <a
              href="/"
              className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50"
            >
              Dashboard
            </a>
            <a
              href="/chat"
              className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50"
            >
              Chat
            </a>
          </nav>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50"
          >
            Sign out
          </button>
        </form>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
