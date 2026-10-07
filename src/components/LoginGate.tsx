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
  return <div className="login-gate shell"><div className="login-box"><p className="overline">Кабінет</p><h1>Увійди через Telegram</h1><p>{message}</p>
    <Link className="button-link" href={`/api/auth/telegram/start?next=${encodeURIComponent(next)}`}>Увійти через Telegram →</Link>
    <Link className="quiet-link" href="/setup">Налаштування входу</Link>
  </div></div>;
}
