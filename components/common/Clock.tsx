"use client";

import { useEffect, useRef } from "react";
import { serverNow } from "@/lib/streamClient";

/** Live clock (exchange-synced) with the viewer's UTC offset, like TradingView's footer clock. */
export default function Clock() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    const tz = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
    const tick = () => {
      if (!ref.current) return;
      const t = new Date(serverNow()).toLocaleTimeString("en-GB", { hour12: false });
      ref.current.textContent = `${t} (${tz})`;
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  return <span ref={ref} className="font-mono tabular-nums text-[#b2b5be]" title="Exchange-synced time" />;
}
