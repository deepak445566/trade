import { route, HttpError } from "@/lib/server/http";
import { User } from "@/lib/server/models/User";
import { requireUserId, toUserDTO } from "@/lib/server/auth";

export const GET = route(async (req) => {
  const user = await User.findById(await requireUserId(req)).lean();
  if (!user) throw new HttpError(404, "User not found");
  return Response.json({ user: toUserDTO(user) });
});
