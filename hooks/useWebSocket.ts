"use client";

import { useEffect, useState } from "react";
import { getStream, type StreamStatus } from "@/lib/streamClient";
import type { Candle } from "@/types";

/**
 * Live-connection hooks. The transport is Server-Sent Events served by the
 * Next.js route handler at /api/stream (route handlers can't host a WebSocket
 * server) — the event names match the spec's WebSocket events.
 */
export function useStreamStatus(): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("idle");
  useEffect(() => getStream().onStatus(setStatus), []);
  return status;
}

/** Live 24h-style ticker built from the daily candle: last price + change vs. today's open. */
export function useLiveTicker(symbol: string) {
  const [state, setState] = useState<{ symbol: string; candle: Candle } | null>(null);
  useEffect(() => getStream().subscribe(symbol, "1d", (e) => setState({ symbol, candle: e.candle })), [symbol]);
  const candle = state?.symbol === symbol ? state.candle : null;
  if (!candle) return null;
  return {
    price: candle.close,
    change: candle.open ? ((candle.close - candle.open) / candle.open) * 100 : 0,
  };
}

/** Live last prices for several symbols (from their daily candles). */
export function useLivePrices(symbols: string[]): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const key = [...new Set(symbols)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    const unsubs = key.split(",").map((sym) =>
      getStream().subscribe(sym, "1d", (e) =>
        setPrices((p) => (p[sym] === e.candle.close ? p : { ...p, [sym]: e.candle.close })),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [key]);
  return prices;
}
