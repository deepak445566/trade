"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { AlertDTO, WatchlistItem } from "@/types";

const GUEST_WATCHLIST: WatchlistItem[] = ["XAUUSD", "XAGUSD", "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"].map(
  (symbol) => ({ symbol, type: "crypto" }),
);

const isAuthed = () => useAuthStore.getState().status === "authenticated";

/** Watchlist + alerts (server-backed for logged-in users, local defaults for guests). */
interface MarketState {
  watchlist: WatchlistItem[];
  alerts: AlertDTO[];
  loadForUser: () => Promise<void>;
  resetGuest: () => void;
  addSymbol: (symbol: string) => Promise<void>;
  removeSymbol: (symbol: string) => Promise<void>;
  createAlert: (a: Parameters<typeof api.createAlert>[0]) => Promise<void>;
  deleteAlert: (id: string) => Promise<void>;
  markTriggered: (id: string, price: number) => void;
}

export const useMarketStore = create<MarketState>()((set, get) => ({
  watchlist: GUEST_WATCHLIST,
  alerts: [],

  loadForUser: async () => {
    const [watchlist, alerts] = await Promise.all([api.getWatchlist(), api.getAlerts()]);
    set({ watchlist, alerts });
  },

  resetGuest: () => set({ watchlist: GUEST_WATCHLIST, alerts: [] }),

  addSymbol: async (symbol) => {
    if (get().watchlist.some((w) => w.symbol === symbol)) return;
    set((s) => ({ watchlist: [...s.watchlist, { symbol, type: "crypto" }] }));
    if (isAuthed()) set({ watchlist: await api.addToWatchlist(symbol) });
  },

  removeSymbol: async (symbol) => {
    set((s) => ({ watchlist: s.watchlist.filter((w) => w.symbol !== symbol) }));
    if (isAuthed()) set({ watchlist: await api.removeFromWatchlist(symbol) });
  },

  createAlert: async (a) => {
    const alert = await api.createAlert(a);
    set((s) => ({ alerts: [alert, ...s.alerts] }));
  },

  deleteAlert: async (id) => {
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) }));
    await api.deleteAlert(id);
  },

  markTriggered: (id, price) =>
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.id === id ? { ...a, status: "triggered", triggeredPrice: price, triggeredAt: new Date().toISOString() } : a,
      ),
    })),
}));
