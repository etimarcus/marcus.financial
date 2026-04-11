"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const TICKER_TAPE_CONFIG = {
  symbols: [
    { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
    { proName: "FOREXCOM:NSXUSD", title: "Nasdaq 100" },
    { proName: "FOREXCOM:DJI", title: "Dow 30" },
    { description: "Russell 2000", proName: "TVC:RUT" },
    { description: "VIX", proName: "CAPITALCOM:VIX" },
    { description: "DXY", proName: "TVC:DXY" },
    { description: "US 10Y", proName: "TVC:US10Y" },
    { description: "Gold", proName: "OANDA:XAUUSD" },
    { description: "WTI", proName: "TVC:USOIL" },
    { description: "BTC", proName: "BINANCE:BTCUSDT" },
    { description: "ETH", proName: "BINANCE:ETHUSDT" },
  ],
  showSymbolLogo: true,
  colorTheme: "dark",
  isTransparent: true,
  displayMode: "adaptive",
  locale: "en",
};

const MARKET_OVERVIEW_CONFIG = {
  colorTheme: "dark",
  dateRange: "12M",
  showChart: true,
  locale: "en",
  largeChartUrl: "",
  isTransparent: true,
  showSymbolLogo: true,
  showFloatingTooltip: false,
  width: "100%",
  height: "100%",
  plotLineColorGrowing: "rgba(86, 118, 220, 1)",
  plotLineColorFalling: "rgba(242, 84, 91, 1)",
  gridLineColor: "rgba(240, 243, 250, 0.06)",
  scaleFontColor: "rgba(171, 172, 179, 1)",
  belowLineFillColorGrowing: "rgba(86, 118, 220, 0.12)",
  belowLineFillColorFalling: "rgba(242, 84, 91, 0.12)",
  belowLineFillColorGrowingBottom: "rgba(86, 118, 220, 0)",
  belowLineFillColorFallingBottom: "rgba(242, 84, 91, 0)",
  symbolActiveColor: "rgba(86, 118, 220, 0.12)",
  tabs: [
    {
      title: "Indices",
      symbols: [
        { s: "FOREXCOM:SPXUSD", d: "S&P 500" },
        { s: "FOREXCOM:NSXUSD", d: "Nasdaq 100" },
        { s: "FOREXCOM:DJI", d: "Dow 30" },
        { s: "TVC:RUT", d: "Russell 2000" },
        { s: "CAPITALCOM:VIX", d: "VIX" },
      ],
      originalTitle: "Indices",
    },
    {
      title: "Commodities",
      symbols: [
        { s: "OANDA:XAUUSD", d: "Gold" },
        { s: "TVC:USOIL", d: "WTI Crude" },
        { s: "OANDA:XAGUSD", d: "Silver" },
        { s: "TVC:DXY", d: "DXY" },
      ],
      originalTitle: "Commodities",
    },
    {
      title: "Bonds",
      symbols: [
        { s: "TVC:US02Y", d: "US 2Y" },
        { s: "TVC:US10Y", d: "US 10Y" },
        { s: "TVC:US30Y", d: "US 30Y" },
      ],
      originalTitle: "Bonds",
    },
    {
      title: "Crypto",
      symbols: [
        { s: "BINANCE:BTCUSDT", d: "Bitcoin" },
        { s: "BINANCE:ETHUSDT", d: "Ethereum" },
        { s: "BINANCE:SOLUSDT", d: "Solana" },
      ],
      originalTitle: "Crypto",
    },
  ],
};

const EVENTS_CONFIG = {
  colorTheme: "dark",
  isTransparent: true,
  width: "100%",
  height: "100%",
  locale: "en",
  importanceFilter: "0,1",
  countryFilter: "us,eu,gb,cn,jp",
};

function buildSrcDoc(scriptUrl: string, config: unknown): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; background: transparent; color: #e4e4e7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
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

export function MissionControl() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const modal = open ? <MissionControlModal onClose={() => setOpen(false)} /> : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Mission Control"
        className="flex items-center gap-2 rounded-lg border border-[#f2d66a]/40 bg-[#f2d66a]/10 text-[#f2d66a] hover:bg-[#f2d66a]/20 hover:border-[#f2d66a]/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors shadow-[0_0_16px_-4px_rgba(242,214,106,0.35)]"
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
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
        <span>Mission Control</span>
      </button>

      {mounted && modal && createPortal(modal, document.body)}
    </>
  );
}

function MissionControlModal({ onClose }: { onClose: () => void }) {
  const tickerTapeDoc = useMemo(
    () =>
      buildSrcDoc(
        "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js",
        TICKER_TAPE_CONFIG
      ),
    []
  );
  const marketOverviewDoc = useMemo(
    () =>
      buildSrcDoc(
        "https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js",
        MARKET_OVERVIEW_CONFIG
      ),
    []
  );
  const eventsDoc = useMemo(
    () =>
      buildSrcDoc(
        "https://s3.tradingview.com/external-embedding/embed-widget-events.js",
        EVENTS_CONFIG
      ),
    []
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 md:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full h-full max-w-[1400px] max-h-[92vh] rounded-2xl border border-[#f2d66a]/30 bg-[#07090d] shadow-[0_0_60px_-15px_rgba(242,214,106,0.35)] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f2d66a"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#f2d66a]">
              Mission Control
            </h2>
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

        <div className="flex-shrink-0 h-[72px] border-b border-white/[0.06]">
          <iframe
            title="Ticker tape"
            srcDoc={tickerTapeDoc}
            sandbox="allow-scripts allow-same-origin allow-popups"
            className="h-full w-full border-0"
          />
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-0 min-h-0">
          <div className="lg:col-span-2 min-h-0 border-b lg:border-b-0 lg:border-r border-white/[0.06]">
            <iframe
              title="Market overview"
              srcDoc={marketOverviewDoc}
              sandbox="allow-scripts allow-same-origin allow-popups"
              className="h-full w-full border-0"
            />
          </div>
          <div className="min-h-0">
            <iframe
              title="Economic calendar"
              srcDoc={eventsDoc}
              sandbox="allow-scripts allow-same-origin allow-popups"
              className="h-full w-full border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
