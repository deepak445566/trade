import { refreshCookie } from "@/lib/server/auth";

export async function POST() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": refreshCookie(null) } });
}
