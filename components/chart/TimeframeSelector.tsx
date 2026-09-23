"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/format";
import { TIMEFRAME_GROUPS, TIMEFRAME_LABELS, type Timeframe } from "@/types";

/** Shown inline in the toolbar; everything else is in the ▾ menu. */
const FAVORITES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export default function TimeframeSelector({ value, onChange }: { value: Timeframe; onChange: (tf: Timeframe) => void }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inline = FAVORITES.includes(value) ? FAVORITES : [...FAVORITES, value];

  useEffect(() => {
    if (!pos) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setPos(null);
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
  }, [pos]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 232)), top: r.bottom + 4 });
  };

  const pick = (tf: Timeframe) => {
    onChange(tf);
    setPos(null);
  };

  return (
    <div className="flex items-center" role="group" aria-label="Timeframe">
      {inline.map((tf) => (
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
      <button
        ref={btnRef}
        onClick={toggle}
        className={cx("h-7 rounded px-1 text-xs text-[#b2b5be] hover:bg-[#2a2e39]", pos && "bg-[#2a2e39]")}
        aria-label="All timeframes"
        aria-expanded={!!pos}
        title="All timeframes"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M2 4l4 4 4-4z" />
        </svg>
      </button>

      {pos &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-60 w-56 rounded-md border border-[#2a2e39] bg-[#1e222d] p-2 shadow-xl"
            style={{ left: pos.left, top: pos.top }}
          >
            {TIMEFRAME_GROUPS.map((g) => (
              <div key={g.label} className="mb-2 last:mb-0">
                <p className="px-1 pb-1 text-[10px] uppercase tracking-wide text-[#5d606b]">{g.label}</p>
                <div className="grid grid-cols-4 gap-1">
                  {g.items.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => pick(tf)}
                      className={cx(
                        "rounded py-1.5 text-xs font-medium",
                        tf === value ? "bg-[#2962ff] text-white" : "bg-[#2a2e39] text-[#d1d4dc] hover:bg-[#363a45]",
                      )}
                    >
                      {TIMEFRAME_LABELS[tf]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
