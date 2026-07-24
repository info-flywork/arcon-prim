"use client";
import { useEffect, useState } from "react";

const AYLAR = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export default function DonemSec({ value, onChange }) {
  const [donemler, setDonemler] = useState([]);
  const [yeni, setYeni] = useState(false);
  const [yil, setYil] = useState(new Date().getFullYear());
  const [ay, setAy] = useState(new Date().getMonth() + 1);
  const [mesaj, setMesaj] = useState(null);
  const [bekliyor, setBekliyor] = useState(false);

  const secili = donemler.find((d) => Number(d.id) === Number(value)) || null;

  async function listeyiYukle() {
    const liste = await fetch("/api/donemler").then((r) => r.json());
    setDonemler(Array.isArray(liste) ? liste : []);
    return Array.isArray(liste) ? liste : [];
  }

  useEffect(() => {
    listeyiYukle().then((liste) => {
      if (!value && liste.length) onChange(liste[0].id);
    });
  }, []);

  function yeniDonemAc() {
    setMesaj(null);
    // Varsayılan: listedeki en son dönemin bir sonraki ayı
    if (donemler.length) {
      const son = donemler[0];
      let nextAy = Number(son.ay) + 1;
      let nextYil = Number(son.yil);
      if (nextAy > 12) { nextAy = 1; nextYil += 1; }
      setYil(nextYil);
      setAy(nextAy);
    } else {
      setYil(new Date().getFullYear());
      setAy(new Date().getMonth() + 1);
    }
    setYeni(true);
  }

  async function olustur() {
    setBekliyor(true);
    setMesaj(null);
    try {
      const onceVarMi = donemler.some((d) => Number(d.yil) === Number(yil) && Number(d.ay) === Number(ay));
      const r = await fetch("/api/donemler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yil: Number(yil), ay: Number(ay) }),
      });
      const d = await r.json();
      if (!r.ok || d.hata || !d.id) {
        setMesaj({ tip: "hata", metin: d.hata || "Dönem oluşturulamadı" });
        return;
      }
      await listeyiYukle();
      onChange(Number(d.id));
      setYeni(false);
      setMesaj({
        tip: "ok",
        metin: onceVarMi
          ? `${d.ad} zaten vardı — şimdi bu dönem seçildi.`
          : `${d.ad} oluşturuldu ve seçildi. Artık bu döneme dosya yükleyebilirsiniz.`,
      });
    } catch (e) {
      setMesaj({ tip: "hata", metin: e.message });
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <div>
      <div className="satir" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <label>Dönem:</label>
        <select
          value={value || ""}
          onChange={(e) => {
            setMesaj(null);
            onChange(Number(e.target.value));
          }}
          style={{ minWidth: 220 }}
        >
          {!donemler.length && <option value="">Dönem yok</option>}
          {donemler.map((d) => (
            <option key={d.id} value={d.id}>{d.ad} ({d.durum})</option>
          ))}
        </select>
        {yeni ? (
          <>
            <input
              type="number"
              style={{ width: 90 }}
              value={yil}
              disabled={bekliyor}
              onChange={(e) => setYil(e.target.value)}
            />
            <select value={ay} disabled={bekliyor} onChange={(e) => setAy(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}. ay — {AYLAR[i + 1]}</option>
              ))}
            </select>
            <button className="btn" onClick={olustur} disabled={bekliyor}>
              {bekliyor ? "Kaydediliyor..." : "Oluştur"}
            </button>
            <button className="btn ikincil" disabled={bekliyor} onClick={() => { setYeni(false); setMesaj(null); }}>
              Vazgeç
            </button>
          </>
        ) : (
          <button className="btn ikincil" onClick={yeniDonemAc}>+ Yeni Dönem</button>
        )}
      </div>

      {secili && (
        <div className="mesaj notr" style={{ marginTop: 10, marginBottom: 0 }}>
          Şu an seçili dönem: <b>{secili.ad}</b> · durum: <b>{secili.durum}</b>
        </div>
      )}
      {mesaj && <div className={`mesaj ${mesaj.tip}`} style={{ marginTop: 10 }}>{mesaj.metin}</div>}
    </div>
  );
}
