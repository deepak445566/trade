import { route, readJson, HttpError } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/auth";
import { Alert } from "@/lib/server/models/Alert";
import { alertEngine } from "@/lib/server/alertEngine";
import { toAlertDTO } from "@/lib/server/dto";
import type { AlertCondition } from "@/types";

const CONDITIONS: AlertCondition[] = ["price_above", "price_below", "crosses"];

export const GET = route(async (req) => {
  const userId = await requireUserId(req);
  const alerts = await Alert.find({ userId }).sort({ createdAt: -1 }).limit(200).lean();
  return Response.json({ alerts: alerts.map(toAlertDTO) });
});

export const POST = route(async (req) => {
  const userId = await requireUserId(req);
  const body = await readJson<{
    symbol?: string;
    type?: string;
    condition?: string;
    targetPrice?: number;
    notifyVia?: string[];
  }>(req);

  const symbol = String(body.symbol ?? "").toUpperCase();
  const targetPrice = Number(body.targetPrice);
  const condition = body.condition as AlertCondition;
  if (!/^[A-Z0-9]{3,20}$/.test(symbol)) throw new HttpError(400, "Invalid symbol");
  if (!CONDITIONS.includes(condition)) throw new HttpError(400, "Invalid condition");
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) throw new HttpError(400, "Invalid target price");
  const notifyVia = (body.notifyVia ?? ["push"]).filter((n) => n === "push" || n === "email");

  if ((await Alert.countDocuments({ userId, status: "active" })) >= 100) {
    throw new HttpError(400, "Maximum of 100 active alerts reached");
  }

  const alert = await Alert.create({
    userId,
    symbol,
    type: body.type === "forex" ? "forex" : "crypto",
    condition,
    targetPrice,
    notifyVia: notifyVia.length ? notifyVia : ["push"],
  });
  await alertEngine.reload();
  return Response.json({ alert: toAlertDTO(alert.toObject()) }, { status: 201 });
});
