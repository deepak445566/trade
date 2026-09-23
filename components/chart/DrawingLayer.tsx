"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { IChartApi, ISeriesApi, Logical, SeriesType } from "lightweight-charts";
import { logicalToTime, timeToLogical } from "@/lib/chart/timeMap";
import { formatPrice } from "@/lib/format";
import { newId } from "@/lib/workspace";
import { TIMEFRAME_SECONDS, type Candle, type Drawing, type DrawingPoint, type DrawingType, type Timeframe } from "@/types";

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const TOOL_COLORS: Record<DrawingType, string> = {
  trendline: "#2962ff",
  ray: "#2962ff",
  arrow: "#ff9800",
  hline: "#f23645",
  vline: "#9c27b0",
  rect: "#089981",
  fib: "#f5a623",
  measure: "#2962ff",
  text: "#d1d4dc",
  long: "#089981",
  short: "#f23645",
};
const ONE_CLICK: DrawingType[] = ["hline", "vline", "text"];
const UP = "#089981";
const DOWN = "#f23645";

/** Long/short position box: [entry, target, stop]; stop mirrors the target distance (1:1). */
function positionPoints(type: "long" | "short", a: DrawingPoint, b: DrawingPoint, step: number): DrawingPoint[] {
  const end = Math.max(b.time, a.time + step * 5);
  const dist = Math.abs(b.price - a.price) || a.price * 0.01;
  const target = type === "long" ? a.price + dist : a.price - dist;
  const stop = type === "long" ? a.price - dist : a.price + dist;
  return [a, { time: end, price: target }, { time: end, price: stop }];
}

type Drag = { id: string; handle: number | "body"; start: DrawingPoint; orig: DrawingPoint[]; points: DrawingPoint[] };

interface Props {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  getCandles: () => Candle[];
  timeframe: Timeframe;
  drawings: Drawing[];
  tool: DrawingType | null;
  onAdd: (d: Drawing) => void;
  onUpdate: (id: string, patch: Partial<Omit<Drawing, "id">>) => void;
  onRemove: (id: string) => void;
  onToolDone: () => void;
  onTrade: (d: Drawing) => void;
}

/**
 * SVG overlay over the main price pane. Drawings are stored in (time, price)
 * space and projected to pixels whenever the visible range / price scale moves.
 * Selected drawings can be moved (drag the body) or reshaped (drag a handle).
 */
export default function DrawingLayer(props: Props) {
  const { chart, series, getCandles, timeframe, drawings, tool, onAdd, onUpdate, onRemove, onToolDone, onTrade } = props;
  const [, setFrame] = useState(0);
  const [draft, setDraft] = useState<{ type: DrawingType; start: DrawingPoint; cursor: DrawingPoint; sx: number; sy: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const step = TIMEFRAME_SECONDS[timeframe];

  // Re-render whenever the projection changes (scroll, zoom, autoscale, resize, new candle).
  useEffect(() => {
    let raf = 0;
    let prev = "";
    const tick = () => {
      const range = chart.timeScale().getVisibleLogicalRange();
      const candles = getCandles();
      const last = candles[candles.length - 1];
      const ref = last ? last.close : 1;
      const size = chart.paneSize(0);
      const sig = `${range?.from},${range?.to},${series.priceToCoordinate(ref)},${series.priceToCoordinate(ref * 1.01)},${size.width},${size.height},${candles.length},${candles[0]?.time},${last?.close}`;
      if (sig !== prev) {
        prev = sig;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chart, series, getCandles]);

  useEffect(() => {
    const onClick = () => setSelected(null);
    chart.subscribeClick(onClick);
    return () => chart.unsubscribeClick(onClick);
  }, [chart]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "Escape") {
        setDraft(null);
        setSelected(null);
        if (tool) onToolDone();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        onRemove(selected);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, tool, onRemove, onToolDone]);

  const candles = getCandles();
  const ts = chart.timeScale();
  const width = ts.width();
  const height = chart.paneSize(0).height;

  const toX = (time: number) => {
    const l = timeToLogical(candles, step, time);
    return l === null ? null : ts.logicalToCoordinate(l as Logical);
  };
  const toY = (price: number) => series.priceToCoordinate(price);
  const fromXY = (x: number, y: number): DrawingPoint | null => {
    const l = ts.coordinateToLogical(x);
    const price = series.coordinateToPrice(y);
    if (l === null || price === null) return null;
    const time = logicalToTime(candles, step, l);
    return time === null ? null : { time, price };
  };
  const localXY = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // ---------- creating ----------

  const create = (type: DrawingType, a: DrawingPoint, b?: DrawingPoint) => {
    let points: DrawingPoint[] = b ? [a, b] : [a];
    let text: string | undefined;
    if (type === "text") {
      text = window.prompt("Text:")?.trim().slice(0, 200);
      if (!text) {
        setDraft(null);
        onToolDone();
        return;
      }
    }
    if ((type === "long" || type === "short") && b) points = positionPoints(type, a, b, step);
    const d: Drawing = { id: newId("drw"), type, points, color: TOOL_COLORS[type], ...(text ? { text } : {}) };
    onAdd(d);
    setDraft(null);
    setSelected(d.id);
    onToolDone();
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!tool) return;
    e.preventDefault();
    const { x, y } = localXY(e);
    const p = fromXY(x, y);
    if (!p) return;
    if (ONE_CLICK.includes(tool)) return create(tool, p);
    if (draft) return create(draft.type, draft.start, p);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraft({ type: tool, start: p, cursor: p, sx: x, sy: y });
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!draft) return;
    const { x, y } = localXY(e);
    const p = fromXY(x, y);
    if (p) setDraft({ ...draft, cursor: p });
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (!draft) return;
    const { x, y } = localXY(e);
    if (Math.hypot(x - draft.sx, y - draft.sy) > 6) {
      const p = fromXY(x, y);
      if (p) create(draft.type, draft.start, p);
    }
  };

  // ---------- editing (drag) ----------

  const startDrag = (e: React.PointerEvent, d: Drawing, handle: number | "body") => {
    if (tool) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(d.id);
    // Measure against the overlay <svg> this element lives in (no ref access needed).
    const rect = ((e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as Element)).getBoundingClientRect();
    const rel = (ev: { clientX: number; clientY: number }) => ({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
    const { x, y } = rel(e);
    const start = fromXY(x, y);
    if (!start) return;
    const orig = d.points;
    let latest = orig;
    setDrag({ id: d.id, handle, start, orig, points: orig });

    const move = (ev: PointerEvent) => {
      const { x: mx, y: my } = rel(ev);
      const p = fromXY(mx, my);
      if (!p) return;
      const dt = p.time - start.time;
      const dp = p.price - start.price;
      let pts: DrawingPoint[];
      if (handle === "body") {
        pts = orig.map((o) => ({ time: o.time + dt, price: o.price + dp }));
      } else if (d.type === "long" || d.type === "short") {
        pts = orig.map((o) => ({ ...o }));
        if (handle === 0) pts[0] = { time: orig[0].time + dt, price: orig[0].price + dp };
        else {
          // target/stop handles move their price; both share the box's right edge
          pts[handle] = { ...pts[handle], price: orig[handle].price + dp };
          pts[1].time = pts[2].time = orig[1].time + dt;
        }
      } else {
        pts = orig.map((o, i) => (i === handle ? { time: o.time + dt, price: o.price + dp } : o));
      }
      latest = pts;
      setDrag({ id: d.id, handle, start, orig, points: pts });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (latest !== orig) onUpdate(d.id, { points: latest });
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---------- rendering ----------

  const handleEl = (d: Drawing, i: number, x: number, y: number) => (
    <circle
      key={`h${i}`}
      cx={x}
      cy={y}
      r={5}
      fill="#131722"
      stroke={d.color}
      strokeWidth={2}
      style={{ cursor: "grab" }}
      pointerEvents="all"
      onPointerDown={(e) => startDrag(e, d, i)}
    />
  );

  const render = (orig: Drawing, isDraft = false) => {
    const d = drag?.id === orig.id ? { ...orig, points: drag.points } : orig;
    const isSel = selected === d.id && !isDraft;
    const sw = isSel ? 2.5 : 1.5;
    const common = isDraft
      ? {}
      : {
          onPointerDown: (e: React.PointerEvent) => startDrag(e, orig, "body"),
          style: { cursor: tool ? undefined : drag?.id === d.id ? "grabbing" : "move" },
        };
    const [a, b, c] = d.points;
    const ax = toX(a.time);
    const ay = toY(a.price);

    switch (d.type) {
      case "hline":
        if (ay === null) return null;
        return (
          <g key={d.id} {...common}>
            <line x1={0} x2={width} y1={ay} y2={ay} stroke="transparent" strokeWidth={10} pointerEvents="stroke" />
            <line x1={0} x2={width} y1={ay} y2={ay} stroke={d.color} strokeWidth={sw} />
            <text x={width - 4} y={ay - 4} textAnchor="end" fill={d.color} fontSize={11}>
              {formatPrice(a.price)}
            </text>
          </g>
        );
      case "vline":
        if (ax === null) return null;
        return (
          <g key={d.id} {...common}>
            <line x1={ax} x2={ax} y1={0} y2={height} stroke="transparent" strokeWidth={10} pointerEvents="stroke" />
            <line x1={ax} x2={ax} y1={0} y2={height} stroke={d.color} strokeWidth={sw} />
          </g>
        );
      case "text":
        if (ax === null || ay === null) return null;
        return (
          <g key={d.id} {...common}>
            <text x={ax} y={ay} fill={d.color} fontSize={13} fontWeight={500} pointerEvents="all" style={{ userSelect: "none" }}>
              {d.text}
            </text>
            {isSel && handleEl(orig, 0, ax, ay)}
          </g>
        );
    }

    if (!b) return null;
    const bx = toX(b.time);
    const by = toY(b.price);
    if (ax === null || ay === null || bx === null || by === null) return null;
    const handles = isSel && (
      <>
        {handleEl(orig, 0, ax, ay)}
        {handleEl(orig, 1, bx, by)}
      </>
    );

    switch (d.type) {
      case "trendline":
      case "arrow":
      case "ray": {
        let ex: number = bx;
        let ey: number = by;
        if (d.type === "ray" && bx !== ax) {
          // extend to the right/left edge
          const edge = bx > ax ? width : 0;
          ey = ay + ((by - ay) * (edge - ax)) / (bx - ax);
          ex = edge;
        }
        const ang = Math.atan2(by - ay, bx - ax);
        const head =
          d.type === "arrow"
            ? `M${bx},${by} L${bx - 12 * Math.cos(ang - 0.45)},${by - 12 * Math.sin(ang - 0.45)} M${bx},${by} L${bx - 12 * Math.cos(ang + 0.45)},${by - 12 * Math.sin(ang + 0.45)}`
            : null;
        return (
          <g key={d.id} {...common}>
            <line x1={ax} y1={ay} x2={ex} y2={ey} stroke="transparent" strokeWidth={10} pointerEvents="stroke" />
            <line x1={ax} y1={ay} x2={ex} y2={ey} stroke={d.color} strokeWidth={sw} />
            {head && <path d={head} stroke={d.color} strokeWidth={sw + 0.5} fill="none" strokeLinecap="round" />}
            {handles}
          </g>
        );
      }
      case "rect":
        return (
          <g key={d.id} {...common}>
            <rect
              x={Math.min(ax, bx)}
              y={Math.min(ay, by)}
              width={Math.abs(bx - ax)}
              height={Math.abs(by - ay)}
              fill={`${d.color}26`}
              stroke={d.color}
              strokeWidth={sw}
              pointerEvents="all"
            />
            {handles}
          </g>
        );
      case "measure": {
        const diff = b.price - a.price;
        const pct = (diff / a.price) * 100;
        const bars = Math.round((b.time - a.time) / step);
        const col = diff >= 0 ? UP : DOWN;
        const x1 = Math.min(ax, bx);
        const y1 = Math.min(ay, by);
        return (
          <g key={d.id} {...common}>
            <rect x={x1} y={y1} width={Math.abs(bx - ax)} height={Math.abs(by - ay)} fill={`${col}26`} stroke={col} strokeWidth={1} pointerEvents="all" />
            <line x1={(ax + bx) / 2} y1={ay} x2={(ax + bx) / 2} y2={by} stroke={col} strokeWidth={1} />
            <rect x={(ax + bx) / 2 - 70} y={by + (diff >= 0 ? -34 : 6)} width={140} height={28} rx={3} fill={col} />
            <text x={(ax + bx) / 2} y={by + (diff >= 0 ? -22 : 18)} textAnchor="middle" fill="#fff" fontSize={10}>
              {diff >= 0 ? "+" : ""}
              {formatPrice(diff)} ({pct.toFixed(2)}%)
            </text>
            <text x={(ax + bx) / 2} y={by + (diff >= 0 ? -10 : 30)} textAnchor="middle" fill="#fff" fontSize={10}>
              {bars} bars
            </text>
            {handles}
          </g>
        );
      }
      case "fib": {
        const x1 = Math.min(ax, bx);
        const x2 = Math.max(ax, bx);
        return (
          <g key={d.id} {...common}>
            <rect x={x1} y={Math.min(ay, by)} width={x2 - x1} height={Math.abs(by - ay)} fill="transparent" pointerEvents="all" />
            <line x1={ax} y1={ay} x2={bx} y2={by} stroke={d.color} strokeWidth={1} strokeDasharray="4 4" />
            {FIB_LEVELS.map((lvl) => {
              const price = b.price + (a.price - b.price) * lvl;
              const y = toY(price);
              if (y === null) return null;
              return (
                <g key={lvl}>
                  <line x1={x1} x2={x2} y1={y} y2={y} stroke={d.color} strokeWidth={lvl === 0.5 || lvl === 0.618 ? sw : 1} opacity={0.9} />
                  <text x={x1 + 4} y={y - 3} fill={d.color} fontSize={10}>
                    {lvl} ({formatPrice(price)})
                  </text>
                </g>
              );
            })}
            {handles}
          </g>
        );
      }
      case "long":
      case "short": {
        if (!c) return null;
        const cy = toY(c.price);
        if (cy === null) return null;
        const x1 = Math.min(ax, bx);
        const w = Math.abs(bx - ax);
        const entry = a.price;
        const reward = Math.abs(b.price - entry);
        const risk = Math.abs(c.price - entry);
        const rr = risk ? reward / risk : 0;
        return (
          <g key={d.id} {...common}>
            <rect x={x1} y={Math.min(ay, by)} width={w} height={Math.abs(by - ay)} fill={`${UP}33`} stroke={isSel ? UP : "none"} pointerEvents="all" />
            <rect x={x1} y={Math.min(ay, cy)} width={w} height={Math.abs(cy - ay)} fill={`${DOWN}33`} stroke={isSel ? DOWN : "none"} pointerEvents="all" />
            <line x1={x1} x2={x1 + w} y1={ay} y2={ay} stroke="#b2b5be" strokeWidth={1} />
            <text x={x1 + w / 2} y={by + (d.type === "long" ? -6 : 14)} textAnchor="middle" fill={UP} fontSize={10}>
              Target {formatPrice(b.price)} ({((reward / entry) * 100).toFixed(2)}%)
            </text>
            <text x={x1 + w / 2} y={cy + (d.type === "long" ? 14 : -6)} textAnchor="middle" fill={DOWN} fontSize={10}>
              Stop {formatPrice(c.price)} ({((risk / entry) * 100).toFixed(2)}%)
            </text>
            <text x={x1 + 4} y={ay - 4} fill="#d1d4dc" fontSize={10}>
              {d.type === "long" ? "Long" : "Short"} · R:R {rr.toFixed(2)}
            </text>
            {isSel && (
              <>
                {handleEl(orig, 0, ax, ay)}
                {handleEl(orig, 1, bx, by)}
                {handleEl(orig, 2, bx, cy)}
              </>
            )}
          </g>
        );
      }
    }
    return null;
  };

  const selectedDrawing = drawings.find((d) => d.id === selected);

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute left-0 top-0 z-2"
        width={width}
        height={height}
        style={{ pointerEvents: tool ? "auto" : "none", cursor: tool ? "crosshair" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <g style={{ pointerEvents: tool ? "none" : "auto" }}>{drawings.map((d) => render(d))}</g>
        {draft &&
          render(
            {
              id: "draft",
              type: draft.type,
              points:
                draft.type === "long" || draft.type === "short"
                  ? positionPoints(draft.type, draft.start, draft.cursor, step)
                  : [draft.start, draft.cursor],
              color: TOOL_COLORS[draft.type],
            },
            true,
          )}
      </svg>
      {selectedDrawing && !tool && !drag && (
        <div className="absolute left-1/2 top-2 z-3 flex -translate-x-1/2 gap-1">
          {(selectedDrawing.type === "long" || selectedDrawing.type === "short") && (
            <button
              className="rounded bg-[#2962ff] px-3 py-1 text-xs text-white shadow hover:bg-[#1e53e5]"
              onClick={() => onTrade(selectedDrawing)}
            >
              Paper trade this
            </button>
          )}
          <button
            className="rounded bg-[#2a2e39] px-3 py-1 text-xs text-[#f23645] shadow hover:bg-[#363a45]"
            onClick={() => {
              onRemove(selectedDrawing.id);
              setSelected(null);
            }}
          >
            Delete (Del)
          </button>
        </div>
      )}
    </>
  );
}
