import { route } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/auth";
import { Watchlist } from "@/lib/server/models/Watchlist";

export const DELETE = route<RouteContext<"/api/watchlist/[symbol]">>(async (req, ctx) => {
  const userId = await requireUserId(req);
  const { symbol } = await ctx.params;
  const wl = await Watchlist.findOneAndUpdate(
    { userId, name: "Default" },
    { $pull: { symbols: { symbol: symbol.toUpperCase() } } },
    { returnDocument: "after" },
  ).lean();
  return Response.json({
    symbols: (wl?.symbols ?? []).map((s) => ({ symbol: s.symbol, type: s.type ?? "crypto" })),
  });
});
