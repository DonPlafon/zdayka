import { NextRequest, NextResponse } from "next/server";
import { attachSession, safeOrigin, upsertTelegramUser, verifyMiniAppData } from "@/lib/auth";
import { one, run, withinLimit } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!safeOrigin(request)) return NextResponse.json({ error: "Origin rejected" }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!withinLimit(`miniapp:${ip}`, 20, 60)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const { initData } = await request.json() as { initData?: string };
    if (!initData || initData.length > 10000) throw new Error("Invalid input");
    const telegramUser = verifyMiniAppData(initData);
    if (!telegramUser) return NextResponse.json({ error: "Invalid Telegram data" }, { status: 401 });
    upsertTelegramUser(telegramUser.id, telegramUser.name, telegramUser.username);
    const response = NextResponse.json({ ok: true });
    const draftId = telegramUser.startParam?.startsWith("draft_") ? telegramUser.startParam.slice(6) : null;
    if (draftId && /^[0-9a-f-]{36}$/.test(draftId)) {
      const draft = one<{ id: string }>("SELECT id FROM drafts WHERE id=? AND expires_at>? AND (claimed_by IS NULL OR claimed_by=?)", draftId, new Date().toISOString(), telegramUser.id);
      if (draft) {
        run("UPDATE drafts SET claimed_by=? WHERE id=? AND (claimed_by IS NULL OR claimed_by=?)", telegramUser.id, draftId, telegramUser.id);
        response.cookies.set("zdayka_draft", draftId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 24 * 60 * 60 });
      }
    }
    return attachSession(response, telegramUser.id);
  } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
}
