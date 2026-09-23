"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultChart, defaultWorkspace, DEFAULT_SYMBOLS, MAX_CHARTS, sanitizeWorkspace } from "@/lib/workspace";
import type { ChartConfig, Drawing, IndicatorConfig, LayoutType, WorkspaceDTO } from "@/types";

interface WorkspaceState extends WorkspaceDTO {
  activeChartId: string;
  /** Bumped on every user edit — used to trigger server sync. */
  revision: number;

  setLayout: (layout: LayoutType) => void;
  setActiveChart: (id: string) => void;
  updateChart: (id: string, patch: Partial<Omit<ChartConfig, "id">>) => void;
  addIndicator: (chartId: string, ind: IndicatorConfig) => void;
  removeIndicator: (chartId: string, indId: string) => void;
  addDrawing: (chartId: string, d: Drawing) => void;
  removeDrawing: (chartId: string, drawingId: string) => void;
  updateDrawing: (chartId: string, drawingId: string, patch: Partial<Omit<Drawing, "id">>) => void;
  clearDrawings: (chartId: string) => void;
  replace: (ws: WorkspaceDTO) => void;
}

const chartsNeeded = (layout: LayoutType) => Number(layout);

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => {
      const init = defaultWorkspace();
      const edit = (fn: (s: WorkspaceState) => Partial<WorkspaceState>) =>
        set((s) => ({ ...fn(s), revision: s.revision + 1 }));
      const mapChart = (s: WorkspaceState, id: string, fn: (c: ChartConfig) => ChartConfig) => ({
        charts: s.charts.map((c) => (c.id === id ? fn(c) : c)),
      });

      return {
        ...init,
        activeChartId: init.charts[0].id,
        revision: 0,

        setLayout: (layout) =>
          edit((s) => {
            // Keep existing charts (so switching 4 -> 1 -> 4 preserves them), add new ones if needed.
            const charts = [...s.charts];
            while (charts.length < chartsNeeded(layout) && charts.length < MAX_CHARTS) {
              const used = new Set(charts.map((c) => c.symbol));
              charts.push(defaultChart(DEFAULT_SYMBOLS.find((sym) => !used.has(sym)) ?? "BTCUSDT"));
            }
            const visible = charts.slice(0, chartsNeeded(layout));
            return {
              layout,
              charts,
              activeChartId: visible.some((c) => c.id === s.activeChartId) ? s.activeChartId : visible[0].id,
            };
          }),

        setActiveChart: (id) => set({ activeChartId: id }),

        updateChart: (id, patch) => edit((s) => mapChart(s, id, (c) => ({ ...c, ...patch }))),

        addIndicator: (chartId, ind) =>
          edit((s) => mapChart(s, chartId, (c) => ({ ...c, indicators: [...c.indicators, ind].slice(0, 12) }))),

        removeIndicator: (chartId, indId) =>
          edit((s) => mapChart(s, chartId, (c) => ({ ...c, indicators: c.indicators.filter((i) => i.id !== indId) }))),

        addDrawing: (chartId, d) =>
          edit((s) => mapChart(s, chartId, (c) => ({ ...c, drawings: [...c.drawings, d].slice(-200) }))),

        removeDrawing: (chartId, drawingId) =>
          edit((s) => mapChart(s, chartId, (c) => ({ ...c, drawings: c.drawings.filter((d) => d.id !== drawingId) }))),

        updateDrawing: (chartId, drawingId, patch) =>
          edit((s) =>
            mapChart(s, chartId, (c) => ({
              ...c,
              drawings: c.drawings.map((d) => (d.id === drawingId ? { ...d, ...patch } : d)),
            })),
          ),

        clearDrawings: (chartId) => edit((s) => mapChart(s, chartId, (c) => ({ ...c, drawings: [] }))),

        /** Load a workspace from the server (does not bump revision → no echo save). */
        replace: (ws) => {
          const clean = sanitizeWorkspace(ws);
          set({ ...clean, activeChartId: clean.charts[0].id });
        },
      };
    },
    {
      name: "tc-workspace",
      version: 1,
      skipHydration: true,
      partialize: (s) => ({ name: s.name, layout: s.layout, charts: s.charts, activeChartId: s.activeChartId }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkspaceState>;
        const clean = sanitizeWorkspace(p);
        const active = clean.charts.some((c) => c.id === p.activeChartId) ? p.activeChartId! : clean.charts[0].id;
        return { ...current, ...clean, activeChartId: active };
      },
    },
  ),
);

export const selectVisibleCharts = (s: WorkspaceState) => s.charts.slice(0, Number(s.layout));

export function toWorkspaceDTO(s: WorkspaceState): WorkspaceDTO {
  return { name: s.name, layout: s.layout, charts: s.charts };
}
