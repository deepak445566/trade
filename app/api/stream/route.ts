import type { NextRequest } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { getFeed } from "@/lib/server/services/feed";
import { onUserEvent } from "@/lib/server/services/hub";
import { ensureAlertEngine } from "@/lib/server/alertEngine";
import { isTimeframe, type CandleEvent } from "@/types";

/**
 * Live market stream over Server-Sent Events.
 *
 *   GET /api/stream?subs=BTCUSDT:1m,ETHUSDT:1h&token=<access token>
 *
 * Events:
 *   candle:update   { symbol, timeframe, candle }  — live forming candle
 *   candle:closed   { symbol, timeframe, candle }  — finalized candle
 *   alert:triggered { alertId, symbol, price, ... } — only when a valid token is sent
 *   trade:update    { trade, account, kind }        — paper trading fills/closes (authenticated)
 *
 * One connection per browser tab carries every chart's subscriptions; the client
 * reopens it whenever its subscription set changes.
 */
// Vercel ends a function at its max duration; EventSource then reconnects automatically.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const subs = (req.nextUrl.searchParams.get("subs") ?? "")
    .split(",")
    .map((s) => s.trim().split(":"))
    .filter(([sym, tf]) => /^[A-Z0-9]{3,20}$/.test(sym ?? "") && isTimeframe(tf))
    .slice(0, 50) as [string, CandleEvent["timeframe"]][];

  const userId = await getUserId(req);
  if (userId) ensureAlertEngine();

  const encoder = new TextEncoder();
  const cleanups: (() => void)[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          close();
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        cleanups.forEach((fn) => fn());
        try {
          controller.close();
        } catch {}
      };

      controller.enqueue(encoder.encode(`retry: 3000\n\n`));
      send("ready", { subs: subs.map(([s, t]) => `${s}:${t}`), authenticated: !!userId });

      for (const [symbol, tf] of subs) {
        const feed = await getFeed("crypto", symbol);
        if (closed) break;
        cleanups.push(
          feed.subscribe(symbol, tf, (e) =>
            send(e.closed ? "candle:closed" : "candle:update", {
              symbol: e.symbol,
              timeframe: e.timeframe,
              candle: e.candle,
              eventTime: e.eventTime,
            }),
          ),
        );
      }
      if (userId) cleanups.push(onUserEvent(userId, (event, data) => send(event, data)));

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          close();
        }
      }, 15_000);
      cleanups.push(() => clearInterval(heartbeat));

      req.signal.addEventListener("abort", close);
    },
    cancel() {
      cleanups.forEach((fn) => fn());
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
