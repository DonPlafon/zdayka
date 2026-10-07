import Link from "next/link";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return <header className="site-header"><div className="shell header-inner">
    <Link className="brand" href="/" aria-label="Здайка — на головну">Здайка<span className="brand-spark" aria-hidden="true" /></Link>
    {!compact && <nav className="desktop-nav" aria-label="Основна навігація"><a href="/#work-types">Види робіт</a><a href="/#subjects">Напрями</a><a href="/#how-it-works">Як працюємо</a></nav>}
    <Link className="cabinet-link" href="/cabinet">Кабінет <span aria-hidden="true">↗</span></Link>
  </div></header>;
}
