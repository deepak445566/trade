"use client";

import { cx } from "@/lib/format";
import type { DrawingType } from "@/types";

const S = { stroke: "currentColor", strokeWidth: 1.6, fill: "none" } as const;

const TOOLS: { id: DrawingType | null; label: string; icon: React.ReactNode }[] = [
  { id: null, label: "Cursor (Esc)", icon: <path d="M5 3l12 8-5 1.5L9.5 18 5 3z" fill="currentColor" /> },
  {
    id: "trendline",
    label: "Trend line",
    icon: (
      <>
        <line x1="4" y1="17" x2="17" y2="4" {...S} />
        <circle cx="4" cy="17" r="1.8" fill="currentColor" />
        <circle cx="17" cy="4" r="1.8" fill="currentColor" />
      </>
    ),
  },
  {
    id: "ray",
    label: "Ray (extended line)",
    icon: (
      <>
        <line x1="4" y1="16" x2="20" y2="3" {...S} />
        <circle cx="4" cy="16" r="1.8" fill="currentColor" />
      </>
    ),
  },
  { id: "arrow", label: "Arrow", icon: <path d="M4 17L16 5M16 5h-6M16 5v6" {...S} strokeLinecap="round" /> },
  { id: "hline", label: "Horizontal line", icon: <line x1="2" y1="10.5" x2="19" y2="10.5" {...S} /> },
  { id: "vline", label: "Vertical line", icon: <line x1="10.5" y1="2" x2="10.5" y2="19" {...S} /> },
  { id: "rect", label: "Rectangle", icon: <rect x="3.5" y="5.5" width="14" height="10" {...S} /> },
  {
    id: "fib",
    label: "Fibonacci retracement",
    icon: (
      <g {...S} strokeWidth={1.4}>
        <line x1="3" y1="4" x2="18" y2="4" />
        <line x1="3" y1="8.5" x2="18" y2="8.5" />
        <line x1="3" y1="12.5" x2="18" y2="12.5" />
        <line x1="3" y1="17" x2="18" y2="17" />
      </g>
    ),
  },
  {
    id: "measure",
    label: "Price range (measure)",
    icon: <path d="M10.5 3v15M6 7l4.5-4 4.5 4M6 14l4.5 4 4.5-4" {...S} strokeLinecap="round" />,
  },
  {
    id: "long",
    label: "Long position (risk/reward)",
    icon: (
      <>
        <rect x="3" y="3" width="15" height="7" fill="#089981" opacity="0.6" />
        <rect x="3" y="10" width="15" height="7" fill="#f23645" opacity="0.6" />
      </>
    ),
  },
  {
    id: "short",
    label: "Short position (risk/reward)",
    icon: (
      <>
        <rect x="3" y="3" width="15" height="7" fill="#f23645" opacity="0.6" />
        <rect x="3" y="10" width="15" height="7" fill="#089981" opacity="0.6" />
      </>
    ),
  },
  {
    id: "text",
    label: "Text",
    icon: (
      <text x="5" y="16" fontSize="14" fontWeight="700" fill="currentColor">
        T
      </text>
    ),
  },
];

interface Props {
  tool: DrawingType | null;
  onTool: (t: DrawingType | null) => void;
  onClear: () => void;
  hasDrawings: boolean;
}

export default function DrawingToolbar({ tool, onTool, onClear, hasDrawings }: Props) {
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-[#2a2e39] py-1 scrollbar-none">
      {TOOLS.map((t) => (
        <button
          key={t.label}
          title={t.label}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          onClick={() => onTool(tool === t.id ? null : t.id)}
          className={cx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded",
            tool === t.id ? "bg-[#2962ff]/20 text-[#2962ff]" : "text-[#b2b5be] hover:bg-[#2a2e39]",
          )}
        >
          <svg width="21" height="21" viewBox="0 0 21 21">
            {t.icon}
          </svg>
        </button>
      ))}
      <div className="my-1 h-px w-6 shrink-0 bg-[#2a2e39]" />
      <button
        title="Remove all drawings"
        aria-label="Remove all drawings"
        disabled={!hasDrawings}
        onClick={onClear}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[#b2b5be] hover:bg-[#2a2e39] hover:text-[#f23645] disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" />
        </svg>
      </button>
    </div>
  );
}
