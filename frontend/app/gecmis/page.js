"use client";
import { useEffect, useState } from "react";

const ISLEM_RENK = { ekleme: "ok", guncelleme: "notr", silme: "hata", kilit: "notr", hesap: "ok" };
const tl = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " TL");
const say = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR"));

// Detay JSON'ı insan okunur özete çevir
function ozetle(kayit) {
  let d = kayit.detay;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch { return "—"; } }
  if (!d) return "—";
  const { tablo, islem } = kayit;

  if (tablo === "donem" && islem === "hesap") {
    return `${d.donem || "Dönem #" + kayit.kayit_id}: ${say(d.uzmanMagazaSayisi)} uzman-mağaza, ${say(d.satirSayisi)} satır, toplam prim ${tl(d.toplamPrim)}`;
  }
  if (tablo === "donem" && islem === "kilit") {
    const durumMetin = { acik: "açıldı", kapandi: "kapatıldı", hesaplandi: "hesaplandı" };
    return `${d.donem || "Dönem"} ${durumMetin[d.yeni_durum] || d.yeni_durum || d.durum}`;
  }
  if (tablo === "uzman_atama" && islem === "silme") {
    const s = d.silinen;
    if (!s) return "Atama silindi";
    return `${s.uzman || "?"} × ${s.magaza || "?"} — ${s.marka_grubu_adi || s.bolum_adi || "?"} ataması silindi`;
  }
  if (tablo === "uzman_atama" && islem === "ekleme") {
    const uzman = d.uzman || (d.uzman_id ? `uzman #${d.uzman_id}` : "?");
    const magaza = d.magaza || (d.magaza_id ? `mağaza #${d.magaza_id}` : "?");
    const senaryo = d.marka_grubu_adi || d.bolum_adi || (d.bolum_id ? `senaryo #${d.bolum_id}` : "?");
    const donem = d.donem ? ` · ${d.donem}` : "";
    const grup = d.grup_adi ? ` (${d.grup_adi})` : "";
    return `Yeni atama · ${uzman} × ${magaza} — ${senaryo}${grup}${donem}`;
  }
  if (tablo === "uzman_atama" && islem === "guncelleme") {
    const a = d.atama;
    if (!a) return "Atama güncellendi";
    const yeniSenaryo = d.yeni?.bolum_adi || (d.yeni?.bolum_id ? `senaryo #${d.yeni.bolum_id}` : null);
    return yeniSenaryo
      ? `${a.uzman} × ${a.magaza} atamasının senaryosu → ${yeniSenaryo}`
      : `${a.uzman} × ${a.magaza} ataması güncellendi`;
  }
  if (tablo === "magaza" && islem === "guncelleme") {
    const alanlar = [];
    if (d.yeni?.aktif !== undefined) alanlar.push(d.yeni.aktif ? "aktifleştirildi" : "pasifleştirildi");
    if (d.yeni?.prim_magaza) alanlar.push(`ad → "${d.yeni.prim_magaza}"`);
    if (d.yeni?.sehir) alanlar.push(`şehir → "${d.yeni.sehir}"`);
    return `${d.magaza || "Mağaza"}: ${alanlar.join(", ") || "güncellendi"}`;
  }
  if (tablo === "magaza" && islem === "ekleme") {
    return `Yeni mağaza: ${d.prim_magaza} (${d.bayi})`;
  }
  if (tablo === "uzman" && islem === "guncelleme") {
    const alanlar = [];
    if (d.yeni?.aktif !== undefined) alanlar.push(d.yeni.aktif ? "aktifleştirildi" : "pasifleştirildi");
    if (d.yeni?.ad_soyad) alanlar.push(`ad → "${d.yeni.ad_soyad}"`);
    return `${d.uzman || "Uzman"}: ${alanlar.join(", ") || "güncellendi"}`;
  }
  if (tablo === "uzman" && islem === "ekleme") {
    return `Yeni uzman: ${d.ad_soyad}`;
  }
  if (tablo === "prim_kural" && islem === "guncelleme") {
    if (d.eski?.prim_oran != null && d.yeni?.prim_oran != null) {
      return `Kural oranı: %${d.eski.prim_oran} → %${d.yeni.prim_oran}${d.eski.kriter_adi ? " (" + d.eski.kriter_adi + ")" : ""}`;
    }
    return "Kural güncellendi";
  }
  if (tablo === "urun" && islem === "guncelleme") {
    return `Ürün #${kayit.kayit_id} güncellendi`;
  }
  if (tablo === "magaza_alias" && islem === "ekleme") {
    return `Mağaza eşlemesi: "${d.alias}" → ${d.magaza || `mağaza #${d.magaza_id}`}`;
  }
  // Fallback: kısa JSON önizleme
  return JSON.stringify(d).slice(0, 120);
}

export default function Gecmis() {
  const [kayitlar, setKayitlar] = useState([]);
  const [acikDetay, setAcikDetay] = useState(null);

  useEffect(() => {
    fetch("/api/audit").then((r) => r.json()).then(setKayitlar);
  }, []);

  return (
    <div>
      <h2>Değişiklik Geçmişi</h2>
      <p className="aciklama">
        Master veri, kural, atama ve dönem işlemlerinin izi. Prim bir maaş kalemidir — "kim, ne zaman, neyi
        değiştirdi" sorusunun cevabı her zaman burada.
      </p>
      <table>
        <thead>
          <tr>
            <th style={{ width: 160 }}>Tarih</th>
            <th style={{ width: 130 }}>Tablo</th>
            <th style={{ width: 110 }}>İşlem</th>
            <th>Açıklama</th>
            <th style={{ width: 220 }}>Eylem</th>
          </tr>
        </thead>
        <tbody>
          {kayitlar.map((k) => {
            const isHesap = k.tablo === "donem" && k.islem === "hesap";
            return (
              <>
                <tr key={k.id}>
                  <td>{new Date(k.created_at).toLocaleString("tr-TR")}</td>
                  <td>{k.tablo}</td>
                  <td><span className={`rozet ${ISLEM_RENK[k.islem] || "notr"}`}>{k.islem}</span></td>
                  <td style={{ fontSize: 13 }}>{ozetle(k)}</td>
                  <td>
                    {isHesap && k.kayit_id && (
                      <a className="btn ikincil" href={`/api/mutabakat/${k.kayit_id}/export`} download style={{ padding: "4px 12px", fontSize: 12 }}>
                        Excel indir
                      </a>
                    )}
                    <button className="btn ikincil" onClick={() => setAcikDetay(acikDetay === k.id ? null : k.id)}
                      style={{ padding: "4px 12px", fontSize: 12, marginLeft: 6 }}>
                      {acikDetay === k.id ? "Kapat" : "Ham JSON"}
                    </button>
                  </td>
                </tr>
                {acikDetay === k.id && (
                  <tr key={k.id + "-json"}>
                    <td colSpan={5} style={{ background: "#0b1526", padding: 0 }}>
                      <pre className="json" style={{ margin: 0, borderRadius: 0 }}>{
                        typeof k.detay === "string" ? k.detay : JSON.stringify(k.detay, null, 2)
                      }</pre>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
      {kayitlar.length === 0 && <div className="mesaj ok">Henüz kayıt yok.</div>}
    </div>
  );
}
