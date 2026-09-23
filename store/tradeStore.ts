"use client";

import { create } from "zustand";
import { api, type OrderInput, type TradePatch } from "@/lib/api";
import type { PaperAccountDTO, PaperTradeDTO, TradeSide } from "@/types";

/** Prefill for the order ticket (from chart Buy/Sell buttons or a long/short drawing). */
export interface TicketPrefill {
  symbol: string;
  side: TradeSide;
  orderType?: "market" | "limit";
  price?: number;
  sl?: number;
  tp?: number;
  nonce: number;
}

/**
 * The order being prepared in the ticket. Shared with the chart so entry / SL / TP
 * can be dragged on the chart before the order is placed (TradingView-style).
 * Prices are strings because they mirror the input fields.
 */
export interface OrderDraft {
  symbol?: string; // undefined → the active chart's symbol
  side: TradeSide;
  orderType: "market" | "limit";
  qty: string;
  limit: string;
  sl: string;
  tp: string;
}

const EMPTY_DRAFT: OrderDraft = { side: "long", orderType: "market", qty: "", limit: "", sl: "", tp: "" };

interface TradeState {
  account: PaperAccountDTO | null;
  trades: PaperTradeDTO[];
  ticket: TicketPrefill | null;
  draft: OrderDraft;
  ticketOpen: boolean;
  setDraft: (patch: Partial<OrderDraft>) => void;
  setTicketOpen: (open: boolean) => void;
  load: () => Promise<void>;
  clear: () => void;
  place: (o: OrderInput) => Promise<PaperTradeDTO>;
  modify: (id: string, patch: TradePatch) => Promise<void>;
  close: (id: string) => Promise<void>;
  reset: () => Promise<void>;
  apply: (trade: PaperTradeDTO, account?: PaperAccountDTO) => void;
  openTicket: (p: Omit<TicketPrefill, "nonce">) => void;
}

let nonce = 0;

export const useTradeStore = create<TradeState>()((set, get) => ({
  account: null,
  trades: [],
  ticket: null,
  draft: EMPTY_DRAFT,
  ticketOpen: false,

  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  setTicketOpen: (ticketOpen) => set({ ticketOpen }),

  load: async () => {
    const { account, trades } = await api.getPaper();
    set({ account, trades });
  },

  clear: () => set({ account: null, trades: [] }),

  place: async (o) => {
    const { trade, account } = await api.placeOrder(o);
    get().apply(trade, account);
    return trade;
  },

  modify: async (id, patch) => {
    const { trade, account } = await api.modifyOrder(id, patch);
    get().apply(trade, account);
  },

  close: async (id) => {
    const { trade, account } = await api.closeOrder(id);
    get().apply(trade, account);
  },

  reset: async () => {
    const { account, trades } = await api.resetPaper();
    set({ account, trades });
  },

  /** Upsert a trade (from an API response or a live `trade:update` event). */
  apply: (trade, account) =>
    set((s) => {
      const exists = s.trades.some((t) => t.id === trade.id);
      return {
        trades: exists ? s.trades.map((t) => (t.id === trade.id ? trade : t)) : [trade, ...s.trades],
        account: account ?? s.account,
      };
    }),

  openTicket: (p) =>
    set((s) => ({
      ticket: { ...p, nonce: ++nonce },
      draft: {
        ...s.draft,
        symbol: p.symbol,
        side: p.side,
        orderType: p.orderType ?? "market",
        limit: p.price ? String(p.price) : "",
        sl: p.sl ? String(p.sl) : "",
        tp: p.tp ? String(p.tp) : "",
      },
    })),
}));

export const isActive = (t: PaperTradeDTO) => t.status === "open" || t.status === "pending";

export function unrealizedPnl(t: PaperTradeDTO, price: number | undefined) {
  if (t.status !== "open" || t.entryPrice === undefined || price === undefined) return 0;
  return (t.side === "long" ? price - t.entryPrice : t.entryPrice - price) * t.qty;
}
