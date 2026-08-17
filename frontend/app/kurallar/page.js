"use client";

import { useEffect, useMemo, useState } from "react";
import { GRUP_DISI_OZET, GRUP_DISI_MADDELER } from "../lib/grupDisiKural";

const oranYaz = (deger) =>
  Number(deger || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

function AramaIkon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

/** "PUIG-HERMES-DG-GIV SIRALAMA HEDEF" → "(PUIG-HERMES-DG-GIV) SIRALAMA HEDEF" */
function markaParantezle(metin) {
  const ham = String(metin || "").replace(/\s+/g, " ").trim();
  if (!ham) return "";
  if (/\(.*\)/.test(ham)) return ham; // zaten parantezli

  // Marka bloğu + kalan (SIRALAMA HEDEF / HEDEFİ vb.)
  const eslesme = ham.match(
    /^([A-Za-zÇĞİÖŞÜçğıöşü0-9]+(?:\s*[-+/&]\s*[A-Za-zÇĞİÖŞÜçğıöşü0-9]+)*)\s+(.+)$/u
  );
  if (!eslesme) return ham;

  const markaBlok = eslesme[1].replace(/\s+/g, "").toLocaleUpperCase("tr-TR");
  const kalan = eslesme[2].trim();
  const kalanUpper = kalan.toLocaleUpperCase("tr-TR");

  // Sadece hedef/sıralama içeren başlıklarda markayı paranteze al
  if (!/SIRALAMA|HEDEF/.test(kalanUpper)) return ham;

  return `(${markaBlok}) ${kalan.toLocaleUpperCase("tr-TR")}`;
}

function kuralKartBaslik({ kanal, bolumAdi, markaGrubuAdi, altKanal }) {
  const alt = String(altKanal || "").trim().toLocaleUpperCase("tr-TR");
  const kanalAd = String(kanal || "").trim().toLocaleUpperCase("tr-TR");
  const bolum = String(bolumAdi || "").trim();
  const bolumUpper = bolum.toLocaleUpperCase("tr-TR");
  const kanalUpper = kanalAd;

  // Excel'de yan yana Beymen/Sevil sütunları: isimleri net ayır
  // Beymen ve Sevil ayrı mağaza — başlık mağaza adıyla başlamalı
  if (alt === "BEYMEN" || alt === "SEVIL" || alt === "SEVİL") {
    const yan = alt === "BEYMEN" ? "BEYMEN" : "SEVİL";
    if (bolumUpper.includes("LP GRUBU")) {
      return {
        baslik: `${yan} · LP GRUBU`,
        altBaslik: `PRİM ÇALIŞMASI (${yan})`,
      };
    }
    if (bolumUpper.includes("BEYMEN DG") || bolumUpper === "BEYMEN DG" || bolumUpper.includes(" DG")) {
      return {
        baslik: `${yan} · DG`,
        altBaslik: `PRİM ÇALIŞMASI (${yan})`,
      };
    }
    const sadeBolum = bolum
      .replace(/\s*\/\s*SEV[İI]L/gi, "")
      .replace(/\s*BEYMEN\s*\/\s*/gi, "")
      .replace(/^BEYMEN\s+/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleUpperCase("tr-TR");
    return {
      baslik: `${yan} · ${sadeBolum || "GRUP"}`,
      altBaslik: `PRİM ÇALIŞMASI (${yan})`,
    };
  }

  // "BEYMEN · BEYMEN HERMES" → "BEYMEN · HERMES"
  // "SEPHORA · TEK UZMAN OLAN NOKTALAR SEPHORA" → "SEPHORA · TEK UZMAN OLAN NOKTALAR"
  let sadeBolum = bolum;
  if (kanalUpper && bolumUpper.startsWith(kanalUpper + " ")) {
    sadeBolum = bolum.slice(kanalAd.length).trim();
  } else if (kanalUpper && bolumUpper === kanalUpper) {
    sadeBolum = "";
  }
  if (kanalUpper && sadeBolum.toLocaleUpperCase("tr-TR").endsWith(" " + kanalUpper)) {
    sadeBolum = sadeBolum.slice(0, sadeBolum.length - kanalAd.length).trim();
  } else if (kanalUpper && sadeBolum.toLocaleUpperCase("tr-TR").endsWith(kanalUpper)) {
    const belki = sadeBolum.slice(0, sadeBolum.length - kanalAd.length).trim();
    if (belki) sadeBolum = belki;
  }
  sadeBolum = sadeBolum.toLocaleUpperCase("tr-TR");

  // Marka grubu bölümle aynıysa tekrar etme; markaları paranteze al
  const marka = String(markaGrubuAdi || "").trim();
  const markaGoster =
    marka &&
    marka.toLocaleUpperCase("tr-TR") !== bolumUpper &&
    marka.toLocaleUpperCase("tr-TR") !== sadeBolum
      ? markaParantezle(marka)
      : "";

  const parcalar = [kanalAd, sadeBolum, markaGoster].filter(Boolean);
  const temiz = [];
  for (const p of parcalar) {
    const onceki = temiz[temiz.length - 1];
    if (!onceki || onceki.toLocaleUpperCase("tr-TR") !== p.toLocaleUpperCase("tr-TR")) {
      temiz.push(p);
    }
  }

  return {
    baslik: temiz.join(" · ") || "Tanımsız bölüm",
    altBaslik: "Aktif kural seti",
  };
}

export default function Kurallar() {
  const [kurallar, setKurallar] = useState([]);
  const [mesaj, setMesaj] = useState(null);
  const [arama, setArama] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [duzenlenen, setDuzenlenen] = useState(null);
  const [yeniOran, setYeniOran] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  async function yukle() {
    setYukleniyor(true);
    try {
      const cevap = await fetch("/api/kurallar");
      const veri = await cevap.json();
      setKurallar(Array.isArray(veri) ? veri : []);
    } finally {
      setYukleniyor(false);
    }
  }

  useEffect(() => {
    yukle();
  }, []);

  const filtreli = useMemo(() => {
    const sorgu = arama.trim().toLocaleLowerCase("tr-TR");
    return kurallar.filter((kural) => {
      if (!sorgu) return true;
      return [
        kural.kanal,
        kural.bolum_adi,
        kural.marka_grubu_adi,
        kural.alt_kanal,
        kural.kriter_adi,
        kural.kriter_tipi,
        kural.not_metni,
      ].some((alan) => String(alan || "").toLocaleLowerCase("tr-TR").includes(sorgu));
    });
  }, [arama, kurallar]);

  const gruplar = useMemo(() => {
    const sonuc = new Map();
    for (const kural of filtreli) {
      const kanal = String(kural.kanal || "").trim();
      const bolumAdi = String(kural.bolum_adi || "").trim();
      const markaGrubuAdi = String(kural.marka_grubu_adi || "").trim();
      const uzmanTipi = String(kural.uzman_tipi || "").trim();
      // Excel'deki yan yana sütunlar (Beymen / Sevil) DB'de alt_kanal ile ayrılıyor
      const altKanal = String(kural.alt_kanal || "").trim();

      const anahtar = [kanal, bolumAdi, markaGrubuAdi, uzmanTipi, altKanal].join("|");
      if (!sonuc.has(anahtar)) {
        const { baslik, altBaslik } = kuralKartBaslik({
          kanal,
          bolumAdi,
          markaGrubuAdi,
          altKanal,
        });
        sonuc.set(anahtar, {
          id: anahtar,
          baslik,
          uzmanTipi: altBaslik,
          liste: [],
        });
      }
      sonuc.get(anahtar).liste.push(kural);
    }
    return [...sonuc.values()];
  }, [filtreli]);

  function duzenlemeAc(kural) {
    setMesaj(null);
    setDuzenlenen(kural);
    setYeniOran(String(kural.prim_oran ?? "").replace(".", ","));
  }

  async function oranKaydet(event) {
    event.preventDefault();
    if (!duzenlenen) return;
    const oran = Number(String(yeniOran).replace(",", "."));
    if (!Number.isFinite(oran) || oran < 0 || oran > 10) {
      setMesaj({ tip: "hata", metin: "Oran 0 ile 10 arasında olmalı." });
      return;
    }

    setKaydediliyor(true);
    try {
      const cevap = await fetch(`/api/kural/${duzenlenen.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prim_oran: oran }),
      });
      const veri = await cevap.json();
      if (!cevap.ok || veri.hata) throw new Error(veri.hata || "Oran güncellenemedi");
      setDuzenlenen(null);
      setMesaj({
        tip: "ok",
        metin: `${duzenlenen.kriter_adi} oranı %${oranYaz(oran)} olarak güncellendi.`,
      });
      await yukle();
    } catch (hata) {
      setMesaj({ tip: "hata", metin: hata.message });
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <div className="kural-sayfa">
      <section className="kural-hero">
        <div className="kural-hero-ikon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5-2 2m-7 7-2 2m11 0-2-2m-7-7-2-2" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </div>
        <div>
          <h2>Prim Kuralları</h2>
          <p>Onaylı kural setini inceleyin, oranları güvenle güncelleyin.</p>
        </div>
      </section>

      <aside className="kural-not">
        <strong>Grup dışı</strong>
        <p>{GRUP_DISI_OZET}</p>
        <ul>
          {GRUP_DISI_MADDELER.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </aside>

      <div className="kural-araclar">
        <div className="kural-arama">
          <AramaIkon />
          <input
            type="search"
            value={arama}
            onChange={(event) => setArama(event.target.value)}
            placeholder="Kural, kanal, marka veya kriter ara…"
          />
          {arama && <button onClick={() => setArama("")} aria-label="Aramayı temizle">×</button>}
        </div>
      </div>

      {mesaj && (
        <div className={`kural-bildirim ${mesaj.tip}`}>
          <span>{mesaj.tip === "ok" ? "✓" : "!"}</span>
          {mesaj.metin}
          <button onClick={() => setMesaj(null)}>×</button>
        </div>
      )}

      {yukleniyor ? (
        <div className="kural-yukleniyor"><span />Kurallar yükleniyor…</div>
      ) : gruplar.length === 0 ? (
        <div className="kural-bos">
          <span><AramaIkon /></span>
          <h3>Eşleşen kural bulunamadı</h3>
          <p>Arama metnini değiştirip tekrar deneyin.</p>
        </div>
      ) : (
        <div className="kural-gruplar">
          {gruplar.map((grup, grupIndex) => (
            <article className="kural-kart" key={grup.id} style={{ "--gecikme": `${grupIndex * 25}ms` }}>
              <header>
                <div className="kural-kart-simge">{String(grup.baslik).charAt(0)}</div>
                <div>
                  <h3>{grup.baslik}</h3>
                </div>
              </header>
              <div className="kural-tablo-kapsayici">
                <table className="kural-tablo">
                  <thead>
                    <tr>
                      <th>Kural</th>
                      <th>Kriter tipi</th>
                      <th className="sag">Oran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grup.liste.map((kural) => (
                      <tr
                        key={kural.id}
                        className={kural.satir_tipi === "grup_toplam" ? "kural-satir-toplam" : undefined}
                      >
                        <td>
                          <strong className="kural-adi">{kural.kriter_adi}</strong>
                        </td>
                        <td>
                          <span className="kriter-tipi">{kural.kriter_tipi || "—"}</span>
                        </td>
                        <td className="sag">
                          <button
                            type="button"
                            className="kural-oran"
                            title="Oranı düzenle"
                            onClick={() => duzenlemeAc(kural)}
                          >
                            <strong>%{oranYaz(kural.prim_oran)}</strong>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="m14 5 5 5M4 20l3.5-.7L19 7.8a2.1 2.1 0 0 0-3-3L4.7 16.4 4 20z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}

      {duzenlenen && (
        <div className="kural-modal-arka" onClick={() => !kaydediliyor && setDuzenlenen(null)}>
          <form className="kural-modal" onSubmit={oranKaydet} onClick={(event) => event.stopPropagation()}>
            <div className="kural-modal-ikon">%</div>
            <span className="kural-modal-etiket">Prim oranını düzenle</span>
            <h3>{duzenlenen.kriter_adi}</h3>
            <p>{duzenlenen.kriter_tipi} · {duzenlenen.bolum_adi}</p>
            <label htmlFor="kural-oran-input">Yeni oran</label>
            <div className="kural-modal-input">
              <input
                id="kural-oran-input"
                autoFocus
                inputMode="decimal"
                value={yeniOran}
                onChange={(event) => setYeniOran(event.target.value)}
              />
              <span>%</span>
            </div>
            <small>0 ile 10 arasında bir oran girin. Değişiklik geçmişe kaydedilir.</small>
            <div className="kural-modal-butonlar">
              <button type="button" className="btn ikincil" disabled={kaydediliyor} onClick={() => setDuzenlenen(null)}>
                Vazgeç
              </button>
              <button type="submit" className="btn" disabled={kaydediliyor}>
                {kaydediliyor ? "Kaydediliyor…" : "Oranı kaydet"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
