"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppState } from "@/lib/client-types";
import { loadState } from "@/lib/client-api";
import { dateLabel, statusLabels } from "@/lib/catalog";

export function CabinetClient() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { loadState().then(setState).catch(e => setError(e.message)); }, []);
  return <main className="shell cabinet-page"><div className="page-title-row"><div><p className="overline">Кабінет</p><h1>Мої заявки</h1></div><Link className="button-link" href="/cabinet/new">+ Нове завдання</Link></div>
    {error && <p className="inline-error">{error}</p>}
    {!state && !error && <p>Завантажуємо заявки…</p>}
    {state && <>
      {!state.user.bot_started && state.setup.botUsername && <div className="soft-banner">Щоб отримувати повідомлення, <a href={`https://t.me/${state.setup.botUsername}`} target="_blank" rel="noreferrer">відкрий бота</a>.</div>}
      {!state.requests.length && <div className="empty-state"><h2>Заявок ще немає</h2><p>Опиши завдання — менеджер перегляне його й уточнить деталі.</p><Link href="/cabinet/new">Створити заявку →</Link></div>}
      <div className="request-grid">{state.requests.map(item => <Link href={`/cabinet/${item.id}`} className="request-card" key={item.id}><div className="request-card-top"><span className="status-pill">{statusLabels[item.status] || item.status}</span><span className="small-muted">№ {item.id.slice(0, 8)}</span></div><h2>{item.work_type || "Завдання"}{item.subject ? ` · ${item.subject}` : ""}</h2><p>{item.description}</p><div className="request-card-bottom"><span>Термін: {item.urgent ? "терміново" : dateLabel(item.deadline)}</span><strong>Відкрити →</strong></div></Link>)}</div>
    </>}
  </main>;
}
