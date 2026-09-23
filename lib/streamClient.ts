"use client";

import { useAuthStore } from "@/store/authStore";
import type { AlertTriggeredEvent, CandleEvent, Timeframe, TradeUpdateEvent } from "@/types";

type CandleHandler = (e: CandleEvent) => void;
type AlertHandler = (e: AlertTriggeredEvent) => void;
export type StreamStatus = "idle" | "connecting" | "open" | "error";

/**
 * Single Server-Sent Events connection shared by every chart / watchlist row in
 * the tab. Subscriptions are ref-counted; when the set changes the connection is
 * reopened (debounced) with the new `subs` list.
 */
class StreamClient {
  private es: EventSource | null = null;
  private handlers = new Map<string, Set<CandleHandler>>(); // "SYMBOL:tf" -> handlers
  private alertHandlers = new Set<AlertHandler>();
  private tradeHandlers = new Set<(e: TradeUpdateEvent) => void>();
  private statusHandlers = new Set<(s: StreamStatus) => void>();
  private reopenTimer: ReturnType<typeof setTimeout> | null = null;
  private openKey = "";
  status: StreamStatus = "idle";

  constructor() {
    if (typeof window === "undefined") return;
    // Reconnect with the right token when the user logs in/out.
    let lastToken = useAuthStore.getState().user?.id ?? null;
    useAuthStore.subscribe((s) => {
      const id = s.user?.id ?? null;
      if (id !== lastToken) {
        lastToken = id;
        this.openKey = "";
        this.scheduleReopen();
      }
    });
  }

  subscribe(symbol: string, timeframe: Timeframe, handler: CandleHandler): () => void {
    const key = `${symbol}:${timeframe}`;
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
      this.scheduleReopen();
    }
    set.add(handler);
    return () => {
      const s = this.handlers.get(key);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) {
        this.handlers.delete(key);
        this.scheduleReopen();
      }
    };
  }

  onAlert(handler: AlertHandler) {
    this.alertHandlers.add(handler);
    return () => void this.alertHandlers.delete(handler);
  }

  onTrade(handler: (e: TradeUpdateEvent) => void) {
    this.tradeHandlers.add(handler);
    return () => void this.tradeHandlers.delete(handler);
  }

  onStatus(handler: (s: StreamStatus) => void) {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => void this.statusHandlers.delete(handler);
  }

  private setStatus(s: StreamStatus) {
    this.status = s;
    this.statusHandlers.forEach((h) => h(s));
  }

  private scheduleReopen() {
    if (this.reopenTimer) clearTimeout(this.reopenTimer);
    this.reopenTimer = setTimeout(() => this.reopen(), 120);
  }

  private reopen() {
    this.reopenTimer = null;
    const subs = [...this.handlers.keys()].sort().join(",");
    const { accessToken } = useAuthStore.getState();
    const key = `${subs}|${accessToken ? "auth" : "anon"}`;
    if (key === this.openKey && this.es && this.es.readyState !== EventSource.CLOSED) return;

    this.es?.close();
    this.es = null;
    this.openKey = key;
    if (!subs && !accessToken) {
      this.setStatus("idle");
      return;
    }

    const q = new URLSearchParams({ subs });
    if (accessToken) q.set("token", accessToken);
    const es = new EventSource(`/api/stream?${q}`);
    this.es = es;
    this.setStatus("connecting");

    const onCandle = (closed: boolean) => (ev: MessageEvent) => {
      const data = JSON.parse(ev.data) as Omit<CandleEvent, "closed">;
      if (data.eventTime) clock.sample(data.eventTime);
      this.handlers.get(`${data.symbol}:${data.timeframe}`)?.forEach((h) => h({ ...data, closed }));
    };
    es.addEventListener("candle:update", onCandle(false));
    es.addEventListener("candle:closed", onCandle(true));
    es.addEventListener("alert:triggered", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as AlertTriggeredEvent;
      this.alertHandlers.forEach((h) => h(data));
    });
    es.addEventListener("trade:update", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as TradeUpdateEvent;
      this.tradeHandlers.forEach((h) => h(data));
    });
    es.addEventListener("ready", (ev) => {
      this.setStatus("open");
      // An auto-reconnect reuses the original URL; if its token has expired the
      // server treats us as anonymous (no alerts) — refresh and reopen.
      const { authenticated } = JSON.parse((ev as MessageEvent).data) as { authenticated: boolean };
      const auth = useAuthStore.getState();
      if (!authenticated && auth.status === "authenticated") {
        void auth.refresh().then(() => {
          this.openKey = "";
          this.scheduleReopen();
        });
      }
    });
    es.onerror = () => {
      if (this.es !== es) return;
      this.setStatus("error");
      // EventSource retries on its own; if the token expired, refresh then reopen.
      if (es.readyState === EventSource.CLOSED) {
        this.openKey = "";
        const auth = useAuthStore.getState();
        (auth.accessToken ? auth.refresh() : Promise.resolve(null)).finally(() =>
          setTimeout(() => this.scheduleReopen(), 2000),
        );
      }
    };
  }
}

/**
 * Estimates the offset between this device's clock and the exchange clock from
 * event timestamps, so candle countdowns are right even if the PC clock is off.
 * sample = offset - latency, so the max of recent samples ≈ true offset.
 */
const clock = {
  samples: [] as number[],
  offset: 0,
  sample(eventTime: number) {
    this.samples.push(eventTime - Date.now());
    if (this.samples.length > 60) this.samples.shift();
    this.offset = Math.max(...this.samples);
  },
};

/** Current time in ms according to the exchange (falls back to local time). */
export function serverNow() {
  return Date.now() + clock.offset;
}

let instance: StreamClient | null = null;
export function getStream(): StreamClient {
  instance ??= new StreamClient();
  return instance;
}
