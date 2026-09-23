"use client";

import { create } from "zustand";
import type { DrawingType } from "@/types";

/** Transient per-chart UI state (not persisted): active drawing tool, last price. */
interface ChartUIState {
  tools: Record<string, DrawingType | null>;
  lastPrice: Record<string, number>;
  setTool: (chartId: string, tool: DrawingType | null) => void;
  setLastPrice: (chartId: string, price: number) => void;
}

export const useChartStore = create<ChartUIState>()((set) => ({
  tools: {},
  lastPrice: {},
  setTool: (chartId, tool) => set((s) => ({ tools: { ...s.tools, [chartId]: tool } })),
  setLastPrice: (chartId, price) =>
    set((s) => (s.lastPrice[chartId] === price ? s : { lastPrice: { ...s.lastPrice, [chartId]: price } })),
}));
