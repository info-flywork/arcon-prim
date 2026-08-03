"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import DonemSec from "../components/DonemSec";

async function api(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok || data.hata) throw new Error(data.hata || "İşlem başarısız");
  return data;
}

const DURUM = {
  urun_yok: {
    kisa: "Ürün yok",
    aciklama: "Satış satırındaki barkod/referans, sistemdeki ürün listesinde yok.",
  },
  magaza_yok: {
    kisa: "Mağaza yok",
    aciklama: "Dosyadaki mağaza adı, sistemdeki standart mağaza adıyla eşleşmedi.",
  },
  uzman_yok: {
    kisa: "Uzman yok",
    aciklama: "Dosyadaki uzman adı sistemde kayıtlı değil.",
  },
  atama_yok: {
    kisa: "Atama yok",
    aciklama: "Uzman var ama bu dönemde o mağazaya atanmamış (Uzman-Mağaza-Grup).",
  },
  urun_cakisma: {
    kisa: "Ürün çakışması",
    aciklama: "Aynı barkod/referans birden fazla ürüne bağlı; hangisi olduğu belli değil.",
  },
  kimlik_gecersiz: {
    kisa: "Kimlik geçersiz",
    aciklama: "Barkod veya referans boş/okunaksız.",
  },
};

function durumEtiket(kod) {
  return DURUM[kod]?.kisa || kod;
}

export default function Eslesmeyen() {
  const [donem, setDonem] = useState(null);
  const [veri, setVeri] = useState(null);
  const [magazalar, setMagazalar] = useState([]);
  const [secili, setSecili] = useState(null);
  const [urunQ, setUrunQ] = useState("");
  const [urunler, setUrunler] = useState([]);
  const [urunId, setUrunId] = useState("");
  const [mesaj, setMesaj] = useState(null);
  const [yeni, setYeni] = useState({ uniq_kod: "", marka: "", urun_adi: "" });

  const yenile = () => {
    if (!donem) return;
    fetch(`/api/eslesmeyen/${donem}`).then((r) => r.json()).then(setVeri);
  };

  useEffect(() => { yenile(); }, [donem]);
  useEffect(() => {
    fetch("/api/magazalar").then((r) => r.json()).then(setMagazalar);
  }, []);

  async function urunAra(q) {
    setUrunQ(q);
    if (q.trim().length < 2) return setUrunler([]);
    setUrunler(await api(`/api/urunler?q=${encodeURIComponent(q)}`));
  }

  async function kimlikBagla(tip) {
    if (!urunId || !secili) return;
    try {
      if (secili.cakismaId) {
        await api(`/api/urun-cakismalari/${secili.cakismaId}/coz`, "POST", {
          urun_id: Number(urunId), donem_id: Number(donem),
        });
      } else {
        const deger = tip === "barkod" ? secili.barkod : secili.kod;
        if (!deger) throw new Error(`${tip} değeri boş`);
        await api(`/api/urunler/${urunId}/kimlik`, "POST", {
          tip, deger, donem_id: Number(donem), kaynak: secili.kaynak || "manuel",
        });
      }
      setMesaj({ tip: "ok", metin: "Kimlik bağlandı ve açık dönem yeniden eşlendi." });
      setSecili(null);
      yenile();
    } catch (error) {
      setMesaj({ tip: "hata", metin: error.message });
    }
  }

  async function yeniUrunOlustur() {
    if (!secili) return;
    try {
      const identifiers = [];
      if (secili.barkod) identifiers.push({ tip: "barkod", deger: secili.barkod, kaynak: secili.kaynak || "manuel" });
      if (secili.kod) identifiers.push({ tip: "referans", deger: secili.kod, kaynak: secili.kaynak || "manuel" });
      await api("/api/urunler", "POST", {
        ...yeni,
        urun_adi: yeni.urun_adi || secili.etiket,
        identifiers,
        donem_id: Number(donem),
      });
      setMesaj({ tip: "ok", metin: "Yeni ürün oluşturuldu ve dönem yeniden eşlendi." });
      setYeni({ uniq_kod: "", marka: "", urun_adi: "" });
      setSecili(null);
      yenile();
    } catch (error) {
      setMesaj({ tip: "hata", metin: error.message });
    }
  }

  async function aliasEkle(ham, magazaId) {
    if (!magazaId) return;
    await api("/api/magaza-alias", "POST", { alias: ham, magaza_id: Number(magazaId), kaynak: "zeops" });
    setMesaj({ tip: "ok", metin: "Mağaza eşlemesi kaydedildi. Dönemi yeniden eşleyin." });
  }

  async function yenidenEsle() {
    try {
      await api(`/api/donemler/${donem}/urunleri-yeniden-esle`, "POST");
      setMesaj({ tip: "ok", metin: "Açık dönem ürünleri yeniden eşlendi." });
      yenile();
    } catch (error) {
      setMesaj({ tip: "hata", metin: error.message });
    }
  }

  function UrunTablosu({ baslik, alt, satirlar, kaynak }) {
    if (!satirlar?.length) return null;
    return (
      <div className="yukle-kart" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>{baslik}</h3>
        {alt && <p className="ipucu" style={{ marginTop: 0 }}>{alt}</p>}
        <table>
          <thead>
            <tr>
              <th>Sorun</th>
              <th>Barkod (dosyadan)</th>
              <th>Referans/Kod (dosyadan)</th>
              <th>Ürün adı (dosyadan)</th>
              <th className="sag">Adet</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((u, i) => (
              <tr key={`${kaynak}-${i}`}>
                <td>
                  <span className="rozet hata">{durumEtiket(u.eslesme_durum)}</span>
                  <div style={{ fontSize: 11, color: "var(--metin-2)", marginTop: 4, maxWidth: 180 }}>
                    {DURUM[u.eslesme_durum]?.aciklama}
                  </div>
                </td>
                <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{u.barkod || "—"}</td>
                <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{u.kod || "—"}</td>
                <td>{u.etiket || "—"}</td>
                <td className="sag">{Number(u.adet || 0).toLocaleString("tr-TR")}</td>
                <td>
                  <button className="btn ikincil" onClick={() => {
                    setSecili({ ...u, kaynak });
                    setYeni((old) => ({ ...old, urun_adi: u.etiket || "" }));
                  }}>Ürüne bağla</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const kartlar = [
    ...(veri?.ozet || []).map((o) => ({ kaynak: "Zeops", ...o })),
    ...(veri?.selloutOzet || []).map((o) => ({ kaynak: "Sell-out", ...o })),
  ];

  return (
    <div>
      <h2>Satış satırı sorunları</h2>

      <div className="yukle-kart" style={{ marginBottom: 20, background: "var(--vurgu-acik, #f5f8ff)" }}>
        <h3 style={{ marginTop: 0 }}>Bu sayfa ne işe yarar?</h3>
        <p style={{ marginBottom: 8 }}>
          <b>Hedef / Uniq / Stok karşılaştırması değildir.</b>{" "}
          Yüklediğiniz <b>Zeops</b> veya <b>Sell-out</b> Excel’indeki her satış satırı,
          sistemdeki ürün–mağaza–uzman kayıtlarıyla eşleştirilir. Eşleşmeyen satırlar burada listelenir;
          prim hesabına girmezler.
        </p>
        <ul style={{ margin: "0 0 8px", paddingLeft: 18, color: "var(--metin-2)", fontSize: 14, lineHeight: 1.55 }}>
          <li><b>Ürün yok</b> → Dosyadaki barkod sistem ürün listesinde yok (Stok/Uniq’te olsa bile bu barkod bağlı değilse “yok” görünür).</li>
          <li><b>Mağaza yok</b> → Dosyadaki mağaza yazımı sistemdeki adla aynı değil.</li>
          <li><b>Uzman yok / Atama yok</b> → Uzman kaydı veya o dönem Uzman-Mağaza ataması eksik.</li>
        </ul>
        <p className="ipucu" style={{ marginBottom: 0 }}>
          Uniq Kod ↔ Stok Liste için: <Link href="/uniq-fark">Uniq Kod Farkları</Link> ·
          Dosya yüklemek için: <Link href="/yukle">Prim Hesaplama</Link>
        </p>
      </div>

      <DonemSec value={donem} onChange={setDonem} />
      {donem && (
        <button className="btn ikincil" onClick={yenidenEsle} style={{ marginLeft: 8 }}>
          Dönemi yeniden eşle
        </button>
      )}
      {mesaj && <div className={`mesaj ${mesaj.tip}`}>{mesaj.metin}</div>}

      {veri && (
        <>
          <div className="kartlar">
            {kartlar.map((o) => (
              <div className="kart" key={`${o.kaynak}-${o.eslesme_durum}`}>
                <div className="etiket">{o.kaynak} · {durumEtiket(o.eslesme_durum)}</div>
                <div className="deger">{Number(o.sayi).toLocaleString("tr-TR")}</div>
                <div style={{ fontSize: 12, color: "var(--metin-2)", marginTop: 6 }}>
                  {DURUM[o.eslesme_durum]?.aciklama || o.eslesme_durum}
                </div>
              </div>
            ))}
            {kartlar.length === 0 && (
              <div className="mesaj ok">Bu dönemde satış satırı sorunu yok — hepsi eşleşmiş.</div>
            )}
          </div>

          <UrunTablosu
            baslik="Zeops’ta ürün bulunamayan satırlar"
            alt="Kaynak: Zeops Ham Data Excel. Barkod/referans sistem ürününe bağlanamadı."
            satirlar={veri.urunler}
            kaynak="zeops"
          />
          <UrunTablosu
            baslik="Sell-out’ta ürün bulunamayan satırlar"
            alt="Kaynak: Sell-out Data Excel. Arcon barkod/referans sistem ürününe bağlanamadı."
            satirlar={veri.selloutUrunler}
            kaynak="sellout"
          />

          {secili && (
            <div className="yukle-kart" style={{ marginTop: 20 }}>
              <h3>Ürüne bağla: {secili.etiket || secili.deger_ham}</h3>
              <p className="aciklama">
                Dosyadaki barkod: <b>{secili.barkod || "—"}</b> · referans: <b>{secili.kod || "—"}</b>
                <br />
                Mevcut bir ürüne bağlarsanız bu barkod/referans o ürünün kimliği olur; sonraki yüklemelerde otomatik eşleşir.
              </p>
              <div className="satir">
                <input value={urunQ} onChange={(event) => urunAra(event.target.value)}
                  placeholder="Mevcut ürünü ad, UNIQ, barkod veya referansla ara" style={{ width: 380 }} />
                <select value={urunId} onChange={(event) => setUrunId(event.target.value)} style={{ minWidth: 360 }}>
                  <option value="">— ürün seç —</option>
                  {urunler.map((u) => <option key={u.id} value={u.id}>{u.uniq_kod} · {u.marka} · {u.urun_adi}</option>)}
                </select>
                {secili.cakismaId
                  ? <button className="btn" onClick={() => kimlikBagla(secili.tip)}>Çakışmayı bu ürüne çöz</button>
                  : <>
                      <button className="btn" disabled={!secili.barkod} onClick={() => kimlikBagla("barkod")}>Barkodu bağla</button>
                      <button className="btn ikincil" disabled={!secili.kod} onClick={() => kimlikBagla("referans")}>Referansı bağla</button>
                    </>}
              </div>
              {!secili.cakismaId && (
                <>
                  <h3 style={{ marginTop: 18 }}>Yeni ürün oluştur</h3>
                  <div className="satir">
                    <input placeholder="UNIQ kod (zorunlu)" value={yeni.uniq_kod}
                      onChange={(e) => setYeni({ ...yeni, uniq_kod: e.target.value })} />
                    <input placeholder="Marka (zorunlu)" value={yeni.marka}
                      onChange={(e) => setYeni({ ...yeni, marka: e.target.value })} />
                    <input placeholder="Ürün adı" value={yeni.urun_adi}
                      onChange={(e) => setYeni({ ...yeni, urun_adi: e.target.value })} style={{ width: 320 }} />
                    <button className="btn" onClick={yeniUrunOlustur}>Oluştur ve bağla</button>
                  </div>
                </>
              )}
            </div>
          )}

          {veri.cakismalar?.length > 0 && (
            <div className="yukle-kart" style={{ marginTop: 20 }}>
              <h3 style={{ marginTop: 0 }}>Kimlik çakışmaları</h3>
              <p className="ipucu">Aynı barkod/kod birden fazla ürüne aday — birini seçip çözün.</p>
              <table>
                <thead><tr><th>Tip</th><th>Değer</th><th>Kaynak</th><th>Aday ürünler</th><th></th></tr></thead>
                <tbody>
                  {veri.cakismalar.map((c) => (
                    <tr key={c.id}>
                      <td>{c.tip}</td>
                      <td>{c.deger_ham || c.deger_normalize}</td>
                      <td>{c.kaynak}</td>
                      <td><code style={{ fontSize: 11 }}>{typeof c.aday_urunler_json === "string" ? c.aday_urunler_json : JSON.stringify(c.aday_urunler_json)}</code></td>
                      <td><button className="btn ikincil" onClick={() => setSecili({
                        cakismaId: c.id, tip: c.tip, deger_ham: c.deger_ham,
                      })}>Çöz</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {veri.magazalar.length > 0 && (
            <div className="yukle-kart" style={{ marginTop: 20 }}>
              <h3 style={{ marginTop: 0 }}>Mağaza adı eşleşmeyenler</h3>
              <p className="ipucu">Zeops’taki yazımı standart mağazaya bağlayın (alias).</p>
              <table>
                <thead>
                  <tr><th>Dosyadaki ad</th><th className="sag">Satır</th><th>Standart mağaza</th></tr>
                </thead>
                <tbody>
                  {veri.magazalar.map((m, i) => (
                    <tr key={i}>
                      <td>{m.magaza_ham}</td>
                      <td className="sag">{m.satir}</td>
                      <td>
                        <select defaultValue="" onChange={(e) => aliasEkle(m.magaza_ham, e.target.value)}>
                          <option value="">— seç —</option>
                          {magazalar.map((mg) => (
                            <option key={mg.id} value={mg.id}>{mg.prim_magaza}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {veri.uzmanlar.length > 0 && (
            <div className="yukle-kart" style={{ marginTop: 20 }}>
              <h3 style={{ marginTop: 0 }}>Uzman / atama sorunları</h3>
              <p className="ipucu">
                Çözüm: bu dönem için <Link href="/yukle">Uzman-Mağaza-Grup Excel</Link> dosyasını
                Prim Hesaplama ekranından yeniden yükleyin.
              </p>
              <table>
                <thead>
                  <tr><th>Uzman (dosyadaki)</th><th>Mağaza (dosyadaki)</th><th className="sag">Satır</th></tr>
                </thead>
                <tbody>
                  {veri.uzmanlar.map((u, i) => (
                    <tr key={i}>
                      <td>{u.uzman_ham}</td>
                      <td>{u.magaza_ham}</td>
                      <td className="sag">{u.satir}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
