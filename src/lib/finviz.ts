import "server-only";

const BASE = "https://finviz.com/export.ashx";

export type FinvizRow = {
  no: number;
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
  [extra: string]: string | number;
};

// Parse a single CSV line, respecting quoted fields that may contain commas.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): FinvizRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) =>
    h
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
  );
  const rows: FinvizRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0 || values[0] === "") continue;
    const row: Record<string, string | number> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row as unknown as FinvizRow);
  }
  return rows;
}

export type FinvizScreenOptions = {
  filters?: string; // Finviz filter string, e.g. "cap_smallover,sh_avgvol_o500,ta_rsi_os30"
  view?: number; // Column set: 111 overview, 121 performance, 151 technical, etc.
  order?: string; // Column to order by, e.g. "-change" for desc by change
  limit?: number; // Max rows to return after parsing
};

export async function screenFinviz(
  opts: FinvizScreenOptions = {}
): Promise<{
  url: string;
  rows: FinvizRow[];
  truncated: boolean;
  raw_length: number;
}> {
  const view = opts.view ?? 111;
  const params = new URLSearchParams({
    v: String(view),
    ft: "4",
    auth: "",
  });
  if (opts.filters) params.set("f", opts.filters);
  if (opts.order) params.set("o", opts.order);

  const url = `${BASE}?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Accept: "text/csv,application/csv;q=0.9,*/*;q=0.1",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Finviz export failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`
    );
  }

  const text = await res.text();
  const allRows = parseCsv(text);
  const limit = opts.limit ?? 50;
  const rows = allRows.slice(0, limit);

  return {
    url,
    rows,
    truncated: allRows.length > rows.length,
    raw_length: allRows.length,
  };
}
