import "server-only";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { env } from "./env";
import { HttpError } from "./http";
import type { UserDTO } from "@/types";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export const REFRESH_COOKIE = "tc_refresh";
const ACCESS_TTL = "15m";
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface TokenPayload {
  sub: string;
  kind: "access" | "refresh";
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function signAccessToken(userId: string) {
  return new SignJWT({ kind: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(secret);
}

export async function signRefreshToken(userId: string) {
  return new SignJWT({ kind: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyToken(token: string, kind: TokenPayload["kind"]): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.kind !== kind || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function refreshCookie(token: string | null) {
  const parts = [
    `${REFRESH_COOKIE}=${token ?? ""}`,
    "Path=/api/auth",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${token ? REFRESH_TTL_SECONDS : 0}`,
  ];
  if (env.isProd) parts.push("Secure");
  return parts.join("; ");
}

/** Reads the access token from `Authorization: Bearer` (or `?token=` for EventSource). */
export async function getUserId(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.nextUrl.searchParams.get("token");
  if (!token) return null;
  return verifyToken(token, "access");
}

export async function requireUserId(req: NextRequest): Promise<string> {
  const id = await getUserId(req);
  if (!id) throw new HttpError(401, "Unauthorized");
  return id;
}

export function toUserDTO(u: { _id: unknown; email: string; name: string; plan?: string | null }): UserDTO {
  return { id: String(u._id), email: u.email, name: u.name, plan: u.plan === "pro" ? "pro" : "free" };
}
