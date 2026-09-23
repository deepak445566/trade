import {
  isTimeframe,
  type ChartConfig,
  type ChartType,
  type Drawing,
  type DrawingType,
  type IndicatorConfig,
  type IndicatorType,
  type LayoutType,
  type WorkspaceDTO,
} from "@/types";

export const MAX_CHARTS = 4;

export const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];

export const INDICATOR_DEFAULTS: Record<
  IndicatorType,
  { period?: number; period2?: number; color: string; label: string; overlay: boolean; name?: string }
> = {
  EMACROSS: { period: 9, period2: 20, color: "#00bcd4", label: "EMA Cross 9/20 + Buy/Sell signals", overlay: true, name: "EMA 9/20" },
  EMA: { period: 20, color: "#f5a623", label: "Exponential Moving Average", overlay: true },
  SMA: { period: 50, color: "#4a90e2", label: "Simple Moving Average", overlay: true },
  WMA: { period: 20, color: "#ff7043", label: "Weighted Moving Average", overlay: true },
  HMA: { period: 21, color: "#ffca28", label: "Hull Moving Average", overlay: true },
  VWAP: { color: "#bd10e0", label: "VWAP (daily session)", overlay: true },
  BB: { period: 20, color: "#26a69a", label: "Bollinger Bands (2 std dev)", overlay: true },
  SUPERTREND: { period: 10, color: "#089981", label: "Supertrend (ATR 10, x3)", overlay: true, name: "Supertrend" },
  PSAR: { color: "#ffb74d", label: "Parabolic SAR (0.02, 0.2)", overlay: true, name: "Parabolic SAR" },
  ICHIMOKU: { color: "#2962ff", label: "Ichimoku Cloud (9, 26, 52)", overlay: true, name: "Ichimoku" },
  KELTNER: { period: 20, color: "#7e57c2", label: "Keltner Channels (EMA 20, 2x ATR)", overlay: true, name: "Keltner" },
  DONCHIAN: { period: 20, color: "#29b6f6", label: "Donchian Channels", overlay: true, name: "Donchian" },
  RSI: { period: 14, color: "#ab47bc", label: "Relative Strength Index", overlay: false },
  MACD: { color: "#2962ff", label: "MACD (12, 26, 9)", overlay: false },
  STOCH: { period: 14, color: "#2962ff", label: "Stochastic (14, 3, 3)", overlay: false, name: "Stochastic" },
  STOCHRSI: { period: 14, color: "#2962ff", label: "Stochastic RSI (14, 14, 3, 3)", overlay: false, name: "Stoch RSI" },
  ATR: { period: 14, color: "#ef5350", label: "Average True Range", overlay: false },
  ADX: { period: 14, color: "#ff9800", label: "ADX / DMI (+DI, -DI)", overlay: false, name: "ADX" },
  CCI: { period: 20, color: "#26c6da", label: "Commodity Channel Index", overlay: false },
  WILLR: { period: 14, color: "#ab47bc", label: "Williams %R", overlay: false, name: "Williams %R" },
  MFI: { period: 14, color: "#66bb6a", label: "Money Flow Index", overlay: false },
  OBV: { color: "#42a5f5", label: "On-Balance Volume", overlay: false },
};

export function newId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function indicatorLabel(i: IndicatorConfig) {
  if (i.type === "EMACROSS") return `EMA ${i.period ?? 9}/${i.period2 ?? 20}`;
  const name = INDICATOR_DEFAULTS[i.type].name ?? i.type;
  return i.period ? `${name} ${i.period}` : name;
}

export function defaultChart(symbol = "BTCUSDT"): ChartConfig {
  return {
    id: newId("chart"),
    symbol,
    timeframe: "1h",
    chartType: "candles",
    indicators: [
      { id: newId("ind"), type: "EMACROSS", period: 9, period2: 20, color: INDICATOR_DEFAULTS.EMACROSS.color },
    ],
    drawings: [],
  };
}

export function defaultWorkspace(): WorkspaceDTO {
  return { name: "My Layout", layout: "1", charts: [defaultChart()] };
}

const CHART_TYPES: ChartType[] = ["candles", "bars", "line", "area"];
const IND_TYPES = Object.keys(INDICATOR_DEFAULTS) as IndicatorType[];
const DRAW_TYPES: DrawingType[] = ["trendline", "ray", "arrow", "hline", "vline", "rect", "fib", "measure", "text", "long", "short"];
const COLOR_RE = /^#[0-9a-f]{3,8}$/i;

const str = (v: unknown, max = 64) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Validates untrusted workspace JSON (from the client or DB) into a safe shape. */
export function sanitizeWorkspace(input: unknown): WorkspaceDTO {
  const o = (input ?? {}) as Record<string, unknown>;
  const layout: LayoutType = o.layout === "2" || o.layout === "4" ? o.layout : "1";
  const charts = (Array.isArray(o.charts) ? o.charts : [])
    .slice(0, MAX_CHARTS)
    .map((c) => sanitizeChart(c))
    .filter((c): c is ChartConfig => c !== null);
  return { name: str(o.name, 80) || "My Layout", layout, charts: charts.length ? charts : [defaultChart()] };
}

function sanitizeChart(input: unknown): ChartConfig | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  const symbol = str(c.symbol, 20).toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(symbol)) return null;

  const indicators = (Array.isArray(c.indicators) ? c.indicators : [])
    .slice(0, 12)
    .map((i): IndicatorConfig | null => {
      const r = (i ?? {}) as Record<string, unknown>;
      const type = r.type as IndicatorType;
      if (!IND_TYPES.includes(type)) return null;
      const period = num(r.period);
      const period2 = num(r.period2);
      return {
        id: str(r.id) || newId("ind"),
        type,
        ...(period !== null && period >= 1 && period <= 500 ? { period: Math.round(period) } : {}),
        ...(period2 !== null && period2 >= 1 && period2 <= 500 ? { period2: Math.round(period2) } : {}),
        color: COLOR_RE.test(str(r.color)) ? str(r.color) : INDICATOR_DEFAULTS[type].color,
      };
    })
    .filter((i): i is IndicatorConfig => i !== null);

  const drawings = (Array.isArray(c.drawings) ? c.drawings : [])
    .slice(0, 200)
    .map((d): Drawing | null => {
      const r = (d ?? {}) as Record<string, unknown>;
      const type = r.type as DrawingType;
      if (!DRAW_TYPES.includes(type) || !Array.isArray(r.points)) return null;
      const points = r.points
        .slice(0, 3)
        .map((p) => {
          const pp = (p ?? {}) as Record<string, unknown>;
          const time = num(pp.time);
          const price = num(pp.price);
          return time !== null && price !== null ? { time, price } : null;
        })
        .filter((p): p is { time: number; price: number } => p !== null);
      if (!points.length) return null;
      const text = str(r.text, 200);
      return {
        id: str(r.id) || newId("drw"),
        type,
        points,
        color: COLOR_RE.test(str(r.color)) ? str(r.color) : "#2962ff",
        ...(text ? { text } : {}),
      };
    })
    .filter((d): d is Drawing => d !== null);

  return {
    id: str(c.id) || newId("chart"),
    symbol,
    timeframe: isTimeframe(c.timeframe) ? c.timeframe : "1h",
    chartType: CHART_TYPES.includes(c.chartType as ChartType) ? (c.chartType as ChartType) : "candles",
    indicators,
    drawings,
  };
}
