import Link from "next/link";
import { connection } from "next/server";
import { SiteHeader } from "@/components/SiteHeader";

export default async function SetupPage() {
  await connection();
  const telegram = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CLIENT_ID && process.env.TELEGRAM_CLIENT_SECRET);
  const dev = process.env.NODE_ENV !== "production" && process.env.DEV_TEST_LOGIN === "1";
  return <><SiteHeader compact /><main className="shell setup-page"><p className="overline">Підключення</p><h1>Вхід через Telegram</h1>
    <p>Сайт і форма готові до перевірки. Для справжніх заявок потрібні бот, Telegram Login, адреса сайту й секрет сесії.</p>
    <div className="setup-card"><h2>Стан налаштування</h2><p>Telegram: <strong>{telegram ? "ключі задано" : "ключі відсутні"}</strong></p><p>Тестовий вхід: <strong>{dev ? "увімкнено лише локально" : "вимкнено"}</strong></p></div>
    {dev && <div className="setup-actions"><Link href="/api/auth/dev?role=client">Увійти як тестовий клієнт</Link><Link href="/api/auth/dev?role=owner">Увійти як власниця</Link><Link href="/api/auth/dev?role=manager">Увійти як менеджер</Link></div>}
    {telegram && <Link className="button-link" href="/api/auth/telegram/start">Увійти через Telegram →</Link>}
    <p className="setup-footnote">Тестовий вхід ніколи не працює у production. Налаштування описано в README.md.</p>
  </main></>;
}
