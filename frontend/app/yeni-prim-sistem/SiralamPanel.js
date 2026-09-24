"use client";

import Link from "next/link";
import { useState } from "react";

const HEADERS = [
  "MAĞAZA",
  "ÇEŞİT",
  "MARKA",
  "SIRALAMA",
  "AY",
  "BÖLGE",
  "YIL",
  "BAYİ",
  "Prim Mağaza",
];

function indirXlsxUrl(url, dosyaAdi) {
  if (!url) return;
  const ad = dosyaAdi || "arcon_siralam.xlsx";
  fetch(url, { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error(`İndirme başarısız (${r.status})`);
      const blob = await r.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = ad;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(obj);
    })
    .catch(() => {
      const a = document.createElement("a");
      a.href = url;
      a.download = ad;
      a.click();
    });
}

function hucre(v) {
  if (v == null || v === "") return null;
  return String(v);
}

function ExcelOnizleme({ baslik, satirSayisi, satirlari, xlsxUrl, dosyaAdi, ozet }) {
  const rows = Array.isArray(satirlari) ? satirlari : [];
  return (
    <article className="kural-kart" style={{ marginTop: 16 }}>
      <header style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="kural-kart-simge">xlsx</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: 0 }}>{baslik}</h3>
          <div style={{ fontSize: 13, color: "var(--metin-2)", marginTop: 4 }}>
            {Number(satirSayisi || 0).toLocaleString("tr-TR")} satır · sheet: Sıralama Data
            {ozet ? ` · ${ozet}` : ""}
            {rows.length > 0 && rows.length < Number(satirSayisi || 0)
              ? ` · ekranda ilk ${rows.length}`
              : rows.length > 0
                ? " · önizleme"
                : ""}
          </div>
        </div>
        <button
          type="button"
          className="btn"
          disabled={!xlsxUrl}
          onClick={() => indirXlsxUrl(xlsxUrl, dosyaAdi)}
          style={{ whiteSpace: "nowrap" }}
        >
          Excel indir (.xlsx)
        </button>
      </header>

      {rows.length === 0 ? (
        <div style={{ padding: "12px 16px 20px", color: "var(--metin-2)" }}>
          Önizleme yok — önce üret.
        </div>
      ) : (
        <div className="demo-excel-kapsayici">
          <table className="demo-excel-tablo">
            <thead>
              <tr>
                <th className="demo-excel-nr">#</th>
                {HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="demo-excel-nr">{i + 1}</td>
                  {HEADERS.map((h) => {
                    const val = hucre(r?.[h]);
                    return (
                      <td key={h} title={val || ""}>
                        {val ?? <span className="demo-excel-bos">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export default function SiralamPanel() {
  const [dosyalar, setDosyalar] = useState([]);
  const [zeops, setZeops] = useState(null);
  const [yearMonth, setYearMonth] = useState("2026-08");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [sonuc, setSonuc] = useState(null);

  async function normalizeEt() {
    if (!dosyalar.length) {
      setHata("En az bir ham sıralama dosyası seç.");
      return;
    }
    if (!zeops) {
      setHata("Zeops ham data da seç. Zeops’ta olmayan mağaza elenir.");
      return;
    }
    setYukleniyor(true);
    setHata(null);
    try {
      const fd = new FormData();
      for (const f of dosyalar) fd.append("dosyalar", f);
      fd.append("zeops", zeops);
      if (yearMonth) fd.append("yearMonth", yearMonth);
      const r = await fetch("/api/demo/siralam/normalize", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.hata || "Normalize başarısız");
      setSonuc(j);
      const ym = yearMonth || "demo";
      indirXlsxUrl(
        `/api/demo/siralam/xlsx?ym=${encodeURIComponent(ym)}&t=${Date.now()}`,
        `arcon_siralam_${ym}.xlsx`
      );
    } catch (e) {
      setHata(e.message || String(e));
    } finally {
      setYukleniyor(false);
    }
  }

  const kanalOzet = [
    Array.isArray(sonuc?.kanallar) && sonuc.kanallar.length
      ? sonuc.kanallar.map((k) => `${k.kanal || "?"}:${k.satirSayisi ?? 0}`).join(" · ")
      : "",
    sonuc?.ozet?.atlananZeopsSatir
      ? `Zeops dışı ${sonuc.ozet.atlananZeopsMagaza} mağaza / ${sonuc.ozet.atlananZeopsSatir} satır silindi`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="yeni-prim-panel">
      <p className="yeni-prim-panel-ozet">
        Ham mağaza sıralaması → Temmuz formatı (<code>MAĞAZA, ÇEŞİT, MARKA, SIRALAMA…</code>). Local
        demo; DB’ye yazılmaz.
        {sonuc?.kaydedildiAt
          ? ` · Son üretim: ${new Date(sonuc.kaydedildiAt).toLocaleString("tr-TR")}`
          : ""}
      </p>

      <div className="kural-kart" style={{ padding: 16 }}>
        <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
          <div style={{ fontSize: 13, color: "var(--metin-2)", lineHeight: 1.45 }}>
            <strong>Sephora:</strong> <code>TOTAL</code> → 0-MAĞAZA · kategori TOTAL’ler ·
            KANEBO→SENSAI.
            <br />
            <strong>Communite:</strong> marka whitelist (eşleştirme sekmesi) · TOPLAM→SAÇ.
            <br />
            <strong>Sevil / Boyner / Beymen:</strong>{" "}
            <Link href="/demo-magaza-eslestirme">Mağaza Eşleştirme</Link> · Boyner’de eşleşmeyen /
            pasif mağaza üretilmez.
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Ham sıralama dosyaları (çoklu)</span>
            <input
              type="file"
              multiple
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setDosyalar([...e.target.files])}
            />
            {dosyalar.length > 0 && (
              <small style={{ color: "var(--metin-2)" }}>
                {dosyalar.length} dosya: {dosyalar.map((f) => f.name).join(", ")}
              </small>
            )}
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Zeops ham data (zorunlu)</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setZeops(e.target.files?.[0] || null)}
            />
            <small style={{ color: "var(--metin-2)" }}>
              Zeops’ta olmayan mağaza sıralamadan silinir. Sell-out ile aynı Zeops dosyası.
            </small>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Dönem (YYYY-MM)</span>
            <input
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              placeholder="2026-08"
              style={{ maxWidth: 160, padding: "8px 10px" }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={yukleniyor} onClick={normalizeEt}>
              {yukleniyor ? "Üretiliyor…" : "Üret + Excel indir"}
            </button>
            <Link href="/demo-magaza-eslestirme" className="btn" style={{ textDecoration: "none" }}>
              Mağaza eşleştirme
            </Link>
          </div>
        </div>
      </div>

      {hata && (
        <div className="kural-bildirim hata" style={{ marginTop: 12 }}>
          <span>!</span>
          {hata}
        </div>
      )}

      {Array.isArray(sonuc?.uyari) && sonuc.uyari.length > 0 && (
        <div className="kural-bildirim" style={{ marginTop: 12 }}>
          {sonuc.uyari.join(" · ")}
        </div>
      )}

      {sonuc && (
        <ExcelOnizleme
          baslik="Arcon Sıralama Data"
          satirSayisi={sonuc.satirSayisi}
          satirlari={sonuc.onizleme}
          xlsxUrl={`/api/demo/siralam/xlsx?ym=${encodeURIComponent(yearMonth || "demo")}&t=${Date.now()}`}
          dosyaAdi={`arcon_siralam_${yearMonth || "demo"}.xlsx`}
          ozet={kanalOzet}
        />
      )}
    </div>
  );
}
