"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AppState, Snapshot } from "@/lib/client-types";
import { action, downloadFile, loadState, uploadFile } from "@/lib/client-api";
import { dateLabel, money, statusLabels } from "@/lib/catalog";

function OfferCard({ item, onAction, busy }: { item: Snapshot; onAction: (body: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const offer = item.offers[0];
  if (!offer) return null;
  const expired = Date.parse(offer.expires_at) < Date.now();
  const stages = JSON.parse(offer.stages_json) as { title: string; resultDescription: string; amountCents: number; dueAt: string }[];
  return <section className="detail-panel"><div className="panel-heading"><h2>Умови · версія {offer.version}</h2><span className="small-muted">{offer.accepted_at ? "Погоджено" : expired ? "Термін минув" : "Діє 48 годин"}</span></div>
    <p className="scope-text">{offer.scope}</p><div className="offer-numbers"><div><small>Вартість</small><strong>{money(offer.total_cents)}</strong></div><div><small>Передоплата</small><strong>{money(offer.deposit_cents)}</strong></div><div><small>Термін</small><strong>{dateLabel(offer.due_at)}</strong></div></div>
    <div className="mini-stages">{stages.map((stage, index) => <div key={index}><span>{index + 1}. {stage.title}<small>{stage.resultDescription}</small></span><strong>{money(stage.amountCents)}</strong></div>)}</div>
    <p className="fine-print">Правки: {offer.revisions_text}</p>
    {!offer.accepted_at && !expired && <button className="primary-button" disabled={busy} onClick={() => onAction({ action: "accept_offer", requestId: item.id })}>Погоджуюсь з умовами →</button>}
    {!offer.accepted_at && expired && <p className="inline-warning">Пропозиція завершилася. Напиши менеджеру, щоб оновити ціну й термін.</p>}
  </section>;
}

export function OrderDetailClient({ id }: { id: string }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revisionText, setRevisionText] = useState("");
  const refresh = useCallback(async () => { const result = await loadState(); setState(result); }, []);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);
  const item = state?.requests.find(x => x.id === id);

  async function doAction(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setError(""); setMessage("");
    try { await action(body); await refresh(); setMessage("Збережено"); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Помилка"); return false; }
    finally { setBusy(false); }
  }

  async function onUpload(files: FileList | null, kind: string, revisionId?: string) {
    if (!files?.length || !item) return;
    setBusy(true); setError(""); setMessage("");
    try { for (const file of Array.from(files)) await uploadFile(file, item.id, kind, revisionId ? { revisionId } : undefined); await refresh(); setMessage("Файли додано"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не вдалося додати файл"); }
    finally { setBusy(false); }
  }

  if (error && !state) return <main className="shell detail-page"><p className="inline-error">{error}</p></main>;
  if (!state) return <main className="shell detail-page">Завантажуємо замовлення…</main>;
  if (!item) return <main className="shell detail-page"><h1>Заявку не знайдено</h1><Link href="/cabinet">← До списку</Link></main>;
  const offer = item.offers[0];
  const confirmed = item.payments.filter(x => x.state === "confirmed").reduce((sum, x) => sum + x.amount_cents, 0);
  const pending = item.payments.some(x => x.state === "reported");
  const canReport = offer?.accepted_at && !pending && confirmed < offer.total_cents && item.status !== "cancelled";
  const contact = state.setup.managerUsername || state.setup.botUsername;
  const nextStep = item.status === "cancelled" ? "Заявку скасовано. Історія умов та оплат доступна нижче."
    : item.status === "closed" ? "Замовлення закрито. Файли залишаться доступними протягом строку зберігання."
    : !offer ? item.status === "needs_info" ? "Менеджеру потрібні деталі. Перевір повідомлення в історії та додай матеріали, якщо вони є." : "Менеджер переглядає завдання. Коли пропозиція буде готова, вона з’явиться в цій картці."
    : !offer.accepted_at ? "Перевір склад, ціну, термін і етапи. Якщо все підходить, підтвердь умови нижче."
    : pending ? "Твоє повідомлення про оплату отримано. Менеджер перевірить надходження."
    : confirmed < offer.deposit_cents ? "Умови погоджено. Після оплати повідом про неї менеджера."
    : item.order?.final_released_at ? "Фінальні файли доступні в розділі «Файли». Якщо є зауваження — подай правки нижче."
    : item.stages.some(stage => stage.delivered_at) ? "Готовий етап і його файли доступні нижче. Перевір результат у картці."
    : "Замовлення в роботі. Результат кожного етапу з’явиться тут.";
  return <main className="shell detail-page"><Link className="back-link" href="/cabinet">← Мої заявки</Link>
    <div className="detail-title"><div><p className="overline">Заявка № {item.id.slice(0, 8)}</p><h1>{item.work_type || "Завдання"}{item.subject ? ` · ${item.subject}` : ""}</h1></div><span className="status-pill">{statusLabels[item.status] || item.status}</span></div>
    {error && <p className="inline-error" role="alert">{error}</p>}{message && <p className="inline-success" role="status">{message}</p>}
    <div className="detail-layout"><div className="detail-main">
      <section className="detail-panel client-next-step"><p className="overline">Що зараз?</p><h2>{statusLabels[item.status] || item.status}</h2><p>{nextStep}</p></section>
      <section className="detail-panel"><h2>Завдання</h2><p className="scope-text">{item.description}</p><div className="meta-row"><span>Термін: {item.urgent ? "терміново — менеджер уточнить час" : dateLabel(item.deadline)}</span>{item.topic && <span>Тема: {item.topic}</span>}{item.volume && <span>Обсяг: {item.volume}</span>}</div></section>
      <OfferCard item={item} onAction={doAction} busy={busy} />
      {item.order && <section className="detail-panel"><h2>Етапи</h2><div className="stage-list">{item.stages.map(stage => <div key={stage.id} className={stage.delivered_at ? "stage done" : "stage"}><span className="stage-dot" /><div><strong>{stage.title}</strong><p>{stage.result_description}</p>{stage.delivered_at && <p className="stage-note">{stage.delivery_note || "Результат доступний у файлах"}</p>}</div><span>{stage.delivered_at ? "Готово" : dateLabel(stage.due_at)}</span></div>)}</div></section>}
      <section className="detail-panel"><div className="panel-heading"><h2>Файли</h2><small>До 10 файлів · до 25 МБ</small></div>
        {item.files.length ? <div className="file-list">{item.files.map(file => {
          const locked = file.kind === "final" && !item.order?.final_released_at;
          return <div className="file-row" key={file.id}><div><strong>{file.original_name}</strong><small>{file.kind === "final" ? "Фінальний файл" : file.kind === "stage" ? "Результат етапу" : file.kind === "revision" ? "До правок" : "Матеріал заявки"} · {(file.size_bytes / 1024 / 1024).toFixed(1)} МБ</small></div>
            {locked ? <span className="small-muted">Після доплати</span> : <button type="button" onClick={() => downloadFile(file.id).catch(e => setError(e.message))}>Завантажити</button>}</div>;
        })}</div> : <p className="small-muted">Файлів поки немає.</p>}
        {!["closed", "cancelled"].includes(item.status) && <label className="upload-label">+ Додати матеріали<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg" disabled={busy} onChange={e => onUpload(e.target.files, "client")} /></label>}
      </section>
      {item.order?.final_released_at && <section className="detail-panel"><h2>Подати правки</h2><p className="small-muted">Зауваження до погоджених умов приймаємо протягом 14 днів після видачі файлів. Нові вимоги оцінюємо окремо.</p>
        <textarea value={revisionText} onChange={e => setRevisionText(e.target.value)} rows={4} placeholder="Опиши зауваження викладача" />
        <button type="button" className="secondary-button" disabled={busy || revisionText.trim().length < 10} onClick={async () => { if (await doAction({ action: "request_revision", orderId: item.order!.id, description: revisionText })) setRevisionText(""); }}>Подати правки</button>
        {item.revisions.map(revision => <div className="revision-row" key={revision.id}><strong>{revision.status === "new" ? "Очікує перевірки" : revision.status === "free" ? "Без доплати" : revision.status === "paid" ? "Потрібна оцінка" : "Виконано"}</strong><p>{revision.description}</p>{revision.decision_note && <small>{revision.decision_note}</small>}
          <label className="upload-label">Додати файл до правок<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg" disabled={busy} onChange={e => onUpload(e.target.files, "revision", revision.id)} /></label></div>)}</section>}
      <section className="detail-panel"><h2>Приватність</h2><p className="small-muted">Публікація кейсу можлива лише за твоєю окремою згодою.</p>
        <label className="consent-row"><input type="checkbox" checked={item.caseConsent} disabled={busy} onChange={e => doAction({ action: "consent_case", requestId: item.id, granted: e.target.checked })} /> Дозволяю використати знеособлений фрагмент результату для кейсу</label>
        {item.status === "closed" && <><p className="small-muted">Файли закритого замовлення зберігаються 3 місяці. Можна попросити видалити їх раніше.</p><button type="button" className="text-button" disabled={busy} onClick={() => doAction({ action: "request_file_deletion", requestId: item.id })}>Попросити дострокове видалення файлів</button></>}
      </section>
      <section className="detail-panel"><h2>Історія</h2><div className="event-list">{item.events.map(row => <div key={row.id}><span>{new Date(row.created_at).toLocaleString("uk-UA")}</span><p>{row.message}</p></div>)}</div></section>
    </div><aside className="detail-side">
      <section className="detail-panel payment-panel"><h2>Оплата</h2>{offer ? <><div className="payment-total"><span>Вартість</span><strong>{money(offer.total_cents)}</strong></div><div className="payment-total"><span>Підтверджено</span><strong>{money(confirmed)}</strong></div><div className="payment-total"><span>Залишок</span><strong>{money(Math.max(0, offer.total_cents - confirmed))}</strong></div>
        {state.setup.paymentInstructions ? <p className="payment-instructions">{state.setup.paymentInstructions}</p> : <p className="inline-warning">Спосіб оплати ще не налаштовано. Напиши менеджеру.</p>}
        {pending && <p className="inline-warning">Повідомлення про оплату на перевірці менеджера.</p>}
        {canReport && state.setup.paymentInstructions && <button type="button" className="primary-button" disabled={busy} onClick={() => doAction({ action: "report_payment", requestId: item.id })}>Оплатив →</button>}
        <div className="payment-history">{item.payments.map(x => <div key={x.id}>{money(x.amount_cents)} · {x.state === "confirmed" ? "підтверджено" : x.state === "reported" ? "перевіряємо" : "не підтверджено"}</div>)}</div>
      </> : <p className="small-muted">Ціну надішлемо після оцінки.</p>}</section>
      <section className="detail-panel"><h2>Менеджер</h2><p className="small-muted">Питання щодо заявки обговорюємо в Telegram. Умови й файли зберігаються тут.</p>{contact ? <a className="secondary-button link-button" href={`https://t.me/${contact}`} target="_blank" rel="noreferrer">Написати в Telegram ↗</a> : <p className="inline-warning">Контакт менеджера ще не налаштовано.</p>}</section>
    </aside></div>
  </main>;
}
