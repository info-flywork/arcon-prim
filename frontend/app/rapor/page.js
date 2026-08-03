"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import DonemSec from "../components/DonemSec";

const tl = (v) => {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (n === 0) return "-TL.";
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) + "TL.";
};
const yzd = (v) => {
  if (v == null) return "";
  return (Number(v) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) + "%";
};

// Excel Prim Çalışma2 pivotunun kolon başlıkları (E..Y)
const KOLONLAR = [
  { key: "uzman", ad: "Satır Etiketleri", tip: "metin", genislik: 180 },
  { key: "marka_grup", ad: "Marka Grup", tip: "metin", genislik: 130 },
  { key: "magaza", ad: "Sell-Out Mağaza", tip: "metin", genislik: 180 },
  { key: "satis_grup", ad: "Satış Grup", tip: "metin", genislik: 130 },
  { key: "E", ad: "Prime Esas Toplam Tutar", tip: "para" },
  { key: "F", ad: "Prim % 1", tip: "para" },
  { key: "G", ad: "Sensai Sephora +\nSisley Cadde + %1", tip: "para" },
  { key: "H", ad: "Sephora Bağdat + Beymen + % 0,05", tip: "para" },
  { key: "I", ad: "Toplam Sevil LP", tip: "para" },
  { key: "J", ad: "Toplam Toplam", tip: "para" },
  { key: "K", ad: "Mayıs\nHedefler", tip: "para" },
  { key: "L", ad: "Hedef\nPrim ( % 0,50 )", tip: "para" },
  { key: "M", ad: "Dior Mağaza\n1.Lik  % 0,50", tip: "para" },
  { key: "N", ad: "Dior Makyaj\n1. lik % 0,33", tip: "para" },
  { key: "O", ad: "Dior Parfüm\nİlk 2 % 0,33", tip: "para" },
  { key: "P", ad: "Dior Cilt Bakım\nİlk 3 % 0,33", tip: "para" },
  { key: "Q", ad: "LP Mağaza - CİLT Bakım\n1. LİK Ve Diğer Sıralama Primleri", tip: "para" },
  { key: "R", ad: "Parfüm % 1", tip: "para" },
  { key: "S", ad: "Parfüm % 0,5", tip: "para" },
  { key: "T", ad: "Parfüm % 0,5", tip: "para" },
  { key: "U", ad: "Nisan' dan\nKalan", tip: "para" },
  { key: "V", ad: "Toplam Primden\nEk Prim ( % 0,20 )", tip: "para" },
  { key: "W", ad: "Toplam\nPrim", tip: "para" },
  { key: "X", ad: "Prim\nAçıklama", tip: "metin" },
  { key: "Y", ad: "Toplam Prim\nYüzdesi", tip: "yuzde" },
];

export default function PrimRaporu() {
  const [donem, setDonem] = useState(null);
  const [veri, setVeri] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    if (!donem) return;
    setYukleniyor(true);
    fetch(`/api/prim-raporu/${donem}`)
      .then((r) => r.json())
      .then((d) => { setVeri(d); setYukleniyor(false); })
      .catch(() => setYukleniyor(false));
  }, [donem]);

  function hucreDeger(satir, kolon) {
    if (kolon.tip === "metin") return satir[kolon.key] || "";
    const v = satir[kolon.key];
    if (v == null) return "";
    if (kolon.tip === "yuzde") return yzd(v);
    return tl(v);
  }

  function satirStili(satir) {
    if (satir.tip === "genel_toplam") return {
      background: "#FFE699", fontWeight: 800, borderTop: "2px solid #000",
    };
    if (satir.tip === "uzman_toplam") return {
      background: "#FFF2CC", fontWeight: 700,
    };
    return {};
  }

  function excelIndir() {
    // Backend'in xlsx endpoint'i renkli Excel dosyası üretir
    window.location.href = `/api/prim-raporu/${donem}/xlsx`;
  }

  return (
    <div className="rapor-sayfa">
      <Link href={donem ? `/yukle?donem=${donem}` : "/yukle"} className="rapor-geri">
        ← Prim hesaplamaya dön
      </Link>

      <section className="rapor-hero rapor-hero-genel">
        <div className="rapor-hero-ikon">
          <svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
        </div>
        <div>
          <span className="rapor-kicker">Dönem raporu</span>
          <h2>Prim Çalışma Raporu</h2>
          <p>Excel Prim Çalışma2 pivotunun birebir kopyası. Her prim kalemini ayrıştırılmış görünümle inceleyin.</p>
        </div>
      </section>

      <div className="rapor-araclar">
        <DonemSec value={donem} onChange={setDonem} />
        {veri?.satirlar?.length > 0 && (
          <button className="btn rapor-indir" onClick={excelIndir}>
            <span>↓</span> Excel olarak indir
          </button>
        )}
      </div>

      {yukleniyor && <div className="mesaj notr" style={{ marginTop: 12 }}>Yükleniyor...</div>}

      {veri && veri.satirlar && veri.satirlar.length > 0 && (
        <div style={{
          marginTop: 16,
          border: "1px solid #333",
          borderRadius: 4,
          overflow: "auto",
          background: "#fff",
        }}>
          <table style={{
            borderCollapse: "collapse",
            fontSize: 11,
            fontFamily: "Calibri, Arial, sans-serif",
            width: "100%",
            minWidth: 2400,
          }}>
            <thead>
              {/* Üst filtre bilgisi (Excel'deki gibi) */}
              <tr style={{ background: "#F5F5F5", fontSize: 10 }}>
                <th colSpan={4} style={{ padding: 4, textAlign: "left", border: "1px solid #999" }}>
                  <div>Mağaza Toplam Satış: (Tümü)</div>
                  <div>Marka: (Tümü)</div>
                  <div>SATIŞ TÜRÜ: (Tümü)</div>
                  <div>Prime Esas Toplam Tutar: (Birden Çok Öğe)</div>
                </th>
                <th colSpan={21} style={{ border: "1px solid #999" }}></th>
              </tr>
              {/* Ana başlıklar — siyah zemin turuncu yazı (Excel görselliği) */}
              <tr>
                {KOLONLAR.map((k) => (
                  <th key={k.key} style={{
                    background: "#1F1F1F", color: "#FFC000", padding: "8px 6px",
                    border: "1px solid #333", whiteSpace: "pre-line",
                    minWidth: k.genislik || 90, textAlign: "center",
                    fontSize: 10, fontWeight: 700, lineHeight: 1.2,
                  }}>
                    {k.ad}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {veri.satirlar.map((s, i) => (
                <tr key={i} style={{ ...satirStili(s) }}>
                  {KOLONLAR.map((k) => {
                    const isSayi = k.tip === "para" || k.tip === "yuzde";
                    return (
                      <td key={k.key} style={{
                        border: "1px solid #ccc", padding: "4px 6px",
                        textAlign: isSayi ? "right" : "left",
                        whiteSpace: k.tip === "metin" ? "nowrap" : "normal",
                        color: "#000",
                      }}>
                        {hucreDeger(s, k)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {donem && veri?.satirlar?.length === 0 && (
        <div className="rapor-bos">
          <span>∿</span>
          <h3>Henüz rapor oluşmadı</h3>
          <p>Bu dönem için prim sonucu bulunmuyor.</p>
          <Link href="/yukle" className="btn">Prim hesaplamaya git →</Link>
        </div>
      )}
    </div>
  );
}
