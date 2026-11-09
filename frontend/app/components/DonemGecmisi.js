"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const AYLAR = [
  "", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function donemBaslik(d) {
  if (d?.ad) return String(d.ad);
  const ay = AYLAR[Number(d?.ay)] || d?.ay;
  return `${ay} ${d?.yil}`;
}

function notOzet(metin) {
  const t = String(metin || "").replace(/\s+/g, " ").trim();
  if (!t) return "Özel durum notu";
  return t.length > 54 ? `${t.slice(0, 54)}…` : t;
}

export default function DonemGecmisi() {
  const router = useRouter();
  const yol = usePathname();
  const params = useSearchParams();
  const [sohbetler, setSohbetler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  const aktifDonemId = Number(params.get("donem") || 0) || null;

  const yukle = useCallback(async () => {
    try {
      const liste = await fetch("/api/sohbetler").then((r) => r.json());
      if (Array.isArray(liste)) setSohbetler(liste);
      else setSohbetler([]);
    } catch {
      setSohbetler([]);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    yukle();
  }, [yukle]);

  useEffect(() => {
    const onFocus = () => yukle();
    const onSohbet = () => yukle();
    window.addEventListener("focus", onFocus);
    window.addEventListener("prim-sohbet-guncelle", onSohbet);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("prim-sohbet-guncelle", onSohbet);
    };
  }, [yukle]);

  function yeniHesaplama() {
    router.push("/yukle");
  }

  return (
    <div className="gecmis-panel">
      <button type="button" className="gecmis-yeni" onClick={yeniHesaplama}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Yeni hesaplama
      </button>

      <div className="gecmis-baslik">Sohbet geçmişi</div>

      <div className="gecmis-liste" aria-label="Sohbet geçmişi">
        {yukleniyor && <p className="gecmis-bos">Yükleniyor…</p>}
        {sohbetler.map((d) => {
          const id = Number(d.id);
          const aktif =
            (yol === "/yukle" || yol === "/rapor" || yol.startsWith("/rapor")) &&
            aktifDonemId === id;
          const adet = Number(d.not_sayisi || 0);
          return (
            <Link
              key={id}
              href={`/yukle?donem=${id}`}
              className={`gecmis-item${aktif ? " is-active" : ""}`}
              title={donemBaslik(d)}
            >
              <span className="gecmis-item-baslik">{donemBaslik(d)}</span>
              <span className="gecmis-item-alt">
                {notOzet(d.son_not)}
                {adet > 1 ? ` · ${adet} not` : ""}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="gecmis-alt-nav">
        <Link href="/kurallar" className={yol === "/kurallar" ? "aktif" : ""}>
          Prim Kuralları
        </Link>
      </div>
    </div>
  );
}
