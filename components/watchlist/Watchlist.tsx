"use client";

import { useState } from "react";
import { useLiveTicker } from "@/hooks/useWebSocket";
import { cx, formatPct, formatPrice } from "@/lib/format";
import { useAuthStore } from "@/store/authStore";
import { useMarketStore } from "@/store/marketStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import SymbolSearch from "@/components/search/SymbolSearch";

export default function Watchlist() {
  const watchlist = useMarketStore((s) => s.watchlist);
  const addSymbol = useMarketStore((s) => s.addSymbol);
  const removeSymbol = useMarketStore((s) => s.removeSymbol);
  const status = useAuthStore((s) => s.status);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (p: Promise<void>) => p.catch((e: Error) => setError(e.message));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#787b86]">Watchlist</h2>
        <button
          onClick={() => setAdding(true)}
          className="rounded px-1.5 text-lg leading-none text-[#b2b5be] hover:bg-[#2a2e39]"
          aria-label="Add symbol"
          title="Add symbol"
        >
          +
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-[#2a2e39] px-3 pb-1 text-[11px] text-[#5d606b]">
        <span>Symbol</span>
        <span className="text-right">Last</span>
        <span className="w-14 text-right">Chg%</span>
      </div>
      {error && (
        <p className="px-3 py-1 text-xs text-[#f23645]" role="alert">
          {error}
        </p>
      )}
      <ul className="flex-1 overflow-y-auto">
        {watchlist.map((w) => (
          <WatchRow key={w.symbol} symbol={w.symbol} onRemove={() => run(removeSymbol(w.symbol))} />
        ))}
        {watchlist.length === 0 && <li className="px-3 py-4 text-center text-xs text-[#787b86]">Your watchlist is empty.</li>}
      </ul>
      {status === "guest" && (
        <p className="border-t border-[#2a2e39] px-3 py-2 text-[11px] text-[#787b86]">
          Log in to save your watchlist across devices.
        </p>
      )}
      <SymbolSearch
        open={adding}
        title="Add to watchlist"
        onClose={() => setAdding(false)}
        onSelect={(s) => {
          setAdding(false);
          void run(addSymbol(s));
        }}
      />
    </div>
  );
}

function WatchRow({ symbol, onRemove }: { symbol: string; onRemove: () => void }) {
  const ticker = useLiveTicker(symbol);
  const activeChartId = useWorkspaceStore((s) => s.activeChartId);
  const activeSymbol = useWorkspaceStore((s) => s.charts.find((c) => c.id === s.activeChartId)?.symbol);
  const updateChart = useWorkspaceStore((s) => s.updateChart);
  const up = (ticker?.change ?? 0) >= 0;

  return (
    <li className="group relative">
      <button
        onClick={() => updateChart(activeChartId, { symbol })}
        className={cx(
          "grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-3 px-3 py-1.5 text-left text-sm hover:bg-[#2a2e39]",
          activeSymbol === symbol && "bg-[#2962ff]/10",
        )}
      >
        <span className="truncate font-medium text-[#d1d4dc]">{symbol}</span>
        <span className="text-right tabular-nums text-[#d1d4dc]">{ticker ? formatPrice(ticker.price) : "…"}</span>
        <span className={cx("w-14 text-right text-xs tabular-nums", up ? "text-[#089981]" : "text-[#f23645]")}>
          {ticker ? formatPct(ticker.change) : ""}
        </span>
      </button>
      <button
        onClick={onRemove}
        className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded bg-[#2a2e39] px-1.5 text-xs text-[#787b86] hover:text-[#f23645] group-hover:block"
        aria-label={`Remove ${symbol}`}
      >
        ✕
      </button>
    </li>
  );
}
