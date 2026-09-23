"use client";

import { create } from "zustand";

interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "info" | "alert" | "error";
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    setTimeout(() => get().dismiss(id), t.tone === "alert" ? 15_000 : 5_000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export default function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "alert" ? "alert" : "status"}
          className="pointer-events-auto rounded-md border border-[#2a2e39] bg-[#1e222d] p-3 shadow-xl"
          style={{ borderLeft: `3px solid ${t.tone === "alert" ? "#f5a623" : t.tone === "error" ? "#f23645" : "#2962ff"}` }}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-[#d1d4dc]">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-[#b2b5be]">{t.body}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-xs text-[#787b86] hover:text-[#d1d4dc]" aria-label="Dismiss">
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
