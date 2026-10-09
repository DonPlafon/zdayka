"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AppState, Snapshot } from "@/lib/client-types";
import { action, downloadFile, loadState, uploadFile } from "@/lib/client-api";
import { dateLabel, money, statusLabels } from "@/lib/catalog";

type StageDraft = { title: string; resultDescription: string; amount: string; dueAt: string };
const blankStage = (): StageDraft => ({ title: "", resultDescription: "", amount: "", dueAt: "" });
const templates = ["Потрібна методичка або приклад оформлення.", "Уточни, будь ласка, точний термін.", "Етап готовий. Переглянь результат у кабінеті."];
const cents = (value: string) => Math.round(Number(value.replace(",", ".")) * 100);
const needsManager = (item: Snapshot) => item.status === "received" || item.payments.some(payment => payment.state === "reported") ||
  item.revisions.some(revision => revision.status === "new") ||
  (item.files.length > 0 && item.events.some(entry => entry.type === "file_deletion_requested"));

function OfferEditor({ item, runAction, busy }: { item: Snapshot; runAction: (body: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const latest = item.offers[0];
  const [scope, setScope] = useState("");
  const [total, setTotal] = useState("");
  const [deposit, setDeposit] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [revisionsText, setRevisionsText] = useState("14 днів на зауваження щодо погоджених вимог");
  const [stages, setStages] = useState<StageDraft[]>([blankStage()]);
  const [error, setError] = useState("");
  useEffect(() => {
    setScope(latest?.scope || ""); setTotal(latest ? String(latest.total_cents / 100) : "");
    setDeposit(latest ? String(latest.deposit_cents / 100) : ""); setDueAt(latest?.due_at || item.deadline || "");
    setRevisionsText(latest?.revisions_text || "14 днів на зауваження щодо погоджених вимог");
    setStages(latest ? (JSON.parse(latest.stages_json) as { title: string; resultDescription: string; amountCents: number; dueAt: string }[]).map(s => ({ title: s.title, resultDescription: s.resultDescription, amount: String(s.amountCents / 100), dueAt: s.dueAt })) : [blankStage()]);
    setError("");
  }, [item.id, latest?.id]);

  function updateStage(index: number, patch: Partial<StageDraft>) { setStages(previous => previous.map((stage, i) => i === index ? { ...stage, ...patch } : stage)); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const totalCents = cents(total), depositCents = cents(deposit);
    const stageInputs = stages.map(s => ({ title: s.title.trim(), resultDescription: s.resultDescription.trim(), amountCents: cents(s.amount), dueAt: s.dueAt }));
    if (!Number.isSafeInteger(totalCents) || stageInputs.some(s => !Number.isSafeInteger(s.amountCents)) || stageInputs.reduce((sum, s) => sum + s.amountCents, 0) !== totalCents) {
      setError("Сума вартості етапів має дорівнювати загальній ціні."); return;
    }
    await runAction({ action: "send_offer", requestId: item.id, scope, totalCents, depositCents, dueAt, revisionsText, stages: stageInputs });
  }
  return <section className="admin-panel"><div className="panel-heading"><h2>Пропозиція {latest ? `· версія ${latest.version}` : ""}</h2><small>Нова версія не змінює вже погоджену</small></div>
    <form className="admin-form" onSubmit={submit}><label>Що входить у результат<textarea value={scope} onChange={e => setScope(e.target.value)} rows={4} required minLength={10} /></label>
      <div className="three-fields"><label>Ціна, грн<input type="number" min="1" step="0.01" value={total} onChange={e => setTotal(e.target.value)} required /></label><label>Передоплата, грн<input type="number" min="1" step="0.01" value={deposit} onChange={e => setDeposit(e.target.value)} required /></label><label>Фінальний термін<input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} required /></label></div>
      <label>Умови правок<input value={revisionsText} onChange={e => setRevisionsText(e.target.value)} required minLength={5} /></label>
      <h3>Етапи та їхня вартість</h3>{stages.map((stage, index) => <div className="stage-editor" key={index}><div className="stage-editor-title"><strong>Етап {index + 1}</strong>{stages.length > 1 && <button type="button" onClick={() => setStages(prev => prev.filter((_, i) => i !== index))}>Прибрати</button>}</div>
        <input placeholder="Назва етапу" value={stage.title} onChange={e => updateStage(index, { title: e.target.value })} required />
        <input placeholder="Що отримає клієнт" value={stage.resultDescription} onChange={e => updateStage(index, { resultDescription: e.target.value })} required />
        <div className="two-fields"><label>Вартість, грн<input type="number" min="1" step="0.01" value={stage.amount} onChange={e => updateStage(index, { amount: e.target.value })} required /></label><label>Термін<input type="date" value={stage.dueAt} onChange={e => updateStage(index, { dueAt: e.target.value })} required /></label></div></div>)}
      <button type="button" className="text-button" onClick={() => setStages(prev => [...prev, blankStage()])}>+ Додати етап</button>
      {error && <p className="inline-error">{error}</p>}<button className="primary-button" type="submit" disabled={busy}>Надіслати пропозицію →</button>
    </form>
  </section>;
}

function AdminDetail({ item, onAction, busy, error, setError, refresh }: { item: Snapshot; onAction: (body: Record<string, unknown>) => Promise<void>; busy: boolean; error: string; setError: (x: string) => void; refresh: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [cost, setCost] = useState("");
  const [stageNotes, setStageNotes] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const order = item.order;
  useEffect(() => { setCost(order?.cost_cents == null ? "" : String(order.cost_cents / 100)); }, [order?.id, order?.cost_cents]);
  const latest = item.offers[0];
  const actionNeeded = item.payments.filter(x => x.state === "reported").length + item.revisions.filter(x => x.status === "new").length;

  async function upload(files: FileList | null, kind: string, stageId?: string) {
    if (!files?.length) return;
    setUploading(true); setError("");
    try { for (const file of Array.from(files)) await uploadFile(file, item.id, kind, stageId ? { stageId } : undefined); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не вдалося додати файл"); }
    finally { setUploading(false); }
  }

  return <div className="admin-detail"><div className="admin-detail-head"><div><p className="overline">Заявка № {item.id.slice(0, 8)}</p><h2>{item.work_type || "Завдання"}{item.subject ? ` · ${item.subject}` : ""}</h2></div><span className="status-pill">{statusLabels[item.status] || item.status}</span></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="admin-detail-grid"><div>
      <section className="admin-panel"><div className="panel-heading"><h2>Завдання</h2><small>{dateLabel(item.created_at)}</small></div><p className="scope-text">{item.description}</p><div className="meta-row"><span>Термін: {item.urgent ? "терміново" : dateLabel(item.deadline)}</span>{item.topic && <span>Тема: {item.topic}</span>}{item.volume && <span>Обсяг: {item.volume}</span>}</div></section>
      <OfferEditor key={item.id} item={item} runAction={onAction} busy={busy} />
      {order && <section className="admin-panel"><h2>Етапи</h2>{item.stages.map((stage, index) => <div className="admin-stage" key={stage.id}><div className="panel-heading"><div><strong>{index + 1}. {stage.title}</strong><p>{stage.result_description}</p></div><span>{stage.delivered_at ? "Надано" : dateLabel(stage.due_at)}</span></div>
        {!stage.delivered_at && <><textarea rows={2} placeholder="Коротко опиши наданий результат" value={stageNotes[stage.id] || ""} onChange={e => setStageNotes(prev => ({ ...prev, [stage.id]: e.target.value }))} />
          <label className="upload-label">+ Файл етапу<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg" disabled={uploading} onChange={e => upload(e.target.files, index === item.stages.length - 1 ? "final" : "stage", stage.id)} /></label>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => onAction({ action: "deliver_stage", stageId: stage.id, note: stageNotes[stage.id] || "" })}>Позначити результат наданим</button></>}
      </div>)}</section>}
      <section className="admin-panel"><h2>Файли</h2>{item.files.length ? item.files.map(file => <div className="file-row" key={file.id}><div><strong>{file.original_name}</strong><small>{file.kind} · {(file.size_bytes / 1024 / 1024).toFixed(1)} МБ</small></div><div className="action-pair"><button onClick={() => downloadFile(file.id).catch(e => setError(e.message))}>Завантажити</button><button onClick={() => { if (window.confirm(`Видалити файл «${file.original_name}»?`)) onAction({ action: "delete_file", fileId: file.id }); }} disabled={busy}>Видалити</button></div></div>) : <p className="small-muted">Файлів немає</p>}</section>
      <section className="admin-panel"><h2>Історія</h2><div className="event-list">{item.events.map(row => <div key={row.id}><span>{new Date(row.created_at).toLocaleString("uk-UA")}</span><p>{row.message}</p></div>)}</div></section>
    </div><aside>
      <section className="admin-panel"><h2>Клієнт</h2><p><strong>{item.client?.name}</strong></p><p className="small-muted">Telegram ID: {item.client?.id}</p>{item.client?.username && <a href={`https://t.me/${item.client.username}`} target="_blank" rel="noreferrer">@{item.client.username} ↗</a>}<p className="small-muted">Бот: {item.client?.bot_started ? "відкрито" : "ще не відкрито"}</p><p className="small-muted">Згода на кейс: {item.caseConsent ? "є" : "немає"}</p></section>
      <section className="admin-panel"><h2>Потрібна дія {actionNeeded ? `· ${actionNeeded}` : ""}</h2>{!latest && <p className="inline-warning">Потрібно оцінити заявку</p>}{item.status === "needs_info" && <p>Очікуємо деталі від клієнта</p>}
        <div className="quick-actions"><button onClick={() => onAction({ action: "set_status", requestId: item.id, status: "needs_info" })}>Потрібні уточнення</button><button onClick={() => onAction({ action: "set_status", requestId: item.id, status: "received" })}>Заявку отримано</button></div></section>
      <section className="admin-panel"><h2>Оплати</h2>{latest && <p>Поточна ціна: <strong>{money(latest.total_cents)}</strong></p>}{!item.payments.length && <p className="small-muted">Платежів немає</p>}{item.payments.map(payment => <div className="payment-admin" key={payment.id}><div><strong>{money(payment.amount_cents)}</strong><small>{payment.kind === "deposit" ? "Передоплата" : "Доплата"} · {payment.state === "reported" ? "клієнт повідомив" : payment.state === "confirmed" ? "підтверджено" : "не підтверджено"}</small></div>{payment.state === "reported" && <div className="action-pair"><button onClick={() => onAction({ action: "confirm_payment", paymentId: payment.id, approve: true })} disabled={busy}>Підтвердити</button><button onClick={() => onAction({ action: "confirm_payment", paymentId: payment.id, approve: false })} disabled={busy}>Відхилити</button></div>}</div>)}</section>
      {order && <section className="admin-panel"><h2>Витрати на замовлення</h2><p className="small-muted">Внеси фактичні витрати вручну. Це не повна бухгалтерія.</p><div className="cost-row"><input aria-label="Витрати у гривнях" type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} /><button className="secondary-button" disabled={busy || !Number.isSafeInteger(cents(cost)) || cents(cost) < 0} onClick={() => onAction({ action: "set_cost", orderId: order.id, costCents: cents(cost) })}>Зберегти</button></div></section>}
      <section className="admin-panel"><h2>Правки</h2>{!item.revisions.length && <p className="small-muted">Нових звернень немає</p>}{item.revisions.map(revision => <div className="revision-row" key={revision.id}><strong>{revision.status === "new" ? "Потрібна оцінка" : revision.status}</strong><p>{revision.description}</p><small>{revision.free_requested ? "Подано в межах 14 днів" : "Після 14 днів"}</small>{revision.status !== "done" && <div className="quick-actions"><button onClick={() => onAction({ action: "decide_revision", revisionId: revision.id, status: "free", note: "" })}>Без доплати</button><button onClick={() => onAction({ action: "decide_revision", revisionId: revision.id, status: "paid", note: "" })}>Нова оцінка</button><button onClick={() => onAction({ action: "decide_revision", revisionId: revision.id, status: "done", note: "" })}>Виконано</button></div>}</div>)}</section>
      <section className="admin-panel"><h2>Повідомити клієнта</h2><div className="template-list">{templates.map(value => <button key={value} type="button" onClick={() => setNote(value)}>{value}</button>)}</div><textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Коротке повідомлення" /><button className="secondary-button" onClick={async () => { await onAction({ action: "send_note", requestId: item.id, message: note }); setNote(""); }} disabled={busy || !note.trim()}>Зберегти й сповістити</button></section>
      <section className="admin-panel"><h2>Закриття</h2>{order?.final_released_at && item.status !== "closed" && <button className="secondary-button" onClick={() => onAction({ action: "close_order", requestId: item.id })}>Закрити замовлення</button>}{!["closed", "cancelled"].includes(item.status) && <button className="danger-button" onClick={() => { if (window.confirm("Скасувати заявку й записати розрахунок повернення?")) onAction({ action: "cancel_request", requestId: item.id }); }}>Скасувати</button>}</section>
    </aside></div>
  </div>;
}

export function AdminClient() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const refresh = useCallback(async () => { const next = await loadState(); setState(next); setSelectedId(current => current || next.requests[0]?.id || ""); }, []);
  useEffect(() => { refresh().catch(cause => setError(cause.message)); }, [refresh]);
  async function doAction(body: Record<string, unknown>) { setBusy(true); setError(""); setMessage(""); try { await action(body); await refresh(); setMessage("Збережено"); } catch (cause) { setError(cause instanceof Error ? cause.message : "Помилка"); } finally { setBusy(false); } }
  const items = useMemo(() => {
    if (!state) return [];
    let result = state.requests;
    if (filter === "new") result = result.filter(x => x.status === "received");
    if (filter === "action") result = result.filter(needsManager);
    if (statusFilter !== "all") result = result.filter(x => x.status === statusFilter);
    if (filter === "deadline") result = result.filter(x => x.status !== "closed" && x.status !== "cancelled").sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
    else result = [...result].sort((a, b) => Number(needsManager(b)) - Number(needsManager(a)) || b.created_at.localeCompare(a.created_at));
    if (search) result = result.filter(x => `${x.client?.name} ${x.description} ${x.work_type} ${x.subject} ${x.id}`.toLowerCase().includes(search.toLowerCase()));
    return result;
  }, [state, filter, statusFilter, search]);
  const selected = state?.requests.find(x => x.id === selectedId);
  return <main className="admin-page shell"><div className="admin-header"><div><p className="overline">Робоче місце</p><h1>Заявки та замовлення</h1><p className="small-muted">Спочатку заявки, де зараз потрібна твоя дія.</p></div><Link className="secondary-button admin-demo-link" href="/admin/demo">Переглянути шлях клієнта ↗</Link></div>
    {state?.stats && <div className="stats-grid"><div><span>Заявки</span><strong>{state.stats.requests}</strong></div><div><span>Оплачені замовлення</span><strong>{state.stats.confirmedOrders}</strong></div><div><span>Підтверджені платежі</span><strong>{money(state.stats.confirmedRevenueCents)}</strong></div><div><span>Витрати</span><strong>{money(state.stats.costCents)}</strong></div><div><span>Різниця до інших витрат</span><strong>{money(state.stats.confirmedRevenueCents - state.stats.costCents)}</strong></div></div>}
    {!state && !error && <p>Завантажуємо…</p>}{error && <p className="inline-error" role="alert">{error}</p>}{message && <p className="inline-success" role="status">{message}</p>}
    {state && <div className="admin-workspace"><section className="admin-queue"><div className="queue-controls"><input type="search" placeholder="Пошук за клієнтом, темою або №" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Статус заявки" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">Усі статуси</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><div className="filter-row">{[["all", "Усі"], ["new", "Нові"], ["action", "Потрібна дія"], ["deadline", "За терміном"]].map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
      <div className="queue-list">{items.map(item => <button type="button" key={item.id} className={item.id === selectedId ? "queue-row selected" : "queue-row"} onClick={() => setSelectedId(item.id)}><div><strong>{item.work_type || "Завдання"}{item.subject ? ` · ${item.subject}` : ""}</strong><small>{item.client?.name} · № {item.id.slice(0, 8)}</small></div><div><span>{statusLabels[item.status] || item.status}</span><small>{item.urgent ? "Терміново" : dateLabel(item.deadline)}</small></div>{needsManager(item) && <i aria-label="Потрібна дія" />}</button>)}{!items.length && <p className="empty-queue">Нічого не знайдено</p>}</div></section>
      {selected ? <AdminDetail key={selected.id} item={selected} onAction={doAction} busy={busy} error={error} setError={setError} refresh={refresh} /> : <div className="admin-panel">Оберіть заявку</div>}</div>}
  </main>;
}
