import "server-only";
import { env } from "../env";
import { resolveMarket } from "@/lib/markets";
import { bucketStart, type Candle, type CandleEvent, type Timeframe } from "@/types";
import type { MarketFeed, CandleListener } from "./feed";

const TRADE_EMIT_MS = 150; // max ~7 updates/sec per stream from trades
const STALE_MS = 15_000; // no message for this long while subscribed → force reconnect


interface StreamState {
  symbol: string;
  timeframe: Timeframe;
  last: CandleEvent | null;
  lastTradeMs: number;
  emitTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * One shared upstream connection to Binance's combined stream endpoint.
 *
 * For every `symbol@kline_tf` that has listeners we also subscribe
 * `symbol@aggTrade`: kline messages only arrive every ~2s, so trades are merged
 * into the forming candle for sub-second (TradingView-like) updates. The kline
 * message stays authoritative for OHLCV.
 *
 * Streams are reference counted with a grace period before UNSUBSCRIBE so SSE
 * clients that reconnect don't cause churn.
 */
class BinanceFeed implements MarketFeed {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<CandleListener>>(); // kline stream -> listeners
  private state = new Map<string, StreamState>(); // kline stream -> state (kept during grace)
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private upstream = new Set<string>(); // streams subscribed upstream
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 500;
  private msgId = 1;
  private lastMessageAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  private urlIndex = 0;
  private openedOnce = false;

  /** @param wsBases candidate endpoints; rotates to the next one if a connection fails before opening. */
  constructor(
    private wsBases: string[],
    private name: string,
  ) {}

  subscribe(symbol: string, timeframe: Timeframe, listener: CandleListener): () => void {
    // Display symbols (e.g. XAUUSD) map to their Binance upstream symbol (XAUUSDT).
    const stream = `${resolveMarket(symbol).upstream.toLowerCase()}@kline_${timeframe}`;
    let set = this.listeners.get(stream);
    if (!set) {
      set = new Set();
      this.listeners.set(stream, set);
    }
    set.add(listener);
    if (!this.state.has(stream)) {
      this.state.set(stream, { symbol: symbol.toUpperCase(), timeframe, last: null, lastTradeMs: 0, emitTimer: null });
    }
    const grace = this.graceTimers.get(stream);
    if (grace) {
      clearTimeout(grace);
      this.graceTimers.delete(stream);
    }
    this.scheduleFlush();

    // Replay the most recent candle so a new subscriber renders instantly.
    const last = this.state.get(stream)?.last;
    if (last) queueMicrotask(() => listener(last));

    return () => {
      const s = this.listeners.get(stream);
      if (!s) return;
      s.delete(listener);
      if (s.size > 0) return;
      this.listeners.delete(stream);
      this.graceTimers.set(
        stream,
        setTimeout(() => {
          this.graceTimers.delete(stream);
          if (this.listeners.has(stream)) return;
          const st = this.state.get(stream);
          if (st?.emitTimer) clearTimeout(st.emitTimer);
          this.state.delete(stream);
          this.scheduleFlush();
        }, 30_000),
      );
    };
  }

  /** Every stream we want upstream: klines in use (or in grace) + one aggTrade per symbol. */
  private desired(): Set<string> {
    const out = new Set<string>();
    for (const stream of this.state.keys()) {
      out.add(stream);
      out.add(`${stream.split("@")[0]}@aggTrade`);
    }
    return out;
  }

  /** Binance allows ~5 control messages/sec — batch changes into one message each way. */
  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 200);
  }

  private flush() {
    const want = this.desired();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (want.size) this.connect();
      return;
    }
    if (want.size === 0) {
      this.ws.close();
      return;
    }
    const sub = [...want].filter((s) => !this.upstream.has(s));
    const unsub = [...this.upstream].filter((s) => !want.has(s));
    if (sub.length) {
      sub.forEach((s) => this.upstream.add(s));
      this.ws.send(JSON.stringify({ method: "SUBSCRIBE", params: sub, id: this.msgId++ }));
    }
    if (unsub.length) {
      unsub.forEach((s) => this.upstream.delete(s));
      this.ws.send(JSON.stringify({ method: "UNSUBSCRIBE", params: unsub, id: this.msgId++ }));
    }
  }

  private connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;
    const base = this.wsBases[this.urlIndex % this.wsBases.length];
    this.openedOnce = false;
    const ws = new WebSocket(`${base}/stream`);
    this.ws = ws;

    ws.onopen = () => {
      this.openedOnce = true;
      this.reconnectDelay = 500;
      this.lastMessageAt = Date.now();
      this.upstream.clear();
      this.flush();
    };

    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
        if (!msg.stream || !msg.data) return;
        if (msg.data.e === "kline") this.onKline(msg.stream, msg.data);
        else if (msg.data.e === "aggTrade") this.onTrade(msg.data);
      } catch (err) {
        console.error("[binance] bad message", err);
      }
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.upstream.clear();
      if (this.desired().size === 0) return;
      if (!this.openedOnce && this.wsBases.length > 1) this.urlIndex++; // e.g. geo-blocked → try the mirror
      console.warn(`[${this.name}] disconnected — reconnecting in ${this.reconnectDelay}ms`);
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 5_000);
    };

    ws.onerror = () => {
      // onclose follows and handles the reconnect.
    };

    // Binance sockets occasionally stall without closing — detect and reconnect.
    this.watchdog ??= setInterval(() => {
      const cur = this.ws;
      if (cur && cur.readyState === WebSocket.OPEN && this.upstream.size && Date.now() - this.lastMessageAt > STALE_MS) {
        console.warn(`[${this.name}] stream stalled — forcing reconnect`);
        cur.close();
      }
    }, 5_000);
  }

  private onKline(stream: string, d: { E: number; s: string; k: Record<string, string | number | boolean> }) {
    const st = this.state.get(stream);
    if (!st) return;
    const k = d.k;
    const candle: Candle = {
      time: Math.floor(Number(k.t) / 1000),
      open: +k.o,
      high: +k.h,
      low: +k.l,
      close: +k.c,
      volume: +k.v,
    };
    // Trades newer than this kline snapshot were already applied — don't step the price back.
    const prev = st.last?.candle;
    if (!k.x && prev && prev.time === candle.time && st.lastTradeMs > d.E) {
      candle.close = prev.close;
      candle.high = Math.max(candle.high, prev.high);
      candle.low = Math.min(candle.low, prev.low);
      candle.volume = Math.max(candle.volume, prev.volume);
    }
    this.emit(stream, st, { symbol: st.symbol, timeframe: st.timeframe, candle, closed: !!k.x, eventTime: d.E }, true);
  }

  private onTrade(d: { E: number; s: string; p: string; q: string; T: number }) {
    const prefix = `${d.s.toLowerCase()}@kline_`;
    const price = +d.p;
    const qty = +d.q;
    const sec = Math.floor(d.T / 1000);
    for (const [stream, st] of this.state) {
      if (!stream.startsWith(prefix) || !st.last) continue;
      const c = st.last.candle;
      const bucket = bucketStart(st.timeframe, sec);
      let next: Candle;
      if (bucket === c.time) {
        next = { ...c, high: Math.max(c.high, price), low: Math.min(c.low, price), close: price, volume: c.volume + qty };
      } else if (bucket > c.time) {
        next = { time: bucket, open: price, high: price, low: price, close: price, volume: qty };
      } else continue;
      st.lastTradeMs = d.T;
      this.emit(stream, st, { symbol: st.symbol, timeframe: st.timeframe, candle: next, closed: false, eventTime: d.E }, false);
    }
  }

  /** Klines emit immediately; trade-driven updates are coalesced to TRADE_EMIT_MS. */
  private emit(stream: string, st: StreamState, event: CandleEvent, immediate: boolean) {
    st.last = event;
    const send = () => {
      st.emitTimer = null;
      const ev = st.last;
      if (!ev) return;
      this.listeners.get(stream)?.forEach((l) => {
        try {
          l(ev);
        } catch (err) {
          console.error("[binance] listener error", err);
        }
      });
    };
    if (immediate) {
      if (st.emitTimer) clearTimeout(st.emitTimer);
      send();
    } else if (!st.emitTimer) {
      st.emitTimer = setTimeout(send, TRADE_EMIT_MS);
    }
  }
}

// Singletons on globalThis (shared across dev hot-reloads and server bundles), keyed by URL.
const g = globalThis as unknown as { __tcFeeds?: Map<string, BinanceFeed> };
const feeds = (g.__tcFeeds ??= new Map());
function feedFor(urls: string[], name: string): BinanceFeed {
  const key = urls.join("|");
  let f = feeds.get(key);
  if (!f) {
    f = new BinanceFeed(urls, name);
    feeds.set(key, f);
  }
  return f;
}

/** Spot: primary endpoint, then Binance's public market-data mirror (not geo-restricted). */
export const spotFeed: MarketFeed = feedFor(
  [...new Set([env.BINANCE_WS_URL, "wss://data-stream.binance.vision"])],
  "binance",
);
/** USDⓈ-M futures market-data route (klines/aggTrades are served under /market). */
export const futuresFeed: MarketFeed = feedFor([env.BINANCE_FUTURES_WS_URL], "binance-futures");
