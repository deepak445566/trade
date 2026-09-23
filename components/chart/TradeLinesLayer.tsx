"use client";

import { useEffect, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import type { TradePatch } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import type { Candle, PaperTradeDTO } from "@/types";

const UP = "#089981";
const DOWN = "#f23645";
const LONG_C = "#2962ff";
const SHORT_C = "#e040fb";
const LABEL_GAP = 64; // px between the line labels and the price scale

type Kind = "sl" | "tp" | "entry";
interface Drag {
  id: string;
  kind: Kind | "create"; // "create" = dragging out of the position label; resolves to sl/tp by direction
  price: number;
  moved: boolean;
}

/** The order being prepared in the ticket, previewed on the chart before it is placed. */
export interface DraftPreview {
  side: "long" | "short";
  orderType: "market" | "limit";
  qty: number;
  limit?: number;
  sl?: number;
  tp?: number;
}

const DRAFT_ID = "__draft";

interface Props {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  getCandles: () => Candle[];
  trades: PaperTradeDTO[]; // active trades on this chart's symbol
  draft?: DraftPreview | null;
  onDraftChange?: (patch: TradePatch) => void;
  onModify: (id: string, patch: TradePatch) => Promise<void>;
  onClose: (id: string) => Promise<void>;
  onError: (message: string) => void;
}

const money = (v: number) => `${v >= 0 ? "+" : "-"}$${Math.abs(v).toFixed(2)}`;
const round = (p: number) => Number(p.toPrecision(10));

/** Which level a vertical drag away from the entry creates (profit side → TP, loss side → SL). */
function kindForDirection(t: PaperTradeDTO, entry: number, price: number): "sl" | "tp" {
  const up = price > entry;
  return t.side === "long" ? (up ? "tp" : "sl") : up ? "sl" : "tp";
}

/**
 * TradingView-style order lines for paper trades, drawn over the price pane:
 *  - drag an SL / TP line (anywhere along it) to move it — live P&L, % and R:R while dragging
 *  - drag out of the position label up/down to create TP or SL
 *  - drag a pending limit order's line to move the order
 *  - ✕ on a tag removes that level; ✕ on the position closes / cancels it
 * Changes are applied optimistically and reverted if the server rejects them.
 */
export default function TradeLinesLayer(props: Props) {
  const { chart, series, getCandles, trades: realTrades, draft, onDraftChange, onModify, onClose, onError } = props;
  const [, setFrame] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overrides, setOverrides] = useState<Record<string, TradePatch>>({});

  useEffect(() => {
    let raf = 0;
    let prev = "";
    const tick = () => {
      const candles = getCandles();
      const last = candles[candles.length - 1]?.close ?? 1;
      const size = chart.paneSize(0);
      const sig = `${series.priceToCoordinate(last)},${series.priceToCoordinate(last * 1.01)},${size.height},${chart.timeScale().width()},${last}`;
      if (sig !== prev) {
        prev = sig;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chart, series, getCandles]);

  const width = chart.timeScale().width();
  const scaleW = chart.priceScale("right").width();
  const height = chart.paneSize(0).height;
  const candles = getCandles();
  const last = candles[candles.length - 1]?.close;

  // The ticket preview behaves like a pending order whose entry is the market (or limit) price.
  const draftTrade: PaperTradeDTO | null =
    draft && (draft.orderType === "limit" ? draft.limit : last) !== undefined
      ? {
          id: DRAFT_ID,
          symbol: "",
          side: draft.side,
          orderType: draft.orderType,
          qty: draft.qty,
          leverage: 1,
          limitPrice: draft.orderType === "limit" ? draft.limit : last,
          sl: draft.sl,
          tp: draft.tp,
          status: "pending",
          createdAt: "",
        }
      : null;
  const trades = draftTrade ? [...realTrades, draftTrade] : realTrades;
  if (!trades.length) return null;

  /** Effective levels for a trade: server value ← optimistic override ← live drag. */
  const levels = (t: PaperTradeDTO) => {
    const o = overrides[t.id] ?? {};
    let entry = o.limitPrice ?? t.entryPrice ?? t.limitPrice;
    let sl = "sl" in o ? (o.sl ?? undefined) : t.sl;
    let tp = "tp" in o ? (o.tp ?? undefined) : t.tp;
    if (drag?.id === t.id && drag.moved) {
      if (drag.kind === "entry") entry = drag.price;
      else if (drag.kind === "sl") sl = drag.price;
      else if (drag.kind === "tp") tp = drag.price;
      else if (entry !== undefined) {
        if (kindForDirection(t, entry, drag.price) === "sl") sl = drag.price;
        else tp = drag.price;
      }
    }
    return { entry, sl, tp };
  };

  /** Mirrors the server's rules so invalid drops can be flagged before sending. */
  const isValid = (t: PaperTradeDTO, kind: Kind, price: number, entry: number) => {
    const long = t.side === "long";
    if (kind === "entry") return last === undefined || (long ? price < last : price > last);
    const ref = t.status === "open" ? (last ?? entry) : entry;
    const below = kind === "sl" ? long : !long;
    return below ? price < ref : price > ref;
  };

  const commit = async (id: string, patch: TradePatch) => {
    if (id === DRAFT_ID) {
      onDraftChange?.(patch);
      return;
    }
    setOverrides((o) => ({ ...o, [id]: { ...o[id], ...patch } }));
    try {
      await onModify(id, patch);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setOverrides((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
    }
  };

  const startDrag = (e: React.PointerEvent, t: PaperTradeDTO, kind: Drag["kind"], initial: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const layer = (e.currentTarget as HTMLElement).closest("[data-trade-layer]")!.getBoundingClientRect();
    const startY = e.clientY;
    // Move by the mouse *delta* from where the line was grabbed, so nothing jumps on pickup.
    const startPrice = series.coordinateToPrice(startY - layer.top);
    let state: Drag = { id: t.id, kind, price: initial, moved: false };
    setDrag(state);

    const move = (ev: PointerEvent) => {
      if (!state.moved && Math.abs(ev.clientY - startY) < 4) return; // dead zone: a click never moves
      const p = series.coordinateToPrice(ev.clientY - layer.top);
      if (p === null || startPrice === null) return;
      const price = initial + (p - startPrice);
      if (price <= 0) return;
      state = { ...state, price, moved: true };
      setDrag(state);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (!state.moved) return;
      const { entry } = levels(t);
      if (entry === undefined) return;
      const resolved: Kind = state.kind === "create" ? kindForDirection(t, entry, state.price) : state.kind;
      if (!isValid(t, resolved, state.price, entry)) {
        const long = t.side === "long";
        onError(
          resolved === "entry"
            ? `A ${long ? "buy" : "sell"} limit must be ${long ? "below" : "above"} the market price`
            : `${resolved === "sl" ? "Stop loss" : "Take profit"} would trigger immediately — drop it on the other side of the ${t.status === "open" ? "current" : "limit"} price`,
        );
        return;
      }
      void commit(t.id, resolved === "entry" ? { limitPrice: round(state.price) } : { [resolved]: round(state.price) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const axisTag = (key: string, y: number, color: string, price: number) => (
    <div
      key={key}
      className="absolute -translate-y-1/2 px-1 text-center text-[11px] leading-[18px] text-white tabular-nums"
      style={{ top: y, left: width, width: scaleW, background: color }}
    >
      {formatPrice(price)}
    </div>
  );

  const renderLevel = (t: PaperTradeDTO, kind: "sl" | "tp", price: number, entry: number) => {
    const y = series.priceToCoordinate(price);
    if (y === null || y < -20 || y > height + 20) return null;
    const pnl = (t.side === "long" ? price - entry : entry - price) * t.qty;
    const pct = ((price - entry) / entry) * 100 * (t.side === "long" ? 1 : -1);
    const active = drag?.id === t.id && drag.moved && (drag.kind === kind || drag.kind === "create");
    const valid = isValid(t, kind, price, entry);
    const color = !valid && active ? "#787b86" : kind === "tp" ? UP : DOWN;
    return (
      <div key={`${t.id}-${kind}`}>
        {/* full-width line with a thick invisible grab band */}
        <div
          className="pointer-events-auto absolute left-0 -translate-y-1/2 cursor-ns-resize py-[5px]"
          style={{ top: y, width }}
          onPointerDown={(e) => startDrag(e, t, kind, price)}
        >
          <div className="h-0 border-t border-dashed" style={{ borderColor: color, borderTopWidth: active ? 2 : 1 }} />
        </div>
        <div
          className="pointer-events-auto absolute flex -translate-y-1/2 cursor-ns-resize select-none items-center overflow-hidden rounded-sm text-[11px] font-medium shadow"
          style={{ top: y, right: scaleW + LABEL_GAP, background: color }}
          onPointerDown={(e) => startDrag(e, t, kind, price)}
          title={`Drag to move ${kind === "sl" ? "stop loss" : "take profit"}`}
        >
          <span className="px-1.5 py-px font-bold text-white">{kind.toUpperCase()}</span>
          <span className="bg-black/20 px-1.5 py-px tabular-nums text-white">
            {money(pnl)} ({pct >= 0 ? "+" : ""}
            {pct.toFixed(2)}%)
          </span>
          {!active && (
            <button
              className="px-1.5 py-px text-white/80 hover:bg-black/30 hover:text-white"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void commit(t.id, { [kind]: null })}
              aria-label={`Remove ${kind}`}
              title={`Remove ${kind.toUpperCase()}`}
            >
              ✕
            </button>
          )}
        </div>
        {axisTag(`${t.id}-${kind}-axis`, y, color, price)}
      </div>
    );
  };

  return (
    <div data-trade-layer className="pointer-events-none absolute inset-0 z-3 overflow-hidden" style={{ height: height }}>
      {/* While dragging: a full-screen shield keeps the chart from panning and shows the resize cursor. */}
      {drag && <div className="pointer-events-auto fixed inset-0 z-50 cursor-ns-resize" />}
      {trades.map((t) => {
        const { entry, sl, tp } = levels(t);
        if (entry === undefined) return null;
        const y = series.priceToCoordinate(entry);
        const long = t.side === "long";
        const color = long ? LONG_C : SHORT_C;
        const pending = t.status === "pending";
        const pnl = !pending && last !== undefined ? (long ? last - entry : entry - last) * t.qty : null;
        const rr = sl !== undefined && tp !== undefined ? Math.abs(tp - entry) / Math.abs(entry - sl) : null;
        const creating = drag?.id === t.id && drag.kind === "create" && drag.moved;
        const isDraft = t.id === DRAFT_ID;
        const title = isDraft
          ? `${long ? "BUY" : "SELL"} ${t.orderType === "limit" ? "LMT" : "MKT"} · preview`
          : `${pending ? (long ? "BUY LMT" : "SELL LMT") : long ? "LONG" : "SHORT"} ${t.qty}`;

        return (
          <div key={t.id}>
            {sl !== undefined && renderLevel(t, "sl", sl, entry)}
            {tp !== undefined && renderLevel(t, "tp", tp, entry)}
            {y !== null && y >= -20 && y <= height + 20 && (
              <>
                <div
                  className={`absolute left-0 h-0 -translate-y-1/2 border-t ${pending ? "pointer-events-auto cursor-ns-resize border-dashed py-[5px]" : ""}`}
                  style={{ top: y, width, borderColor: color }}
                  onPointerDown={pending ? (e) => startDrag(e, t, "entry", entry) : undefined}
                />
                <div
                  className="pointer-events-auto absolute flex -translate-y-1/2 select-none items-center overflow-hidden rounded-sm border text-[11px] font-medium shadow"
                  style={{
                    top: y,
                    right: scaleW + LABEL_GAP,
                    borderColor: color,
                    borderStyle: isDraft ? "dashed" : "solid",
                    background: "#131722",
                    cursor: "ns-resize",
                    opacity: isDraft ? 0.92 : 1,
                  }}
                  onPointerDown={(e) => startDrag(e, t, pending ? "entry" : "create", entry)}
                  title={
                    isDraft
                      ? "Order preview — drag to set a limit price; drag SL / TP to set them"
                      : pending
                        ? "Drag to move the order"
                        : "Drag up/down to set take profit / stop loss"
                  }
                >
                  <span className="px-1.5 py-px font-bold text-white" style={{ background: color }}>
                    {title}
                  </span>
                  {pnl !== null && (
                    <span className="px-1.5 py-px tabular-nums" style={{ color: pnl >= 0 ? UP : DOWN }}>
                      {money(pnl)}
                    </span>
                  )}
                  {rr !== null && <span className="px-1 py-px text-[#b2b5be]">R:R {rr.toFixed(2)}</span>}
                  {sl === undefined && !creating && (
                    <span
                      className="cursor-ns-resize px-1.5 py-px font-semibold text-[#f23645] hover:bg-[#f23645]/20"
                      onPointerDown={(e) => startDrag(e, t, "sl", entry)}
                      title="Drag to set stop loss"
                    >
                      SL ⇅
                    </span>
                  )}
                  {tp === undefined && !creating && (
                    <span
                      className="cursor-ns-resize px-1.5 py-px font-semibold text-[#089981] hover:bg-[#089981]/20"
                      onPointerDown={(e) => startDrag(e, t, "tp", entry)}
                      title="Drag to set take profit"
                    >
                      TP ⇅
                    </span>
                  )}
                  {!isDraft && (
                    <button
                      className="px-1.5 py-px text-[#787b86] hover:bg-[#f23645]/20 hover:text-[#f23645]"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => void onClose(t.id).catch((err: Error) => onError(err.message))}
                      title={pending ? "Cancel order" : "Close position at market"}
                    >
                      ✕
                    </button>
                  )}
                </div>
                {axisTag(`${t.id}-entry-axis`, y, color, entry)}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
