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
        const ilkAcik = liste.find((item) => item.durum === "acik");
        const secili =
          (queryDonem && liste.find((item) => Number(item.id) === queryDonem)) ||
          ilkAcik ||
          buAy;
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

  async function ayAc(donem) {
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

  async function dosyaGonder(tip, file) {
    if (!file || !acikId) return;
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
        throw new Error(
          cevap.ok
            ? "Sunucu beklenmeyen yanıt döndü"
            : "Yükleme zaman aşımına uğradı veya sunucu hata verdi. Sayfayı yenileyip tekrar deneyin."
        );
      }
      if (!cevap.ok || veri.hata) throw new Error(veri.hata || "Dosya yüklenemedi");
      setSonuclar((onceki) => ({ ...onceki, [tip]: veri }));
      await paneliYukle(acikId);
      setMesaj({ tip: "ok", metin: `${TIP_ADI[tip]} başarıyla yüklendi.` });
    } catch (hata) {
      setSonuclar((onceki) => ({ ...onceki, [tip]: { hata: hata.message } }));
      setMesaj({ tip: "hata", metin: hata.message });
    } finally {
      setYukleniyor(null);
    }
  }

  async function primHesapla() {
    if (!tumDosyalarHazir || !acikId) return;
    setHesaplaniyor(true);
    setMesaj(null);
    try {
      const cevap = await fetch(`/api/hesapla/${acikId}`, { method: "POST" });
      const veri = await cevap.json();
      if (!cevap.ok || veri.hata) throw new Error(veri.hata || "Prim hesabı tamamlanamadı");
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
      <header className="prim-hero">
        <div>
          <span className="prim-kicker">Aylık prim akışı</span>
          <h2>Prim Hesaplama</h2>
          <p>Ayı seçin, dosyaları yükleyin ve primi hesaplayın.</p>
        </div>
        {acikDonem && (
          <div className="aktif-donem">
            <span>Seçili dönem</span>
            <strong>{acikDonem.ad}</strong>
            <small>
              {primVar
                ? "Hesaplandı"
                : acikDonem.durum === "acik"
                  ? "Yüklemeye hazır"
                  : acikDonem.durum}
            </small>
          </div>
        )}
      </header>

      <section className="ay-secici">
        <div className="ay-secici-baslik">
          <span>Dönemler</span>
          <small>Tıklayınca ay açılır</small>
        </div>
        <div className="donem-kutular ay-kutular" role="tablist" aria-label="Dönem seçimi">
          {donemler.map((donem) => {
            const aktif = Number(acikId) === Number(donem.id);
            const buAy =
              Number(donem.yil) === new Date().getFullYear() &&
              Number(donem.ay) === new Date().getMonth() + 1;
            const donemPrim =
              Number(panel[donem.id]?.dashboard?.prim?.kayit || 0) > 0 ||
              donem.durum === "hesaplandi";
            return (
              <button
                key={donem.id}
                type="button"
                role="tab"
                aria-selected={aktif}
                className={aktif ? "aktif" : ""}
                onClick={() => ayAc(donem)}
              >
                <span>{donem.ad}</span>
                <small>
                  <i className={`donem-durum ${donemPrim ? "hesaplandi" : donem.durum}`} />
                  {buAy ? "Bu ay" : donemPrim ? "Hesaplandı" : donem.durum === "kapandi" ? "Kapalı" : "Açık"}
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
                    {sonuc?.hata && <small className="dosya-hata">{sonuc.hata}</small>}
                  </div>
                  <label
                    className={`dosya-sec ${yukleniyor === dosya.tip ? "aktif-yukleme" : ""}`}
                    aria-live="polite"
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
            <div>
              <p>
                {tumDosyalarHazir
                  ? "Tüm dosyalar hazır. Prim hesaplanabilir."
                  : "Tüm dosyaları yükleyin."}
              </p>
              {primVar && (
                <p className="panel-alt-ikincil">Bu dönem için hesap sonucu mevcut.</p>
              )}
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
              {primVar && (
                <Link href={`/rapor?donem=${acikDonem.id}`} className="btn ikincil">
                  Prim raporunu görüntüle
                </Link>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
