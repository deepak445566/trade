"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/common/TopBar";
import { useAuthStore } from "@/store/authStore";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nextRaw = params.get("next") ?? "/dashboard";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";
  const isSignup = mode === "signup";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isSignup) await signup(name, email, password);
      else await login(email, password);
      router.replace(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-md border border-[#2a2e39] bg-[#131722] px-3 py-2 text-sm text-[#d1d4dc] placeholder:text-[#5d606b] focus:border-[#2962ff] focus:outline-none";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0f121a] px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold text-[#d1d4dc]">
          <Logo size={28} /> TradeCharts
        </Link>
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-[#2a2e39] bg-[#1e222d] p-6">
          <h1 className="text-xl font-semibold text-[#d1d4dc]">{isSignup ? "Create your account" : "Welcome back"}</h1>
          {isSignup && (
            <label className="block space-y-1">
              <span className="text-xs text-[#b2b5be]">Name</span>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-xs text-[#b2b5be]">Email</span>
            <input
              className={input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[#b2b5be]">Password</span>
            <input
              className={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? 8 : undefined}
              required
            />
            {isSignup && <span className="text-[11px] text-[#787b86]">At least 8 characters.</span>}
          </label>
          {error && (
            <p className="rounded bg-[#f23645]/10 px-3 py-2 text-sm text-[#f23645]" role="alert">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full rounded-md bg-[#2962ff] py-2 text-sm font-medium text-white hover:bg-[#1e53e5] disabled:opacity-50"
          >
            {busy ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
          </button>
          <p className="text-center text-sm text-[#787b86]">
            {isSignup ? "Already have an account? " : "New to TradeCharts? "}
            <Link href={`${isSignup ? "/login" : "/signup"}?next=${encodeURIComponent(next)}`} className="text-[#2962ff] hover:underline">
              {isSignup ? "Log in" : "Create an account"}
            </Link>
          </p>
        </form>
        <p className="mt-4 text-center text-xs text-[#5d606b]">
          <Link href="/dashboard" className="hover:text-[#b2b5be]">
            Continue without an account →
          </Link>
        </p>
      </div>
    </main>
  );
}
