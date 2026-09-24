"use client";

import { useEffect, useState } from "react";

const KANALLAR = [
  { id: "boyner", ad: "Boyner" },
  { id: "sevil", ad: "Sevil" },
  { id: "beymen", ad: "Beymen" },
];

export default function DemoMagazaEslestirmePage() {
  const [kanal, setKanal] = useState("boyner");
  const [satirlari, setSatirlari] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [bilgi, setBilgi] = useState(null);
  const [filtre, setFiltre] = useState("");
  const [sadecePasif, setSadecePasif] = useState(false);

  async function yukle(k = kanal) {
    setYukleniyor(true);
    setHata(null);
    setBilgi(null);
    try {
      const r = await fetch(`/api/demo/siralam/magaza-map?kanal=${encodeURIComponent(k)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.hata || "Yüklenemedi");
      setSatirlari(j.satirlari || []);
      setBilgi(`${j.aktifAdet ?? 0} aktif · ${j.pasifAdet ?? 0} pasif · ${j.adet} toplam`);
    } catch (e) {
      setHata(e.message || String(e));
    } finally {
      setYukleniyor(false);
    }
  }

  useEffect(() => {
    yukle(kanal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanal]);

  function satirGuncelle(i, alan, val) {
    setSatirlari((prev) => prev.map((s, idx) => (idx === i ? { ...s, [alan]: val } : s)));
  }

  function satirEkle() {
    setSatirlari((prev) => [...prev, { ham: "", arcon: "", aktif: true }]);
  }

  function satirSil(i) {
    setSatirlari((prev) => prev.filter((_, idx) => idx !== i));
  }

  function toggleAktif(i) {
    setSatirlari((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, aktif: !s.aktif } : s))
    );
  }

  async function kaydet() {
    setKaydediliyor(true);
    setHata(null);
    setBilgi(null);
    try {
      const temiz = satirlari
        .map((s) => ({
          ham: String(s.ham || "").trim(),
          arcon: String(s.arcon || "").trim(),
          aktif: s.aktif !== false,
        }))
        .filter((s) => s.ham && s.arcon && !/^#N\/?A$/i.test(s.arcon));
      const r = await fetch("/api/demo/siralam/magaza-map", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanal, satirlari: temiz }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.hata || "Kayıt başarısız");
      setSatirlari(j.satirlari || temiz);
      setBilgi(
        `Kaydedildi · ${j.aktifAdet ?? 0} aktif · ${j.pasifAdet ?? 0} pasif. Sıralamayı yeniden üret.`
      );
    } catch (e) {
      setHata(e.message || String(e));
    } finally {
      setKaydediliyor(false);
    }
  }

  const gorunen = satirlari.filter((s) => {
    if (sadecePasif && s.aktif !== false) return false;
    if (!filtre) return true;
    const q = filtre.toLocaleLowerCase("tr-TR");
    return (
      String(s.ham).toLocaleLowerCase("tr-TR").includes(q) ||
      String(s.arcon).toLocaleLowerCase("tr-TR").includes(q)
    );
  });

  return (
    <div className="kural-sayfa">
      <section className="kural-hero">
        <div className="kural-hero-ikon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 7h11l-3-3m3 3-3 3M16 17H5l3 3m-3-3 3-3" />
          </svg>
        </div>
        <div>
          <h2>Demo · Mağaza eşleştirme</h2>
          <p>
            Ham kod → Arcon adı. <strong>Pasif</strong> satırlar silinmez, sıralamada üretilmez.
            Değişince Demo Sıralama’da yeniden Üret.
          </p>
        </div>
      </section>

      <div className="kural-kart" style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {KANALLAR.map((k) => (
            <button
              key={k.id}
              type="button"
              className="btn"
              style={{
                opacity: kanal === k.id ? 1 : 0.55,
                fontWeight: kanal === k.id ? 700 : 500,
              }}
              onClick={() => setKanal(k.id)}
            >
              {k.ad}
            </button>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={sadecePasif}
              onChange={(e) => setSadecePasif(e.target.checked)}
            />
            Sadece pasif
          </label>
          <input
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            placeholder="Ara…"
            style={{ marginLeft: "auto", padding: "8px 10px", minWidth: 160 }}
          />
          <button type="button" className="btn" onClick={satirEkle}>
            + Satır
          </button>
          <button type="button" className="btn" disabled={kaydediliyor} onClick={kaydet}>
            {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
        {bilgi && (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--metin-2)" }}>{bilgi}</div>
        )}
      </div>

      {hata && (
        <div className="kural-bildirim hata" style={{ marginTop: 12 }}>
          <span>!</span>
          {hata}
        </div>
      )}

      {yukleniyor ? (
        <div style={{ marginTop: 16, color: "var(--metin-2)" }}>Yükleniyor…</div>
      ) : (
        <article className="kural-kart" style={{ marginTop: 16, overflow: "auto" }}>
          <table className="demo-excel-tablo">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Ham kod</th>
                <th>Arcon mağaza adı</th>
                <th style={{ width: 100 }}>Durum</th>
                <th style={{ width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {gorunen.map((s, i) => {
                const realIdx = satirlari.indexOf(s);
                const aktif = s.aktif !== false;
                return (
                  <tr
                    key={`${s.ham}-${realIdx}`}
                    style={{ opacity: aktif ? 1 : 0.55, background: aktif ? undefined : "#f7f7f7" }}
                  >
                    <td className="demo-excel-nr">{i + 1}</td>
                    <td>
                      <input
                        value={s.ham}
                        onChange={(e) => satirGuncelle(realIdx, "ham", e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", border: "1px solid #ddd" }}
                      />
                    </td>
                    <td>
                      <input
                        value={s.arcon}
                        onChange={(e) => satirGuncelle(realIdx, "arcon", e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", border: "1px solid #ddd" }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => toggleAktif(realIdx)}
                        title={aktif ? "Pasife al" : "Aktife al"}
                        style={{
                          width: "100%",
                          background: aktif ? undefined : "#eee",
                          color: aktif ? undefined : "#666",
                        }}
                      >
                        {aktif ? "Aktif" : "Pasif"}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="btn" onClick={() => satirSil(realIdx)}>
                        Sil
                      </button>
                    </td>
                  </tr>
                );
              })}
              {gorunen.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 16, color: "var(--metin-2)" }}>
                    Kayıt yok — + Satır ile ekle.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>
      )}
    </div>
  );
}
