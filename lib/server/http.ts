import "server-only";
import type { NextRequest } from "next/server";
import { connectDB } from "./db";
import { ensureAlertEngine } from "./alertEngine";
import { ensurePaperEngine } from "./paperEngine";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/**
 * Wraps a route handler: connects to MongoDB, makes sure the alert engine
 * is running, and turns thrown errors into JSON responses.
 */
export function route<C = unknown>(handler: Handler<C>, opts: { db?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      if (opts.db !== false) {
        await connectDB();
        ensureAlertEngine();
        ensurePaperEngine();
      }
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error(`[api] ${req.method} ${req.nextUrl.pathname}`, err);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
