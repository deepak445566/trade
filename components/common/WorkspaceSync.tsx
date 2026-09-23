"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { getStream } from "@/lib/streamClient";
import { useAuthStore } from "@/store/authStore";
import { useMarketStore } from "@/store/marketStore";
import { useTradeStore } from "@/store/tradeStore";
import { toWorkspaceDTO, useWorkspaceStore } from "@/store/workspaceStore";
import { create } from "zustand";
import { useToasts } from "./Toaster";

export const useSyncStatus = create<{ state: "idle" | "saving" | "saved" | "error" | "local" }>()(() => ({
  state: "local",
}));

/**
 * Glue between client state and the server:
 *  - restores the session (refresh cookie) and the local workspace
 *  - on login: loads saved workspace, watchlist and alerts
 *  - debounced auto-save of the workspace while logged in
 *  - turns `alert:triggered` stream events into toasts + browser notifications
 */
export default function WorkspaceSync() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?.id);
  const revision = useWorkspaceStore((s) => s.revision);
  const loadedFor = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void useWorkspaceStore.persist.rehydrate();
    void useAuthStore.getState().init();
  }, []);

  // Session changes.
  useEffect(() => {
    if (status === "guest") {
      loadedFor.current = null;
      useMarketStore.getState().resetGuest();
      useTradeStore.getState().clear();
      useSyncStatus.setState({ state: "local" });
      return;
    }
    if (status !== "authenticated" || !userId || loadedFor.current === userId) return;
    loadedFor.current = userId;
    (async () => {
      try {
        const [remote] = await Promise.all([
          api.getWorkspace(),
          useMarketStore.getState().loadForUser(),
          useTradeStore.getState().load(),
        ]);
        if (remote) useWorkspaceStore.getState().replace(remote);
        else await api.saveWorkspace(toWorkspaceDTO(useWorkspaceStore.getState())); // first login: keep guest layout
        useSyncStatus.setState({ state: "saved" });
      } catch (err) {
        useSyncStatus.setState({ state: "error" });
        useToasts.getState().push({ tone: "error", title: "Could not load your workspace", body: (err as Error).message });
      }
    })();
  }, [status, userId]);

  // Debounced auto-save.
  useEffect(() => {
    if (revision === 0 || status !== "authenticated" || loadedFor.current !== userId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    useSyncStatus.setState({ state: "saving" });
    saveTimer.current = setTimeout(() => {
      api
        .saveWorkspace(toWorkspaceDTO(useWorkspaceStore.getState()))
        .then(() => useSyncStatus.setState({ state: "saved" }))
        .catch(() => useSyncStatus.setState({ state: "error" }));
    }, 1200);
  }, [revision, status, userId]);

  // Triggered alerts.
  useEffect(
    () =>
      getStream().onAlert((e) => {
        useMarketStore.getState().markTriggered(e.alertId, e.price);
        const title = `🔔 ${e.symbol} ${e.condition.replace("price_", "").replace("_", " ")} ${formatPrice(e.targetPrice)}`;
        const body = `Price is now ${formatPrice(e.price)}`;
        useToasts.getState().push({ tone: "alert", title, body });
        beep();
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification(title, { body, tag: e.alertId });
          } catch {}
        }
      }),
    [],
  );

  // Paper trade fills / closes pushed by the server engine.
  useEffect(
    () =>
      getStream().onTrade(({ trade, account, kind }) => {
        useTradeStore.getState().apply(trade, account);
        if (kind === "updated") return;
        const side = trade.side === "long" ? "Long" : "Short";
        if (kind === "filled") {
          useToasts.getState().push({
            tone: "info",
            title: `Order filled: ${side} ${trade.qty} ${trade.symbol}`,
            body: `Entry ${formatPrice(trade.entryPrice)}`,
          });
        } else {
          const pnl = trade.pnl ?? 0;
          const why = { tp: "Take profit hit", sl: "Stop loss hit", liquidation: "Liquidated", manual: "Closed" }[
            trade.closeReason ?? "manual"
          ];
          useToasts.getState().push({
            tone: pnl >= 0 ? "info" : "error",
            title: `${why}: ${side} ${trade.symbol}`,
            body: `Exit ${formatPrice(trade.exitPrice)} · P&L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD`,
          });
          beep();
        }
      }),
    [],
  );

  return null;
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => void ctx.close();
  } catch {}
}
