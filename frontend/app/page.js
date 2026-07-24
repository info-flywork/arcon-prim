"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import DonemSec from "./components/DonemSec";

const tl = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " TL");
const say = (v) => (v == null ? "—" : Number(v).toLocaleString("tr-TR"));

export default function Ozet() {
  const [donem, setDonem] = useState(null);
  const [veri, setVeri] = useState(null);
  const [mesaj, setMesaj] = useState(null);

  useEffect(() => {
    if (!donem) return;
    fetch(`/api/dashboard/${donem}`).then((r) => r.json()).then(setVeri);
  }, [donem]);

  return (
    <div>
      <h2>Dönem Özeti</h2>
      <p className="aciklama">
        Bu sayfa dönemin durumunu gösterir. Dosya yükleme ve prim hesabı
        {" "}<Link href="/yukle">Veri Yükleme</Link> sayfasında yapılır.
      </p>
      <DonemSec value={donem} onChange={setDonem} />
      {veri && (
        <>
          <div className="kartlar">
            <div className="kart">
              <div className="etiket">Zeops Beyan</div>
              <div className="deger">{say(veri.beyan?.satir)}</div>
              <div className="alt">{say(veri.beyan?.eslesmeyen)} eşleşmeyen satır</div>
            </div>
            <div className="kart">
              <div className="etiket">Sell-out</div>
              <div className="deger">{say(veri.sellout?.satir)}</div>
              <div className="alt">{tl(veri.sellout?.ciro)} KDV hariç ciro</div>
            </div>
            <div className="kart">
              <div className="etiket">Hedef / Sıralama</div>
              <div className="deger">{say(veri.hedef?.satir)} / {say(veri.siralama?.satir)}</div>
              <div className="alt">satır</div>
            </div>
            <div className="kart">
              <div className="etiket">Uzman Ataması</div>
              <div className="deger">{say(veri.atama?.satir)}</div>
              <div className="alt">uzman × mağaza</div>
            </div>
            <div className="kart">
              <div className="etiket">Toplam Prim</div>
              <div className="deger">{tl(veri.prim?.toplam)}</div>
              <div className="alt">{say(veri.prim?.kayit)} kayıt · esas {tl(veri.prim?.esas)}</div>
            </div>
          </div>

          <div className="yukle-kart">
            <h3>Sıradaki adım</h3>
            {Number(veri.prim?.kayit || 0) === 0 ? (
              <>
                <p>Önce Excel dosyalarını yükleyip prim hesabını çalıştırın.</p>
                <div className="satir">
                  <Link className="btn" href="/yukle">Veri Yükleme → Prim Hesapla</Link>
                  {Number(veri.beyan?.eslesmeyen || 0) > 0 && (
                    <Link className="btn ikincil" href="/eslesmeyen">Eşleşmeyenleri kontrol et</Link>
                  )}
                </div>
              </>
            ) : (
              <>
                <p>Bu dönem için prim hesabı hazır. Sonuçlara bakabilir veya dönemi kilitleyebilirsiniz.</p>
                <div className="satir">
                  <Link className="btn" href="/rapor">Prim Raporu</Link>
                  <Link className="btn ikincil" href="/mutabakat">Satır Kontrol (Maviler)</Link>
                  <a className="btn ikincil" href={`/api/mutabakat/${donem}/export`} download>Satır Kontrol Excel</a>
                  <a className="btn ikincil" href={`/api/rapor/ozet/${donem}?format=xlsx`} download>Prim Raporu Excel</a>
                </div>
              </>
            )}
          </div>

          <div className="satir" style={{ marginTop: 16 }}>
            <button className="btn ikincil" onClick={async () => {
              const kapali = confirm("Dönemi KAPATMAK istiyor musunuz? Kapalı döneme veri yüklenemez, hesap çalıştırılamaz. (İptal = dönemi AÇ)");
              const r = await fetch(`/api/donemler/${donem}/durum`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ durum: kapali ? "kapandi" : "acik" }),
              });
              const d = await r.json();
              setMesaj(d.hata ? { tip: "hata", metin: d.hata } : { tip: "ok", metin: kapali ? "Dönem kapatıldı" : "Dönem açıldı" });
            }}>Dönemi Kilitle / Aç</button>
          </div>
          {mesaj && <div className={`mesaj ${mesaj.tip}`}>{mesaj.metin}</div>}
        </>
      )}
    </div>
  );
}
