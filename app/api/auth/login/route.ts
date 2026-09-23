import { route, readJson, HttpError } from "@/lib/server/http";
import { User } from "@/lib/server/models/User";
import { refreshCookie, signAccessToken, signRefreshToken, toUserDTO, verifyPassword } from "@/lib/server/auth";

export const POST = route(async (req) => {
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const user = await User.findOne({ email });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  const id = String(user._id);
  return Response.json(
    { user: toUserDTO(user), accessToken: await signAccessToken(id) },
    { headers: { "Set-Cookie": refreshCookie(await signRefreshToken(id)) } },
  );
});
