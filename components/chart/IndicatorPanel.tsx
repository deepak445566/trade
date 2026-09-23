"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { INDICATOR_DEFAULTS, indicatorLabel, newId } from "@/lib/workspace";
import type { IndicatorConfig, IndicatorType } from "@/types";

const TYPES = Object.keys(INDICATOR_DEFAULTS) as IndicatorType[];
const PALETTE = [
  "#f5a623",
  "#4a90e2",
  "#e91e63",
  "#00bcd4",
  "#8bc34a",
  "#ff5722",
  "#9c27b0",
  "#ffeb3b",
];

interface Props {
  indicators: IndicatorConfig[];
  onAdd: (i: IndicatorConfig) => void;
  onRemove: (id: string) => void;
}

/** One-click EMA crossover presets (fast/slow) with BUY/SELL signal arrows. */
const PRESETS: {
  label: string;
  hint: string;
  fast: number;
  slow: number;
  color: string;
}[] = [
  {
    label: "EMA 9 / 20 cross",
    hint: "Fast scalping / intraday crossover",
    fast: 9,
    slow: 20,
    color: "#00bcd4",
  },
  {
    label: "EMA 9 / 15 cross",
    hint: "Very fast crossover",
    fast: 9,
    slow: 15,
    color: "#e91e63",
  },
  {
    label: "EMA 50 / 200 cross",
    hint: "Golden / death cross (trend)",
    fast: 50,
    slow: 200,
    color: "#ffeb3b",
  },
];

const clampPeriod = (v: string) => Math.max(1, Math.min(500, Number(v) || 1));

export default function IndicatorPanel({ indicators, onAdd, onRemove }: Props) {
  // Menu is portaled to <body> with fixed positioning: the chart toolbar scrolls horizontally,
  // which would otherwise clip a dropdown hanging below it.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const open = pos !== null;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(open) : v;
    if (!next) return setPos(null);
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const width = 320;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      top: r.bottom + 4,
    });
  };
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [periods, setPeriods] = useState<
    Partial<Record<IndicatorType, number>>
  >({});
  const [periods2, setPeriods2] = useState<
    Partial<Record<IndicatorType, number>>
  >({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t))
        setPos(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    const dismiss = () => setPos(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  const add = (type: IndicatorType) => {
    const def = INDICATOR_DEFAULTS[type];
    const period =
      def.period !== undefined ? (periods[type] ?? def.period) : undefined;
    const period2 =
      def.period2 !== undefined ? (periods2[type] ?? def.period2) : undefined;
    const sameType = indicators.filter((i) => i.type === type).length;
    const color =
      sameType === 0
        ? def.color
        : PALETTE[(indicators.length + sameType) % PALETTE.length];
    onAdd({
      id: newId("ind"),
      type,
      ...(period ? { period } : {}),
      ...(period2 ? { period2 } : {}),
      color,
    });
  };

  const q = query.trim().toLowerCase();
  const matches = TYPES.filter((type) => {
    if (!q) return true;
    const d = INDICATOR_DEFAULTS[type];
    return `${type} ${d.name ?? ""} ${d.label}`.toLowerCase().includes(q);
  });
  const groups: [string, IndicatorType[]][] = [
    [
      "Overlays (on price)",
      matches.filter((t) => INDICATOR_DEFAULTS[t].overlay),
    ],
    [
      "Oscillators (own pane)",
      matches.filter((t) => !INDICATOR_DEFAULTS[t].overlay),
    ],
  ];

  const periodInput = (
    type: IndicatorType,
    which: 1 | 2,
    value: number,
    label: string,
  ) => (
    <input
      type="number"
      min={1}
      max={500}
      aria-label={label}
      title={label}
      value={value}
      onChange={(e) =>
        (which === 1 ? setPeriods : setPeriods2)((p) => ({
          ...p,
          [type]: clampPeriod(e.target.value),
        }))
      }
      className="w-11 rounded border border-[#2a2e39] bg-[#131722] px-1 py-0.5 text-xs text-[#d1d4dc]"
    />
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 items-center gap-1 rounded px-2 text-xs text-[#b2b5be] hover:bg-[#2a2e39]"
        aria-expanded={open}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2 15l5-6 4 3 7-8" />
        </svg>
        Indicators{indicators.length ? ` (${indicators.length})` : ""}
      </button>
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[60] flex w-80 flex-col rounded-md border border-[#2a2e39] bg-[#1e222d] shadow-xl"
            style={{
              left: pos.left,
              top: pos.top,
              maxHeight: `calc(100vh - ${pos.top + 12}px)`,
            }}
          >
            <div className="border-b border-[#2a2e39] p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search indicators — RSI, supertrend, ichimoku…"
                className="w-full rounded border border-[#2a2e39] bg-[#131722] px-2 py-1.5 text-sm text-[#d1d4dc] placeholder:text-[#5d606b] focus:border-[#2962ff] focus:outline-none"
              />
            </div>
            <div className="overflow-y-auto p-1">
              {!q && (
                <div className="mb-1">
                  <p className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wide text-[#5d606b]">
                    Popular presets
                  </p>
                  {PRESETS.map((pr) => {
                    const onChart = indicators.some(
                      (i) =>
                        i.type === "EMACROSS" &&
                        i.period === pr.fast &&
                        i.period2 === pr.slow,
                    );
                    return (
                      <button
                        key={pr.label}
                        onClick={() =>
                          onAdd({
                            id: newId("ind"),
                            type: "EMACROSS",
                            period: pr.fast,
                            period2: pr.slow,
                            color: pr.color,
                          })
                        }
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-[#2a2e39]"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: pr.color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-[#d1d4dc]">
                            {pr.label}
                            {onChart && (
                              <span className="ml-1.5 text-[10px] text-[#2962ff]">
                                ● on chart
                              </span>
                            )}
                          </span>
                          <span className="block text-[11px] text-[#787b86]">
                            {pr.hint} · BUY/SELL signals
                          </span>
                        </span>
                        <span className="text-base leading-none text-[#2962ff]">
                          +
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {groups.map(([title, list]) =>
                list.length ? (
                  <div key={title} className="mb-1">
                    <p className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wide text-[#5d606b]">
                      {title}
                    </p>
                    {list.map((type) => {
                      const def = INDICATOR_DEFAULTS[type];
                      const onChart = indicators.some((i) => i.type === type);
                      return (
                        <div
                          key={type}
                          className="flex items-center gap-1.5 rounded px-2 py-1 hover:bg-[#2a2e39]"
                        >
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => add(type)}
                          >
                            <span className="block truncate text-sm font-medium text-[#d1d4dc]">
                              {def.name ?? type}
                              {onChart && (
                                <span className="ml-1.5 text-[10px] text-[#2962ff]">
                                  ● on chart
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-[11px] text-[#787b86]">
                              {def.label}
                            </span>
                          </button>
                          {def.period2 !== undefined &&
                            def.period !== undefined && (
                              <>
                                {periodInput(
                                  type,
                                  1,
                                  periods[type] ?? def.period,
                                  `${type} fast period`,
                                )}
                                {periodInput(
                                  type,
                                  2,
                                  periods2[type] ?? def.period2,
                                  `${type} slow period`,
                                )}
                              </>
                            )}
                          {def.period !== undefined &&
                            def.period2 === undefined &&
                            periodInput(
                              type,
                              1,
                              periods[type] ?? def.period,
                              `${type} period`,
                            )}
                          <button
                            onClick={() => add(type)}
                            className="rounded px-1.5 text-base leading-none text-[#2962ff] hover:bg-[#2962ff]/20"
                            aria-label={`Add ${def.name ?? type}`}
                          >
                            +
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null,
              )}
              {!matches.length && (
                <p className="px-2 py-3 text-center text-xs text-[#787b86]">
                  No indicator matches “{query}”.
                </p>
              )}
            </div>
            {indicators.length > 0 && (
              <div className="max-h-40 overflow-y-auto border-t border-[#2a2e39] p-1">
                <p className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-[#5d606b]">
                  On chart
                </p>
                {indicators.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center gap-2 px-2 py-1 text-sm text-[#d1d4dc]"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: i.color }}
                    />
                    <span className="flex-1">{indicatorLabel(i)}</span>
                    <button
                      onClick={() => onRemove(i.id)}
                      className="px-1 text-[#787b86] hover:text-[#f23645]"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
