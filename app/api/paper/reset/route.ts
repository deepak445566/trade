import { route } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/auth";
import { PaperAccount, PaperTrade, PAPER_STARTING_BALANCE } from "@/lib/server/models/Paper";
import { getAccount, paperEngine } from "@/lib/server/paperEngine";

/** POST /api/paper/reset — wipe paper trades and restore the starting balance. */
export const POST = route(async (req) => {
  const userId = await requireUserId(req);
  await PaperTrade.deleteMany({ userId });
  await PaperAccount.updateOne(
    { userId },
    { $set: { balance: PAPER_STARTING_BALANCE, startingBalance: PAPER_STARTING_BALANCE } },
    { upsert: true },
  );
  await paperEngine.reload();
  return Response.json({ account: await getAccount(userId), trades: [] });
});
