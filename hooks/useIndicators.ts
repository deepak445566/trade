"use client";

import { bollinger, ema, macd, rsi, sma, vwap, type Point } from "@/lib/indicators";
import {
  adx,
  atr,
  cci,
  donchian,
  hma,
  ichimoku,
  keltner,
  mfi,
  obv,
  psar,
  stochastic,
  stochRsi,
  supertrend,
  williamsR,
  wma,
} from "@/lib/indicators/extra";
import { INDICATOR_DEFAULTS, indicatorLabel } from "@/lib/workspace";
import type { Candle, IndicatorConfig } from "@/types";

export interface IndicatorLine {
  key: string;
  kind: "line" | "histogram";
  color: string;
  lineWidth?: 1 | 2;
  /** "dots" draws point markers only (Parabolic SAR). */
  style?: "line" | "dots";
  points: Point[];
}

export interface IndicatorOutput {
  config: IndicatorConfig;
  label: string;
  overlay: boolean;
  lines: IndicatorLine[];
  /** Horizontal guide levels for oscillators (e.g. RSI 30/70). */
  levels?: number[];
  /** Signal markers drawn on the price series (e.g. EMA cross BUY/SELL). */
  markers?: SignalMarker[];
}

export interface SignalMarker {
  time: number;
  side: "buy" | "sell";
}

export function computeIndicator(candles: Candle[], ind: IndicatorConfig): IndicatorOutput {
  const def = INDICATOR_DEFAULTS[ind.type];
  const color = ind.color ?? def.color;
  const period = ind.period ?? def.period ?? 14;
  const base = { config: ind, label: indicatorLabel(ind), overlay: def.overlay };

  switch (ind.type) {
    case "EMACROSS": {
      const fast = ema(candles, ind.period ?? 9);
      const slow = ema(candles, ind.period2 ?? 20);
      const slowByTime = new Map(slow.map((p) => [p.time, p.value]));
      const markers: SignalMarker[] = [];
      let prevDiff: number | null = null;
      for (const p of fast) {
        const s = slowByTime.get(p.time);
        if (s === undefined) continue;
        const diff = p.value - s;
        if (prevDiff !== null && prevDiff <= 0 && diff > 0) markers.push({ time: p.time, side: "buy" });
        if (prevDiff !== null && prevDiff >= 0 && diff < 0) markers.push({ time: p.time, side: "sell" });
        prevDiff = diff;
      }
      return {
        ...base,
        markers,
        lines: [
          { key: "fast", kind: "line", color, lineWidth: 2, points: fast },
          { key: "slow", kind: "line", color: "#ff9800", lineWidth: 2, points: slow },
        ],
      };
    }
    case "WMA":
      return { ...base, lines: [{ key: "wma", kind: "line", color, lineWidth: 2, points: wma(candles, period) }] };
    case "HMA":
      return { ...base, lines: [{ key: "hma", kind: "line", color, lineWidth: 2, points: hma(candles, period) }] };
    case "SUPERTREND": {
      const st = supertrend(candles, period, 3);
      return {
        ...base,
        lines: [
          { key: "up", kind: "line", color: "#089981", lineWidth: 2, points: st.up },
          { key: "down", kind: "line", color: "#f23645", lineWidth: 2, points: st.down },
        ],
      };
    }
    case "PSAR":
      return { ...base, lines: [{ key: "sar", kind: "line", style: "dots", color, points: psar(candles) }] };
    case "ICHIMOKU": {
      const ic = ichimoku(candles);
      return {
        ...base,
        lines: [
          { key: "tenkan", kind: "line", color: "#2962ff", lineWidth: 1, points: ic.tenkan },
          { key: "kijun", kind: "line", color: "#b71c1c", lineWidth: 1, points: ic.kijun },
          { key: "spanA", kind: "line", color: "#43a047", lineWidth: 1, points: ic.spanA },
          { key: "spanB", kind: "line", color: "#e53935", lineWidth: 1, points: ic.spanB },
          { key: "chikou", kind: "line", color: "#9e9e9e", lineWidth: 1, points: ic.chikou },
        ],
      };
    }
    case "KELTNER": {
      const k = keltner(candles, period);
      return {
        ...base,
        lines: [
          { key: "upper", kind: "line", color, lineWidth: 1, points: k.upper },
          { key: "middle", kind: "line", color: `${color}99`, lineWidth: 1, points: k.middle },
          { key: "lower", kind: "line", color, lineWidth: 1, points: k.lower },
        ],
      };
    }
    case "DONCHIAN": {
      const d = donchian(candles, period);
      return {
        ...base,
        lines: [
          { key: "upper", kind: "line", color, lineWidth: 1, points: d.upper },
          { key: "middle", kind: "line", color: "#ff9800", lineWidth: 1, points: d.middle },
          { key: "lower", kind: "line", color, lineWidth: 1, points: d.lower },
        ],
      };
    }
    case "STOCH": {
      const s = stochastic(candles, period);
      return {
        ...base,
        levels: [80, 20],
        lines: [
          { key: "k", kind: "line", color, lineWidth: 2, points: s.k },
          { key: "d", kind: "line", color: "#ff6d00", lineWidth: 1, points: s.d },
        ],
      };
    }
    case "STOCHRSI": {
      const s = stochRsi(candles, period, period);
      return {
        ...base,
        levels: [80, 20],
        lines: [
          { key: "k", kind: "line", color, lineWidth: 2, points: s.k },
          { key: "d", kind: "line", color: "#ff6d00", lineWidth: 1, points: s.d },
        ],
      };
    }
    case "ATR":
      return { ...base, lines: [{ key: "atr", kind: "line", color, lineWidth: 2, points: atr(candles, period) }] };
    case "ADX": {
      const a = adx(candles, period);
      return {
        ...base,
        levels: [25],
        lines: [
          { key: "adx", kind: "line", color, lineWidth: 2, points: a.adx },
          { key: "plus", kind: "line", color: "#089981", lineWidth: 1, points: a.plus },
          { key: "minus", kind: "line", color: "#f23645", lineWidth: 1, points: a.minus },
        ],
      };
    }
    case "CCI":
      return {
        ...base,
        levels: [100, -100],
        lines: [{ key: "cci", kind: "line", color, lineWidth: 2, points: cci(candles, period) }],
      };
    case "WILLR":
      return {
        ...base,
        levels: [-20, -80],
        lines: [{ key: "wr", kind: "line", color, lineWidth: 2, points: williamsR(candles, period) }],
      };
    case "MFI":
      return {
        ...base,
        levels: [80, 20],
        lines: [{ key: "mfi", kind: "line", color, lineWidth: 2, points: mfi(candles, period) }],
      };
    case "OBV":
      return { ...base, lines: [{ key: "obv", kind: "line", color, lineWidth: 2, points: obv(candles) }] };
    case "EMA":
      return { ...base, lines: [{ key: "ema", kind: "line", color, lineWidth: 2, points: ema(candles, period) }] };
    case "SMA":
      return { ...base, lines: [{ key: "sma", kind: "line", color, lineWidth: 2, points: sma(candles, period) }] };
    case "VWAP":
      return { ...base, lines: [{ key: "vwap", kind: "line", color, lineWidth: 2, points: vwap(candles) }] };
    case "BB": {
      const b = bollinger(candles, period, 2);
      return {
        ...base,
        lines: [
          { key: "upper", kind: "line", color, lineWidth: 1, points: b.upper },
          { key: "middle", kind: "line", color: `${color}99`, lineWidth: 1, points: b.middle },
          { key: "lower", kind: "line", color, lineWidth: 1, points: b.lower },
        ],
      };
    }
    case "RSI":
      return {
        ...base,
        levels: [70, 30],
        lines: [{ key: "rsi", kind: "line", color, lineWidth: 2, points: rsi(candles, period) }],
      };
    case "MACD": {
      const m = macd(candles);
      return {
        ...base,
        levels: [0],
        lines: [
          { key: "hist", kind: "histogram", color: "#26a69a", points: m.histogram },
          { key: "macd", kind: "line", color, lineWidth: 2, points: m.macd },
          { key: "signal", kind: "line", color: "#ff6d00", lineWidth: 1, points: m.signal },
        ],
      };
    }
  }
}

export function computeIndicators(candles: Candle[], indicators: IndicatorConfig[]): IndicatorOutput[] {
  return indicators.map((i) => computeIndicator(candles, i));
}

/**
 * Indicators only depend on a trailing window for the latest value, but EMA/RSI
 * are recursive — recomputing the full series is O(n) and fast enough (~1–3k
 * candles), so live ticks simply recompute and push the last point.
 */
export function useIndicators() {
  return { computeIndicators, computeIndicator };
}
