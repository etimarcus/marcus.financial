import "server-only";

const TRADING_BASE =
  process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
const DATA_BASE = "https://data.alpaca.markets";

export type AlpacaAccount = {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  buying_power: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
};

export type AlpacaPosition = {
  symbol: string;
  qty: string;
  side: "long" | "short";
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  change_today: string;
};

export type AlpacaClock = {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
};

function headers() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) {
    throw new Error("ALPACA_API_KEY and ALPACA_API_SECRET must be set");
  }
  return {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
  };
}

async function tradingGet<T>(path: string): Promise<T> {
  const res = await fetch(`${TRADING_BASE}${path}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

async function tradingPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${TRADING_BASE}${path}`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Alpaca POST ${path} failed: ${res.status} ${errBody}`);
  }
  return res.json() as Promise<T>;
}

async function dataGet<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}${path}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca data ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export function getAccount() {
  return tradingGet<AlpacaAccount>("/v2/account");
}

export function getPositions() {
  return tradingGet<AlpacaPosition[]>("/v2/positions");
}

export function getClock() {
  return tradingGet<AlpacaClock>("/v2/clock");
}

export type AlpacaBar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export function getBars(
  symbol: string,
  timeframe: string,
  limit = 100
): Promise<{ bars: AlpacaBar[] }> {
  const params = new URLSearchParams({
    timeframe,
    limit: String(limit),
  });
  return dataGet(`/v2/stocks/${encodeURIComponent(symbol)}/bars?${params}`);
}

export type AlpacaNewsArticle = {
  id: number;
  headline: string;
  summary: string;
  author: string;
  created_at: string;
  updated_at: string;
  url: string;
  symbols: string[];
  source: string;
};

export function getNews(
  symbols: string[],
  limit = 20
): Promise<{ news: AlpacaNewsArticle[] }> {
  const params = new URLSearchParams({
    symbols: symbols.join(","),
    limit: String(limit),
    sort: "desc",
  });
  return dataGet(`/v1beta1/news?${params}`);
}

export type AlpacaOrder = {
  id: string;
  client_order_id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: string;
  filled_qty: string;
  type: string;
  time_in_force: string;
  limit_price: string | null;
  status: string;
  submitted_at: string;
  filled_at: string | null;
  filled_avg_price: string | null;
};

export type CreateOrderParams = {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type: "market" | "limit";
  limit_price?: number;
  stop_loss?: number;
  take_profit?: number;
  time_in_force?: "day" | "gtc";
};

export function createOrder(params: CreateOrderParams): Promise<AlpacaOrder> {
  const body: Record<string, unknown> = {
    symbol: params.symbol.toUpperCase(),
    qty: String(params.qty),
    side: params.side,
    type: params.type,
    time_in_force: params.time_in_force ?? "day",
  };
  if (params.type === "limit") {
    if (params.limit_price === undefined) {
      throw new Error("limit_price is required for limit orders");
    }
    body.limit_price = String(params.limit_price);
  }
  const hasStop = params.stop_loss !== undefined;
  const hasTake = params.take_profit !== undefined;
  if (hasStop || hasTake) {
    if (params.type !== "limit") {
      throw new Error(
        "Alpaca bracket orders require a limit parent order. Use type=limit with limit_price when attaching stop_loss or take_profit."
      );
    }
    body.order_class = "bracket";
    if (hasStop) body.stop_loss = { stop_price: String(params.stop_loss) };
    if (hasTake) body.take_profit = { limit_price: String(params.take_profit) };
  }
  return tradingPost<AlpacaOrder>("/v2/orders", body);
}
