import "server-only";
import { env } from "../env";
import { SPECIAL_MARKETS, resolveMarket } from "@/lib/markets";
import type { Candle, SymbolInfo, Timeframe } from "@/types";

/**
 * Binance blocks some server regions (e.g. US datacenters return HTTP 451).
 * Spot market data is also served by data-api.binance.vision, which is not
 * geo-restricted, so it is used as a fallback. Futures (XAU/XAG) have no such
 * mirror; deploy the functions in a non-US region (see vercel.json).
 */
const SPOT_BASES = () => [...new Set([env.BINANCE_REST_URL, "https://data-api.binance.vision"])];
const FUTURES_BASES = () => [env.BINANCE_FUTURES_REST_URL];

async function binanceGet(bases: string[], path: string, params: URLSearchParams, timeoutMs = 10_000) {
  const errors: string[] = [];
  for (const base of bases) {
    const url = new URL(path, base);
    url.search = params.toString();
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      const body = await res.text().catch(() => "");
      errors.push(`${url.host} ${res.status}${res.status === 451 ? " (blocked in this server region)" : ""}: ${body.slice(0, 120)}`);
      if (res.status === 400) break; // bad symbol/params: another host won't help
    } catch (err) {
      errors.push(`${url.host}: ${(err as Error).message}`);
    }
  }
  throw new Error(`Binance ${path} failed — ${errors.join(" | ")}`);
}

export async function fetchKlines(
  symbol: string,
  timeframe: Timeframe,
  opts: { limit?: number; endTime?: number; startTime?: number } = {},
): Promise<Candle[]> {
  const { venue, upstream } = resolveMarket(symbol);
  const params = new URLSearchParams({ symbol: upstream, interval: timeframe, limit: String(Math.min(opts.limit ?? 500, 1000)) });
  if (opts.endTime) params.set("endTime", String(opts.endTime * 1000));
  if (opts.startTime) params.set("startTime", String(opts.startTime * 1000));

  const res =
    venue === "futures"
      ? await binanceGet(FUTURES_BASES(), "/fapi/v1/klines", params)
      : await binanceGet(SPOT_BASES(), "/api/v3/klines", params);
  const rows = (await res.json()) as [number, string, string, string, string, string][];
  return rows.map((r) => ({
    time: Math.floor(r[0] / 1000),
    open: +r[1],
    high: +r[2],
    low: +r[3],
    close: +r[4],
    volume: +r[5],
  }));
}

const g = globalThis as unknown as { __tcSymbols2?: { at: number; list: SymbolInfo[] } };
const SYMBOL_TTL = 6 * 60 * 60 * 1000;

export async function getSymbols(): Promise<SymbolInfo[]> {
  if (g.__tcSymbols2 && Date.now() - g.__tcSymbols2.at < SYMBOL_TTL) return g.__tcSymbols2.list;

  const res = await binanceGet(
    SPOT_BASES(),
    "/api/v3/exchangeInfo",
    new URLSearchParams({ permissions: "SPOT", symbolStatus: "TRADING" }),
    15_000,
  );
  const data = (await res.json()) as { symbols: { symbol: string; baseAsset: string; quoteAsset: string }[] };
  const metals: SymbolInfo[] = Object.values(SPECIAL_MARKETS).map((m) => ({
    symbol: m.symbol,
    baseAsset: m.baseAsset,
    quoteAsset: m.quoteAsset,
    type: "crypto",
    description: m.description,
    exchange: "Binance Futures",
  }));
  const list: SymbolInfo[] = [
    ...metals,
    ...data.symbols.map((s): SymbolInfo => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      type: "crypto",
      exchange: "Binance",
    })),
  ];
  g.__tcSymbols2 = { at: Date.now(), list };
  return list;
}

const QUOTE_RANK: Record<string, number> = { USD: 0, USDT: 0, USDC: 1, FDUSD: 2, BTC: 3, ETH: 4 };

export async function searchSymbols(q: string, limit = 30): Promise<SymbolInfo[]> {
  const all = await getSymbols();
  const query = q.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const scored = all
    .map((s) => {
      let score: number;
      if (!query) score = s.quoteAsset === "USDT" ? 0 : 99;
      else if (s.symbol === query) score = 0;
      else if (s.baseAsset === query) score = 1;
      else if (s.symbol.startsWith(query)) score = 2;
      else if (s.baseAsset.includes(query)) score = 3;
      else if (s.symbol.includes(query)) score = 4;
      else if (s.description?.toUpperCase().includes(query)) score = 3; // "GOLD", "SILVER"
      else return null;
      return { s, score: score * 10 + (QUOTE_RANK[s.quoteAsset] ?? 9) };
    })
    .filter((x): x is { s: SymbolInfo; score: number } => x !== null);

  if (!query) {
    const popular = ["XAU", "XAG", "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT", "TRX", "TON", "LTC", "SUI", "PEPE"];
    return popular
      .map((b) => all.find((s) => s.baseAsset === b && (s.quoteAsset === "USDT" || s.quoteAsset === "USD")))
      .filter((s): s is SymbolInfo => !!s)
      .slice(0, limit);
  }

  return scored
    .sort((a, b) => a.score - b.score || a.s.symbol.localeCompare(b.s.symbol))
    .slice(0, limit)
    .map((x) => x.s);
}
