import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { one, run } from "@/lib/db";
import type { Role, User } from "@/lib/models";

const sessionName = "zdayka_session";
const devSecret = randomBytes(32).toString("hex");

function key() {
  const value = process.env.SESSION_SECRET || (process.env.NODE_ENV !== "production" ? devSecret : "");
  if (value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(value);
}

export async function sessionToken(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key());
}

export async function userFromToken(token?: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return one<User>("SELECT id,name,username,role,bot_started FROM users WHERE id=?", payload.sub) || null;
  } catch { return null; }
}

export async function currentUser() {
  const jar = await cookies();
  return userFromToken(jar.get(sessionName)?.value);
}

export async function requestUser(request: NextRequest) {
  return userFromToken(request.cookies.get(sessionName)?.value);
}

export async function attachSession(response: NextResponse, userId: string) {
  response.cookies.set(sessionName, await sessionToken(userId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30
  });
  return response;
}

export function roleForTelegramId(id: string): Role {
  if (id && id === process.env.OWNER_TELEGRAM_ID) return "owner";
  if (id && id === process.env.MANAGER_TELEGRAM_ID) return "manager";
  return "client";
}

export function upsertTelegramUser(id: string, name: string, username?: string | null) {
  const role = roleForTelegramId(id);
  run(`INSERT INTO users(id,name,username,role) VALUES(?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username,role=excluded.role`,
    id, name.slice(0, 120) || "Клієнт", username?.slice(0, 120) || null, role);
  return one<User>("SELECT id,name,username,role,bot_started FROM users WHERE id=?", id)!;
}

export function isStaff(user: User | null): user is User & { role: "manager" | "owner" } {
  return Boolean(user && (user.role === "owner" || user.role === "manager"));
}

export function verifyMiniAppData(raw: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram bot is not configured");
  const params = new URLSearchParams(raw);
  const hash = params.get("hash") || "";
  const authDate = Number(params.get("auth_date"));
  if (!/^[a-f0-9]{64}$/.test(hash) || !Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 600) return null;
  params.delete("hash");
  const data = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(data).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) return null;
  try {
    const user = JSON.parse(params.get("user") || "null") as { id?: number; first_name?: string; last_name?: string; username?: string } | null;
    if (!user?.id || !Number.isSafeInteger(user.id)) return null;
    return { id: String(user.id), name: [user.first_name, user.last_name].filter(Boolean).join(" ") || "Клієнт", username: user.username || null,
      startParam: params.get("start_param") || null };
  } catch { return null; }
}

export function safeOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === request.nextUrl.host; }
  catch { return false; }
}
