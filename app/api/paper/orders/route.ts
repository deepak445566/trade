import { route, readJson, HttpError } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/auth";
import { PaperTrade } from "@/lib/server/models/Paper";
import { getAccount, paperEngine, toTradeDTO } from "@/lib/server/paperEngine";
import type { TradeSide } from "@/types";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

/**
 * POST /api/paper/orders
 * { symbol, side: "long"|"short", orderType: "market"|"limit", qty, limitPrice?, sl?, tp?, leverage? }
 */
export const POST = route(async (req) => {
  const userId = await requireUserId(req);
  const b = await readJson<Record<string, unknown>>(req);

  const symbol = String(b.symbol ?? "").toUpperCase();
  const side = b.side as TradeSide;
  const orderType = b.orderType === "limit" ? "limit" : "market";
  const qty = num(b.qty);
  const leverage = Math.min(Math.max(Math.round(Number(b.leverage) || 1), 1), 100);
  const limitPrice = num(b.limitPrice);
  const sl = num(b.sl);
  const tp = num(b.tp);

  if (!/^[A-Z0-9]{3,20}$/.test(symbol)) throw new HttpError(400, "Invalid symbol");
  if (side !== "long" && side !== "short") throw new HttpError(400, "Side must be long or short");
  if (!qty) throw new HttpError(400, "Enter a quantity");
  if (orderType === "limit" && !limitPrice) throw new HttpError(400, "Enter a limit price");

  paperEngine.watch(symbol);
  let market: number;
  try {
    market = await paperEngine.price(symbol);
  } catch {
    throw new HttpError(502, "Price unavailable for this symbol");
  }
  const entry = orderType === "limit" ? limitPrice! : market;
  const long = side === "long";

  if (orderType === "limit" && (long ? limitPrice! >= market : limitPrice! <= market)) {
    throw new HttpError(
      400,
      `A ${long ? "buy" : "sell"} limit must be ${long ? "below" : "above"} the market price (${market})`,
    );
  }
  if (sl !== undefined && (long ? sl >= entry : sl <= entry)) {
    throw new HttpError(400, `Stop loss must be ${long ? "below" : "above"} the entry price`);
  }
  if (tp !== undefined && (long ? tp <= entry : tp >= entry)) {
    throw new HttpError(400, `Take profit must be ${long ? "above" : "below"} the entry price`);
  }

  // Margin check: free margin = balance − margin already used by open/pending trades.
  const account = await getAccount(userId);
  const active = await PaperTrade.find({ userId, status: { $in: ["open", "pending"] } }).lean();
  const used = active.reduce((s, t) => s + ((t.entryPrice ?? t.limitPrice ?? 0) * t.qty) / (t.leverage ?? 1), 0);
  const margin = (entry * qty) / leverage;
  if (margin > account.balance - used + 1e-9) {
    throw new HttpError(
      400,
      `Not enough free margin: need ${margin.toFixed(2)}, available ${(account.balance - used).toFixed(2)}`,
    );
  }

  const doc = await PaperTrade.create({
    userId,
    symbol,
    side,
    orderType,
    qty,
    leverage,
    limitPrice: orderType === "limit" ? limitPrice : undefined,
    entryPrice: orderType === "market" ? market : undefined,
    sl,
    tp,
    status: orderType === "market" ? "open" : "pending",
    openedAt: orderType === "market" ? new Date() : undefined,
  });
  await paperEngine.reload();
  return Response.json({ trade: toTradeDTO(doc.toObject()), account }, { status: 201 });
});
