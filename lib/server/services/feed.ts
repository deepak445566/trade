import "server-only";
import { resolveMarket } from "@/lib/markets";
import { bucketStart, COMPOSITE_TIMEFRAMES, type Candle, type CandleEvent, type MarketType, type Timeframe } from "@/types";

export type CandleListener = (event: CandleEvent) => void;

/** Every market data provider implements this, so new markets plug in without touching the rest. */
export interface MarketFeed {
  subscribe(symbol: string, timeframe: Timeframe, listener: CandleListener): () => void;
}

/** Routes a symbol to its provider: forex → forexFeed (future), metals → Binance futures, else Binance spot. */
export async function getFeed(type: MarketType, symbol: string): Promise<MarketFeed> {
  if (type === "forex") return withComposites((await import("./forexFeed")).forexFeed);
  const feeds = await import("./binanceFeed");
  return withComposites(resolveMarket(symbol).venue === "futures" ? feeds.futuresFeed : feeds.spotFeed);
}

/**
 * Adds timeframes the provider doesn't stream natively (10m, 45m, 3h, 1y): it
 * subscribes to the base timeframe and merges base candles into the composite
 * one. The candles already closed in the current bucket are seeded from REST so
 * the forming candle's open/high/low are right from the first update.
 */
function withComposites(feed: MarketFeed): MarketFeed {
  return {
    subscribe(symbol, timeframe, listener) {
      const comp = COMPOSITE_TIMEFRAMES[timeframe];
      if (!comp) return feed.subscribe(symbol, timeframe, listener);

      let bucket = 0;
      const parts = new Map<number, Candle>(); // base candles in the current bucket, by open time
      let active = true;

      const emit = (eventTime?: number) => {
        const list = [...parts.values()].sort((a, b) => a.time - b.time);
        if (!list.length) return;
        listener({
          symbol,
          timeframe,
          closed: false,
          eventTime,
          candle: {
            time: bucket,
            open: list[0].open,
            high: Math.max(...list.map((c) => c.high)),
            low: Math.min(...list.map((c) => c.low)),
            close: list[list.length - 1].close,
            volume: list.reduce((s, c) => s + c.volume, 0),
          },
        });
      };

      const seed = async (b: number) => {
        try {
          const { fetchKlines } = await import("./binanceRest");
          const base = await fetchKlines(symbol, comp.base, { startTime: b, limit: comp.factor });
          if (!active || b !== bucket) return;
          for (const c of base) if (bucketStart(timeframe, c.time) === b && !parts.has(c.time)) parts.set(c.time, c);
          emit();
        } catch {
          // live updates still work; only the bucket's earlier part is missing
        }
      };

      const unsub = feed.subscribe(symbol, comp.base, (e) => {
        const b = bucketStart(timeframe, e.candle.time);
        if (b > bucket) {
          bucket = b;
          parts.clear();
          void seed(b);
        } else if (b < bucket) return;
        parts.set(e.candle.time, e.candle);
        emit(e.eventTime);
      });

      return () => {
        active = false;
        unsub();
      };
    },
  };
}
