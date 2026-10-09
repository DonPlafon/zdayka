"use client";

import { useState } from "react";
import Link from "next/link";

export function StaffLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/staff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не вдалося увійти");
      window.location.assign("/admin");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не вдалося увійти"); setBusy(false); }
  }

  return <main className="staff-login-page shell"><div className="staff-login-aside"><p className="overline">Робоче місце</p><h1>Усе по заявках — в одному місці.</h1><p>Увійди, щоб оцінювати завдання, погоджувати оплату й віддавати готові матеріали.</p><Link href="/">← На сайт</Link></div>
    <form className="staff-login-card" onSubmit={submit}><span className="staff-login-mark" aria-hidden="true">З</span><p className="overline">Здайка · команда</p><h2>Вхід в адмінку</h2><p>Для власниці та менеджера — окремі акаунти.</p>
      <label htmlFor="staff-username">Логін</label><input id="staff-username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required maxLength={64} />
      <label htmlFor="staff-password">Пароль</label><input id="staff-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required />
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "Перевіряємо…" : "Увійти"} <span aria-hidden="true">→</span></button>
    </form></main>;
}
