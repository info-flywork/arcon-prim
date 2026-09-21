"use client";

import Link from "next/link";

const BLOKLAR = [
  {
    baslik: "Bugün ne yükleniyor",
    metin:
      "Prim Hesaplama sayfasına giden dosyalar Arcon’un mağaza ham verisini birleştirip revize ettiği Excel’ler. Sistem tek format bekliyor: uzman-mağaza, sell-out, zeops, hedef, sıralama.",
  },
  {
    baslik: "Ham datada ne değişiyor",
    metin:
      "Her mağaza kendi formatında gönderiyor; sıralama tek bir standart Excel değil. Zeops görece daha stabil; asıl kaos sıralama ve mağaza tablolarında. Ay ay kolon / satır başı kayabiliyor.",
  },
  {
    baslik: "Hedef: format profili + normalize",
    metin:
      "Ham dosya → eşleme profili (hangi kolon = mağaza, uzman, marka, adet…) → kanonik tablo. Hesap motoruna dokunulmaz; çıktı bugünkü import’un yediği yapıya dönüşür. Aynı mağaza sonraki ay benzer gönderirse profil yeniden kullanılır.",
  },
];

export default function YeniPrimSistem() {
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
            Ham mağaza verisi → kanonik dönüşüm çalışma alanı. Mevcut Prim Hesaplama ve hesap motoru
            burada yok; paralel deneme alanı.
          </p>
        </div>
      </section>

      <aside className="kural-not">
        <strong>Bağımsız alan</strong>
        <p>
          Dosyaları buraya atınca format analizi yapılacak — hesap motoruna bağlı değil. Mevcut dönem
          verisine yazılmaz;{" "}
          <Link href="/yukle">Prim Hesaplama</Link> akışı aynen kalır.
        </p>
      </aside>

      <div className="kural-gruplar">
        {BLOKLAR.map((blok, i) => (
          <article
            className="kural-kart"
            key={blok.baslik}
            style={{ "--gecikme": `${i * 40}ms` }}
          >
            <header>
              <div className="kural-kart-simge">{i + 1}</div>
              <div>
                <h3>{blok.baslik}</h3>
              </div>
            </header>
            <div style={{ padding: "0 16px 16px", color: "var(--metin-2)", fontSize: 14, lineHeight: 1.55 }}>
              {blok.metin}
            </div>
          </article>
        ))}
      </div>

      <aside className="kural-not" style={{ marginTop: 16 }}>
        <strong>Sırada</strong>
        <p style={{ marginBottom: 0 }}>
          Ham Excel / CSV’ler gelince kolon envanteri çıkarılacak; ilk mağazalar için eşleme profili
          tasarlanacak. Upload ve parse bu sayfaya sonra eklenecek.
        </p>
      </aside>
    </div>
  );
}
