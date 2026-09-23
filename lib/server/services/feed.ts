import "server-only";
import { resolveMarket } from "@/lib/markets";
import type { CandleEvent, MarketType, Timeframe } from "@/types";

export type CandleListener = (event: CandleEvent) => void;

/** Every market data provider implements this, so new markets plug in without touching the rest. */
export interface MarketFeed {
  subscribe(symbol: string, timeframe: Timeframe, listener: CandleListener): () => void;
}

/** Routes a symbol to its provider: forex → forexFeed (future), metals → Binance futures, else Binance spot. */
export async function getFeed(type: MarketType, symbol: string): Promise<MarketFeed> {
  if (type === "forex") return (await import("./forexFeed")).forexFeed;
  const feeds = await import("./binanceFeed");
  return resolveMarket(symbol).venue === "futures" ? feeds.futuresFeed : feeds.spotFeed;
}
