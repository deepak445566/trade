import type { Candle } from "@/types";

/** A computed value aligned to a candle time. `null` values are warm-up gaps. */
export interface Point {
  time: number;
  value: number;
}

export function sma(candles: Candle[], period: number, src: (c: Candle) => number = (c) => c.close): Point[] {
  const out: Point[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += src(candles[i]);
    if (i >= period) sum -= src(candles[i - period]);
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

function emaValues(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period; // seed with SMA
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function ema(candles: Candle[], period: number): Point[] {
  const vals = emaValues(
    candles.map((c) => c.close),
    period,
  );
  const out: Point[] = [];
  vals.forEach((v, i) => v !== null && out.push({ time: candles[i].time, value: v }));
  return out;
}

/** Wilder's RSI. */
export function rsi(candles: Candle[], period = 14): Point[] {
  const out: Point[] = [];
  if (candles.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const val = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out.push({ time: candles[period].time, value: val() });
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out.push({ time: candles[i].time, value: val() });
  }
  return out;
}

export interface MacdResult {
  macd: Point[];
  signal: Point[];
  histogram: Point[];
}

export function macd(candles: Candle[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const closes = candles.map((c) => c.close);
  const f = emaValues(closes, fast);
  const s = emaValues(closes, slow);
  const macdLine: { i: number; v: number }[] = [];
  for (let i = 0; i < candles.length; i++) {
    const a = f[i];
    const b = s[i];
    if (a !== null && b !== null) macdLine.push({ i, v: a - b });
  }
  const sig = emaValues(
    macdLine.map((m) => m.v),
    signalPeriod,
  );
  const res: MacdResult = { macd: [], signal: [], histogram: [] };
  macdLine.forEach((m, j) => {
    const time = candles[m.i].time;
    res.macd.push({ time, value: m.v });
    const sv = sig[j];
    if (sv !== null) {
      res.signal.push({ time, value: sv });
      res.histogram.push({ time, value: m.v - sv });
    }
  });
  return res;
}

/** VWAP with a session reset at 00:00 UTC each day. */
export function vwap(candles: Candle[]): Point[] {
  const out: Point[] = [];
  let pv = 0;
  let vol = 0;
  let day = -1;
  for (const c of candles) {
    const d = Math.floor(c.time / 86400);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    out.push({ time: c.time, value: vol > 0 ? pv / vol : typical });
  }
  return out;
}

export interface BandsResult {
  upper: Point[];
  middle: Point[];
  lower: Point[];
}

export function bollinger(candles: Candle[], period = 20, mult = 2): BandsResult {
  const res: BandsResult = { upper: [], middle: [], lower: [] };
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const mean = sum / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (candles[j].close - mean) ** 2;
    const sd = Math.sqrt(sq / period);
    const time = candles[i].time;
    res.middle.push({ time, value: mean });
    res.upper.push({ time, value: mean + mult * sd });
    res.lower.push({ time, value: mean - mult * sd });
  }
  return res;
}
