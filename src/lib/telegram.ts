import "server-only";

export async function sendTelegramMessage(chatId: string, text: string, requestId?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const origin = process.env.APP_ORIGIN;
  if (!token || process.env.NOTIFICATIONS_ENABLED !== "1") return { sent: false, reason: "disabled" };
  const url = requestId && origin ? `${origin}/cabinet/${requestId}` : origin ? `${origin}/cabinet` : undefined;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: url ? { inline_keyboard: [[{ text: "Відкрити кабінет", web_app: { url } }]] } : undefined }),
    cache: "no-store"
  });
  if (!response.ok) return { sent: false, reason: `telegram_${response.status}` };
  const result = await response.json() as { ok?: boolean };
  return { sent: Boolean(result.ok), reason: result.ok ? "ok" : "telegram_error" };
}

export function kyivHour() {
  const value = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", hourCycle: "h23" }).format(new Date());
  return Number(value);
}
