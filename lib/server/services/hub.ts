import "server-only";
import { EventEmitter } from "node:events";
import type { AlertTriggeredEvent, TradeUpdateEvent } from "@/types";

/** Per-user event bus: server engines publish, open SSE streams forward to the browser. */
export interface UserEvents {
  "alert:triggered": AlertTriggeredEvent;
  "trade:update": TradeUpdateEvent;
}
export type UserEventName = keyof UserEvents;

const g = globalThis as unknown as { __tcHub?: EventEmitter };
const hub = (g.__tcHub ??= (() => {
  const e = new EventEmitter();
  e.setMaxListeners(0);
  return e;
})());

export function publishUser<K extends UserEventName>(userId: string, event: K, data: UserEvents[K]) {
  hub.emit(`user:${userId}`, event, data);
}

export function onUserEvent(userId: string, fn: (event: UserEventName, data: unknown) => void) {
  hub.on(`user:${userId}`, fn);
  return () => void hub.off(`user:${userId}`, fn);
}

export function publishAlert(userId: string, event: AlertTriggeredEvent) {
  publishUser(userId, "alert:triggered", event);
}
