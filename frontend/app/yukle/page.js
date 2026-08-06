"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const DOSYALAR = [
  {
    tip: "uzman-magaza",
    baslik: "Uzman · Mağaza · Grup",
    kisa: "Uzman ve mağaza eşleşmeleri",
    hazirAnahtar: "atama",
    logTipleri: ["uzman-magaza", "uzman_magaza"],
  },
  {
    tip: "sellout",
    baslik: "Sell-out",
    kisa: "Resmî bayi satış verisi",
    hazirAnahtar: "sellout",
    logTipleri: ["sellout"],
  },
  {
    tip: "zeops",
    baslik: "Zeops",
    kisa: "Uzman satış beyanları",
    hazirAnahtar: "zeops",
    logTipleri: ["zeops"],
  },
  {
    tip: "hedef",
    baslik: "Ciro Hedefleri",
    kisa: "Mağaza ve marka hedefleri",
    hazirAnahtar: "hedef",
    logTipleri: ["hedef"],
  },
  {
    tip: "siralama",
    baslik: "Marka Sıralamaları",
    kisa: "Aylık marka sıralamaları",
    hazirAnahtar: "siralama",
    logTipleri: ["siralama"],
  },
  {
    tip: "stok",
    baslik: "Stok Listesi",
    kisa: "Ürün master tamamlama",
    hazirAnahtar: "stok",
    logTipleri: ["stok", "uniq_kod"],
  },
];

const TIP_ADI = Object.fromEntries(DOSYALAR.map((dosya) => [dosya.tip, dosya.baslik]));

const say = (deger) => Number(deger || 0).toLocaleString("tr-TR");
const tl = (deger) =>
  Number(deger || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " TL";

function Ikon({ tip }) {
  if (tip === "check") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }
  if (tip === "history") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8v4l3 2M3.5 9A9 9 0 1 1 3 14" />
        <path d="M3 4v5h5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15V4m0 0L8 8m4-4 4 4M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

function hazirlikFromDashboard(dashboard) {
  return {
    atama: Number(dashboard?.atama?.satir || 0) > 0,
    sellout: Number(dashboard?.sellout?.satir || 0) > 0,
    zeops: Number(dashboard?.beyan?.satir || 0) > 0,
    hedef: Number(dashboard?.hedef?.satir || 0) > 0,
    siralama: Number(dashboard?.siralama?.satir || 0) > 0,
    stok: Number(dashboard?.stok?.satir || 0) > 0,
  };
}

export default function PrimHesaplama() {
  const router = useRouter();
  const [donemler, setDonemler] = useState([]);
  const [acikId, setAcikId] = useState(null);
  const [panel, setPanel] = useState({});
  const [yukleniyor, setYukleniyor] = useState(null);
  const [hesaplaniyor, setHesaplaniyor] = useState(false);
  const [sonuclar, setSonuclar] = useState({});
  const [mesaj, setMesaj] = useState(null);
  const [sayfaYukleniyor, setSayfaYukleniyor] = useState(true);
  const [bekletUyari, setBekletUyari] = useState(false);
  const [bilgiModal, setBilgiModal] = useState(null); // { baslik, metin }
  const [yeniYilYukleniyor, setYeniYilYukleniyor] = useState(false);
  const [seciliYeniYil, setSeciliYeniYil] = useState(null);
  const [temizleniyor, setTemizleniyor] = useState(false);
  const [temizleOnay, setTemizleOnay] = useState(false);

  async function donemVerisi(donemId) {
    const [logCevap, dashboardCevap] = await Promise.all([
      fetch(`/api/import-log/${donemId}`),
      fetch(`/api/dashboard/${donemId}`),
    ]);
    if (!logCevap.ok || !dashboardCevap.ok) throw new Error("Dönem verileri alınamadı");
    return {
      loglar: await logCevap.json(),
      dashboard: await dashboardCevap.json(),
    };
  }

  async function paneliYukle(donemId) {
    const veri = await donemVerisi(donemId);
    setPanel((onceki) => ({
      ...onceki,
      [donemId]: {
        loglar: Array.isArray(veri.loglar) ? veri.loglar : [],
        dashboard: veri.dashboard,
      },
    }));
    return veri;
  }

  useEffect(() => {
    (async () => {
      try {
        const simdi = new Date();
        const yil = simdi.getFullYear();
        const ay = simdi.getMonth() + 1;
        // GET eksik ayları açar (Haziran→…→bu ay) ve kronolojik döner
        let liste = await fetch("/api/donemler").then((cevap) => cevap.json());
        if (!Array.isArray(liste)) throw new Error("Dönem listesi alınamadı");

        const buAy = liste.find(
          (item) => Number(item.yil) === yil && Number(item.ay) === ay
        );
        if (!buAy) throw new Error("Güncel dönem açılamadı");

        setDonemler(liste);
        const queryDonem = Number(new URLSearchParams(window.location.search).get("donem") || 0) || null;
        // Öncelik: URL → içinde bulunulan ay → yoksa son hesaplanan → ilk açık
        const sonHesaplanan = [...liste].reverse().find((item) => item.durum === "hesaplandi");
        const ilkAcik = liste.find((item) => item.durum === "acik");
        const secili =
          (queryDonem && liste.find((item) => Number(item.id) === queryDonem)) ||
          buAy ||
          sonHesaplanan ||
          ilkAcik ||
          liste[liste.length - 1];
        if (!secili) throw new Error("Açılacak dönem bulunamadı");
        setAcikId(secili.id);
        await paneliYukle(secili.id);
      } catch (hata) {
        setMesaj({ tip: "hata", metin: hata.message });
      } finally {
        setSayfaYukleniyor(false);
      }
    })();
  }, []);

  const acikDonem = useMemo(
    () => donemler.find((item) => Number(item.id) === Number(acikId)) || null,
    [acikId, donemler]
  );
  const acikPanel = panel[acikId] || { loglar: [], dashboard: null };
  const hazirlik = useMemo(
    () => hazirlikFromDashboard(acikPanel.dashboard),
    [acikPanel.dashboard]
  );

  function dosyaHazir(dosya) {
    if (dosya.hazirAnahtar && hazirlik[dosya.hazirAnahtar]) return true;
    return (acikPanel.loglar || []).some((log) => dosya.logTipleri.includes(log.tip));
  }

  const tumDosyalarHazir = DOSYALAR.every(dosyaHazir);
  const primVar = Number(acikPanel.dashboard?.prim?.kayit || 0) > 0;

  const yilSecenekleri = useMemo(() => {
    const simdiYil = new Date().getFullYear();
    const maxDonemYil = donemler.length
      ? Math.max(...donemler.map((d) => Number(d.yil)))
      : simdiYil;
    // Mevcut yılı her zaman seçeneklere dahil et (ör. 2026)
    const baslangic = Math.min(simdiYil, maxDonemYil + 1);
    return Array.from({ length: 5 }, (_, i) => baslangic + i);
  }, [donemler]);

  const varsayilanYil = new Date().getFullYear();
  const aktifYeniYil =
    seciliYeniYil ||
    (yilSecenekleri.includes(varsayilanYil) ? varsayilanYil : yilSecenekleri[0]) ||
    varsayilanYil;

  async function yeniYilDonemiAc(hedefYil = aktifYeniYil) {
    if (yeniYilYukleniyor || yukleniyor || hesaplaniyor) return;
    const yil = Number(hedefYil);
    setYeniYilYukleniyor(true);
    setMesaj(null);
    try {
      const cevap = await fetch("/api/donemler/yeni-yil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yil }),
      });
      const veri = await cevap.json().catch(() => ({}));
      if (!cevap.ok) {
        setBilgiModal({
          baslik: "Dönem açılamadı",
          metin:
            veri.hata ||
            `Henüz ${yil} yılına gelinmediği için dönem açılamaz.`,
        });
        return;
      }
      const liste = await fetch("/api/donemler").then((r) => r.json());
      if (Array.isArray(liste)) setDonemler(liste);
      setMesaj({
        tip: "ok",
        metin: veri.mesaj || `${yil} dönemleri açıldı.`,
      });
    } catch (hata) {
      setBilgiModal({
        baslik: "Dönem açılamadı",
        metin: hata.message || "İstek tamamlanamadı.",
      });
    } finally {
      setYeniYilYukleniyor(false);
    }
  }

  async function donemTemizle() {
    if (!acikId || temizleniyor || yukleniyor || hesaplaniyor) return;
    setTemizleniyor(true);
    setTemizleOnay(false);
    setMesaj(null);
    try {
      const cevap = await fetch(`/api/donemler/${acikId}/temizle`, { method: "DELETE" });
      const veri = await cevap.json().catch(() => ({}));
      if (!cevap.ok) throw new Error(veri.hata || "Dönem temizlenemedi");
      setSonuclar({});
      setPanel((onceki) => {
        const kopya = { ...onceki };
        delete kopya[acikId];
        return kopya;
      });
      setDonemler((liste) =>
        liste.map((item) =>
          Number(item.id) === Number(acikId) ? { ...item, durum: "acik" } : item
        )
      );
      await paneliYukle(acikId);
      setMesaj({ tip: "ok", metin: veri.mesaj || "Dönem verileri temizlendi." });
    } catch (hata) {
      setMesaj({ tip: "hata", metin: hata.message });
    } finally {
      setTemizleniyor(false);
    }
  }

  async function ayAc(donem) {
    const simdi = new Date();
    const gelecek =
      Number(donem.yil) > simdi.getFullYear()
      || (Number(donem.yil) === simdi.getFullYear() && Number(donem.ay) > simdi.getMonth() + 1);
    if (gelecek) return;
    if (Number(acikId) === Number(donem.id)) return;
    setMesaj(null);
    setSonuclar({});
    setAcikId(donem.id);
    if (!panel[donem.id]) {
      try {
        await paneliYukle(donem.id);
      } catch (hata) {
        setMesaj({ tip: "hata", metin: hata.message });
      }
    }
  }

  async function importSonucBekle(jobId, tip) {
    const baslangic = Date.now();
    const maxMs = 15 * 60 * 1000;
    while (Date.now() - baslangic < maxMs) {
      await new Promise((r) => setTimeout(r, 1500));
      const cevap = await fetch(`/api/import-job/${jobId}`);
      const ham = await cevap.text();
      let job = {};
      try {
        job = ham ? JSON.parse(ham) : {};
      } catch {
        continue;
      }
      if (cevap.status === 404 || job.kod === "job_yok") {
        // PM2 restart vb. — panelden / dönem durumundan doğrula
        if (tip === "hesap") {
          const liste = await fetch("/api/donemler").then((r) => r.json()).catch(() => []);
          const donem = Array.isArray(liste)
            ? liste.find((d) => Number(d.id) === Number(acikId))
            : null;
          if (donem?.durum === "hesaplandi") {
            return {
              tamamlandi: true,
              sonuc: { not: "Hesap sunucuda tamamlanmış görünüyor.", uzmanMagazaSayisi: 0, toplamPrim: 0 },
            };
          }
          throw new Error(job.hata || "Hesap durumu alınamadı. Sayfayı yenileyip kontrol edin.");
        }
        const veri = await paneliYukle(acikId);
        const dosya = DOSYALAR.find((d) => d.tip === tip);
        const hazir = hazirlikFromDashboard(veri.dashboard);
        const logVar = (veri.loglar || []).some((log) =>
          (dosya?.logTipleri || [tip]).includes(log.tip)
        );
        if ((dosya?.hazirAnahtar && hazir[dosya.hazirAnahtar]) || logVar) {
          return { tamamlandi: true, sonuc: { not: "İşlem sunucuda tamamlanmış görünüyor." } };
        }
        throw new Error(job.hata || "Yükleme durumu alınamadı. Sayfayı yenileyip kontrol edin.");
      }
      if (job.durum === "bitti") return { tamamlandi: true, sonuc: job.sonuc || {} };
      if (job.durum === "hata") throw new Error(job.hata || "Dosya işlenemedi");
      if (job.ilerleme?.toplam) {
        const y = job.ilerleme.yapilan || 0;
        const t = job.ilerleme.toplam;
        const ad = TIP_ADI[tip] || (tip === "hesap" ? "Prim hesabı" : tip);
        const asama =
          job.ilerleme.asama === "esleme"
            ? "eşleme"
            : job.ilerleme.asama === "hesap"
              ? "hesap"
              : job.ilerleme.asama || "";
        setMesaj({
          tip: "notr",
          metin:
            tip === "hesap"
              ? job.ilerleme.toplam > 1
                ? `${ad} işleniyor… ${asama || "devam"} ${Number(y).toLocaleString("tr-TR")} / ${Number(t).toLocaleString("tr-TR")}`
                : `${ad} işleniyor… (${asama || "devam"})`
              : `${ad} işleniyor… ${y.toLocaleString("tr-TR")} / ${t.toLocaleString("tr-TR")}`,
        });
      }
    }
    throw new Error("Yükleme çok uzun sürdü. Sayfayı yenileyip sonucu kontrol edin.");
  }

  async function dosyaGonder(tip, file) {
    if (!file || !acikId) return;
    if (yukleniyor) {
      setBekletUyari(true);
      return;
    }
    setYukleniyor(tip);
    setMesaj(null);
    const form = new FormData();
    form.append("dosya", file);
    try {
      const cevap = await fetch(`/api/import/${tip}/${acikId}`, {
        method: "POST",
        body: form,
      });
      const ham = await cevap.text();
      let veri = {};
      try {
        veri = ham ? JSON.parse(ham) : {};
      } catch {
        // Proxy kesilmiş olabilir; panelden doğrula
        const panelVeri = await paneliYukle(acikId);
        const dosya = DOSYALAR.find((d) => d.tip === tip);
        const hazir = hazirlikFromDashboard(panelVeri.dashboard);
        const logVar = (panelVeri.loglar || []).some((log) =>
          (dosya?.logTipleri || [tip]).includes(log.tip)
        );
        if ((dosya?.hazirAnahtar && hazir[dosya.hazirAnahtar]) || logVar) {
          setSonuclar((onceki) => ({
            ...onceki,
            [tip]: { not: "Sunucu yanıtı gecikti ama yükleme tamamlanmış görünüyor." },
          }));
          setMesaj({
            tip: "ok",
            metin: `${TIP_ADI[tip]} yüklendi (yanıt gecikti, işlem tamamlanmış).`,
          });
          return;
        }
        throw new Error(
          cevap.ok
            ? "Sunucu beklenmeyen yanıt döndü"
            : "Yükleme zaman aşımına uğradı veya sunucu hata verdi. Sayfayı yenileyip tekrar deneyin."
        );
      }
      if (!cevap.ok || veri.hata) throw new Error(veri.hata || "Dosya yüklenemedi");

      // Yeni akış: dosya alındı → arka planda işleniyor → poll
      if (veri.jobId && veri.durum === "isleniyor") {
        setMesaj({ tip: "notr", metin: `${TIP_ADI[tip]} işleniyor, lütfen bekleyin…` });
        const { sonuc } = await importSonucBekle(veri.jobId, tip);
        setSonuclar((onceki) => ({ ...onceki, [tip]: sonuc }));
        await paneliYukle(acikId);
        setMesaj({ tip: "ok", metin: `${TIP_ADI[tip]} başarıyla yüklendi.` });
        return;
      }

      // Eski senkron yanıt (geriye uyum)
      setSonuclar((onceki) => ({ ...onceki, [tip]: veri }));
      await paneliYukle(acikId);
      setMesaj({ tip: "ok", metin: `${TIP_ADI[tip]} başarıyla yüklendi.` });
    } catch (hata) {
      try {
        const panelVeri = await paneliYukle(acikId);
        const dosya = DOSYALAR.find((d) => d.tip === tip);
        const hazir = hazirlikFromDashboard(panelVeri.dashboard);
        const logVar = (panelVeri.loglar || []).some((log) =>
          (dosya?.logTipleri || [tip]).includes(log.tip)
        );
        if ((dosya?.hazirAnahtar && hazir[dosya.hazirAnahtar]) || logVar) {
          setSonuclar((onceki) => ({
            ...onceki,
            [tip]: { not: "İşlem tamamlanmış görünüyor." },
          }));
          setMesaj({
            tip: "ok",
            metin: `${TIP_ADI[tip]} yüklendi (yanıt gecikti, işlem tamamlanmış).`,
          });
          return;
        }
      } catch {
        /* panel kontrolü başarısız — orijinal hatayı göster */
      }
      setSonuclar((onceki) => ({ ...onceki, [tip]: { hata: hata.message } }));
      setMesaj({ tip: "hata", metin: hata.message });
    } finally {
      setYukleniyor(null);
    }
  }

  async function primHesapla() {
    if (!tumDosyalarHazir || !acikId) return;
    setHesaplaniyor(true);
    setMesaj({ tip: "notr", metin: "Prim hesaplanıyor, lütfen bekleyin…" });
    try {
      const cevap = await fetch(`/api/hesapla/${acikId}`, { method: "POST" });
      const ham = await cevap.text();
      let veri = {};
      try {
        veri = ham ? JSON.parse(ham) : {};
      } catch {
        // Proxy HTML döndürmüş olabilir — dönem durumundan kontrol et
        await new Promise((r) => setTimeout(r, 3000));
        const liste = await fetch("/api/donemler").then((r) => r.json()).catch(() => []);
        const donem = Array.isArray(liste)
          ? liste.find((d) => Number(d.id) === Number(acikId))
          : null;
        if (donem?.durum === "hesaplandi") {
          setDonemler(liste);
          setMesaj({ tip: "ok", metin: "Prim hesabı tamamlandı (yanıt gecikti). Rapor açılıyor…" });
          router.push(`/rapor?donem=${acikId}`);
          return;
        }
        throw new Error(
          "Hesaplama zaman aşımına uğradı veya sunucu HTML hata döndü. Biraz bekleyip sayfayı yenileyin; sonuç oluşmuş olabilir."
        );
      }
      if (!cevap.ok || veri.hata) throw new Error(veri.hata || "Prim hesabı tamamlanamadı");

      if (veri.jobId && veri.durum === "isleniyor") {
        const { sonuc } = await importSonucBekle(veri.jobId, "hesap");
        veri = sonuc || {};
      }

      await paneliYukle(acikId);
      setDonemler((liste) =>
        liste.map((item) =>
          Number(item.id) === Number(acikId) ? { ...item, durum: "hesaplandi" } : item
        )
      );
      setMesaj({
        tip: "ok",
        metin: `${say(veri.uzmanMagazaSayisi)} uzman-mağaza için ${tl(
          veri.toplamPrim
        )} prim hesaplandı. Rapor açılıyor…`,
      });
      router.push(`/rapor?donem=${acikId}`);
    } catch (hata) {
      setMesaj({ tip: "hata", metin: hata.message });
      setHesaplaniyor(false);
    }
  }

  if (sayfaYukleniyor) {
    return (
      <div className="prim-yukleniyor">
        <span />
        Bu ay hazırlanıyor…
      </div>
    );
  }

  return (
    <div className="prim-sayfa">
      <section className="ay-secici">
        <div className="ay-secici-baslik">
          <div>
            <span>Dönemler</span>
            <small>Bu yılın ayları · gelecek aylar kapalı</small>
          </div>
          <div className="yeni-yil-ac">
            <label htmlFor="yeni-yil-sec">Yeni yıl</label>
            <select
              id="yeni-yil-sec"
              className="yeni-yil-select"
              value={aktifYeniYil}
              disabled={yeniYilYukleniyor || !!yukleniyor || hesaplaniyor}
              onChange={(e) => setSeciliYeniYil(Number(e.target.value))}
            >
              {yilSecenekleri.map((yil) => (
                <option key={yil} value={yil}>
                  {yil}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn ikincil yeni-yil-btn"
              disabled={yeniYilYukleniyor || !!yukleniyor || hesaplaniyor}
              onClick={() => yeniYilDonemiAc(aktifYeniYil)}
            >
              {yeniYilYukleniyor ? "Açılıyor…" : "Dönem aç"}
            </button>
          </div>
        </div>
        <div className="donem-kutular ay-kutular" role="tablist" aria-label="Dönem seçimi">
          {donemler.map((donem) => {
            const simdi = new Date();
            const aktif = Number(acikId) === Number(donem.id);
            const buAy =
              Number(donem.yil) === simdi.getFullYear() &&
              Number(donem.ay) === simdi.getMonth() + 1;
            const gelecek =
              Number(donem.yil) > simdi.getFullYear()
              || (Number(donem.yil) === simdi.getFullYear() && Number(donem.ay) > simdi.getMonth() + 1);
            const donemPrim =
              Number(panel[donem.id]?.dashboard?.prim?.kayit || 0) > 0 ||
              donem.durum === "hesaplandi";
            const sinif = [
              aktif ? "aktif" : "",
              buAy ? "bu-ay" : "",
              donemPrim ? "hesaplandi" : "",
              gelecek ? "gelecek" : "",
            ].filter(Boolean).join(" ");
            return (
              <button
                key={donem.id}
                type="button"
                role="tab"
                aria-selected={aktif}
                aria-disabled={gelecek}
                disabled={gelecek}
                className={sinif}
                onClick={() => ayAc(donem)}
                title={gelecek ? "Bu ay henüz gelmedi" : donemPrim ? "Hesaplandı" : undefined}
              >
                <span>{donem.ad}</span>
                <small>
                  <i className={`donem-durum ${donemPrim ? "hesaplandi" : gelecek ? "kapandi" : donem.durum}`} />
                  {gelecek
                    ? "Bekliyor"
                    : buAy
                      ? (donemPrim ? "Bu ay · Hesaplandı" : "Bu ay")
                      : donemPrim
                        ? "Hesaplandı"
                        : donem.durum === "kapandi"
                          ? "Kapalı"
                          : "Açık"}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      {mesaj && <div className={`mesaj ${mesaj.tip}`}>{mesaj.metin}</div>}

      {acikDonem && (
        <section className="ay-panel" key={acikDonem.id}>
          <div className="ay-panel-baslik">
            <div>
              <span className="panel-adim">{String(acikDonem.ay).padStart(2, "0")}</span>
              <div>
                <h3>{acikDonem.ad}</h3>
                <p>
                  {DOSYALAR.filter(dosyaHazir).length}/{DOSYALAR.length} dosya yüklü
                </p>
              </div>
            </div>
          </div>

          <div className="dosya-grid">
            {DOSYALAR.map((dosya) => {
              const hazir = dosyaHazir(dosya);
              const sonuc = sonuclar[dosya.tip];
              return (
                <article
                  key={dosya.tip}
                  className={`dosya-kart ${hazir ? "hazir" : ""} ${
                    yukleniyor === dosya.tip ? "yukleniyor" : ""
                  }`}
                >
                  <div className="dosya-ikon">
                    <Ikon tip={hazir ? "check" : "upload"} />
                  </div>
                  <div className="dosya-bilgi">
                    <div>
                      <h4>{dosya.baslik}</h4>
                      <span className="zorunlu">Zorunlu</span>
                    </div>
                    <p>{dosya.kisa}</p>
                    <small className="dosya-format">
                      Sadece şu formatlarda dosya gönderebilirsiniz: .xlsx, .xls, .csv
                    </small>
                    {sonuc?.hata && <small className="dosya-hata">{sonuc.hata}</small>}
                  </div>
                  <label
                    className={`dosya-sec ${yukleniyor === dosya.tip ? "aktif-yukleme" : ""} ${
                      yukleniyor && yukleniyor !== dosya.tip ? "kilitli" : ""
                    }`}
                    aria-live="polite"
                    onClick={(event) => {
                      if (yukleniyor || hesaplaniyor) {
                        event.preventDefault();
                        event.stopPropagation();
                        setBekletUyari(true);
                      }
                    }}
                  >
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      disabled={
                        !!yukleniyor ||
                        hesaplaniyor ||
                        acikDonem.durum === "kapandi"
                      }
                      onChange={(event) => {
                        dosyaGonder(dosya.tip, event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    {yukleniyor === dosya.tip ? (
                      <>
                        <span className="yukleme-spinner" />
                        Yükleniyor…
                      </>
                    ) : hazir ? (
                      "Yenile"
                    ) : (
                      "Dosya seç"
                    )}
                  </label>
                </article>
              );
            })}
          </div>

          {(acikPanel.loglar || []).length > 0 && (
            <details className="bu-ay-log">
              <summary>Yüklenen dosyalar ({acikPanel.loglar.length})</summary>
              <div className="mini-log-listesi">
                {acikPanel.loglar.map((log) => (
                  <div key={log.id}>
                    <span className="mini-dosya-ikon">XLS</span>
                    <span>
                      <strong>{log.dosya_adi}</strong>
                      <small>
                        {TIP_ADI[log.tip] || log.tip} · {say(log.satir_sayisi)} satır
                      </small>
                    </span>
                    <time>{new Date(log.created_at).toLocaleString("tr-TR")}</time>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="panel-alt">
            <div className="panel-alt-sol">
              <p>
                {tumDosyalarHazir
                  ? "Tüm dosyalar hazır. Prim hesaplanabilir."
                  : "Tüm dosyaları yükleyin."}
              </p>
              {primVar && (
                <p className="panel-alt-ikincil">Bu dönem için hesap sonucu mevcut.</p>
              )}
              <button
                type="button"
                className="btn tehlike temizle-btn"
                disabled={
                  temizleniyor ||
                  !!yukleniyor ||
                  hesaplaniyor ||
                  acikDonem.durum === "kapandi" ||
                  (!primVar && DOSYALAR.filter(dosyaHazir).length === 0 && !(acikPanel.loglar || []).length)
                }
                onClick={() => setTemizleOnay(true)}
              >
                {temizleniyor ? "Temizleniyor…" : "Temizle"}
              </button>
            </div>
            <div className="panel-alt-aksiyonlar">
              <button
                className="btn prim-cta"
                disabled={
                  !tumDosyalarHazir ||
                  !!yukleniyor ||
                  hesaplaniyor ||
                  acikDonem.durum === "kapandi"
                }
                onClick={primHesapla}
              >
                {hesaplaniyor ? (
                  <>
                    <span className="yukleme-spinner" />
                    Hesaplanıyor…
                  </>
                ) : primVar ? (
                  <>
                    Yeniden hesapla <span>→</span>
                  </>
                ) : (
                  <>
                    Primi hesapla <span>→</span>
                  </>
                )}
              </button>
              {(primVar || acikDonem.durum === "hesaplandi") && (
                <Link href={`/rapor?donem=${acikDonem.id}`} className="btn ikincil">
                  Prim raporunu görüntüle
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {temizleOnay && (
        <div
          className="prim-uyari-arka"
          role="presentation"
          onClick={() => !temizleniyor && setTemizleOnay(false)}
        >
          <div
            className="prim-uyari-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="prim-temizle-baslik"
            aria-describedby="prim-temizle-metin"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="prim-uyari-ikon prim-uyari-ikon-tehlike" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3 2 21h20L12 3z" />
                <path d="M12 10v5M12 17.5h.01" />
              </svg>
            </div>
            <span className="prim-uyari-etiket">Dikkat</span>
            <h3 id="prim-temizle-baslik">Dönem verileri silinsin mi?</h3>
            <p id="prim-temizle-metin">
              <strong>{acikDonem?.ad}</strong> dönemine yüklenen tüm Excel verileri
              (uzman-mağaza, sell-out, zeops, hedef, sıralama) ve bu dönem için
              hesaplanan prim raporu kalıcı olarak silinecektir. Stok listesi
              (ürün master) korunur. Bu işlem geri alınamaz.
            </p>
            <div className="prim-uyari-butonlar">
              <button
                type="button"
                className="btn ikincil"
                disabled={temizleniyor}
                onClick={() => setTemizleOnay(false)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="btn tehlike"
                disabled={temizleniyor}
                onClick={donemTemizle}
              >
                {temizleniyor ? "Temizleniyor…" : "Evet, temizle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bekletUyari && (
        <div
          className="prim-uyari-arka"
          role="presentation"
          onClick={() => setBekletUyari(false)}
        >
          <div
            className="prim-uyari-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="prim-uyari-baslik"
            aria-describedby="prim-uyari-metin"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="prim-uyari-ikon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6M12 16.5h.01" />
              </svg>
            </div>
            <span className="prim-uyari-etiket">Bilgilendirme</span>
            <h3 id="prim-uyari-baslik">
              {hesaplaniyor ? "Hesaplama devam ediyor" : "Yükleme devam ediyor"}
            </h3>
            <p id="prim-uyari-metin">
              {hesaplaniyor ? (
                <>
                  Sabrınız için teşekkür ederiz. Şu anda prim hesabı devam etmektedir.
                  Lütfen işlemin tamamlanmasını bekleyiniz.
                </>
              ) : (
                <>
                  Sabrınız için teşekkür ederiz. Şu anda bir dosya yükleme aşamasındadır.
                  Lütfen mevcut yüklemenin tamamlanmasını bekleyiniz; ardından diğer
                  dosyaları yükleyebilirsiniz.
                  {yukleniyor ? (
                    <>
                      {" "}
                      <strong>Şu an yüklenen:</strong> {TIP_ADI[yukleniyor] || yukleniyor}
                    </>
                  ) : null}
                </>
              )}
            </p>
            <div className="prim-uyari-butonlar">
              <button type="button" className="btn" onClick={() => setBekletUyari(false)}>
                Anladım, bekliyorum
              </button>
            </div>
          </div>
        </div>
      )}

      {bilgiModal && (
        <div
          className="prim-uyari-arka"
          role="presentation"
          onClick={() => setBilgiModal(null)}
        >
          <div
            className="prim-uyari-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="prim-yil-uyari-baslik"
            aria-describedby="prim-yil-uyari-metin"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="prim-uyari-ikon prim-uyari-ikon-yil" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
            </div>
            <span className="prim-uyari-etiket">Dönem açma</span>
            <h3 id="prim-yil-uyari-baslik">{bilgiModal.baslik}</h3>
            <p id="prim-yil-uyari-metin">{bilgiModal.metin}</p>
            <div className="prim-uyari-butonlar">
              <button type="button" className="btn" onClick={() => setBilgiModal(null)}>
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
