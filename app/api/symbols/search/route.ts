import { route } from "@/lib/server/http";
import { searchSymbols } from "@/lib/server/services/binanceRest";

export const GET = route(
  async (req) => {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 30, 100);
    return Response.json({ symbols: await searchSymbols(q, limit) });
  },
  { db: false },
);
