"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <a
            key={link.href}
            href={link.href}
            className={`relative px-3 py-1.5 text-sm rounded-md transition-colors ${
              active
                ? "text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {link.label}
            {active && (
              <span className="absolute -bottom-[17px] left-1/2 -translate-x-1/2 h-[2px] w-6 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            )}
          </a>
        );
      })}
    </nav>
  );
}
