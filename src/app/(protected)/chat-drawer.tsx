"use client";

import { useEffect, useState } from "react";
import { ChatInterface } from "./chat-interface";

export function ChatDrawer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400/50 px-3 py-1.5 text-xs font-medium transition-colors"
        aria-label={open ? "Close chat" : "Open chat"}
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
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Chat</span>
      </button>

      <aside
        className={`fixed right-0 top-0 z-40 h-screen w-full md:w-[440px] border-l border-white/[0.08] bg-[#07090d]/95 backdrop-blur-xl shadow-[0_0_60px_-15px_rgba(34,211,238,0.25)] transform transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <ChatInterface onClose={() => setOpen(false)} />
      </aside>
    </>
  );
}
