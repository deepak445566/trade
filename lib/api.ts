"use client";

import { useAuthStore } from "@/store/authStore";
import type {
  AlertCondition,
  AlertDTO,
  Candle,
  PaperAccountDTO,
  PaperTradeDTO,
  SymbolInfo,
  Timeframe,
  TradeSide,
  WatchlistItem,
  WorkspaceDTO,
} from "@/types";

export interface OrderInput {
  symbol: string;
  side: TradeSide;
  orderType: "market" | "limit";
  qty: number;
  limitPrice?: number;
  sl?: number;
  tp?: number;
  leverage?: number;
}

export type TradePatch = { sl?: number | null; tp?: number | null; limitPrice?: number };

type PaperResult = { trade: PaperTradeDTO; account: PaperAccountDTO };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** fetch wrapper: JSON in/out, bearer token, one transparent refresh+retry on 401. */
export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const doFetch = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.json !== undefined) headers.set("Content-Type", "application/json");
    return fetch(path, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  };

  const auth = useAuthStore.getState();
  let res = await doFetch(auth.accessToken);
  if (res.status === 401 && auth.accessToken) {
    const token = await auth.refresh();
    if (token) res = await doFetch(token);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  candles: (symbol: string, tf: Timeframe, opts: { limit?: number; to?: number } = {}) => {
    const q = new URLSearchParams({ symbol, tf, limit: String(opts.limit ?? 500) });
    if (opts.to) q.set("to", String(opts.to));
    return apiFetch<{ candles: Candle[] }>(`/api/candles?${q}`).then((r) => r.candles);
  },
  searchSymbols: (q: string, signal?: AbortSignal) =>
    apiFetch<{ symbols: SymbolInfo[] }>(`/api/symbols/search?q=${encodeURIComponent(q)}`, { signal }).then(
      (r) => r.symbols,
    ),

  getWatchlist: () => apiFetch<{ symbols: WatchlistItem[] }>("/api/watchlist").then((r) => r.symbols),
  addToWatchlist: (symbol: string) =>
    apiFetch<{ symbols: WatchlistItem[] }>("/api/watchlist", { method: "POST", json: { symbol, type: "crypto" } }).then(
      (r) => r.symbols,
    ),
  removeFromWatchlist: (symbol: string) =>
    apiFetch<{ symbols: WatchlistItem[] }>(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" }).then(
      (r) => r.symbols,
    ),

  getAlerts: () => apiFetch<{ alerts: AlertDTO[] }>("/api/alerts").then((r) => r.alerts),
  createAlert: (a: { symbol: string; condition: AlertCondition; targetPrice: number; notifyVia: ("push" | "email")[] }) =>
    apiFetch<{ alert: AlertDTO }>("/api/alerts", { method: "POST", json: { ...a, type: "crypto" } }).then(
      (r) => r.alert,
    ),
  deleteAlert: (id: string) => apiFetch<{ ok: true }>(`/api/alerts/${id}`, { method: "DELETE" }),

  getPaper: () => apiFetch<{ account: PaperAccountDTO; trades: PaperTradeDTO[] }>("/api/paper"),
  placeOrder: (o: OrderInput) => apiFetch<PaperResult>("/api/paper/orders", { method: "POST", json: o }),
  modifyOrder: (id: string, patch: TradePatch) =>
    apiFetch<PaperResult>(`/api/paper/orders/${id}`, { method: "PATCH", json: patch }),
  closeOrder: (id: string) => apiFetch<PaperResult>(`/api/paper/orders/${id}`, { method: "DELETE" }),
  resetPaper: () =>
    apiFetch<{ account: PaperAccountDTO; trades: PaperTradeDTO[] }>("/api/paper/reset", { method: "POST" }),

  getWorkspace: () => apiFetch<{ workspace: WorkspaceDTO | null }>("/api/workspace").then((r) => r.workspace),
  saveWorkspace: (ws: WorkspaceDTO) =>
    apiFetch<{ workspace: WorkspaceDTO }>("/api/workspace", { method: "POST", json: ws }).then((r) => r.workspace),
};
