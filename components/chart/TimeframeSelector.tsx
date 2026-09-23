"use client";

import { cx } from "@/lib/format";
import { TIMEFRAMES, TIMEFRAME_LABELS, type Timeframe } from "@/types";

export default function TimeframeSelector({ value, onChange }: { value: Timeframe; onChange: (tf: Timeframe) => void }) {
  return (
    <div className="flex items-center" role="group" aria-label="Timeframe">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={cx(
            "h-7 rounded px-1.5 text-xs font-medium transition-colors",
            tf === value ? "bg-[#2962ff]/20 text-[#2962ff]" : "text-[#b2b5be] hover:bg-[#2a2e39]",
          )}
          aria-pressed={tf === value}
        >
          {TIMEFRAME_LABELS[tf]}
        </button>
      ))}
    </div>
  );
}
