import "server-only";
import { randomUUID } from "node:crypto";
import { db, many, one, run } from "@/lib/db";
import type { EventRow, Offer, Order, Payment, RequestRow, Revision, Stage, StoredFile, User } from "@/lib/models";
import { isStaff } from "@/lib/auth";

export class ServiceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type StageInput = { title: string; resultDescription: string; amountCents: number; dueAt: string };

export function canRead(request: RequestRow, user: User) {
  return isStaff(user) || request.client_id === user.id;
}

export function getRequest(id: string, user: User) {
  const item = one<RequestRow>("SELECT * FROM requests WHERE id=?", id);
  if (!item || !canRead(item, user)) throw new ServiceError("Заявку не знайдено", 404);
  return item;
}

export function event(requestId: string, actorId: string | null, type: string, message: string) {
  run("INSERT INTO events(id,request_id,actor_id,type,message) VALUES(?,?,?,?,?)", randomUUID(), requestId, actorId, type, message);
}

export function notify(clientId: string, requestId: string, type: string, text: string, dueAt?: string) {
  run("INSERT INTO notifications(id,client_id,request_id,type,text,due_at) VALUES(?,?,?,?,?,?)",
    randomUUID(), clientId, requestId, type, text, dueAt || new Date().toISOString());
}

export function analytics(type: string, clientId?: string | null, requestId?: string | null, source?: string | null) {
  run("INSERT INTO analytics(id,client_id,request_id,type,source) VALUES(?,?,?,?,?)", randomUUID(), clientId || null, requestId || null, type, source || null);
}

export function createRequest(user: User, input: { description: string; workType?: string; subject?: string; topic?: string; volume?: string; deadline?: string; urgent?: boolean; source?: string }) {
  const id = randomUUID();
  db().transaction(() => {
    run(`INSERT INTO requests(id,client_id,description,work_type,subject,topic,volume,deadline,urgent,source)
      VALUES(?,?,?,?,?,?,?,?,?,?)`, id, user.id, input.description, input.workType || null, input.subject || null,
      input.topic || null, input.volume || null, input.deadline || null, input.urgent ? 1 : 0, input.source || null);
    event(id, user.id, "request_created", "Заявку отримано");
    analytics("request_created", user.id, id, input.source);
    notify(user.id, id, "request_received", "Заявку отримано. Менеджер перегляне деталі.");
  })();
  return id;
}

export function sendOffer(user: User, input: { requestId: string; scope: string; totalCents: number; depositCents: number; dueAt: string; stages: StageInput[]; revisionsText: string }) {
  if (!isStaff(user)) throw new ServiceError("Недостатньо прав", 403);
  const request = getRequest(input.requestId, user);
  if (["closed", "cancelled"].includes(request.status)) throw new ServiceError("Заявку закрито");
  if (one<Payment>("SELECT * FROM payments WHERE request_id=? AND state='reported' LIMIT 1", request.id)) {
    throw new ServiceError("Спочатку перевір повідомлену оплату");
  }
  if (!input.stages.length || input.stages.reduce((n, s) => n + s.amountCents, 0) !== input.totalCents) throw new ServiceError("Сума етапів має дорівнювати ціні");
  if (input.stages.some((stage, index) => stage.dueAt > input.dueAt || (index > 0 && stage.dueAt < input.stages[index - 1].dueAt))) {
    throw new ServiceError("Терміни етапів мають іти за порядком і не бути пізніше фінального терміну");
  }
  const existing = one<Order>("SELECT * FROM orders WHERE request_id=?", request.id);
  if (existing) {
    if (existing.final_ready_at) throw new ServiceError("Після готовності фіналу нову пропозицію потрібно оформити окремим замовленням");
    const delivered = many<Stage>("SELECT * FROM stages WHERE order_id=? AND delivered_at IS NOT NULL ORDER BY position", existing.id);
    for (const stage of delivered) {
      const proposed = input.stages[stage.position];
      if (!proposed || proposed.title !== stage.title || proposed.amountCents !== stage.amount_cents || proposed.resultDescription !== stage.result_description) {
        throw new ServiceError("Вже надані етапи не можна змінювати в новій пропозиції");
      }
    }
  }
  const version = (one<{ n: number }>("SELECT COALESCE(MAX(version),0)+1 AS n FROM offers WHERE request_id=?", request.id)?.n || 1);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  db().transaction(() => {
    run(`INSERT INTO offers(id,request_id,version,scope,total_cents,deposit_cents,due_at,revisions_text,stages_json,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`, id, request.id, version, input.scope, input.totalCents, input.depositCents,
      input.dueAt, input.revisionsText, JSON.stringify(input.stages), expiresAt);
    run("UPDATE requests SET status='awaiting_payment',updated_at=CURRENT_TIMESTAMP WHERE id=?", request.id);
    event(request.id, user.id, "offer_sent", `Пропозицію №${version} надіслано`);
    notify(request.client_id, request.id, "offer_ready", "Пропозиція готова. Переглянь склад, ціну й термін.");
    notify(request.client_id, request.id, `offer_reminder_${version}`, "Пропозиція очікує на відповідь.", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    analytics("offer_sent", request.client_id, request.id, request.source);
  })();
  return id;
}

export function acceptOffer(user: User, requestId: string) {
  const request = getRequest(requestId, user);
  if (request.client_id !== user.id) throw new ServiceError("Недостатньо прав", 403);
  if (["closed", "cancelled"].includes(request.status)) throw new ServiceError("Заявку закрито");
  const offer = one<Offer>("SELECT * FROM offers WHERE request_id=? ORDER BY version DESC LIMIT 1", requestId);
  if (!offer || offer.accepted_at) throw new ServiceError("Немає нової пропозиції");
  if (Date.parse(offer.expires_at) <= Date.now()) throw new ServiceError("Термін пропозиції минув. Попроси нову оцінку.");
  db().transaction(() => {
    run("UPDATE offers SET accepted_at=CURRENT_TIMESTAMP WHERE id=?", offer.id);
    const order = one<Order>("SELECT * FROM orders WHERE request_id=?", requestId);
    if (order) {
      run("UPDATE orders SET offer_id=? WHERE id=?", offer.id, order.id);
      run("DELETE FROM stages WHERE order_id=? AND delivered_at IS NULL", order.id);
      const stages = JSON.parse(offer.stages_json) as StageInput[];
      stages.forEach((stage, position) => {
        const prior = one<Stage>("SELECT * FROM stages WHERE order_id=? AND position=?", order.id, position);
        if (!prior) run(`INSERT INTO stages(id,order_id,position,title,result_description,amount_cents,due_at)
          VALUES(?,?,?,?,?,?,?)`, randomUUID(), order.id, position, stage.title, stage.resultDescription, stage.amountCents, stage.dueAt);
      });
    }
    event(requestId, user.id, "offer_accepted", `Умови пропозиції №${offer.version} погоджено`);
  })();
}

export function reportPayment(user: User, requestId: string) {
  if (process.env.NODE_ENV === "production" && !process.env.PAYMENT_INSTRUCTIONS) throw new ServiceError("Спосіб оплати ще не налаштовано");
  const request = getRequest(requestId, user);
  if (request.client_id !== user.id) throw new ServiceError("Недостатньо прав", 403);
  if (["closed", "cancelled"].includes(request.status)) throw new ServiceError("Заявку закрито");
  const offer = one<Offer>("SELECT * FROM offers WHERE request_id=? ORDER BY version DESC LIMIT 1", requestId);
  if (!offer?.accepted_at) throw new ServiceError("Спочатку погодь останню версію умов");
  const order = one<Order>("SELECT * FROM orders WHERE request_id=?", requestId);
  const kind = order ? "balance" : "deposit";
  const confirmed = one<{ n: number }>("SELECT COALESCE(SUM(amount_cents),0) AS n FROM payments WHERE request_id=? AND state='confirmed'", requestId)?.n || 0;
  const amount = order ? offer.total_cents - confirmed : offer.deposit_cents;
  if (amount <= 0) throw new ServiceError("Оплату вже підтверджено");
  const pending = one<Payment>("SELECT * FROM payments WHERE request_id=? AND state='reported' AND kind=?", requestId, kind);
  if (pending) throw new ServiceError("Повідомлення про оплату вже надіслано");
  db().transaction(() => {
    run("INSERT INTO payments(id,request_id,order_id,kind,amount_cents) VALUES(?,?,?,?,?)", randomUUID(), requestId, order?.id || null, kind, amount);
    event(requestId, user.id, "payment_reported", "Клієнт повідомив про оплату. Потрібна перевірка менеджера.");
  })();
}

export function confirmPayment(user: User, paymentId: string, approve: boolean) {
  if (!isStaff(user)) throw new ServiceError("Недостатньо прав", 403);
  const payment = one<Payment>("SELECT * FROM payments WHERE id=?", paymentId);
  if (!payment || payment.state !== "reported") throw new ServiceError("Платіж не знайдено");
  const request = getRequest(payment.request_id, user);
  if (["closed", "cancelled"].includes(request.status)) throw new ServiceError("Заявку закрито");
  db().transaction(() => {
    run("UPDATE payments SET state=?,confirmed_at=?,confirmed_by=? WHERE id=?", approve ? "confirmed" : "rejected", approve ? new Date().toISOString() : null, approve ? user.id : null, paymentId);
    if (!approve) { event(request.id, user.id, "payment_rejected", "Оплату не підтверджено"); return; }
    let order = one<Order>("SELECT * FROM orders WHERE request_id=?", request.id);
    if (payment.kind === "deposit" && !order) {
      const offer = one<Offer>("SELECT * FROM offers WHERE request_id=? AND accepted_at IS NOT NULL ORDER BY version DESC LIMIT 1", request.id);
      if (!offer) throw new ServiceError("Немає погодженої пропозиції");
      const orderId = randomUUID();
      run("INSERT INTO orders(id,request_id,offer_id,status) VALUES(?,?,?,'working')", orderId, request.id, offer.id);
      const stages = JSON.parse(offer.stages_json) as StageInput[];
      stages.forEach((stage, position) => run(`INSERT INTO stages(id,order_id,position,title,result_description,amount_cents,due_at)
        VALUES(?,?,?,?,?,?,?)`, randomUUID(), orderId, position, stage.title, stage.resultDescription, stage.amountCents, stage.dueAt));
      run("UPDATE requests SET status='working',updated_at=CURRENT_TIMESTAMP WHERE id=?", request.id);
      order = one<Order>("SELECT * FROM orders WHERE id=?", orderId);
      run("UPDATE payments SET order_id=? WHERE id=?", orderId, payment.id);
    }
    if (order) {
      const offer = one<Offer>("SELECT * FROM offers WHERE id=?", order.offer_id)!;
      const confirmed = one<{ n: number }>("SELECT COALESCE(SUM(amount_cents),0) AS n FROM payments WHERE request_id=? AND state='confirmed'", request.id)?.n || 0;
      if (order.final_ready_at && confirmed >= offer.total_cents && !order.final_released_at) {
        run("UPDATE orders SET final_released_at=CURRENT_TIMESTAMP WHERE id=?", order.id);
        notify(request.client_id, request.id, "final_released", "Фінальні файли доступні в замовленні.");
      }
    }
    event(request.id, user.id, "payment_confirmed", `Оплату підтверджено: ${(payment.amount_cents / 100).toFixed(2)} грн`);
    notify(request.client_id, request.id, "payment_confirmed", "Оплату підтверджено.");
    analytics("payment_confirmed", request.client_id, request.id, request.source);
  })();
}

export function deliverStage(user: User, stageId: string, note: string) {
  if (!isStaff(user)) throw new ServiceError("Недостатньо прав", 403);
  const stage = one<Stage>("SELECT * FROM stages WHERE id=?", stageId);
  if (!stage || stage.delivered_at) throw new ServiceError("Етап не знайдено або вже завершено");
  const order = one<Order>("SELECT * FROM orders WHERE id=?", stage.order_id)!;
  if (stage.position > 0) {
    const previous = one<Stage>("SELECT * FROM stages WHERE order_id=? AND position=?", order.id, stage.position - 1);
    if (!previous?.delivered_at) throw new ServiceError("Спочатку надай попередній етап");
  }
  const request = getRequest(order.request_id, user);
  const total = one<{ n: number }>("SELECT COUNT(*) AS n FROM stages WHERE order_id=?", order.id)?.n || 0;
  const isFinal = stage.position === total - 1;
  const fileCount = one<{ n: number }>("SELECT COUNT(*) AS n FROM files WHERE request_id=? AND deleted_at IS NULL AND kind=? AND (? IS NULL OR stage_id=?)", request.id, isFinal ? "final" : "stage", isFinal ? null : stage.id, stage.id)?.n || 0;
  if (isFinal && fileCount < 1) throw new ServiceError("Спочатку додай фінальний файл");
  if (!isFinal && !note.trim() && fileCount < 1) throw new ServiceError("Додай результат або короткий опис етапу");
  db().transaction(() => {
    run("UPDATE stages SET delivery_note=?,delivered_at=CURRENT_TIMESTAMP WHERE id=?", note.trim() || null, stage.id);
    if (isFinal) {
      run("UPDATE orders SET status='ready',final_ready_at=CURRENT_TIMESTAMP WHERE id=?", order.id);
      run("UPDATE requests SET status='ready',updated_at=CURRENT_TIMESTAMP WHERE id=?", request.id);
      const offer = one<Offer>("SELECT * FROM offers WHERE id=?", order.offer_id)!;
      const confirmed = one<{ n: number }>("SELECT COALESCE(SUM(amount_cents),0) AS n FROM payments WHERE request_id=? AND state='confirmed'", request.id)?.n || 0;
      if (confirmed >= offer.total_cents) run("UPDATE orders SET final_released_at=CURRENT_TIMESTAMP WHERE id=?", order.id);
      notify(request.client_id, request.id, "final_ready", "Результат готовий. Переглянь опис і перелік файлів.");
    } else notify(request.client_id, request.id, `stage_${stage.position}_ready`, `Етап «${stage.title}» готовий.`);
    event(request.id, user.id, "stage_delivered", `Етап «${stage.title}» надано`);
  })();
}

export function createRevision(user: User, orderId: string, description: string) {
  const order = one<Order>("SELECT * FROM orders WHERE id=?", orderId);
  if (!order) throw new ServiceError("Замовлення не знайдено", 404);
  const request = getRequest(order.request_id, user);
  if (request.client_id !== user.id || !order.final_released_at || request.status === "cancelled") throw new ServiceError("Правки зараз недоступні", 403);
  const freeRequested = Date.now() - Date.parse(order.final_released_at) <= 14 * 24 * 60 * 60 * 1000;
  const id = randomUUID();
  db().transaction(() => {
    run("INSERT INTO revisions(id,order_id,client_id,description,free_requested) VALUES(?,?,?,?,?)", id, orderId, user.id, description, freeRequested ? 1 : 0);
    event(request.id, user.id, "revision_requested", "Клієнт подав правки");
    notify(request.client_id, request.id, "revision_received", "Правки прийнято. Менеджер перегляне деталі.");
  })();
  return id;
}

export function requestSnapshot(request: RequestRow, staff = false) {
  const offers = many<Offer>("SELECT * FROM offers WHERE request_id=? ORDER BY version DESC", request.id);
  const fullOrder = one<Order>("SELECT * FROM orders WHERE request_id=?", request.id) || null;
  const order = fullOrder && !staff ? { ...fullOrder, cost_cents: undefined } : fullOrder;
  const stages = order ? many<Stage>("SELECT * FROM stages WHERE order_id=? ORDER BY position", order.id) : [];
  const payments = many<Payment>("SELECT * FROM payments WHERE request_id=? ORDER BY reported_at DESC", request.id);
  const files = many<StoredFile>("SELECT id,request_id,stage_id,revision_id,kind,original_name,mime,size_bytes,created_at,deleted_at FROM files WHERE request_id=? AND deleted_at IS NULL ORDER BY created_at DESC", request.id);
  const revisions = order ? many<Revision>("SELECT * FROM revisions WHERE order_id=? ORDER BY created_at DESC", order.id) : [];
  const events = many<EventRow>("SELECT * FROM events WHERE request_id=? ORDER BY created_at DESC", request.id);
  const caseConsent = one<{ granted: number }>("SELECT granted FROM consents WHERE request_id=? AND purpose='case'", request.id)?.granted === 1;
  const client = one<{ id: string; name: string; username: string | null; bot_started: number }>("SELECT id,name,username,bot_started FROM users WHERE id=?", request.client_id);
  return { ...request, offers, order, stages, payments, files, revisions, events, caseConsent, client };
}

export function stateFor(user: User) {
  const requests = isStaff(user)
    ? many<RequestRow>("SELECT * FROM requests ORDER BY created_at DESC LIMIT 200")
    : many<RequestRow>("SELECT * FROM requests WHERE client_id=? ORDER BY created_at DESC LIMIT 100", user.id);
  const stats = isStaff(user) && user.role === "owner" ? {
    confirmedOrders: one<{ n: number }>("SELECT COUNT(*) AS n FROM orders")?.n || 0,
    confirmedRevenueCents: one<{ n: number }>("SELECT COALESCE(SUM(amount_cents),0) AS n FROM payments WHERE state='confirmed'")?.n || 0,
    costCents: one<{ n: number }>("SELECT COALESCE(SUM(cost_cents),0) AS n FROM orders")?.n || 0,
    requests: one<{ n: number }>("SELECT COUNT(*) AS n FROM requests")?.n || 0,
  } : null;
  return { user, requests: requests.map(request => requestSnapshot(request, isStaff(user))), stats, setup: {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CLIENT_ID && process.env.TELEGRAM_CLIENT_SECRET),
    notifications: process.env.NOTIFICATIONS_ENABLED === "1",
    managerUsername: process.env.MANAGER_USERNAME || null,
    botUsername: process.env.TELEGRAM_BOT_USERNAME || null,
    paymentInstructions: process.env.PAYMENT_INSTRUCTIONS || (process.env.NODE_ENV !== "production" ? "Тестовий режим: справжні кошти не переказуйте." : null),
  } };
}
