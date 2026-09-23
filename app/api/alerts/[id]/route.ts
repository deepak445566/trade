import mongoose from "mongoose";
import { route, HttpError } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/auth";
import { Alert } from "@/lib/server/models/Alert";
import { alertEngine } from "@/lib/server/alertEngine";

export const DELETE = route<RouteContext<"/api/alerts/[id]">>(async (req, ctx) => {
  const userId = await requireUserId(req);
  const { id } = await ctx.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid id");
  const res = await Alert.deleteOne({ _id: id, userId });
  if (!res.deletedCount) throw new HttpError(404, "Alert not found");
  await alertEngine.reload();
  return Response.json({ ok: true });
});
