import { Suspense } from "react";
import "./globals.css";
import DonemGecmisi from "./components/DonemGecmisi";

export const metadata = {
  title: "Arcon Prim Sistemi",
  description: "Uzman prim hesaplama ve raporlama",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body data-app-shell="1">
        <div className="layout">
          <aside className="sidebar">
            <div className="sidebar-marka">
              <span className="marka-metin">ARCON PRIM</span>
            </div>
            <Suspense fallback={<div className="gecmis-panel"><p className="gecmis-bos">Yükleniyor…</p></div>}>
              <DonemGecmisi />
            </Suspense>
          </aside>
          <main className="icerik">{children}</main>
        </div>
      </body>
    </html>
  );
}
