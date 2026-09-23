import type { Candle } from "@/types";
import type { Point } from "./index";

/**
 * Additional classic indicators. Every function returns Point[] aligned to candle
 * times; `NaN` values mark gaps (e.g. Supertrend switching sides) and are drawn
 * as breaks in the line.
 */

type Series = (number | null)[];

const toPoints = (candles: Candle[], vals: Series, shift = 0): Point[] => {
  const out: Point[] = [];
  const step = candles.length > 1 ? candles[candles.length - 1].time - candles[candles.length - 2].time : 60;
  vals.forEach((v, i) => {
    if (v === null) return;
    const j = i + shift;
    const time = j < candles.length ? candles[j]?.time : candles[candles.length - 1].time + (j - candles.length + 1) * step;
    if (time !== undefined) out.push({ time, value: v });
  });
  return out;
};

function smaArr(v: number[], n: number): Series {
  const out: Series = new Array(v.length).fill(null);
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i];
    if (i >= n) sum -= v[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function emaArr(v: number[], n: number): Series {
  const out: Series = new Array(v.length).fill(null);
  if (v.length < n) return out;
  const k = 2 / (n + 1);
  let prev = v.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < v.length; i++) out[i] = prev = v[i] * k + prev * (1 - k);
  return out;
}

/** Wilder's smoothing (RMA), as used by ATR / RSI / ADX. */
function rmaArr(v: number[], n: number): Series {
  const out: Series = new Array(v.length).fill(null);
  if (v.length < n) return out;
  let prev = v.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < v.length; i++) out[i] = prev = (prev * (n - 1) + v[i]) / n;
  return out;
}

function wmaArr(v: number[], n: number): Series {
  const out: Series = new Array(v.length).fill(null);
  const denom = (n * (n + 1)) / 2;
  for (let i = n - 1; i < v.length; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += v[i - j] * (n - j);
    out[i] = s / denom;
  }
  return out;
}

/** Applies fn to the non-null tail of a series and re-aligns the result. */
function onDefined(v: Series, fn: (x: number[]) => Series): Series {
  const start = v.findIndex((x) => x !== null);
  if (start < 0) return v.map(() => null);
  const r = fn(v.slice(start) as number[]);
  return [...new Array(start).fill(null), ...r];
}

const trueRange = (c: Candle[]) =>
  c.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close))));

function highest(v: number[], n: number, i: number) {
  let m = -Infinity;
  for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, v[j]);
  return m;
}
function lowest(v: number[], n: number, i: number) {
  let m = Infinity;
  for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, v[j]);
  return m;
}

// ---------------- Moving averages ----------------

export const wma = (c: Candle[], n: number) => toPoints(c, wmaArr(c.map((x) => x.close), n));

export function hma(c: Candle[], n: number): Point[] {
  const close = c.map((x) => x.close);
  const half = wmaArr(close, Math.max(1, Math.round(n / 2)));
  const full = wmaArr(close, n);
  const diff: Series = half.map((h, i) => (h !== null && full[i] !== null ? 2 * h - full[i]! : null));
  return toPoints(c, onDefined(diff, (x) => wmaArr(x, Math.max(1, Math.round(Math.sqrt(n))))));
}

// ---------------- Trend overlays ----------------

export function atrArr(c: Candle[], n: number): Series {
  return rmaArr(trueRange(c), n);
}

export const atr = (c: Candle[], n: number) => toPoints(c, atrArr(c, n));

/** Supertrend (ATR period n, multiplier m): separate up-trend / down-trend lines. */
export function supertrend(c: Candle[], n = 10, m = 3): { up: Point[]; down: Point[] } {
  const a = atrArr(c, n);
  const up: Point[] = [];
  const down: Point[] = [];
  let fu = 0; // final upper band
  let fl = 0; // final lower band
  let trend = 1;
  for (let i = 0; i < c.length; i++) {
    const av = a[i];
    if (av === null) continue;
    const hl2 = (c[i].high + c[i].low) / 2;
    const bu = hl2 + m * av;
    const bl = hl2 - m * av;
    const prevClose = i > 0 ? c[i - 1].close : c[i].close;
    fu = fu === 0 || bu < fu || prevClose > fu ? bu : fu;
    fl = fl === 0 || bl > fl || prevClose < fl ? bl : fl;
    if (trend === 1 && c[i].close < fl) trend = -1;
    else if (trend === -1 && c[i].close > fu) trend = 1;
    const t = c[i].time;
    up.push({ time: t, value: trend === 1 ? fl : NaN });
    down.push({ time: t, value: trend === -1 ? fu : NaN });
  }
  return { up, down };
}

/** Parabolic SAR (step 0.02, max 0.2). */
export function psar(c: Candle[], step = 0.02, max = 0.2): Point[] {
  if (c.length < 2) return [];
  const out: Point[] = [];
  let long = c[1].close >= c[0].close;
  let sar = long ? c[0].low : c[0].high;
  let ep = long ? c[0].high : c[0].low;
  let af = step;
  for (let i = 1; i < c.length; i++) {
    sar = sar + af * (ep - sar);
    if (long) {
      sar = Math.min(sar, c[i - 1].low, i > 1 ? c[i - 2].low : c[i - 1].low);
      if (c[i].low < sar) {
        long = false;
        sar = ep;
        ep = c[i].low;
        af = step;
      } else if (c[i].high > ep) {
        ep = c[i].high;
        af = Math.min(af + step, max);
      }
    } else {
      sar = Math.max(sar, c[i - 1].high, i > 1 ? c[i - 2].high : c[i - 1].high);
      if (c[i].high > sar) {
        long = true;
        sar = ep;
        ep = c[i].high;
        af = step;
      } else if (c[i].low < ep) {
        ep = c[i].low;
        af = Math.min(af + step, max);
      }
    }
    out.push({ time: c[i].time, value: sar });
  }
  return out;
}

/** Ichimoku Kinko Hyo (9, 26, 52). Senkou spans are projected 26 bars forward, Chikou 26 back. */
export function ichimoku(c: Candle[], t = 9, k = 26, s = 52) {
  const hi = c.map((x) => x.high);
  const lo = c.map((x) => x.low);
  const mid = (n: number): Series => c.map((_, i) => (i >= n - 1 ? (highest(hi, n, i) + lowest(lo, n, i)) / 2 : null));
  const tenkan = mid(t);
  const kijun = mid(k);
  const spanA: Series = tenkan.map((v, i) => (v !== null && kijun[i] !== null ? (v + kijun[i]!) / 2 : null));
  const spanB = mid(s);
  return {
    tenkan: toPoints(c, tenkan),
    kijun: toPoints(c, kijun),
    spanA: toPoints(c, spanA, k - 1),
    spanB: toPoints(c, spanB, k - 1),
    chikou: toPoints(
      c,
      c.map((x) => x.close),
      -(k - 1),
    ).filter((p) => p.time >= c[0]?.time),
  };
}

export function keltner(c: Candle[], n = 20, m = 2, atrLen = 10) {
  const mid = emaArr(
    c.map((x) => x.close),
    n,
  );
  const a = atrArr(c, atrLen);
  return {
    middle: toPoints(c, mid),
    upper: toPoints(c, mid.map((v, i) => (v !== null && a[i] !== null ? v + m * a[i]! : null))),
    lower: toPoints(c, mid.map((v, i) => (v !== null && a[i] !== null ? v - m * a[i]! : null))),
  };
}

export function donchian(c: Candle[], n = 20) {
  const hi = c.map((x) => x.high);
  const lo = c.map((x) => x.low);
  const up: Series = c.map((_, i) => (i >= n - 1 ? highest(hi, n, i) : null));
  const dn: Series = c.map((_, i) => (i >= n - 1 ? lowest(lo, n, i) : null));
  return {
    upper: toPoints(c, up),
    lower: toPoints(c, dn),
    middle: toPoints(c, up.map((u, i) => (u !== null && dn[i] !== null ? (u + dn[i]!) / 2 : null))),
  };
}

// ---------------- Oscillators ----------------

/** Stochastic %K (smoothed) and %D. */
export function stochastic(c: Candle[], n = 14, smoothK = 3, smoothD = 3) {
  const hi = c.map((x) => x.high);
  const lo = c.map((x) => x.low);
  const raw: Series = c.map((x, i) => {
    if (i < n - 1) return null;
    const h = highest(hi, n, i);
    const l = lowest(lo, n, i);
    return h === l ? 50 : ((x.close - l) / (h - l)) * 100;
  });
  const k = onDefined(raw, (x) => smaArr(x, smoothK));
  const d = onDefined(k, (x) => smaArr(x, smoothD));
  return { k: toPoints(c, k), d: toPoints(c, d) };
}

export function stochRsi(c: Candle[], rsiLen = 14, stochLen = 14, smoothK = 3, smoothD = 3) {
  const close = c.map((x) => x.close);
  const gains = close.map((v, i) => (i === 0 ? 0 : Math.max(v - close[i - 1], 0)));
  const losses = close.map((v, i) => (i === 0 ? 0 : Math.max(close[i - 1] - v, 0)));
  const ag = rmaArr(gains.slice(1), rsiLen);
  const al = rmaArr(losses.slice(1), rsiLen);
  const rsi: Series = [null, ...ag.map((g, i) => (g === null || al[i] === null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + g / al[i]!)))];
  const raw: Series = rsi.map((v, i) => {
    if (v === null || i < stochLen - 1) return null;
    const win = rsi.slice(i - stochLen + 1, i + 1);
    if (win.some((w) => w === null)) return null;
    const h = Math.max(...(win as number[]));
    const l = Math.min(...(win as number[]));
    return h === l ? 50 : ((v - l) / (h - l)) * 100;
  });
  const k = onDefined(raw, (x) => smaArr(x, smoothK));
  const d = onDefined(k, (x) => smaArr(x, smoothD));
  return { k: toPoints(c, k), d: toPoints(c, d) };
}

/** ADX with +DI / -DI (Wilder). */
export function adx(c: Candle[], n = 14) {
  const plusDM = c.map((x, i) => {
    if (i === 0) return 0;
    const up = x.high - c[i - 1].high;
    const dn = c[i - 1].low - x.low;
    return up > dn && up > 0 ? up : 0;
  });
  const minusDM = c.map((x, i) => {
    if (i === 0) return 0;
    const up = x.high - c[i - 1].high;
    const dn = c[i - 1].low - x.low;
    return dn > up && dn > 0 ? dn : 0;
  });
  const tr = rmaArr(trueRange(c), n);
  const p = rmaArr(plusDM, n);
  const m = rmaArr(minusDM, n);
  const pdi: Series = p.map((v, i) => (v !== null && tr[i] ? (100 * v) / tr[i]! : null));
  const mdi: Series = m.map((v, i) => (v !== null && tr[i] ? (100 * v) / tr[i]! : null));
  const dx: Series = pdi.map((v, i) => (v !== null && mdi[i] !== null && v + mdi[i]! > 0 ? (100 * Math.abs(v - mdi[i]!)) / (v + mdi[i]!) : null));
  const adxS = onDefined(dx, (x) => rmaArr(x, n));
  return { adx: toPoints(c, adxS), plus: toPoints(c, pdi), minus: toPoints(c, mdi) };
}

export function cci(c: Candle[], n = 20): Point[] {
  const tp = c.map((x) => (x.high + x.low + x.close) / 3);
  const ma = smaArr(tp, n);
  return toPoints(
    c,
    tp.map((v, i) => {
      const m = ma[i];
      if (m === null) return null;
      let dev = 0;
      for (let j = i - n + 1; j <= i; j++) dev += Math.abs(tp[j] - m);
      dev /= n;
      return dev === 0 ? 0 : (v - m) / (0.015 * dev);
    }),
  );
}

export function williamsR(c: Candle[], n = 14): Point[] {
  const hi = c.map((x) => x.high);
  const lo = c.map((x) => x.low);
  return toPoints(
    c,
    c.map((x, i) => {
      if (i < n - 1) return null;
      const h = highest(hi, n, i);
      const l = lowest(lo, n, i);
      return h === l ? -50 : ((h - x.close) / (h - l)) * -100;
    }),
  );
}

export function mfi(c: Candle[], n = 14): Point[] {
  const tp = c.map((x) => (x.high + x.low + x.close) / 3);
  const flow = tp.map((v, i) => v * c[i].volume);
  return toPoints(
    c,
    c.map((_, i) => {
      if (i < n) return null;
      let pos = 0;
      let neg = 0;
      for (let j = i - n + 1; j <= i; j++) {
        if (tp[j] > tp[j - 1]) pos += flow[j];
        else if (tp[j] < tp[j - 1]) neg += flow[j];
      }
      return neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    }),
  );
}

export function obv(c: Candle[]): Point[] {
  let v = 0;
  return c.map((x, i) => {
    if (i > 0) v += x.close > c[i - 1].close ? x.volume : x.close < c[i - 1].close ? -x.volume : 0;
    return { time: x.time, value: v };
  });
}
