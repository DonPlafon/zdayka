import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const base = process.env.SMOKE_ORIGIN || "http://localhost:3000";
const botToken = process.env.SMOKE_BOT_TOKEN || "123456:LOCALTEST";

function client() {
  const cookies = new Map();
  return async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set("Origin", base);
    if (cookies.size) headers.set("Cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    const response = await fetch(new URL(path, base), { redirect: "manual", ...options, headers });
    for (const line of response.headers.getSetCookie()) {
      const first = line.split(";", 1)[0];
      const separator = first.indexOf("=");
      if (separator < 0) continue;
      const key = first.slice(0, separator), value = first.slice(separator + 1);
      if (value) cookies.set(key, value); else cookies.delete(key);
    }
    return response;
  };
}

async function json(call, path, body, expected = 200) {
  const response = await call(path, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`);
  return result;
}

function miniData(id, startParam) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Другий", last_name: "Клієнт" }) });
  if (startParam) params.set("start_param", startParam);
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

const first = client(), owner = client(), second = client();
assert.equal((await first("/api/auth/dev?role=client")).status, 307);
assert.equal((await owner("/api/auth/dev?role=owner")).status, 307);
await json(second, "/api/auth/miniapp", { initData: miniData(987654321) });

const anonymous = client(), inMiniApp = client();
const transfer = await json(anonymous, "/api/draft", { description: "Передайте цей опис із сайту в Mini App без тексту в посиланні." });
assert.ok(transfer.miniAppUrl);
const startParam = new URL(transfer.miniAppUrl).searchParams.get("startapp");
assert.match(startParam, /^draft_[0-9a-f-]{36}$/);
await json(inMiniApp, "/api/auth/miniapp", { initData: miniData(987654322, startParam) });
assert.match((await json(inMiniApp, "/api/draft")).draft.description, /Передайте цей опис/);

const description = "Потрібен розрахунок для курсової з економіки, вимоги надішлю файлом.";
await json(first, "/api/draft", { description, workType: "Курсова", subject: "Економіка", source: "smoke" });
assert.equal((await json(first, "/api/draft")).draft.description, description);
const created = await json(first, "/api/action", { action: "create_request", description, workType: "Курсова", subject: "Економіка", deadline: "2027-01-20", source: "smoke" });
const requestId = created.requestId;
assert.ok(requestId);
assert.equal((await json(first, "/api/state")).requests[0].description, description);

const upload = async (call, kind, stageId) => {
  const form = new FormData();
  form.set("requestId", requestId);
  form.set("kind", kind);
  if (stageId) form.set("stageId", stageId);
  form.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], `${kind}.pdf`, { type: "application/pdf" }));
  const response = await call("/api/files", { method: "POST", body: form });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result.fileId;
};
await upload(first, "client");
await json(owner, "/api/action", { action: "send_offer", requestId, scope: "Розрахунок і коротке пояснення методики.", totalCents: 10000, depositCents: 5000, dueAt: "2027-01-20", revisionsText: "14 днів на зауваження до погоджених вимог", stages: [
  { title: "Розрахунок", resultDescription: "Таблиця з результатом", amountCents: 5000, dueAt: "2027-01-15" },
  { title: "Пояснення", resultDescription: "Фінальний PDF з поясненням", amountCents: 5000, dueAt: "2027-01-20" }
] });
await json(first, "/api/action", { action: "accept_offer", requestId });
await json(first, "/api/action", { action: "report_payment", requestId });
assert.equal((await json(first, "/api/state")).requests[0].order, null);
let ownerRequest = (await json(owner, "/api/state")).requests.find(item => item.id === requestId);
await json(owner, "/api/action", { action: "confirm_payment", paymentId: ownerRequest.payments[0].id, approve: true });
ownerRequest = (await json(owner, "/api/state")).requests.find(item => item.id === requestId);
assert.ok(ownerRequest.order);
await json(owner, "/api/action", { action: "set_cost", orderId: ownerRequest.order.id, costCents: 1200 });
assert.ok((await json(owner, "/api/state")).stats.costCents >= 1200);
assert.equal((await json(first, "/api/state")).requests.find(item => item.id === requestId).order.cost_cents, undefined);
await json(owner, "/api/action", { action: "deliver_stage", stageId: ownerRequest.stages[0].id, note: "Таблиця готова, результат 42." });
const finalFileId = await upload(owner, "final", ownerRequest.stages[1].id);
await json(owner, "/api/action", { action: "deliver_stage", stageId: ownerRequest.stages[1].id, note: "Фінальний результат готовий." });
assert.equal((await second(`/api/files/${finalFileId}/link`)).status, 404);
assert.equal((await first(`/api/files/${finalFileId}/link`)).status, 403);
await json(first, "/api/action", { action: "report_payment", requestId });
ownerRequest = (await json(owner, "/api/state")).requests.find(item => item.id === requestId);
await json(owner, "/api/action", { action: "confirm_payment", paymentId: ownerRequest.payments.find(item => item.state === "reported").id, approve: true });
const link = await json(first, `/api/files/${finalFileId}/link`);
assert.equal((await first(link.url)).status, 200);
await json(first, "/api/action", { action: "request_revision", orderId: ownerRequest.order.id, description: "Поясніть, будь ласка, формулу в другому розділі." });
assert.equal((await json(first, "/api/state")).requests[0].revisions.length, 1);
assert.equal((await json(second, "/api/state")).requests.length, 0);
console.log("PASS: browser-to-Mini-App draft, request, offer, deposit, stages, locked final, balance, revision, isolation");
