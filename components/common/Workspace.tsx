"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import ChartGrid from "@/components/chart/ChartGrid";
import Watchlist from "@/components/watchlist/Watchlist";
import AlertsPanel from "@/components/alerts/AlertsPanel";
import TradePanel from "@/components/trade/TradePanel";
import { useTradeStore } from "@/store/tradeStore";
import { cx } from "@/lib/format";
import { useMarketStore } from "@/store/marketStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import TopBar from "./TopBar";
import Toaster from "./Toaster";
import WorkspaceSync from "./WorkspaceSync";

type Tab = "watchlist" | "trade" | "alerts";

// `persist` is only attached in the browser (no localStorage during SSR).
const subscribeHydration = (cb: () => void) => useWorkspaceStore.persist?.onFinishHydration(cb) ?? (() => {});
const getHydrated = () => useWorkspaceStore.persist?.hasHydrated() ?? false;

export default function Workspace() {
  // null = responsive default (open on desktop, closed on phones).
  const [sidebarOpen, setSidebarOpen] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("watchlist");
  const activeAlerts = useMarketStore((s) => s.alerts.filter((a) => a.status === "active").length);

  // Wait for the persisted workspace so charts don't mount twice with different symbols.
  const hydrated = useSyncExternalStore(subscribeHydration, getHydrated, () => false);
  const openPositions = useTradeStore((s) => s.trades.filter((t) => t.status === "open").length);

  // Chart Buy/Sell buttons & long/short drawings open the order ticket.
  useEffect(
    () =>
      useTradeStore.subscribe((s, prev) => {
        if (s.ticket && s.ticket.nonce !== prev.ticket?.nonce) {
          setTab("trade");
          setSidebarOpen(true);
        }
      }),
    [],
  );

  const isOpen = () => sidebarOpen ?? window.matchMedia("(min-width: 768px)").matches;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#131722] text-[#d1d4dc]">
      <WorkspaceSync />
      <TopBar sidebarOpen={sidebarOpen !== false} onToggleSidebar={() => setSidebarOpen(!isOpen())} />
      <div className="relative flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">{hydrated && <ChartGrid />}</main>
        <aside
          className={cx(
            "flex w-80 shrink-0 flex-col border-l border-[#2a2e39] bg-[#131722]",
            "max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:shadow-2xl",
            sidebarOpen === false && "hidden",
            sidebarOpen === null && "max-md:hidden",
          )}
        >
          <div className="flex border-b border-[#2a2e39]" role="tablist">
            {(["watchlist", "trade", "alerts"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cx(
                  "flex-1 py-2 text-xs font-medium capitalize",
                  tab === t ? "border-b-2 border-[#2962ff] text-[#d1d4dc]" : "text-[#787b86] hover:text-[#d1d4dc]",
                )}
              >
                {t}
                {t === "trade" && openPositions > 0 && (
                  <span className="ml-1 rounded-full bg-[#2962ff]/20 px-1.5 text-[10px] text-[#2962ff]">{openPositions}</span>
                )}
                {t === "alerts" && activeAlerts > 0 && (
                  <span className="ml-1 rounded-full bg-[#f5a623]/20 px-1.5 text-[10px] text-[#f5a623]">{activeAlerts}</span>
                )}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {tab === "watchlist" ? <Watchlist /> : tab === "trade" ? <TradePanel /> : <AlertsPanel />}
          </div>
        </aside>
      </div>
      <Toaster />
    </div>
  );
}
