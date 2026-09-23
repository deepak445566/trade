import mongoose from "mongoose";
import type { NextRequest } from "next/server";
import { route, readJson, HttpError } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/auth";
import { PaperTrade } from "@/lib/server/models/Paper";
import { getAccount, paperEngine, toTradeDTO } from "@/lib/server/paperEngine";

async function load(req: NextRequest, id: string) {
  const userId = await requireUserId(req);
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid id");
  const trade = await PaperTrade.findOne({ _id: id, userId });
  if (!trade) throw new HttpError(404, "Trade not found");
  return { userId, trade };
}

/** PATCH { sl?, tp?, limitPrice? } — modify SL / TP (null removes it) or move a pending limit order. */
export const PATCH = route<RouteContext<"/api/paper/orders/[id]">>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { userId, trade } = await load(req, id);
  if (trade.status !== "open" && trade.status !== "pending") throw new HttpError(400, "Trade is no longer active");
  const b = await readJson<{ sl?: number | null; tp?: number | null; limitPrice?: number }>(req);
  const long = trade.side === "long";

  if (b.limitPrice !== undefined) {
    if (trade.status !== "pending") throw new HttpError(400, "Only pending orders can be moved");
    const lp = b.limitPrice;
    if (typeof lp !== "number" || !Number.isFinite(lp) || lp <= 0) throw new HttpError(400, "Invalid limit price");
    const market = await paperEngine.price(trade.symbol).catch(() => undefined);
    if (market !== undefined && (long ? lp >= market : lp <= market)) {
      throw new HttpError(400, `A ${long ? "buy" : "sell"} limit must be ${long ? "below" : "above"} the market price (${market})`);
    }
    trade.set("limitPrice", lp);
  }
  // Open positions validate against the live price (so a stop can trail into profit);
  // pending orders validate against their limit price.
  let ref: number = trade.limitPrice ?? 0;
  if (trade.status === "open") {
    try {
      ref = await paperEngine.price(trade.symbol);
    } catch {
      ref = trade.entryPrice ?? 0;
    }
  }
  const refLabel = trade.status === "open" ? `the current price (${ref})` : "the limit price";

  for (const key of ["sl", "tp"] as const) {
    if (!(key in b)) continue;
    const v = b[key];
    if (v === null) {
      trade.set(key, undefined);
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) throw new HttpError(400, `Invalid ${key}`);
    const below = key === "sl" ? long : !long; // long SL / short TP must be below entry
    if (below ? v >= ref : v <= ref) {
      throw new HttpError(400, `${key === "sl" ? "Stop loss" : "Take profit"} must be ${below ? "below" : "above"} ${refLabel}`);
    }
    trade.set(key, v);
  }
  await trade.save();
  await paperEngine.reload();
  return Response.json({ trade: toTradeDTO(trade.toObject()), account: await getAccount(userId) });
});

/** DELETE — cancel a pending order, or close an open position at market. */
export const DELETE = route<RouteContext<"/api/paper/orders/[id]">>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { userId, trade } = await load(req, id);
  if (trade.status === "pending") {
    const doc = await PaperTrade.findOneAndUpdate(
      { _id: id, status: "pending" },
      { status: "cancelled", closedAt: new Date() },
      { returnDocument: "after" },
    ).lean();
    await paperEngine.reload();
    if (!doc) throw new HttpError(409, "Order was just filled");
    return Response.json({ trade: toTradeDTO(doc), account: await getAccount(userId) });
  }
  if (trade.status === "open") {
    await paperEngine.start();
    const closed = await paperEngine.closeById(id);
    if (!closed) throw new HttpError(409, "Position was already closed");
    return Response.json({ trade: closed, account: await getAccount(userId) });
  }
  throw new HttpError(400, "Trade is no longer active");
});
