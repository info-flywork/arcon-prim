"use client";

import { useState } from "react";

const OZET_HEADERS = ["mağaza prim", "Prim Hedef", "Toplam Ağu.26"];

function indirXlsxUrl(url, dosyaAdi) {
  if (!url) return;
  const ad = dosyaAdi || "arcon_hedef.xlsx";
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
  if (typeof v === "number") return v.toLocaleString("tr-TR");
  return String(v);
}

function toplamSatirMi(r) {
  return / Toplam$/i.test(String(r?.["mağaza prim"] || ""));
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
            {Number(satirSayisi || 0).toLocaleString("tr-TR")} satır · sheet: Hedef Özet (Birol sağ)
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
                {OZET_HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const toplam = toplamSatirMi(r);
                return (
                  <tr
                    key={i}
                    style={toplam ? { background: "#fff566", fontWeight: 700 } : undefined}
                  >
                    <td className="demo-excel-nr">{i + 1}</td>
                    {OZET_HEADERS.map((h) => {
                      const val = hucre(r?.[h]);
                      return (
                        <td key={h} title={val || ""}>
                          {val ?? <span className="demo-excel-bos">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export default function HedefPanel() {
  const [dosyalar, setDosyalar] = useState([]);
  const [yearMonth, setYearMonth] = useState("2026-08");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [sonuc, setSonuc] = useState(null);

  async function normalizeEt() {
    if (!dosyalar.length) {
      setHata("En az bir ham hedef dosyası seç.");
      return;
    }
    setYukleniyor(true);
    setHata(null);
    try {
      const fd = new FormData();
      for (const f of dosyalar) fd.append("dosyalar", f);
      if (yearMonth) fd.append("yearMonth", yearMonth);
      const r = await fetch("/api/demo/hedef/normalize", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.hata || "Normalize başarısız");
      setSonuc(j);
      const ym = yearMonth || "demo";
      indirXlsxUrl(
        `/api/demo/hedef/xlsx?ym=${encodeURIComponent(ym)}&t=${Date.now()}`,
        `arcon_hedef_${ym}.xlsx`
      );
    } catch (e) {
      setHata(e.message || String(e));
    } finally {
      setYukleniyor(false);
    }
  }

  const kanalOzet =
    Array.isArray(sonuc?.kanallar) && sonuc.kanallar.length
      ? sonuc.kanallar.map((k) => `${k.kanal || "?"}:${k.satirSayisi ?? 0}`).join(" · ")
      : "";

  return (
    <div className="yeni-prim-panel">
      <p className="yeni-prim-panel-ozet">
        Sol ham (A–F) → <strong>Birol sağ özet</strong> (
        <code>mağaza prim × Prim Hedef + Toplam</code>, sarı satırlar). Excel’de 1. sheet: Hedef
        Özet · 2. sheet: marka detay. Local demo; DB’ye yazılmaz.
        {sonuc?.kaydedildiAt
          ? ` · Son üretim: ${new Date(sonuc.kaydedildiAt).toLocaleString("tr-TR")}`
          : ""}
      </p>

      <div className="kural-kart" style={{ padding: 16 }}>
        <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
          <div style={{ fontSize: 13, color: "var(--metin-2)", lineHeight: 1.45 }}>
            <strong>Girdi:</strong> BAYİ, MAĞAZA ADI, mağaza prim, MARKA, Prim Hedef, Toplam Ağu.26
            <br />
            <strong>Çıktı:</strong> mağaza × Prim Hedef groupby + <code>… Toplam</code> (Birol sarı
            alan). Tutarlar <code>662.250</code> formatında.
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Ham hedef dosyası</span>
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
            <span style={{ fontWeight: 700, fontSize: 14 }}>Dönem (YYYY-MM)</span>
            <input
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              placeholder="2026-08"
              style={{ maxWidth: 160, padding: "8px 10px" }}
            />
          </label>

          <button type="button" className="btn" disabled={yukleniyor} onClick={normalizeEt}>
            {yukleniyor ? "Üretiliyor…" : "Üret + Excel indir"}
          </button>
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
          baslik="Birol · Hedef Özet"
          satirSayisi={sonuc.ozetSatirSayisi || sonuc.satirSayisi}
          satirlari={sonuc.ozetOnizleme || sonuc.onizleme}
          xlsxUrl={`/api/demo/hedef/xlsx?ym=${encodeURIComponent(yearMonth || "demo")}&t=${Date.now()}`}
          dosyaAdi={`arcon_hedef_${yearMonth || "demo"}.xlsx`}
          ozet={kanalOzet}
        />
      )}
    </div>
  );
}
