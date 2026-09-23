"use client";

import { useShallow } from "zustand/react/shallow";
import { cx } from "@/lib/format";
import { selectVisibleCharts, useWorkspaceStore } from "@/store/workspaceStore";
import ChartPanel from "./ChartPanel";

/** 1 / 2 / 4 chart layout. Each panel owns its own data + live subscription. */
export default function ChartGrid() {
  const layout = useWorkspaceStore((s) => s.layout);
  const charts = useWorkspaceStore(useShallow(selectVisibleCharts));
  const activeChartId = useWorkspaceStore((s) => s.activeChartId);

  return (
    <div
      className={cx(
        "grid h-full min-h-0 gap-px bg-[#2a2e39]",
        layout === "1" && "grid-cols-1 grid-rows-1",
        layout === "2" && "grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1",
        layout === "4" && "grid-cols-1 grid-rows-4 md:grid-cols-2 md:grid-rows-2",
      )}
    >
      {charts.map((c) => (
        <div key={c.id} className="min-h-0 min-w-0">
          <ChartPanel config={c} active={layout !== "1" && c.id === activeChartId} compact={layout === "4"} />
        </div>
      ))}
    </div>
  );
}
