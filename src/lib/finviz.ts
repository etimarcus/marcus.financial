import "server-only";

// Finviz disabled the free CSV export endpoint (now redirects to /elite).
// The public HTML screener page is still free, so we scrape it. The markup is
// regular enough that a small regex pass is sufficient; no HTML parser lib.
const BASE = "https://finviz.com/screener.ashx";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type FinvizRow = {
  ticker: string;
  company: string;
  sector: string;
  industry: string;
  country: string;
  market_cap: string;
  pe: string;
  price: string;
  change: string;
  volume: string;
};

export type FinvizScreenOptions = {
  filters?: string; // Comma-separated Finviz filter codes, e.g. "cap_smallover,ta_rsi_os30"
  order?: string; // Column to sort by, e.g. "-change" desc
  limit?: number; // Max rows to return (cap 40)
};

const ROW_REGEX = /<tr class="styled-row[^>]*>([\s\S]*?)<\/tr>/g;
const ANCHOR_REGEX = /<a [^>]*>([\s\S]*?)<\/a>/g;
const TAG_REGEX = /<[^>]*>/g;
const TICKER_ATTR = /data-boxover-ticker="([^"]+)"/;
const COMPANY_ATTR = /data-boxover-company="([^"]+)"/;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseRow(rowHtml: string): FinvizRow | null {
  const tickerMatch = rowHtml.match(TICKER_ATTR);
  const companyMatch = rowHtml.match(COMPANY_ATTR);

  // Collect the visible text of each <a> cell in order. The overview view
  // (v=111) yields: [#, ticker, company, sector, industry, country, mkt cap,
  // P/E, price, change, volume].
  const cells: string[] = [];
  let m: RegExpExecArray | null;
  ANCHOR_REGEX.lastIndex = 0;
  while ((m = ANCHOR_REGEX.exec(rowHtml)) !== null) {
    const text = decodeEntities(m[1].replace(TAG_REGEX, "")).trim();
    if (text.length > 0) cells.push(text);
  }

  if (cells.length < 3) return null;

  return {
    ticker: tickerMatch?.[1] ?? cells[1] ?? "",
    company: decodeEntities(companyMatch?.[1] ?? cells[2] ?? ""),
    sector: cells[3] ?? "",
    industry: cells[4] ?? "",
    country: cells[5] ?? "",
    market_cap: cells[6] ?? "",
    pe: cells[7] ?? "",
    price: cells[8] ?? "",
    change: cells[9] ?? "",
    volume: cells[10] ?? "",
  };
}

export async function screenFinviz(
  opts: FinvizScreenOptions = {}
): Promise<{
  url: string;
  rows: FinvizRow[];
  truncated: boolean;
  raw_length: number;
}> {
  const params = new URLSearchParams({ v: "111", ft: "4" });
  if (opts.filters) params.set("f", opts.filters);
  if (opts.order) params.set("o", opts.order);

  const url = `${BASE}?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "manual",
    cache: "no-store",
  });

  console.log(
    `[finviz_screen] url=${url} status=${res.status}`
  );

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location") ?? "?";
    throw new Error(
      `Finviz redirected ${res.status} → ${loc}. This typically means the caller's IP is being served the paid /elite page. Try web_fetch on the same URL as a fallback — server-side fetches from Anthropic's infra usually succeed where Vercel datacenter IPs get blocked.`
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Finviz screener failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`
    );
  }

  const html = await res.text();
  const rows: FinvizRow[] = [];
  let match: RegExpExecArray | null;
  ROW_REGEX.lastIndex = 0;
  while ((match = ROW_REGEX.exec(html)) !== null) {
    const row = parseRow(match[1]);
    if (row && row.ticker) rows.push(row);
  }

  console.log(
    `[finviz_screen] html_length=${html.length} rows_parsed=${rows.length}`
  );

  if (rows.length === 0) {
    // Heuristic: the genuine "no matches" page is ~50-80KB. If we got a big
    // HTML with no rows matching our regex, Finviz likely changed the
    // markup OR served a different page (login wall, paywall, captcha).
    // Tell the caller to retry via web_fetch which runs from Anthropic's
    // infra rather than the caller's server.
    const headline = html.slice(0, 500).replace(/\s+/g, " ").trim();
    throw new Error(
      `Finviz screener returned 0 rows (html=${html.length} bytes). The caller's IP may be seeing a login/paywall/captcha version of the page instead of the data table. Try web_fetch on the same URL as a fallback. HTML head: "${headline.slice(0, 200)}"`
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 40);
  const sliced = rows.slice(0, limit);

  return {
    url,
    rows: sliced,
    truncated: rows.length > sliced.length,
    raw_length: rows.length,
  };
}
