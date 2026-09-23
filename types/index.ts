// Shared types used by both the Next.js route handlers (backend) and the client UI.

export type MarketType = "crypto" | "forex";

export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
};

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1W",
};

export function isTimeframe(v: unknown): v is Timeframe {
  return typeof v === "string" && (TIMEFRAMES as readonly string[]).includes(v);
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
