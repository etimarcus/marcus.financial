import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  getAccount,
  getBars,
  getClock,
  getNews,
  getPositions,
} from "./alpaca";
import { snapshot as indicatorSnapshot } from "./indicators";
import { db } from "./db";

const client = new Anthropic();
const MODEL = "claude-opus-4-6";
const MAX_TOKENS = 32000;
const MAX_ITERATIONS = 20;

const SYSTEM_PROMPT = `You are the market analyst for marcus.financial, a personal trading workstation for its single owner, Etienne Marcus.

Your mission is to analyze US equity markets and help Etienne form trading decisions. You are currently operating in ANALYST MODE — you have read-only tools: account data, positions, price history, news, technical indicators, and the watchlist. You cannot place trades, modify positions, or change any state.

Operating context:
- The broker is Alpaca, running on paper trading (simulated money, $100k default).
- US equity markets. Prices and news come from Alpaca's data API.
- When the user asks about "the market" without specifying, default to SPY as the broad benchmark.

How to work:
- Always ground claims in tool output. Never guess a price, a headline, or an indicator value.
- Prefer specificity: use tickers, numbers, dates. Quantify whenever possible.
- When you run indicators, state the timeframe and lookback you used.
- If the user asks a vague question, ask ONE clarifying question before calling tools — don't burn tokens on a blind exploration.
- Write in the same language the user writes in (Spanish or English). Match their tone.
- Be concise. Tables and bullet lists for structured data. No filler prose.
- You are NOT a licensed financial advisor. If the user asks whether to buy/sell something, analyze the setup and state the case on both sides; make the recommendation explicit but remind them the decision is theirs.
- If a tool call fails, report the error verbatim and propose a workaround. Do not invent data.

Tools you have:
- get_account, get_positions, get_clock — current Alpaca state.
- get_bars(symbol, timeframe, limit) — historical OHLCV bars. Timeframes: 1Min, 5Min, 15Min, 1Hour, 1Day.
- get_news(symbols, limit) — recent headlines from Alpaca's news feed.
- calculate_indicators(symbol, timeframe, lookback) — SMA/EMA/RSI/MACD snapshot from the last N bars.
- get_watchlist — the user's tracked symbols stored in Postgres.

Think before you act. Plan tool calls in parallel when they are independent. Don't chain unnecessary calls.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_account",
    description:
      "Get the Alpaca account summary: equity, cash, buying power, portfolio value, day P&L baseline. No parameters.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_positions",
    description:
      "Get all currently open positions in the Alpaca account with quantity, average entry, current price, market value, and unrealized P&L. No parameters.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_clock",
    description:
      "Get the US equity market clock — whether the market is open right now, and the next open/close timestamps. No parameters.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_bars",
    description:
      "Get historical OHLCV bars for a single US equity symbol. Use this before calling calculate_indicators if you need to inspect raw price action.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker, e.g. AAPL, SPY, NVDA",
        },
        timeframe: {
          type: "string",
          enum: ["1Min", "5Min", "15Min", "1Hour", "1Day"],
          description: "Bar granularity",
        },
        limit: {
          type: "integer",
          description: "Number of most recent bars to return, 1-1000",
          minimum: 1,
          maximum: 1000,
        },
      },
      required: ["symbol", "timeframe", "limit"],
    },
  },
  {
    name: "get_news",
    description:
      "Get recent news headlines and summaries for one or more symbols from Alpaca's news feed.",
    input_schema: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "List of tickers to fetch news for",
          minItems: 1,
          maxItems: 10,
        },
        limit: {
          type: "integer",
          description: "Max number of articles to return, default 10",
          minimum: 1,
          maximum: 50,
        },
      },
      required: ["symbols"],
    },
  },
  {
    name: "calculate_indicators",
    description:
      "Compute a technical indicator snapshot (SMA 20/50/200, EMA 12/26, RSI 14, MACD) for a symbol by fetching bars and running the calculations server-side. Returns only the latest value of each indicator plus the last close. Use this instead of get_bars when you don't need the raw series.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker",
        },
        timeframe: {
          type: "string",
          enum: ["1Min", "5Min", "15Min", "1Hour", "1Day"],
          description: "Bar granularity",
        },
        lookback: {
          type: "integer",
          description:
            "How many bars to fetch. Use at least 200 for SMA200, 35 for full MACD. Default 250.",
          minimum: 30,
          maximum: 1000,
        },
      },
      required: ["symbol", "timeframe"],
    },
  },
  {
    name: "get_watchlist",
    description:
      "Get the list of symbols the user is tracking, stored in the Postgres watchlist table. No parameters.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

type ToolInput = Record<string, unknown>;

async function executeTool(name: string, input: ToolInput): Promise<string> {
  switch (name) {
    case "get_account": {
      const a = await getAccount();
      return JSON.stringify({
        equity: a.equity,
        cash: a.cash,
        portfolio_value: a.portfolio_value,
        buying_power: a.buying_power,
        last_equity: a.last_equity,
        status: a.status,
        pattern_day_trader: a.pattern_day_trader,
      });
    }
    case "get_positions": {
      const pos = await getPositions();
      return JSON.stringify(
        pos.map((p) => ({
          symbol: p.symbol,
          side: p.side,
          qty: p.qty,
          avg_entry_price: p.avg_entry_price,
          current_price: p.current_price,
          market_value: p.market_value,
          unrealized_pl: p.unrealized_pl,
          unrealized_plpc: p.unrealized_plpc,
        }))
      );
    }
    case "get_clock": {
      const c = await getClock();
      return JSON.stringify(c);
    }
    case "get_bars": {
      const { symbol, timeframe, limit } = input as {
        symbol: string;
        timeframe: string;
        limit: number;
      };
      const bars = await getBars(symbol, timeframe, limit);
      return JSON.stringify(bars);
    }
    case "get_news": {
      const { symbols, limit } = input as { symbols: string[]; limit?: number };
      const news = await getNews(symbols, limit ?? 10);
      return JSON.stringify(
        news.news.map((n) => ({
          created_at: n.created_at,
          symbols: n.symbols,
          source: n.source,
          headline: n.headline,
          summary: n.summary,
          url: n.url,
        }))
      );
    }
    case "calculate_indicators": {
      const { symbol, timeframe, lookback } = input as {
        symbol: string;
        timeframe: string;
        lookback?: number;
      };
      const n = lookback ?? 250;
      const bars = await getBars(symbol, timeframe, n);
      const closes = bars.bars.map((b) => b.c);
      if (closes.length === 0) {
        return JSON.stringify({
          symbol,
          timeframe,
          error: "No bars returned for symbol",
        });
      }
      const snap = indicatorSnapshot(closes);
      return JSON.stringify({
        symbol,
        timeframe,
        bars_used: closes.length,
        last_close: closes[closes.length - 1],
        as_of: bars.bars[bars.bars.length - 1]?.t,
        ...snap,
      });
    }
    case "get_watchlist": {
      const { rows } = await db.query(
        "SELECT symbol, notes, created_at FROM watchlist ORDER BY symbol"
      );
      return JSON.stringify(rows);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export type AgentEvent =
  | { type: "text"; value: string }
  | { type: "thinking"; value: string }
  | { type: "tool_use"; id: string; name: string; input: ToolInput }
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

export type RunAgentOptions = {
  messages: Anthropic.MessageParam[];
  trigger: "chat" | "cron" | "manual";
  onEvent: (event: AgentEvent) => void | Promise<void>;
};

export async function runAgent(opts: RunAgentOptions): Promise<void> {
  const { onEvent, trigger } = opts;
  let { messages } = opts;

  const runInsert = await db.query(
    "INSERT INTO agent_runs (trigger, started_at) VALUES ($1, NOW()) RETURNING id",
    [trigger]
  );
  const runId: number = runInsert.rows[0].id;

  const totalUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  let errorMessage: string | null = null;

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const today = new Date().toISOString().slice(0, 10);
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: `Today's date: ${today}. Agent run id: ${runId}.`,
          },
        ],
        tools: TOOLS,
        messages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            await onEvent({ type: "text", value: event.delta.text });
          } else if (event.delta.type === "thinking_delta") {
            await onEvent({ type: "thinking", value: event.delta.thinking });
          }
        }
      }

      const message = await stream.finalMessage();

      if (message.usage) {
        totalUsage.input_tokens += message.usage.input_tokens ?? 0;
        totalUsage.output_tokens += message.usage.output_tokens ?? 0;
        totalUsage.cache_creation_input_tokens +=
          message.usage.cache_creation_input_tokens ?? 0;
        totalUsage.cache_read_input_tokens +=
          message.usage.cache_read_input_tokens ?? 0;
      }

      const toolUseBlocks = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (message.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        break;
      }

      messages = [
        ...messages,
        { role: "assistant", content: message.content },
      ];

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tool of toolUseBlocks) {
        await onEvent({
          type: "tool_use",
          id: tool.id,
          name: tool.name,
          input: tool.input as ToolInput,
        });
        try {
          const result = await executeTool(
            tool.name,
            tool.input as ToolInput
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: result,
          });
          await onEvent({
            type: "tool_result",
            id: tool.id,
            name: tool.name,
            result,
            isError: false,
          });
        } catch (e) {
          const errText = e instanceof Error ? e.message : String(e);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: `Tool error: ${errText}`,
            is_error: true,
          });
          await onEvent({
            type: "tool_result",
            id: tool.id,
            name: tool.name,
            result: errText,
            isError: true,
          });
        }
      }

      messages = [...messages, { role: "user", content: toolResults }];
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    await onEvent({ type: "error", message: errorMessage });
  } finally {
    const inputCost =
      ((totalUsage.input_tokens + totalUsage.cache_read_input_tokens * 0.1) *
        5) /
      1_000_000;
    const cacheCost =
      (totalUsage.cache_creation_input_tokens * 1.25 * 5) / 1_000_000;
    const outputCost = (totalUsage.output_tokens * 25) / 1_000_000;
    const costUsd = inputCost + cacheCost + outputCost;

    await db.query(
      `UPDATE agent_runs
         SET finished_at = NOW(),
             input_tokens = $1,
             output_tokens = $2,
             cost_usd = $3,
             error = $4
       WHERE id = $5`,
      [
        totalUsage.input_tokens + totalUsage.cache_read_input_tokens,
        totalUsage.output_tokens,
        costUsd,
        errorMessage,
        runId,
      ]
    );

    if (!errorMessage) {
      await onEvent({ type: "done", runId, usage: totalUsage });
    }
  }
}
