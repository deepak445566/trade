"use client";

import Link from "next/link";
import { useState } from "react";
import { cx, formatPrice } from "@/lib/format";
import { useAuthStore } from "@/store/authStore";
import { useChartStore } from "@/store/chartStore";
import { useMarketStore } from "@/store/marketStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import type { AlertCondition } from "@/types";

const CONDITION_LABEL: Record<AlertCondition, string> = {
  price_above: "Price above",
  price_below: "Price below",
  crosses: "Crosses",
};

export default function AlertsPanel() {
  const status = useAuthStore((s) => s.status);
  if (status !== "authenticated") {
    return (
      <div className="p-4 text-sm text-[#b2b5be]">
        <p className="mb-3">Price alerts run on the server and notify you even when this tab is in the background.</p>
        <Link href="/login?next=/dashboard" className="inline-block rounded bg-[#2962ff] px-3 py-1.5 text-white hover:bg-[#1e53e5]">
          Log in to use alerts
        </Link>
      </div>
    );
  }
  return <AlertsInner />;
}

function AlertsInner() {
  const alerts = useMarketStore((s) => s.alerts);
  const createAlert = useMarketStore((s) => s.createAlert);
  const deleteAlert = useMarketStore((s) => s.deleteAlert);
  const activeChart = useWorkspaceStore((s) => s.charts.find((c) => c.id === s.activeChartId));
  const lastPrice = useChartStore((s) => (activeChart ? s.lastPrice[activeChart.id] : undefined));

  const symbol = activeChart?.symbol ?? "BTCUSDT";
  const [condition, setCondition] = useState<AlertCondition>("crosses");
  const [price, setPrice] = useState("");
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPrice = Number(price || lastPrice);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) return setError("Enter a target price");
    setBusy(true);
    setError(null);
    try {
      await createAlert({ symbol, condition, targetPrice, notifyVia: email ? ["push", "email"] : ["push"] });
      setPrice("");
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const active = alerts.filter((a) => a.status === "active");
  const triggered = alerts.filter((a) => a.status === "triggered");

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={submit} className="space-y-2 border-b border-[#2a2e39] p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#787b86]">
          New alert · <span className="text-[#d1d4dc]">{symbol}</span>
        </h2>
        <div className="flex gap-2">
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as AlertCondition)}
            className="flex-1 rounded border border-[#2a2e39] bg-[#131722] px-2 py-1.5 text-sm text-[#d1d4dc]"
            aria-label="Condition"
          >
            {Object.entries(CONDITION_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={lastPrice ? String(lastPrice) : "Price"}
            className="w-28 rounded border border-[#2a2e39] bg-[#131722] px-2 py-1.5 text-sm text-[#d1d4dc]"
            aria-label="Target price"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-[#b2b5be]">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          Also notify by email
        </label>
        {error && <p className="text-xs text-[#f23645]">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-[#2962ff] py-1.5 text-sm font-medium text-white hover:bg-[#1e53e5] disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create alert"}
        </button>
      </form>

      <div className="flex-1 overflow-y-auto">
        <Section title={`Active (${active.length})`}>
          {active.map((a) => (
            <AlertRow key={a.id} text={`${a.symbol} · ${CONDITION_LABEL[a.condition]} ${formatPrice(a.targetPrice)}`} onDelete={() => deleteAlert(a.id)} />
          ))}
          {!active.length && <Empty>No active alerts.</Empty>}
        </Section>
        {triggered.length > 0 && (
          <Section title={`Triggered (${triggered.length})`}>
            {triggered.map((a) => (
              <AlertRow
                key={a.id}
                muted
                text={`${a.symbol} · ${CONDITION_LABEL[a.condition]} ${formatPrice(a.targetPrice)}`}
                sub={a.triggeredAt ? `Hit ${formatPrice(a.triggeredPrice)} · ${new Date(a.triggeredAt).toLocaleString()}` : undefined}
                onDelete={() => deleteAlert(a.id)}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <h3 className="px-3 pb-1 text-[11px] uppercase tracking-wide text-[#5d606b]">{title}</h3>
      <ul>{children}</ul>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="px-3 py-1 text-xs text-[#787b86]">{children}</li>;
}

function AlertRow({ text, sub, muted, onDelete }: { text: string; sub?: string; muted?: boolean; onDelete: () => void }) {
  return (
    <li className="group flex items-center gap-2 px-3 py-1.5 hover:bg-[#2a2e39]">
      <span className={cx("text-sm", muted ? "text-[#787b86]" : "text-[#f5a623]")}>🔔</span>
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate text-sm", muted ? "text-[#787b86]" : "text-[#d1d4dc]")}>{text}</span>
        {sub && <span className="block truncate text-[11px] text-[#5d606b]">{sub}</span>}
      </span>
      <button onClick={onDelete} className="text-xs text-[#787b86] opacity-0 hover:text-[#f23645] group-hover:opacity-100" aria-label="Delete alert">
        ✕
      </button>
    </li>
  );
}
