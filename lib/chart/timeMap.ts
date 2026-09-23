import type { Candle } from "@/types";

/**
 * Converts between wall-clock time and lightweight-charts "logical" bar index.
 * Inside the loaded data we interpolate between candles; outside (future /
 * before history) we extrapolate with the timeframe step. This lets drawings be
 * stored in (time, price) space and survive history prepends and reloads.
 */
export function timeToLogical(candles: Candle[], step: number, time: number): number | null {
  const n = candles.length;
  if (!n) return null;
  const first = candles[0].time;
  const last = candles[n - 1].time;
  if (time <= first) return (time - first) / step;
  if (time >= last) return n - 1 + (time - last) / step;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time <= time) lo = mid;
    else hi = mid;
  }
  const t0 = candles[lo].time;
  const t1 = candles[hi].time;
  return lo + (t1 === t0 ? 0 : (time - t0) / (t1 - t0));
}

export function logicalToTime(candles: Candle[], step: number, logical: number): number | null {
  const n = candles.length;
  if (!n) return null;
  if (logical <= 0) return candles[0].time + logical * step;
  if (logical >= n - 1) return candles[n - 1].time + (logical - (n - 1)) * step;
  const i = Math.floor(logical);
  const frac = logical - i;
  return candles[i].time + frac * (candles[i + 1].time - candles[i].time);
}
