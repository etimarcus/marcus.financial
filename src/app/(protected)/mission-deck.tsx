"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Tile = {
  symbol: string;
  label: string;
  group: "equity" | "macro" | "fx" | "commodity" | "crypto";
};

const TILES: Tile[] = [
  { symbol: "FOREXCOM:SPXUSD", label: "S&P 500", group: "equity" },
  { symbol: "FOREXCOM:NSXUSD", label: "Nasdaq 100", group: "equity" },
  { symbol: "FOREXCOM:DJI", label: "Dow 30", group: "equity" },
  { symbol: "TVC:RUT", label: "Russell 2K", group: "equity" },
  { symbol: "CAPITALCOM:VIX", label: "VIX", group: "macro" },
  { symbol: "TVC:DXY", label: "DXY", group: "macro" },
  { symbol: "TVC:US10Y", label: "US 10Y", group: "macro" },
  { symbol: "TVC:US02Y", label: "US 2Y", group: "macro" },
  { symbol: "FX_IDC:USDJPY", label: "USD/JPY", group: "fx" },
  { symbol: "FX_IDC:USDCNH", label: "USD/CNH", group: "fx" },
  { symbol: "OANDA:XAUUSD", label: "Gold", group: "commodity" },
  { symbol: "TVC:USOIL", label: "WTI Crude", group: "commodity" },
  { symbol: "AMEX:BDRY", label: "Dry Bulk Shipping", group: "commodity" },
  { symbol: "BINANCE:BTCUSDT", label: "BTC", group: "crypto" },
  { symbol: "BINANCE:ETHUSDT", label: "ETH", group: "crypto" },
];

const GROUP_ACCENT: Record<Tile["group"], string> = {
  equity: "#5676dc",
  macro: "#f2d66a",
  fx: "#4fd1c5",
  commodity: "#e6a855",
  crypto: "#7b94e5",
};

const CANDLE_UP = "#5676dc";
const CANDLE_DOWN = "#f2d66a";

const TICKER_TAPE_CONFIG = {
  symbols: [
    { proName: "FOREXCOM:SPXUSD", title: "SPX" },
    { proName: "FOREXCOM:NSXUSD", title: "NDX" },
    { proName: "FOREXCOM:DJI", title: "DJI" },
    { proName: "TVC:RUT", title: "RUT" },
    { proName: "CAPITALCOM:VIX", title: "VIX" },
    { proName: "TVC:DXY", title: "DXY" },
    { proName: "TVC:US10Y", title: "US10Y" },
    { proName: "TVC:US02Y", title: "US2Y" },
    { proName: "FX_IDC:USDJPY", title: "USD/JPY" },
    { proName: "FX_IDC:USDCNH", title: "USD/CNH" },
    { proName: "OANDA:XAUUSD", title: "Gold" },
    { proName: "OANDA:XAGUSD", title: "Silver" },
    { proName: "TVC:USOIL", title: "WTI" },
    { proName: "TVC:UKOIL", title: "Brent" },
    { proName: "AMEX:BDRY", title: "Shipping" },
    { proName: "BINANCE:BTCUSDT", title: "BTC" },
    { proName: "BINANCE:ETHUSDT", title: "ETH" },
    { proName: "BINANCE:SOLUSDT", title: "SOL" },
  ],
  showSymbolLogo: true,
  colorTheme: "dark",
  isTransparent: true,
  displayMode: "adaptive",
  locale: "en",
};

function buildSrcDoc(scriptUrl: string, config: unknown): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; background: transparent; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  .tradingview-widget-container, .tradingview-widget-container__widget { height: 100%; width: 100%; }
</style>
</head>
<body>
<div class="tradingview-widget-container">
  <div class="tradingview-widget-container__widget"></div>
  <script type="text/javascript" src="${scriptUrl}" async>
  ${JSON.stringify(config)}
  </script>
</div>
</body>
</html>`;
}

function buildTileChartDoc(tile: Tile): string {
  return buildSrcDoc(
    "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js",
    {
      symbols: [[tile.label, `${tile.symbol}|1D`]],
      chartOnly: false,
      width: "100%",
      height: "100%",
      locale: "en",
      colorTheme: "dark",
      autosize: true,
      showVolume: false,
      hideDateRanges: true,
      hideMarketStatus: true,
      hideSymbolLogo: true,
      scalePosition: "right",
      scaleMode: "Normal",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
      fontSize: "10",
      noTimeScale: true,
      valuesTracking: "1",
      changeMode: "price-and-percent",
      chartType: "candlesticks",
      upColor: CANDLE_UP,
      downColor: CANDLE_DOWN,
      borderUpColor: CANDLE_UP,
      borderDownColor: CANDLE_DOWN,
      wickUpColor: CANDLE_UP,
      wickDownColor: CANDLE_DOWN,
      isTransparent: true,
    }
  );
}

function buildAdvancedChartDoc(symbol: string): string {
  return buildSrcDoc(
    "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js",
    {
      autosize: true,
      symbol,
      interval: "D",
      timezone: "America/New_York",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: true,
      calendar: false,
      hide_side_toolbar: false,
      studies: ["Volume@tv-basicstudies", "MACD@tv-basicstudies"],
      support_host: "https://www.tradingview.com",
      overrides: {
        "mainSeriesProperties.candleStyle.upColor": CANDLE_UP,
        "mainSeriesProperties.candleStyle.downColor": CANDLE_DOWN,
        "mainSeriesProperties.candleStyle.borderUpColor": CANDLE_UP,
        "mainSeriesProperties.candleStyle.borderDownColor": CANDLE_DOWN,
        "mainSeriesProperties.candleStyle.wickUpColor": CANDLE_UP,
        "mainSeriesProperties.candleStyle.wickDownColor": CANDLE_DOWN,
      },
    }
  );
}

export function MissionDeck() {
  const [openTile, setOpenTile] = useState<Tile | null>(null);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenTile(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const tickerDoc = useMemo(
    () =>
      buildSrcDoc(
        "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js",
        TICKER_TAPE_CONFIG
      ),
    []
  );

  const clockStr = now
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now)
    : "--:--:--";

  return (
    <>
      <section>
        <div className="relative rounded-2xl border border-[#f2d66a]/25 bg-gradient-to-b from-zinc-900/70 to-zinc-950/70 backdrop-blur overflow-hidden shadow-[0_0_60px_-20px_rgba(242,214,106,0.25)]">
          {/* corner brackets */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 w-3 h-3 border-t border-l border-[#f2d66a]/60"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 w-3 h-3 border-t border-r border-[#f2d66a]/60"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[#f2d66a]/60"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[#f2d66a]/60"
          />

          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f2d66a] shadow-[0_0_8px_rgba(242,214,106,0.9)] animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#f2d66a] font-semibold">
                Markets Deck
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                · live
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-3 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#5676dc] shadow-[0_0_6px_rgba(86,118,220,0.8)]" />
                  Equity
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#f2d66a] shadow-[0_0_6px_rgba(242,214,106,0.8)]" />
                  Macro
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4fd1c5] shadow-[0_0_6px_rgba(79,209,197,0.8)]" />
                  FX
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#e6a855] shadow-[0_0_6px_rgba(230,168,85,0.8)]" />
                  Commodity
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#7b94e5] shadow-[0_0_6px_rgba(123,148,229,0.8)]" />
                  Crypto
                </span>
              </div>
              <span className="text-[10px] font-mono tabular-nums text-zinc-400">
                {clockStr}{" "}
                <span className="text-zinc-600">ET</span>
              </span>
            </div>
          </div>

          <div className="h-[54px] border-b border-white/[0.06]">
            <iframe
              title="Ticker tape"
              srcDoc={tickerDoc}
              sandbox="allow-scripts allow-same-origin allow-popups"
              className="w-full h-full border-0 block"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-px bg-white/[0.04]">
            {TILES.map((tile) => {
              const accent = GROUP_ACCENT[tile.group];
              return (
                <button
                  key={tile.symbol}
                  onClick={() => setOpenTile(tile)}
                  className="relative bg-[#07090d] hover:bg-white/[0.015] transition-colors text-left group"
                  style={{
                    height: 160,
                    boxShadow: `inset 0 2px 0 0 ${accent}`,
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute top-1.5 right-1.5 z-10 h-1 w-1 rounded-full pointer-events-none"
                    style={{
                      backgroundColor: accent,
                      boxShadow: `0 0 6px ${accent}, 0 0 12px ${accent}80`,
                    }}
                  />
                  <iframe
                    title={tile.label}
                    srcDoc={buildTileChartDoc(tile)}
                    sandbox="allow-scripts allow-same-origin allow-popups"
                    className="w-full h-full border-0 block pointer-events-none"
                  />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {mounted &&
        openTile &&
        createPortal(
          <TileModal tile={openTile} onClose={() => setOpenTile(null)} />,
          document.body
        )}
    </>
  );
}

function TileModal({ tile, onClose }: { tile: Tile; onClose: () => void }) {
  const srcDoc = useMemo(
    () => buildAdvancedChartDoc(tile.symbol),
    [tile.symbol]
  );
  const accent = GROUP_ACCENT[tile.group];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full h-full max-w-[1400px] max-h-[90vh] rounded-2xl border bg-[#07090d] overflow-hidden flex flex-col"
        style={{
          borderColor: `${accent}55`,
          boxShadow: `0 0 60px -15px ${accent}55`,
        }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: accent,
                boxShadow: `0 0 8px ${accent}`,
              }}
            />
            <h2
              className="text-sm font-semibold uppercase tracking-[0.15em]"
              style={{ color: accent }}
            >
              {tile.label}
            </h2>
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
              {tile.symbol}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-white/10 bg-black/40 hover:bg-black/60 text-zinc-400 hover:text-zinc-100 p-1.5 transition-colors"
          >
            <svg
              width="16"
              height="16"
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
        </div>
        <div className="flex-1 min-h-0">
          <iframe
            title={tile.label}
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
