import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { requestUser, safeOrigin, isStaff } from "@/lib/auth";
import { db, one, run, withinLimit } from "@/lib/db";
import { privatePath } from "@/lib/file-storage";
import type { Order, Revision } from "@/lib/models";
import { acceptOffer, analytics, confirmPayment, createRequest, createRevision, deliverStage, event, getRequest, notify, reportPayment, sendOffer, ServiceError } from "@/lib/service";

export const runtime = "nodejs";

const text = z.string().trim().min(1).max(5000);
const id = z.string().uuid();
const kinds = ["Курсова", "Кваліфікаційна / дипломна", "Лабораторна", "Розрахунки й задачі", "Перевірка й доопрацювання", "Інше"] as const;
const subjects = ["Економіка", "Фінанси", "Психологія", "Математика", "Програмування", "Бази даних", "Інше"] as const;

const requestSchema = z.object({
  action: z.literal("create_request"), description: z.string().trim().min(15).max(3000),
  workType: z.enum(kinds).optional(), subject: z.enum(subjects).optional(),
  topic: z.string().max(200).optional(), volume: z.string().max(120).optional(),
  deadline: z.iso.date().optional(), urgent: z.boolean().optional(), source: z.string().max(150).optional()
}).refine(x => Boolean(x.deadline || x.urgent), { message: "Вкажи термін або терміновість" });

const offerSchema = z.object({
  action: z.literal("send_offer"), requestId: id, scope: z.string().trim().min(10).max(5000),
  totalCents: z.number().int().positive().max(100000000), depositCents: z.number().int().positive(),
  dueAt: z.iso.date(), revisionsText: z.string().trim().min(5).max(1000),
  stages: z.array(z.object({ title: z.string().trim().min(2).max(120), resultDescription: z.string().trim().min(5).max(1000), amountCents: z.number().int().positive(), dueAt: z.iso.date() })).min(1).max(20)
}).refine(x => x.depositCents <= x.totalCents && x.depositCents * 2 >= x.totalCents, { message: "Передоплата має бути від 50% до 100%" });

const simpleId = z.object({ requestId: id });

export async function POST(request: NextRequest) {
  if (!safeOrigin(request)) return NextResponse.json({ error: "Origin rejected" }, { status: 403 });
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: "Потрібен вхід через Telegram" }, { status: 401 });
  if (!withinLimit(`action:${user.id}`, 100, 60)) return NextResponse.json({ error: "Забагато дій. Спробуй пізніше." }, { status: 429 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  try {
    switch (body.action) {
      case "create_request": {
        if (process.env.NODE_ENV === "production" && process.env.PUBLIC_LAUNCH_ENABLED !== "1") throw new ServiceError("Прийом заявок ще не відкрито", 503);
        const data = requestSchema.parse(body);
        const requestId = createRequest(user, data);
        const response = NextResponse.json({ ok: true, requestId });
        response.cookies.delete("zdayka_draft");
        return response;
      }
      case "send_offer": {
        const data = offerSchema.parse(body);
        sendOffer(user, data);
        return NextResponse.json({ ok: true });
      }
      case "accept_offer": {
        const { requestId } = simpleId.parse(body);
        acceptOffer(user, requestId);
        return NextResponse.json({ ok: true });
      }
      case "report_payment": {
        const { requestId } = simpleId.parse(body);
        reportPayment(user, requestId);
        return NextResponse.json({ ok: true });
      }
      case "confirm_payment": {
        const data = z.object({ paymentId: id, approve: z.boolean() }).parse(body);
        confirmPayment(user, data.paymentId, data.approve);
        return NextResponse.json({ ok: true });
      }
      case "set_cost": {
        if (!isStaff(user)) throw new ServiceError("Недостатньо прав", 403);
        const data = z.object({ orderId: id, costCents: z.number().int().min(0).max(100000000) }).parse(body);
        const order = one<Order>("SELECT * FROM orders WHERE id=?", data.orderId);
        if (!order) throw new ServiceError("Замовлення не знайдено", 404);
        getRequest(order.request_id, user);
        run("UPDATE orders SET cost_cents=? WHERE id=?", data.costCents, order.id);
        event(order.request_id, user.id, "cost_updated", "Собівартість оновлено");
        return NextResponse.json({ ok: true });
      }
      case "deliver_stage": {
        const data = z.object({ stageId: id, note: z.string().trim().max(2000) }).parse(body);
        deliverStage(user, data.stageId, data.note);
        return NextResponse.json({ ok: true });
      }
      case "request_revision": {
        const data = z.object({ orderId: id, description: z.string().trim().min(10).max(3000) }).parse(body);
        return NextResponse.json({ ok: true, revisionId: createRevision(user, data.orderId, data.description) });
      }
      case "decide_revision": {
        if (!isStaff(user)) throw new ServiceError("Недостатньо прав", 403);
        const data = z.object({ revisionId: id, status: z.enum(["free", "paid", "done"]), note: z.string().trim().max(2000) }).parse(body);
        const revision = one<Revision>("SELECT * FROM revisions WHERE id=?", data.revisionId);
        if (!revision) throw new ServiceError("Правки не знайдено", 404);
        const order = one<Order>("SELECT * FROM orders WHERE id=?", revision.order_id)!;
        const req = getRequest(order.request_id, user);
        db().transaction(() => {
          run("UPDATE revisions SET status=?,decision_note=?,handled_at=CURRENT_TIMESTAMP WHERE id=?", data.status, data.note || null, data.revisionId);
          event(req.id, user.id, "revision_decided", data.status === "paid" ? "Нові вимоги потребують окремої оцінки" : data.status === "done" ? "Правки виконано" : "Правки прийнято без доплати");
          notify(req.client_id, req.id, "revision_update", data.status === "paid" ? "Це нові вимоги. Менеджер уточнить вартість." : data.status === "done" ? "Правки виконано." : "Правки прийнято без доплати.");
        })();
        return NextResponse.json({ ok: true });
      }
      case "set_status": {
        if (!isStaff(user)) throw new ServiceError("Недостатньо прав", 403);
        const data = z.object({ requestId: id, status: z.enum(["needs_info", "received", "working"]) }).parse(body);
        const req = getRequest(data.requestId, user);
        if (["closed", "cancelled"].includes(req.status)) throw new ServiceError("Заявку закрито");
        if (data.status === "working" && !one<Order>("SELECT * FROM orders WHERE request_id=?", req.id)) throw new ServiceError("Потрібна підтверджена передоплата");
        run("UPDATE requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", data.status, req.id);
        event(req.id, user.id, "status_changed", data.status === "needs_info" ? "Потрібні уточнення" : data.status === "working" ? "У роботі" : "Заявку отримано");
        if (data.status === "needs_info") notify(req.client_id, req.id, "needs_info", "Потрібні уточнення до заявки. Напиши менеджеру.");
        return NextResponse.json({ ok: true });
      }
      case "send_note": {
        if (!isStaff(user)) throw new ServiceError("Недостатньо прав", 403);
        const data = z.object({ requestId: id, message: text }).parse(body);
        const req = getRequest(data.requestId, user);
        event(req.id, user.id, "manager_note", data.message);
        notify(req.client_id, req.id, "manager_note", data.message);
        return NextResponse.json({ ok: true });
      }
      case "close_order": {
        if (!isStaff(user)) throw new ServiceError("Недостатньо прав", 403);
        const { requestId } = simpleId.parse(body);
        const req = getRequest(requestId, user);
        const order = one<Order>("SELECT * FROM orders WHERE request_id=?", requestId);
        if (!order?.final_released_at) throw new ServiceError("Фінальні файли ще не видано");
        db().transaction(() => {
          run("UPDATE orders SET status='closed',closed_at=CURRENT_TIMESTAMP WHERE id=?", order.id);
          run("UPDATE requests SET status='closed',closed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?", req.id);
          event(req.id, user.id, "closed", "Замовлення закрито");
          notify(req.client_id, req.id, "closed", "Замовлення закрито. Файли будуть доступні ще 3 місяці.");
        })();
        return NextResponse.json({ ok: true });
      }
      case "cancel_request": {
        if (!isStaff(user)) throw new ServiceError("Недостатньо прав", 403);
        const { requestId } = simpleId.parse(body);
        const req = getRequest(requestId, user);
        if (["closed", "cancelled"].includes(req.status)) throw new ServiceError("Заявку вже закрито");
        const order = one<Order>("SELECT * FROM orders WHERE request_id=?", req.id);
        const paid = one<{ n: number }>("SELECT COALESCE(SUM(amount_cents),0) AS n FROM payments WHERE request_id=? AND state='confirmed'", req.id)?.n || 0;
        const delivered = order ? one<{ n: number }>(`SELECT COALESCE(SUM(amount_cents),0) AS n FROM stages
          WHERE order_id=? AND delivered_at IS NOT NULL AND (position < (SELECT MAX(position) FROM stages WHERE order_id=?) OR ? IS NOT NULL)`, order.id, order.id, order.final_released_at)?.n || 0 : 0;
        const refund = Math.max(0, paid - delivered);
        db().transaction(() => {
          run("UPDATE requests SET status='cancelled',closed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?", req.id);
          if (order) run("UPDATE orders SET status='cancelled',closed_at=CURRENT_TIMESTAMP WHERE id=?", order.id);
          event(req.id, user.id, "cancelled", `Замовлення скасовано. Розрахунок повернення: ${(refund / 100).toFixed(2)} грн. Повернення виконується вручну.`);
          notify(req.client_id, req.id, "cancelled", "Замовлення скасовано. Менеджер повідомить розрахунок повернення.");
        })();
        return NextResponse.json({ ok: true, refundCents: refund });
      }
      case "consent_case": {
        const data = z.object({ requestId: id, granted: z.boolean() }).parse(body);
        const req = getRequest(data.requestId, user);
        if (req.client_id !== user.id) throw new ServiceError("Недостатньо прав", 403);
        run(`INSERT INTO consents(id,client_id,request_id,purpose,granted) VALUES(hex(randomblob(16)),?,?, 'case',?)
          ON CONFLICT(client_id,request_id,purpose) DO UPDATE SET granted=excluded.granted,changed_at=CURRENT_TIMESTAMP`, user.id, req.id, data.granted ? 1 : 0);
        event(req.id, user.id, "consent_changed", data.granted ? "Дозвіл на кейс надано" : "Дозвіл на кейс відкликано");
        return NextResponse.json({ ok: true });
      }
      case "request_file_deletion": {
        const { requestId } = simpleId.parse(body);
        const req = getRequest(requestId, user);
        if (req.client_id !== user.id || !req.closed_at) throw new ServiceError("Доступно після закриття замовлення", 403);
        event(req.id, user.id, "file_deletion_requested", "Клієнт попросив достроково видалити файли");
        return NextResponse.json({ ok: true });
      }
      case "delete_file": {
        if (!isStaff(user)) throw new ServiceError("Недостатньо прав", 403);
        const data = z.object({ fileId: id }).parse(body);
        const file = one<{ id: string; request_id: string; storage_key: string; original_name: string }>("SELECT * FROM files WHERE id=? AND deleted_at IS NULL", data.fileId);
        if (!file) throw new ServiceError("Файл не знайдено", 404);
        getRequest(file.request_id, user);
        try { await fs.unlink(privatePath(file.storage_key)); }
        catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
        run("UPDATE files SET deleted_at=CURRENT_TIMESTAMP WHERE id=?", file.id);
        event(file.request_id, user.id, "file_deleted", `Файл «${file.original_name}» видалено`);
        return NextResponse.json({ ok: true });
      }
      default: return NextResponse.json({ error: "Невідома дія" }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Некоректні дані" }, { status: 400 });
    if (error instanceof ServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Action failed", error);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}
