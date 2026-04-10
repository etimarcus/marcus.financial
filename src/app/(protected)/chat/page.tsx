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
  "Dame una vista general del mercado hoy",
  "Análisis técnico de NVDA en timeframe diario",
  "¿Qué noticias relevantes hay sobre mi portafolio?",
  "Busca oportunidades en la watchlist",
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function ChatPage() {
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
    <main className="flex-1 flex flex-col h-[calc(100vh-73px)]">
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
              Analyst chat
            </h1>
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5 font-mono uppercase tracking-wider">
            claude opus 4.6 · read + propose
          </p>
        </div>
        <button
          onClick={clear}
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          Clear history
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="py-12">
              <div className="text-center mb-8">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 text-black font-bold mb-4 shadow-[0_0_32px_rgba(34,211,238,0.3)]">
                  m
                </div>
                <h2 className="text-lg font-semibold text-zinc-100 mb-1">
                  Ready to analyze.
                </h2>
                <p className="text-sm text-zinc-500">
                  Ask anything about markets, your portfolio, or a ticker.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendWith(s)}
                    className="text-left text-sm text-zinc-300 px-4 py-3 rounded-xl border border-white/[0.06] hover:border-cyan-400/30 hover:bg-cyan-500/[0.03] transition-colors"
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
            <div className="flex items-center gap-2 text-xs text-zinc-500 pl-11 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              thinking…
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/[0.06] bg-[#07090d]/80 backdrop-blur px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={pending ? "Waiting for response…" : "Ask the agent…"}
            disabled={pending}
            rows={2}
            className="flex-1 resize-none rounded-xl border border-white/[0.08] bg-zinc-950/60 px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/30 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={send}
            disabled={pending || !input.trim()}
            className="rounded-xl bg-cyan-500 text-black px-4 py-3 text-sm font-semibold hover:bg-cyan-400 disabled:opacity-30 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-cyan-500/10 border border-cyan-400/20 px-4 py-3">
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">
            {message.text}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-3">
      <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center text-black font-bold text-sm shadow-[0_0_16px_rgba(34,211,238,0.3)]">
        m
      </div>
      <div className="flex-1 min-w-0 space-y-2 pt-0.5">
        {message.toolCalls.length > 0 && (
          <div className="space-y-1">
            {message.toolCalls.map((tc) => (
              <ToolChip key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        {message.text && (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
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
    done: "bg-cyan-400",
    error: "bg-red-400",
  }[status];

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] text-xs overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-white/[0.03] transition-colors"
      >
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="font-mono text-cyan-300">{toolCall.name}</span>
        <span className="text-zinc-500 truncate flex-1 font-mono text-[10px]">
          {JSON.stringify(toolCall.input)}
        </span>
        <span className="text-zinc-600">{open ? "▾" : "▸"}</span>
      </button>
      {open && toolCall.result && (
        <pre className="px-3 pb-2 pt-1 text-[10px] leading-tight overflow-x-auto max-h-48 text-zinc-400 font-mono border-t border-white/[0.04]">
          {toolCall.result.slice(0, 4000)}
          {toolCall.result.length > 4000 && "…"}
        </pre>
      )}
    </div>
  );
}
