"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };

export default function UniqFark() {
  const [veri, setVeri] = useState(null);
  const [sekme, setSekme] = useState("cakisma");
  const [stokDbSekme, setStokDbSekme] = useState("farkli");
  const [q, setQ] = useState("");
  const [qDb, setQDb] = useState("");
  const [hata, setHata] = useState(null);

  useEffect(() => {
    fetch("/api/uniq-farklar")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || d.hata) throw new Error(d.hata || "Yüklenemedi");
        setVeri(d);
      })
      .catch((e) => setHata(e.message));
  }, []);

  if (hata) return <div className="mesaj hata">{hata}</div>;
  if (!veri) return <p>Uniq Kod ↔ Stok Liste karşılaştırılıyor...</p>;

  const listeler = {
    cakisma: { baslik: "UNIQ farklı (her iki dosyada dolu)", satirlar: veri.cakisma || [] },
    uniq_sheet_bos: { baslik: "Uniq sheet’te UNIQ boş, Stok’ta var", satirlar: veri.uniq_sheet_bos || [] },
    stok_uniq_bos: { baslik: "Uniq sheet’te UNIQ var, Stok’ta boş", satirlar: veri.stok_uniq_bos || [] },
  };
  const aktif = listeler[sekme];
  const filtre = q.trim().toLocaleUpperCase("tr-TR");
  const satirlar = !filtre
    ? aktif.satirlar
    : aktif.satirlar.filter((s) =>
        [s.marka, s.urun_adi, s.barkod, s.stok_kodu, s.uniq_sheet_uniq, s.stok_uniq, s.db_uniq_kod]
          .filter(Boolean)
          .join(" ")
          .toLocaleUpperCase("tr-TR")
          .includes(filtre)
      );

  const stokDb = veri.stok_db || { ozet: {}, tam: [], farkli: [], db_yok: [] };
  const stokDbListeler = {
    farkli: { baslik: "Stok beklenen ≠ DB", satirlar: stokDb.farkli || [], tip: "hata" },
    db_yok: { baslik: "DB’de ürün yok", satirlar: stokDb.db_yok || [], tip: "hata" },
    tam: { baslik: "Tam eşleşme", satirlar: stokDb.tam || [], tip: "ok" },
  };
  const stokDbAktif = stokDbListeler[stokDbSekme];
  const filtreDb = qDb.trim().toLocaleUpperCase("tr-TR");
  const stokDbSatirlar = !filtreDb
    ? stokDbAktif.satirlar
    : stokDbAktif.satirlar.filter((s) =>
        [s.marka, s.stok_adi, s.barkod, s.stok_kodu, s.stok_uniq, s.beklenen_uniq, s.db_uniq_kod]
          .filter(Boolean)
          .join(" ")
          .toLocaleUpperCase("tr-TR")
          .includes(filtreDb)
      );

  return (
    <div>
      <h2>Uniq Kod Farkları</h2>

      {/* —— Stok Liste ↔ Database —— */}
      <div className="yukle-kart" style={{ marginBottom: 28, borderColor: "rgba(37,99,235,.35)" }}>
        <h3 style={{ marginTop: 0 }}>Stok Liste ↔ Database UNIQ</h3>
        <p className="aciklama" style={{ marginBottom: 12 }}>
          Her Stok Liste satırı için beklenen UNIQ: <b>Stok UNIQ KOD</b> (varsa), yoksa <b>STOK KODU</b>.
          Bu değer DB’deki <b>urun.uniq_kod</b> ile birebir karşılaştırılır — tam eşleşme var mı burada görünür.
        </p>

        <div className="satir" style={{ flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <span className="rozet ok">{stokDb.ozet?.tam ?? 0} tam eşleşme</span>
          <span className="rozet hata">{stokDb.ozet?.farkli ?? 0} farklı</span>
          <span className="rozet hata">{stokDb.ozet?.db_yok ?? 0} DB’de yok</span>
          <span className="rozet notr">
            {stokDb.ozet?.karsilastirilan ?? 0} satır · %{stokDb.ozet?.yuzde_tam ?? 0} uyum
          </span>
        </div>

        <div className="satir" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {Object.entries(stokDbListeler).map(([key, meta]) => (
            <button
              key={key}
              className={`btn ${stokDbSekme === key ? "" : "ikincil"}`}
              onClick={() => setStokDbSekme(key)}
            >
              {meta.baslik} ({meta.satirlar.length})
            </button>
          ))}
        </div>

        <div className="satir" style={{ marginBottom: 14, alignItems: "stretch" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 280, maxWidth: 480 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--metin-2)" }}>Stok↔DB ara</span>
            <input
              type="search"
              placeholder="Barkod, stok kodu, beklenen uniq, DB uniq..."
              value={qDb}
              onChange={(e) => setQDb(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
        </div>

        <h4 style={{ margin: "0 0 10px" }}>{stokDbAktif.baslik} — {stokDbSatirlar.length}</h4>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Durum</th>
                <th>Barkod</th>
                <th>Stok kodu</th>
                <th>Ürün</th>
                <th>Stok UNIQ</th>
                <th>Beklenen UNIQ</th>
                <th>DB UNIQ</th>
              </tr>
            </thead>
            <tbody>
              {stokDbSatirlar.slice(0, 500).map((s, i) => (
                <tr key={i}>
                  <td>
                    <span className={`rozet ${s.durum === "tam" ? "ok" : "hata"}`}>
                      {s.durum === "tam" ? "eşleşiyor" : s.durum === "farkli" ? "farklı" : "DB yok"}
                    </span>
                  </td>
                  <td style={mono}>{s.barkod || "—"}</td>
                  <td style={mono}>{s.stok_kodu || "—"}</td>
                  <td>
                    <div>{s.stok_adi || "—"}</div>
                    <div style={{ fontSize: 12, color: "var(--metin-2)" }}>{s.marka}</div>
                  </td>
                  <td style={mono}>{s.stok_uniq || <span style={{ color: "var(--metin-2)" }}>—</span>}</td>
                  <td>
                    <b style={mono}>{s.beklenen_uniq}</b>
                    <div style={{ fontSize: 11, color: "var(--metin-2)" }}>
                      {s.beklenen_kaynak === "stok_uniq" ? "stok UNIQ’dan" : "stok kodundan"}
                    </div>
                  </td>
                  <td>
                    {s.db_uniq_kod ? (
                      <>
                        <b style={{
                          ...mono,
                          color: s.durum === "tam" ? "inherit" : "var(--kirmizi, #b91c1c)",
                        }}>{s.db_uniq_kod}</b>
                        <div style={{ fontSize: 12, color: "var(--metin-2)" }}>#{s.db_urun_id}</div>
                      </>
                    ) : (
                      <span className="rozet hata">yok</span>
                    )}
                  </td>
                </tr>
              ))}
              {!stokDbSatirlar.length && (
                <tr><td colSpan={7}>Bu grupta kayıt yok — tam eşleşme için diğer sekmeye bakın.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {stokDbSatirlar.length > 500 && (
          <p className="ipucu">İlk 500 satır gösteriliyor; arama ile daraltın.</p>
        )}
      </div>

      {/* —— Uniq sheet ↔ Stok (eski karşılaştırma) —— */}
      <h3>Uniq sheet ↔ Stok Liste</h3>
      <p className="aciklama">
        Uniq Kod Excel’i ile Stok Liste dosyasını karşılaştırır (Excel ↔ Excel).
        DB karşılaştırması yukarıdaki paneldedir.
      </p>
      <p className="ipucu">
        “Eşleşmeyenler” menüsü Zeops/sell-out satır eşleşmesidir.{" "}
        <Link href="/eslesmeyen">Eşleşmeyenler’e git →</Link>
      </p>

      <div className="satir" style={{ flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <span className="rozet ok">{veri.ozet.ayni} aynı UNIQ</span>
        <span className="rozet hata">{veri.ozet.cakisma} çakışma</span>
        <span className="rozet notr">{veri.ozet.uniq_sheet_bos} uniq sheet boş</span>
        <span className="rozet notr">{veri.ozet.stok_uniq_bos} stok UNIQ boş</span>
      </div>

      <div className="satir" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {Object.entries(listeler).map(([key, meta]) => (
          <button
            key={key}
            className={`btn ${sekme === key ? "" : "ikincil"}`}
            onClick={() => setSekme(key)}
          >
            {meta.baslik} ({meta.satirlar.length})
          </button>
        ))}
      </div>

      <div className="satir" style={{ marginBottom: 16, alignItems: "stretch" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 280, maxWidth: 480 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--metin-2)" }}>Ara</span>
          <input
            type="search"
            placeholder="Barkod, stok kodu, uniq veya ürün adı..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
      </div>

      <h3 style={{ marginTop: 4 }}>{aktif.baslik} — {satirlar.length}</h3>
      <table>
        <thead>
          <tr>
            <th>Eşleşme</th>
            <th>Barkod / Anahtar</th>
            <th>Stok kodu</th>
            <th>Ürün</th>
            <th>Uniq sheet UNIQ</th>
            <th>Stok Liste UNIQ</th>
            <th>DB’deki UNIQ</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map((s, i) => (
            <tr key={i}>
              <td><span className="rozet notr">{s.eslesme}</span></td>
              <td style={mono}>{s.barkod || s.anahtar || "—"}</td>
              <td style={mono}>{s.stok_kodu || "—"}</td>
              <td>
                <div>{s.urun_adi || s.stok_adi || "—"}</div>
                <div style={{ fontSize: 12, color: "var(--metin-2)" }}>{s.marka}</div>
              </td>
              <td>
                <b>{s.uniq_sheet_uniq || "—"}</b>
                {s.uniq_sheet_ad ? <div style={{ fontSize: 12 }}>{s.uniq_sheet_ad}</div> : null}
              </td>
              <td>
                <b>{s.stok_uniq || "—"}</b>
                {s.stok_uniq_adi ? <div style={{ fontSize: 12 }}>{s.stok_uniq_adi}</div> : null}
              </td>
              <td>
                {s.db_uniq_kod
                  ? <><b>{s.db_uniq_kod}</b><div style={{ fontSize: 12 }}>#{s.db_urun_id}</div></>
                  : <span className="rozet notr">DB’de yok</span>}
              </td>
            </tr>
          ))}
          {!satirlar.length && (
            <tr><td colSpan={7}>Bu grupta kayıt yok.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
