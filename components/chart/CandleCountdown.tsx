"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { serverNow } from "@/lib/streamClient";
import { candleEnd, type Candle, type Timeframe } from "@/types";

export function formatCountdown(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${p(h)}h`;
  if (h > 0) return `${p(h)}:${p(m)}:${p(ss)}`;
  return `${p(m)}:${p(ss)}`;
}

interface Props {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  getCandles: () => Candle[];
  timeframe: Timeframe;
}

/**
 * TradingView-style "time until candle close" box, drawn on the price scale
 * right under the last-price label. Uses exchange-synced time. Updates via
 * direct DOM writes (no React re-render per tick).
 */
export default function CandleCountdown({ chart, series, getCandles, timeframe }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tick = () => {
      const candles = getCandles();
      const last = candles[candles.length - 1];
      const y = last ? series.priceToCoordinate(last.close) : null;
      const paneH = chart.paneSize(0).height;
      if (!last || y === null || y < 0 || y > paneH - 12) {
        el.style.display = "none";
        return;
      }
      const remaining = candleEnd(timeframe, last.time) - serverNow() / 1000;
      el.style.display = "block";
      el.style.top = `${Math.round(y + 10)}px`;
      el.style.width = `${chart.priceScale("right").width()}px`;
      el.style.background = last.close >= last.open ? "#089981" : "#f23645";
      el.textContent = formatCountdown(remaining);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [chart, series, getCandles, timeframe]);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute right-0 z-[3] hidden text-center font-mono text-[11px] leading-[18px] text-white tabular-nums"
      aria-label="Time until candle close"
    />
  );
}
