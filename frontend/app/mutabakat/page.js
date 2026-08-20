"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import DonemSec from "../components/DonemSec";

const tl = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 }));
const tlk = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " TL");
const say = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR"));
const tarih = (v) => (!v ? "" : new Date(v).toLocaleDateString("tr-TR"));

function durumRozet(aciklama) {
  if (!aciklama) return { sinif: "notr", metin: "—" };
  if (aciklama === "Ok") return { sinif: "ok", metin: "Ok" };
  if (aciklama.startsWith("Mükerrer") || aciklama.startsWith("Mukerrer")) return { sinif: "hata", metin: "Mükerrer Giriş" };
  if (aciklama.startsWith("Mağazada Eşleşmeyen Satış")) return { sinif: "hata", metin: "Mağazada Eşleşmeyen Satış" };
  return { sinif: "notr", metin: aciklama };
}

export default function Mutabakat() {
  const [donem, setDonem] = useState(null);
  const [veri, setVeri] = useState({ satirlar: [], ozet: {}, secilenOzet: null });
  const [markalar, setMarkalar] = useState([]);
  const [uzmanlar, setUzmanlar] = useState([]);
  const [magazalar, setMagazalar] = useState([]);
  const [filtre, setFiltre] = useState({ uzman: "", magaza: "", marka: "", durum: "", q: "" });
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    fetch("/api/markalar").then((r) => r.json()).then(setMarkalar);
    fetch("/api/uzmanlar").then((r) => r.json()).then(setUzmanlar);
    fetch("/api/magazalar").then((r) => r.json()).then(setMagazalar);
  }, []);

  useEffect(() => {
    if (!donem) return;
    setYukleniyor(true);
    const q = new URLSearchParams(Object.entries(filtre).filter(([, v]) => v)).toString();
    fetch(`/api/mutabakat/${donem}${q ? `?${q}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setVeri({
          satirlar: Array.isArray(d?.satirlar) ? d.satirlar : [],
          ozet: d?.ozet && typeof d.ozet === "object" ? d.ozet : {},
          secilenOzet: Array.isArray(d?.secilenOzet) ? d.secilenOzet : null,
          hata: d?.hata || null,
        });
        setYukleniyor(false);
      })
      .catch(() => {
        setVeri({ satirlar: [], ozet: {}, secilenOzet: null, hata: "Mutabakat verisi alınamadı" });
        setYukleniyor(false);
      });
  }, [donem, filtre]);

  const satirlar = Array.isArray(veri.satirlar) ? veri.satirlar : [];

  const kartlar = useMemo(() => {
    const o = veri.ozet || {};
    return [
      { etiket: "Toplam Satır", deger: say(o.toplam), alt: `${tlk(o.toplam_esas)} prime esas` },
      { etiket: "Ok", deger: say(o.ok_), alt: "temiz eşleşme" },
      { etiket: "Mükerrer Giriş", deger: say(o.mukerrer), alt: "fazla beyan" },
      { etiket: "Sell-out yok", deger: say(o.sellout_yok), alt: "prim yok" },
    ];
  }, [veri.ozet]);

  return (
    <div>
      <h2>Satır Kontrol (Maviler)</h2>
      <p className="aciklama">
        Uzmanların beyanlarını mağaza satış verisiyle karşılaştıran satır bazlı kontrol tablosu. Her satır için
        sistem, o beyan için prim ödenip ödenmeyeceğini belirler: <b>Ok</b>,
        <b> Mükerrer Giriş</b> ya da <b>Mağazada Eşleşmeyen Satış</b>. Excel'deki "Çalışılmış İlk Kısım (Maviler)"
        sekmesinin sistem tarafından üretilen karşılığı.
      </p>
      <DonemSec value={donem} onChange={setDonem} />
      {donem && (
        <>
          <div className="kartlar">
            {kartlar.map((k) => (
              <div className="kart" key={k.etiket}>
                <div className="etiket">{k.etiket}</div>
                <div className="deger">{k.deger}</div>
                <div className="alt">{k.alt}</div>
              </div>
            ))}
          </div>

          <div className="yukle-kart">
            <div className="satir">
              <input type="text" placeholder="Ürün, UNIQ kod, uzman, mağaza ara..." style={{ width: 320 }}
                value={filtre.q} onChange={(e) => setFiltre({ ...filtre, q: e.target.value })} />
              <select value={filtre.durum} onChange={(e) => setFiltre({ ...filtre, durum: e.target.value })}>
                <option value="">Tüm durumlar</option>
                <option value="ok">Ok</option>
                <option value="mukerrer">Mükerrer Giriş</option>
                <option value="sellout_yok">Mağazada Eşleşmeyen Satış</option>
              </select>
              <select value={filtre.uzman} onChange={(e) => setFiltre({ ...filtre, uzman: e.target.value })}>
                <option value="">Tüm uzmanlar</option>
                {uzmanlar.map((u) => <option key={u.id} value={u.id}>{u.ad_soyad}</option>)}
              </select>
              <select value={filtre.magaza} onChange={(e) => setFiltre({ ...filtre, magaza: e.target.value })}>
                <option value="">Tüm mağazalar</option>
                {magazalar.map((m) => <option key={m.id} value={m.id}>{m.prim_magaza}</option>)}
              </select>
              <select value={filtre.marka} onChange={(e) => setFiltre({ ...filtre, marka: e.target.value })}>
                <option value="">Tüm markalar</option>
                {markalar.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <button className="btn ikincil" onClick={() => setFiltre({ uzman: "", magaza: "", marka: "", durum: "", q: "" })}>
                Filtreyi sıfırla
              </button>
              <a className="btn" href={`/api/mutabakat/${donem}/export`} download>Excel'e aktar</a>
            </div>
          </div>

          {/* Uzman seçildiyse toplam prim özetini göster */}
          {veri.secilenOzet && veri.secilenOzet.length > 0 && (
            <div className="yukle-kart" style={{ background: "var(--vurgu-acik)", borderColor: "rgba(37,99,235,.2)" }}>
              <h3>{veri.secilenOzet[0].ad_soyad} — bu döneme kadar hesaplanan prim</h3>
              <table>
                <thead>
                  <tr>
                    <th>Mağaza</th>
                    <th className="sag">Prime Esas</th>
                    <th className="sag">Prim %</th>
                    <th className="sag">Satış Primi</th>
                    <th className="sag">Hedef</th>
                    <th className="sag">Sıralama</th>
                    <th className="sag">Bonus</th>
                    <th className="sag">Ek</th>
                    <th className="sag">Toplam Prim</th>
                  </tr>
                </thead>
                <tbody>
                  {veri.secilenOzet.map((s, i) => (
                    <tr key={i}>
                      <td>{s.prim_magaza}</td>
                      <td className="sag">{tlk(s.prime_esas_toplam)}</td>
                      <td className="sag">%{tl(s.toplam_oran)}</td>
                      <td className="sag">{tlk(s.satis_prim)}</td>
                      <td className="sag">{tlk(s.hedef_prim)}</td>
                      <td className="sag">{tlk(s.siralama_prim)}</td>
                      <td className="sag">{tlk(s.bonus_prim)}</td>
                      <td className="sag">{tlk(s.ek_prim)}</td>
                      <td className="sag"><b>{tlk(s.toplam_prim)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {yukleniyor && <div className="mesaj notr">Yükleniyor...</div>}
          {!yukleniyor && veri.hata && (
            <div className="mesaj hata">{veri.hata}</div>
          )}
          {!yukleniyor && !veri.hata && satirlar.length === 0 && (
            <div className="mesaj hata">
              Bu dönem için hesap sonucu yok. <Link href="/yukle">Prim Hesaplama</Link>
            </div>
          )}
          {satirlar.length > 0 && (
            <>
              <p className="aciklama" style={{ marginTop: 8 }}>
                {satirlar.length.toLocaleString("tr-TR")} satır gösteriliyor
                {satirlar.length === 5000 && " (ilk 5.000, filtre daraltın ya da Excel'e aktarın)"}.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: 1800, fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Karar</th>
                      <th>Uzman</th>
                      <th>Marka Grup</th>
                      <th>Satış Tarih</th>
                      <th>Mağaza (Beyan)</th>
                      <th>Sell-Out Mağaza</th>
                      <th>Barkod</th>
                      <th>Kod</th>
                      <th>Etiket</th>
                      <th>UNIQ Kod</th>
                      <th>Marka</th>
                      <th>Uniq Ad</th>
                      <th className="sag">Uzman Adet</th>
                      <th className="sag">Prim Adet</th>
                      <th className="sag">Birim Ciro</th>
                      <th className="sag">Prime Esas</th>
                      <th className="sag">Prim %</th>
                      <th className="sag">Satır Prim TL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {satirlar.map((s) => {
                      const d = durumRozet(s.aciklama);
                      return (
                        <tr key={s.id}>
                          <td><span className={`rozet ${d.sinif}`}>{d.metin}</span></td>
                          <td>{s.uzman}</td>
                          <td>{s.marka_grup || "—"}</td>
                          <td>{tarih(s.satis_tarihi)}</td>
                          <td>{s.beyan_magaza || "—"}</td>
                          <td>{s.sellout_magaza || "—"}</td>
                          <td>{s.beyan_barkod || "—"}</td>
                          <td>{s.beyan_kod || "—"}</td>
                          <td>{s.etiket || "—"}</td>
                          <td>{s.uniq_kod || "—"}</td>
                          <td>{s.marka || "—"}</td>
                          <td>{s.uniq_ad || "—"}</td>
                          <td className="sag">{s.beyan_adet}</td>
                          <td className="sag">{s.prim_adet}</td>
                          <td className="sag">{tl(s.birim_ciro)}</td>
                          <td className="sag">{tl(s.prime_esas_tutar)}</td>
                          <td className="sag">{s.uzman_prim_oran != null ? "%" + tl(s.uzman_prim_oran) : "—"}</td>
                          <td className="sag"><b>{tl(s.satir_prim_tl)}</b></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
