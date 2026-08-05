"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DonemSec from "../components/DonemSec";
import ExcelFiltreTablo from "../components/ExcelFiltreTablo";

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

const SAYISAL_SATIR = new Set([
  "uzman_toplam_satis", "magaza_toplam_satis", "kontrol",
  "adet", "fiyat", "toplam", "prim_adet", "sellout_adet",
  "magaza_kdv_haric_ciro", "birim_ciro", "prime_esas_tutar",
  "prim_yuzde_1", "sephora_sensai", "sephora_bagdat_beymen", "sevil_lp",
  "toplam_satis_primi", "nokta_uzman_sayisi",
]);

const KOLONLAR = [
  { key: "uzman", ad: "Uzman Ad Soyad", tip: "metin", genislik: 180, renk: "siyah" },
  { key: "marka_grup", ad: "Marka Grup", tip: "metin", genislik: 130, renk: "siyah" },
  { key: "magaza", ad: "Sell-Out Mağaza", tip: "metin", genislik: 180, renk: "siyah" },
  { key: "satis_grup", ad: "Satış Grup", tip: "metin", genislik: 130, renk: "siyah" },
  { key: "E", ad: "Prime Esas Toplam Tutar", tip: "para", renk: "siyah" },
  { key: "F", ad: "Prim % 1", tip: "para", renk: "satis" },
  { key: "G", ad: "Sensai Sephora +\nSisley Cadde + %1", tip: "para", renk: "satis" },
  { key: "H", ad: "Sephora Bağdat + Beymen + % 0,05", tip: "para", renk: "satis" },
  { key: "I", ad: "Toplam Sevil LP", tip: "para", renk: "satis" },
  { key: "J", ad: "Toplam Toplam", tip: "para", renk: "satis" },
  { key: "K", ad: "Hedefler", tip: "para", renk: "hedef" },
  { key: "L", ad: "Hedef\nPrim ( % 0,50 )", tip: "para", renk: "hedef" },
  { key: "M", ad: "Dior Mağaza\n1.Lik  % 0,50", tip: "para", renk: "dior" },
  { key: "N", ad: "Dior Makyaj\n1. lik % 0,33", tip: "para", renk: "dior" },
  { key: "O", ad: "Dior Parfüm\nİlk 2 % 0,33", tip: "para", renk: "dior" },
  { key: "P", ad: "Dior Cilt Bakım\nİlk 3 % 0,33", tip: "para", renk: "dior" },
  { key: "Q", ad: "LP Mağaza - CİLT Bakım\n1. LİK Ve Diğer Sıralama Primleri", tip: "para", renk: "lp" },
  { key: "R", ad: "Parfüm % 1", tip: "para", renk: "parfum" },
  { key: "S", ad: "Parfüm % 0,5", tip: "para", renk: "parfum" },
  { key: "T", ad: "Parfüm % 0,5", tip: "para", renk: "parfum" },
  { key: "U", ad: "Önceki dönemden\nKalan", tip: "para", renk: "kalan" },
  { key: "V", ad: "Toplam Primden\nEk Prim ( % 0,20 )", tip: "para", renk: "toplam" },
  { key: "W", ad: "Toplam\nPrim", tip: "para", renk: "toplam" },
  { key: "X", ad: "Prim\nAçıklama", tip: "metin", renk: "aciklama" },
  { key: "Y", ad: "Toplam Prim\nYüzdesi", tip: "yuzde", renk: "aciklama" },
];

const PIVOT_KOLONLAR = KOLONLAR.map((k) => ({
  ...k,
  sayisal: k.tip === "para" || k.tip === "yuzde",
}));

/** Excel Prim Hesaplama başlık renkleri */
function pivotBaslikRengi(renk) {
  switch (renk) {
    case "satis":
      return { background: "#BDD7EE", color: "#000" }; // satış primi F–J
    case "hedef":
      return { background: "#1F1F1F", color: "#FFF" }; // K–L siyah
    case "dior":
      return { background: "#C6EFCE", color: "#000" }; // M–P yeşil
    case "lp":
      return { background: "#F8CBAD", color: "#000" }; // Q şeftali
    case "parfum":
      return { background: "#E2D5F1", color: "#000" }; // R–T pembe/lavanta
    case "kalan":
      return { background: "#F4B183", color: "#000" }; // U turuncu
    case "toplam":
      return { background: "#1F4E79", color: "#FFF" }; // V–W koyu mavi
    case "aciklama":
      return { background: "#C00000", color: "#FFF" }; // X–Y kırmızı
    case "siyah":
    default:
      return { background: "#1F1F1F", color: "#FFC000" }; // etiket kolonları
  }
}

function baslikRengi(renk) {
  if (renk === "mavi") return { background: "#A4C2F4", color: "#000" };
  if (renk === "sari") return { background: "#FFE699", color: "#000" };
  if (renk === "yesil") return { background: "#C6EFCE", color: "#000" };
  return { background: "#D6E3F8", color: "#000" };
}

function satirStili(tip) {
  if (tip === "genel_toplam") {
    return { background: "#FFE699", fontWeight: 800, borderTop: "2px solid #000" };
  }
  if (tip === "uzman_toplam") {
    return { background: "#FFF2CC", fontWeight: 700 };
  }
  return {};
}

function raporSatirRengi(metin, satisTuru) {
  const m = String(metin || "").toLocaleLowerCase("tr-TR");
  const t = String(satisTuru || "").toLocaleLowerCase("tr-TR");
  if (t.includes("grup dışı") || m.includes("atama yok")) return { background: "#FCE4D6" };
  if (m.includes("mükerrer")) return { background: "#FCE4D6" };
  if (m.includes("eşleş") || m.includes("sell-out") || m.includes("hesap satırı yok") || t.includes("hesaplama dışı")) {
    return { background: "#FFF2CC" };
  }
  return {};
}

function formatSatirHucre(key, v) {
  if (v == null || v === "") return "";
  if (["fiyat", "toplam", "birim_ciro", "prime_esas_tutar"].includes(key)) {
    return Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }
  return String(v);
}

function filtreAktifMi(filtre) {
  return Object.values(filtre || {}).some((arr) => Array.isArray(arr) && arr.length > 0);
}

export default function PrimRaporu() {
  const [gorunum, setGorunum] = useState("toplanmis");
  const [donem, setDonem] = useState(null);
  const [veri, setVeri] = useState(null);
  const [satirVeri, setSatirVeri] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [sayfa, setSayfa] = useState(1);
  const [arama, setArama] = useState("");
  const [aramaInput, setAramaInput] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [kolonFiltre, setKolonFiltre] = useState({});
  const [acilacakKolon, setAcilacakKolon] = useState(null);
  const [acilacakAra, setAcilacakAra] = useState("");

  useEffect(() => {
    if (gorunum !== "toplanmis" || !donem) return;
    setYukleniyor(true);
    setHata(null);
    fetch(`/api/prim-raporu/${donem}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.hata || "Pivot yüklenemedi");
        setVeri(d);
        setYukleniyor(false);
      })
      .catch((e) => {
        setHata(e.message);
        setYukleniyor(false);
      });
  }, [donem, gorunum]);

  useEffect(() => {
    if (gorunum !== "satirlar" || !donem) return;
    const ac = new AbortController();
    let iptal = false;
    setYukleniyor(true);
    setHata(null);
    setSatirVeri(null); // eski filtre/satırlar ekranda kalmasın
    const aktifFiltre = filtreAktifMi(kolonFiltre);
    const qs = new URLSearchParams({
      sayfa: String(sayfa),
      // Filtre varken tüm eşleşenleri getir (Yıldırım Tezer ~227 vb.)
      limit: aktifFiltre || arama ? "5000" : "500",
    });
    if (arama) qs.set("q", arama);
    if (aciklama) qs.set("aciklama", aciklama);
    if (aktifFiltre) qs.set("filtre", JSON.stringify(kolonFiltre));
    fetch(`/api/prim-raporu/${donem}/satirlar?${qs}`, { signal: ac.signal })
      .then(async (r) => {
        const d = await r.json();
        if (iptal) return;
        if (!r.ok) throw new Error(d.hata || "Satır satır rapor yüklenemedi");
        setSatirVeri(d);
        setYukleniyor(false);
      })
      .catch((e) => {
        if (e.name === "AbortError" || iptal) return;
        setHata(e.message);
        setYukleniyor(false);
      });
    return () => {
      iptal = true;
      ac.abort();
    };
  }, [gorunum, donem, sayfa, arama, aciklama, kolonFiltre]);

  function hucreDeger(satir, kolon) {
    if (kolon.tip === "metin") return satir[kolon.key] || "";
    const v = satir[kolon.key];
    if (v == null) return "";
    if (kolon.tip === "yuzde") return yzd(v);
    return tl(v);
  }

  const pivotDegerAl = useCallback((satir, key) => {
    const kolon = KOLONLAR.find((k) => k.key === key);
    if (!kolon) return satir[key];
    if (kolon.tip === "metin") return satir[key] || "";
    return satir[key];
  }, []);

  const pivotYaz = useCallback((satir, kolon) => hucreDeger(satir, kolon), []);
  const satirDegerAl = useCallback((satir, key) => satir[key], []);
  const satirYaz = useCallback((satir, kolon) => formatSatirHucre(kolon.key, satir[kolon.key]), []);

  const degerleriGetir = useCallback(
    async (kolonKey) => {
      if (!donem) return [];
      const qs = new URLSearchParams({ kolon: kolonKey });
      if (aciklama) qs.set("aciklama", aciklama);
      if (arama) qs.set("q", arama);
      const diger = { ...kolonFiltre };
      delete diger[kolonKey];
      if (filtreAktifMi(diger)) qs.set("filtre", JSON.stringify(diger));
      const r = await fetch(`/api/prim-raporu/${donem}/satirlar/degerler?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.hata || "Değerler yüklenemedi");
      return d.degerler || [];
    },
    [donem, aciklama, arama, kolonFiltre]
  );

  function pivotIndir() {
    if (!donem) return;
    window.location.href = `/api/prim-raporu/${donem}/xlsx`;
  }

  function satirIndir() {
    if (!donem) return;
    const qs = new URLSearchParams();
    if (arama) qs.set("q", arama);
    if (aciklama) qs.set("aciklama", aciklama);
    if (filtreAktifMi(kolonFiltre)) qs.set("filtre", JSON.stringify(kolonFiltre));
    const s = qs.toString();
    window.location.href = `/api/prim-raporu/${donem}/satirlar/indir${s ? `?${s}` : ""}`;
  }

  function araGonder(e) {
    e.preventDefault();
    // Filtrele → uzman seçim paneli (tüm dönem A–Z)
    setAcilacakAra(aramaInput.trim());
    setAcilacakKolon("ad_soyad");
  }

  function filtreTemizle() {
    setAramaInput("");
    setArama("");
    setAciklama("");
    setKolonFiltre({});
    setSayfa(1);
  }

  function kolonFiltreUygula(sonraki) {
    setKolonFiltre(sonraki);
    setArama("");
    setAramaInput("");
    setSayfa(1);
  }

  function donemDegistir(id) {
    setDonem(id);
    setSayfa(1);
    setVeri(null);
    setSatirVeri(null);
    setKolonFiltre({});
    setArama("");
    setAramaInput("");
  }

  const donemAd = satirVeri?.donem_ad;
  const satirKolonlar = (satirVeri?.kolonlar || []).map((k) => ({
    ...k,
    sayisal: SAYISAL_SATIR.has(k.key),
  }));

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
          <p>
            {gorunum === "toplanmis"
              ? "Sistem hesabı — toplanmış pivot (Prim Çalışma2 görünümü). İndirilebilir temiz sonuç."
              : "Satır satır görünüm. Filtrele veya başlıktaki huni ile tüm dönem verisinde süzün; hücreleri sürükleyerek toplayın."}
          </p>
        </div>
      </section>

      <div className="rapor-sekme" role="tablist" aria-label="Rapor görünümü">
        <button
          type="button"
          role="tab"
          aria-selected={gorunum === "toplanmis"}
          className={gorunum === "toplanmis" ? "aktif" : ""}
          onClick={() => setGorunum("toplanmis")}
        >
          Toplanmış
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={gorunum === "satirlar"}
          className={gorunum === "satirlar" ? "aktif" : ""}
          onClick={() => { setGorunum("satirlar"); setSayfa(1); }}
        >
          Satır satır
        </button>
      </div>

      <div className="rapor-araclar">
        <DonemSec value={donem} onChange={donemDegistir} />
        {gorunum === "toplanmis" && veri?.satirlar?.length > 0 && (
          <button className="btn rapor-indir" onClick={pivotIndir}>
            <span>↓</span> Excel olarak indir
          </button>
        )}
        {gorunum === "satirlar" && (
          <div className="prim-calisma-araclar">
            <form className="prim-calisma-filtre" onSubmit={araGonder}>
              <input
                value={aramaInput}
                onChange={(e) => setAramaInput(e.target.value)}
                placeholder="Filtre panelinde ara…"
                onFocus={() => {}}
              />
              <select
                value={aciklama}
                onChange={(e) => { setAciklama(e.target.value); setSayfa(1); }}
              >
                <option value="">Tüm açıklamalar</option>
                <option value="Ok">Ok</option>
                <option value="Mükerrer">Mükerrer</option>
                <option value="Eşleşmeyen">Eşleşmeyen / primsiz</option>
                <option value="Grup Satış">Grup Satış</option>
                <option value="Grup Dışı">Grup Dışı</option>
              </select>
              <button type="submit" className="btn ikincil">Filtrele</button>
              {(arama || aciklama || aramaInput || filtreAktifMi(kolonFiltre)) && (
                <button type="button" className="btn ikincil" onClick={filtreTemizle}>
                  Temizle
                </button>
              )}
              {satirVeri?.toplam > 0 && (
                <button type="button" className="btn rapor-indir" onClick={satirIndir}>
                  <span>↓</span> Excel olarak indir
                </button>
              )}
            </form>
          </div>
        )}
      </div>

      {yukleniyor && <div className="mesaj notr" style={{ marginTop: 12 }}>Yükleniyor...</div>}
      {hata && <div className="mesaj hata" style={{ marginTop: 12 }}>{hata}</div>}

      {gorunum === "toplanmis" && donem && veri && !yukleniyor && !hata && !veri.hesaplandi && (
        <div className="mesaj hata" style={{ marginTop: 12 }}>
          Bu dönem için prim özeti yok — hesap tamamlanmamış veya kilit hatasıyla yarıda kalmış.
          Prim Hesaplama’ya dönüp tekrar «Prim hesapla» çalıştırın.
          {" "}
          <Link href={`/yukle?donem=${donem}`}>Hesaplamaya git →</Link>
        </div>
      )}

      {gorunum === "toplanmis" && veri?.hesaplandi && veri?.satirlar?.length > 0 && (
        <ExcelFiltreTablo
          kolonlar={PIVOT_KOLONLAR}
          satirlar={veri.satirlar}
          rowKey={(_, i) => i}
          degerAl={pivotDegerAl}
          yaz={pivotYaz}
          satirStil={(s) => satirStili(s.tip)}
          baslikStil={(k) => ({
            ...pivotBaslikRengi(k.renk),
            padding: "8px 6px",
            border: "1px solid #333",
            whiteSpace: "pre-line",
            textAlign: "center",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.2,
            minWidth: k.genislik || 90,
          })}
        />
      )}

      {gorunum === "toplanmis" && donem && veri && !veri.hesaplandi && !yukleniyor && !hata && (
        <div className="rapor-bos">
          <span>∿</span>
          <h3>Henüz rapor oluşmadı</h3>
          <p>Toplanmış görünüm `prim_ozet` tablosundan gelir. Hesap başarılı bitmeden burada veri olmaz.</p>
          <Link href={donem ? `/yukle?donem=${donem}` : "/yukle"} className="btn">
            Prim hesaplamaya git →
          </Link>
        </div>
      )}

      {gorunum === "satirlar" && satirVeri && !yukleniyor && !satirVeri.hesaplandi && (
        <div className="mesaj hata" style={{ marginTop: 12 }}>
          Satır satır Zeops satışlarını gösterir; prim özeti henüz yok (hesap tamamlanmamış).
          Bu liste «tam prim raporu» değildir — önce Prim hesapla’yı başarıyla bitirin.
          {" "}
          <Link href={donem ? `/yukle?donem=${donem}` : "/yukle"}>Hesaplamaya git →</Link>
        </div>
      )}

      {gorunum === "satirlar" && satirVeri?.satirlar?.length > 0 && (
        <>
          <ExcelFiltreTablo
            kolonlar={satirKolonlar}
            satirlar={satirVeri.satirlar}
            rowKey={(s, i) => `${s.beyan_id || "x"}-${s.prim_grup || ""}-${i}`}
            degerAl={satirDegerAl}
            yaz={satirYaz}
            satirStil={(s) => raporSatirRengi(s.rapor_aciklama, s.satis_turu)}
            baslikStil={(k) => ({
              ...baslikRengi(k.renk),
              padding: "8px 6px",
              border: "1px solid #7F9DB9",
              whiteSpace: "pre-line",
              textAlign: "center",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1.2,
              minWidth: k.key === "ad_soyad" || k.key === "rapor_aciklama" ? 160 : 88,
              fontFamily: "Calibri, Arial, sans-serif",
            })}
            serverModu
            filtreler={kolonFiltre}
            onFiltreUygula={kolonFiltreUygula}
            degerleriGetir={degerleriGetir}
            filtreKolonlari={satirVeri.filtre_kolonlar}
            acilacakKolon={acilacakKolon}
            acilacakAra={acilacakAra}
            onAcilacakIsletildi={() => {
              setAcilacakKolon(null);
              setAcilacakAra("");
            }}
            toplamKayit={satirVeri.toplam}
          />

          <div className="prim-calisma-pager">
            <button
              type="button"
              className="btn ikincil"
              disabled={sayfa <= 1 || yukleniyor}
              onClick={() => setSayfa((s) => Math.max(1, s - 1))}
            >
              ← Önceki
            </button>
            <span>
              Sayfa {satirVeri.sayfa} / {satirVeri.sayfaSayisi}
              {donemAd ? ` · ${donemAd}` : ""}
              {` · ${satirVeri.toplam.toLocaleString("tr-TR")} kayıt`}
            </span>
            <button
              type="button"
              className="btn ikincil"
              disabled={sayfa >= satirVeri.sayfaSayisi || yukleniyor}
              onClick={() => setSayfa((s) => s + 1)}
            >
              Sonraki →
            </button>
          </div>
        </>
      )}

      {gorunum === "satirlar" && donem && satirVeri && satirVeri.satirlar.length === 0 && !yukleniyor && !hata && (
        <div className="rapor-bos">
          <h3>Satır bulunamadı</h3>
          <p>
            {satirVeri.toplam === 0 && !arama && !aciklama && !filtreAktifMi(kolonFiltre)
              ? "Bu dönemde beyan/hesap satırı yok. Önce dosya yükleyip hesaplayın."
              : "Filtreyi temizleyip tekrar deneyin."}
          </p>
        </div>
      )}
    </div>
  );
}
