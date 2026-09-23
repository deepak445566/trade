import Link from "next/link";
import { Logo } from "@/components/common/TopBar";

const FEATURES = [
  { title: "Real-time charts", body: "Candles, OHLC bars, line and area — streamed live from Binance, tick by tick." },
  { title: "Indicators", body: "EMA, SMA, RSI, MACD, VWAP and Bollinger Bands, computed instantly in your browser." },
  { title: "Drawing tools", body: "Trend lines, horizontal & vertical lines, Fibonacci retracements and rectangles." },
  { title: "Multi-chart layouts", body: "1, 2 or 4 charts side by side — each with its own symbol and timeframe." },
  { title: "Watchlist", body: "Live prices and daily change for the pairs you follow, saved to your account." },
  { title: "Price alerts", body: "Server-side alerts that fire instantly with in-app, browser and email notifications." },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-[#0f121a] text-[#d1d4dc]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <Logo size={26} /> TradeCharts
        </span>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login" className="rounded-md px-3 py-1.5 text-[#b2b5be] hover:bg-[#1e222d]">
            Log in
          </Link>
          <Link href="/signup" className="rounded-md bg-[#2962ff] px-3 py-1.5 text-white hover:bg-[#1e53e5]">
            Sign up
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Real-time crypto charts. <span className="text-[#2962ff]">Free.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-[#b2b5be]">
            A fast, focused charting workspace for every Binance pair — indicators, drawings, multi-chart layouts and
            price alerts. No API key, no cost.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className="rounded-md bg-[#2962ff] px-5 py-2.5 font-medium text-white hover:bg-[#1e53e5]">
              Launch chart
            </Link>
            <Link href="/signup" className="rounded-md border border-[#2a2e39] px-5 py-2.5 font-medium hover:bg-[#1e222d]">
              Create free account
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border border-[#2a2e39] bg-[#131722] p-5">
              <h2 className="font-semibold text-white">{f.title}</h2>
              <p className="mt-1.5 text-sm text-[#b2b5be]">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-[#2a2e39] py-6 text-center text-xs text-[#5d606b]">
        Market data from Binance. Charts by TradingView Lightweight Charts™.
      </footer>
    </div>
  );
}
