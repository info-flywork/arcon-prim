"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DonemSec from "../components/DonemSec";

// Aylık girdi dosyaları — sıra önemli: önce master, sonra veriler
const dosyalar = [
  {
    tip: "uzman-magaza",
    ad: "1. Uzman-Mağaza-Grup (master)",
    aciklama: "Tek kaynak: Excel’de yeni uzman veya yeni mağaza/bayi varsa otomatik eklenir; seçili döneme atama yazılır. Manuel ekleme gerekmez. Kolonlar: ŞEHİR, MAĞAZA KODU, BAYİ, MAĞAZA, PRİM MAĞAZA, Uzman Ad-Soyad, Group.",
    zorunlu: true,
  },
  {
    tip: "sellout",
    ad: "2. Sell-out Data",
    aciklama: "Bayilerden gelen resmi satış. Kolonlar: Bayi, Ürün Adı, Arcon Referans, Arcon Barkod, Adet, Ciro Kdv Hariç, Prim Mağaza, Marka, Ürün Grubu...",
    zorunlu: true,
  },
  {
    tip: "zeops",
    ad: "3. Zeops Ham Data",
    aciklama: "Uzman satış beyanları. Kolonlar: Ziyaret ID, Ad, Soyad, İşlem Tarihi, Durum, Satış Tarihi, Mağaza, Barkod, Kod, Etiket, Adet, Fiyat, Toplam.",
    zorunlu: true,
  },
  {
    tip: "hedef",
    ad: "4. Ciro Hedefleri",
    aciklama: "Kolonlar: BAYİ, MAĞAZA KOD, MAĞAZA ADI, MARKA, REVİZE <Ay> (hedef ciro).",
    zorunlu: true,
  },
  {
    tip: "siralama",
    ad: "5. Marka Sıralamaları",
    aciklama: "Kolonlar: MAĞAZA, ÇEŞİT, MARKA, SIRALAMA, AY, YIL, Prim Mağaza Eşleşenler.",
    zorunlu: true,
  },
  {
    tip: "stok",
    ad: "6. Stok Liste (ürün master tamamlama)",
    aciklama: "Kolonlar: STOK KODU, STOK ADI, SEKTÖR ADI, MARKA, BARKOD 1, UNIQ KOD... Var olan ürünlere dokunmaz, sadece DB'de eksik olanları tamamlar.",
    zorunlu: false,
  },
];

const tl = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " TL");
const say = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR"));

export default function Yukle() {
  const router = useRouter();
  const [donem, setDonem] = useState(null);
  const [sonuclar, setSonuclar] = useState({});
  const [yukleniyor, setYukleniyor] = useState(null);
  const [log, setLog] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [hesaplaniyor, setHesaplaniyor] = useState(false);
  const [mesaj, setMesaj] = useState(null);

  const yenileDurum = (donemId) => {
    if (!donemId) return;
    fetch(`/api/import-log/${donemId}`).then((r) => r.json()).then(setLog);
    fetch(`/api/dashboard/${donemId}`).then((r) => r.json()).then(setDashboard);
  };

  useEffect(() => {
    if (!donem) return;
    setMesaj(null);
    yenileDurum(donem);
  }, [donem, sonuclar]);

  async function gonder(tip, file) {
    if (!file || !donem) return;
    setYukleniyor(tip);
    setMesaj(null);
    const fd = new FormData();
    fd.append("dosya", file);
    try {
      const r = await fetch(`/api/import/${tip}/${donem}`, { method: "POST", body: fd });
      const metin = await r.text();
      let d;
      try {
        d = JSON.parse(metin);
      } catch {
        d = { hata: `Backend'e ulaşılamadı (${r.status}). API'nin localhost:4000'de çalıştığını kontrol edin.` };
      }
      setSonuclar((s) => ({ ...s, [tip]: d }));
    } catch (e) {
      setSonuclar((s) => ({ ...s, [tip]: { hata: "Bağlantı hatası: " + e.message } }));
    } finally {
      setYukleniyor(null);
    }
  }

  const hazirlik = {
    atama: Number(dashboard?.atama?.satir || 0) > 0,
    sellout: Number(dashboard?.sellout?.satir || 0) > 0,
    zeops: Number(dashboard?.beyan?.satir || 0) > 0,
    hedef: Number(dashboard?.hedef?.satir || 0) > 0,
    siralama: Number(dashboard?.siralama?.satir || 0) > 0,
  };
  const hesapHazir = hazirlik.atama && hazirlik.sellout && hazirlik.zeops;
  const eslesmeyen = Number(dashboard?.beyan?.eslesmeyen || 0) + Number(dashboard?.sellout?.eslesmeyen || 0);

  async function hesapla() {
    if (!donem || !hesapHazir) return;
    setHesaplaniyor(true);
    setMesaj(null);
    try {
      const r = await fetch(`/api/hesapla/${donem}`, { method: "POST" });
      const d = await r.json();
      if (d.hata) throw new Error(d.hata);
      setMesaj({
        tip: "ok",
        metin: `Hesap tamam: ${say(d.uzmanMagazaSayisi)} uzman-mağaza, toplam prim ${tl(d.toplamPrim)}. Prim Raporu'na yönlendiriliyorsunuz...`,
      });
      yenileDurum(donem);
      setTimeout(() => router.push("/rapor"), 900);
    } catch (e) {
      setMesaj({ tip: "hata", metin: e.message });
    } finally {
      setHesaplaniyor(false);
    }
  }

  return (
    <div>
      <h2>Veri Yükleme</h2>
      <p className="aciklama">
        Önce Excel dosyalarını yükleyin, ardından aynı sayfadan primleri hesaplayın.
        Hesap bitince otomatik olarak Prim Raporu sayfasına gidersiniz.
      </p>
      <DonemSec value={donem} onChange={setDonem} />

      {dosyalar.map((d) => {
        const s = sonuclar[d.tip];
        return (
          <div className="yukle-kart" key={d.tip}>
            <h3>{d.ad}{!d.zorunlu && <span className="rozet notr" style={{ marginLeft: 8 }}>opsiyonel</span>}</h3>
            <p>{d.aciklama}</p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={!donem || yukleniyor || hesaplaniyor}
              onChange={(e) => gonder(d.tip, e.target.files[0])}
            />
            {yukleniyor === d.tip && <span className="rozet notr" style={{ marginLeft: 10 }}>Yükleniyor...</span>}
            {s && !s.hata && (
              <span className="rozet ok" style={{ marginLeft: 10 }}>
                {d.tip === "uzman-magaza"
                  ? `${s.ok} atama${s.yeniUzman ? ` · ${s.yeniUzman} yeni uzman` : ""}${s.yeniMagaza ? ` · ${s.yeniMagaza} yeni mağaza` : ""} · ${s.err ?? 0} sorunlu`
                  : `${s.toplam ?? s.ok} satır · ${s.eslesmeyen ?? s.err ?? 0} sorunlu`}
              </span>
            )}
            {s?.hata && (
              <div style={{ marginTop: 10 }}>
                <span className="rozet hata">{s.hata}</span>
                {s.gorulen_basliklar?.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary>Dosyada bulunan başlıkları göster ({s.gorulen_basliklar.length})</summary>
                    <div style={{ marginTop: 6, fontSize: 12, color: "var(--metin-2)" }}>
                      {s.gorulen_basliklar.map((k, i) => (
                        <span key={i} className="rozet notr" style={{ margin: "2px 4px 2px 0" }}>{k}</span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}

      {donem && (
        <div className="yukle-kart" style={{ borderColor: "rgba(37,99,235,.35)", background: "var(--vurgu-acik, #f5f8ff)" }}>
          <h3>7. Primleri Hesapla</h3>
          <p>
            Dosyalar yüklendikten sonra hesabı burada çalıştırın. Sonuçlar Prim Raporu ve Satır Kontrol
            sayfalarına yazılır.
          </p>
          <div className="satir" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <span className={`rozet ${hazirlik.atama ? "ok" : "hata"}`}>Atama: {say(dashboard?.atama?.satir)}</span>
            <span className={`rozet ${hazirlik.sellout ? "ok" : "hata"}`}>Sell-out: {say(dashboard?.sellout?.satir)}</span>
            <span className={`rozet ${hazirlik.zeops ? "ok" : "hata"}`}>Zeops: {say(dashboard?.beyan?.satir)}</span>
            <span className={`rozet ${hazirlik.hedef ? "ok" : "notr"}`}>Hedef: {say(dashboard?.hedef?.satir)}</span>
            <span className={`rozet ${hazirlik.siralama ? "ok" : "notr"}`}>Sıralama: {say(dashboard?.siralama?.satir)}</span>
            {eslesmeyen > 0 && (
              <Link href="/eslesmeyen" className="rozet notr">
                {say(eslesmeyen)} eşleşmeyen satır → kontrol et
              </Link>
            )}
          </div>
          <div className="satir">
            <button
              className="btn"
              onClick={hesapla}
              disabled={!hesapHazir || hesaplaniyor || !!yukleniyor}
            >
              {hesaplaniyor ? "Hesaplanıyor..." : "Primleri Hesapla → Prim Raporu"}
            </button>
            {Number(dashboard?.prim?.kayit || 0) > 0 && (
              <>
                <Link className="btn ikincil" href="/rapor">Prim Raporu</Link>
                <Link className="btn ikincil" href="/mutabakat">Satır Kontrol</Link>
              </>
            )}
          </div>
          {!hesapHazir && (
            <p className="aciklama" style={{ marginTop: 10, marginBottom: 0 }}>
              Hesap için en az Uzman-Mağaza-Grup, Sell-out ve Zeops dosyaları bu dönemde yüklü olmalı.
            </p>
          )}
          {mesaj && <div className={`mesaj ${mesaj.tip}`} style={{ marginTop: 12 }}>{mesaj.metin}</div>}
        </div>
      )}

      {log.length > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>Yükleme Geçmişi</h2>
          <table>
            <thead>
              <tr><th>Tarih</th><th>Tip</th><th>Dosya</th><th className="sag">Satır</th><th className="sag">Hatalı</th></tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.created_at).toLocaleString("tr-TR")}</td>
                  <td>{l.tip}</td>
                  <td>{l.dosya_adi}</td>
                  <td className="sag">{l.satir_sayisi}</td>
                  <td className="sag">{l.hatali_satir}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
