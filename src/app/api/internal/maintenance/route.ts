import { promises as fs } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { db, many, one, run } from "@/lib/db";
import { privatePath } from "@/lib/file-storage";
import { notify } from "@/lib/service";
import { kyivHour, sendTelegramMessage } from "@/lib/telegram";
import type { Offer } from "@/lib/models";

export const runtime = "nodejs";

type Pending = { id: string; client_id: string; request_id: string | null; type: string; text: string; bot_started: number };
type FileCleanup = { id: string; request_id: string; storage_key: string; client_id: string };

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const hour = kyivHour();
  const pending = many<Pending>(`SELECT n.id,n.client_id,n.request_id,n.type,n.text,u.bot_started
    FROM notifications n JOIN users u ON u.id=n.client_id
    WHERE n.state='pending' AND n.due_at<=? ORDER BY n.due_at LIMIT 100`, new Date().toISOString());
  let sent = 0, skipped = 0;
  for (const entry of pending) {
    if (entry.type.includes("reminder")) {
      if (hour < 9 || hour >= 21) continue;
      if (entry.request_id) {
        const offer = one<Offer>("SELECT * FROM offers WHERE request_id=? ORDER BY version DESC LIMIT 1", entry.request_id);
        if (!offer || offer.accepted_at || Date.parse(offer.expires_at) < Date.now()) {
          run("UPDATE notifications SET state='skipped' WHERE id=?", entry.id); skipped++; continue;
        }
      }
    }
    if (!entry.bot_started) { run("UPDATE notifications SET state='waiting_bot' WHERE id=?", entry.id); continue; }
    try {
      const result = await sendTelegramMessage(entry.client_id, entry.text, entry.request_id || undefined);
      if (result.sent) { run("UPDATE notifications SET state='sent',sent_at=CURRENT_TIMESTAMP WHERE id=?", entry.id); sent++; }
      else if (result.reason === "disabled") break;
      else run("UPDATE notifications SET state='failed' WHERE id=?", entry.id);
    } catch { run("UPDATE notifications SET state='failed' WHERE id=?", entry.id); }
  }

  const noticeRows = many<FileCleanup>(`SELECT f.id,f.request_id,f.storage_key,r.client_id FROM files f JOIN requests r ON r.id=f.request_id
    WHERE f.deleted_at IS NULL AND f.delete_notice_at IS NULL AND r.closed_at IS NOT NULL
      AND date('now')>=date(r.closed_at,'+3 months','-7 days')`);
  const noticeRequests = new Map<string, string>();
  for (const file of noticeRows) noticeRequests.set(file.request_id, file.client_id);
  db().transaction(() => {
    for (const file of noticeRows) run("UPDATE files SET delete_notice_at=CURRENT_TIMESTAMP WHERE id=?", file.id);
    for (const [requestId, clientId] of noticeRequests) notify(clientId, requestId, "file_expiry", "Файли закритого замовлення буде видалено через 7 днів. Завантаж їх, якщо вони потрібні.");
  })();

  const expired = many<FileCleanup>(`SELECT f.id,f.request_id,f.storage_key,r.client_id FROM files f JOIN requests r ON r.id=f.request_id
    WHERE f.deleted_at IS NULL AND f.delete_notice_at IS NOT NULL AND date('now')>=date(f.delete_notice_at,'+7 days')
      AND r.closed_at IS NOT NULL AND date('now')>=date(r.closed_at,'+3 months')
      AND NOT EXISTS (SELECT 1 FROM orders o JOIN revisions v ON v.order_id=o.id WHERE o.request_id=r.id AND v.status IN ('new','free'))`);
  let deleted = 0;
  for (const file of expired) {
    try { await fs.unlink(privatePath(file.storage_key)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") continue; }
    run("UPDATE files SET deleted_at=CURRENT_TIMESTAMP WHERE id=?", file.id); deleted++;
  }
  run("DELETE FROM drafts WHERE expires_at<?", new Date().toISOString());
  return NextResponse.json({ sent, skipped, noticed: noticeRequests.size, deleted });
}
