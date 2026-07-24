"use client";
import { useEffect, useState } from "react";

async function api(url, method = "GET", body) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const metin = await r.text();
  try { return JSON.parse(metin); } catch { return { hata: `Backend'e ulaşılamadı (${r.status})` }; }
}

export default function Tanimlar() {
  const [magazalar, setMagazalar] = useState([]);
  const [uzmanlar, setUzmanlar] = useState([]);
  const [urunQ, setUrunQ] = useState("");
  const [urunler, setUrunler] = useState([]);
  const [mesaj, setMesaj] = useState(null);
  const bildir = (d, ok) => setMesaj(d.hata ? { tip: "hata", metin: d.hata } : { tip: "ok", metin: ok });

  const yukle = () => {
    api("/api/magazalar").then(setMagazalar);
    api("/api/uzmanlar").then(setUzmanlar);
  };
  useEffect(yukle, []);

  async function urunAra(q) {
    setUrunQ(q);
    if (q.trim().length < 3) return setUrunler([]);
    setUrunler(await api(`/api/urunler?q=${encodeURIComponent(q)}`));
  }

  async function alanDuzelt(url, alan, mevcutDeger, etiket) {
    const v = prompt(`${etiket}:`, mevcutDeger ?? "");
    if (v === null) return;
    bildir(await api(url, "PUT", { [alan]: v }), "Kaydedildi");
    yukle();
    if (urunQ) urunAra(urunQ);
  }

  async function kimlikEkle(urun) {
    const tip = prompt("Kimlik tipi: barkod, referans veya stok_kodu", "barkod");
    if (!tip) return;
    const deger = prompt(`${tip} değeri:`);
    if (!deger) return;
    bildir(await api(`/api/urunler/${urun.id}/kimlik`, "POST", { tip, deger }), "Kimlik eklendi");
    urunAra(urunQ);
  }

  async function urunBirlestir(urun) {
    const hedef = prompt(`"${urun.urun_adi}" hangi hedef ürün ID ile birleştirilsin?`);
    if (!hedef) return;
    bildir(await api(`/api/urunler/${urun.id}/birlestir`, "POST", { hedef_urun_id: Number(hedef) }), "Ürünler birleştirildi");
    urunAra(urunQ);
  }

  return (
    <div>
      <h2>Tanımlar</h2>
      <p className="aciklama">
        Master veriler burada elle yönetilir; Excel yüklemesi de aynı tablolara yazar. Her değişiklik
        Değişiklik Geçmişi'ne kaydedilir. Bir alanı düzeltmek için üzerine tıklayın.
      </p>
      {mesaj && <div className={`mesaj ${mesaj.tip}`}>{mesaj.metin}</div>}

      <div className="yukle-kart">
        <h3>Kanonik ürünler — barkod, referans, ad ya da UNIQ kodla arayın</h3>
        <div className="satir">
          <input type="text" style={{ width: 340 }} placeholder="en az 3 karakter: 3349668... / INVICTUS / PPR0000..."
            value={urunQ} onChange={(e) => urunAra(e.target.value)} />
        </div>
        {urunler.length > 0 && (
          <table>
            <thead>
              <tr><th>ID</th><th>Marka</th><th>Ürün</th><th>Kimlikler</th><th>UNIQ Kod</th><th>Durum</th><th></th></tr>
            </thead>
            <tbody>
              {urunler.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td style={{ cursor: "pointer" }} title="Düzelt"
                      onClick={() => alanDuzelt(`/api/urunler/${u.id}`, "marka", u.marka, "Marka")}>{u.marka}</td>
                  <td style={{ cursor: "pointer" }} title="Düzelt"
                      onClick={() => alanDuzelt(`/api/urunler/${u.id}`, "urun_adi", u.urun_adi, "Ürün adı")}>{u.urun_adi}</td>
                  <td>
                    {(u.kimlikler || []).map((k) => (
                      <span key={k.id} className="rozet notr" style={{ margin: "2px 4px 2px 0" }}>
                        {k.tip}: {k.deger}
                      </span>
                    ))}
                  </td>
                  <td style={{ cursor: "pointer" }} title="Düzelt — aynı ürünün diğer barkodlarıyla ortak kod"
                      onClick={() => alanDuzelt(`/api/urunler/${u.id}`, "uniq_kod", u.uniq_kod, "UNIQ kod")}>
                    {u.uniq_kod}
                  </td>
                  <td>
                    <span className={`rozet ${u.durum === "aktif" ? "ok" : "hata"}`}>{u.durum}</span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn ikincil" onClick={() => kimlikEkle(u)}>+ kimlik</button>{" "}
                    <button className="btn ikincil" onClick={() => urunBirlestir(u)}>birleştir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="yukle-kart">
        <h3>Mağazalar ({magazalar.length})</h3>
        <p className="ipucu" style={{ marginTop: 0 }}>
          Mağaza ve bayi, <a href="/yukle">Uzman-Mağaza-Grup Excel</a> yüklenince otomatik gelir (yeniler eklenir, mevcutların bayi/şehir bilgisi güncellenir). Burada sadece düzeltme/pasifleştirme yapılır.
        </p>
        <table>
          <thead>
            <tr><th>Bayi</th><th>Prim Mağaza</th><th>Şehir</th><th>Durum</th></tr>
          </thead>
          <tbody>
            {magazalar.map((m) => (
              <tr key={m.id}>
                <td>{m.bayi}</td>
                <td style={{ cursor: "pointer" }} title="Düzelt"
                    onClick={() => alanDuzelt(`/api/magazalar/${m.id}`, "prim_magaza", m.prim_magaza, "Prim mağaza adı")}>{m.prim_magaza}</td>
                <td style={{ cursor: "pointer" }} title="Düzelt"
                    onClick={() => alanDuzelt(`/api/magazalar/${m.id}`, "sehir", m.sehir, "Şehir")}>{m.sehir || "—"}</td>
                <td>
                  <button className="btn ikincil" onClick={async () => {
                    bildir(await api(`/api/magazalar/${m.id}`, "PUT", { aktif: m.aktif ? 0 : 1 }), "Güncellendi"); yukle();
                  }}>{m.aktif ? "Aktif → pasifle" : "Pasif → aktifle"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="yukle-kart">
        <h3>Uzmanlar ({uzmanlar.length})</h3>
        <p className="ipucu" style={{ marginTop: 0 }}>
          Yeni uzman eklemek için burayı kullanmayın — <a href="/yukle">Uzman-Mağaza-Grup Excel</a> yüklenince
          DB’de yoksa otomatik eklenir (bayi/mağaza/grup ile birlikte atama da yazılır).
          {uzmanlar[0]?.gorev_donem_ad
            ? <> Görevler şu an <b>{uzmanlar[0].gorev_donem_ad}</b> dönemine ait.</>
            : null}
          {" "}Senaryo düzeltme: <a href="/atamalar">Uzman Atamaları</a>
        </p>
        <table>
          <thead>
            <tr>
              <th>Ad Soyad</th>
              <th>
                Görev
                {uzmanlar[0]?.gorev_donem_ad ? ` (${uzmanlar[0].gorev_donem_ad}: bayi / mağaza — marka grubu)` : " (bayi / mağaza — marka grubu)"}
              </th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {uzmanlar.map((u) => (
              <tr key={u.id}>
                <td style={{ cursor: "pointer", whiteSpace: "nowrap" }} title="Düzelt"
                    onClick={() => alanDuzelt(`/api/uzmanlar/${u.id}`, "ad_soyad", u.ad_soyad, "Ad Soyad")}>{u.ad_soyad}</td>
                <td>
                  {u.gorevler
                    ? u.gorevler.split(" • ").map((g, i) => (
                        <span key={i} className="rozet notr" style={{ margin: "2px 6px 6px 0" }}>{g}</span>
                      ))
                    : <span className="rozet hata">bu dönemde atama yok — <a href="/yukle">Excel yükle</a></span>}
                </td>
                <td>
                  <button className="btn ikincil" onClick={async () => {
                    bildir(await api(`/api/uzmanlar/${u.id}`, "PUT", { aktif: u.aktif ? 0 : 1 }), "Güncellendi"); yukle();
                  }}>{u.aktif ? "Aktif → pasifle" : "Pasif → aktifle"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
