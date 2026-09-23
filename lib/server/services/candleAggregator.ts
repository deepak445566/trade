import type { Candle, CandleEvent, Timeframe } from "@/types";
import { TIMEFRAME_SECONDS } from "@/types";

/**
 * Builds OHLCV candles from raw ticks. Binance already streams klines, so the
 * crypto feed does not need it; tick-only providers (forex) will.
 */
export class CandleAggregator {
  private current: Candle | null = null;

  constructor(
    private symbol: string,
    private timeframe: Timeframe,
    private emit: (e: CandleEvent) => void,
  ) {}

  /** @param ts tick time in unix seconds */
  addTick(price: number, volume: number, ts: number) {
    const size = TIMEFRAME_SECONDS[this.timeframe];
    // Weekly candles align to Monday 00:00 UTC (epoch was a Thursday).
    const offset = this.timeframe === "1w" ? 4 * 86400 : 0;
    const bucket = Math.floor((ts - offset) / size) * size + offset;

    if (this.current && bucket > this.current.time) {
      this.emit({ symbol: this.symbol, timeframe: this.timeframe, candle: this.current, closed: true });
      this.current = null;
    }
    if (!this.current) {
      this.current = { time: bucket, open: price, high: price, low: price, close: price, volume: 0 };
    }
    const c = this.current;
    c.high = Math.max(c.high, price);
    c.low = Math.min(c.low, price);
    c.close = price;
    c.volume += volume;
    this.emit({ symbol: this.symbol, timeframe: this.timeframe, candle: { ...c }, closed: false });
  }
}
