"use client";

import { useEffect, useMemo, useState } from "react";

const oranYaz = (deger) =>
  Number(deger || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

const TIP_ETIKET = {
  kural: "Standart kural",
  grup_toplam: "Grup toplamı",
  bonus: "Bonus",
};

function AramaIkon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

export default function Kurallar() {
  const [kurallar, setKurallar] = useState([]);
  const [mesaj, setMesaj] = useState(null);
  const [arama, setArama] = useState("");
  const [tip, setTip] = useState("tumu");
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

  const tipler = useMemo(
    () => [...new Set(kurallar.map((kural) => kural.satir_tipi).filter(Boolean))],
    [kurallar]
  );

  const filtreli = useMemo(() => {
    const sorgu = arama.trim().toLocaleLowerCase("tr-TR");
    return kurallar.filter((kural) => {
      if (tip !== "tumu" && kural.satir_tipi !== tip) return false;
      if (!sorgu) return true;
      return [
        kural.kanal,
        kural.bolum_adi,
        kural.marka_grubu_adi,
        kural.kriter_adi,
        kural.kriter_tipi,
        kural.not_metni,
      ].some((alan) => String(alan || "").toLocaleLowerCase("tr-TR").includes(sorgu));
    });
  }, [arama, kurallar, tip]);

  const gruplar = useMemo(() => {
    const sonuc = new Map();
    for (const kural of filtreli) {
      const anahtar = `${kural.kanal} · ${kural.bolum_adi}${
        kural.marka_grubu_adi ? " — " + kural.marka_grubu_adi : ""
      }`;
      if (!sonuc.has(anahtar)) sonuc.set(anahtar, []);
      sonuc.get(anahtar).push(kural);
    }
    return [...sonuc.entries()];
  }, [filtreli]);

  const bonusSayisi = kurallar.filter((kural) => kural.satir_tipi === "bonus").length;
  const grupSayisi = useMemo(() => {
    const set = new Set(
      kurallar.map(
        (kural) =>
          `${kural.kanal}|${kural.bolum_adi}|${kural.marka_grubu_adi || ""}`
      )
    );
    return set.size;
  }, [kurallar]);

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
          <span>Hesaplama motoru</span>
          <h2>Prim Kuralları</h2>
          <p>Onaylı kural setini inceleyin, oranları güvenle güncelleyin.</p>
        </div>
        <div className="kural-hero-durum">
          <i />
          <span><strong>Kurallar aktif</strong><small>Hesaplamalarda kullanılıyor</small></span>
        </div>
      </section>

      <div className="kural-istatistikler">
        <div>
          <span className="kural-istat-ikon mavi">#</span>
          <span><small>Toplam kural</small><strong>{kurallar.length}</strong></span>
        </div>
        <div>
          <span className="kural-istat-ikon mor">G</span>
          <span><small>Kural grubu</small><strong>{grupSayisi}</strong></span>
        </div>
        <div>
          <span className="kural-istat-ikon turkuaz">+</span>
          <span><small>Bonus kuralı</small><strong>{bonusSayisi}</strong></span>
        </div>
      </div>

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
        <div className="kural-tipler">
          <button className={tip === "tumu" ? "aktif" : ""} onClick={() => setTip("tumu")}>
            Tümü
          </button>
          {tipler.map((kuralTipi) => (
            <button
              key={kuralTipi}
              className={tip === kuralTipi ? "aktif" : ""}
              onClick={() => setTip(kuralTipi)}
            >
              {TIP_ETIKET[kuralTipi] || kuralTipi}
            </button>
          ))}
        </div>
        <span className="kural-sonuc">{filtreli.length} kural</span>
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
          <p>Arama metnini veya seçili filtreyi değiştirin.</p>
        </div>
      ) : (
        <div className="kural-gruplar">
          {gruplar.map(([ad, liste], grupIndex) => (
            <article className="kural-kart" key={ad} style={{ "--gecikme": `${grupIndex * 25}ms` }}>
              <header>
                <div className="kural-kart-simge">{String(ad).charAt(0)}</div>
                <div>
                  <h3>{ad}</h3>
                  <span>{liste.length} kural · Aktif kural seti</span>
                </div>
                <span className="kural-kart-sayi">{liste.length}</span>
              </header>
              <div className="kural-tablo-kapsayici">
                <table className="kural-tablo">
                  <thead>
                    <tr>
                      <th>Kural</th>
                      <th>Kriter tipi</th>
                      <th className="sag">Oran</th>
                      <th>Tip</th>
                      <th>Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((kural) => (
                      <tr key={kural.id}>
                        <td>
                          <strong className="kural-adi">{kural.kriter_adi}</strong>
                        </td>
                        <td><span className="kriter-tipi">{kural.kriter_tipi || "—"}</span></td>
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
                        <td>
                          <span className={`kural-tip kural-tip-${kural.satir_tipi || "standart"}`}>
                            {TIP_ETIKET[kural.satir_tipi] || kural.satir_tipi || "Kural"}
                          </span>
                        </td>
                        <td><span className="kural-not">{kural.not_metni || "—"}</span></td>
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
