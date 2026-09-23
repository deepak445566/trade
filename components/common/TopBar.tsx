"use client";

import Link from "next/link";
import { useStreamStatus } from "@/hooks/useWebSocket";
import { cx } from "@/lib/format";
import { useAuthStore } from "@/store/authStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useSyncStatus } from "./WorkspaceSync";
import Clock from "./Clock";
import type { LayoutType } from "@/types";

const LAYOUTS: { id: LayoutType; label: string; icon: React.ReactNode }[] = [
  { id: "1", label: "Single chart", icon: <rect x="2.5" y="3.5" width="15" height="13" rx="1" /> },
  {
    id: "2",
    label: "Two charts",
    icon: (
      <>
        <rect x="2.5" y="3.5" width="6.5" height="13" rx="1" />
        <rect x="11" y="3.5" width="6.5" height="13" rx="1" />
      </>
    ),
  },
  {
    id: "4",
    label: "Four charts",
    icon: (
      <>
        <rect x="2.5" y="3.5" width="6.5" height="5.5" rx="1" />
        <rect x="11" y="3.5" width="6.5" height="5.5" rx="1" />
        <rect x="2.5" y="11" width="6.5" height="5.5" rx="1" />
        <rect x="11" y="11" width="6.5" height="5.5" rx="1" />
      </>
    ),
  },
];

const SYNC_LABEL = { idle: "", saving: "Saving…", saved: "Saved", error: "Save failed", local: "Saved on this device" };

export default function TopBar({ sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const layout = useWorkspaceStore((s) => s.layout);
  const setLayout = useWorkspaceStore((s) => s.setLayout);
  const user = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);
  const logout = useAuthStore((s) => s.logout);
  const stream = useStreamStatus();
  const sync = useSyncStatus((s) => s.state);

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[#2a2e39] bg-[#131722] px-3">
      <Link href="/" className="flex items-center gap-2 font-semibold text-[#d1d4dc]">
        <Logo />
        <span className="hidden sm:inline">TradeCharts</span>
      </Link>

      <div className="mx-2 h-5 w-px bg-[#2a2e39]" />

      <div className="flex items-center gap-0.5" role="group" aria-label="Layout">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            title={l.label}
            aria-label={l.label}
            aria-pressed={layout === l.id}
            onClick={() => setLayout(l.id)}
            className={cx(
              "flex h-7 w-8 items-center justify-center rounded",
              layout === l.id ? "bg-[#2962ff]/20 text-[#2962ff]" : "text-[#b2b5be] hover:bg-[#2a2e39]",
            )}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
              {l.icon}
            </svg>
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3 text-xs">
        <span className="hidden items-center gap-1.5 text-[#787b86] md:flex" title={`Live data: ${stream}`}>
          <span
            className={cx(
              "h-2 w-2 rounded-full",
              stream === "open" ? "bg-[#089981]" : stream === "error" ? "bg-[#f23645]" : "bg-[#f5a623]",
            )}
          />
          {stream === "open" ? "Live" : stream === "error" ? "Reconnecting" : "Connecting"}
        </span>
        <span className="hidden sm:inline">
          <Clock />
        </span>
        <span className="hidden text-[#787b86] md:inline">{SYNC_LABEL[sync]}</span>

        {authStatus === "authenticated" && user ? (
          <div className="flex items-center gap-2">
            <span className="hidden text-[#b2b5be] sm:inline">{user.name}</span>
            <button onClick={() => void logout()} className="rounded px-2 py-1 text-[#b2b5be] hover:bg-[#2a2e39]">
              Log out
            </button>
          </div>
        ) : authStatus === "guest" ? (
          <div className="flex items-center gap-1">
            <Link href="/login?next=/dashboard" className="rounded px-2 py-1 text-[#b2b5be] hover:bg-[#2a2e39]">
              Log in
            </Link>
            <Link href="/signup?next=/dashboard" className="rounded bg-[#2962ff] px-2.5 py-1 text-white hover:bg-[#1e53e5]">
              Sign up
            </Link>
          </div>
        ) : null}

        <button
          onClick={onToggleSidebar}
          title={sidebarOpen ? "Hide panel" : "Show panel"}
          aria-label={sidebarOpen ? "Hide panel" : "Show panel"}
          className="flex h-7 w-7 items-center justify-center rounded text-[#b2b5be] hover:bg-[#2a2e39]"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="2.5" y="3.5" width="15" height="13" rx="1" />
            <line x1="12.5" y1="3.5" x2="12.5" y2="16.5" />
          </svg>
        </button>
      </div>
    </header>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="5" fill="#2962ff" />
      <path d="M5 16l4-5 3 3 6-7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
