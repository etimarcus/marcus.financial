"use client";

import { useEffect, useRef, useState } from "react";

type ToolCall = {
  id: string;
  name: string;
  input: unknown;
  result?: string;
  isError?: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls: ToolCall[];
};

type AgentEvent =
  | { type: "text"; value: string }
  | { type: "thinking"; value: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      id: string;
      name: string;
      result: string;
      isError: boolean;
    }
  | {
      type: "done";
      runId: number;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens: number;
        cache_read_input_tokens: number;
      };
    }
  | { type: "error"; message: string };

const STORAGE_KEY = "marcus_chat_history_v1";

const STARTERS = [
  "Market overview for today",
  "Technical analysis of NVDA on the daily timeframe",
  "Recent news on my portfolio",
  "Look for setups across my watchlist",
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ChatInterface({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  async function sendWith(text: string) {
    if (!text.trim() || pending) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text,
      toolCalls: [],
    };
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      text: "",
      toolCalls: [],
    };
    const newMessages = [...messages, userMsg, assistantMsg];
    setMessages(newMessages);
    setPending(true);

    const apiMessages = newMessages
      .filter((m) => m.id !== assistantMsg.id)
      .map((m) => ({ role: m.role, content: m.text }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => "Request failed");
        throw new Error(err || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const json = line.slice(6);
          let event: AgentEvent;
          try {
            event = JSON.parse(json);
          } catch {
            continue;
          }
          applyEvent(assistantMsg.id, event);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, text: (m.text ? m.text + "\n\n" : "") + `⚠ ${msg}` }
            : m
        )
      );
    } finally {
      setPending(false);
    }
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendWith(text);
  }

  function applyEvent(assistantId: string, event: AgentEvent) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== assistantId) return m;
        if (event.type === "text") {
          return { ...m, text: m.text + event.value };
        }
        if (event.type === "tool_use") {
          return {
            ...m,
            toolCalls: [
              ...m.toolCalls,
              { id: event.id, name: event.name, input: event.input },
            ],
          };
        }
        if (event.type === "tool_result") {
          return {
            ...m,
            toolCalls: m.toolCalls.map((tc) =>
              tc.id === event.id
                ? { ...tc, result: event.result, isError: event.isError }
                : tc
            ),
          };
        }
        if (event.type === "error") {
          return {
            ...m,
            text: (m.text ? m.text + "\n\n" : "") + `⚠ ${event.message}`,
          };
        }
        return m;
      })
    );
  }

  function clear() {
    if (!confirm("Clear chat history?")) return;
    setMessages([]);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(86, 118, 220,0.8)]" />
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
              Analyst
            </h1>
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5 font-mono uppercase tracking-wider">
            opus 4.6 · read + propose
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={clear}
            className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Clear
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-5">
          {messages.length === 0 && (
            <div className="py-8">
              <div className="space-y-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendWith(s)}
                    className="w-full text-left text-xs text-zinc-300 px-3 py-2.5 rounded-lg border border-white/[0.06] hover:border-accent/30 hover:bg-accent/[0.03] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {pending && messages[messages.length - 1]?.text === "" && (
            <div className="flex items-center gap-2 text-[11px] text-zinc-500 pl-10 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              thinking…
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/[0.06] bg-[#07090d]/90 backdrop-blur px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={pending ? "Waiting…" : "Ask the agent…"}
            disabled={pending}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-white/[0.08] bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={send}
            disabled={pending || !input.trim()}
            className="rounded-lg bg-accent text-black px-3 py-2 text-sm font-semibold hover:bg-accent-light disabled:opacity-30 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[90%] rounded-xl rounded-tr-sm bg-accent/10 border border-accent/20 px-3 py-2">
          <div className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-100">
            {message.text}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2">
      <div className="flex-shrink-0 h-7 w-7 rounded-md bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center text-black font-bold text-xs shadow-[0_0_12px_rgba(86, 118, 220,0.3)]">
        m
      </div>
      <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
        {message.toolCalls.length > 0 && (
          <div className="space-y-1">
            {message.toolCalls.map((tc) => (
              <ToolChip key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        {message.text && (
          <div className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-200">
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolChip({ toolCall }: { toolCall: ToolCall }) {
  const [open, setOpen] = useState(false);
  const status = toolCall.result
    ? toolCall.isError
      ? "error"
      : "done"
    : "running";
  const dotColor = {
    running: "bg-amber-400 animate-pulse",
    done: "bg-accent",
    error: "bg-red-400",
  }[status];

  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] text-[10px] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left px-2 py-1 hover:bg-white/[0.03] transition-colors"
      >
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="font-mono text-accent-light">{toolCall.name}</span>
        <span className="text-zinc-500 truncate flex-1 font-mono">
          {JSON.stringify(toolCall.input)}
        </span>
        <span className="text-zinc-600">{open ? "▾" : "▸"}</span>
      </button>
      {open && toolCall.result && (
        <pre className="px-2 pb-1.5 pt-1 leading-tight overflow-x-auto max-h-40 text-zinc-400 font-mono border-t border-white/[0.04]">
          {toolCall.result.slice(0, 3000)}
          {toolCall.result.length > 3000 && "…"}
        </pre>
      )}
    </div>
  );
}
