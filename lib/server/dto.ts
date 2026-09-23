import "server-only";
import type { AlertCondition, AlertDTO } from "@/types";

type AlertLean = {
  _id: unknown;
  symbol: string;
  type?: string | null;
  condition: string;
  targetPrice: number;
  status?: string | null;
  notifyVia?: string[] | null;
  createdAt?: Date;
  triggeredAt?: Date | null;
  triggeredPrice?: number | null;
};

export function toAlertDTO(a: AlertLean): AlertDTO {
  return {
    id: String(a._id),
    symbol: a.symbol,
    type: a.type === "forex" ? "forex" : "crypto",
    condition: a.condition as AlertCondition,
    targetPrice: a.targetPrice,
    status: a.status === "triggered" ? "triggered" : "active",
    notifyVia: (a.notifyVia ?? ["push"]) as AlertDTO["notifyVia"],
    createdAt: (a.createdAt ?? new Date()).toISOString(),
    triggeredAt: a.triggeredAt?.toISOString(),
    triggeredPrice: a.triggeredPrice ?? undefined,
  };
}
