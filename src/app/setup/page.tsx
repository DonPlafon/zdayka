import Link from "next/link";
import { connection } from "next/server";
import { SiteHeader } from "@/components/SiteHeader";

const loginErrors: Record<string, string> = {
  telegram: "Telegram не завершив вхід. Спробуй ще раз.",
  session: "Не вдалося зберегти вхід. Відкрий сайт і спробуй ще раз у тому самому браузері.",
  state: "Час входу минув або сесія змінилася. Спробуй ще раз.",
  exchange: "Telegram не підтвердив код входу. Перевір Client ID, Client Secret і Redirect URI.",
  token: "Не вдалося перевірити відповідь Telegram. Спробуй ще раз.",
  audience: "Telegram видав відповідь для іншого бота. Перевір Client ID.",
  issuer: "Відповідь надійшла не від очікуваного сервісу Telegram.",
  claims: "У відповіді Telegram бракує потрібних даних.",
  expired: "Час входу минув. Спробуй ще раз.",
  key: "Не вдалося перевірити ключ Telegram. Спробуй ще раз.",
  signature: "Підпис відповіді Telegram не збігається.",
  format: "Відповідь Telegram має неочікуваний формат. Перевір налаштування Telegram Login.",
  network: "Сервер не зміг отримати ключі Telegram. Спробуй пізніше або перевір з’єднання сервера.",
  identity: "Telegram не передав ID акаунта. Перевір дозвіл Profile для входу.",
  account: "Не вдалося відкрити кабінет. Спробуй ще раз."
};

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const { error } = await searchParams;
  const telegram = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CLIENT_ID && process.env.TELEGRAM_CLIENT_SECRET);
  const dev = process.env.NODE_ENV !== "production" && process.env.DEV_TEST_LOGIN === "1";
  return <><SiteHeader compact /><main className="shell setup-page"><p className="overline">Підключення</p><h1>Вхід через Telegram</h1>
    <p>{telegram ? "Увійди в кабінет зі своїм Telegram-акаунтом. Якщо вхід не спрацює, код помилки нижче допоможе знайти причину." : "Для входу потрібні налаштування Telegram Login. Кабінет стане доступним після підключення."}</p>
    {error && <p role="alert">{loginErrors[error] || "Не вдалося увійти. Спробуй ще раз."} <small>Код: {loginErrors[error] ? error : "login"}</small></p>}
    <div className="setup-card"><h2>Стан налаштування</h2><p>Telegram: <strong>{telegram ? "ключі задано" : "ключі відсутні"}</strong></p><p>Тестовий вхід: <strong>{dev ? "увімкнено лише локально" : "вимкнено"}</strong></p></div>
    {dev && <div className="setup-actions"><Link href="/api/auth/dev?role=client">Увійти як тестовий клієнт</Link><Link href="/api/auth/dev?role=owner">Увійти як власниця</Link><Link href="/api/auth/dev?role=manager">Увійти як менеджер</Link></div>}
    {telegram && <Link className="button-link" href="/api/auth/telegram/start">Увійти через Telegram →</Link>}
    <p className="setup-footnote">Тестовий вхід ніколи не працює у production. Налаштування описано в README.md.</p>
  </main></>;
}
