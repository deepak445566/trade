/**
 * Market registry shared by server and client.
 *
 * Most symbols are Binance spot pairs. Metals (XAUUSD / XAGUSD) come from
 * Binance USDⓈ-M futures "TradFi perpetuals" (XAUUSDT / XAGUSDT) — also free,
 * no API key — and are exposed under their familiar forex-style names.
 */
export type Venue = "spot" | "futures";

export interface MarketDef {
  symbol: string; // what users see / store
  upstream: string; // Binance symbol
  venue: Venue;
  baseAsset: string;
  quoteAsset: string;
  description: string;
}

export const SPECIAL_MARKETS: Record<string, MarketDef> = {
  XAUUSD: {
    symbol: "XAUUSD",
    upstream: "XAUUSDT",
    venue: "futures",
    baseAsset: "XAU",
    quoteAsset: "USD",
    description: "Gold / US Dollar",
  },
  XAGUSD: {
    symbol: "XAGUSD",
    upstream: "XAGUSDT",
    venue: "futures",
    baseAsset: "XAG",
    quoteAsset: "USD",
    description: "Silver / US Dollar",
  },
};

export function resolveMarket(symbol: string): { venue: Venue; upstream: string } {
  const s = SPECIAL_MARKETS[symbol.toUpperCase()];
  return s ? { venue: s.venue, upstream: s.upstream } : { venue: "spot", upstream: symbol.toUpperCase() };
}

export function exchangeLabel(symbol: string): string {
  return SPECIAL_MARKETS[symbol.toUpperCase()] ? "Binance Futures" : "Binance";
}
