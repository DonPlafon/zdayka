import { NextRequest, NextResponse } from "next/server";
import { analytics } from "@/lib/service";
import { run } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import { upsertTelegramUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const update = await request.json().catch(() => null) as { message?: { text?: string; from?: { id: number; first_name?: string; last_name?: string; username?: string }; chat?: { id: number } } } | null;
  const message = update?.message;
  if (message?.text?.startsWith("/start") && message.from?.id && message.chat?.id === message.from.id) {
    const id = String(message.from.id);
    upsertTelegramUser(id, [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || "Клієнт", message.from.username);
    run("UPDATE users SET bot_started=1 WHERE id=?", id);
    run("UPDATE notifications SET state='pending' WHERE client_id=? AND state='waiting_bot'", id);
    analytics("bot_opened", id);
    await sendTelegramMessage(id, "Заявку та замовлення можна переглянути в кабінеті.");
  }
  return NextResponse.json({ ok: true });
}
