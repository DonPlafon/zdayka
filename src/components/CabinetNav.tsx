"use client";
import Link from "next/link";

export function CabinetNav({ name, role }: { name: string; role: string }) {
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; }
  return <div className="cabinet-nav"><div className="shell cabinet-nav-inner"><Link className="brand" href="/">Здайка<span className="brand-spark" /></Link><nav><Link href="/cabinet">Мої заявки</Link><Link href="/cabinet/new">Нове завдання</Link>{role !== "client" && <Link href="/admin">Адмінка</Link>}</nav><div className="account-group"><span>{name}</span><button type="button" onClick={logout}>Вийти</button></div></div></div>;
}
