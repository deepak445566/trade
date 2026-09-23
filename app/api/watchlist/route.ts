import { route, readJson, HttpError } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/auth";
import { Watchlist } from "@/lib/server/models/Watchlist";
import type { WatchlistItem } from "@/types";

async function getOrCreate(userId: string) {
  return (
    (await Watchlist.findOne({ userId, name: "Default" })) ??
    (await Watchlist.create({ userId, name: "Default", symbols: [] }))
  );
}

const toItems = (symbols: { symbol: string; type?: string | null }[]): WatchlistItem[] =>
  symbols.map((s) => ({ symbol: s.symbol, type: s.type === "forex" ? "forex" : "crypto" }));

export const GET = route(async (req) => {
  const wl = await getOrCreate(await requireUserId(req));
  return Response.json({ symbols: toItems(wl.symbols) });
});

/** Body: { symbol, type? } adds one symbol, or { symbols: [...] } replaces the list (reorder). */
export const POST = route(async (req) => {
  const userId = await requireUserId(req);
  const body = await readJson<{ symbol?: string; type?: string; symbols?: WatchlistItem[] }>(req);
  const wl = await getOrCreate(userId);

  if (Array.isArray(body.symbols)) {
    const clean = body.symbols
      .filter((s) => typeof s?.symbol === "string" && /^[A-Z0-9]{3,20}$/i.test(s.symbol))
      .slice(0, 200)
      .map((s) => ({ symbol: s.symbol.toUpperCase(), type: s.type === "forex" ? "forex" : "crypto" }));
    wl.set("symbols", clean);
  } else {
    const symbol = String(body.symbol ?? "").toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(symbol)) throw new HttpError(400, "Invalid symbol");
    if (!wl.symbols.some((s) => s.symbol === symbol)) {
      if (wl.symbols.length >= 200) throw new HttpError(400, "Watchlist is full");
      wl.symbols.push({ symbol, type: body.type === "forex" ? "forex" : "crypto" });
    }
  }
  await wl.save();
  return Response.json({ symbols: toItems(wl.symbols) });
});
