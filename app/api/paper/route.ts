import { route } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/auth";
import { PaperTrade } from "@/lib/server/models/Paper";
import { getAccount, toTradeDTO } from "@/lib/server/paperEngine";

/** GET /api/paper — virtual account + recent paper trades. */
export const GET = route(async (req) => {
  const userId = await requireUserId(req);
  const [account, trades] = await Promise.all([
    getAccount(userId),
    PaperTrade.find({ userId }).sort({ createdAt: -1 }).limit(200).lean(),
  ]);
  return Response.json({ account, trades: trades.map(toTradeDTO) });
});
