// Ahmet Bilici / BEYMEN ZORLU beyanlarının niye 70 adet gösterdiğini bulan teşhis scripti.
// Çalıştırma: node src/debugAhmetBilici.js [donem_id]
// Ya da:      DONEM_ID=<id> node src/debugAhmetBilici.js
const pool = require("./db");

async function main() {
  const donemId = Number(process.argv[2] || process.env.DONEM_ID || 0);
  if (!donemId) {
    const [[d]] = await pool.query(
      "SELECT id FROM donem WHERE durum='hesaplandi' ORDER BY id DESC LIMIT 1"
    );
    if (!d) throw new Error("Hesaplı dönem bulunamadı. DONEM_ID ver.");
    console.log("Otomatik dönem seçildi:", d.id);
    await calistir(d.id);
  } else {
    await calistir(donemId);
  }
  process.exit(0);
}

async function calistir(donemId) {
  // Uzman ID
  const [[u]] = await pool.query(
    "SELECT id, ad_soyad FROM uzman WHERE ad_soyad LIKE 'Ahmet Bilici%' LIMIT 1"
  );
  if (!u) return console.log("Ahmet Bilici DB'de yok.");
  console.log(`Uzman: ${u.ad_soyad} (id=${u.id})`);

  // Mağaza ID
  const [[m]] = await pool.query(
    "SELECT id, prim_magaza, bayi FROM magaza WHERE prim_magaza='BEYMEN ZORLU' LIMIT 1"
  );
  if (!m) return console.log("BEYMEN ZORLU mağaza DB'de yok.");
  console.log(`Mağaza: ${m.prim_magaza} (id=${m.id}, bayi=${m.bayi})`);

  // Beyanların dökümü
  const [rows] = await pool.query(
    `SELECT b.id, b.barkod, b.kod, b.durum, b.eslesme_durum, b.adet,
            b.urun_id, u.marka, u.durum AS urun_durum,
            (SELECT SUM(so.adet) FROM sellout so
              WHERE so.donem_id=b.donem_id AND so.magaza_id=b.magaza_id
                AND so.urun_id=b.urun_id AND so.eslesme_durum='ok') AS so_adet
       FROM satis_beyan b
       LEFT JOIN urun u ON u.id=b.urun_id
      WHERE b.donem_id=? AND b.uzman_id=? AND b.magaza_id=?`,
    [donemId, u.id, m.id]
  );
  console.log(`\nToplam beyan satırı: ${rows.length}`);

  const stats = {
    toplam: rows.length,
    tamamlandi: 0,
    esles_ok: 0,
    urun_yok: 0,
    urun_pasif: 0,
    sellout_yok: 0,
    hesaba_giriyor: 0,
    atanma_yok: 0,
    magaza_yok: 0,
  };
  const sellOutYokKodlar = new Map();
  const uruYokKodlar = new Map();
  for (const r of rows) {
    if ((r.durum || "").startsWith("Tamamland")) stats.tamamlandi++;
    if (r.eslesme_durum === "ok") stats.esles_ok++;
    else if (r.eslesme_durum === "atama_yok") stats.atanma_yok++;
    else if (r.eslesme_durum === "magaza_yok") stats.magaza_yok++;
    if (!r.urun_id) {
      stats.urun_yok++;
      const key = `${r.barkod}|${r.kod}`;
      uruYokKodlar.set(key, (uruYokKodlar.get(key) || 0) + 1);
      continue;
    }
    if (r.urun_durum !== "aktif") stats.urun_pasif++;
    if (!r.so_adet || r.so_adet <= 0) {
      stats.sellout_yok++;
      sellOutYokKodlar.set(r.kod, (sellOutYokKodlar.get(r.kod) || 0) + 1);
      continue;
    }
    if (r.eslesme_durum === "ok" && (r.urun_durum === "aktif")) stats.hesaba_giriyor++;
  }
  console.log("\nİstatistik:");
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(20)}: ${v}`);

  if (uruYokKodlar.size) {
    console.log("\nÜrün çözümlenemeyen barkod|kod ilk 10:");
    let i = 0;
    for (const [k, v] of uruYokKodlar) { if (i++ >= 10) break; console.log(`  ${k}  x${v}`); }
  }
  if (sellOutYokKodlar.size) {
    console.log("\nSellout'ta eşleşmeyen ürün kodu ilk 10:");
    let i = 0;
    for (const [k, v] of sellOutYokKodlar) { if (i++ >= 10) break; console.log(`  ${k}  x${v}`); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
