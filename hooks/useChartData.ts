"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getStream } from "@/lib/streamClient";
import type { Candle, Timeframe } from "@/types";

export type DataChange =
  | { kind: "reset" }
  | { kind: "prepend"; added: number }
  | { kind: "update"; candle: Candle; isNew: boolean };

interface Options {
  symbol: string;
  timeframe: Timeframe;
  /** Called imperatively on every data change — the chart applies it without a React re-render. */
  onChange: (candles: Candle[], change: DataChange) => void;
}

/**
 * Loads historical candles (REST) and keeps them live (SSE), exposing the
 * array through a ref. Live ticks that arrive while history is loading are
 * buffered and merged afterwards so no update is lost.
 */
export function useChartData({ symbol, timeframe, onChange }: Options) {
  const candlesRef = useRef<Candle[]>([]);
  const key = `${symbol}:${timeframe}`;
  // Result is tagged with the key it belongs to; a new key reads as "loading" until its data arrives.
  const [result, setResult] = useState<{ key: string; status: "ready" | "error"; error?: string } | null>(null);
  const status = result?.key === key ? result.status : "loading";
  const error = result?.key === key ? (result.error ?? null) : null;
  const onChangeRef = useRef(onChange);
  const olderState = useRef({ loading: false, exhausted: false, gen: 0 });

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const gen = ++olderState.current.gen;
    olderState.current.loading = false;
    olderState.current.exhausted = false;
    candlesRef.current = [];
    onChangeRef.current([], { kind: "reset" });

    let loaded = false;
    const buffer: Candle[] = [];

    const merge = (c: Candle) => {
      const arr = candlesRef.current;
      const last = arr[arr.length - 1];
      if (!last || c.time > last.time) {
        arr.push(c);
        onChangeRef.current(arr, { kind: "update", candle: c, isNew: true });
      } else if (c.time === last.time) {
        arr[arr.length - 1] = c;
        onChangeRef.current(arr, { kind: "update", candle: c, isNew: false });
      }
      // Older than the last candle: ignore (can't happen on a healthy stream).
    };

    const unsubscribe = getStream().subscribe(symbol, timeframe, (e) => {
      if (loaded) merge(e.candle);
      else buffer.push(e.candle);
    });

    api
      .candles(symbol, timeframe, { limit: 1000 })
      .then((candles) => {
        if (gen !== olderState.current.gen) return;
        candlesRef.current = candles;
        loaded = true;
        for (const c of buffer) {
          const arr = candlesRef.current;
          const last = arr[arr.length - 1];
          if (!last || c.time > last.time) arr.push(c);
          else if (c.time === last.time) arr[arr.length - 1] = c;
        }
        setResult({ key: `${symbol}:${timeframe}`, status: "ready" });
        onChangeRef.current(candlesRef.current, { kind: "reset" });
      })
      .catch((err: Error) => {
        if (gen !== olderState.current.gen) return;
        setResult({ key: `${symbol}:${timeframe}`, status: "error", error: err.message });
      });

    return () => {
      unsubscribe();
    };
  }, [symbol, timeframe]);

  /** Fetches the page of candles before the first loaded one (infinite scroll left). */
  const loadOlder = useCallback(async () => {
    const st = olderState.current;
    const first = candlesRef.current[0];
    if (st.loading || st.exhausted || !first) return;
    st.loading = true;
    const gen = st.gen;
    try {
      const older = await api.candles(symbol, timeframe, { limit: 1000, to: first.time - 1 });
      if (gen !== st.gen) return;
      const fresh = older.filter((c) => c.time < first.time);
      if (fresh.length === 0) {
        st.exhausted = true;
        return;
      }
      candlesRef.current = [...fresh, ...candlesRef.current];
      onChangeRef.current(candlesRef.current, { kind: "prepend", added: fresh.length });
    } catch {
      // ignore — user can scroll again to retry
    } finally {
      if (gen === st.gen) st.loading = false;
    }
  }, [symbol, timeframe]);

  return { candlesRef, status, error, loadOlder };
}
