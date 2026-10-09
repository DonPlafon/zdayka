"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export function LoginGate({ next = "/cabinet" }: { next?: string }) {
  const [message, setMessage] = useState("Для кабінету потрібен вхід через Telegram.");
  useEffect(() => {
    const attempt = async () => {
      const telegram = (window as Window & { Telegram?: { WebApp?: { initData?: string; ready?: () => void } } }).Telegram?.WebApp;
      if (!telegram?.initData) return;
      setMessage("Перевіряємо вхід у Telegram…");
      try {
        telegram.ready?.();
        const response = await fetch("/api/auth/miniapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: telegram.initData }) });
        if (!response.ok) throw new Error();
        window.location.reload();
      } catch { setMessage("Не вдалося перевірити Telegram. Спробуй відкрити кабінет через бота ще раз."); }
    };
    attempt();
    const retry = window.setTimeout(attempt, 1000);
    return () => window.clearTimeout(retry);
  }, []);
  return <main className="login-gate shell"><div className="login-intro"><p className="overline">Здайка · кабінет</p><h1>Твої заявки — в одному місці</h1><p>Той самий кабінет відкривається в Telegram і в браузері на комп’ютері.</p><ul><li>Погоджені умови</li><li>Етапи та файли</li><li>Оплата й правки</li></ul></div><div className="login-box"><p className="overline">Вхід без пароля</p><h2>Увійди через Telegram</h2><p>{message}</p>
    <Link className="button-link" href={`/api/auth/telegram/start?next=${encodeURIComponent(next)}`}>Увійти через Telegram →</Link>
    <Link className="quiet-link" href="/setup">Налаштування входу</Link>
  </div></main>;
}
