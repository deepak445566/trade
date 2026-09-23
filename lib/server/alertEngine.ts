import "server-only";
import { connectDB } from "./db";
import { Alert } from "./models/Alert";
import { User } from "./models/User";
import { getFeed } from "./services/feed";
import { publishAlert } from "./services/hub";
import { sendMail } from "./services/mailer";
import type { AlertCondition, CandleEvent, MarketType } from "@/types";

interface LiveAlert {
  id: string;
  userId: string;
  symbol: string;
  type: MarketType;
  condition: AlertCondition;
  targetPrice: number;
  notifyVia: string[];
}

/**
 * Watches live prices (1m klines) for every symbol that has an active alert
 * and fires alerts when their condition is met. Runs inside the Next.js server
 * process — started from instrumentation.ts and on first API request.
 */
class AlertEngine {
  private alerts = new Map<string, LiveAlert>();
  private subs = new Map<string, () => void>(); // "type:symbol" -> unsubscribe
  private lastPrice = new Map<string, number>();
  private firing = new Set<string>();
  private started: Promise<void> | null = null;

  start() {
    this.started ??= this.reload().catch((err) => {
      this.started = null;
      console.error("[alerts] failed to start", err);
    });
    return this.started;
  }

  dispose() {
    this.subs.forEach((unsub) => unsub());
    this.subs.clear();
    this.alerts.clear();
  }

  /** Re-read all active alerts from MongoDB and sync price subscriptions. */
  async reload() {
    await connectDB();
    const docs = await Alert.find({ status: "active" }).lean();
    this.alerts.clear();
    for (const d of docs) {
      this.alerts.set(String(d._id), {
        id: String(d._id),
        userId: String(d.userId),
        symbol: d.symbol,
        type: d.type as MarketType,
        condition: d.condition as AlertCondition,
        targetPrice: d.targetPrice,
        notifyVia: d.notifyVia ?? ["push"],
      });
    }
    await this.syncSubscriptions();
    console.log(`[alerts] watching ${this.alerts.size} active alert(s) on ${this.subs.size} symbol(s)`);
  }

  private async syncSubscriptions() {
    const needed = new Set([...this.alerts.values()].map((a) => `${a.type}:${a.symbol}`));
    for (const [key, unsub] of this.subs) {
      if (!needed.has(key)) {
        unsub();
        this.subs.delete(key);
        this.lastPrice.delete(key);
      }
    }
    for (const key of needed) {
      if (this.subs.has(key)) continue;
      const [type, symbol] = key.split(":") as [MarketType, string];
      const feed = await getFeed(type, symbol);
      this.subs.set(key, feed.subscribe(symbol, "1m", (e) => this.onPrice(key, e)));
    }
  }

  private onPrice(key: string, e: CandleEvent) {
    const price = e.candle.close;
    const prev = this.lastPrice.get(key);
    this.lastPrice.set(key, price);

    for (const a of this.alerts.values()) {
      if (`${a.type}:${a.symbol}` !== key || this.firing.has(a.id)) continue;
      const hit =
        (a.condition === "price_above" && price >= a.targetPrice) ||
        (a.condition === "price_below" && price <= a.targetPrice) ||
        (a.condition === "crosses" &&
          prev !== undefined &&
          ((prev < a.targetPrice && price >= a.targetPrice) || (prev > a.targetPrice && price <= a.targetPrice)));
      if (hit) void this.fire(a, price);
    }
  }

  private async fire(a: LiveAlert, price: number) {
    this.firing.add(a.id);
    try {
      // Atomic status flip guarantees one trigger even with multiple server instances.
      const updated = await Alert.findOneAndUpdate(
        { _id: a.id, status: "active" },
        { status: "triggered", triggeredAt: new Date(), triggeredPrice: price },
      );
      this.alerts.delete(a.id);
      if (!updated) return;

      publishAlert(a.userId, {
        alertId: a.id,
        symbol: a.symbol,
        price,
        condition: a.condition,
        targetPrice: a.targetPrice,
      });

      if (a.notifyVia.includes("email")) {
        const user = await User.findById(a.userId).lean();
        if (user) {
          const cond = a.condition.replace("price_", "").replace("_", " ");
          await sendMail(
            user.email,
            `Alert: ${a.symbol} ${cond} ${a.targetPrice}`,
            `Your TradeCharts alert fired.\n\n${a.symbol} is now ${price} (condition: ${cond} ${a.targetPrice}).`,
          );
        }
      }
      await this.syncSubscriptions();
    } catch (err) {
      console.error("[alerts] fire failed", err);
    } finally {
      this.firing.delete(a.id);
    }
  }
}

const g = globalThis as unknown as { __tcAlertEngine?: AlertEngine };
// After a dev hot-reload the global holds an instance of the *old* class — dispose and replace it.
if (g.__tcAlertEngine && !(g.__tcAlertEngine instanceof AlertEngine)) {
  (g.__tcAlertEngine as unknown as { dispose?: () => void }).dispose?.();
  g.__tcAlertEngine = undefined;
}
export const alertEngine = (g.__tcAlertEngine ??= new AlertEngine());

export function ensureAlertEngine() {
  void alertEngine.start();
}
