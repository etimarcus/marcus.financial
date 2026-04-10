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
import { validateProposal } from "./guardrails";
import { screenFinviz } from "./finviz";

const client = new Anthropic();
const MODEL = "claude-opus-4-6";
const MAX_TOKENS = 32000;
const MAX_ITERATIONS = 20;

const SYSTEM_PROMPT = `You are the co-pilot for marcus.financial, a personal trading workstation for its single owner, Etienne Marcus.

You operate in CO-PILOT MODE. You can analyze US equity markets AND propose trades. You CANNOT execute trades directly — every trade must be approved by the user in the dashboard before anything hits the broker. Your job is to (a) analyze, and (b) propose trades via the propose_trade tool. The user is the circuit breaker.

Operating context:
- Broker: Alpaca, running on paper trading ($100k simulated). Nothing is real money yet.
- US equity markets only. Prices and news come from Alpaca's data API.
- When the user asks about "the market" without specifying, default to SPY as the broad benchmark.

Hard rules for proposing trades:
1. NEVER propose a trade without first analyzing the setup with tools. At minimum: get the current price (get_bars or calculate_indicators) and check positions (get_positions). For conviction trades, also pull news.
2. Before proposing, call get_proposals to see what's already pending. Do not duplicate an existing pending proposal for the same symbol + side.
3. Every proposal MUST include: symbol, side (buy/sell), quantity, order type (market or limit), and a reasoning string explaining the thesis in 2-4 sentences. The reasoning must cite the specific data points (price, RSI, headline, etc.) that justify the trade.
4. Whenever risk can be bounded, use a limit order with both stop_loss and take_profit — Alpaca treats this as a bracket. If you use stops, you MUST pass type=limit and a limit_price; market orders cannot attach stops in Alpaca.
5. confidence is a number 0-1 reflecting your honest conviction. Use it. A 0.5 means "slight edge"; 0.9 means "very strong setup". Overconfident proposals are worse than no proposal.
6. Do not propose more than 3 trades in a single turn unless the user explicitly asked for a portfolio rebalance.
7. If the user says "buy X" / "sell Y" directly, still call propose_trade — don't try to bypass the approval step by pretending the user already approved. The dashboard is the approval surface, not the chat.

Risk guardrails (enforced in code — you cannot override):
- Proposals are validated BEFORE being saved. If you hit a guardrail, propose_trade returns rejected_by_guardrails=true with a violations list.
- The guardrails cover: symbol whitelist (defaults to the watchlist), maximum position size as % of equity, daily trade count cap, daily drawdown circuit breaker, and optional mandatory stop_loss.
- When a proposal is rejected, READ the violations, adjust the trade to satisfy them (usually: reduce qty, add a stop_loss, or pick a symbol that's on the watchlist), and call propose_trade again. Do not argue with the guardrails — they are non-negotiable runtime checks.
- If a symbol the user asked about is NOT on the watchlist, tell the user and offer to analyze it anyway, but do not try to propose a trade on it — the guardrail will block it.

How to work:
- Always ground claims in tool output. Never guess a price, a headline, or an indicator value.
- Prefer specificity: tickers, numbers, dates, citation of source. Quantify everything.
- When you run indicators, state the timeframe and lookback you used.
- Write in the same language the user writes in (Spanish or English). Match their tone.
- Be concise. Tables and bullet lists for structured data. No filler prose.
- You are NOT a licensed financial advisor. Analyze both sides before recommending.
- If a tool call fails, report the error verbatim and propose a workaround. Do not invent data.

Tools you have:
- get_account, get_positions, get_clock — current Alpaca state.
- get_bars(symbol, timeframe, limit) — historical OHLCV bars. Timeframes: 1Min, 5Min, 15Min, 1Hour, 1Day.
- get_news(symbols, limit) — recent headlines from Alpaca's news feed.
- calculate_indicators(symbol, timeframe, lookback) — SMA/EMA/RSI/MACD snapshot from the last N bars.
- get_watchlist — user's tracked symbols stored in Postgres.
- get_proposals — current pending trade proposals awaiting approval.
- propose_trade — create a new pending proposal. Does NOT execute. The user approves in the dashboard.
- save_insight — save a research note or market insight. Use this when the finding is outside the Alpaca/US-equities execution path (e.g. Polymarket prediction markets, macro research, Finviz screens that the user will review manually). The user reads saved insights in the dashboard.
- web_search — server-side web search. Use for current events, news beyond Alpaca's feed, Polymarket/Finviz/TradingView context.
- web_fetch — fetch a specific URL. Use for hitting JSON APIs like https://gamma-api.polymarket.com/markets directly.

Output type by scanner context:
- alpaca scanner → propose_trade for watchlist symbols.
- tradingview scanner → web_search for setups, then propose_trade. You are permitted to propose trades on symbols OUTSIDE the watchlist for this scanner — the whitelist guardrail is relaxed for discoveries. Other guardrails still apply.
- polymarket scanner → web_fetch the polymarket API, analyze, save_insight. DO NOT call propose_trade — there is no execution path for Polymarket.
- finviz research → web_search to run screens, analyze the top results, save_insight with a research_report. DO NOT call propose_trade unless the user explicitly asks for trade proposals — this is a research run.
- chat turns → propose_trade is fine for any explicit user request on equities; save_insight is fine for analytical deliverables.

Think before you act. Plan tool calls in parallel when they are independent. Don't chain unnecessary calls.`;

const TOOLS: Anthropic.Messages.ToolUnion[] = [
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
  {
    name: "get_proposals",
    description:
      "Get currently pending trade proposals awaiting user approval. Call this before proposing a new trade to avoid duplicating an open proposal on the same symbol + side.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "propose_trade",
    description:
      "Create a new pending trade proposal. This does NOT execute the trade — it writes a row to the proposals table and the user approves or rejects it in the dashboard. Only propose trades you have analyzed with tools. Reasoning must cite specific data points.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker, uppercase",
        },
        side: {
          type: "string",
          enum: ["buy", "sell"],
          description: "buy to open a long, sell to close or short",
        },
        qty: {
          type: "number",
          description: "Number of shares (can be fractional)",
          exclusiveMinimum: 0,
        },
        order_type: {
          type: "string",
          enum: ["market", "limit"],
          description:
            "Use limit when you want price protection or when attaching stop_loss/take_profit (required for brackets).",
        },
        limit_price: {
          type: "number",
          description:
            "Required when order_type=limit. The price at which the order triggers.",
          exclusiveMinimum: 0,
        },
        stop_loss: {
          type: "number",
          description:
            "Optional. Price at which to exit if the trade goes against you. Requires order_type=limit.",
          exclusiveMinimum: 0,
        },
        take_profit: {
          type: "number",
          description:
            "Optional. Price at which to close the trade at a gain. Requires order_type=limit.",
          exclusiveMinimum: 0,
        },
        reasoning: {
          type: "string",
          description:
            "2-4 sentence thesis citing the specific tool output that justifies this trade.",
          minLength: 40,
        },
        confidence: {
          type: "number",
          description:
            "Your honest conviction 0-1. 0.5 = slight edge, 0.9 = very strong setup.",
          minimum: 0,
          maximum: 1,
        },
      },
      required: [
        "symbol",
        "side",
        "qty",
        "order_type",
        "reasoning",
        "confidence",
      ],
    },
  },
  {
    name: "save_insight",
    description:
      "Save a research insight, market note, or analysis report to the insights table. Use this instead of propose_trade when the opportunity is outside the Alpaca/US-equities execution path (e.g. Polymarket prediction markets, macro research, Finviz screens). The user reads saved insights in the dashboard and acts on them manually. Title should be terse; body can be multi-paragraph markdown.",
    input_schema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          enum: ["tradingview", "polymarket", "finviz", "chat", "other"],
          description: "Which source surfaced this insight",
        },
        kind: {
          type: "string",
          enum: ["market_insight", "research_report"],
          description:
            "market_insight for brief notes on a specific opportunity; research_report for longer multi-item analyses",
        },
        title: {
          type: "string",
          description: "Short headline, ≤120 chars",
          maxLength: 200,
        },
        body: {
          type: "string",
          description:
            "Full content. Markdown allowed. Cite data sources. Be specific.",
          minLength: 50,
        },
        symbols: {
          type: "array",
          items: { type: "string" },
          description:
            "Relevant tickers or market slugs (e.g. ['NVDA','AAPL'] or ['polymarket-will-X-happen'])",
        },
      },
      required: ["source", "kind", "title", "body"],
    },
  },
  {
    name: "finviz_screen",
    description:
      "Run a Finviz screener via the direct CSV export endpoint (free, no auth). Returns a structured list of matching equities. Use Finviz filter syntax — filters are comma-separated, each one a code like 'cap_smallover', 'sh_avgvol_o500' (avg volume > 500K), 'ta_rsi_os30' (RSI < 30), 'ta_highlow52w_nh' (near 52-week high), 'geo_usa', 'sec_technology', 'fa_div_o1' (dividend > 1%). Leave filters empty to get the top unfiltered page. Prefer this over web_search for Finviz lookups — the data is structured and reliable.",
    input_schema: {
      type: "object",
      properties: {
        filters: {
          type: "string",
          description:
            "Comma-separated Finviz filter codes, e.g. 'cap_smallover,sh_avgvol_o500,ta_rsi_os30'. Empty string for no filter.",
        },
        view: {
          type: "integer",
          description:
            "Column set: 111 overview (default, recommended), 121 performance, 151 technical, 161 valuation, 171 financial",
          enum: [111, 121, 151, 161, 171],
        },
        order: {
          type: "string",
          description:
            "Optional column to sort by, e.g. 'change' asc, '-change' desc, '-volume' desc",
        },
        limit: {
          type: "integer",
          description: "Max rows to return (default 25, max 100)",
          minimum: 1,
          maximum: 100,
        },
      },
    },
  },
  { type: "web_search_20260209", name: "web_search" },
  { type: "web_fetch_20260209", name: "web_fetch" },
];

type ToolInput = Record<string, unknown>;

type ExecContext = {
  runId: number;
  bypassWhitelist?: boolean;
};

async function executeTool(
  name: string,
  input: ToolInput,
  ctx: ExecContext
): Promise<string> {
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
    case "get_proposals": {
      const { rows } = await db.query(
        `SELECT id, symbol, side, qty, order_type, limit_price, stop_loss,
                take_profit, reasoning, confidence, status, created_at
           FROM proposals
          WHERE status = 'pending'
          ORDER BY created_at DESC`
      );
      return JSON.stringify(rows);
    }
    case "propose_trade": {
      const p = input as {
        symbol: string;
        side: "buy" | "sell";
        qty: number;
        order_type: "market" | "limit";
        limit_price?: number;
        stop_loss?: number;
        take_profit?: number;
        reasoning: string;
        confidence: number;
      };
      if (p.order_type === "limit" && p.limit_price === undefined) {
        throw new Error("limit_price is required when order_type is 'limit'");
      }
      if (
        (p.stop_loss !== undefined || p.take_profit !== undefined) &&
        p.order_type !== "limit"
      ) {
        throw new Error(
          "stop_loss and take_profit require order_type='limit' (Alpaca bracket orders need a limit parent)"
        );
      }

      const check = await validateProposal(
        {
          symbol: p.symbol,
          side: p.side,
          qty: p.qty,
          order_type: p.order_type,
          limit_price: p.limit_price,
          stop_loss: p.stop_loss,
          take_profit: p.take_profit,
        },
        { bypassWhitelist: ctx.bypassWhitelist }
      );
      if (!check.ok) {
        return JSON.stringify({
          created: false,
          rejected_by_guardrails: true,
          violations: check.violations,
          context: check.context,
          message:
            "The proposal was rejected by risk guardrails and NOT saved. Adjust the trade to satisfy the rules (usually by reducing qty, adding a stop_loss, or choosing a symbol on the watchlist) and call propose_trade again.",
        });
      }

      const { rows } = await db.query(
        `INSERT INTO proposals
           (agent_run_id, symbol, side, qty, order_type, limit_price,
            stop_loss, take_profit, reasoning, confidence, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
         RETURNING id, created_at`,
        [
          ctx.runId,
          p.symbol.toUpperCase(),
          p.side,
          p.qty,
          p.order_type,
          p.limit_price ?? null,
          p.stop_loss ?? null,
          p.take_profit ?? null,
          p.reasoning,
          p.confidence,
        ]
      );
      return JSON.stringify({
        created: true,
        proposal_id: rows[0].id,
        created_at: rows[0].created_at,
        message:
          "Proposal created. User must approve or reject in the dashboard before it executes.",
      });
    }
    case "finviz_screen": {
      const p = input as {
        filters?: string;
        view?: number;
        order?: string;
        limit?: number;
      };
      const result = await screenFinviz({
        filters: p.filters,
        view: p.view,
        order: p.order,
        limit: Math.min(p.limit ?? 25, 100),
      });
      return JSON.stringify({
        url: result.url,
        total_matches: result.raw_length,
        truncated: result.truncated,
        rows: result.rows,
      });
    }
    case "save_insight": {
      const i = input as {
        source: string;
        kind: string;
        title: string;
        body: string;
        symbols?: string[];
      };
      const { rows } = await db.query(
        `INSERT INTO insights (source, kind, agent_run_id, title, body, symbols)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
        [
          i.source,
          i.kind,
          ctx.runId,
          i.title.slice(0, 200),
          i.body,
          i.symbols ?? null,
        ]
      );
      return JSON.stringify({
        saved: true,
        insight_id: rows[0].id,
        created_at: rows[0].created_at,
        message: "Insight saved. The user can read it in the dashboard.",
      });
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
  trigger: string;
  onEvent: (event: AgentEvent) => void | Promise<void>;
  bypassWhitelist?: boolean;
};

export async function runAgent(opts: RunAgentOptions): Promise<void> {
  const { onEvent, trigger, bypassWhitelist } = opts;
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
            tool.input as ToolInput,
            { runId, bypassWhitelist }
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
