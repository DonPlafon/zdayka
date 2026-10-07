import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Здайка",
  description: "Заявки на навчальні роботи: склад, ціна та етапи в одному кабінеті."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="uk"><body>
    {children}
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
  </body></html>;
}
