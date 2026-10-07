"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { subjects, workTypes } from "@/lib/catalog";

export function HomeForm() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [workType, setWorkType] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [miniAppUrl, setMiniAppUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (description.trim().length < 15) { setError("Опиши завдання хоча б кількома словами."); return; }
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams(window.location.search);
      const source = params.get("utm_source")?.slice(0, 150) || undefined;
      const response = await fetch("/api/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description, workType, subject, source }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не вдалося зберегти опис");
      setMiniAppUrl(result.miniAppUrl || null);
      setSaved(true);
      setBusy(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Помилка"); setBusy(false); }
  }

  return <>
    <section className="hero shell" aria-labelledby="hero-title"><div className="hero-copy">
      <div className="eyebrow"><span className="eyebrow-dot" /> Навчальні роботи</div>
      <h1 id="hero-title">Курсові, дипломні, лабораторні та інші завдання</h1>
      <p className="hero-lead">Напиши, що потрібно. Ціну, термін і склад роботи погодимо після перегляду завдання.</p>
      <div className="hero-points"><span>Ціна до початку</span><span>Етапи в кабінеті</span><span>Умови правок письмово</span></div>
      <div className="mascot-wrap"><Image src="/metodiy.png" width={1312} height={1199} alt="Кріт Методій розглядає аркуш із завданням" priority /></div>
    </div><form className="quick-form" onSubmit={submit}>
      <div className="form-heading"><div><p className="form-kicker">Заявка</p><h2>Опиши завдання</h2></div><span className="form-step">01 / 02</span></div>
      <label className="field-label" htmlFor="description">Що потрібно зробити?</label>
      <textarea id="description" value={description} onChange={event => { setDescription(event.target.value); setError(""); }} rows={6} maxLength={3000} placeholder="Наприклад: курсова з психології, є методичка, потрібно до 20 жовтня" />
      <div className="field-meta"><span className="field-error" role="alert">{error}</span><span>{description.length} / 3000</span></div>
      <div className="form-grid"><div className="field"><label className="field-label" htmlFor="work-type">Вид роботи <span>необов’язково</span></label><select id="work-type" value={workType} onChange={event => setWorkType(event.target.value)}><option value="">Не знаю</option>{workTypes.map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="field"><label className="field-label" htmlFor="subject">Напрям <span>необов’язково</span></label><select id="subject" value={subject} onChange={event => setSubject(event.target.value)}><option value="">Не знаю</option>{subjects.map(value => <option key={value}>{value}</option>)}</select></div></div>
      <p className="form-hint">Методичку й файли можна додати пізніше.</p>
      {saved ? <div className="draft-next"><p>Опис збережено на 24 години. Обери, де продовжити:</p>
        <button className="primary-button" type="button" onClick={() => router.push("/cabinet/new")}>У цьому браузері →</button>
        {miniAppUrl && <a className="secondary-button link-button" href={miniAppUrl}>У Telegram →</a>}
        <button className="text-button" type="button" onClick={() => setSaved(false)}>Змінити опис</button>
      </div> : <button className="primary-button" type="submit" disabled={busy}>{busy ? "Зберігаємо…" : "Продовжити"}<span aria-hidden="true">→</span></button>}
    </form></section>
    <div className="browse shell" aria-label="Послуги й напрями">
      <div className="browse-block" id="work-types"><div className="section-heading"><span className="section-index">01</span><h2>Яка робота?</h2></div><div className="choice-list">{workTypes.map(value => <button type="button" key={value} aria-pressed={workType === value} onClick={() => { setWorkType(value); document.querySelector(".quick-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>{value}</button>)}</div></div>
      <div className="browse-block" id="subjects"><div className="section-heading"><span className="section-index">02</span><h2>Який напрям?</h2></div><div className="choice-list">{subjects.map(value => <button type="button" key={value} aria-pressed={subject === value} onClick={() => { setSubject(value); document.querySelector(".quick-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>{value}</button>)}</div></div>
    </div>
  </>;
}
