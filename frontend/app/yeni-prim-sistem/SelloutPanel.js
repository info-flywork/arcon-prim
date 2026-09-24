"use client";

import { useEffect, useMemo, useState } from "react";

const ARCON_FULL_HEADERS = [
  "Bayi",
  "Ürün Adı",
  "Arcon Referans",
  "Arcon Barkod",
  "Adet",
  "Ciro Kdv Dahil",
  "Ciro Kdv Hariç",
  "Mağaza",
  "Prim Mağaza",
  "Mağaza Kod",
  "Ay Sıra",
  "Ay",
  "Yıl",
  "Arcon Marka",
  "Marka Grup",
  "Ürün Grubu",
  "Şehir",
  "Bölge",
  "Arcon Ref Adı",
  "Sektör Adı",
  "Bölge2",
  "Rapor Bayi",
  "Ürün Grubu Detay",
  "Cinsiyet",
];

function indirXlsxUrl(url, dosyaAdi) {
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = dosyaAdi || "arcon_sellout.xlsx";
  a.click();
}

function indirXlsx(base64, dosyaAdi) {
  if (!base64) return;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dosyaAdi;
  a.click();
  URL.revokeObjectURL(url);
}

function hucre(v) {
  if (v == null || v === "") return null;
  return String(v);
}

function ExcelOnizleme({ baslik, satirSayisi, satirlari, xlsxBase64, xlsxUrl, dosyaAdi, ozet }) {
  const rows = Array.isArray(satirlari) ? satirlari : [];
  const indirilebilir = Boolean(xlsxUrl || xlsxBase64);

  return (
    <article className="kural-kart" style={{ marginTop: 16 }}>
      <header style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="kural-kart-simge">xlsx</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: 0 }}>{baslik}</h3>
          <div style={{ fontSize: 13, color: "var(--metin-2)", marginTop: 4 }}>
            {Number(satirSayisi || 0).toLocaleString("tr-TR")} satır · sheet: Sell-out Data
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
          disabled={!indirilebilir}
          onClick={() => {
            if (xlsxUrl) indirXlsxUrl(xlsxUrl, dosyaAdi);
            else indirXlsx(xlsxBase64, dosyaAdi);
          }}
          style={{ whiteSpace: "nowrap" }}
        >
          Excel indir (.xlsx)
        </button>
      </header>

      {rows.length === 0 ? (
        <div style={{ padding: "12px 16px 20px", color: "var(--metin-2)" }}>
          Önizleme yok — Excel indirmeyi dene.
        </div>
      ) : (
        <div className="demo-excel-kapsayici">
          <table className="demo-excel-tablo">
            <thead>
              <tr>
                <th className="demo-excel-nr">#</th>
                {ARCON_FULL_HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="demo-excel-nr">{i + 1}</td>
                  {ARCON_FULL_HEADERS.map((h) => {
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

export default function SelloutPanel() {
  const [dosyalar, setDosyalar] = useState([]);
  const [zeops, setZeops] = useState(null);
  const [yearMonth, setYearMonth] = useState("2026-08");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [refYukleniyor, setRefYukleniyor] = useState(false);
  const [sonuc, setSonuc] = useState(null);
  const [referans, setReferans] = useState(null);
  const [hata, setHata] = useState(null);
  const [kayitYukleniyor, setKayitYukleniyor] = useState(true);

  const ozetSatir = useMemo(() => {
    const parca = sonuc?.parcalar?.length
      ? sonuc.parcalar
          .map((p) => `${p.kanal}: ${p.ozet?.kanonik ?? 0}/${p.ozet?.giren ?? 0}`)
          .join(" · ")
      : "";
    const z = sonuc?.ozet;
    const zeops =
      z && z.atlananZeopsSatir
        ? `Zeops dışı ${z.atlananZeopsMagaza} mağaza / ${Number(z.atlananZeopsSatir).toLocaleString("tr-TR")} satır silindi`
        : z?.zeopsMagaza
          ? `Zeops ${z.zeopsMagaza} mağaza`
          : "";
    return [parca, zeops].filter(Boolean).join(" · ") || null;
  }, [sonuc]);

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const r = await fetch("/api/demo/sellout/sonuc");
        if (r.status === 404) return;
        const j = await r.json();
        if (!r.ok) throw new Error(j.hata || "Kayıt yüklenemedi");
        if (!iptal) {
          setSonuc(j);
          if (j.yearMonth) setYearMonth(j.yearMonth);
        }
      } catch {
        /* sessiz */
      } finally {
        if (!iptal) setKayitYukleniyor(false);
      }
    })();
    return () => {
      iptal = true;
    };
  }, []);

  function parseYm(ym) {
    const m = String(ym || "").match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return null;
    return { yil: Number(m[1]), ay: Number(m[2]) };
  }

  async function normalizeEt() {
    if (!dosyalar.length) {
      setHata("En az bir ham sell-out dosyası seçin.");
      return;
    }
    if (!zeops) {
      setHata("Zeops ham data da seç. Zeops’ta olmayan mağaza elenir.");
      return;
    }
    setYukleniyor(true);
    setHata(null);
    setSonuc(null);
    try {
      const fd = new FormData();
      for (const f of dosyalar) fd.append("dosyalar", f);
      fd.append("zeops", zeops);
      if (yearMonth) fd.append("yearMonth", yearMonth);
      const r = await fetch("/api/demo/sellout/normalize", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.hata || "Normalize başarısız");
      setSonuc(j);
      if (j.xlsxHazir || j.xlsxIndir) {
        indirXlsxUrl(
          `${j.xlsxIndir || "/api/demo/sellout/xlsx"}?ym=${encodeURIComponent(yearMonth || "demo")}`,
          `arcon_sellout_${yearMonth || "demo"}.xlsx`
        );
      } else {
        setHata("Excel üretilemedi — diskte xlsx yok.");
      }
    } catch (e) {
      setHata(e.message || String(e));
    } finally {
      setYukleniyor(false);
    }
  }

  async function dbReferansGetir() {
    const ym = parseYm(yearMonth);
    if (!ym) {
      setHata("DB referans için ay filtresi YYYY-MM olmalı (örn. 2026-08).");
      return;
    }
    setRefYukleniyor(true);
    setHata(null);
    setReferans(null);
    try {
      const qs = new URLSearchParams({ yil: String(ym.yil), ay: String(ym.ay) });
      const r = await fetch(`/api/demo/sellout/referans?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.hata || "Referans alınamadı");
      setReferans(j);
      if (j.xlsxBase64) {
        indirXlsx(
          j.xlsxBase64,
          `db_sellout_referans_${j.donem?.yil}-${String(j.donem?.ay).padStart(2, "0")}.xlsx`
        );
      }
    } catch (e) {
      setHata(e.message || String(e));
    } finally {
      setRefYukleniyor(false);
    }
  }

  return (
    <div className="yeni-prim-panel">
      <p className="yeni-prim-panel-ozet">
        Ham mağaza sell-out → Arcon tek format. Online / e-store (
        <code>ON-LINE</code>, <code>BEYMEN.COM</code>, <code>COMMUNITESTORE.COM</code>) atılır —
        prim yok. Local demo; dönem sellout tablosuna yazılmaz.
        {kayitYukleniyor ? " · Kayıt yükleniyor…" : ""}
        {!kayitYukleniyor && sonuc?.kaydedildiAt
          ? ` · Son kayıt: ${new Date(sonuc.kaydedildiAt).toLocaleString("tr-TR")}`
          : ""}
      </p>

      <div className="kural-kart" style={{ padding: 16 }}>
        <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Ham sell-out dosyaları (çoklu)</span>
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
              Zeops’ta olmayan mağaza sell-out’tan silinir. Sıralama ile aynı Zeops dosyası.
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
              {yukleniyor ? "Excel üretiliyor…" : "Üret + Excel indir"}
            </button>
            <button type="button" className="btn" disabled={refYukleniyor} onClick={dbReferansGetir}>
              {refYukleniyor ? "DB okunuyor…" : "DB referans Excel"}
            </button>
          </div>
        </div>
      </div>

      {hata && (
        <div className="kural-bildirim hata" style={{ marginTop: 12 }}>
          <span>!</span>
          {hata}
        </div>
      )}

      {sonuc && (
        <ExcelOnizleme
          baslik="Arcon Sell-out Excel"
          satirSayisi={sonuc.satirSayisi}
          satirlari={sonuc.ornek}
          xlsxUrl={
            sonuc.xlsxHazir
              ? `${sonuc.xlsxIndir || "/api/demo/sellout/xlsx"}?ym=${encodeURIComponent(yearMonth || "demo")}`
              : null
          }
          dosyaAdi={`arcon_sellout_${yearMonth || "demo"}.xlsx`}
          ozet={ozetSatir}
        />
      )}

      {referans && (
        <ExcelOnizleme
          baslik={`DB referans — ${referans.donem?.ad || "dönem"}`}
          satirSayisi={referans.satirSayisi}
          satirlari={referans.ornek}
          xlsxBase64={referans.xlsxBase64}
          dosyaAdi={`db_sellout_referans_${referans.donem?.yil}-${String(referans.donem?.ay).padStart(2, "0")}.xlsx`}
          ozet={`ciro ${Number(referans.ozet?.ciro || 0).toLocaleString("tr-TR")} TL`}
        />
      )}
    </div>
  );
}
