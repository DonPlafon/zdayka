"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client-api";
import { subjects, workTypes } from "@/lib/catalog";

export function NewRequestForm() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [workType, setWorkType] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [volume, setVolume] = useState("");
  const [deadline, setDeadline] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/draft", { cache: "no-store" }).then(r => r.json()).then(result => {
      const draft = result.draft;
      if (draft) { setDescription(draft.description || ""); setWorkType(draft.work_type || ""); setSubject(draft.subject || ""); setSource(draft.source || ""); }
    }).catch(() => {});
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await action({ action: "create_request", description, workType: workType || undefined, subject: subject || undefined,
        topic: topic || undefined, volume: volume || undefined, deadline: urgent ? undefined : deadline || undefined, urgent, source: source || undefined });
      router.push(`/cabinet/${result.requestId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Помилка"); setBusy(false); }
  }

  return <form className="new-request-form" onSubmit={submit}><p className="overline">Нова заявка</p><h1>Розкажи про завдання</h1>
    <label htmlFor="new-description">Що потрібно зробити? <strong>*</strong></label><textarea id="new-description" value={description} onChange={e => setDescription(e.target.value)} rows={7} maxLength={3000} placeholder="Опиши завдання своїми словами" required />
    <div className="two-fields"><div><label htmlFor="new-type">Вид роботи</label><select id="new-type" value={workType} onChange={e => setWorkType(e.target.value)}><option value="">Не знаю</option>{workTypes.map(x => <option key={x}>{x}</option>)}</select></div>
    <div><label htmlFor="new-subject">Напрям</label><select id="new-subject" value={subject} onChange={e => setSubject(e.target.value)}><option value="">Не знаю</option>{subjects.map(x => <option key={x}>{x}</option>)}</select></div></div>
    <div className="two-fields"><div><label htmlFor="new-topic">Тема, якщо є</label><input id="new-topic" value={topic} onChange={e => setTopic(e.target.value)} maxLength={200} /></div>
    <div><label htmlFor="new-volume">Обсяг, якщо відомий</label><input id="new-volume" value={volume} onChange={e => setVolume(e.target.value)} maxLength={120} placeholder="Наприклад: 25 сторінок" /></div></div>
    <label htmlFor="new-deadline">Коли потрібно? <strong>*</strong></label><div className="deadline-row"><input id="new-deadline" type="date" value={deadline} min={new Date().toISOString().slice(0, 10)} disabled={urgent} onChange={e => setDeadline(e.target.value)} /><label className="checkbox-label"><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} /> Терміново</label></div>
    <p className="small-muted">Для термінового завдання менеджер уточнить точний час. Файли можна додати після створення заявки.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <button type="submit" className="primary-button" disabled={busy}>{busy ? "Створюємо…" : "Надіслати на оцінку"} <span aria-hidden="true">→</span></button>
  </form>;
}
