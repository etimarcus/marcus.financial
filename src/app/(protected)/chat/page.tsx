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

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");

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
      .map((m) => ({
        role: m.role,
        content: m.text,
      }));

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
              {
                id: event.id,
                name: event.name,
                input: event.input,
              },
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
    <main className="flex-1 flex flex-col h-[calc(100vh-57px)]">
      <div className="border-b border-black/10 dark:border-white/10 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            Analyst chat
          </h1>
          <p className="text-xs text-zinc-500">
            Read-only market analysis — no trades executed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50"
          >
            Dashboard
          </a>
          <button
            onClick={clear}
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-50"
          >
            Clear
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-sm text-zinc-500 text-center py-16">
              Ask about your portfolio, a ticker, the market, news, or
              indicators. Try:
              <ul className="mt-4 space-y-1 font-mono text-xs">
                <li>&quot;¿Cómo está el mercado hoy?&quot;</li>
                <li>&quot;Dame un análisis técnico de NVDA en 1Day&quot;</li>
                <li>&quot;¿Qué noticias hay de TSLA?&quot;</li>
              </ul>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {pending && messages[messages.length - 1]?.text === "" && (
            <div className="text-xs text-zinc-500 italic pl-1">
              Thinking…
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-black/10 dark:border-white/10 px-6 py-4">
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
            className="flex-1 resize-none rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-black/40 dark:focus:ring-white/30 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={pending || !input.trim()}
            className="rounded-lg bg-black dark:bg-white text-white dark:text-black px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-30"
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
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-black dark:bg-white text-white dark:text-black"
            : "bg-zinc-100 dark:bg-zinc-900 text-black dark:text-zinc-50"
        }`}
      >
        {message.toolCalls.length > 0 && (
          <div className="mb-2 space-y-1">
            {message.toolCalls.map((tc) => (
              <ToolChip key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        {message.text && (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
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
  const statusColor = {
    running: "text-amber-600 dark:text-amber-400",
    done: "text-emerald-600 dark:text-emerald-400",
    error: "text-red-600 dark:text-red-400",
  }[status];

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 bg-white/50 dark:bg-black/30 px-2 py-1 text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className={statusColor}>●</span>
        <span className="font-mono">{toolCall.name}</span>
        <span className="text-zinc-500 truncate flex-1">
          {JSON.stringify(toolCall.input)}
        </span>
        <span className="text-zinc-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && toolCall.result && (
        <pre className="mt-2 text-[10px] leading-tight overflow-x-auto max-h-48 text-zinc-700 dark:text-zinc-300">
          {toolCall.result.slice(0, 4000)}
          {toolCall.result.length > 4000 && "…"}
        </pre>
      )}
    </div>
  );
}
