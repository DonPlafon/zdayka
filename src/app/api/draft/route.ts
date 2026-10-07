import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestUser, safeOrigin } from "@/lib/auth";
import { one, run, withinLimit } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  description: z.string().trim().min(15).max(3000),
  workType: z.string().max(100).optional(), subject: z.string().max(100).optional(),
  source: z.string().max(150).optional()
});

export async function POST(request: NextRequest) {
  if (!safeOrigin(request)) return NextResponse.json({ error: "Origin rejected" }, { status: 403 });
  if (process.env.NODE_ENV === "production" && process.env.PUBLIC_LAUNCH_ENABLED !== "1") return NextResponse.json({ error: "Прийом заявок ще не відкрито" }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!withinLimit(`draft:${ip}`, 15, 3600)) return NextResponse.json({ error: "Забагато спроб. Спробуй пізніше." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Опиши завдання хоча б кількома словами." }, { status: 400 });
  const id = randomUUID();
  run("INSERT INTO drafts(id,description,work_type,subject,source,expires_at) VALUES(?,?,?,?,?,?)",
    id, parsed.data.description, parsed.data.workType || null, parsed.data.subject || null, parsed.data.source || null,
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  const response = NextResponse.json({ ok: true, next: "/cabinet/new", miniAppUrl: bot ? `https://t.me/${bot}?startapp=draft_${id}` : null });
  response.cookies.set("zdayka_draft", id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 24 * 60 * 60 });
  return response;
}

export async function GET(request: NextRequest) {
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: "Увійди через Telegram" }, { status: 401 });
  const id = request.cookies.get("zdayka_draft")?.value;
  if (!id) return NextResponse.json({ draft: null });
  const draft = one<{ description: string; work_type: string | null; subject: string | null; source: string | null }>(
    "SELECT description,work_type,subject,source FROM drafts WHERE id=? AND expires_at>? AND (claimed_by IS NULL OR claimed_by=?)", id, new Date().toISOString(), user.id);
  if (draft) run("UPDATE drafts SET claimed_by=? WHERE id=? AND claimed_by IS NULL", user.id, id);
  return NextResponse.json({ draft: draft || null });
}
