"use client";
import { useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import DonemSec from "../components/DonemSec";

const tl = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " TL");
const pct = (v) => (v == null ? "—" : "%" + Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 }));

export default function Rapor() {
  const [donem, setDonem] = useState(null);
  const [rows, setRows] = useState([]);
  const [detay, setDetay] = useState(null);
  const [acikUzman, setAcikUzman] = useState(null);

  useEffect(() => {
    if (!donem) return;
    setDetay(null);
    setAcikUzman(null);
    fetch(`/api/rapor/ozet/${donem}`).then((r) => r.json()).then(setRows);
  }, [donem]);

  const gruplar = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = r.uzman_id;
      if (!map.has(key)) {
        map.set(key, {
          uzman_id: r.uzman_id,
          ad_soyad: r.ad_soyad,
          magazalar: [],
          toplam: {
            prime_esas_toplam: 0,
            satis_prim: 0,
            hedef_prim: 0,
            siralama_prim: 0,
            bonus_prim: 0,
            ek_prim: 0,
            toplam_prim: 0,
          },
        });
      }
      const g = map.get(key);
      g.magazalar.push(r);
      g.toplam.prime_esas_toplam += Number(r.prime_esas_toplam || 0);
      g.toplam.satis_prim += Number(r.satis_prim || 0);
      g.toplam.hedef_prim += Number(r.hedef_prim || 0);
      g.toplam.siralama_prim += Number(r.siralama_prim || 0);
      g.toplam.bonus_prim += Number(r.bonus_prim || 0);
      g.toplam.ek_prim += Number(r.ek_prim || 0);
      g.toplam.toplam_prim += Number(r.toplam_prim || 0);
    }
    return [...map.values()].sort((a, b) =>
      String(a.ad_soyad).localeCompare(String(b.ad_soyad), "tr")
    );
  }, [rows]);

  const genelToplam = rows.reduce((t, r) => t + Number(r.toplam_prim || 0), 0);

  async function detayAc(uzmanId) {
    setAcikUzman(uzmanId);
    const r = await fetch(`/api/rapor/detay/${donem}/${uzmanId}`);
    setDetay(await r.json());
  }

  function csvIndir() {
    const bas = [
      "Uzman", "Mağaza", "Bayi", "Senaryo", "Prime Esas",
      "Satış Primi", "Hedef Primi", "Sıralama Primi", "Bonus", "Ek Prim", "Toplam %", "Toplam Prim",
    ];
    const satirlar = [];
    for (const g of gruplar) {
      for (const r of g.magazalar) {
        satirlar.push([
          r.ad_soyad, r.prim_magaza, r.bayi, r.bolum_adi,
          r.prime_esas_toplam, r.satis_prim, r.hedef_prim,
          r.siralama_prim, r.bonus_prim, r.ek_prim, r.toplam_oran, r.toplam_prim,
        ]);
      }
      satirlar.push([
        `Toplam ${g.ad_soyad}`, "", "", "",
        g.toplam.prime_esas_toplam, g.toplam.satis_prim, g.toplam.hedef_prim,
        g.toplam.siralama_prim, g.toplam.bonus_prim, g.toplam.ek_prim, "",
        g.toplam.toplam_prim,
      ]);
    }
    const csv = [bas, ...satirlar].map((s) => s.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "prim_raporu.csv";
    a.click();
  }

  return (
    <div>
      <h2>Prim Raporu</h2>
      <p className="aciklama">
        Excel’deki gibi <b>uzman → mağaza mağaza</b> kırılım. Her uzmanın altında çalıştığı mağazalar
        ayrı satır; altta <b>Toplam [Uzman]</b> satırında o uzmanın toplam primi.
      </p>
      <DonemSec value={donem} onChange={setDonem} />
      {rows.length > 0 && (
        <div className="satir" style={{ marginTop: 12 }}>
          <span className="rozet ok">{gruplar.length} uzman</span>
          <span className="rozet notr">{rows.length} mağaza satırı</span>
          <span className="rozet notr">Genel toplam prim: {tl(genelToplam)}</span>
          <button className="btn ikincil" onClick={csvIndir}>CSV indir</button>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Uzman / Mağaza</th>
            <th>Senaryo</th>
            <th className="sag">Prime Esas Ciro</th>
            <th className="sag">Satış Primi</th>
            <th className="sag">Hedef Primi</th>
            <th className="sag">Sıralama Primi</th>
            <th className="sag">Bonus</th>
            <th className="sag">Ek Prim</th>
            <th className="sag">%</th>
            <th className="sag">Toplam Prim</th>
          </tr>
        </thead>
        <tbody>
          {gruplar.map((g) => (
            <Fragment key={g.uzman_id}>
              {g.magazalar.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => detayAc(r.uzman_id)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.ad_soyad}</div>
                    <div style={{ fontSize: 13, color: "var(--metin-2)" }}>{r.prim_magaza}</div>
                  </td>
                  <td>{r.marka_grubu_adi || r.bolum_adi}</td>
                  <td className="sag">{tl(r.prime_esas_toplam)}</td>
                  <td className="sag">{tl(r.satis_prim)}</td>
                  <td className="sag">{tl(r.hedef_prim)}</td>
                  <td className="sag">{tl(r.siralama_prim)}</td>
                  <td className="sag">{tl(r.bonus_prim)}</td>
                  <td className="sag">{tl(r.ek_prim)}</td>
                  <td className="sag">{pct(r.toplam_oran)}</td>
                  <td className="sag"><b>{tl(r.toplam_prim)}</b></td>
                </tr>
              ))}
              <tr
                style={{ background: "var(--vurgu-acik, #f0f5ff)", fontWeight: 600 }}
                onClick={() => detayAc(g.uzman_id)}
              >
                <td colSpan={2}>
                  Toplam {g.ad_soyad}
                  <span style={{ fontWeight: 500, color: "var(--metin-2)", marginLeft: 8 }}>
                    ({g.magazalar.length} mağaza)
                  </span>
                </td>
                <td className="sag">{tl(g.toplam.prime_esas_toplam)}</td>
                <td className="sag">{tl(g.toplam.satis_prim)}</td>
                <td className="sag">{tl(g.toplam.hedef_prim)}</td>
                <td className="sag">{tl(g.toplam.siralama_prim)}</td>
                <td className="sag">{tl(g.toplam.bonus_prim)}</td>
                <td className="sag">{tl(g.toplam.ek_prim)}</td>
                <td className="sag">
                  {g.toplam.prime_esas_toplam > 0
                    ? pct((g.toplam.toplam_prim / g.toplam.prime_esas_toplam) * 100)
                    : "—"}
                </td>
                <td className="sag"><b>{tl(g.toplam.toplam_prim)}</b></td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>

      {donem && rows.length === 0 && (
        <div className="mesaj hata">
          Bu dönem için hesap sonucu yok.{" "}
          <Link href="/yukle" style={{ textDecoration: "underline", fontWeight: 600 }}>
            Veri Yükleme → Primleri Hesapla
          </Link>
        </div>
      )}

      {detay?.ozet && acikUzman && (
        <div className="yukle-kart" style={{ marginTop: 24 }}>
          <h3>{detay.ozet.ad_soyad} — Kural değerlendirmesi</h3>
          <details>
            <summary>Kural detayı (JSON)</summary>
            <pre className="json">{JSON.stringify(
              typeof detay.ozet.detay_json === "string" ? JSON.parse(detay.ozet.detay_json) : detay.ozet.detay_json,
              null, 2)}</pre>
          </details>
          <h3 style={{ marginTop: 14 }}>Satır detayı (ilk 100)</h3>
          <table>
            <thead>
              <tr>
                <th>Ürün</th><th>Marka</th><th>Mağaza</th>
                <th className="sag">Beyan</th><th className="sag">Prim Adet</th>
                <th className="sag">Birim Ciro</th><th className="sag">Prime Esas</th><th>Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {(detay.satirlar || []).slice(0, 100).map((s) => (
                <tr key={s.id}>
                  <td>{s.uniq_urun_adi || s.urun_adi}</td>
                  <td>{s.marka}</td>
                  <td>{s.prim_magaza}</td>
                  <td className="sag">{s.beyan_adet}</td>
                  <td className="sag">{s.prim_adet}</td>
                  <td className="sag">{tl(s.birim_ciro)}</td>
                  <td className="sag">{tl(s.prime_esas_tutar)}</td>
                  <td>{s.aciklama || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
