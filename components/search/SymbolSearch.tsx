"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import type { SymbolInfo } from "@/types";

const RECENT_KEY = "tc-recent-symbols";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((s) => typeof s === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function pushRecent(symbol: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([symbol, ...readRecent().filter((s) => s !== symbol)].slice(0, 8)));
  } catch {}
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (symbol: string) => void;
  title?: string;
}

export default function SymbolSearch({ open, onClose, onSelect, title = "Symbol search" }: Props) {
  if (!open) return null;
  return <SearchDialog onClose={onClose} onSelect={onSelect} title={title} />;
}

function SearchDialog({ onClose, onSelect, title }: Omit<Props, "open"> & { title: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SymbolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [recent] = useState(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Debounced autocomplete.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .searchSymbols(q, ctrl.signal)
        .then((r) => {
          setResults(Array.isArray(r) ? r : []);
          setError(null);
          setCursor(0);
        })
        .catch((e: Error) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const choose = (symbol: string) => {
    pushRecent(symbol);
    onSelect(symbol);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      const pick = results[cursor]?.symbol ?? (/^[A-Z0-9]{5,20}$/i.test(q) ? q.toUpperCase() : null);
      if (pick) choose(pick);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[#2a2e39] bg-[#1e222d] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#2a2e39] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#d1d4dc]">{title}</h2>
          <button onClick={onClose} className="text-[#787b86] hover:text-[#d1d4dc]" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="border-b border-[#2a2e39] p-3">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search — e.g. BTC, ETHUSDT, XAUUSD, gold, silver"
            className="w-full rounded border border-[#2a2e39] bg-[#131722] px-3 py-2 text-sm text-[#d1d4dc] placeholder:text-[#5d606b] focus:border-[#2962ff] focus:outline-none"
          />
          {!q && recent.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[#787b86]">Recent:</span>
              {recent.map((r) => (
                <button
                  key={r}
                  onClick={() => choose(r)}
                  className="rounded bg-[#2a2e39] px-2 py-0.5 text-xs text-[#d1d4dc] hover:bg-[#363a45]"
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto py-1" role="listbox">
          {error && <li className="px-4 py-3 text-sm text-[#f23645]">{error}</li>}
          {!error && !loading && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-[#787b86]">No symbols match “{q}”.</li>
          )}
          {results.map((s, i) => (
            <li key={s.symbol} role="option" aria-selected={i === cursor}>
              <button
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(s.symbol)}
                className={cx(
                  "flex w-full items-center gap-3 px-4 py-2 text-left",
                  i === cursor ? "bg-[#2a2e39]" : "hover:bg-[#2a2e39]",
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f0b90b]/15 text-[10px] font-bold text-[#f0b90b]">
                  {s.baseAsset.slice(0, 3)}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-[#d1d4dc]">{s.symbol}</span>
                  <span className="block text-xs text-[#787b86]">
                    {s.description ?? `${s.baseAsset} / ${s.quoteAsset}`}
                  </span>
                </span>
                <span className="text-[11px] uppercase text-[#787b86]">{s.exchange ?? "Binance"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
