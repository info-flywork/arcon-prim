import "./globals.css";
import Menu from "./components/Menu";

export const metadata = {
  title: "Arcon Prim Sistemi",
  description: "Uzman prim hesaplama ve raporlama",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>
        <div className="layout">
          <aside className="sidebar">
            <h1>
              <span className="logo">A</span>
              <span>
                Arcon Prim
                <small>Prim Yönetim Sistemi</small>
              </span>
            </h1>
            <Menu />
            <div className="alt-bilgi">v1.0 · Fly-Work</div>
          </aside>
          <main className="icerik">{children}</main>
        </div>
      </body>
    </html>
  );
}
