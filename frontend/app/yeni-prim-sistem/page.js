"use client";

import { useMemo, useState } from "react";
import SelloutPanel from "./SelloutPanel";
import SiralamPanel from "./SiralamPanel";
import HedefPanel from "./HedefPanel";

const SEKMELER = [
  {
    id: "sellout",
    ad: "Sell-out",
    kisa: "Ham satış → Arcon format",
    ikon: (
      <path d="M12 16V4m0 0L8 8m4-4 4 4M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    ),
  },
  {
    id: "siralamalar",
    ad: "Sıralamalar",
    kisa: "Ham sıralama → Temmuz format",
    ikon: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  },
  {
    id: "hedefler",
    ad: "Hedefler",
    kisa: "Ham hedef → Arcon format",
    ikon: (
      <path d="M12 20V10M18 20V4M6 20v-4M3 20h18" />
    ),
  },
];

export default function YeniPrimSistem() {
  const [sekme, setSekme] = useState("sellout");
  const aktif = useMemo(() => SEKMELER.find((s) => s.id === sekme) || SEKMELER[0], [sekme]);

  return (
    <div className="kural-sayfa">
      <section className="kural-hero">
        <div className="kural-hero-ikon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h10M4 17h7M16 14l4 4m0-4-4 4" />
          </svg>
        </div>
        <div>
          <h2>Yeni Prim Sistem</h2>
          <p>
            Ham mağaza verisi → kanonik dönüşüm. Mevcut Prim Hesaplama’ya dokunmaz; paralel deneme
            alanı.
          </p>
        </div>
      </section>

      <div className="yeni-prim-sekme-cubugu" role="tablist" aria-label="Çalışma sekmeleri">
        {SEKMELER.map((s) => {
          const secili = s.id === sekme;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={secili}
              className={`yeni-prim-sekme ${secili ? "aktif" : ""}`}
              onClick={() => setSekme(s.id)}
            >
              <span className="yeni-prim-sekme-ikon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  {s.ikon}
                </svg>
              </span>
              <span className="yeni-prim-sekme-metin">
                <strong>{s.ad}</strong>
                <small>{s.kisa}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="yeni-prim-sekme-govde" role="tabpanel" aria-label={aktif.ad}>
        {sekme === "sellout" ? (
          <SelloutPanel />
        ) : sekme === "siralamalar" ? (
          <SiralamPanel />
        ) : (
          <HedefPanel />
        )}
      </div>
    </div>
  );
}
