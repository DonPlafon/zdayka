"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { subjects, workTypes } from "@/lib/catalog";

type View = "list" | "form" | "order" | "notifications";
type Phase = "empty" | "received" | "offer" | "accepted" | "reported" | "working" | "stage" | "final" | "released" | "revision";

const flow: Phase[] = ["empty", "received", "offer", "accepted", "reported", "working", "stage", "final", "released", "revision"];
const labels: Record<Phase, string> = {
  empty: "Порожній кабінет", received: "Заявку отримано", offer: "Пропозиція готова", accepted: "Очікуємо передоплату",
  reported: "Перевіряємо оплату", working: "Виконуємо", stage: "Перший етап готовий", final: "Потрібна доплата",
  released: "Результат готовий", revision: "Правки подано"
};

function saveDemoFile() {
  const content = "Здайка — демонстраційний файл. Це не результат реального замовлення.\n";
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "zdayka-demo.txt"; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DemoClient() {
  const [view, setView] = useState<View>("list");
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [phase, setPhase] = useState<Phase>("empty");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [workType, setWorkType] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [volume, setVolume] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [revision, setRevision] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const phaseIndex = flow.indexOf(phase);
  const hasOffer = phaseIndex >= 2;
  const hasOrder = phaseIndex >= 5;

  function move(next: Phase, message: string) { setPhase(next); setNotice(message); setView("order"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function reset() { setPhase("empty"); setView("list"); setDescription(""); setDeadline(""); setWorkType(""); setSubject(""); setTopic(""); setVolume(""); setUrgent(false); setRevision(""); setFiles([]); setNotice(""); }
  const title = `${workType || "Завдання"}${subject ? ` · ${subject}` : ""}`;

  return <main className="demo-page shell">
    <div className="demo-toolbar"><div><span className="demo-tag">Закрите демо · без реальних дій</span><h1>Кабінет очима клієнта</h1><p>Пройди шлях від першої заявки до правок. Дані тут вигадані лише для перевірки інтерфейсу.</p></div>
      <div className="demo-toolbar-actions"><Link className="secondary-button" href="/admin">← В адмінку</Link><button className="secondary-button" type="button" aria-pressed={preview === "mobile"} onClick={() => setPreview(preview === "mobile" ? "desktop" : "mobile")}>{preview === "mobile" ? "Вид ПК" : "Вид телефона"}</button><button className="secondary-button" type="button" onClick={reset}>Почати спочатку</button></div></div>
    <div className="demo-progress" aria-label="Стан демонстрації">{flow.map((step, index) => <button type="button" key={step} className={index <= phaseIndex ? "active" : ""} onClick={() => { setPhase(step); setView(step === "empty" ? "list" : "order"); setNotice("Перейшли до стану «" + labels[step] + "»."); }}><span>{String(index + 1).padStart(2, "0")}</span>{labels[step]}</button>)}</div>
    <div className={preview === "mobile" ? "demo-browser mobile-preview" : "demo-browser"}><div className="demo-browser-top"><span className="demo-browser-dots" aria-hidden="true"><i /><i /><i /></span><span>Попередній перегляд клієнта</span><strong>ДЕМО</strong></div>
      <div className="demo-browser-content"><div className="demo-client-nav"><button type="button" onClick={() => setView("list")}>Здайка<span className="brand-spark" /></button><div><button type="button" onClick={() => setView("list")}>Мої заявки</button><button type="button" onClick={() => setView("form")}>Нова заявка</button><button type="button" onClick={() => setView("notifications")}>Події{phaseIndex > 0 ? ` · ${phaseIndex}` : ""}</button></div></div>
        {notice && <p className="inline-success demo-notice" role="status">{notice}</p>}
        {view === "notifications" && <section className="demo-client-screen demo-events-screen"><p className="overline">Кабінет</p><h2>Події замовлення</h2><p>Ті самі зміни клієнт бачить у картці. Повідомлення в Telegram у цьому демо не надсилаються.</p>{phaseIndex === 0 ? <div className="demo-events-empty">Коли з’явиться заявка, тут буде її історія.</div> : <div className="demo-events-list">{flow.slice(1, phaseIndex + 1).reverse().map((step, index) => <button type="button" key={step} onClick={() => setView("order")}><span className="demo-event-dot" aria-hidden="true" /><span><small>{index === 0 ? "Остання подія" : "Раніше"}</small><strong>{labels[step]}</strong><em>Відкрити картку →</em></span></button>)}</div>}</section>}
        {view === "list" && <section className="demo-client-screen"><div className="demo-section-head"><div><p className="overline">Кабінет</p><h2>Мої заявки</h2><p>Усе, що відбувається із завданням, зібрано тут.</p></div><button className="button-link" type="button" onClick={() => setView("form")}>+ Нова заявка</button></div>
          {phase === "empty" ? <div className="demo-empty"><Image src="/metodiy.png" width={1312} height={1199} alt="Методій чекає на опис завдання" /><h3>Заявок ще немає</h3><p>Опиши завдання своїми словами. Методичку можна додати пізніше.</p><button className="primary-button" type="button" onClick={() => setView("form")}>Створити заявку →</button></div>
            : <button type="button" className="demo-request-card" onClick={() => setView("order")}><span className="status-pill">{labels[phase]}</span><h3>{title}</h3><p>{description || "Завдання — демонстраційний приклад."}</p><span>Відкрити картку <b>→</b></span></button>}</section>}
        {view === "form" && <section className="demo-client-screen demo-form-screen"><p className="overline">Нова заявка</p><h2>Розкажи про завдання</h2><p>Для оцінки достатньо опису та терміну. Деталі уточнимо пізніше.</p>
          <label htmlFor="demo-description">Що потрібно зробити? <strong>*</strong></label><textarea id="demo-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="Наприклад: лабораторна з баз даних, є методичка…" rows={5} maxLength={3000} />
          <div className="two-fields"><label>Вид роботи · необов’язково<select value={workType} onChange={event => setWorkType(event.target.value)}><option value="">Не знаю</option>{workTypes.map(value => <option key={value}>{value}</option>)}</select></label><label>Напрям · необов’язково<select value={subject} onChange={event => setSubject(event.target.value)}><option value="">Не знаю</option>{subjects.map(value => <option key={value}>{value}</option>)}</select></label></div>
          <div className="two-fields"><label>Тема, якщо є<input value={topic} onChange={event => setTopic(event.target.value)} maxLength={200} placeholder="Можна залишити порожнім" /></label><label>Обсяг, якщо відомий<input value={volume} onChange={event => setVolume(event.target.value)} maxLength={120} placeholder="Наприклад, 25 сторінок" /></label></div>
          <label htmlFor="demo-deadline">Коли потрібно? <strong>*</strong></label><input id="demo-deadline" type="date" value={deadline} disabled={urgent} onChange={event => setDeadline(event.target.value)} /><label className="demo-urgent"><input type="checkbox" checked={urgent} onChange={event => setUrgent(event.target.checked)} /> Терміново — час уточнимо</label>
          <label className="upload-label">+ Додати методичку <input type="file" multiple onChange={event => setFiles(previous => [...previous, ...Array.from(event.target.files || []).map(file => file.name)])} /></label>{files.length > 0 && <p className="small-muted">Додано: {files.join(", ")}</p>}
          <button className="primary-button" type="button" disabled={description.trim().length < 15 || (!deadline && !urgent)} onClick={() => move("received", "Демо-заявку створено. Справжніх даних нікуди не надіслано.")}>Надіслати на оцінку →</button></section>}
        {view === "order" && <section className="demo-client-screen"><button className="demo-back" type="button" onClick={() => setView("list")}>← Мої заявки</button><div className="demo-section-head"><div><p className="overline">Заявка · демонстрація</p><h2>{title}</h2><p>{phaseIndex < 2 ? "Менеджер переглядає завдання." : phaseIndex < 5 ? "Переглянь умови й наступний крок." : "Стеж за етапами та файлами тут."}</p></div><span className="status-pill">{labels[phase]}</span></div>
          <div className="demo-order-layout"><div className="demo-order-main"><div className="detail-panel demo-next-action"><p className="overline">Що зараз?</p><h3>{labels[phase]}</h3><p>{phase === "received" ? "Опис уже в заявці. Коли менеджер визначить склад, термін і ціну, вони з’являться тут." : phase === "offer" ? "Умови готові. Переглянь їх перед підтвердженням." : phase === "accepted" ? "Умови погоджено. Після оплати повідом про неї менеджера." : phase === "reported" ? "Повідомлення отримано. Гроші ще не підтверджені." : phase === "final" ? "Опис фінального результату доступний. Фінальний файл відкриється після підтвердження доплати." : phase === "released" ? "Фінальний файл доступний нижче." : phase === "revision" ? "Зауваження додано до картки. Менеджер їх перегляне." : "Дивись готові результати в етапах нижче."}</p>
            {phase === "received" && <button type="button" className="secondary-button" onClick={() => move("offer", "У демо менеджер підготував пропозицію.")}>Показати пропозицію →</button>}
            {phase === "offer" && <button type="button" className="primary-button" onClick={() => move("accepted", "Демо-умови погоджено.")}>Погоджуюсь з умовами →</button>}
            {phase === "accepted" && <button type="button" className="primary-button" onClick={() => move("reported", "Позначку «Оплатив» надіслано на перевірку. Реальної оплати не було.")}>Оплатив · демо →</button>}
            {phase === "reported" && <button type="button" className="secondary-button" onClick={() => move("working", "У демо менеджер підтвердив передоплату.")}>Імітувати підтвердження менеджером →</button>}
            {phase === "working" && <button type="button" className="secondary-button" onClick={() => move("stage", "Перший етап надано у картці.")}>Показати готовий етап →</button>}
            {phase === "stage" && <button type="button" className="secondary-button" onClick={() => move("final", "Фінальний результат описано. Файл поки закритий.")}>Показати фінальний етап →</button>}
            {phase === "final" && <button type="button" className="secondary-button" onClick={() => move("released", "У демо підтверджено доплату. Файл відкрито.")}>Імітувати доплату й відкриття файла →</button>}
          </div>
          <div className="detail-panel"><div className="panel-heading"><h3>Завдання</h3><span className="small-muted">Демо</span></div><p className="scope-text">{description || "Опис завдання — демонстраційний приклад."}</p><div className="meta-row">{workType && <span>{workType}</span>}{subject && <span>{subject}</span>}{topic && <span>Тема: {topic}</span>}{volume && <span>Обсяг: {volume}</span>}<span>Термін: {urgent ? "терміново — час уточнюємо" : deadline || "узгоджується"}</span></div>{files.length > 0 && <p className="small-muted">Файли до заявки: {files.join(", ")}</p>}</div>
          {hasOffer && <div className="detail-panel"><div className="panel-heading"><h3>Умови · версія 1</h3><span className="small-muted">Демонстраційні дані</span></div><p>Склад: структура БД, запити, короткі пояснення. Точний обсяг фіксується до початку роботи.</p><div className="demo-offer-grid"><span><small>Вартість</small><strong>1 200 грн · демо</strong></span><span><small>Передоплата</small><strong>600 грн · демо</strong></span><span><small>Правки</small><strong>14 днів</strong></span></div><p className="fine-print">Справжня ціна визначається менеджером після оцінки завдання.</p></div>}
          {hasOrder && <div className="detail-panel"><h3>Етапи</h3><div className="stage-list"><div className={phaseIndex >= 6 ? "stage done" : "stage"}><span className="stage-dot"/><div><strong>1. Структура й запити</strong><p>Схема таблиць і приклади запитів.</p></div><span>{phaseIndex >= 6 ? "Надано" : "У роботі"}</span></div><div className={phaseIndex >= 7 ? "stage done" : "stage"}><span className="stage-dot"/><div><strong>2. Пояснення</strong><p>Коментарі до рішень і підсумковий матеріал.</p></div><span>{phaseIndex >= 7 ? "Готово" : "Далі"}</span></div></div></div>}
          {phaseIndex >= 6 && <div className="detail-panel"><h3>Файли</h3><div className="file-row"><div><strong>schema-demo.txt</strong><small>Результат першого етапу · демо</small></div><button type="button" onClick={saveDemoFile}>Завантажити</button></div>{phaseIndex >= 7 && <div className="file-row"><div><strong>final-demo.txt</strong><small>Фінальний матеріал · демо</small></div>{phaseIndex >= 8 ? <button type="button" onClick={saveDemoFile}>Завантажити</button> : <span className="small-muted">Після доплати</span>}</div>}</div>}
          {phaseIndex >= 8 && <div className="detail-panel"><h3>Подати правки</h3><p>Напиши, що саме потрібно уточнити в межах погодженого завдання.</p><textarea value={revision} onChange={event => setRevision(event.target.value)} rows={3} placeholder="Зауваження викладача" />{phase !== "revision" ? <button type="button" className="secondary-button" disabled={revision.trim().length < 10} onClick={() => move("revision", "Демо-правки подано. Справжнього звернення не створено.")}>Подати правки · демо</button> : <p className="inline-success">Правки отримано: {revision}</p>}</div>}
          <div className="detail-panel"><h3>Історія</h3><div className="event-list"><div><span>Зараз</span><p>{labels[phase]}</p></div><div><span>Спочатку</span><p>Заявку створено в демонстрації</p></div></div></div></div>
          <aside className="demo-order-side"><div className="detail-panel"><h3>Оплата</h3>{hasOffer ? <><div className="payment-total"><span>Вартість</span><strong>1 200 грн</strong></div><div className="payment-total"><span>Підтверджено</span><strong>{phaseIndex >= 8 ? "1 200" : phaseIndex >= 5 ? "600" : "0"} грн</strong></div><p className="fine-print">Умовні суми лише для демонстрації. Реальних переказів тут немає.</p></> : <p>Ціну надішлемо після оцінки.</p>}</div><div className="detail-panel"><h3>Менеджер</h3><p>Питання можна поставити в Telegram. Умови й файли залишаються в картці.</p><button type="button" className="secondary-button" onClick={() => setNotice("У демо повідомлення менеджеру не надсилається.")}>Написати менеджеру ↗</button></div></aside></div></section>}
      </div></div>
  </main>;
}
