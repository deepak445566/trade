"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLivePrices } from "@/hooks/useWebSocket";
import { cx, formatPrice } from "@/lib/format";
import { useAuthStore } from "@/store/authStore";
import { useChartStore } from "@/store/chartStore";
import { isActive, unrealizedPnl, useTradeStore } from "@/store/tradeStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import type { PaperTradeDTO, TradeSide } from "@/types";

const LEVERAGES = [1, 2, 5, 10, 20, 50, 100];
const usd = (v: number) =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedUsd = (v: number) => `${v > 0 ? "+" : ""}${usd(v)}`;
const pnlColor = (v: number) => (v > 0 ? "text-[#089981]" : v < 0 ? "text-[#f23645]" : "text-[#b2b5be]");
const input =
  "w-full rounded border border-[#2a2e39] bg-[#131722] px-2 py-1.5 text-sm text-[#d1d4dc] placeholder:text-[#5d606b] focus:border-[#2962ff] focus:outline-none";

export default function TradePanel() {
  const status = useAuthStore((s) => s.status);
  if (status !== "authenticated") {
    return (
      <div className="p-4 text-sm text-[#b2b5be]">
        <p className="mb-1 font-medium text-[#d1d4dc]">Paper trading</p>
        <p className="mb-3">
          Practice with a virtual $10,000 account — market & limit orders, stop loss / take profit and leverage on live
          prices. Orders are filled on the server even when this tab is closed.
        </p>
        <Link href="/login?next=/dashboard" className="inline-block rounded bg-[#2962ff] px-3 py-1.5 text-white hover:bg-[#1e53e5]">
          Log in to start trading
        </Link>
      </div>
    );
  }
  return <TradeInner />;
}

function TradeInner() {
  const account = useTradeStore((s) => s.account);
  const trades = useTradeStore((s) => s.trades);
  const ticket = useTradeStore((s) => s.ticket);
  const reset = useTradeStore((s) => s.reset);
  const [view, setView] = useState<"positions" | "orders" | "history">("positions");

  const open = trades.filter((t) => t.status === "open");
  const pending = trades.filter((t) => t.status === "pending");
  const history = trades.filter((t) => !isActive(t)).slice(0, 50);
  const prices = useLivePrices(trades.filter(isActive).map((t) => t.symbol));

  const unrealized = open.reduce((s, t) => s + unrealizedPnl(t, prices[t.symbol]), 0);
  const used = trades
    .filter(isActive)
    .reduce((s, t) => s + ((t.entryPrice ?? t.limitPrice ?? 0) * t.qty) / t.leverage, 0);
  const balance = account?.balance ?? 0;
  const equity = balance + unrealized;
  const ret = account ? ((equity - account.startingBalance) / account.startingBalance) * 100 : 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Account */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-[#2a2e39] p-3 text-xs">
        <Stat label="Balance" value={usd(balance)} />
        <Stat label="Equity" value={usd(equity)} className={pnlColor(ret)} sub={`${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`} />
        <Stat label="Unrealized P&L" value={signedUsd(unrealized)} className={pnlColor(unrealized)} />
        <Stat label="Free margin" value={usd(balance - used)} />
      </div>

      <OrderTicket key={ticket?.nonce ?? 0} freeMargin={balance - used} />

      {/* Lists */}
      <div className="flex border-y border-[#2a2e39] text-xs">
        {(
          [
            ["positions", `Positions (${open.length})`],
            ["orders", `Orders (${pending.length})`],
            ["history", "History"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={cx(
              "flex-1 py-2",
              view === id ? "border-b-2 border-[#2962ff] text-[#d1d4dc]" : "text-[#787b86] hover:text-[#d1d4dc]",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="min-h-24 flex-1">
        {view === "positions" &&
          (open.length ? open.map((t) => <PositionRow key={t.id} trade={t} price={prices[t.symbol]} />) : <Empty>No open positions.</Empty>)}
        {view === "orders" &&
          (pending.length ? pending.map((t) => <PositionRow key={t.id} trade={t} price={prices[t.symbol]} />) : <Empty>No pending orders.</Empty>)}
        {view === "history" &&
          (history.length ? history.map((t) => <HistoryRow key={t.id} trade={t} />) : <Empty>No closed trades yet.</Empty>)}
      </ul>
      <div className="border-t border-[#2a2e39] p-2 text-right">
        <button
          onClick={() => {
            if (confirm("Reset paper account to $10,000 and delete all paper trades?")) void reset();
          }}
          className="text-[11px] text-[#787b86] hover:text-[#f23645]"
        >
          Reset paper account
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#5d606b]">{label}</div>
      <div className={cx("tabular-nums text-[#d1d4dc]", className)}>
        {value} {sub && <span className="text-[10px]">{sub}</span>}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="px-3 py-4 text-center text-xs text-[#787b86]">{children}</li>;
}

// ---------------- Order ticket ----------------

function OrderTicket({ freeMargin }: { freeMargin: number }) {
  const activeChart = useWorkspaceStore((s) => s.charts.find((c) => c.id === s.activeChartId));
  const place = useTradeStore((s) => s.place);
  const draft = useTradeStore((s) => s.draft);
  const setDraft = useTradeStore((s) => s.setDraft);
  const setTicketOpen = useTradeStore((s) => s.setTicketOpen);
  const symbol = draft.symbol ?? activeChart?.symbol ?? "BTCUSDT";

  // While the ticket is on screen the chart shows draggable entry / SL / TP previews.
  useEffect(() => {
    setTicketOpen(true);
    return () => setTicketOpen(false);
  }, [setTicketOpen]);
  const chartPrice = useChartStore((s) => (activeChart && activeChart.symbol === symbol ? s.lastPrice[activeChart.id] : undefined));
  const livePrices = useLivePrices([symbol]);
  const market = livePrices[symbol] ?? chartPrice;

  const { side, orderType, qty, limit, sl, tp } = draft;
  // Flipping side invalidates SL/TP (they swap sides), so clear them.
  const setSide = (v: TradeSide) => setDraft(v === side ? {} : { side: v, sl: "", tp: "" });
  const setOrderType = (v: "market" | "limit") => setDraft({ orderType: v });
  const setQty = (v: string) => setDraft({ qty: v });
  const setLimit = (v: string) => setDraft({ limit: v });
  const setSl = (v: string) => setDraft({ sl: v });
  const setTp = (v: string) => setDraft({ tp: v });
  const [leverage, setLeverage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const long = side === "long";
  const entry = orderType === "limit" ? Number(limit) || undefined : market;
  const q = Number(qty) || 0;
  const margin = entry ? (entry * q) / leverage : 0;
  const risk = entry && Number(sl) ? Math.abs(entry - Number(sl)) * q : undefined;
  const reward = entry && Number(tp) ? Math.abs(Number(tp) - entry) * q : undefined;
  const rr = risk && reward ? reward / risk : undefined;

  const setPct = (pct: number) => {
    if (!entry) return;
    const raw = (Math.max(freeMargin, 0) * pct * leverage) / entry;
    const decimals = entry > 1000 ? 4 : entry > 1 ? 2 : 0;
    setQty(String(Math.floor(raw * 10 ** decimals) / 10 ** decimals));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const t = await place({
        symbol,
        side,
        orderType,
        qty: q,
        leverage,
        limitPrice: orderType === "limit" ? Number(limit) : undefined,
        sl: Number(sl) || undefined,
        tp: Number(tp) || undefined,
      });
      setMsg({
        ok: true,
        text:
          t.status === "open"
            ? `${long ? "Bought" : "Sold"} ${t.qty} ${symbol} @ ${formatPrice(t.entryPrice)}`
            : `${long ? "Buy" : "Sell"} limit placed @ ${formatPrice(t.limitPrice)}`,
      });
      setDraft({ qty: "", sl: "", tp: "", limit: "" });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[#d1d4dc]">{symbol}</span>
        <span className="text-xs tabular-nums text-[#b2b5be]">{market ? formatPrice(market) : "…"}</span>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded bg-[#131722] p-0.5">
        {(["long", "short"] as const).map((sd) => (
          <button
            type="button"
            key={sd}
            onClick={() => setSide(sd)}
            className={cx(
              "rounded py-1.5 text-sm font-medium",
              side === sd ? (sd === "long" ? "bg-[#089981] text-white" : "bg-[#f23645] text-white") : "text-[#787b86]",
            )}
          >
            {sd === "long" ? "Buy / Long" : "Sell / Short"}
          </button>
        ))}
      </div>

      <div className="flex gap-1 text-xs">
        {(["market", "limit"] as const).map((ot) => (
          <button
            type="button"
            key={ot}
            onClick={() => setOrderType(ot)}
            className={cx("rounded px-2 py-1 capitalize", orderType === ot ? "bg-[#2a2e39] text-[#d1d4dc]" : "text-[#787b86] hover:text-[#d1d4dc]")}
          >
            {ot}
          </button>
        ))}
        <select
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="ml-auto rounded bg-[#2a2e39] px-1 text-xs text-[#d1d4dc]"
          aria-label="Leverage"
        >
          {LEVERAGES.map((l) => (
            <option key={l} value={l}>
              {l}x
            </option>
          ))}
        </select>
      </div>

      {orderType === "limit" && (
        <input className={input} type="number" step="any" min="0" placeholder="Limit price" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Limit price" />
      )}
      <input className={input} type="number" step="any" min="0" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
      <div className="flex gap-1">
        {[0.1, 0.25, 0.5, 1].map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => setPct(p)}
            className="flex-1 rounded bg-[#2a2e39] py-0.5 text-[11px] text-[#b2b5be] hover:bg-[#363a45]"
          >
            {p * 100}%
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={input} type="number" step="any" min="0" placeholder="Stop loss" value={sl} onChange={(e) => setSl(e.target.value)} aria-label="Stop loss" />
        <input className={input} type="number" step="any" min="0" placeholder="Take profit" value={tp} onChange={(e) => setTp(e.target.value)} aria-label="Take profit" />
      </div>

      {entry !== undefined && (
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="flex gap-0.5">
            {[0.5, 1, 2].map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setSl(String(Number((entry * (long ? 1 - p / 100 : 1 + p / 100)).toPrecision(8))))}
                className="flex-1 rounded bg-[#f23645]/15 py-0.5 text-[#f23645] hover:bg-[#f23645]/25"
                title={`Stop loss ${p}% from entry`}
              >
                -{p}%
              </button>
            ))}
          </div>
          <div className="flex gap-0.5">
            {[1, 2, 3].map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setTp(String(Number((entry * (long ? 1 + p / 100 : 1 - p / 100)).toPrecision(8))))}
                className="flex-1 rounded bg-[#089981]/15 py-0.5 text-[#089981] hover:bg-[#089981]/25"
                title={`Take profit ${p}% from entry`}
              >
                +{p}%
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[#5d606b]">
        Tip: drag the SL / TP handles on the chart to set them — before or after placing the order.
      </p>

      <div className="space-y-0.5 text-[11px] text-[#787b86]">
        <Row k="Margin" v={q ? usd(margin) : "—"} />
        {risk !== undefined && <Row k="Risk (to SL)" v={usd(risk)} className="text-[#f23645]" />}
        {reward !== undefined && <Row k="Reward (to TP)" v={usd(reward)} className="text-[#089981]" />}
        {rr !== undefined && <Row k="Risk : Reward" v={`1 : ${rr.toFixed(2)}`} />}
      </div>

      {msg && <p className={cx("text-xs", msg.ok ? "text-[#089981]" : "text-[#f23645]")}>{msg.text}</p>}
      <button
        disabled={busy || !q}
        className={cx(
          "w-full rounded py-2 text-sm font-semibold text-white disabled:opacity-50",
          long ? "bg-[#089981] hover:bg-[#07806c]" : "bg-[#f23645] hover:bg-[#d92f3d]",
        )}
      >
        {busy ? "Placing…" : `${long ? "Buy" : "Sell"} ${symbol}${orderType === "limit" ? " limit" : ""}`}
      </button>
    </form>
  );
}

function Row({ k, v, className }: { k: string; v: string; className?: string }) {
  return (
    <div className="flex justify-between">
      <span>{k}</span>
      <span className={cx("tabular-nums text-[#b2b5be]", className)}>{v}</span>
    </div>
  );
}

// ---------------- Rows ----------------

function PositionRow({ trade: t, price }: { trade: PaperTradeDTO; price?: number }) {
  const close = useTradeStore((s) => s.close);
  const modify = useTradeStore((s) => s.modify);
  const activeChartId = useWorkspaceStore((s) => s.activeChartId);
  const updateChart = useWorkspaceStore((s) => s.updateChart);
  const [editing, setEditing] = useState(false);
  const [sl, setSl] = useState(t.sl ? String(t.sl) : "");
  const [tp, setTp] = useState(t.tp ? String(t.tp) : "");
  const [err, setErr] = useState<string | null>(null);
  const pnl = unrealizedPnl(t, price);
  const pct = useMemo(() => (t.entryPrice ? (pnl / ((t.entryPrice * t.qty) / t.leverage)) * 100 : 0), [pnl, t]);
  const pending = t.status === "pending";

  const save = async () => {
    setErr(null);
    try {
      await modify(t.id, { sl: Number(sl) || null, tp: Number(tp) || null });
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <li className="border-b border-[#2a2e39]/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className={cx("rounded px-1 text-[10px] font-bold uppercase", t.side === "long" ? "bg-[#089981]/20 text-[#089981]" : "bg-[#f23645]/20 text-[#f23645]")}>
          {t.side}
        </span>
        <button onClick={() => updateChart(activeChartId, { symbol: t.symbol })} className="font-medium text-[#d1d4dc] hover:underline">
          {t.symbol}
        </button>
        <span className="text-[#787b86]">{t.leverage > 1 ? `${t.leverage}x` : ""}</span>
        {pending ? (
          <span className="ml-auto text-[#787b86]">limit @ {formatPrice(t.limitPrice)}</span>
        ) : (
          <span className={cx("ml-auto tabular-nums", pnlColor(pnl))}>
            {signedUsd(pnl)} <span className="text-[10px]">({pct.toFixed(2)}%)</span>
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[#787b86]">
        <span className="tabular-nums">
          {t.qty} @ {formatPrice(t.entryPrice ?? t.limitPrice)}
          {price && !pending ? ` → ${formatPrice(price)}` : ""}
        </span>
        <span className="ml-auto flex gap-2">
          <button onClick={() => setEditing((e) => !e)} className="hover:text-[#d1d4dc]">
            SL/TP
          </button>
          <button onClick={() => void close(t.id).catch((e: Error) => setErr(e.message))} className="hover:text-[#f23645]">
            {pending ? "Cancel" : "Close"}
          </button>
        </span>
      </div>
      {!editing && (t.sl || t.tp) && (
        <div className="mt-0.5 text-[11px] text-[#5d606b]">
          {t.sl ? <span className="text-[#f23645]/80">SL {formatPrice(t.sl)}</span> : null} {t.tp ? <span className="text-[#089981]/80">TP {formatPrice(t.tp)}</span> : null}
        </div>
      )}
      {editing && (
        <div className="mt-1.5 flex gap-1">
          <input className={cx(input, "py-1 text-xs")} type="number" step="any" placeholder="SL" value={sl} onChange={(e) => setSl(e.target.value)} aria-label="Stop loss" />
          <input className={cx(input, "py-1 text-xs")} type="number" step="any" placeholder="TP" value={tp} onChange={(e) => setTp(e.target.value)} aria-label="Take profit" />
          <button onClick={() => void save()} className="rounded bg-[#2962ff] px-2 text-white">
            Save
          </button>
        </div>
      )}
      {err && <p className="mt-1 text-[#f23645]">{err}</p>}
    </li>
  );
}

const REASON: Record<string, string> = { tp: "Take profit", sl: "Stop loss", manual: "Closed", liquidation: "Liquidated" };

function HistoryRow({ trade: t }: { trade: PaperTradeDTO }) {
  const cancelled = t.status === "cancelled";
  return (
    <li className="flex items-center gap-2 border-b border-[#2a2e39]/60 px-3 py-1.5 text-xs">
      <span className={cx("w-10 text-[10px] font-bold uppercase", t.side === "long" ? "text-[#089981]" : "text-[#f23645]")}>{t.side}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[#d1d4dc]">
          {t.symbol} · {t.qty}
        </span>
        <span className="block text-[10px] text-[#5d606b]">
          {cancelled ? "Cancelled" : `${formatPrice(t.entryPrice)} → ${formatPrice(t.exitPrice)} · ${REASON[t.closeReason ?? "manual"]}`}
        </span>
      </span>
      {!cancelled && <span className={cx("tabular-nums", pnlColor(t.pnl ?? 0))}>{signedUsd(t.pnl ?? 0)}</span>}
    </li>
  );
}
