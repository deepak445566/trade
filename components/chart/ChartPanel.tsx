"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesMarkersPluginApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useChartData, type DataChange } from "@/hooks/useChartData";
import { computeIndicators, type IndicatorOutput } from "@/hooks/useIndicators";
import { cx, formatPct, formatPrice, formatVolume, pricePrecision } from "@/lib/format";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useChartStore } from "@/store/chartStore";
import { useMarketStore } from "@/store/marketStore";
import { useTradeStore } from "@/store/tradeStore";
import { useAuthStore } from "@/store/authStore";
import CandleCountdown from "./CandleCountdown";
import DrawingLayer from "./DrawingLayer";
import TradeLinesLayer from "./TradeLinesLayer";
import { useToasts } from "@/components/common/Toaster";
import DrawingToolbar from "./DrawingToolbar";
import IndicatorPanel from "./IndicatorPanel";
import TimeframeSelector from "./TimeframeSelector";
import SymbolSearch from "@/components/search/SymbolSearch";
import { indicatorLabel } from "@/lib/workspace";
import { exchangeLabel } from "@/lib/markets";
import { TIMEFRAME_LABELS, type Candle, type ChartConfig, type ChartType } from "@/types";

const UP = "#089981";
const DOWN = "#f23645";

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Candles" },
  { id: "bars", label: "OHLC bars" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
];

interface SeriesSet {
  main: ISeriesApi<SeriesType>;
  volume: ISeriesApi<"Histogram">;
  indicators: { output: IndicatorOutput; series: ISeriesApi<SeriesType>[] }[];
  markers: ISeriesMarkersPluginApi<Time>;
  markerKey: string;
}

/** BUY/SELL signal arrows from indicators (EMA cross) on the price series. */
function syncMarkers(s: SeriesSet) {
  const all = s.indicators.flatMap((i) => i.output.markers ?? []).sort((a, b) => a.time - b.time);
  const key = `${all.length}:${all[all.length - 1]?.time}:${all[all.length - 1]?.side}`;
  if (key === s.markerKey) return;
  s.markerKey = key;
  s.markers.setMarkers(
    all.map((m) =>
      m.side === "buy"
        ? { time: t(m.time), position: "belowBar" as const, color: UP, shape: "arrowUp" as const, text: "BUY" }
        : { time: t(m.time), position: "aboveBar" as const, color: DOWN, shape: "arrowDown" as const, text: "SELL" },
    ),
  );
}

interface Legend {
  candle: Candle;
  prevClose?: number;
  values: (number | undefined)[];
}

const t = (time: number) => time as UTCTimestamp;

function mainPoint(type: ChartType, c: Candle) {
  return type === "line" || type === "area"
    ? { time: t(c.time), value: c.close }
    : { time: t(c.time), open: c.open, high: c.high, low: c.low, close: c.close };
}

function volumePoint(c: Candle) {
  return { time: t(c.time), value: c.volume, color: c.close >= c.open ? `${UP}66` : `${DOWN}66` };
}

function linePoint(kind: "line" | "histogram", p: { time: number; value: number }) {
  if (!Number.isFinite(p.value)) return { time: t(p.time) }; // whitespace = gap in the line
  return kind === "histogram"
    ? { time: t(p.time), value: p.value, color: p.value >= 0 ? `${UP}b3` : `${DOWN}b3` }
    : { time: t(p.time), value: p.value };
}

function localTime(time: Time) {
  return new Date((time as number) * 1000);
}

export default function ChartPanel({ config, active, compact }: { config: ChartConfig; active: boolean; compact: boolean }) {
  const { id, symbol, timeframe, chartType, indicators, drawings } = config;
  const updateChart = useWorkspaceStore((s) => s.updateChart);
  const setActiveChart = useWorkspaceStore((s) => s.setActiveChart);
  const addIndicator = useWorkspaceStore((s) => s.addIndicator);
  const removeIndicator = useWorkspaceStore((s) => s.removeIndicator);
  const addDrawing = useWorkspaceStore((s) => s.addDrawing);
  const removeDrawing = useWorkspaceStore((s) => s.removeDrawing);
  const updateDrawing = useWorkspaceStore((s) => s.updateDrawing);
  const clearDrawings = useWorkspaceStore((s) => s.clearDrawings);
  const tool = useChartStore((s) => s.tools[id] ?? null);
  const setTool = useChartStore((s) => s.setTool);
  const setLastPrice = useChartStore((s) => s.setLastPrice);
  const alerts = useMarketStore((s) => s.alerts);
  const trades = useTradeStore((s) => s.trades);
  const openTicket = useTradeStore((s) => s.openTicket);
  const authed = useAuthStore((s) => s.status === "authenticated");
  const modifyTrade = useTradeStore((s) => s.modify);
  const draft = useTradeStore((s) => s.draft);
  const ticketOpen = useTradeStore((s) => s.ticketOpen);
  const setDraft = useTradeStore((s) => s.setDraft);
  const isActiveChart = useWorkspaceStore((s) => s.activeChartId === id);
  // Order preview lines go on the active chart when it shows the ticket's symbol.
  const draftPreview =
    ticketOpen && authed && isActiveChart && (draft.symbol ?? symbol) === symbol
      ? {
          side: draft.side,
          orderType: draft.orderType,
          qty: Number(draft.qty) || 0,
          limit: Number(draft.limit) || undefined,
          sl: Number(draft.sl) || undefined,
          tp: Number(draft.tp) || undefined,
        }
      : null;
  const closeTrade = useTradeStore((s) => s.close);
  const symbolTrades = useMemo(
    () => trades.filter((tr) => tr.symbol === symbol && (tr.status === "open" || tr.status === "pending")),
    [trades, symbol],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<SeriesSet | null>(null);
  // Snapshot of the chart objects for rendering (refs can't be read during render).
  const [built, setBuilt] = useState<{ chart: IChartApi; set: SeriesSet; version: number } | null>(null);
  const seriesVersion = built?.version ?? 0;
  const [legend, setLegend] = useState<Legend | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const pending = useRef(new Map<number, Candle>());
  const raf = useRef(0);
  const needsInitialRange = useRef(true);
  const dataRef = useRef<Candle[]>([]);

  const chartTypeRef = useRef(chartType);
  const indicatorsRef = useRef(indicators);
  useEffect(() => {
    chartTypeRef.current = chartType;
    indicatorsRef.current = indicators;
  });

  // ---------- data application (imperative, no React re-render per tick) ----------

  const applyAll = useCallback((candles: Candle[]) => {
    const s = seriesRef.current;
    if (!s) return;
    const type = chartTypeRef.current;
    s.main.setData(candles.map((c) => mainPoint(type, c)));
    s.volume.setData(candles.map(volumePoint));
    const outputs = computeIndicators(candles, s.indicators.map((i) => i.output.config));
    outputs.forEach((out, idx) => {
      const entry = s.indicators[idx];
      if (!entry) return;
      entry.output = out;
      out.lines.forEach((line, li) => entry.series[li]?.setData(line.points.map((p) => linePoint(line.kind, p))));
    });
    syncMarkers(s);
    const last = candles[candles.length - 1];
    if (last) {
      const precision = pricePrecision(last.close);
      s.main.applyOptions({ priceFormat: { type: "price", precision, minMove: 10 ** -precision } });
      s.indicators.forEach((i) => {
        if (i.output.overlay) i.series.forEach((ser) => ser.applyOptions({ priceFormat: { type: "price", precision, minMove: 10 ** -precision } }));
      });
    }
  }, []);

  const flushUpdates = useCallback((candles: Candle[]) => {
    raf.current = 0;
    const s = seriesRef.current;
    const updates = [...pending.current.values()].sort((a, b) => a.time - b.time);
    pending.current.clear();
    if (!s || !updates.length) return;
    const type = chartTypeRef.current;
    for (const c of updates) {
      s.main.update(mainPoint(type, c));
      s.volume.update(volumePoint(c));
    }
    const outputs = computeIndicators(candles, s.indicators.map((i) => i.output.config));
    outputs.forEach((out, idx) => {
      const entry = s.indicators[idx];
      if (!entry) return;
      entry.output = out;
      out.lines.forEach((line, li) => {
        const lastPt = line.points[line.points.length - 1];
        if (lastPt) entry.series[li]?.update(linePoint(line.kind, lastPt));
      });
    });
    syncMarkers(s);
    const last = updates[updates.length - 1];
    setLastPrice(id, last.close);
  }, [id, setLastPrice]);

  const onData = useCallback(
    (candles: Candle[], change: DataChange) => {
      const chart = chartRef.current;
      if (change.kind === "update") {
        pending.current.set(change.candle.time, change.candle);
        dataRef.current = candles;
        if (!raf.current) raf.current = requestAnimationFrame(() => flushUpdates(dataRef.current));
        return;
      }
      pending.current.clear();
      if (change.kind === "prepend") {
        // lightweight-charts keeps the view anchored to the right edge, so no range fix-up is needed.
        applyAll(candles);
        return;
      }
      // reset
      applyAll(candles);
      if (!candles.length) {
        needsInitialRange.current = true;
        setLegend(null);
        return;
      }
      if (chart && needsInitialRange.current) {
        needsInitialRange.current = false;
        const n = candles.length;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 8 });
      }
      const last = candles[candles.length - 1];
      setLastPrice(id, last.close);
      setLegend({ candle: last, prevClose: candles[candles.length - 2]?.close, values: [] });
    },
    [applyAll, flushUpdates, id, setLastPrice],
  );

  const { candlesRef, status, error, loadOlder } = useChartData({ symbol, timeframe, onChange: onData });
  const loadOlderRef = useRef(loadOlder);
  useEffect(() => {
    loadOlderRef.current = loadOlder;
  });

  // ---------- chart lifecycle ----------

  useEffect(() => {
    const el = containerRef.current!;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#b2b5be",
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: "#2a2e39", separatorHoverColor: "#363a45", enableResize: true },
      },
      grid: { vertLines: { color: "#1e222d" }, horzLines: { color: "#1e222d" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#2a2e39" },
      timeScale: {
        borderColor: "#2a2e39",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          const d = localTime(time);
          switch (type) {
            case TickMarkType.Year:
              return String(d.getFullYear());
            case TickMarkType.Month:
              return d.toLocaleString("en-US", { month: "short" });
            case TickMarkType.DayOfMonth:
              return String(d.getDate());
            default:
              return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
          }
        },
      },
      localization: {
        timeFormatter: (time: Time) =>
          localTime(time).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
      },
    });
    chartRef.current = chart;

    const onRange = (range: { from: number; to: number } | null) => {
      if (range && range.from < 30) void loadOlderRef.current();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Rebuild all series when the chart type or indicator set changes.
  const indicatorKey = useMemo(() => indicators.map((i) => `${i.id}:${i.type}:${i.period}:${i.color}`).join("|"), [indicators]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const old = seriesRef.current;
    if (old) {
      old.markers.detach();
      [old.main, old.volume, ...old.indicators.flatMap((i) => i.series)].forEach((s) => chart.removeSeries(s));
    }
    while (chart.panes().length > 1) chart.removePane(chart.panes().length - 1);

    const common = { priceLineVisible: true, lastValueVisible: true };
    let main: ISeriesApi<SeriesType>;
    switch (chartType) {
      case "bars":
        main = chart.addSeries(BarSeries, { ...common, upColor: UP, downColor: DOWN, thinBars: false });
        break;
      case "line":
        main = chart.addSeries(LineSeries, { ...common, color: "#2962ff", lineWidth: 2 });
        break;
      case "area":
        main = chart.addSeries(AreaSeries, {
          ...common,
          lineColor: "#2962ff",
          topColor: "rgba(41,98,255,0.35)",
          bottomColor: "rgba(41,98,255,0.02)",
          lineWidth: 2,
        });
        break;
      default:
        main = chart.addSeries(CandlestickSeries, {
          ...common,
          upColor: UP,
          downColor: DOWN,
          borderUpColor: UP,
          borderDownColor: DOWN,
          wickUpColor: UP,
          wickDownColor: DOWN,
        });
    }

    const volume = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
      1,
    );

    const candles = candlesRef.current;
    const outputs = computeIndicators(candles, indicatorsRef.current);
    let nextPane = 2;
    const indSeries = outputs.map((output) => {
      const pane = output.overlay ? 0 : nextPane++;
      const series = output.lines.map((line) =>
        line.kind === "histogram"
          ? chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
          : chart.addSeries(
              LineSeries,
              {
                color: line.color,
                lineWidth: line.lineWidth ?? 2,
                priceLineVisible: false,
                lastValueVisible: !output.overlay,
                crosshairMarkerVisible: false,
                ...(line.style === "dots" ? { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.5 } : {}),
              },
              pane,
            ),
      );
      output.levels?.forEach((price) =>
        series[series.length - 1].createPriceLine({
          price,
          color: "#787b86",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
        }),
      );
      return { output, series };
    });

    const panes = chart.panes();
    panes[0]?.setStretchFactor(4);
    panes[1]?.setStretchFactor(1);
    for (let i = 2; i < panes.length; i++) panes[i].setStretchFactor(1.4);

    const set: SeriesSet = { main, volume, indicators: indSeries, markers: createSeriesMarkers(main, []), markerKey: "" };
    seriesRef.current = set;
    applyAll(candles);
    setBuilt((b) => ({ chart, set, version: (b?.version ?? 0) + 1 }));
  }, [chartType, indicatorKey, applyAll, candlesRef]);

  // Legend follows the crosshair (falls back to the latest candle).
  useEffect(() => {
    const chart = chartRef.current;
    const s = seriesRef.current;
    if (!chart || !s) return;
    let frame = 0;
    const onMove = (param: MouseEventParams) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const candles = candlesRef.current;
        let idx = candles.length - 1;
        if (param.time !== undefined) {
          const tm = param.time as number;
          // binary search the hovered candle
          let lo = 0;
          let hi = candles.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (candles[mid].time <= tm) lo = mid;
            else hi = mid - 1;
          }
          idx = lo;
        }
        const candle = candles[idx];
        if (!candle) return setLegend(null);
        const values = s.indicators.map(({ output }) => {
          const pts = output.lines.find((l) => l.kind === "line")?.points ?? [];
          if (param.time === undefined) return pts[pts.length - 1]?.value;
          return pts.find((p) => p.time === candle.time)?.value;
        });
        setLegend({ candle, prevClose: candles[idx - 1]?.close, values });
      });
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      cancelAnimationFrame(frame);
      chart.unsubscribeCrosshairMove(onMove);
    };
  }, [seriesVersion, candlesRef]);

  // Active price alerts for this symbol are shown as dashed price lines.
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    const lines: IPriceLine[] = alerts
      .filter((a) => a.status === "active" && a.symbol === symbol)
      .map((a) =>
        s.main.createPriceLine({
          price: a.targetPrice,
          color: "#f5a623",
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: "🔔",
        }),
      );
    return () => {
      if (seriesRef.current === s) lines.forEach((l) => s.main.removePriceLine(l));
    };
  }, [alerts, symbol, seriesVersion]);

  // New symbol/timeframe → show the latest candles again.
  useEffect(() => {
    needsInitialRange.current = true;
  }, [symbol, timeframe]);

  const c = legend?.candle;
  const chg = c && legend?.prevClose ? ((c.close - legend.prevClose) / legend.prevClose) * 100 : null;
  const up = c ? c.close >= c.open : true;
  const s = built?.set;
  const getCandles = useCallback(() => candlesRef.current, [candlesRef]);

  return (
    <div
      className={cx("flex h-full min-h-0 flex-col bg-[#131722]", active ? "ring-1 ring-inset ring-[#2962ff]/70" : "")}
      onMouseDown={() => !active && setActiveChart(id)}
    >
      {/* Top toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-[#2a2e39] px-1.5 [scrollbar-width:none]">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex h-7 items-center gap-1.5 rounded px-2 text-sm font-semibold text-[#d1d4dc] hover:bg-[#2a2e39]"
          title="Change symbol"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M13 13l4 4" />
          </svg>
          {symbol}
        </button>
        <div className="mx-1 h-5 w-px bg-[#2a2e39]" />
        <TimeframeSelector value={timeframe} onChange={(tf) => updateChart(id, { timeframe: tf })} />
        <div className="mx-1 h-5 w-px bg-[#2a2e39]" />
        <select
          value={chartType}
          onChange={(e) => updateChart(id, { chartType: e.target.value as ChartType })}
          className="h-7 rounded bg-transparent px-1 text-xs text-[#b2b5be] hover:bg-[#2a2e39] focus:outline-none"
          aria-label="Chart type"
        >
          {CHART_TYPES.map((ct) => (
            <option key={ct.id} value={ct.id} className="bg-[#1e222d]">
              {ct.label}
            </option>
          ))}
        </select>
        <IndicatorPanel
          indicators={indicators}
          onAdd={(i) => addIndicator(id, i)}
          onRemove={(indId) => removeIndicator(id, indId)}
        />
        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          <button
            onClick={() => openTicket({ symbol, side: "short", orderType: "market" })}
            className="h-6 rounded bg-[#f23645] px-2 text-xs font-semibold text-white hover:bg-[#d92f3d]"
            title={authed ? "Sell (paper trade)" : "Log in to paper trade"}
          >
            Sell
          </button>
          <button
            onClick={() => openTicket({ symbol, side: "long", orderType: "market" })}
            className="h-6 rounded bg-[#089981] px-2 text-xs font-semibold text-white hover:bg-[#07806c]"
            title={authed ? "Buy (paper trade)" : "Log in to paper trade"}
          >
            Buy
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <DrawingToolbar
          tool={tool}
          onTool={(tl) => setTool(id, tl)}
          onClear={() => clearDrawings(id)}
          hasDrawings={drawings.length > 0}
        />
        <div className="relative min-w-0 flex-1">
          <div ref={containerRef} className="absolute inset-0" />

          {built && s && (
            <DrawingLayer
              key={`${seriesVersion}`}
              chart={built.chart}
              series={s.main}
              getCandles={getCandles}
              timeframe={timeframe}
              drawings={drawings}
              tool={tool}
              onAdd={(d) => addDrawing(id, d)}
              onUpdate={(dId, patch) => updateDrawing(id, dId, patch)}
              onRemove={(dId) => removeDrawing(id, dId)}
              onToolDone={() => setTool(id, null)}
              onTrade={(d) =>
                openTicket({
                  symbol,
                  side: d.type === "short" ? "short" : "long",
                  orderType: "limit",
                  price: d.points[0].price,
                  tp: d.points[1]?.price,
                  sl: d.points[2]?.price,
                })
              }
            />
          )}

          {built && s && status === "ready" && (symbolTrades.length > 0 || draftPreview) && (
            <TradeLinesLayer
              chart={built.chart}
              series={s.main}
              getCandles={getCandles}
              trades={symbolTrades}
              draft={draftPreview}
              onDraftChange={(p) =>
                setDraft({
                  ...(p.limitPrice !== undefined ? { orderType: "limit" as const, limit: String(p.limitPrice) } : {}),
                  ...("sl" in p ? { sl: p.sl ? String(p.sl) : "" } : {}),
                  ...("tp" in p ? { tp: p.tp ? String(p.tp) : "" } : {}),
                })
              }
              onModify={modifyTrade}
              onClose={closeTrade}
              onError={(m) => useToasts.getState().push({ tone: "error", title: "Could not update trade", body: m })}
            />
          )}

          {built && s && status === "ready" && (
            <CandleCountdown chart={built.chart} series={s.main} getCandles={getCandles} timeframe={timeframe} />
          )}

          {/* Legend */}
          <div className="pointer-events-none absolute left-2 top-1.5 z-[3] select-none text-xs leading-5">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-semibold text-[#d1d4dc]">
                {symbol} · {TIMEFRAME_LABELS[timeframe]} · {exchangeLabel(symbol)}
              </span>
              {c && (
                <span className={up ? "text-[#089981]" : "text-[#f23645]"}>
                  <span className="text-[#787b86]">O</span> {formatPrice(c.open)} <span className="text-[#787b86]">H</span>{" "}
                  {formatPrice(c.high)} <span className="text-[#787b86]">L</span> {formatPrice(c.low)}{" "}
                  <span className="text-[#787b86]">C</span> {formatPrice(c.close)}
                  {chg !== null && <> {formatPct(chg)}</>}
                  {!compact && (
                    <>
                      {" "}
                      <span className="text-[#787b86]">Vol</span> {formatVolume(c.volume)}
                    </>
                  )}
                </span>
              )}
            </div>
            {s?.indicators.map(({ output }, i) => (
              <div key={output.config.id} className="pointer-events-auto flex items-center gap-1.5 text-[#b2b5be]">
                <span style={{ color: output.config.color }}>{indicatorLabel(output.config)}</span>
                <span style={{ color: output.config.color }}>
                  {legend?.values[i] !== undefined ? formatPrice(legend.values[i]) : ""}
                </span>
                <button
                  onClick={() => removeIndicator(id, output.config.id)}
                  className="text-[10px] text-[#787b86] hover:text-[#f23645]"
                  aria-label={`Remove ${output.label}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {status === "loading" && (
            <div className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2962ff] border-t-transparent" />
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-2 text-sm text-[#b2b5be]">
              <p>Could not load {symbol}: {error}</p>
              <button onClick={() => setSearchOpen(true)} className="rounded bg-[#2962ff] px-3 py-1 text-white">
                Choose another symbol
              </button>
            </div>
          )}
        </div>
      </div>

      <SymbolSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(sym) => {
          updateChart(id, { symbol: sym });
          setSearchOpen(false);
        }}
      />
    </div>
  );
}
