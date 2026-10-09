import { NextRequest, NextResponse } from "next/server";
import { attachSession, safeOrigin } from "@/lib/auth";
import { run, withinLimit } from "@/lib/db";
import { staffLoginConfigured, verifyStaffPassword } from "@/lib/staff-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!safeOrigin(request)) return NextResponse.json({ error: "Запит відхилено" }, { status: 403 });
  if (!staffLoginConfigured()) return NextResponse.json({ error: "Вхід для команди ще не налаштовано" }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!withinLimit(`staff-login-ip:${ip}`, 8, 15 * 60)) return NextResponse.json({ error: "Забагато спроб. Спробуй пізніше." }, { status: 429 });
  const input = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  if (!input || typeof input.username !== "string" || typeof input.password !== "string" || input.username.length > 64 || input.password.length > 256) {
    return NextResponse.json({ error: "Невірний логін або пароль" }, { status: 401 });
  }
  const username = input.username.trim();
  if (!withinLimit(`staff-login-user:${username.toLowerCase()}`, 20, 60 * 60)) return NextResponse.json({ error: "Забагато спроб. Спробуй пізніше." }, { status: 429 });
  const role = verifyStaffPassword(username, input.password);
  if (!role) return NextResponse.json({ error: "Невірний логін або пароль" }, { status: 401 });
  const id = `staff:${role}`;
  run("INSERT INTO users(id,name,role) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role", id, role === "owner" ? "Власниця" : "Менеджер", role);
  return attachSession(NextResponse.json({ ok: true }), id, "staff");
}
