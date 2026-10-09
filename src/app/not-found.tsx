import Link from "next/link";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";

export default function NotFound() {
  return <><SiteHeader compact /><main className="shell not-found-page"><div><p className="overline">Помилка 404</p><h1>Тут поки нічого немає</h1><p>Методій перевірив. Сторінку не знайдено — повернися на головну або відкрий кабінет.</p><div><Link className="button-link" href="/">На головну →</Link><Link className="secondary-button" href="/cabinet">У кабінет</Link></div></div><Image src="/metodiy.png" width={1312} height={1199} alt="Кріт Методій" /></main></>;
}
