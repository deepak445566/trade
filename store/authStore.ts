"use client";

import { create } from "zustand";
import type { UserDTO } from "@/types";

type Status = "loading" | "authenticated" | "guest";

interface AuthState {
  user: UserDTO | null;
  accessToken: string | null;
  status: Status;
  init: () => Promise<void>;
  refresh: () => Promise<string | null>;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

async function authPost(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as { user: UserDTO; accessToken: string };
}

let refreshing: Promise<string | null> | null = null;

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  accessToken: null,
  status: "loading",

  init: async () => {
    if (get().status !== "loading") return;
    await get().refresh();
  },

  /** Uses the httpOnly refresh cookie to obtain a fresh access token. Deduplicated. */
  refresh: () => {
    refreshing ??= authPost("/api/auth/refresh")
      .then(({ user, accessToken }) => {
        set({ user, accessToken, status: "authenticated" });
        return accessToken;
      })
      .catch(() => {
        set({ user: null, accessToken: null, status: "guest" });
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  },

  login: async (email, password) => {
    const { user, accessToken } = await authPost("/api/auth/login", { email, password });
    set({ user, accessToken, status: "authenticated" });
  },

  signup: async (name, email, password) => {
    const { user, accessToken } = await authPost("/api/auth/signup", { name, email, password });
    set({ user, accessToken, status: "authenticated" });
  },

  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    set({ user: null, accessToken: null, status: "guest" });
  },
}));
