import { route, readJson, HttpError } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/auth";
import { Workspace } from "@/lib/server/models/Workspace";
import { sanitizeWorkspace } from "@/lib/workspace";
import type { WorkspaceDTO } from "@/types";

export const GET = route(async (req) => {
  const userId = await requireUserId(req);
  const ws = await Workspace.findOne({ userId }).lean();
  if (!ws) return Response.json({ workspace: null });
  const workspace: WorkspaceDTO = {
    ...sanitizeWorkspace({ name: ws.name, layout: ws.layout, charts: ws.charts }),
    updatedAt: ws.updatedAt?.toISOString(),
  };
  return Response.json({ workspace });
});

export const POST = route(async (req) => {
  const userId = await requireUserId(req);
  const body = await readJson<unknown>(req);
  const raw = JSON.stringify(body ?? {});
  if (raw.length > 1_000_000) throw new HttpError(413, "Workspace too large");

  const clean = sanitizeWorkspace(body);
  const ws = await Workspace.findOneAndUpdate(
    { userId },
    { $set: { name: clean.name, layout: clean.layout, charts: clean.charts } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return Response.json({ workspace: { ...clean, updatedAt: ws?.updatedAt?.toISOString() } });
});
