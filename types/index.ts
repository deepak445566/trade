// Shared types used by both the Next.js route handlers (backend) and the client UI.

export type MarketType = "crypto" | "forex";

export const TIMEFRAMES = [
  "1m",
  "5m",
  "10m",
  "15m",
  "30m",
  "45m",
  "1h",
  "2h",
  "3h",
  "4h",
  "1d",
  "1w",
  "1M",
  "1y",
] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/** Nominal candle length. Month/year are calendar-based — use candleEnd() for exact boundaries. */
export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "10m": 600,
  "15m": 900,
  "30m": 1800,
  "45m": 2700,
  "1h": 3600,
  "2h": 7200,
  "3h": 10800,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
  "1M": 2629746, // average month
  "1y": 31556952, // average year
};

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "10m": "10m",
  "15m": "15m",
  "30m": "30m",
  "45m": "45m",
  "1h": "1H",
  "2h": "2H",
  "3h": "3H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1W",
  "1M": "1M",
  "1y": "1Y",
};

export const TIMEFRAME_GROUPS: { label: string; items: Timeframe[] }[] = [
  { label: "Minutes", items: ["1m", "5m", "10m", "15m", "30m", "45m"] },
  { label: "Hours", items: ["1h", "2h", "3h", "4h"] },
  { label: "Days", items: ["1d", "1w", "1M", "1y"] },
];

/**
 * Timeframes Binance doesn't provide natively are built by merging `factor`
 * candles of a native `base` timeframe (history on the server, live in the feed).
 */
export const COMPOSITE_TIMEFRAMES: Partial<Record<Timeframe, { base: Timeframe; factor: number }>> = {
  "10m": { base: "5m", factor: 2 },
  "45m": { base: "15m", factor: 3 },
  "3h": { base: "1h", factor: 3 },
  "1y": { base: "1M", factor: 12 },
};

export function isTimeframe(v: unknown): v is Timeframe {
  return typeof v === "string" && (TIMEFRAMES as readonly string[]).includes(v);
}

const WEEK_OFFSET = 4 * 86400; // weekly candles open Monday 00:00 UTC (the epoch was a Thursday)

/** Open time (unix seconds, UTC) of the candle containing `sec`. */
export function bucketStart(tf: Timeframe, sec: number): number {
  if (tf === "1M" || tf === "1y") {
    const d = new Date(sec * 1000);
    return Date.UTC(d.getUTCFullYear(), tf === "1y" ? 0 : d.getUTCMonth(), 1) / 1000;
  }
  const size = TIMEFRAME_SECONDS[tf];
  const off = tf === "1w" ? WEEK_OFFSET : 0;
  return Math.floor((sec - off) / size) * size + off;
}

/** Close time (unix seconds) of the candle that opened at `start`. */
export function candleEnd(tf: Timeframe, start: number): number {
  if (tf === "1M" || tf === "1y") {
    const d = new Date(start * 1000);
    return tf === "1y"
      ? Date.UTC(d.getUTCFullYear() + 1, 0, 1) / 1000
      : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
  }
  return start + TIMEFRAME_SECONDS[tf];
}

/** Common OHLCV format. `time` is the candle open time in UNIX seconds (UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleEvent {
  symbol: string;
  timeframe: Timeframe;
  candle: Candle;
  closed: boolean;
  /** Upstream (exchange) event time in ms — used by clients to sync their clock. */
  eventTime?: number;
}

export type ChartType = "candles" | "bars" | "line" | "area";

export type IndicatorType =
  // overlays
  | "EMACROSS"
  | "EMA"
  | "SMA"
  | "WMA"
  | "HMA"
  | "VWAP"
  | "BB"
  | "SUPERTREND"
  | "PSAR"
  | "ICHIMOKU"
  | "KELTNER"
  | "DONCHIAN"
  // oscillators (own pane)
  | "RSI"
  | "MACD"
  | "STOCH"
  | "STOCHRSI"
  | "ATR"
  | "ADX"
  | "CCI"
  | "WILLR"
  | "MFI"
  | "OBV";

export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  period?: number;
  /** Second period (slow EMA for EMACROSS). */
  period2?: number;
  color?: string;
}

export type DrawingType =
  | "trendline"
  | "ray"
  | "arrow"
  | "hline"
  | "vline"
  | "rect"
  | "fib"
  | "measure"
  | "text"
  | "long"
  | "short";

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  /** trendline/rect/...: 2 points; hline/vline/text: 1; long/short: [entry, target, stop]. */
  points: DrawingPoint[];
  color: string;
  text?: string;
}

export type LayoutType = "1" | "2" | "4";

export interface ChartConfig {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  chartType: ChartType;
  indicators: IndicatorConfig[];
  drawings: Drawing[];
}

export interface WorkspaceDTO {
  name: string;
  layout: LayoutType;
  charts: ChartConfig[];
  updatedAt?: string;
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  plan: "free" | "pro";
}

export interface WatchlistItem {
  symbol: string;
  type: MarketType;
}

export type AlertCondition = "price_above" | "price_below" | "crosses";

export interface AlertDTO {
  id: string;
  symbol: string;
  type: MarketType;
  condition: AlertCondition;
  targetPrice: number;
  status: "active" | "triggered";
  notifyVia: ("push" | "email")[];
  createdAt: string;
  triggeredAt?: string;
  triggeredPrice?: number;
}

export interface AlertTriggeredEvent {
  alertId: string;
  symbol: string;
  price: number;
  condition: AlertCondition;
  targetPrice: number;
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  type: MarketType;
  description?: string;
  exchange?: string;
}

// ---------- Paper (dummy) trading ----------

export type TradeSide = "long" | "short";
export type TradeStatus = "pending" | "open" | "closed" | "cancelled";
export type CloseReason = "tp" | "sl" | "manual" | "liquidation";

export interface PaperTradeDTO {
  id: string;
  symbol: string;
  side: TradeSide;
  orderType: "market" | "limit";
  qty: number;
  leverage: number;
  limitPrice?: number;
  entryPrice?: number;
  sl?: number;
  tp?: number;
  status: TradeStatus;
  exitPrice?: number;
  pnl?: number;
  closeReason?: CloseReason;
  createdAt: string;
  openedAt?: string;
  closedAt?: string;
}

export interface PaperAccountDTO {
  balance: number;
  startingBalance: number;
}

export interface TradeUpdateEvent {
  trade: PaperTradeDTO;
  account: PaperAccountDTO;
  kind: "filled" | "closed" | "updated";
}
