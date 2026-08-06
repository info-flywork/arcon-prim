import "./globals.css";
import Menu from "./components/Menu";

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
            <div className="sidebar-isik sidebar-isik-bir" />
            <div className="sidebar-isik sidebar-isik-iki" />
            <div className="sidebar-marka">
              <span className="logo">A<span>+</span></span>
              <span className="marka-metin">
                <strong>Arcon Prim</strong>
                <small>Prim yönetim sistemi</small>
              </span>
            </div>
            <Menu />
            <div className="alt-bilgi">Arcon Prim <span>·</span> v1.0</div>
          </aside>
          <main className="icerik">{children}</main>
        </div>
      </body>
    </html>
  );
}
