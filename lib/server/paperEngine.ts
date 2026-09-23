import "server-only";
import { connectDB } from "./db";
import { PaperAccount, PaperTrade, PAPER_STARTING_BALANCE } from "./models/Paper";
import { getFeed } from "./services/feed";
import { fetchKlines } from "./services/binanceRest";
import { publishUser } from "./services/hub";
import type { CloseReason, PaperAccountDTO, PaperTradeDTO, TradeSide } from "@/types";

interface LiveTrade {
  id: string;
  userId: string;
  symbol: string;
  side: TradeSide;
  status: "pending" | "open";
  qty: number;
  leverage: number;
  limitPrice?: number;
  entryPrice?: number;
  sl?: number;
  tp?: number;
}

type TradeLean = {
  _id: unknown;
  userId: unknown;
  symbol: string;
  side: string;
  orderType: string;
  qty: number;
  leverage?: number | null;
  limitPrice?: number | null;
  entryPrice?: number | null;
  sl?: number | null;
  tp?: number | null;
  status: string;
  exitPrice?: number | null;
  pnl?: number | null;
  closeReason?: string | null;
  createdAt?: Date;
  openedAt?: Date | null;
  closedAt?: Date | null;
};

const opt = (v: number | null | undefined) => (v === null || v === undefined ? undefined : v);

export function toTradeDTO(t: TradeLean): PaperTradeDTO {
  return {
    id: String(t._id),
    symbol: t.symbol,
    side: t.side as TradeSide,
    orderType: t.orderType === "limit" ? "limit" : "market",
    qty: t.qty,
    leverage: t.leverage ?? 1,
    limitPrice: opt(t.limitPrice),
    entryPrice: opt(t.entryPrice),
    sl: opt(t.sl),
    tp: opt(t.tp),
    status: t.status as PaperTradeDTO["status"],
    exitPrice: opt(t.exitPrice),
    pnl: opt(t.pnl),
    closeReason: (t.closeReason ?? undefined) as CloseReason | undefined,
    createdAt: (t.createdAt ?? new Date()).toISOString(),
    openedAt: t.openedAt?.toISOString(),
    closedAt: t.closedAt?.toISOString(),
  };
}

export async function getAccount(userId: string): Promise<PaperAccountDTO> {
  const acc = await PaperAccount.findOneAndUpdate(
    { userId },
    { $setOnInsert: { balance: PAPER_STARTING_BALANCE, startingBalance: PAPER_STARTING_BALANCE } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return { balance: acc?.balance ?? PAPER_STARTING_BALANCE, startingBalance: acc?.startingBalance ?? PAPER_STARTING_BALANCE };
}

export const pnlOf = (side: TradeSide, entry: number, exit: number, qty: number) =>
  (side === "long" ? exit - entry : entry - exit) * qty;

/** Price at which the position's margin is fully lost (only meaningful with leverage > 1). */
export const liquidationPrice = (side: TradeSide, entry: number, leverage: number) =>
  side === "long" ? entry * (1 - 1 / leverage) : entry * (1 + 1 / leverage);

/**
 * Paper-trading engine: watches live prices for every symbol with a pending or
 * open paper trade and fills limit orders / triggers TP, SL and liquidation.
 * Runs in the Next.js server process like the alert engine.
 */
class PaperEngine {
  private trades = new Map<string, LiveTrade>();
  private subs = new Map<string, () => void>();
  private lastPrice = new Map<string, number>();
  private busy = new Set<string>();
  private started: Promise<void> | null = null;

  start() {
    this.started ??= this.reload().catch((err) => {
      this.started = null;
      console.error("[paper] failed to start", err);
    });
    return this.started;
  }

  dispose() {
    this.subs.forEach((u) => u());
    this.subs.clear();
    this.trades.clear();
  }

  async reload() {
    await connectDB();
    const docs = await PaperTrade.find({ status: { $in: ["pending", "open"] } }).lean();
    this.trades.clear();
    for (const d of docs) {
      this.trades.set(String(d._id), {
        id: String(d._id),
        userId: String(d.userId),
        symbol: d.symbol,
        side: d.side as TradeSide,
        status: d.status as "pending" | "open",
        qty: d.qty,
        leverage: d.leverage ?? 1,
        limitPrice: opt(d.limitPrice),
        entryPrice: opt(d.entryPrice),
        sl: opt(d.sl),
        tp: opt(d.tp),
      });
    }
    await this.syncSubscriptions();
  }

  /** Latest known price; falls back to the last 1m candle from REST. */
  async price(symbol: string): Promise<number> {
    const live = this.lastPrice.get(symbol);
    if (live) return live;
    const [c] = (await fetchKlines(symbol, "1m", { limit: 1 })).slice(-1);
    if (!c) throw new Error("No price available");
    return c.close;
  }

  private async syncSubscriptions() {
    const needed = new Set([...this.trades.values()].map((t) => t.symbol));
    for (const [sym, unsub] of this.subs) {
      if (!needed.has(sym)) {
        unsub();
        this.subs.delete(sym);
      }
    }
    for (const sym of needed) {
      if (this.subs.has(sym)) continue;
      const feed = await getFeed("crypto", sym);
      this.subs.set(sym, feed.subscribe(sym, "1m", (e) => this.onPrice(sym, e.candle.close)));
    }
  }

  /** Keep a price subscription for symbols users are about to trade (market orders). */
  watch(symbol: string) {
    if (this.subs.has(symbol)) return;
    void getFeed("crypto", symbol).then((feed) => {
      if (this.subs.has(symbol)) return;
      this.subs.set(symbol, feed.subscribe(symbol, "1m", (e) => this.onPrice(symbol, e.candle.close)));
    });
  }

  private onPrice(symbol: string, p: number) {
    this.lastPrice.set(symbol, p);
    for (const t of this.trades.values()) {
      if (t.symbol !== symbol || this.busy.has(t.id)) continue;
      const long = t.side === "long";
      if (t.status === "pending" && t.limitPrice !== undefined) {
        if (long ? p <= t.limitPrice : p >= t.limitPrice) void this.fill(t, t.limitPrice);
        continue;
      }
      if (t.status !== "open" || t.entryPrice === undefined) continue;
      if (t.leverage > 1) {
        const liq = liquidationPrice(t.side, t.entryPrice, t.leverage);
        if (long ? p <= liq : p >= liq) {
          void this.close(t, liq, "liquidation");
          continue;
        }
      }
      if (t.sl !== undefined && (long ? p <= t.sl : p >= t.sl)) void this.close(t, t.sl, "sl");
      else if (t.tp !== undefined && (long ? p >= t.tp : p <= t.tp)) void this.close(t, t.tp, "tp");
    }
  }

  private async fill(t: LiveTrade, price: number) {
    this.busy.add(t.id);
    try {
      const doc = await PaperTrade.findOneAndUpdate(
        { _id: t.id, status: "pending" },
        { status: "open", entryPrice: price, openedAt: new Date() },
        { returnDocument: "after" },
      ).lean();
      if (!doc) {
        this.trades.delete(t.id);
        return;
      }
      t.status = "open";
      t.entryPrice = price;
      publishUser(t.userId, "trade:update", { trade: toTradeDTO(doc), account: await getAccount(t.userId), kind: "filled" });
    } catch (err) {
      console.error("[paper] fill failed", err);
    } finally {
      this.busy.delete(t.id);
    }
  }

  async close(t: LiveTrade, exitPrice: number, reason: CloseReason): Promise<PaperTradeDTO | null> {
    this.busy.add(t.id);
    try {
      const entry = t.entryPrice ?? exitPrice;
      let pnl = pnlOf(t.side, entry, exitPrice, t.qty);
      if (reason === "liquidation") pnl = -(entry * t.qty) / t.leverage; // whole margin lost
      pnl = Math.round(pnl * 1e6) / 1e6;
      const doc = await PaperTrade.findOneAndUpdate(
        { _id: t.id, status: "open" },
        { status: "closed", exitPrice, pnl, closeReason: reason, closedAt: new Date() },
        { returnDocument: "after" },
      ).lean();
      this.trades.delete(t.id);
      if (!doc) return null;
      await PaperAccount.updateOne({ userId: t.userId }, { $inc: { balance: pnl } });
      const dto = toTradeDTO(doc);
      publishUser(t.userId, "trade:update", { trade: dto, account: await getAccount(t.userId), kind: "closed" });
      await this.syncSubscriptions();
      return dto;
    } finally {
      this.busy.delete(t.id);
    }
  }

  /** Manual close at the current market price. */
  async closeById(id: string): Promise<PaperTradeDTO | null> {
    const t = this.trades.get(id);
    if (!t || t.status !== "open") return null;
    return this.close(t, await this.price(t.symbol), "manual");
  }
}

const g = globalThis as unknown as { __tcPaperEngine?: PaperEngine };
if (g.__tcPaperEngine && !(g.__tcPaperEngine instanceof PaperEngine)) {
  (g.__tcPaperEngine as unknown as { dispose?: () => void }).dispose?.();
  g.__tcPaperEngine = undefined;
}
export const paperEngine = (g.__tcPaperEngine ??= new PaperEngine());

export function ensurePaperEngine() {
  void paperEngine.start();
}
