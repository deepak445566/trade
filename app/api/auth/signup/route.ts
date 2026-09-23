import { route, readJson, HttpError } from "@/lib/server/http";
import { User } from "@/lib/server/models/User";
import { Watchlist } from "@/lib/server/models/Watchlist";
import { hashPassword, refreshCookie, signAccessToken, signRefreshToken, toUserDTO } from "@/lib/server/auth";

export const POST = route(async (req) => {
  const body = await readJson<{ email?: string; password?: string; name?: string }>(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim() || email.split("@")[0];

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email");
  if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
  if (await User.exists({ email })) throw new HttpError(409, "An account with this email already exists");

  const user = await User.create({ email, name, passwordHash: await hashPassword(password) });
  await Watchlist.create({
    userId: user._id,
    name: "Default",
    symbols: ["XAUUSD", "XAGUSD", "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"].map((symbol) => ({ symbol, type: "crypto" })),
  });

  const id = String(user._id);
  return Response.json(
    { user: toUserDTO(user), accessToken: await signAccessToken(id) },
    { status: 201, headers: { "Set-Cookie": refreshCookie(await signRefreshToken(id)) } },
  );
});
