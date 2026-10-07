import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { requestUser, safeOrigin, isStaff } from "@/lib/auth";
import { db, one, run, withinLimit } from "@/lib/db";
import { allowedMime, privatePath } from "@/lib/file-storage";
import type { Order, RequestRow, Revision, Stage } from "@/lib/models";
import { event, getRequest } from "@/lib/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!safeOrigin(request)) return NextResponse.json({ error: "Origin rejected" }, { status: 403 });
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: "Увійди через Telegram" }, { status: 401 });
  if (!withinLimit(`file:${user.id}`, 30, 3600)) return NextResponse.json({ error: "Забагато завантажень" }, { status: 429 });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 27 * 1024 * 1024) return NextResponse.json({ error: "Файл завеликий" }, { status: 413 });
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "Не вдалося прочитати файл" }, { status: 400 }); }
  const file = form.get("file");
  const requestId = String(form.get("requestId") || "");
  const kind = String(form.get("kind") || "client");
  const stageId = String(form.get("stageId") || "") || null;
  const revisionId = String(form.get("revisionId") || "") || null;
  if (!(file instanceof File) || file.size < 1 || file.size > 25 * 1024 * 1024 || file.name.length > 200) return NextResponse.json({ error: "Дозволено файли до 25 МБ" }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/.test(requestId)) return NextResponse.json({ error: "Некоректний номер заявки" }, { status: 400 });
  let req: RequestRow;
  try { req = getRequest(requestId, user); }
  catch { return NextResponse.json({ error: "Заявку не знайдено" }, { status: 404 }); }
  if (!["client", "revision", "stage", "final"].includes(kind)) return NextResponse.json({ error: "Невідомий тип файлу" }, { status: 400 });
  if (!isStaff(user) && (req.client_id !== user.id || !["client", "revision"].includes(kind))) return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  if (kind === "client" && ["closed", "cancelled"].includes(req.status)) return NextResponse.json({ error: "Замовлення закрито" }, { status: 400 });
  if (kind === "stage" || kind === "final") {
    if (!isStaff(user)) return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
    if (kind === "stage") {
      const stage = one<Stage & { request_id: string }>("SELECT s.*,o.request_id FROM stages s JOIN orders o ON o.id=s.order_id WHERE s.id=?", stageId);
      if (!stage || stage.request_id !== requestId || stage.delivered_at) return NextResponse.json({ error: "Етап недоступний" }, { status: 400 });
    } else {
      const order = one<Order>("SELECT * FROM orders WHERE request_id=?", requestId);
      if (!order || order.final_ready_at) return NextResponse.json({ error: "Фінальні файли зараз недоступні" }, { status: 400 });
    }
  }
  if (kind === "revision") {
    const revision = one<Revision & { request_id: string }>("SELECT r.*,o.request_id FROM revisions r JOIN orders o ON o.id=r.order_id WHERE r.id=?", revisionId);
    if (!revision || revision.request_id !== requestId || (!isStaff(user) && revision.client_id !== user.id)) return NextResponse.json({ error: "Правки не знайдено" }, { status: 404 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = allowedMime(file.name, bytes);
  if (!mime) return NextResponse.json({ error: "Підтримуються PDF, Office, ZIP, PNG та JPG" }, { status: 400 });
  const fileId = randomUUID();
  const path = privatePath(fileId);
  try {
    await fs.writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    db().transaction(() => {
      const count = one<{ n: number }>("SELECT COUNT(*) AS n FROM files WHERE request_id=? AND deleted_at IS NULL", requestId)?.n || 0;
      if (count >= 10) throw new Error("У цій заявці вже 10 файлів");
      run(`INSERT INTO files(id,request_id,stage_id,revision_id,kind,storage_key,original_name,mime,size_bytes,uploaded_by)
        VALUES(?,?,?,?,?,?,?,?,?,?)`, fileId, requestId, stageId, revisionId, kind, fileId, file.name, mime, file.size, user.id);
      event(requestId, user.id, "file_uploaded", `Додано файл «${file.name}»`);
    })();
    return NextResponse.json({ ok: true, fileId });
  } catch (error) {
    await fs.unlink(path).catch(() => {});
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не вдалося зберегти файл" }, { status: 400 });
  }
}
