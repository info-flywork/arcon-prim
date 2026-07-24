"use client";
import { useEffect, useState } from "react";

export default function Kurallar() {
  const [kurallar, setKurallar] = useState([]);
  const [mesaj, setMesaj] = useState(null);

  const yukle = () => fetch("/api/kurallar").then((r) => r.json()).then(setKurallar);
  useEffect(() => { yukle(); }, []);

  async function oranDuzelt(k) {
    const v = prompt(`"${k.kriter_adi}" için yeni oran (%):`, k.prim_oran);
    if (v === null) return;
    const oran = Number(String(v).replace(",", "."));
    if (!Number.isFinite(oran) || oran < 0 || oran > 10)
      return setMesaj({ tip: "hata", metin: "Geçersiz oran (0-10 arası olmalı)" });
    const r = await fetch(`/api/kural/${k.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prim_oran: oran }),
    });
    const d = await r.json();
    setMesaj(d.hata ? { tip: "hata", metin: d.hata } : { tip: "ok", metin: `Oran güncellendi: %${oran} (değişiklik geçmişe kaydedildi)` });
    yukle();
  }

  // Bölüme göre grupla
  const gruplar = {};
  for (const k of kurallar) {
    const anahtar = `${k.kanal} · ${k.bolum_adi}${k.marka_grubu_adi ? " — " + k.marka_grubu_adi : ""}`;
    (gruplar[anahtar] = gruplar[anahtar] || []).push(k);
  }

  return (
    <div>
      <h2>Prim Kuralları</h2>
      <p className="aciklama">
        Onaylı kural seti. Orana tıklayarak düzenleyebilirsiniz — her değişiklik eski/yeni değerle birlikte
        Değişiklik Geçmişi'ne yazılır. Hesap motoru her çalıştırmada güncel kuralları okur.
      </p>
      {mesaj && <div className={`mesaj ${mesaj.tip}`}>{mesaj.metin}</div>}
      {Object.entries(gruplar).map(([ad, liste]) => (
        <div className="yukle-kart" key={ad}>
          <h3>{ad}</h3>
          <table>
            <thead>
              <tr><th>Kural</th><th>Kriter Tipi</th><th className="sag">Oran %</th><th>Tip</th><th>Not</th></tr>
            </thead>
            <tbody>
              {liste.map((k) => (
                <tr key={k.id}>
                  <td>{k.kriter_adi}</td>
                  <td>{k.kriter_tipi}</td>
                  <td className="sag" style={{ cursor: "pointer", textDecoration: "underline dotted" }}
                      title="Düzenlemek için tıkla" onClick={() => oranDuzelt(k)}>
                    {Number(k.prim_oran).toLocaleString("tr-TR")}
                  </td>
                  <td>
                    <span className={`rozet ${k.satir_tipi === "grup_toplam" ? "notr" : k.satir_tipi === "bonus" ? "ok" : ""}`}>
                      {k.satir_tipi}
                    </span>
                  </td>
                  <td>{k.not_metni || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
