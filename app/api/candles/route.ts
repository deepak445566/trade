import { route, HttpError } from "@/lib/server/http";
import { connectDB } from "@/lib/server/db";
import { CandleModel } from "@/lib/server/models/Candle";
import { fetchKlines } from "@/lib/server/services/binanceRest";
import { isTimeframe, TIMEFRAME_SECONDS, type Candle } from "@/types";

/**
 * GET /api/candles?symbol=BTCUSDT&tf=1h&limit=500&to=<unix sec>&from=<unix sec>
 * Historical candles from Binance REST. Closed candles are cached in MongoDB
 * (best effort) and served from the cache if Binance is unreachable.
 */
export const GET = route(
  async (req) => {
    const sp = req.nextUrl.searchParams;
    const symbol = (sp.get("symbol") ?? "").toUpperCase();
    const tf = sp.get("tf");
    const limit = Math.min(Math.max(Number(sp.get("limit")) || 500, 1), 1000);
    const to = sp.get("to") ? Number(sp.get("to")) : undefined;
    const from = sp.get("from") ? Number(sp.get("from")) : undefined;

    if (!/^[A-Z0-9]{3,20}$/.test(symbol)) throw new HttpError(400, "Invalid symbol");
    if (!isTimeframe(tf)) throw new HttpError(400, "Invalid timeframe");

    try {
      const candles = await fetchKlines(symbol, tf, { limit, endTime: to, startTime: from });
      void cacheCandles(symbol, tf, candles);
      return Response.json({ symbol, timeframe: tf, candles });
    } catch (err) {
      const reason = (err as Error).message;
      console.warn("[candles] upstream failed, trying cache:", reason);
      const cached = await readCache(symbol, tf, limit, to).catch(() => []);
      if (!cached.length) {
        const blocked = reason.includes("451");
        throw new HttpError(
          502,
          blocked
            ? "Market data unavailable: Binance blocks this server's region (deploy functions outside the US)"
            : "Market data unavailable",
        );
      }
      return Response.json({ symbol, timeframe: tf, candles: cached, cached: true });
    }
  },
  { db: false },
);

async function cacheCandles(symbol: string, tf: string, candles: Candle[]) {
  try {
    await connectDB();
    const now = Date.now() / 1000;
    const closed = candles.filter((c) => c.time + TIMEFRAME_SECONDS[tf as keyof typeof TIMEFRAME_SECONDS] <= now);
    if (!closed.length) return;
    await CandleModel.bulkWrite(
      closed.map((c) => ({
        updateOne: {
          filter: { symbol, timeframe: tf, timestamp: c.time },
          update: { $set: { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (err) {
    console.warn("[candles] cache write failed", (err as Error).message);
  }
}

async function readCache(symbol: string, tf: string, limit: number, to?: number): Promise<Candle[]> {
  await connectDB();
  const rows = await CandleModel.find({ symbol, timeframe: tf, ...(to ? { timestamp: { $lte: to } } : {}) })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
  return rows.reverse().map((r) => ({
    time: r.timestamp,
    open: r.open ?? 0,
    high: r.high ?? 0,
    low: r.low ?? 0,
    close: r.close ?? 0,
    volume: r.volume ?? 0,
  }));
}
