import "server-only";
import type { MarketFeed } from "./feed";

/**
 * Forex feed — future phase (not part of the crypto MVP).
 *
 * To activate: connect to a provider (Finnhub / Twelve Data) using FOREX_API_KEY,
 * feed each incoming tick into a `CandleAggregator` per (symbol, timeframe), and
 * forward the aggregator's events to subscribers. Nothing else in the app needs
 * to change — routing happens via the `type` field ("crypto" | "forex").
 */
export const forexFeed: MarketFeed = {
  subscribe(symbol) {
    console.warn(`[forex] feed not configured yet — ignoring subscription for ${symbol}`);
    return () => {};
  },
};
