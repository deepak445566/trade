import { route, HttpError } from "@/lib/server/http";
import { User } from "@/lib/server/models/User";
import {
  REFRESH_COOKIE,
  refreshCookie,
  signAccessToken,
  signRefreshToken,
  toUserDTO,
  verifyToken,
} from "@/lib/server/auth";

/** Exchanges the httpOnly refresh cookie for a new access token (and rotates the cookie). */
export const POST = route(async (req) => {
  const token = req.cookies.get(REFRESH_COOKIE)?.value;
  const userId = token ? await verifyToken(token, "refresh") : null;
  if (!userId) throw new HttpError(401, "Session expired");

  const user = await User.findById(userId).lean();
  if (!user) throw new HttpError(401, "Session expired");

  return Response.json(
    { user: toUserDTO(user), accessToken: await signAccessToken(userId) },
    { headers: { "Set-Cookie": refreshCookie(await signRefreshToken(userId)) } },
  );
});
