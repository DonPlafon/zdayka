import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { HomeForm } from "@/components/HomeForm";

export default function HomePage() {
  return <><SiteHeader /><main id="top">
    <HomeForm />
    <section className="how shell" id="how-it-works"><div className="how-header"><p className="overline">Порядок роботи</p><h2>Що буде після заявки</h2></div><div className="how-grid">
      <article><span>01</span><h3>Уточнимо деталі</h3><p>Переглянемо опис і попросимо те, чого бракує для оцінки.</p></article>
      <article><span>02</span><h3>Погодимо умови</h3><p>Зафіксуємо склад роботи, ціну, термін та етапи.</p></article>
      <article><span>03</span><h3>Покажемо хід роботи</h3><p>У кабінеті будуть етапи, файли й історія змін.</p></article>
    </div></section>
    <section className="shell proof-empty"><div><p className="overline">Приклади та відгуки</p><h2>Поки без публічних кейсів</h2></div><p>Додамо приклади лише за згодою клієнтів. Вартість кожного завдання менеджер назве після перегляду вимог.</p></section>
    <section className="shell public-end"><h2>Потрібні деталі?</h2><p>Умови замовлення й оплати можна прочитати до заявки.</p><div><Link href="/terms">Умови замовлення</Link><Link href="/payment-terms">Оплата і правки</Link><Link href="/privacy">Конфіденційність</Link></div></section>
  </main><footer className="site-footer"><div className="shell"><span className="brand footer-brand">Здайка</span><span>Заявки оцінює менеджер вручну</span></div></footer></>;
}
