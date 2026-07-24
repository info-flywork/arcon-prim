const express = require("express");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();

const pool = require("./db");
const { importZeops, importSellout, importHedef, importSiralama, importUzmanMagaza, importStok } = require("./services/importService");
const { hesapla } = require("./services/hesapService");
const {
  normalizeCanonicalCode,
  createProduct,
  addIdentifier,
  assertProductEditable,
  remapPeriod,
  mergeProducts,
} = require("./services/productService");
const { getUniqFarklar } = require("./services/uniqFarkService");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(e.status || 500).json({ hata: e.message, detay: e.detail });
});

// Değişiklik izi — her mutasyon kaydedilir
async function audit(tablo, kayitId, islem, detay) {
  try {
    await pool.query(
      "INSERT INTO audit_log (tablo, kayit_id, islem, detay) VALUES (?,?,?,?)",
      [tablo, String(kayitId ?? ""), islem, JSON.stringify(detay || {})]
    );
  } catch (e) {
    console.error("audit yazılamadı:", e.message);
  }
}

// Kapanan dönem korumalı: veri yüklenemez, hesap çalıştırılamaz
async function donemKilitli(donemId, res) {
  const [[d]] = await pool.query("SELECT durum, ad FROM donem WHERE id=?", [donemId]);
  if (d && d.durum === "kapandi") {
    res.status(400).json({ hata: `${d.ad} dönemi kapatılmış. Değişiklik için önce dönemi açın.` });
    return true;
  }
  return false;
}

// ---------- Dönemler ----------
app.get("/api/donemler", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM donem ORDER BY yil DESC, ay DESC");
  res.json(rows);
}));

app.post("/api/donemler", wrap(async (req, res) => {
  const { yil, ay } = req.body;
  if (!yil || !ay) return res.status(400).json({ hata: "yil ve ay zorunlu" });
  const aylar = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  await pool.query(
    "INSERT INTO donem (yil, ay, ad) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ad=VALUES(ad)",
    [yil, ay, `${aylar[ay]} ${yil}`]
  );
  const [[d]] = await pool.query("SELECT * FROM donem WHERE yil=? AND ay=?", [yil, ay]);
  res.json(d);
}));

// ---------- Excel importları ----------
const importers = {
  zeops: importZeops,
  sellout: importSellout,
  hedef: importHedef,
  siralama: importSiralama,
  "uzman-magaza": importUzmanMagaza,
  stok: importStok,
};

app.post("/api/import/:tip/:donemId", upload.single("dosya"), wrap(async (req, res) => {
  const fn = importers[req.params.tip];
  if (!fn) return res.status(400).json({ hata: "Geçersiz import tipi" });
  if (!req.file) return res.status(400).json({ hata: "Dosya yüklenmedi (form alanı: dosya)" });
  if (await donemKilitli(Number(req.params.donemId), res)) return;
  // Multer HTTP başlığından Latin-1 varsayımıyla dosya adını okuyor;
  // Türkçe adları UTF-8 olarak yeniden yorumla (mojibake'i önler)
  const dosyaAdi = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  const sonuc = await fn(req.file.buffer, Number(req.params.donemId), dosyaAdi);
  res.json(sonuc);
}));

app.get("/api/import-log/:donemId", wrap(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM import_log WHERE donem_id=? ORDER BY created_at DESC LIMIT 50",
    [req.params.donemId]
  );
  res.json(rows);
}));

// ---------- Uniq Kod vs Stok Liste farkları ----------
app.get("/api/uniq-farklar", wrap(async (req, res) => {
  res.json(await getUniqFarklar());
}));

// ---------- Eşleşmeyenler (Zeops/sell-out satır eşleşmeleri) ----------
app.get("/api/eslesmeyen/:donemId", wrap(async (req, res) => {
  const [beyan] = await pool.query(
    `SELECT eslesme_durum, COUNT(*) sayi FROM satis_beyan
     WHERE donem_id=? AND eslesme_durum<>'ok' GROUP BY eslesme_durum`,
    [req.params.donemId]
  );
  const [selloutOzet] = await pool.query(
    `SELECT eslesme_durum, COUNT(*) sayi FROM sellout
     WHERE donem_id=? AND eslesme_durum<>'ok' GROUP BY eslesme_durum`,
    [req.params.donemId]
  );
  const [urunler] = await pool.query(
    `SELECT barkod, kod, etiket, eslesme_durum, eslesme_yontemi,
            COUNT(*) satir, SUM(adet) adet
     FROM satis_beyan
     WHERE donem_id=? AND eslesme_durum IN ('urun_yok','urun_cakisma','kimlik_gecersiz')
     GROUP BY barkod, kod, etiket, eslesme_durum, eslesme_yontemi
     ORDER BY adet DESC LIMIT 200`,
    [req.params.donemId]
  );
  const [selloutUrunler] = await pool.query(
    `SELECT arcon_barkod AS barkod, arcon_referans AS kod, urun_adi AS etiket,
            eslesme_durum, eslesme_yontemi, COUNT(*) satir, SUM(adet) adet
     FROM sellout
     WHERE donem_id=? AND eslesme_durum IN ('urun_yok','urun_cakisma','kimlik_gecersiz')
     GROUP BY arcon_barkod, arcon_referans, urun_adi, eslesme_durum, eslesme_yontemi
     ORDER BY adet DESC LIMIT 200`,
    [req.params.donemId]
  );
  const [magazalar] = await pool.query(
    `SELECT magaza_ham, COUNT(*) satir FROM satis_beyan
     WHERE donem_id=? AND eslesme_durum='magaza_yok'
     GROUP BY magaza_ham ORDER BY satir DESC LIMIT 100`,
    [req.params.donemId]
  );
  const [uzmanlar] = await pool.query(
    `SELECT uzman_ham, magaza_ham, COUNT(*) satir FROM satis_beyan
     WHERE donem_id=? AND eslesme_durum IN ('uzman_yok','atama_yok')
     GROUP BY uzman_ham, magaza_ham ORDER BY satir DESC LIMIT 100`,
    [req.params.donemId]
  );
  const [cakismalar] = await pool.query(`
    SELECT c.*, u.uniq_kod AS cozulen_uniq_kod
    FROM urun_esleme_cakisma c
    LEFT JOIN urun u ON u.id=c.cozulen_urun_id
    WHERE c.durum='acik'
    ORDER BY c.created_at DESC LIMIT 200
  `);
  res.json({ ozet: beyan, selloutOzet, urunler, selloutUrunler, magazalar, uzmanlar, cakismalar });
}));

// Eski istemciler için uyumluluk: yazma artık normalize ürün modeline gider.
app.post("/api/uniq-kod", wrap(async (req, res) => {
  const { marka, urun_adi, barkod, referans, uniq_kod, uniq_urun_adi } = req.body;
  if (!uniq_kod) return res.status(400).json({ hata: "Yeni üründe geçerli UNIQ kod zorunlu" });
  const identifiers = [];
  if (barkod) identifiers.push({ tip: "barkod", deger: barkod, kaynak: "manuel" });
  if (referans) identifiers.push({ tip: "referans", deger: referans, kaynak: "manuel" });
  const id = await createProduct({
    marka, urun_adi: uniq_urun_adi || urun_adi, uniq_kod, identifiers,
  });
  await audit("urun", id, "ekleme", req.body);
  res.json({ ok: true, id });
}));

// Mağaza alias ekle
app.post("/api/magaza-alias", wrap(async (req, res) => {
  const { alias, magaza_id, kaynak } = req.body;
  const { normalizeStore } = require("./util");
  await pool.query(
    "INSERT INTO magaza_alias (alias, magaza_id, kaynak) VALUES (?,?,?) ON DUPLICATE KEY UPDATE magaza_id=VALUES(magaza_id)",
    [normalizeStore(alias), magaza_id, kaynak || "manuel"]
  );
  await audit("magaza_alias", magaza_id, "ekleme", req.body);
  res.json({ ok: true });
}));

// ---------- Master listeler + CRUD ----------
app.get("/api/magazalar", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM magaza ORDER BY bayi, prim_magaza");
  res.json(rows);
}));

app.post("/api/magazalar", wrap(async (req, res) => {
  const { magaza_kodu, bayi, magaza_adi, prim_magaza, sehir, bolge } = req.body;
  if (!bayi || !prim_magaza) return res.status(400).json({ hata: "bayi ve prim_magaza zorunlu" });
  const [r] = await pool.query(
    "INSERT INTO magaza (magaza_kodu, bayi, magaza_adi, prim_magaza, sehir, bolge) VALUES (?,?,?,?,?,?)",
    [magaza_kodu || null, bayi.trim(), (magaza_adi || prim_magaza).trim(), prim_magaza.trim(), sehir || null, bolge || null]
  );
  await audit("magaza", r.insertId, "ekleme", req.body);
  res.json({ ok: true, id: r.insertId });
}));

app.put("/api/magazalar/:id", wrap(async (req, res) => {
  const { magaza_kodu, bayi, magaza_adi, prim_magaza, sehir, bolge, aktif } = req.body;
  const [[eski]] = await pool.query(
    "SELECT prim_magaza, bayi, sehir, aktif FROM magaza WHERE id=?", [req.params.id]
  );
  await pool.query(
    `UPDATE magaza SET
       magaza_kodu=COALESCE(?,magaza_kodu), bayi=COALESCE(?,bayi),
       magaza_adi=COALESCE(?,magaza_adi), prim_magaza=COALESCE(?,prim_magaza),
       sehir=COALESCE(?,sehir), bolge=COALESCE(?,bolge), aktif=COALESCE(?,aktif)
     WHERE id=?`,
    [magaza_kodu, bayi, magaza_adi, prim_magaza, sehir, bolge, aktif, req.params.id]
  );
  await audit("magaza", req.params.id, "guncelleme", { magaza: eski?.prim_magaza, eski, yeni: req.body });
  res.json({ ok: true });
}));

// Uzmanlar, son dönemdeki görev bilgisiyle (mağaza · bayi · marka grubu)
app.get("/api/uzmanlar", wrap(async (req, res) => {
  // donemId yoksa: en yeni ataması olan dönem (boş yeni dönem MAX(id) yüzünden herkesi "atama yok" göstermesin)
  let donemId = req.query.donemId ? Number(req.query.donemId) : null;
  if (!donemId) {
    const [[d]] = await pool.query(
      `SELECT d.id FROM donem d
       WHERE EXISTS (SELECT 1 FROM uzman_atama ua WHERE ua.donem_id = d.id)
       ORDER BY d.yil DESC, d.ay DESC LIMIT 1`
    );
    donemId = d?.id || null;
  }
  let gorevDonem = null;
  if (donemId) {
    const [[d]] = await pool.query("SELECT id, ad, durum FROM donem WHERE id=?", [donemId]);
    gorevDonem = d || null;
  }
  const [rows] = await pool.query(
    `SELECT u.*,
       GROUP_CONCAT(DISTINCT CONCAT(m.bayi, ' / ', m.prim_magaza, ' — ',
         COALESCE(NULLIF(a.grup_adi,''), b.marka_grubu_adi, b.bolum_adi, '?'))
         ORDER BY m.prim_magaza SEPARATOR ' • ') AS gorevler
     FROM uzman u
     LEFT JOIN uzman_atama a
       ON a.uzman_id = u.id
      AND a.donem_id = ?
     LEFT JOIN magaza m ON m.id = a.magaza_id
     LEFT JOIN prim_bolum b ON b.id = a.bolum_id
     GROUP BY u.id
     ORDER BY u.ad_soyad`,
    [donemId]
  );
  // Geriye uyumluluk: dizi bekleyen ekranlar + dönem bilgisi
  res.set("X-Gorev-Donem-Id", String(donemId || ""));
  res.set("X-Gorev-Donem-Ad", gorevDonem?.ad || "");
  rows.forEach((r) => {
    r.gorev_donem_id = donemId;
    r.gorev_donem_ad = gorevDonem?.ad || null;
  });
  res.json(rows);
}));

app.post("/api/uzmanlar", wrap(async (req, res) => {
  const { ad_soyad } = req.body;
  if (!ad_soyad) return res.status(400).json({ hata: "ad_soyad zorunlu" });
  const { normalizeName } = require("./util");
  const [r] = await pool.query(
    "INSERT INTO uzman (ad_soyad, normal_ad) VALUES (?,?) ON DUPLICATE KEY UPDATE ad_soyad=VALUES(ad_soyad)",
    [ad_soyad.trim(), normalizeName(ad_soyad)]
  );
  await audit("uzman", r.insertId, "ekleme", req.body);
  res.json({ ok: true, id: r.insertId });
}));

app.put("/api/uzmanlar/:id", wrap(async (req, res) => {
  const { ad_soyad, aktif } = req.body;
  const { normalizeName } = require("./util");
  const [[eski]] = await pool.query("SELECT ad_soyad, aktif FROM uzman WHERE id=?", [req.params.id]);
  if (ad_soyad) {
    await pool.query("UPDATE uzman SET ad_soyad=?, normal_ad=? WHERE id=?",
      [ad_soyad.trim(), normalizeName(ad_soyad), req.params.id]);
  }
  if (aktif !== undefined) {
    await pool.query("UPDATE uzman SET aktif=? WHERE id=?", [aktif ? 1 : 0, req.params.id]);
  }
  await audit("uzman", req.params.id, "guncelleme", { uzman: eski?.ad_soyad, eski, yeni: req.body });
  res.json({ ok: true });
}));

// Ürün arama + kanonik ürün/kimlik yönetimi
app.get("/api/urunler", wrap(async (req, res) => {
  const q = `%${(req.query.q || "").trim()}%`;
  const [rows] = await pool.query(
    `SELECT u.*,
       (SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'id',k.id,'tip',k.tip,'deger',k.deger_ham,
          'normalize',k.deger_normalize,'aktif',k.aktif
        )) FROM urun_kimlik k WHERE k.urun_id=u.id) AS kimlikler
     FROM urun u
     WHERE u.marka LIKE ? OR u.urun_adi LIKE ? OR u.uniq_kod LIKE ?
        OR EXISTS (
          SELECT 1 FROM urun_kimlik k
          WHERE k.urun_id=u.id AND (k.deger_ham LIKE ? OR k.deger_normalize LIKE ?)
        )
     ORDER BY FIELD(u.durum,'aktif','inceleme','pasif'), u.marka, u.urun_adi
     LIMIT 100`,
    [q, q, q, q, q]
  );
  res.json(rows.map((row) => ({
    ...row,
    kimlikler: typeof row.kimlikler === "string" ? JSON.parse(row.kimlikler) : (row.kimlikler || []),
  })));
}));

app.post("/api/urunler", wrap(async (req, res) => {
  const id = await createProduct(req.body);
  await audit("urun", id, "ekleme", req.body);
  if (req.body.donem_id) await remapPeriod(Number(req.body.donem_id));
  res.json({ ok: true, id });
}));

app.put("/api/urunler/:id", wrap(async (req, res) => {
  const { marka, urun_adi, uniq_kod, aks, cinsiyet, durum } = req.body;
  await assertProductEditable(pool, req.params.id);
  if (durum && !["aktif", "inceleme", "pasif"].includes(durum)) {
    return res.status(400).json({ hata: "Geçersiz ürün durumu" });
  }
  await pool.query(
    `UPDATE urun SET
       marka=COALESCE(?,marka), urun_adi=COALESCE(?,urun_adi),
       uniq_kod=COALESCE(?,uniq_kod), aks=COALESCE(?,aks),
       cinsiyet=COALESCE(?,cinsiyet), durum=COALESCE(?,durum)
     WHERE id=?`,
    [marka, urun_adi, uniq_kod ? normalizeCanonicalCode(uniq_kod) : null,
      aks, cinsiyet, durum, req.params.id]
  );
  await audit("urun", req.params.id, "guncelleme", req.body);
  if (req.body.donem_id) await remapPeriod(Number(req.body.donem_id));
  res.json({ ok: true });
}));

app.post("/api/urunler/:id/kimlik", wrap(async (req, res) => {
  await assertProductEditable(pool, req.params.id);
  const conn = await pool.getConnection();
  let kimlikId;
  try {
    await conn.beginTransaction();
    kimlikId = await addIdentifier(conn, req.params.id, {
      tip: req.body.tip,
      deger: req.body.deger,
      kaynak: req.body.kaynak || "manuel",
    });
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  await audit("urun_kimlik", kimlikId, "ekleme", req.body);
  const yenidenEsleme = req.body.donem_id ? await remapPeriod(Number(req.body.donem_id)) : null;
  res.json({ ok: true, id: kimlikId, yenidenEsleme });
}));

app.post("/api/urunler/:id/birlestir", wrap(async (req, res) => {
  if (!req.body.hedef_urun_id) return res.status(400).json({ hata: "hedef_urun_id zorunlu" });
  await mergeProducts(req.params.id, req.body.hedef_urun_id);
  await audit("urun", req.params.id, "guncelleme", {
    islem: "birlestir", hedef_urun_id: req.body.hedef_urun_id,
  });
  res.json({ ok: true });
}));

app.post("/api/urun-cakismalari/:id/coz", wrap(async (req, res) => {
  if (!req.body.urun_id) return res.status(400).json({ hata: "urun_id zorunlu" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[conflict]] = await conn.query(
      "SELECT * FROM urun_esleme_cakisma WHERE id=? FOR UPDATE",
      [req.params.id]
    );
    if (!conflict) {
      const error = new Error("Çakışma bulunamadı");
      error.status = 404;
      throw error;
    }
    if (conflict.tip === "uniq_kod") {
      throw new Error("UNIQ kolon çakışması ürün kartından düzeltilmelidir.");
    }
    const identifierId = await addIdentifier(conn, req.body.urun_id, {
      tip: conflict.tip,
      deger: conflict.deger_ham || conflict.deger_normalize,
      kaynak: "cakisma_cozumu",
    });
    await conn.query(
      `UPDATE urun_esleme_cakisma
       SET durum='cozuldu', cozulen_urun_id=?, resolved_at=NOW()
       WHERE id=?`,
      [req.body.urun_id, req.params.id]
    );
    await conn.commit();
    await audit("urun_esleme_cakisma", req.params.id, "guncelleme", {
      urun_id: req.body.urun_id, identifierId,
    });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  const yenidenEsleme = req.body.donem_id ? await remapPeriod(Number(req.body.donem_id)) : null;
  res.json({ ok: true, yenidenEsleme });
}));

app.post("/api/donemler/:id/urunleri-yeniden-esle", wrap(async (req, res) => {
  const sonuc = await remapPeriod(Number(req.params.id));
  await audit("donem", req.params.id, "guncelleme", { islem: "urunleri-yeniden-esle", sonuc });
  res.json(sonuc);
}));

app.get("/api/atamalar/:donemId", wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.id, u.ad_soyad, m.prim_magaza, m.bayi, b.bolum_adi, b.marka_grubu_adi, a.grup_adi, a.pay_orani
     FROM uzman_atama a
     JOIN uzman u ON u.id=a.uzman_id
     JOIN magaza m ON m.id=a.magaza_id
     JOIN prim_bolum b ON b.id=a.bolum_id
     WHERE a.donem_id=? ORDER BY m.prim_magaza, u.ad_soyad`,
    [req.params.donemId]
  );
  res.json(rows);
}));

app.put("/api/atamalar/:id", wrap(async (req, res) => {
  const { bolum_id, pay_orani } = req.body;
  const [[eski]] = await pool.query(
    `SELECT u.ad_soyad AS uzman, m.prim_magaza AS magaza, b.bolum_adi
     FROM uzman_atama a
     LEFT JOIN uzman u ON u.id=a.uzman_id
     LEFT JOIN magaza m ON m.id=a.magaza_id
     LEFT JOIN prim_bolum b ON b.id=a.bolum_id
     WHERE a.id=?`, [req.params.id]
  );
  await pool.query("UPDATE uzman_atama SET bolum_id=COALESCE(?,bolum_id), pay_orani=COALESCE(?,pay_orani) WHERE id=?",
    [bolum_id || null, pay_orani || null, req.params.id]);
  await audit("uzman_atama", req.params.id, "guncelleme", { atama: eski, yeni: req.body });
  res.json({ ok: true });
}));

app.post("/api/atamalar", wrap(async (req, res) => {
  const { donem_id, uzman_id, magaza_id, bolum_id, grup_adi } = req.body;
  if (!donem_id || !uzman_id || !magaza_id || !bolum_id)
    return res.status(400).json({ hata: "donem_id, uzman_id, magaza_id, bolum_id zorunlu" });
  const [r] = await pool.query(
    `INSERT INTO uzman_atama (donem_id, uzman_id, magaza_id, bolum_id, grup_adi)
     VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE bolum_id=VALUES(bolum_id), grup_adi=VALUES(grup_adi)`,
    [donem_id, uzman_id, magaza_id, bolum_id, grup_adi || null]
  );
  const [[meta]] = await pool.query(
    `SELECT u.ad_soyad AS uzman, m.prim_magaza AS magaza, m.bayi,
            b.bolum_adi, b.marka_grubu_adi, d.ad AS donem
     FROM uzman u
     JOIN magaza m ON m.id=?
     JOIN prim_bolum b ON b.id=?
     LEFT JOIN donem d ON d.id=?
     WHERE u.id=?`,
    [magaza_id, bolum_id, donem_id, uzman_id]
  );
  await audit("uzman_atama", r.insertId || `${donem_id}-${uzman_id}-${magaza_id}`, "ekleme", {
    ...req.body,
    uzman: meta?.uzman || null,
    magaza: meta?.magaza || null,
    bayi: meta?.bayi || null,
    bolum_adi: meta?.bolum_adi || null,
    marka_grubu_adi: meta?.marka_grubu_adi || null,
    donem: meta?.donem || null,
    grup_adi: grup_adi || null,
  });
  res.json({ ok: true });
}));

app.delete("/api/atamalar/:id", wrap(async (req, res) => {
  // Silmeden önce snapshot al — geçmişte "ne silindi" görünmeli
  const [[eski]] = await pool.query(
    `SELECT a.donem_id, u.ad_soyad AS uzman, m.prim_magaza AS magaza, m.bayi,
            b.bolum_adi, b.marka_grubu_adi, a.grup_adi
     FROM uzman_atama a
     LEFT JOIN uzman u ON u.id=a.uzman_id
     LEFT JOIN magaza m ON m.id=a.magaza_id
     LEFT JOIN prim_bolum b ON b.id=a.bolum_id
     WHERE a.id=?`, [req.params.id]
  );
  await pool.query("DELETE FROM uzman_atama WHERE id=?", [req.params.id]);
  await audit("uzman_atama", req.params.id, "silme", { silinen: eski || null });
  res.json({ ok: true });
}));

// ---------- Kurallar ----------
app.get("/api/kurallar", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM prim_table");
  res.json(rows);
}));

app.get("/api/bolumler", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM prim_bolum WHERE aktif=1 ORDER BY sira");
  res.json(rows);
}));

// Kural düzenleme: oran ve açıklama (yapısal değişiklik DB yönetiminde)
app.put("/api/kural/:id", wrap(async (req, res) => {
  const { prim_oran, kriter_adi, not_metni } = req.body;
  const [[eski]] = await pool.query("SELECT prim_oran, kriter_adi FROM prim_kural WHERE id=?", [req.params.id]);
  await pool.query(
    "UPDATE prim_kural SET prim_oran=COALESCE(?,prim_oran), kriter_adi=COALESCE(?,kriter_adi), not_metni=COALESCE(?,not_metni) WHERE id=?",
    [prim_oran, kriter_adi, not_metni, req.params.id]
  );
  await audit("prim_kural", req.params.id, "guncelleme", { eski, yeni: req.body });
  res.json({ ok: true });
}));

app.put("/api/bolum/:id", wrap(async (req, res) => {
  const { grup_toplam_oran, max_prim_oran, aktif } = req.body;
  const [[eski]] = await pool.query("SELECT grup_toplam_oran, max_prim_oran, aktif FROM prim_bolum WHERE id=?", [req.params.id]);
  await pool.query(
    "UPDATE prim_bolum SET grup_toplam_oran=COALESCE(?,grup_toplam_oran), max_prim_oran=COALESCE(?,max_prim_oran), aktif=COALESCE(?,aktif) WHERE id=?",
    [grup_toplam_oran, max_prim_oran, aktif, req.params.id]
  );
  await audit("prim_bolum", req.params.id, "guncelleme", { eski, yeni: req.body });
  res.json({ ok: true });
}));

// Değişiklik geçmişi — ID'leri okunur adlara zenginleştir
app.get("/api/audit", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM audit_log ORDER BY id DESC LIMIT 100");
  const uzmanIds = new Set();
  const magazaIds = new Set();
  const bolumIds = new Set();
  const donemIds = new Set();
  const parsed = rows.map((row) => {
    let detay = row.detay;
    if (typeof detay === "string") {
      try { detay = JSON.parse(detay); } catch { detay = {}; }
    }
    detay = detay || {};
    if (row.tablo === "uzman_atama") {
      if (detay.uzman_id) uzmanIds.add(Number(detay.uzman_id));
      if (detay.magaza_id) magazaIds.add(Number(detay.magaza_id));
      if (detay.bolum_id) bolumIds.add(Number(detay.bolum_id));
      if (detay.donem_id) donemIds.add(Number(detay.donem_id));
      if (detay.yeni?.bolum_id) bolumIds.add(Number(detay.yeni.bolum_id));
      if (detay.silinen?.donem_id) donemIds.add(Number(detay.silinen.donem_id));
    }
    if (row.tablo === "magaza_alias" && detay.magaza_id) magazaIds.add(Number(detay.magaza_id));
    return { ...row, detay };
  });

  const lookup = async (sql, ids) => {
    if (!ids.size) return new Map();
    const [found] = await pool.query(sql, [[...ids]]);
    return new Map(found.map((r) => [Number(r.id), r.label]));
  };

  const [uzmanMap, bolumMap, donemMap] = await Promise.all([
    lookup("SELECT id, ad_soyad AS label FROM uzman WHERE id IN (?)", uzmanIds),
    lookup(
      `SELECT id, COALESCE(NULLIF(marka_grubu_adi,''), bolum_adi) AS label
       FROM prim_bolum WHERE id IN (?)`,
      bolumIds
    ),
    lookup("SELECT id, ad AS label FROM donem WHERE id IN (?)", donemIds),
  ]);

  const magazaMap = new Map();
  const magazaBayi = new Map();
  if (magazaIds.size) {
    const [mrows] = await pool.query(
      "SELECT id, prim_magaza, bayi FROM magaza WHERE id IN (?)",
      [[...magazaIds]]
    );
    for (const m of mrows) {
      magazaMap.set(Number(m.id), m.prim_magaza);
      magazaBayi.set(Number(m.id), m.bayi);
    }
  }

  for (const row of parsed) {
    const d = row.detay;
    if (row.tablo === "uzman_atama") {
      if (!d.uzman && d.uzman_id) d.uzman = uzmanMap.get(Number(d.uzman_id)) || `uzman #${d.uzman_id}`;
      if (!d.magaza && d.magaza_id) d.magaza = magazaMap.get(Number(d.magaza_id)) || `mağaza #${d.magaza_id}`;
      if (!d.bayi && d.magaza_id) d.bayi = magazaBayi.get(Number(d.magaza_id)) || null;
      if (!d.bolum_adi && d.bolum_id) d.bolum_adi = bolumMap.get(Number(d.bolum_id)) || `senaryo #${d.bolum_id}`;
      if (!d.marka_grubu_adi && d.bolum_id) d.marka_grubu_adi = bolumMap.get(Number(d.bolum_id)) || null;
      if (!d.donem && d.donem_id) d.donem = donemMap.get(Number(d.donem_id)) || null;
      if (d.yeni?.bolum_id && !d.yeni.bolum_adi) {
        d.yeni.bolum_adi = bolumMap.get(Number(d.yeni.bolum_id)) || `senaryo #${d.yeni.bolum_id}`;
      }
    }
    if (row.tablo === "magaza_alias" && d.magaza_id && !d.magaza) {
      d.magaza = magazaMap.get(Number(d.magaza_id)) || `mağaza #${d.magaza_id}`;
    }
  }
  res.json(parsed);
}));

// ---------- Hesaplama ----------
app.post("/api/hesapla/:donemId", wrap(async (req, res) => {
  if (await donemKilitli(Number(req.params.donemId), res)) return;
  const donemId = Number(req.params.donemId);
  const [[donem]] = await pool.query("SELECT ad FROM donem WHERE id=?", [donemId]);
  // Hesap öncesi: eksik atamaları tamamla + ürün eşlemelerini güncelle
  const esleme = await remapPeriod(donemId);
  const sonuc = await hesapla(donemId);
  await audit("donem", donemId, "hesap", { donem: donem?.ad, esleme, ...sonuc });
  res.json({ ...sonuc, esleme });
}));

// Dönem kilitle / aç
app.put("/api/donemler/:id/durum", wrap(async (req, res) => {
  const { durum } = req.body;
  if (!["acik", "hesaplandi", "kapandi"].includes(durum))
    return res.status(400).json({ hata: "Geçersiz durum" });
  const [[eski]] = await pool.query("SELECT ad, durum FROM donem WHERE id=?", [req.params.id]);
  await pool.query("UPDATE donem SET durum=? WHERE id=?", [durum, req.params.id]);
  await audit("donem", req.params.id, "kilit", { donem: eski?.ad, eski_durum: eski?.durum, yeni_durum: durum });
  res.json({ ok: true });
}));

// ---------- Raporlar ----------
app.get("/api/rapor/ozet/:donemId", wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT o.*, u.ad_soyad, m.prim_magaza, m.bayi, b.bolum_adi, b.marka_grubu_adi
     FROM prim_ozet o
     JOIN uzman u ON u.id=o.uzman_id
     JOIN magaza m ON m.id=o.magaza_id
     LEFT JOIN prim_bolum b ON b.id=o.bolum_id
     WHERE o.donem_id=? ORDER BY u.ad_soyad, m.prim_magaza`,
    [req.params.donemId]
  );
  // XLSX export talebi varsa Excel döndür
  if (req.query.format === "xlsx") {
    const XLSX = require("xlsx");
    const excelRows = rows.map((r) => ({
      "Uzman": r.ad_soyad,
      "Mağaza": r.prim_magaza,
      "Bayi": r.bayi,
      "Senaryo": r.bolum_adi,
      "Marka Grubu": r.marka_grubu_adi,
      "Prime Esas Ciro": Number(r.prime_esas_toplam),
      "Satış Primi": Number(r.satis_prim),
      "Hedef Primi": Number(r.hedef_prim),
      "Sıralama Primi": Number(r.siralama_prim),
      "Bonus Primi": Number(r.bonus_prim),
      "Ek Prim": Number(r.ek_prim),
      "Efektif %": Number(r.toplam_oran),
      "Toplam Prim": Number(r.toplam_prim),
    }));
    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Prim Raporu");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="prim_raporu_${req.params.donemId}.xlsx"`);
    return res.end(buf);
  }
  res.json(rows);
}));

app.get("/api/rapor/detay/:donemId/:uzmanId", wrap(async (req, res) => {
  const [satirlar] = await pool.query(
    `SELECT h.*, u.urun_adi AS uniq_urun_adi, u.urun_adi, u.marka, u.uniq_kod, m.prim_magaza
     FROM prim_hesap_satir h
     LEFT JOIN urun u ON u.id=h.urun_id
     JOIN magaza m ON m.id=h.magaza_id
     WHERE h.donem_id=? AND h.uzman_id=?
     ORDER BY h.prime_esas_tutar DESC`,
    [req.params.donemId, req.params.uzmanId]
  );
  const [[ozet]] = await pool.query(
    `SELECT o.*, u.ad_soyad FROM prim_ozet o JOIN uzman u ON u.id=o.uzman_id
     WHERE o.donem_id=? AND o.uzman_id=? LIMIT 1`,
    [req.params.donemId, req.params.uzmanId]
  );
  res.json({ ozet, satirlar });
}));

// Mutabakat (Maviler) — satır bazlı Zeops ↔ Sell-out karşılaştırması
// Filtreler: uzman, magaza, marka, durum (Ok / Kısmi Ok / Mükerrer / Sell-out kaydı yok)
app.get("/api/mutabakat/:donemId", wrap(async (req, res) => {
  const { uzman, magaza, marka, durum, q } = req.query;
  const args = [req.params.donemId];
  let where = "h.donem_id = ?";
  if (uzman) { where += " AND h.uzman_id = ?"; args.push(uzman); }
  if (magaza) { where += " AND h.magaza_id = ?"; args.push(magaza); }
  if (marka) { where += " AND u.marka = ?"; args.push(marka); }
  if (durum) {
    if (durum === "ok") where += " AND h.aciklama = 'Ok'";
    else if (durum === "kismi") where += " AND h.aciklama LIKE 'Kısmi Ok%'";
    else if (durum === "mukerrer") where += " AND h.aciklama LIKE 'Mükerrer%'";
    else if (durum === "sellout_yok") where += " AND h.aciklama LIKE 'Sell-out%'";
  }
  if (q) {
    where += " AND (u.urun_adi LIKE ? OR u.uniq_kod LIKE ? OR uz.ad_soyad LIKE ? OR m.prim_magaza LIKE ?)";
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }
  const [satirlar] = await pool.query(
    `SELECT h.id, h.donem_id,
       uz.ad_soyad AS uzman,
       bl.marka_grubu_adi AS marka_grup,
       b.islem_tarihi, b.durum, b.satis_tarihi,
       b.magaza_ham AS beyan_magaza,
       m.prim_magaza AS sellout_magaza, m.bayi,
       b.barkod AS beyan_barkod, b.kod AS beyan_kod, b.etiket,
       (SELECT k.deger_ham FROM urun_kimlik k
         WHERE k.urun_id=u.id AND k.tip='referans' AND k.aktif=1
         ORDER BY k.id LIMIT 1) AS arcon_referans,
       (SELECT k.deger_ham FROM urun_kimlik k
         WHERE k.urun_id=u.id AND k.tip='barkod' AND k.aktif=1
         ORDER BY k.id LIMIT 1) AS arcon_barkod,
       u.marka, u.aks,
       u.uniq_kod, u.urun_adi AS uniq_ad,
       h.beyan_adet, h.prim_adet, h.birim_ciro, h.prime_esas_tutar,
       h.aciklama,
       o.toplam_oran AS uzman_prim_oran,
       ROUND(h.prime_esas_tutar * o.toplam_oran / 100, 2) AS satir_prim_tl
     FROM prim_hesap_satir h
     LEFT JOIN uzman uz ON uz.id = h.uzman_id
     LEFT JOIN magaza m ON m.id = h.magaza_id
     LEFT JOIN urun u ON u.id = h.urun_id
     LEFT JOIN satis_beyan b ON b.id = h.beyan_id
     LEFT JOIN prim_bolum bl ON bl.id = h.bolum_id
     LEFT JOIN prim_ozet o ON o.donem_id=h.donem_id AND o.uzman_id=h.uzman_id AND o.magaza_id=h.magaza_id
     WHERE ${where}
     ORDER BY uz.ad_soyad, m.prim_magaza, u.marka, u.uniq_kod, h.id
     LIMIT 5000`,
    args
  );
  // Filtre uzman/mağaza seçtiyse toplam prim özeti
  let secilenOzet = null;
  if (uzman) {
    const [ozetRows] = await pool.query(
      `SELECT uz.ad_soyad, m.prim_magaza,
         o.prime_esas_toplam, o.toplam_oran, o.toplam_prim,
         o.satis_prim, o.hedef_prim, o.siralama_prim, o.bonus_prim, o.ek_prim
       FROM prim_ozet o
       LEFT JOIN uzman uz ON uz.id=o.uzman_id
       LEFT JOIN magaza m ON m.id=o.magaza_id
       WHERE o.donem_id=? AND o.uzman_id=? ${magaza ? "AND o.magaza_id=?" : ""}`,
      magaza ? [req.params.donemId, uzman, magaza] : [req.params.donemId, uzman]
    );
    secilenOzet = ozetRows;
  }
  // Özet kartlar için durum dağılımı (filtresiz — tüm dönem)
  const [ozet] = await pool.query(
    `SELECT
       SUM(aciklama = 'Ok') AS ok_,
       SUM(aciklama LIKE 'Kısmi Ok%') AS kismi,
       SUM(aciklama LIKE 'Mükerrer%') AS mukerrer,
       SUM(aciklama LIKE 'Sell-out%') AS sellout_yok,
       COUNT(*) AS toplam,
       SUM(prime_esas_tutar) AS toplam_esas
     FROM prim_hesap_satir WHERE donem_id = ?`,
    [req.params.donemId]
  );
  res.json({ satirlar, ozet: ozet[0] || {}, secilenOzet });
}));

// Mutabakat XLSX export (Maviler formatında)
app.get("/api/mutabakat/:donemId/export", wrap(async (req, res) => {
  const XLSX = require("xlsx");
  const [rows] = await pool.query(
    `SELECT
       uz.ad_soyad AS "Uzman Ad-Soyad",
       bl.marka_grubu_adi AS "Marka Grup",
       b.islem_tarihi AS "İşlem Tarih",
       b.durum AS "Durum (Zeops)",
       b.satis_tarihi AS "Satış Tarih",
       b.magaza_ham AS "Mağaza (Beyan)",
       m.prim_magaza AS "Sell-Out Mağaza",
       b.barkod AS "Barkod",
       b.kod AS "Kod",
       b.etiket AS "Etiket",
       (SELECT k.deger_ham FROM urun_kimlik k
         WHERE k.urun_id=u.id AND k.tip='referans' AND k.aktif=1
         ORDER BY k.id LIMIT 1) AS "Arcon Referans",
       u.urun_adi AS "Arcon Ref Adı",
       (SELECT k.deger_ham FROM urun_kimlik k
         WHERE k.urun_id=u.id AND k.tip='barkod' AND k.aktif=1
         ORDER BY k.id LIMIT 1) AS "Arcon Barkod",
       u.marka AS "Marka",
       u.aks AS "Satış Grup / AKS",
       u.uniq_kod AS "Uniq Kod",
       u.urun_adi AS "Uniq ad",
       h.beyan_adet AS "Uzman Adet",
       h.prim_adet AS "Prim Adet",
       h.birim_ciro AS "Birim Ciro",
       h.prime_esas_tutar AS "Prime Esas",
       h.aciklama AS "Karar",
       o.toplam_oran AS "Uzman Prim %",
       ROUND(h.prime_esas_tutar * o.toplam_oran / 100, 2) AS "Satır Prim TL"
     FROM prim_hesap_satir h
     LEFT JOIN uzman uz ON uz.id = h.uzman_id
     LEFT JOIN magaza m ON m.id = h.magaza_id
     LEFT JOIN urun u ON u.id = h.urun_id
     LEFT JOIN satis_beyan b ON b.id = h.beyan_id
     LEFT JOIN prim_bolum bl ON bl.id = h.bolum_id
     LEFT JOIN prim_ozet o ON o.donem_id=h.donem_id AND o.uzman_id=h.uzman_id AND o.magaza_id=h.magaza_id
     WHERE h.donem_id = ?
     ORDER BY uz.ad_soyad, m.prim_magaza, u.marka, u.uniq_kod, h.id`,
    [req.params.donemId]
  );
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mutabakat");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="mutabakat_${req.params.donemId}.xlsx"`);
  res.end(buf);
}));

// Marka listesi (mutabakat filtresi için)
app.get("/api/markalar", wrap(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT DISTINCT marka FROM urun WHERE marka IS NOT NULL AND marka <> '' ORDER BY marka"
  );
  res.json(rows.map((r) => r.marka));
}));

// Dashboard istatistikleri
app.get("/api/dashboard/:donemId", wrap(async (req, res) => {
  const d = req.params.donemId;
  const [[beyan]] = await pool.query(
    "SELECT COUNT(*) satir, SUM(adet) adet, SUM(eslesme_durum<>'ok') eslesmeyen FROM satis_beyan WHERE donem_id=?", [d]);
  const [[so]] = await pool.query(
    `SELECT COUNT(*) satir, SUM(ciro_kdv_haric) ciro,
            SUM(eslesme_durum<>'ok') eslesmeyen
     FROM sellout WHERE donem_id=?`, [d]);
  const [[prim]] = await pool.query(
    "SELECT COUNT(*) kayit, SUM(toplam_prim) toplam, SUM(prime_esas_toplam) esas FROM prim_ozet WHERE donem_id=?", [d]);
  const [[hedef]] = await pool.query("SELECT COUNT(*) satir FROM hedef WHERE donem_id=?", [d]);
  const [[sira]] = await pool.query("SELECT COUNT(*) satir FROM siralama WHERE donem_id=?", [d]);
  const [[atama]] = await pool.query("SELECT COUNT(*) satir FROM uzman_atama WHERE donem_id=?", [d]);
  res.json({ beyan, sellout: so, prim, hedef, siralama: sira, atama });
}));

// Her hata (multer dahil) JSON dönsün — düz metin "Internal Server Error" yok
app.use((err, req, res, next) => {
  console.error("API hatası:", err);
  res.status(err.status || 500).json({ hata: err.message || "Sunucu hatası" });
});

// Süreç, beklenmeyen hatalarda log basıp ayakta kalsın
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Arcon Prim API -> http://localhost:${PORT}`));
