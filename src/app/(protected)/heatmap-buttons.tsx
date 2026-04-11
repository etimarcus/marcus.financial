"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type HeatmapKind = "stocks" | "crypto";

const CONFIG: Record<
  HeatmapKind,
  { script: string; label: string; widget: Record<string, unknown> }
> = {
  stocks: {
    label: "Market heatmap",
    script:
      "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js",
    widget: {
      exchanges: [],
      dataSource: "SPX500",
      grouping: "sector",
      blockSize: "market_cap_basic",
      blockColor: "change",
      locale: "en",
      symbolUrl: "",
      colorTheme: "dark",
      hasTopBar: false,
      isDataSetEnabled: false,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      width: "100%",
      height: "100%",
    },
  },
  crypto: {
    label: "Crypto heatmap",
    script:
      "https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js",
    widget: {
      dataSource: "Crypto",
      blockSize: "market_cap_calc",
      blockColor: "change",
      locale: "en",
      symbolUrl: "",
      colorTheme: "dark",
      hasTopBar: false,
      isDataSetEnabled: false,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      width: "100%",
      height: "100%",
    },
  },
};

export function HeatmapButtons() {
  const [open, setOpen] = useState<HeatmapKind | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const modal = open ? <HeatmapModal kind={open} onClose={() => setOpen(null)} /> : null;

  return (
    <>
      <button
        onClick={() => setOpen("stocks")}
        aria-label="Market heatmap"
        className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 text-accent-light hover:bg-accent/20 hover:border-accent/50 px-3 py-1.5 text-xs font-medium transition-colors"
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
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
        <span>Stocks</span>
      </button>

      <button
        onClick={() => setOpen("crypto")}
        aria-label="Crypto heatmap"
        className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 text-accent-light hover:bg-accent/20 hover:border-accent/50 px-3 py-1.5 text-xs font-medium transition-colors"
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
          <path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727" />
        </svg>
        <span>Crypto</span>
      </button>

      {mounted && modal && createPortal(modal, document.body)}
    </>
  );
}

function HeatmapModal({
  kind,
  onClose,
}: {
  kind: HeatmapKind;
  onClose: () => void;
}) {
  const cfg = CONFIG[kind];

  const srcDoc = useMemo(
    () => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; background: #07090d; }
  .tradingview-widget-container, .tradingview-widget-container__widget { height: 100%; width: 100%; }
</style>
</head>
<body>
<div class="tradingview-widget-container">
  <div class="tradingview-widget-container__widget"></div>
  <script type="text/javascript" src="${cfg.script}" async>
  ${JSON.stringify(cfg.widget)}
  </script>
</div>
</body>
</html>`,
    [cfg]
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full h-full max-w-6xl max-h-[85vh] rounded-2xl border border-white/[0.08] bg-[#07090d] shadow-[0_0_60px_-15px_rgba(86,118,220,0.35)] overflow-hidden"
      >
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-white/10 bg-black/40 hover:bg-black/60 text-zinc-400 hover:text-zinc-100 p-1.5 transition-colors"
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
        </div>
        <iframe
          title={cfg.label}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}
