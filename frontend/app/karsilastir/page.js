"use client";
import { useState } from "react";
import DonemSec from "../components/DonemSec";

const tl = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 }));
const say = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR"));

const SEBEP_ETIKET = {
  eslesir: { renk: "#1f7a1f", metin: "EŞLEŞİYOR" },
  sistem_fazla: { renk: "#b57200", metin: "SİSTEM FAZLA" },
  excel_fazla: { renk: "#b57200", metin: "EXCEL FAZLA" },
  sadece_sistem: { renk: "#0066cc", metin: "SADECE SİSTEMDE" },
  sadece_excel: { renk: "#c00", metin: "SADECE EXCEL'DE" },
  atama_yok: { renk: "#c00", metin: "ATAMA YOK" },
  master_yok: { renk: "#c00", metin: "MASTER'DA YOK" },
};

export default function Karsilastir() {
  const [donem, setDonem] = useState(null);
  const [dosya, setDosya] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sonuc, setSonuc] = useState(null);
  const [hata, setHata] = useState(null);
  const [filtre, setFiltre] = useState("");
  const [sadeceFarkli, setSadeceFarkli] = useState(true);

  async function karsilastir() {
    if (!donem || !dosya) return;
    setYukleniyor(true); setHata(null); setSonuc(null);
    const fd = new FormData();
    fd.append("dosya", dosya);
    try {
      const res = await fetch(`/api/karsilastir/${donem}`, { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) { setHata(d.hata || "Bilinmeyen hata"); }
      else setSonuc(d);
    } catch (e) { setHata(e.message); }
    finally { setYukleniyor(false); }
  }

  const filtreli = (sonuc?.satirlar || []).filter((r) => {
    if (sadeceFarkli && r.sebep_kod === "eslesir") return false;
    if (!filtre) return true;
    const q = filtre.toLocaleLowerCase("tr-TR");
    return (r.uzman_ad || "").toLocaleLowerCase("tr-TR").includes(q) ||
           (r.magaza_ad || "").toLocaleLowerCase("tr-TR").includes(q);
  });

  return (
    <div>
      <h2>Excel vs Sistem Karşılaştırma Raporu</h2>
      <p className="aciklama">
        Excel'in <b>Prim Çalışma</b> pivot çıktısını (Uzman × Mağaza × Prime Esas kolonları içeren CSV/XLSX) buraya yükle;
        sistem her uzman × mağaza için Excel değerini kendi hesabıyla karşılaştırır, farkın nedenini gösterir.
        Test ekibine "burada niye farklı?" sorusuna somut cevap üretir.
      </p>

      <DonemSec value={donem} onChange={setDonem} />

      {donem && (
        <div className="satir" style={{ marginTop: 12, gap: 12 }}>
          <input type="file" accept=".xlsx,.xlsm,.csv"
            onChange={(e) => setDosya(e.target.files?.[0] || null)} />
          <button className="btn" onClick={karsilastir} disabled={!dosya || yukleniyor}>
            {yukleniyor ? "Karşılaştırılıyor..." : "Karşılaştır"}
          </button>
        </div>
      )}

      {hata && <div className="mesaj hata" style={{ marginTop: 12 }}>⚠ {hata}</div>}

      {sonuc && (
        <>
          <div className="kartlar" style={{ marginTop: 16 }}>
            <div className="kart">
              <div className="etiket">Excel Prime Esas</div>
              <div className="deger">{tl(sonuc.ozet.toplam_excel)} TL</div>
              <div className="alt">{say(sonuc.ozet.excel_satir)} uzman × mağaza satırı</div>
            </div>
            <div className="kart">
              <div className="etiket">Sistem Prime Esas</div>
              <div className="deger">{tl(sonuc.ozet.toplam_sistem)} TL</div>
              <div className="alt">{say(sonuc.ozet.sistem_satir)} satır</div>
            </div>
            <div className="kart">
              <div className="etiket">Fark (Sistem − Excel)</div>
              <div className="deger" style={{ color: sonuc.ozet.fark >= 0 ? "#1f7a1f" : "#c00" }}>
                {sonuc.ozet.fark >= 0 ? "+" : ""}{tl(sonuc.ozet.fark)} TL
              </div>
              <div className="alt">{sonuc.ozet.birlesik_satir} birleşik satır</div>
            </div>
          </div>

          <div style={{ margin: "12px 0", display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Object.entries(sonuc.ozet.sebep_kirilim || {}).map(([kod, sayi]) => {
              const et = SEBEP_ETIKET[kod] || { renk: "#666", metin: kod };
              return (
                <span key={kod} style={{ fontSize: 12, background: et.renk + "20", color: et.renk, padding: "4px 10px", borderRadius: 4 }}>
                  {et.metin}: <b>{sayi}</b>
                </span>
              );
            })}
          </div>

          <div className="satir" style={{ gap: 12, marginBottom: 8 }}>
            <input type="text" placeholder="Uzman veya mağaza ara..." style={{ width: 260 }}
              value={filtre} onChange={(e) => setFiltre(e.target.value)} />
            <label>
              <input type="checkbox" checked={sadeceFarkli} onChange={(e) => setSadeceFarkli(e.target.checked)} />
              {" "}Sadece farklı olanları göster
            </label>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Uzman</th>
                  <th>Mağaza</th>
                  <th>Bayi</th>
                  <th className="sag">Excel</th>
                  <th className="sag">Sistem</th>
                  <th className="sag">Fark</th>
                  <th className="sag">%</th>
                  <th>Sebep</th>
                </tr>
              </thead>
              <tbody>
                {filtreli.map((r, i) => {
                  const et = SEBEP_ETIKET[r.sebep_kod] || { renk: "#666", metin: r.sebep_kod };
                  const buyuk = Math.max(Math.abs(r.excel_esas || 0), Math.abs(r.sistem_esas || 0));
                  const oran = buyuk > 0 ? (Math.abs(r.fark) / buyuk * 100) : 0;
                  const bg = r.sebep_kod === "eslesir" ? "" :
                             (r.sebep_kod === "sistem_fazla" || r.sebep_kod === "excel_fazla") ? "#fff9e6" : "#fff0f0";
                  return (
                    <tr key={i} style={{ background: bg }}>
                      <td>{r.uzman_ad}</td>
                      <td>{r.magaza_ad}</td>
                      <td>{r.bayi || "—"}</td>
                      <td className="sag">{tl(r.excel_esas)}</td>
                      <td className="sag">{tl(r.sistem_esas)}</td>
                      <td className="sag" style={{ fontWeight: 700, color: r.fark >= 0 ? "#1f7a1f" : "#c00" }}>
                        {r.fark >= 0 ? "+" : ""}{tl(r.fark)}
                      </td>
                      <td className="sag"><small>{oran.toFixed(1)}%</small></td>
                      <td>
                        <span style={{ fontSize: 11, background: et.renk + "20", color: et.renk, padding: "2px 6px", borderRadius: 3, fontWeight: 700 }}>
                          {et.metin}
                        </span>
                        <div style={{ fontSize: 11, color: "#666", marginTop: 2, maxWidth: 400 }}>{r.sebep}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
            {filtreli.length} satır gösteriliyor · toplam {sonuc.satirlar.length}
          </div>
        </>
      )}
    </div>
  );
}
