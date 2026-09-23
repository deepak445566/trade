import "server-only";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import mongoose from "mongoose";
import { env } from "./env";

// Cached on globalThis so dev hot-reloads and separate server bundles
// (route handlers + instrumentation) share a single connection.
const g = globalThis as unknown as { __tcMongo?: Promise<typeof mongoose> };

async function resolveUri(): Promise<string> {
  if (env.MONGODB_URI) return env.MONGODB_URI;
  if (env.isProd) throw new Error("MONGODB_URI is required in production");

  // Dev fallback: a local embedded MongoDB whose data persists in ~/.tradecharts-dev/mongo
  // (kept outside the project so the Next.js build doesn't try to trace it).
  const dbPath = process.env.DEV_MONGO_DIR || path.join(os.homedir(), ".tradecharts-dev", "mongo");
  console.warn(`[db] MONGODB_URI not set — starting embedded dev MongoDB (${dbPath})`);
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  fs.mkdirSync(dbPath, { recursive: true });
  const server = await MongoMemoryServer.create({
    instance: { dbPath, storageEngine: "wiredTiger", port: 27027, launchTimeout: 60_000 },
  });
  return server.getUri("tradecharts");
}

export function connectDB(): Promise<typeof mongoose> {
  if (!g.__tcMongo) {
    g.__tcMongo = resolveUri()
      .then((uri) => mongoose.connect(uri, { dbName: "tradecharts" }))
      .then((m) => {
        console.log("[db] connected");
        return m;
      })
      .catch((err) => {
        g.__tcMongo = undefined;
        throw err;
      });
  }
  return g.__tcMongo;
}
