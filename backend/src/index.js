const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");
require("dotenv").config();

const pool = require("./db");
const { importZeops, importSellout, importHedef, importSiralama, importUzmanMagaza, importStok } = require("./services/importService");
const { hesapla, markaGrubunda, genisletMarkalar } = require("./services/hesapService");
const { normalizeName } = require("./util");
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
const DONEM_AYLAR = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function donemAd(yil, ay) {
  return `${DONEM_AYLAR[ay]} ${yil}`;
}

/** Eşzamanlı GET'lerin aynı sync'i üst üste yazmasını engeller. */
let donemSyncPromise = null;

/** İçinde bulunulan yılın sonuna kadar eksik ayları açar (gelecek aylar UI'da disabled). */
async function donemleriSenkronizeEt() {
  if (donemSyncPromise) return donemSyncPromise;

  donemSyncPromise = (async () => {
    const simdi = new Date();
    const bitisYil = simdi.getFullYear();
    const bitisAy = 12; // bu yılın kalan ayları listede görünsün

    const [mevcut] = await pool.query("SELECT yil, ay FROM donem ORDER BY yil ASC, ay ASC");
    const varOlan = new Set(mevcut.map((r) => `${Number(r.yil)}-${Number(r.ay)}`));

    let y = bitisYil;
    let a = 1;
    if (mevcut.length > 0) {
      y = Number(mevcut[0].yil);
      a = Number(mevcut[0].ay);
    }

    // Sadece eksik ayları ekle — her istekte UPDATE yapma (kilit / timeout riski)
    while (y < bitisYil || (y === bitisYil && a <= bitisAy)) {
      const anahtar = `${y}-${a}`;
      if (!varOlan.has(anahtar)) {
        await pool.query(
          "INSERT IGNORE INTO donem (yil, ay, ad) VALUES (?,?,?)",
          [y, a, donemAd(y, a)]
        );
      }
      a += 1;
      if (a > 12) {
        a = 1;
        y += 1;
      }
    }
  })().finally(() => {
    donemSyncPromise = null;
  });

  return donemSyncPromise;
}

async function yilDonemleriniAc(yil) {
  for (let ay = 1; ay <= 12; ay += 1) {
    await pool.query(
      "INSERT INTO donem (yil, ay, ad) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ad=VALUES(ad)",
      [yil, ay, donemAd(yil, ay)]
    );
  }
  const [rows] = await pool.query(
    "SELECT * FROM donem WHERE yil=? ORDER BY ay ASC",
    [yil]
  );
  return rows;
}

app.get("/api/donemler", wrap(async (req, res) => {
  try {
    await donemleriSenkronizeEt();
  } catch (e) {
    // Sync kilit/timeout olsa bile mevcut dönemleri döndür — UI spinner'da kalmasın
    console.error("donem senkron hatası:", e.message);
  }
  const [rows] = await pool.query("SELECT * FROM donem ORDER BY yil ASC, ay ASC");
  res.json(rows);
}));

/** Yeni takvim yılı dönemlerini açar. Yıl henüz gelmediyse reddeder. */
app.post("/api/donemler/yeni-yil", wrap(async (req, res) => {
  const simdiYil = new Date().getFullYear();
  const [[row]] = await pool.query("SELECT MAX(yil) AS max_yil FROM donem");
  const sonYil = Number(row?.max_yil) || simdiYil;
  const hedefYil = Number(req.body?.yil) || sonYil + 1;

  if (!Number.isFinite(hedefYil) || hedefYil < 2000 || hedefYil > 2100) {
    return res.status(400).json({ hata: "Geçersiz yıl." });
  }

  if (hedefYil > simdiYil) {
    return res.status(400).json({
      hata: `Henüz ${hedefYil} yılına gelinmediği için dönem açılamaz.`,
      yil: hedefYil,
      kod: "yil_gelmedi",
    });
  }

  if (hedefYil <= sonYil) {
    const [varOlan] = await pool.query(
      "SELECT * FROM donem WHERE yil=? ORDER BY ay ASC",
      [hedefYil]
    );
    return res.json({
      yil: hedefYil,
      donemler: varOlan,
      mesaj: `${hedefYil} dönemleri zaten açık.`,
      zatenAcik: true,
    });
  }

  const donemler = await yilDonemleriniAc(hedefYil);
  res.json({
    yil: hedefYil,
    donemler,
    mesaj: `${hedefYil} yılı dönemleri açıldı.`,
    zatenAcik: false,
  });
}));

app.post("/api/donemler", wrap(async (req, res) => {
  const { yil, ay } = req.body;
  if (!yil || !ay) return res.status(400).json({ hata: "yil ve ay zorunlu" });
  await pool.query(
    "INSERT INTO donem (yil, ay, ad) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ad=VALUES(ad)",
    [yil, ay, donemAd(yil, ay)]
  );
  await donemleriSenkronizeEt();
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

/** Uzun importlar (stok/zeops) proxy timeout yemesin diye arka planda işlenir. */
const importJobs = new Map();
/** Aynı tipte eşzamanlı import kilidi (özellikle stok → urun lock timeout). */
const aktifImportTipleri = new Map(); // tip -> baslangicMs
const IMPORT_KILIT_MAX_MS = 20 * 60 * 1000;

function importTipKilitliMi(tip) {
  const bas = aktifImportTipleri.get(tip);
  if (!bas) return false;
  if (Date.now() - bas > IMPORT_KILIT_MAX_MS) {
    aktifImportTipleri.delete(tip);
    return false;
  }
  return true;
}

function importJobTemizle() {
  const sinir = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of importJobs) {
    if ((job.bitis || job.baslangic || 0) < sinir) importJobs.delete(id);
  }
}

app.post("/api/import/:tip/:donemId", upload.single("dosya"), wrap(async (req, res) => {
  const tip = req.params.tip;
  const fn = importers[tip];
  if (!fn) return res.status(400).json({ hata: "Geçersiz import tipi" });
  if (!req.file) return res.status(400).json({ hata: "Dosya yüklenmedi (form alanı: dosya)" });
  const donemId = Number(req.params.donemId);
  if (await donemKilitli(donemId, res)) return;

  if (importTipKilitliMi(tip)) {
    const sn = Math.round((Date.now() - aktifImportTipleri.get(tip)) / 1000);
    return res.status(409).json({
      hata: `${tip} şu an işleniyor (${sn} sn). Bitmesini bekleyin, tekrar yüklemeyin.`,
      kod: "import_devam",
    });
  }

  // Multer HTTP başlığından Latin-1 varsayımıyla dosya adını okuyor;
  // Türkçe adları UTF-8 olarak yeniden yorumla (mojibake'i önler)
  const dosyaAdi = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  const buffer = req.file.buffer;
  const jobId = crypto.randomBytes(8).toString("hex");

  importJobTemizle();
  aktifImportTipleri.set(tip, Date.now());
  importJobs.set(jobId, {
    durum: "isleniyor",
    tip,
    donemId,
    dosyaAdi,
    baslangic: Date.now(),
  });

  // Dosya alındı — hemen dön; işlem arka planda sürsün (proxy 30–60sn kesmesin)
  res.json({ jobId, durum: "isleniyor", tip, dosyaAdi });

  setImmediate(() => {
    (async () => {
      try {
        const sonuc = await fn(buffer, donemId, dosyaAdi, {
          onProgress: (ilerleme) => {
            const job = importJobs.get(jobId);
            if (job && job.durum === "isleniyor") {
              importJobs.set(jobId, { ...job, ilerleme });
            }
          },
        });
        importJobs.set(jobId, {
          durum: "bitti",
          tip,
          donemId,
          dosyaAdi,
          sonuc,
          baslangic: importJobs.get(jobId)?.baslangic,
          bitis: Date.now(),
        });
      } catch (e) {
        console.error(`import job ${jobId} (${tip}):`, e);
        importJobs.set(jobId, {
          durum: "hata",
          tip,
          donemId,
          dosyaAdi,
          hata: e.message || String(e),
          detay: e.detail,
          baslangic: importJobs.get(jobId)?.baslangic,
          bitis: Date.now(),
        });
      } finally {
        aktifImportTipleri.delete(tip);
      }
    })();
  });
}));

/** Takılı import kilidini elle aç (stok 'işleniyor' diye takılırsa). */
async function importKilitAc(tip) {
  const vardi = aktifImportTipleri.has(tip);
  aktifImportTipleri.delete(tip);
  for (const [id, job] of importJobs) {
    if (job.tip === tip && job.durum === "isleniyor") {
      importJobs.set(id, {
        ...job,
        durum: "hata",
        hata: "İşlem elle iptal edildi (kilit açıldı).",
        bitis: Date.now(),
      });
    }
  }
  return { ok: true, tip, kilitAcildi: vardi, mesaj: vardi ? `${tip} kilidi açıldı.` : `${tip} kilidi zaten yoktu.` };
}
app.post("/api/import-kilit-ac", wrap(async (req, res) => {
  res.json(await importKilitAc(String(req.body?.tip || req.query?.tip || "stok")));
}));
app.post("/api/import-kilit-ac/:tip", wrap(async (req, res) => {
  res.json(await importKilitAc(req.params.tip || "stok"));
}));

app.get("/api/import-job/:jobId", wrap(async (req, res) => {
  const job = importJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({
      hata: "İş bulunamadı (sunucu yeniden başlamış olabilir). Sayfayı yenileyip kontrol edin.",
      kod: "job_yok",
    });
  }
  res.json(job);
}));

app.get("/api/import-log/:donemId", wrap(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM import_log WHERE donem_id=? ORDER BY created_at DESC",
    [req.params.donemId]
  );
  res.json(rows);
}));

/** Dönemin tüm yüklenen Excel verilerini + prim hesap sonuçlarını siler. Stok master kalır. */
app.delete("/api/donemler/:id/temizle", wrap(async (req, res) => {
  const donemId = Number(req.params.id);
  if (await donemKilitli(donemId, res)) return;

  const [[donem]] = await pool.query("SELECT id, ad, durum FROM donem WHERE id=?", [donemId]);
  if (!donem) return res.status(404).json({ hata: "Dönem bulunamadı" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // FK sırası: hesap satırları → özet → input tablolar → log
    const [hesap] = await conn.query("DELETE FROM prim_hesap_satir WHERE donem_id=?", [donemId]);
    const [ozet] = await conn.query("DELETE FROM prim_ozet WHERE donem_id=?", [donemId]);
    const [beyan] = await conn.query("DELETE FROM satis_beyan WHERE donem_id=?", [donemId]);
    const [sellout] = await conn.query("DELETE FROM sellout WHERE donem_id=?", [donemId]);
    const [hedef] = await conn.query("DELETE FROM hedef WHERE donem_id=?", [donemId]);
    const [siralama] = await conn.query("DELETE FROM siralama WHERE donem_id=?", [donemId]);
    const [atama] = await conn.query("DELETE FROM uzman_atama WHERE donem_id=?", [donemId]);
    const [log] = await conn.query("DELETE FROM import_log WHERE donem_id=?", [donemId]);
    await conn.query("UPDATE donem SET durum='acik' WHERE id=?", [donemId]);
    await conn.commit();

    const silinen = {
      prim_hesap_satir: hesap.affectedRows,
      prim_ozet: ozet.affectedRows,
      satis_beyan: beyan.affectedRows,
      sellout: sellout.affectedRows,
      hedef: hedef.affectedRows,
      siralama: siralama.affectedRows,
      uzman_atama: atama.affectedRows,
      import_log: log.affectedRows,
    };
    await audit("donem", donemId, "temizle", { donem: donem.ad, eski_durum: donem.durum, silinen });
    res.json({
      ok: true,
      mesaj: `${donem.ad} dönemindeki yüklenen dosyalar ve prim sonuçları temizlendi.`,
      silinen,
    });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
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
     ON DUPLICATE KEY UPDATE grup_adi=VALUES(grup_adi)`,
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
  const mukerrerMod = req.body?.mukerrer_mod || req.query.mukerrer_mod;
  const sonuc = await hesapla(donemId, mukerrerMod ? { mukerrerMod } : {});
  await audit("donem", donemId, "hesap", { donem: donem?.ad, esleme, mukerrerMod: mukerrerMod || null, ...sonuc });
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

// Satış primi (sade mod) — mevcut motor / prim_ozet'e dokunmaz.
// Sadece Zeops beyanlarının sell-out ile eşleşen "Ok / Kısmi Ok" kısmını
// alır ve uzman × mağaza için %1 sabit oranıyla prim üretir.
app.get("/api/satis-primi/:donemId", wrap(async (req, res) => {
  // Oran boşsa (veya 0 ise) bölüm bazlı satış primi (her uzmanın kendi bölümündeki
  // "satis_basi" oranı uygulanır — Puig %1, DG %1.5, Sensai %1.5 vs).
  // Oran verilmişse override — hepsine o oran uygulanır (sanity check için).
  const oranParam = req.query.oran;
  const overrideOran = oranParam !== undefined && oranParam !== "" ? Number(oranParam) : null;
  const bolumBazli = overrideOran === null;

  // Her uzman × mağaza için tek bir bölüm (tek bir satis_basi oranı). Bölüm başına
  // birden fazla satış_basi kuralı varsa MAX alınır (genelde tek satır olur).
  const sql = bolumBazli
    ? `SELECT
         uz.id AS uzman_id, uz.ad_soyad,
         m.id AS magaza_id, m.prim_magaza, m.bayi,
         h.bolum_id,
         COALESCE(MAX(k.prim_oran), 1) AS uygulanan_oran,
         SUM(h.prim_adet) AS prim_adet,
         SUM(h.prime_esas_tutar) AS prime_esas_toplam,
         ROUND(SUM(h.prime_esas_tutar) * COALESCE(MAX(k.prim_oran), 1) / 100, 2) AS satis_primi
       FROM prim_hesap_satir h
       JOIN uzman uz ON uz.id = h.uzman_id
       JOIN magaza m ON m.id = h.magaza_id
       LEFT JOIN prim_kural k ON k.bolum_id = h.bolum_id AND k.kriter_key = 'satis_basi'
       WHERE h.donem_id = ?
         AND h.prim_adet > 0
         AND (h.aciklama LIKE 'Ok%' OR h.aciklama LIKE 'Kısmi Ok%')
       GROUP BY uz.id, m.id, h.bolum_id
       ORDER BY uz.ad_soyad, m.prim_magaza`
    : `SELECT
         uz.id AS uzman_id, uz.ad_soyad,
         m.id AS magaza_id, m.prim_magaza, m.bayi,
         h.bolum_id,
         ? AS uygulanan_oran,
         SUM(h.prim_adet) AS prim_adet,
         SUM(h.prime_esas_tutar) AS prime_esas_toplam,
         ROUND(SUM(h.prime_esas_tutar) * ? / 100, 2) AS satis_primi
       FROM prim_hesap_satir h
       JOIN uzman uz ON uz.id = h.uzman_id
       JOIN magaza m ON m.id = h.magaza_id
       WHERE h.donem_id = ?
         AND h.prim_adet > 0
         AND (h.aciklama LIKE 'Ok%' OR h.aciklama LIKE 'Kısmi Ok%')
       GROUP BY uz.id, m.id, h.bolum_id
       ORDER BY uz.ad_soyad, m.prim_magaza`;

  const params = bolumBazli
    ? [req.params.donemId]
    : [overrideOran, overrideOran, req.params.donemId];
  const [rows] = await pool.query(sql, params);

  // Toplam prim: bölüm bazlı ise her satırın uygulanan oranıyla çarp, aksi halde override
  const toplamPrim = rows.reduce((a, r) => a + Number(r.satis_primi || 0), 0);
  const toplamEsas = rows.reduce((a, r) => a + Number(r.prime_esas_toplam || 0), 0);
  const uzmanSet = new Set(rows.map((r) => r.uzman_id));

  res.json({
    oran: bolumBazli ? null : overrideOran,
    bolum_bazli: bolumBazli,
    rows,
    toplam: { esas: +toplamEsas.toFixed(2), prim: +toplamPrim.toFixed(2), uzman: uzmanSet.size },
  });
}));

// ============================================================================
// PRİM RAPORU — Excel Prim Çalışma2 pivot birebir taklidi
// ============================================================================
// Kolonlar (E—Y):
//  E: Prime Esas Toplam Tutar        = SUM(prim_hesap_satir.prime_esas_tutar)
//  F: Prim %1                         = E × 0.01 (herkese sabit baseline)
//  G: Toplam Sephora Sensai +%1      = Sensai×Sephora için E × 0.01 (kalan satış farkı)
//  H: Sephora Bağdat + Beymen +%0,5  = BEYMEN bayisi VEYA Sephora Bağdat → E × 0.005
//  I: Toplam Sevil LP                 = LP grubu Sevil noktası → E × 0.005
//  J: Toplam Toplam                   = F + G + H + I
//  K: Mayıs Hedefler                  = uzmanın grup markalarında mağaza hedef toplamı
//  L: Hedef Prim %0,5                 = ciro hedefi tuttuysa E × 0.005
//  M–P: Dior 1.lik/sıralama kuralları  = detay_json'dan (dior bölümü)
//  Q: LP Mağaza-Cilt Bakım+diğer       = LP kuralları toplamı
//  R: Parfüm %1                        = %1 sıralama_marka kuralı tuttuysa E × 0.01
//  S,T: Parfüm %0,5                    = %0.5 sıralama kuralları tuttuysa E × 0.005
//  U: Nisan'dan Kalan                  = prim_ozet.devreden_prim
//  V: Ek Prim %0,20                    = BOŞ (isteğe göre kolon var, hesaplama yok)
//  W: Toplam Prim                      = J + L + M + N + O + P + Q + R + S + T + U
//  X: Prim Açıklama                    = özel notlar (varsa)
//  Y: Toplam Prim Yüzdesi              = W / E
async function primRaporuVerisi(donemId) {
  // Ana veri: prim_ozet + uzman + magaza + prim_bolum
  const [rows] = await pool.query(
    `SELECT o.*, u.ad_soyad, m.prim_magaza, m.bayi,
            b.bolum_adi, b.alt_kanal, b.kanal, b.marka_grubu_adi, b.markalar,
            a.grup_adi
       FROM prim_ozet o
       JOIN uzman u ON u.id=o.uzman_id
       JOIN magaza m ON m.id=o.magaza_id
       LEFT JOIN prim_bolum b ON b.id=o.bolum_id
       LEFT JOIN uzman_atama a
         ON a.donem_id=o.donem_id AND a.uzman_id=o.uzman_id
        AND a.magaza_id=o.magaza_id AND a.bolum_id=o.bolum_id
      WHERE o.donem_id=?
      ORDER BY u.ad_soyad, m.prim_magaza`,
    [donemId]
  );

  // Hedef verisi: mağaza × marka (K kolonu sadece uzmanın grup markalarını toplar)
  const [hedefRows] = await pool.query(
    `SELECT magaza_id, marka, hedef_ciro FROM hedef WHERE donem_id=? AND magaza_id IS NOT NULL`,
    [donemId]
  );
  const hedefByMagazaMarka = new Map(); // magazaId -> [{marka, hedef}]
  for (const r of hedefRows) {
    if (!hedefByMagazaMarka.has(r.magaza_id)) hedefByMagazaMarka.set(r.magaza_id, []);
    hedefByMagazaMarka.get(r.magaza_id).push({ marka: r.marka, hedef: Number(r.hedef_ciro) });
  }

  // Sell-out Marka Grup eşlemesi (hesap motoruyla aynı)
  const [mgRows] = await pool.query(
    `SELECT DISTINCT marka, marka_grup FROM sellout
      WHERE donem_id=? AND marka IS NOT NULL AND marka_grup IS NOT NULL`,
    [donemId]
  );
  const markaGrupMap = new Map(mgRows.map((r) => [normalizeName(r.marka), r.marka_grup]));

  // Her satırı Excel kolonlarına dağıt
  function normalize(s) { return String(s || "").toLocaleUpperCase("tr-TR").trim(); }
  function normAscii(s) {
    return normalize(s)
      .replace(/İ/g, "I").replace(/I/g, "I")
      .replace(/Ş/g, "S").replace(/Ğ/g, "G")
      .replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C");
  }

  function grupHedefToplami(magazaId, markalarJson) {
    const liste = hedefByMagazaMarka.get(magazaId) || [];
    let toplam = 0;
    for (const h of liste) {
      if (markaGrubunda(markalarJson, h.marka, markaGrupMap)) toplam += h.hedef;
    }
    return toplam;
  }

  function satirYap(r) {
    const E = Number(r.prime_esas_toplam || 0);
    const satisPrim = Number(r.satis_prim || 0);   // bölüm oranıyla hesaplanmış toplam satış primi
    const hedefPrim = Number(r.hedef_prim || 0);
    const siralamaPrim = Number(r.siralama_prim || 0);
    const bonusPrim = Number(r.bonus_prim || 0);
    const devreden = Number(r.devreden_prim || 0);
    const magazaAdi = normalize(r.prim_magaza);
    const bayi = normalize(r.bayi);
    const bolumAdi = normalize(r.bolum_adi);
    const altKanal = normalize(r.alt_kanal);
    let markalar = [];
    try { markalar = Array.isArray(r.markalar) ? r.markalar : JSON.parse(r.markalar || "[]"); } catch {}
    markalar = genisletMarkalar(markalar, r.grup_adi);
    const grup = normalize(markalar.join(" "));
    const grupAdi = normAscii(r.grup_adi || r.marka_grubu_adi || "");
    const bolumAdiAscii = normAscii(r.bolum_adi || "");
    const isDiorBolum = bolumAdiAscii.includes("DIOR")
      || (grupAdi.includes("DIOR") && !grupAdi.includes("TUM"));
    const isLpBolum = bolumAdiAscii.includes("LP")
      && !bolumAdiAscii.includes("DG")
      && !grupAdi.includes("DOLCE")
      && !grupAdi.includes("GABBANA");
    // Not: "La Prairie + Dolce" ataması BEYMEN DG bölümüdür; LP kolonu değil.
    const isTumParfum = grupAdi.includes("TUM MARKA")
      || (grupAdi.includes("PARFUM") && grupAdi.includes("TUM"));

    // F: baseline %1 (herkes)
    const F = +(E * 0.01).toFixed(2);

    // Bölüm satış oranı - toplam satış primi / E ≈ bölüm oranı
    const bolumOran = E > 0 ? satisPrim / E : 0; // ör: 0.01, 0.015, 0.02
    const fark = Math.max(0, satisPrim - F);     // baseline %1 üstü kalan

    // G: "Toplam Sephora Sensai + Sisley Cadde +%1" — bölüm oranı %2 olan
    // Sephora bölümleri için baseline %1 üstü kalan fark bu kolona yansır.
    // Sensai Sephora (bölüm 22) ve Sisley Sephora Cadde (bölüm 23) kapsanır.
    let G = 0;
    const isSensaiSephora = bayi === "SEPHORA" && grup.includes("SENSAI");
    const isSisleySephoraCadde = bayi === "SEPHORA" && grup.includes("SISLEY") && bolumAdi.includes("CADDE");
    if (isSensaiSephora || isSisleySephoraCadde) {
      G = fark; // %2 - %1 baseline = %1 ekstra
    }
    // H: BEYMEN bayisi VEYA Sephora Bağdat
    let H = 0;
    const isBagdat = magazaAdi.includes("BAĞDAT") || magazaAdi.includes("BAGDAT");
    if (bayi === "BEYMEN" || isBagdat) {
      // Bölüm satış farkı H'a yansır
      if (fark > 0) H = fark;
      // Sephora Bağdat + Beymen için satış oranı baseline aynıysa da %0.5 ek
      // (Excel'de bu formül otomatik %0.5 uyguluyor bu bayilerde). Ancak Meryem
      // gibi bölüm oranı %1.5 olan uzmanlarda fark zaten %0.5. Bölüm oranı %1
      // olan bir Beymen uzmanı için de %0.5 ekleniyorsa Excel öyle davranıyor:
      if (fark <= 0 && (bayi === "BEYMEN" || isBagdat)) {
        H = +(E * 0.005).toFixed(2);
      }
    }
    // I: Sevil LP → LP grubu Sevil noktası
    let I = 0;
    if (altKanal === "SEVIL" && grup.includes("LP")) {
      I = +(E * 0.005).toFixed(2);
    }

    // J: bonus toplamı
    const J = +(F + G + H + I).toFixed(2);

    // L: Hedef Prim %0.5 (hedef tutuyorsa)
    // Sistem detay_json'da "hedef_tutarsa" veya "ciro_hedefi" kuralı tutmuş mu bakmalı
    let L = 0;
    let detay = [];
    try { detay = Array.isArray(r.detay_json) ? r.detay_json : JSON.parse(r.detay_json || "[]"); } catch {}
    const ciroHedefDetay = detay.find((d) =>
      (d.kriter === "ciro_hedefi" || d.kriter === "ciro_hedefi_kosullu" || d.kriter === "hedef_tutarsa")
    );
    const ciroHedefiTuttu = !!(ciroHedefDetay && ciroHedefDetay.tuttu);
    if (ciroHedefiTuttu) L = +(E * 0.005).toFixed(2);

    // K: Hedefler — SADECE uzmanın grup markaları (örn. DG → sadece DOLCE & GABBANA).
    // Eskiden ciro_hedefi kuralı yoksa tüm mağaza hedefleri toplanıyordu (Bilici 7.1M bug'ı).
    const K = ciroHedefDetay && ciroHedefDetay.hedefToplam != null
      ? Number(ciroHedefDetay.hedefToplam)
      : grupHedefToplami(r.magaza_id, markalar);

    // M-P: Dior bölümü, Sevil Parfüm Tüm, veya Sevil DIOR ekstra detay (DG+LP / Sisley…)
    let M = 0, N = 0, O = 0, P = 0;
    const sevilDiorDetaylar = detay.filter((d) =>
      d.tuttu && d.kriter && /DIOR/i.test(String(d.kural || ""))
    );
    if (isDiorBolum || isTumParfum) {
      for (const d of detay.filter((x) => x.tuttu && x.kriter)) {
        const tutar = d.tutar != null
          ? +Number(d.tutar).toFixed(2)
          : +(E * Number(d.oran || 0) / 100).toFixed(2);
        if (d.kriter === "magaza_birinci" || d.kriter === "kumul_siralama") M += tutar;
        else if (d.kriter === "makyaj_siralama") N += tutar;
        else if (d.kriter === "parfum_siralama") O += tutar;
        else if (d.kriter === "cilt_siralama") P += tutar;
      }
      M = +M.toFixed(2); N = +N.toFixed(2); O = +O.toFixed(2); P = +P.toFixed(2);
    } else if (sevilDiorDetaylar.length) {
      for (const d of sevilDiorDetaylar) {
        const tutar = d.tutar != null
          ? +Number(d.tutar).toFixed(2)
          : +(E * Number(d.oran || 0) / 100).toFixed(2);
        if (d.kriter === "magaza_birinci") M += tutar;
        else if (d.kriter === "parfum_siralama") O += tutar;
      }
      M = +M.toFixed(2); O = +O.toFixed(2);
    }

    // Q: LP kuralları toplamı (Cilt 1., Mağaza 1. vs)
    let Q = 0;
    if (isLpBolum) {
      Q = +detay.filter((d) => d.tuttu && d.kriter && (String(d.kriter).includes("cilt") || d.kriter === "magaza_birinci" || d.kriter === "ozel"))
        .reduce((a, d) => a + Number(d.oran || 0) * E / 100, 0).toFixed(2);
    }

    // R, S, T: Parfüm / sıralama_marka kuralları (Dior/LP bölümü dışı)
    let R = 0, S = 0, T = 0;
    if (!isDiorBolum && !isLpBolum && siralamaPrim > 0) {
      // Sevil DIOR M/O kalemlerini R/S'den düş (tutar alanlı veya oran×E)
      const diorKalem = detay
        .filter((d) => d.tuttu && /DIOR/i.test(String(d.kural || ""))
          && (d.kriter === "magaza_birinci" || d.kriter === "parfum_siralama"))
        .reduce((a, d) => a + (d.tutar != null ? Number(d.tutar) : Number(d.oran || 0) * E / 100), 0);
      const parfumKurallari = detay.filter((d) =>
        d.tuttu
        && !/DIOR/i.test(String(d.kural || ""))
        && (d.kriter === "siralama_marka" || d.kriter === "parfum_siralama" || d.kriter === "kumul_siralama")
      );
      let kalan = Math.max(0, siralamaPrim - diorKalem);
      for (const k of parfumKurallari) {
        const oran = Number(k.oran || 0);
        const tutar = +(E * oran / 100).toFixed(2);
        if (oran >= 1.0 && R === 0) { R = tutar; kalan -= tutar; }
        else if (oran === 0.5 && S === 0) { S = tutar; kalan -= tutar; }
        else if (oran === 0.5 && T === 0) { T = tutar; kalan -= tutar; }
      }
      if (R === 0 && S === 0 && T === 0 && kalan > 0) R = +kalan.toFixed(2);
    }

    // U: Nisan'dan kalan (devreden prim)
    const U = +devreden.toFixed(2);

    // V: BOŞ
    const V = null;

    // W: Toplam Prim
    const W = +(J + L + M + N + O + P + Q + R + S + T + U).toFixed(2);

    // X: Prim açıklama
    const X = ""; // ilerde detay eklenebilir

    // Y: Toplam Prim Yüzdesi
    const Y = E > 0 ? +(W / E).toFixed(4) : 0;

    return {
      uzman_id: r.uzman_id, uzman: r.ad_soyad,
      marka_grup: r.marka_grubu_adi || markalar.join(", "),
      magaza: r.prim_magaza, bayi: r.bayi,
      satis_grup: markalar.join(", ") || null,
      E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y,
    };
  }

  const satirlar = rows.map(satirYap);

  // Uzman bazlı toplam satırları oluştur
  const uzmanToplamlar = new Map();
  for (const s of satirlar) {
    if (!uzmanToplamlar.has(s.uzman_id)) {
      uzmanToplamlar.set(s.uzman_id, {
        uzman: `Toplam ${s.uzman}`, tip: "uzman_toplam",
        E: 0, F: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0, T: 0, U: 0, V: null, W: 0, Y: 0,
      });
    }
    const t = uzmanToplamlar.get(s.uzman_id);
    for (const k of ["E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","W"]) {
      t[k] += Number(s[k] || 0);
    }
  }
  for (const t of uzmanToplamlar.values()) {
    t.Y = t.E > 0 ? +(t.W / t.E).toFixed(4) : 0;
    for (const k of ["E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","W"]) t[k] = +t[k].toFixed(2);
  }

  // Genel toplam
  const genelToplam = {
    uzman: "Genel Toplam", tip: "genel_toplam",
    E: 0, F: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0, T: 0, U: 0, V: null, W: 0, Y: 0,
  };
  for (const s of satirlar) {
    for (const k of ["E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","W"]) {
      genelToplam[k] += Number(s[k] || 0);
    }
  }
  genelToplam.Y = genelToplam.E > 0 ? +(genelToplam.W / genelToplam.E).toFixed(4) : 0;
  for (const k of ["E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","W"]) {
    genelToplam[k] = +genelToplam[k].toFixed(2);
  }

  // Uzman + toplam satırlarını birleştir (grup + toplam)
  const bulusuk = [];
  const uzmanIdSirali = [...new Set(satirlar.map((s) => s.uzman_id))];
  for (const uid of uzmanIdSirali) {
    const detaySatirlar = satirlar.filter((s) => s.uzman_id === uid);
    for (const d of detaySatirlar) bulusuk.push({ ...d, tip: "detay" });
    bulusuk.push(uzmanToplamlar.get(uid));
  }
  bulusuk.push(genelToplam);

  return {
    donem_id: donemId,
    satirlar: bulusuk,
    genel_toplam: genelToplam,
  };
}

app.get("/api/prim-raporu/:donemId", wrap(async (req, res) => {
  const veri = await primRaporuVerisi(req.params.donemId);
  res.json(veri);
}));

// ---------- Satır satır Prim Çalışma (sistem hesabı, dönem bazlı) ----------
const PRIM_SATIR_KOLONLAR = [
  { key: "ziyaret_id", ad: "Ziyaret ID", renk: "acik" },
  { key: "ad", ad: "Ad", renk: "mavi" },
  { key: "soyad", ad: "Soyad", renk: "mavi" },
  { key: "birlestirilmis_isim", ad: "Birleştirilmiş İsim", renk: "mavi" },
  { key: "ad_soyad", ad: "Uzman Ad-Soyad", renk: "mavi" },
  { key: "prim_grup", ad: "Prim Grup", renk: "mavi" },
  { key: "islem_tarihi", ad: "İşlem Tarihi", renk: "acik" },
  { key: "durum", ad: "Durum", renk: "acik" },
  { key: "satis_tarihi", ad: "Satış Tarihi", renk: "acik" },
  { key: "magaza_ham", ad: "Mağaza", renk: "acik" },
  { key: "sellout_magaza", ad: "Sell-Out Mağaza", renk: "acik" },
  { key: "barkod", ad: "Barkod", renk: "acik" },
  { key: "kod", ad: "Kod", renk: "acik" },
  { key: "etiket", ad: "Etiket", renk: "acik" },
  { key: "arcon_referans", ad: "Arcon Referans", renk: "acik" },
  { key: "arcon_ref_adi", ad: "Arcon Ref Adı", renk: "acik" },
  { key: "arcon_barkod", ad: "Arcon Barkod", renk: "acik" },
  { key: "marka", ad: "Marka", renk: "acik" },
  { key: "satis_grup", ad: "Satış Grup", renk: "acik" },
  { key: "aks", ad: "AKS", renk: "acik" },
  { key: "uniq_kod", ad: "Uniq Kod", renk: "acik" },
  { key: "urun_adi", ad: "Uniq Ad", renk: "acik" },
  { key: "uzman_toplam_satis", ad: "Uzman Toplam Satış", renk: "sari" },
  { key: "magaza_toplam_satis", ad: "Mağaza Toplam Satış", renk: "sari" },
  { key: "kontrol", ad: "Kontrol", renk: "sari" },
  { key: "rapor_aciklama", ad: "Rapor Açıklama", renk: "sari" },
  { key: "adet", ad: "Adet", renk: "acik" },
  { key: "fiyat", ad: "Fiyat", renk: "acik" },
  { key: "toplam", ad: "Toplam", renk: "acik" },
  { key: "satis_notlari", ad: "Satış Notları", renk: "acik" },
  { key: "prim_adet", ad: "Prim Hesaplanan Adet", renk: "yesil" },
  { key: "sellout_adet", ad: "Sell-Out Adet", renk: "yesil" },
  { key: "magaza_kdv_haric_ciro", ad: "Mağaza KDV Hariç Ciro", renk: "yesil" },
  { key: "birim_ciro", ad: "Prime Esas Birim Ciro", renk: "yesil" },
  { key: "prime_esas_tutar", ad: "Prime Esas Toplam Tutar", renk: "yesil" },
  { key: "prim_yuzde_1", ad: "Prim % 1", renk: "yesil" },
  { key: "sephora_sensai", ad: "Sephora Sensai + %1", renk: "yesil" },
  { key: "sephora_bagdat_beymen", ad: "Sephora Bağdat + Beymen + % 0,05", renk: "yesil" },
  { key: "sevil_lp", ad: "Sevil LP +% 0,05", renk: "yesil" },
  { key: "toplam_satis_primi", ad: "Toplam Satış Primi", renk: "yesil" },
  { key: "bayi", ad: "Bayi", renk: "yesil" },
  { key: "satis_turu", ad: "Satış Türü", renk: "yesil" },
  { key: "nokta_uzman_sayisi", ad: "Nokta Uzman Sayısı", renk: "yesil" },
];

function tarihYaz(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const gg = String(d.getDate()).padStart(2, "0");
  const aa = String(d.getMonth() + 1).padStart(2, "0");
  return `${gg}.${aa}.${d.getFullYear()}`;
}

function raporAciklamaUret(hAciklama, eslesmeDurum) {
  const raw = String(hAciklama || "").trim();
  // Eski detaylı metinleri sadeleştir (yeniden hesap gerekmez)
  if (/^ok\b/i.test(raw)) return "Ok";
  if (/grup\s*d[ıi][sş][ıi]/i.test(raw) || eslesmeDurum === "atama_yok") return "Grup dışı";
  if (raw) return raw;
  if (eslesmeDurum === "urun_yok") return "Ürün/marka eşleşmedi — prim hesaplanmadı";
  if (eslesmeDurum === "magaza_yok") return "Mağaza eşleşmedi — prim hesaplanmadı";
  if (eslesmeDurum === "uzman_yok") return "Uzman eşleşmedi — prim hesaplanmadı";
  return "Hesap satırı yok";
}

/** Excel Satış Grup: PUIG/BPI gibi havuzlarda AKS; marka=grup markalarında marka adı. */
function satisGrupHesapla(marka, aks, markaGrup) {
  const g = String(markaGrup || "").toLocaleUpperCase("tr-TR").trim();
  const m = String(marka || "").toLocaleUpperCase("tr-TR").trim();
  const a = String(aks || "").replace(/Ã\x9C/g, "Ü").replace(/Ã\x87/g, "Ç").replace(/Ä°/g, "İ").trim();
  if (!m && !a) return "";
  if (!g || g === "PUIG" || g === "BPI" || g.startsWith("PUIG ")) return a || "";
  return String(markaGrup || marka || "").trim();
}

function aksTemizle(aks) {
  if (!aks) return "";
  return String(aks)
    .replace(/PARFÃ\x9CM/g, "PARFÜM")
    .replace(/CÄ°LT/g, "CİLT")
    .replace(/SAÃ\x87/g, "SAÇ")
    .trim();
}

/** Excel SATIŞ TÜRÜ: grubuna giren satış vs grup dışı. */
function satisTuruHesapla(eslesmeDurum, hesapId) {
  if (eslesmeDurum === "atama_yok") return "Grup Dışı";
  if (hesapId != null) return "Grup Satış";
  if (["urun_yok", "magaza_yok", "uzman_yok"].includes(eslesmeDurum)) {
    return "Prim Hesaplama Dışı";
  }
  return "Prim Hesaplama Dışı";
}

/**
 * Excel NOKTA UZMAN SAYISI: mağazadaki uzman adedi.
 * BOYNER'da DIOR uzmanları ayrı sayılır — parfüm noktası = DIOR dışı uzman sayısı
 * (ANKAMALL vb. Excel'de 4; sistem pay_orani=1 göstermesin diye).
 */
async function loadNoktaUzmanSayisiMap(donemId) {
  const [rows] = await pool.query(
    `SELECT a.magaza_id, m.bayi, a.uzman_id, a.grup_adi
     FROM uzman_atama a
     JOIN magaza m ON m.id = a.magaza_id
     WHERE a.donem_id = ?`,
    [donemId]
  );
  const byMag = new Map();
  for (const r of rows) {
    if (!byMag.has(r.magaza_id)) {
      byMag.set(r.magaza_id, { bayi: r.bayi || "", all: new Set(), nonDior: new Set() });
    }
    const g = byMag.get(r.magaza_id);
    g.all.add(r.uzman_id);
    if (!/DIOR/i.test(String(r.grup_adi || ""))) g.nonDior.add(r.uzman_id);
  }
  const out = new Map();
  for (const [magazaId, g] of byMag) {
    const bayi = String(g.bayi).toLocaleUpperCase("tr-TR");
    const total = g.all.size;
    const nonDior = g.nonDior.size;
    // BOYNER: Excel ile aynı — DIOR hariç nokta sayısı (0 ise toplam)
    if (bayi.includes("BOYNER")) {
      out.set(magazaId, nonDior > 0 ? nonDior : total);
    } else {
      out.set(magazaId, total);
    }
  }
  return out;
}

function applyNoktaUzmanSayisi(rows, noktaMap) {
  for (const r of rows) {
    if (r.magaza_id != null && noktaMap.has(r.magaza_id)) {
      r.nokta_uzman_sayisi = noktaMap.get(r.magaza_id);
    } else {
      r.nokta_uzman_sayisi = null;
    }
  }
  return rows;
}

/** Zeops Ad/Soyad yoksa ad_soyad'dan ayır (son kelime = soyad). */
function adSoyadAyir(full, ad, soyad) {
  const a = String(ad || "").trim();
  const s = String(soyad || "").trim();
  if (a || s) return { ad: a, soyad: s };
  const t = String(full || "").trim().replace(/\s+/g, " ");
  if (!t) return { ad: "", soyad: "" };
  const i = t.lastIndexOf(" ");
  if (i < 0) return { ad: t, soyad: "" };
  return { ad: t.slice(0, i), soyad: t.slice(i + 1) };
}

/** Satır bazlı satış primi kolonları (Excel Prim Çalışma AE–AN). */
function satirSatisPrimleri(primeEsas, meta) {
  const E = Number(primeEsas || 0);
  const bayi = String(meta.bayi || "").toLocaleUpperCase("tr-TR").trim();
  const magaza = String(meta.magaza || "").toLocaleUpperCase("tr-TR").trim();
  const grup = String(meta.grup || "").toLocaleUpperCase("tr-TR").trim();
  const altKanal = String(meta.altKanal || "").toLocaleUpperCase("tr-TR").trim();
  const bolumAdi = String(meta.bolumAdi || "").toLocaleUpperCase("tr-TR").trim();

  const prim1 = +(E * 0.01).toFixed(2);
  let sensai = 0;
  const isSensaiSephora = bayi === "SEPHORA" && grup.includes("SENSAI");
  const isSisleyCadde = bayi === "SEPHORA" && grup.includes("SISLEY") && bolumAdi.includes("CADDE");
  if (isSensaiSephora || isSisleyCadde) sensai = prim1;

  let bagdatBeymen = 0;
  const isBagdat = magaza.includes("BAĞDAT") || magaza.includes("BAGDAT");
  if (bayi === "BEYMEN" || isBagdat) bagdatBeymen = +(E * 0.005).toFixed(2);

  let sevilLp = 0;
  if ((altKanal === "SEVIL" || bayi === "SEVIL") && grup.includes("LP")) {
    sevilLp = +(E * 0.005).toFixed(2);
  }

  return {
    prim_yuzde_1: prim1,
    sephora_sensai: sensai,
    sephora_bagdat_beymen: bagdatBeymen,
    sevil_lp: sevilLp,
    toplam_satis_primi: +(prim1 + sensai + bagdatBeymen + sevilLp).toFixed(2),
  };
}

/**
 * Excel Prim Çalışma gibi: her Zeops beyanı ayrı satır (birleştirme yok).
 * Uzman Toplam Satış / Kontrol yine uzman × mağaza × ürün üzerinden hesaplanır.
 */
function primSatirlariBirlesir(satirlar) {
  const sirali = satirlar.map((s) => ({ ...s }));

  // Uzman × mağaza × ürün bazında toplam adet (ziyaretler / mükerrer satırlar arası)
  const uzmanUrunToplam = new Map();
  for (const t of sirali) {
    const urunAnahtar =
      (t.barkod && `b:${t.barkod}`) ||
      (t.uniq_kod && `q:${t.uniq_kod}`) ||
      (t.kod && `k:${t.kod}`) ||
      (t.urun_id && `u:${t.urun_id}`) ||
      `e:${t.etiket || ""}`;
    const uk = `${t.uzman_id || t.ad_soyad}|${t.magaza_id || t.magaza_ham || ""}|${urunAnahtar}`;
    uzmanUrunToplam.set(uk, (uzmanUrunToplam.get(uk) || 0) + Number(t.adet || 0));
  }

  for (const t of sirali) {
    const urunAnahtar =
      (t.barkod && `b:${t.barkod}`) ||
      (t.uniq_kod && `q:${t.uniq_kod}`) ||
      (t.kod && `k:${t.kod}`) ||
      (t.urun_id && `u:${t.urun_id}`) ||
      `e:${t.etiket || ""}`;
    const uk = `${t.uzman_id || t.ad_soyad}|${t.magaza_id || t.magaza_ham || ""}|${urunAnahtar}`;
    t.uzman_toplam_satis = uzmanUrunToplam.get(uk) || Number(t.adet || 0);
    t.magaza_toplam_satis = Number(t.sellout_adet || 0);
    t.kontrol = Number(t.magaza_toplam_satis || 0) - Number(t.uzman_toplam_satis || 0);
    Object.assign(t, satirSatisPrimleri(t.prime_esas_tutar, {
      bayi: t.bayi,
      magaza: t.sellout_magaza || t.magaza_ham,
      grup: t.bolum_markalar || t.prim_grup,
      altKanal: t.alt_kanal,
      bolumAdi: t.bolum_adi,
    }));
  }
  return sirali;
}

/** Satır satır kolon filtresi için SQL ifadeleri (tüm dönem verisi). */
const SATIR_FILTRE_EXPR = {
  ziyaret_id: "COALESCE(b.ziyaret_id, '')",
  ad: "COALESCE(b.ad, '')",
  soyad: "COALESCE(b.soyad, '')",
  ad_soyad: "COALESCE(u.ad_soyad, b.uzman_ham, '')",
  prim_grup: "COALESCE(a.grup_adi, '')",
  durum: "COALESCE(b.durum, '')",
  magaza_ham: "COALESCE(b.magaza_ham, '')",
  sellout_magaza: "COALESCE(m.prim_magaza, b.magaza_ham, '')",
  barkod: "COALESCE(b.barkod, '')",
  kod: "COALESCE(b.kod, '')",
  etiket: "COALESCE(b.etiket, '')",
  marka: "COALESCE(ur.marka, '')",
  uniq_kod: "COALESCE(ur.uniq_kod, b.kod, '')",
  urun_adi: "COALESCE(ur.urun_adi, b.etiket, '')",
  bayi: "COALESCE(m.bayi, '')",
  satis_turu: `CASE
    WHEN b.eslesme_durum='atama_yok' THEN 'Grup Dışı'
    WHEN h.id IS NOT NULL THEN 'Grup Satış'
    ELSE 'Prim Hesaplama Dışı'
  END`,
  rapor_aciklama: "COALESCE(h.aciklama, '')",
};

function parseKolonFiltre(raw) {
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!SATIR_FILTRE_EXPR[k]) continue;
    const arr = (Array.isArray(v) ? v : [v])
      .map((x) => (x == null ? "" : String(x)))
      .map((x) => (x === "(Boş)" ? "" : x));
    if (arr.length) out[k] = [...new Set(arr)];
  }
  return out;
}

async function primSatirSorgusu(donemId, { q, aciklama, kolonFiltre }) {
  // ? sırası: sg, so_u, so_b, so_r alt sorguları, sonra b.donem_id
  const params = [donemId, donemId, donemId, donemId, donemId];
  let where = "b.donem_id=?";
  const { normalizeName } = require("./util");
  const filtre = kolonFiltre && typeof kolonFiltre === "object" ? kolonFiltre : {};

  // urun: önce beyan.urun_id, yoksa barkod/referans kimliği (inceleme ürünleri dahil)
  // Sell-out SQL: urun_id → barkod → referans; uniq eşlemesi satır sonrası JS'te (çok barkodlu ürün)
  const fromJoin = `
    FROM satis_beyan b
    LEFT JOIN prim_hesap_satir h ON h.beyan_id=b.id
    LEFT JOIN uzman u ON u.id=b.uzman_id
    LEFT JOIN magaza m ON m.id=b.magaza_id
    LEFT JOIN urun_kimlik kbar
      ON kbar.aktif=1 AND kbar.tip='barkod' AND kbar.deger_normalize=b.barkod
    LEFT JOIN urun_kimlik kref
      ON kref.aktif=1 AND kref.tip='referans' AND kref.deger_normalize=b.kod
    LEFT JOIN urun ur ON ur.id=COALESCE(b.urun_id, kbar.urun_id, kref.urun_id)
    LEFT JOIN uzman_atama a
      ON a.donem_id=b.donem_id AND a.uzman_id=b.uzman_id AND a.magaza_id=b.magaza_id
     AND a.bolum_id = COALESCE(
       h.bolum_id,
       (SELECT MIN(a2.bolum_id) FROM uzman_atama a2
         WHERE a2.donem_id=b.donem_id AND a2.uzman_id=b.uzman_id AND a2.magaza_id=b.magaza_id)
     )
    LEFT JOIN prim_bolum pb ON pb.id=COALESCE(h.bolum_id, a.bolum_id)
    LEFT JOIN (
      SELECT marka, MAX(marka_grup) AS marka_grup
        FROM sellout
       WHERE donem_id=?
       GROUP BY marka
    ) sg ON sg.marka=ur.marka
    LEFT JOIN (
      SELECT magaza_id, urun_id, SUM(adet) AS adet, SUM(ciro_kdv_haric) AS ciro
        FROM sellout
       WHERE donem_id=? AND urun_id IS NOT NULL
       GROUP BY magaza_id, urun_id
    ) so_u ON so_u.magaza_id=b.magaza_id AND so_u.urun_id=ur.id
    LEFT JOIN (
      SELECT magaza_id, arcon_barkod, SUM(adet) AS adet, SUM(ciro_kdv_haric) AS ciro
        FROM sellout
       WHERE donem_id=? AND arcon_barkod IS NOT NULL AND arcon_barkod<>''
       GROUP BY magaza_id, arcon_barkod
    ) so_b ON so_b.magaza_id=b.magaza_id AND so_b.arcon_barkod=b.barkod
    LEFT JOIN (
      SELECT magaza_id, UPPER(TRIM(arcon_referans)) AS ref_n,
             SUM(adet) AS adet, SUM(ciro_kdv_haric) AS ciro
        FROM sellout
       WHERE donem_id=? AND arcon_referans IS NOT NULL AND arcon_referans<>''
       GROUP BY magaza_id, UPPER(TRIM(arcon_referans))
    ) so_r ON so_r.magaza_id=b.magaza_id AND so_r.ref_n=UPPER(TRIM(COALESCE(b.kod, '')))
  `;

  if (q) {
    // Türkçe büyük/küçük + ASCII yazım (YILDIRIM / yildirim → Yıldırım)
    const like = `%${q}%`;
    const likeNorm = `%${normalizeName(q)}%`;
    where += ` AND (
      COALESCE(u.normal_ad, '') LIKE ?
      OR COALESCE(u.ad_soyad, b.uzman_ham, '') COLLATE utf8mb4_general_ci LIKE ?
      OR COALESCE(b.ad, '') COLLATE utf8mb4_general_ci LIKE ?
      OR COALESCE(b.soyad, '') COLLATE utf8mb4_general_ci LIKE ?
      OR COALESCE(m.prim_magaza, b.magaza_ham, '') COLLATE utf8mb4_general_ci LIKE ?
      OR COALESCE(b.barkod, '') LIKE ?
      OR COALESCE(b.kod, '') LIKE ?
      OR COALESCE(b.ziyaret_id, '') LIKE ?
      OR COALESCE(a.grup_adi, '') COLLATE utf8mb4_general_ci LIKE ?
      OR COALESCE(ur.marka, '') COLLATE utf8mb4_general_ci LIKE ?
      OR COALESCE(ur.uniq_kod, '') COLLATE utf8mb4_general_ci LIKE ?
    )`;
    params.push(likeNorm, like, like, like, like, like, like, like, like, like, like);
  }
  if (aciklama === "Ok") {
    where += ` AND h.aciklama LIKE 'Ok%'`;
  } else if (aciklama === "Mükerrer") {
    where += ` AND h.aciklama LIKE '%ükerrer%'`;
  } else if (aciklama === "Eşleşmeyen") {
    where += ` AND (
      h.aciklama LIKE 'Sell-out%'
      OR b.eslesme_durum IN ('atama_yok','urun_yok','magaza_yok','uzman_yok')
      OR (h.id IS NULL AND (b.eslesme_durum IS NULL OR b.eslesme_durum <> 'ok'))
    )`;
  } else if (aciklama === "Grup Dışı") {
    where += ` AND b.eslesme_durum='atama_yok'`;
  } else if (aciklama === "Grup Satış") {
    where += ` AND h.id IS NOT NULL`;
  }

  for (const [key, values] of Object.entries(filtre)) {
    const expr = SATIR_FILTRE_EXPR[key];
    if (!expr || !values?.length) continue;
    const ph = values.map(() => "?").join(",");
    if (key === "ad_soyad") {
      const norms = values.map((v) => normalizeName(v));
      const phN = norms.map(() => "?").join(",");
      where += ` AND (
        (${expr}) IN (${ph})
        OR COALESCE(u.normal_ad, '') IN (${phN})
      )`;
      params.push(...values, ...norms);
    } else {
      where += ` AND (${expr}) IN (${ph})`;
      params.push(...values);
    }
  }

  const whereSql = `${fromJoin} WHERE ${where}`;
  const hasExtra = !!(q || aciklama || Object.keys(filtre).length);

  // Ham beyan sayısı (birleştirmeden önce) — UI sayımı birleşik satır üzerinden yapılır
  let hamSayim;
  if (!hasExtra) {
    const [[c]] = await pool.query("SELECT COUNT(*) AS n FROM satis_beyan WHERE donem_id=?", [donemId]);
    hamSayim = c.n;
  } else {
    const [[c]] = await pool.query(`SELECT COUNT(*) AS n ${whereSql}`, params);
    hamSayim = c.n;
  }
  const selectSql = `
    SELECT
      b.id AS beyan_id,
      b.ziyaret_id,
      b.uzman_id,
      b.magaza_id,
      b.urun_id AS beyan_urun_id,
      ur.id AS urun_id,
      b.ad AS beyan_ad,
      b.soyad AS beyan_soyad,
      COALESCE(u.ad_soyad, b.uzman_ham) AS ad_soyad,
      a.grup_adi AS prim_grup,
      NULL AS nokta_uzman_sayisi,
      pb.bolum_adi,
      pb.alt_kanal,
      pb.markalar AS bolum_markalar,
      b.islem_tarihi,
      b.durum,
      b.satis_tarihi,
      b.magaza_ham,
      COALESCE(m.prim_magaza, b.magaza_ham) AS sellout_magaza,
      b.barkod,
      b.kod,
      b.etiket,
      ur.marka,
      ur.urun_adi,
      ur.uniq_kod,
      ur.aks,
      sg.marka_grup AS sellout_marka_grup,
      b.adet,
      b.fiyat,
      b.toplam,
      b.satis_notlari,
      COALESCE(h.beyan_adet, b.adet) AS beyan_adet,
      COALESCE(h.prim_adet, 0) AS prim_adet,
      h.birim_ciro,
      COALESCE(h.prime_esas_tutar, 0) AS prime_esas_tutar,
      h.aciklama AS h_aciklama,
      h.id AS hesap_id,
      b.eslesme_durum,
      m.bayi,
      COALESCE(so_u.adet, so_b.adet, so_r.adet, 0) AS sellout_adet,
      COALESCE(so_u.ciro, so_b.ciro, so_r.ciro, 0) AS sellout_ciro
    ${whereSql}
    ORDER BY b.id
  `;
  return { hamSayim, selectSql, params };
}

/**
 * SQL'de barkod/referans tutmazsa uniq_kod master üzerinden sell-out doldur.
 * (1 ürün = birden fazla barkod/referans; Excel uniq köprüsü)
 */
async function enrichSelloutByUniq(donemId, rows) {
  if (!rows?.length) return rows;
  const need = rows.filter((r) => !Number(r.sellout_adet || 0));
  if (!need.length) return rows;

  const normKod = (v) => String(v || "").trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
  const normBar = (v) => String(v || "").trim().replace(/\D/g, "");

  const [uniqRows] = await pool.query(
    `SELECT referans, barkod, stok_kodu, stok_barkod_1, uniq_kod, stok_list_uniq_kod FROM uniq_kod`
  );
  const codeToUniq = new Map();
  const mapCode = (code, canon, asBar) => {
    const u = normKod(canon);
    if (!u) return;
    if (asBar) {
      const b = normBar(code);
      if (b) codeToUniq.set(`b:${b}`, u);
    } else {
      const c = normKod(code);
      if (c) codeToUniq.set(`c:${c}`, u);
    }
  };
  for (const row of uniqRows) {
    const canon = normKod(row.stok_list_uniq_kod) || normKod(row.uniq_kod) || normKod(row.referans);
    if (!canon) continue;
    mapCode(row.referans, canon, false);
    mapCode(row.stok_kodu, canon, false);
    mapCode(row.uniq_kod, canon, false);
    mapCode(row.stok_list_uniq_kod, canon, false);
    mapCode(row.barkod, canon, true);
    mapCode(row.stok_barkod_1, canon, true);
  }
  // Excel: TOO EDPI NEW → Uniq DGIP1TO1L04
  mapCode("DGI89664500999", "DGIP1TO1L04", false);
  mapCode("8057971185702", "DGIP1TO1L04", true);
  const canonOf = (ref, bar, urunUniq) => {
    if (ref) {
      const hit = codeToUniq.get(`c:${normKod(ref)}`);
      if (hit) return hit;
    }
    if (bar) {
      const hit = codeToUniq.get(`b:${normBar(bar)}`);
      if (hit) return hit;
    }
    if (urunUniq) return normKod(urunUniq) || null;
    return ref ? normKod(ref) : null;
  };

  const [soAll] = await pool.query(
    `SELECT so.magaza_id, so.arcon_referans, so.arcon_barkod, so.adet, so.ciro_kdv_haric, u.uniq_kod AS urun_uniq
     FROM sellout so
     LEFT JOIN urun u ON u.id=so.urun_id
     WHERE so.donem_id=? AND so.magaza_id IS NOT NULL`,
    [donemId]
  );
  const soUniq = new Map(); // magaza|canon → {adet,ciro}
  for (const r of soAll) {
    const canon = canonOf(r.arcon_referans, r.arcon_barkod, r.urun_uniq);
    if (!canon) continue;
    const key = `${r.magaza_id}|${canon}`;
    const cur = soUniq.get(key) || { adet: 0, ciro: 0 };
    cur.adet += Number(r.adet) || 0;
    cur.ciro += Number(r.ciro_kdv_haric) || 0;
    soUniq.set(key, cur);
  }

  for (const r of need) {
    const canon = canonOf(r.kod, r.barkod, r.uniq_kod);
    if (!canon || !r.magaza_id) continue;
    const hit = soUniq.get(`${r.magaza_id}|${canon}`);
    if (!hit || hit.adet <= 0) continue;
    r.sellout_adet = hit.adet;
    r.sellout_ciro = hit.ciro;
  }
  return rows;
}

function primSatirMap(r) {
  const aks = aksTemizle(r.aks);
  const marka = r.marka || "";
  const adSoyad = r.ad_soyad || "";
  const { ad, soyad } = adSoyadAyir(adSoyad, r.beyan_ad, r.beyan_soyad);
  const birlestirilmis = [ad, soyad].filter(Boolean).join(" ") || adSoyad;
  const selloutAdet = Number(r.sellout_adet || 0);
  const selloutCiro = Number(r.sellout_ciro || 0);
  const adet = Number(r.adet || 0);
  const primeEsas = Number(r.prime_esas_tutar || 0);
  let bolumMarkalar = "";
  try {
    const raw = r.bolum_markalar;
    const arr = Array.isArray(raw) ? raw : JSON.parse(raw || "[]");
    bolumMarkalar = Array.isArray(arr) ? arr.join(" ") : String(raw || "");
  } catch {
    bolumMarkalar = String(r.bolum_markalar || "");
  }
  const primler = satirSatisPrimleri(primeEsas, {
    bayi: r.bayi,
    magaza: r.sellout_magaza || r.magaza_ham,
    grup: bolumMarkalar || r.prim_grup,
    altKanal: r.alt_kanal,
    bolumAdi: r.bolum_adi,
  });
  return {
    beyan_id: r.beyan_id,
    uzman_id: r.uzman_id || null,
    magaza_id: r.magaza_id || null,
    urun_id: r.urun_id || r.beyan_urun_id || null,
    ziyaret_id: r.ziyaret_id || "",
    ad,
    soyad,
    birlestirilmis_isim: birlestirilmis,
    ad_soyad: adSoyad,
    prim_grup: r.prim_grup || "",
    islem_tarihi: tarihYaz(r.islem_tarihi),
    durum: r.durum || "",
    satis_tarihi: tarihYaz(r.satis_tarihi),
    magaza_ham: r.magaza_ham || "",
    sellout_magaza: r.sellout_magaza || "",
    barkod: r.barkod || "",
    kod: r.kod || "",
    etiket: r.etiket || "",
    arcon_referans: r.kod || "",
    arcon_ref_adi: r.etiket || r.urun_adi || "",
    arcon_barkod: r.barkod || "",
    marka,
    satis_grup: satisGrupHesapla(marka, aks, r.sellout_marka_grup),
    aks,
    uniq_kod: r.uniq_kod || r.kod || "",
    urun_adi: r.urun_adi || r.etiket || "",
    uzman_toplam_satis: adet,
    magaza_toplam_satis: selloutAdet,
    kontrol: selloutAdet - adet,
    rapor_aciklama: raporAciklamaUret(r.h_aciklama, r.eslesme_durum),
    adet,
    fiyat: r.fiyat != null ? Number(r.fiyat) : null,
    toplam: r.toplam != null ? Number(r.toplam) : null,
    satis_notlari: r.satis_notlari || "",
    prim_adet: Number(r.prim_adet || 0),
    sellout_adet: selloutAdet,
    magaza_kdv_haric_ciro: selloutCiro,
    birim_ciro: r.birim_ciro != null ? Number(r.birim_ciro) : (selloutAdet > 0 ? +(selloutCiro / selloutAdet).toFixed(2) : null),
    prime_esas_tutar: primeEsas,
    ...primler,
    bayi: r.bayi || "",
    satis_turu: satisTuruHesapla(r.eslesme_durum, r.hesap_id),
    nokta_uzman_sayisi: r.nokta_uzman_sayisi != null ? Number(r.nokta_uzman_sayisi) : null,
    eslesme_durum: r.eslesme_durum || "",
    hesap_id: r.hesap_id,
    bolum_adi: r.bolum_adi || "",
    alt_kanal: r.alt_kanal || "",
    bolum_markalar: bolumMarkalar,
  };
}

app.get("/api/prim-raporu/:donemId/satirlar", wrap(async (req, res) => {
  const donemId = Number(req.params.donemId);
  const sayfa = Math.max(1, Number(req.query.sayfa) || 1);
  const limit = Math.min(5000, Math.max(50, Number(req.query.limit) || 500));
  const q = String(req.query.q || "").trim();
  const aciklama = String(req.query.aciklama || "").trim();
  const kolonFiltre = parseKolonFiltre(req.query.filtre);

  const [[donem]] = await pool.query("SELECT id, ad, durum FROM donem WHERE id=?", [donemId]);
  if (!donem) return res.status(404).json({ hata: "Dönem bulunamadı" });

  const { selectSql, params } = await primSatirSorgusu(donemId, { q, aciklama, kolonFiltre });
  const [rows] = await pool.query(selectSql, params);
  await enrichSelloutByUniq(donemId, rows);
  const noktaMap = await loadNoktaUzmanSayisiMap(donemId);
  applyNoktaUzmanSayisi(rows, noktaMap);
  const birlesik = primSatirlariBirlesir(rows.map(primSatirMap));
  const sayim = birlesik.length;
  const offset = (sayfa - 1) * limit;
  const satirlar = birlesik.slice(offset, offset + limit);

  res.json({
    donem_id: donemId,
    donem_ad: donem.ad,
    kaynak: `Sistem hesabı — ${donem.ad} satır satır`,
    kolonlar: PRIM_SATIR_KOLONLAR,
    filtre_kolonlar: Object.keys(SATIR_FILTRE_EXPR),
    satirlar,
    sayfa,
    limit,
    toplam: sayim,
    sayfaSayisi: Math.max(1, Math.ceil(sayim / limit)),
  });
}));

/** Kolon filtresi için dönemdeki tüm benzersiz değerler (A–Z). */
app.get("/api/prim-raporu/:donemId/satirlar/degerler", wrap(async (req, res) => {
  const donemId = Number(req.params.donemId);
  const kolon = String(req.query.kolon || "").trim();
  const ara = String(req.query.ara || "").trim();
  const expr = SATIR_FILTRE_EXPR[kolon];
  if (!expr) return res.status(400).json({ hata: "Bu kolon için filtre desteklenmiyor" });

  const [[donem]] = await pool.query("SELECT id FROM donem WHERE id=?", [donemId]);
  if (!donem) return res.status(404).json({ hata: "Dönem bulunamadı" });

  // Diğer aktif kolon filtreleri (bu kolon hariç) uygulanır
  const kolonFiltre = parseKolonFiltre(req.query.filtre);
  delete kolonFiltre[kolon];
  const aciklama = String(req.query.aciklama || "").trim();
  const q = String(req.query.q || "").trim();

  const { selectSql, params } = await primSatirSorgusu(donemId, { q, aciklama, kolonFiltre });
  const fromIdx = selectSql.toUpperCase().indexOf("\n    FROM ");
  const fromWhere = fromIdx >= 0 ? selectSql.slice(fromIdx) : selectSql.slice(selectSql.toUpperCase().indexOf(" FROM "));
  const orderIdx = fromWhere.toUpperCase().lastIndexOf(" ORDER BY ");
  const baseFrom = orderIdx >= 0 ? fromWhere.slice(0, orderIdx) : fromWhere;

  const params2 = [...params];
  let araSql = "";
  if (ara) {
    araSql = ` HAVING deger COLLATE utf8mb4_general_ci LIKE ?`;
    params2.push(`%${ara}%`);
  }

  const [rows] = await pool.query(
    `SELECT TRIM(${expr}) AS deger ${baseFrom}
     GROUP BY 1
     ${araSql}
     ORDER BY deger
     LIMIT 3000`,
    params2
  );

  res.json({
    kolon,
    degerler: rows.map((r) => (r.deger == null || r.deger === "" ? "(Boş)" : String(r.deger))),
  });
}));

app.get("/api/prim-raporu/:donemId/satirlar/indir", wrap(async (req, res) => {
  const ExcelJS = require("exceljs");
  const donemId = Number(req.params.donemId);
  const q = String(req.query.q || "").trim();
  const aciklama = String(req.query.aciklama || "").trim();
  const kolonFiltre = parseKolonFiltre(req.query.filtre);

  const [[donem]] = await pool.query("SELECT id, ad FROM donem WHERE id=?", [donemId]);
  if (!donem) return res.status(404).json({ hata: "Dönem bulunamadı" });

  const { selectSql, params } = await primSatirSorgusu(donemId, { q, aciklama, kolonFiltre });
  const [rows] = await pool.query(selectSql, params);
  await enrichSelloutByUniq(donemId, rows);
  const noktaMap = await loadNoktaUzmanSayisiMap(donemId);
  applyNoktaUzmanSayisi(rows, noktaMap);
  const satirlar = primSatirlariBirlesir(rows.map(primSatirMap));

  const renkArgb = {
    mavi: "FFA4C2F4",
    sari: "FFFFE699",
    yesil: "FFC6EFCE",
    acik: "FFD6E3F8",
  };
  const sayiKolon = new Set([
    "uzman_toplam_satis", "magaza_toplam_satis", "kontrol",
    "adet", "fiyat", "toplam", "prim_adet", "sellout_adet",
    "magaza_kdv_haric_ciro", "birim_ciro", "prime_esas_tutar",
    "prim_yuzde_1", "sephora_sensai", "sephora_bagdat_beymen", "sevil_lp",
    "toplam_satis_primi", "nokta_uzman_sayisi",
  ]);
  const paraKolon = new Set([
    "fiyat", "toplam", "magaza_kdv_haric_ciro", "birim_ciro", "prime_esas_tutar",
    "prim_yuzde_1", "sephora_sensai", "sephora_bagdat_beymen", "sevil_lp",
    "toplam_satis_primi",
  ]);

  function satirDolgu(s) {
    const t = String(s.satis_turu || "").toLocaleLowerCase("tr-TR");
    const a = String(s.rapor_aciklama || "").toLocaleLowerCase("tr-TR");
    if (t.includes("grup dışı") || a.includes("atama yok") || a.includes("mükerrer")) {
      return "FFFCE4D6";
    }
    if (
      t.includes("hesaplama dışı") ||
      a.includes("sell-out") ||
      a.includes("eşleş") ||
      a.includes("hesap satırı yok")
    ) {
      return "FFFFF2CC";
    }
    return null;
  }

  const guvenliAd = String(donem.ad || "donem")
    .replace(/[^\w\-ğüşıöçĞÜŞİÖÇ ]+/gi, "")
    .replace(/\s+/g, "_");
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="Prim_Calisma_${guvenliAd}.xlsx"`
  );

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  const ws = wb.addWorksheet("Prim Çalışma", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = PRIM_SATIR_KOLONLAR.map((k) => ({
    key: k.key,
    width: k.key === "ad_soyad" || k.key === "rapor_aciklama" || k.key === "urun_adi" ? 22 : 14,
  }));

  const baslik = ws.addRow(PRIM_SATIR_KOLONLAR.map((k) => k.ad));
  baslik.height = 28;
  baslik.eachCell((cell, col) => {
    const renk = PRIM_SATIR_KOLONLAR[col - 1]?.renk || "acik";
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: renkArgb[renk] || renkArgb.acik } };
    cell.font = { bold: true, size: 10, color: { argb: "FF000000" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF7F9DB9" } },
      bottom: { style: "thin", color: { argb: "FF7F9DB9" } },
      left: { style: "thin", color: { argb: "FF7F9DB9" } },
      right: { style: "thin", color: { argb: "FF7F9DB9" } },
    };
  });
  baslik.commit();

  for (const s of satirlar) {
    const degerler = PRIM_SATIR_KOLONLAR.map((k) => {
      const v = s[k.key];
      if (v == null || v === "") return "";
      if (sayiKolon.has(k.key)) return Number(v);
      return v;
    });
    const row = ws.addRow(degerler);
    const dolgu = satirDolgu(s);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const k = PRIM_SATIR_KOLONLAR[col - 1];
      if (dolgu) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dolgu } };
      }
      cell.font = { size: 10, name: "Calibri" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
        left: { style: "thin", color: { argb: "FFCCCCCC" } },
        right: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
      if (k && sayiKolon.has(k.key)) {
        cell.alignment = { horizontal: "right" };
        if (paraKolon.has(k.key)) {
          cell.numFmt = "#,##0.00";
        }
      }
    });
    row.commit();
  }

  await ws.commit();
  await wb.commit();
}));

// Prim Raporu — Excel formatında (.xlsx) renkli olarak indir
app.get("/api/prim-raporu/:donemId/xlsx", wrap(async (req, res) => {
  const ExcelJS = require("exceljs");
  const donemId = req.params.donemId;
  const veri = await primRaporuVerisi(donemId);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Prim Çalışma");

  // Üst filtre satırları (Excel'deki gibi)
  ws.addRow(["Mağaza Toplam Satış", "(Tümü)"]);
  ws.addRow(["Marka", "(Tümü)"]);
  ws.addRow(["SATIŞ TÜRÜ", "(Tümü)"]);
  ws.addRow(["Prime Esas Toplam Tutar", "(Birden Çok Öğe)"]);
  ws.addRow([]);

  const kolonlar = [
    { key: "uzman", ad: "Satır Etiketleri", g: 22, renk: "siyah" },
    { key: "marka_grup", ad: "Marka Grup", g: 18, renk: "siyah" },
    { key: "magaza", ad: "Sell-Out Mağaza", g: 22, renk: "siyah" },
    { key: "satis_grup", ad: "Satış Grup", g: 16, renk: "siyah" },
    { key: "E", ad: "Prime Esas Toplam Tutar", g: 20, sayi: true, renk: "siyah" },
    { key: "F", ad: "Prim % 1", g: 14, sayi: true, renk: "satis" },
    { key: "G", ad: "Sensai Sephora +\nSisley Cadde + %1", g: 20, sayi: true, renk: "satis" },
    { key: "H", ad: "Sephora Bağdat + Beymen + % 0,05", g: 20, sayi: true, renk: "satis" },
    { key: "I", ad: "Toplam Sevil LP", g: 16, sayi: true, renk: "satis" },
    { key: "J", ad: "Toplam Toplam", g: 16, sayi: true, renk: "satis" },
    { key: "K", ad: "Mayıs\nHedefler", g: 16, sayi: true, renk: "hedef" },
    { key: "L", ad: "Hedef\nPrim ( % 0,50 )", g: 16, sayi: true, renk: "hedef" },
    { key: "M", ad: "Dior Mağaza\n1.Lik  % 0,50", g: 16, sayi: true, renk: "dior" },
    { key: "N", ad: "Dior Makyaj\n1. lik % 0,33", g: 16, sayi: true, renk: "dior" },
    { key: "O", ad: "Dior Parfüm\nİlk 2 % 0,33", g: 16, sayi: true, renk: "dior" },
    { key: "P", ad: "Dior Cilt Bakım\nİlk 3 % 0,33", g: 16, sayi: true, renk: "dior" },
    { key: "Q", ad: "LP Mağaza - CİLT Bakım 1.LİK Primleri", g: 22, sayi: true, renk: "lp" },
    { key: "R", ad: "Parfüm % 1", g: 14, sayi: true, renk: "parfum" },
    { key: "S", ad: "Parfüm % 0,5", g: 14, sayi: true, renk: "parfum" },
    { key: "T", ad: "Parfüm % 0,5", g: 14, sayi: true, renk: "parfum" },
    { key: "U", ad: "Nisan'dan\nKalan", g: 14, sayi: true, renk: "kalan" },
    { key: "V", ad: "Toplam Primden\nEk Prim ( % 0,20 )", g: 18, sayi: true, renk: "toplam" },
    { key: "W", ad: "Toplam\nPrim", g: 16, sayi: true, renk: "toplam" },
    { key: "X", ad: "Prim\nAçıklama", g: 20, renk: "aciklama" },
    { key: "Y", ad: "Toplam Prim\nYüzdesi", g: 16, yuzde: true, renk: "aciklama" },
  ];

  const pivotRenkArgb = {
    siyah: { bg: "FF1F1F1F", fg: "FFFFC000" },
    satis: { bg: "FFBDD7EE", fg: "FF000000" },
    hedef: { bg: "FF1F1F1F", fg: "FFFFFFFF" },
    dior: { bg: "FFC6EFCE", fg: "FF000000" },
    lp: { bg: "FFF8CBAD", fg: "FF000000" },
    parfum: { bg: "FFE2D5F1", fg: "FF000000" },
    kalan: { bg: "FFF4B183", fg: "FF000000" },
    toplam: { bg: "FF1F4E79", fg: "FFFFFFFF" },
    aciklama: { bg: "FFC00000", fg: "FFFFFFFF" },
  };

  // Kolon genişlikleri
  ws.columns = kolonlar.map((k) => ({ width: k.g }));

  // Başlık satırı — Excel Prim Hesaplama renk grupları
  const basRow = ws.addRow(kolonlar.map((k) => k.ad));
  basRow.height = 40;
  for (let i = 1; i <= kolonlar.length; i++) {
    const cell = basRow.getCell(i);
    const renk = pivotRenkArgb[kolonlar[i - 1].renk] || pivotRenkArgb.siyah;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: renk.bg } };
    cell.font = { color: { argb: renk.fg }, bold: true, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF666666" } },
      right: { style: "thin", color: { argb: "FF666666" } },
    };
  }

  // Veri satırları
  for (const s of veri.satirlar) {
    const rowData = kolonlar.map((k) => {
      const v = s[k.key];
      // null/boş yerine "" bırakırsak hücre oluşur ve renklenir
      if (v == null || v === "") return "";
      return v;
    });
    const row = ws.addRow(rowData);

    // Her hücreye manuel dokun — boş hücreler dahil (renk için)
    for (let i = 1; i <= kolonlar.length; i++) {
      const cell = row.getCell(i);
      const kol = kolonlar[i - 1];
      if (!kol) continue;

      // Sayı / yüzde formatı
      if (kol.sayi && typeof cell.value === "number") {
        cell.numFmt = '#,##0.00"TL."';
        cell.alignment = { horizontal: "right" };
      } else if (kol.yuzde && typeof cell.value === "number") {
        cell.numFmt = "0.00%";
        cell.alignment = { horizontal: "right" };
      }

      // Kenarlıklar
      cell.border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
        left: { style: "thin", color: { argb: "FFCCCCCC" } },
        right: { style: "thin", color: { argb: "FFCCCCCC" } },
      };

      // Toplam satır renkleri (boş hücreler dahil)
      if (s.tip === "uzman_toplam") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
        cell.font = { bold: true, size: 10 };
      } else if (s.tip === "genel_toplam") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE699" } };
        cell.font = { bold: true, size: 11 };
        cell.border = {
          top: { style: "medium", color: { argb: "FF000000" } },
          bottom: { style: "medium", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF999999" } },
          right: { style: "thin", color: { argb: "FF999999" } },
        };
      }
    }
  }

  // Freeze başlık satırını
  ws.views = [{ state: "frozen", ySplit: 6 }];

  const buf = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="prim_calisma_raporu_${donemId}.xlsx"`);
  res.end(Buffer.from(buf));
}));

// Excel pivotu ile sistem karşılaştırma raporu.
// Kullanıcı Excel'in Prim Çalışma pivot çıktısını CSV/XLSX olarak yükler,
// sistem her uzman × mağaza için farkı ve olası nedenleri hesaplayıp döner.
// Beklenen kolonlar (esnek — kısmi eşleşme kabul):
//   Uzman / Uzman Ad-Soyad / Satır Etiketleri / Ad Soyad
//   Sell-Out Mağaza / Mağaza / Prim Mağaza
//   Prime Esas / Prime Esas Toplam Tutar / Prime Esas Tutar
app.post("/api/karsilastir/:donemId", upload.single("dosya"), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ hata: "Dosya yok" });
  const XLSX = require("xlsx");
  const { normalizeName, normalizeStore } = require("./util");

  // Excel/CSV parse
  const buf = req.file.buffer;
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  let wb;
  if (isZip) {
    wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  } else {
    let s = buf.toString("utf8");
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    wb = XLSX.read(s, { type: "string", cellDates: false, codepage: 65001 });
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rowsRaw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // Başlık satırını bul: içinde "Uzman"/"Prime Esas"/"Mağaza" geçen ilk satır
  let headerIdx = -1;
  const anahtar = ["prime", "uzman", "mağaza", "satır"];
  for (let i = 0; i < Math.min(rowsRaw.length, 20); i++) {
    const hucreler = (rowsRaw[i] || []).map((c) => String(c || "").toLocaleLowerCase("tr-TR"));
    const eslesme = anahtar.filter((k) => hucreler.some((h) => h.includes(k))).length;
    if (eslesme >= 2) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return res.status(400).json({ hata: "Excel başlık satırı bulunamadı (Uzman + Mağaza + Prime Esas beklenir)" });

  const header = (rowsRaw[headerIdx] || []).map((c) => String(c || "").toLocaleLowerCase("tr-TR").trim());
  function idxOf(...keys) {
    for (const k of keys) {
      const i = header.findIndex((h) => h.includes(k.toLocaleLowerCase("tr-TR")));
      if (i >= 0) return i;
    }
    return -1;
  }
  const iUzman = idxOf("satır etiket", "uzman ad", "uzman", "ad soyad", "ad-soyad");
  const iMag = idxOf("sell-out mağaza", "sellout mağaza", "prim mağaza", "mağaza");
  const iPE = idxOf("prime esas topl", "prime esas tut", "prime esas");

  if (iUzman < 0 || iMag < 0 || iPE < 0) {
    return res.status(400).json({
      hata: "Gerekli kolonlar bulunamadı",
      detay: { uzman: iUzman, magaza: iMag, prime_esas: iPE, header },
    });
  }

  // Excel satırlarını parse et
  function num(x) {
    if (x == null) return null;
    if (typeof x === "number") return x;
    let s = String(x).trim().replace(/tl\.?/gi, "").replace(/\s/g, "");
    if (!s || s === "-") return null;
    if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(",")) s = s.replace(",", ".");
    const n = Number(s);
    return isNaN(n) ? null : n;
  }
  const excelMap = new Map(); // "normUzman|normMag" -> {excel, uzman_ham, magaza_ham}
  let skipped = 0;
  for (let i = headerIdx + 1; i < rowsRaw.length; i++) {
    const row = rowsRaw[i] || [];
    const uzman = String(row[iUzman] || "").trim();
    const mag = String(row[iMag] || "").trim();
    const pe = num(row[iPE]);
    if (!uzman || !mag || pe == null) { skipped++; continue; }
    // "Toplam ..." pivot satırlarını atla
    if (/^toplam/i.test(uzman) || /genel toplam/i.test(uzman)) continue;
    const key = `${normalizeName(uzman)}|${normalizeStore(mag)}`;
    if (!excelMap.has(key)) excelMap.set(key, { excel: 0, uzman_ham: uzman, magaza_ham: mag });
    excelMap.get(key).excel += pe;
  }

  // Sistemden uzman × mağaza toplam prime esas
  const [sistemRows] = await pool.query(
    `SELECT uz.id uzman_id, uz.ad_soyad, m.id magaza_id, m.prim_magaza, m.bayi,
            SUM(h.prime_esas_tutar) sistem_esas,
            SUM(h.prim_adet) sistem_adet,
            COUNT(*) sistem_satir
       FROM prim_hesap_satir h
       JOIN uzman uz ON uz.id=h.uzman_id
       JOIN magaza m ON m.id=h.magaza_id
      WHERE h.donem_id=? AND h.prim_adet > 0
        AND (h.aciklama LIKE 'Ok%' OR h.aciklama LIKE 'Kısmi Ok%')
      GROUP BY uz.id, m.id
      ORDER BY uz.ad_soyad, m.prim_magaza`,
    [req.params.donemId]
  );
  const sistemMap = new Map();
  for (const r of sistemRows) {
    const key = `${normalizeName(r.ad_soyad)}|${normalizeStore(r.prim_magaza)}`;
    sistemMap.set(key, r);
  }

  // Master atama var mı? sebep tespit için
  const [atamalar] = await pool.query(
    `SELECT a.uzman_id, uz.ad_soyad, a.magaza_id, m.prim_magaza
       FROM uzman_atama a
       JOIN uzman uz ON uz.id=a.uzman_id
       JOIN magaza m ON m.id=a.magaza_id
      WHERE a.donem_id=?`,
    [req.params.donemId]
  );
  const atamaSet = new Set();
  const uzmanAtamaSayisi = new Map();
  for (const a of atamalar) {
    atamaSet.add(`${normalizeName(a.ad_soyad)}|${normalizeStore(a.prim_magaza)}`);
    uzmanAtamaSayisi.set(normalizeName(a.ad_soyad), (uzmanAtamaSayisi.get(normalizeName(a.ad_soyad)) || 0) + 1);
  }

  // Birleştir + fark & sebep hesapla
  const sonuc = [];
  const anahtarlar = new Set([...excelMap.keys(), ...sistemMap.keys()]);
  for (const key of anahtarlar) {
    const e = excelMap.get(key);
    const s = sistemMap.get(key);
    const excel = e ? e.excel : null;
    const sistem = s ? Number(s.sistem_esas) : null;
    const fark = (sistem || 0) - (excel || 0);
    let sebepKod = "eslesir";
    let sebep = "Sistem ile Excel neredeyse aynı (%1 içinde)";
    if (excel == null && sistem != null) {
      sebepKod = "sadece_sistem";
      sebep = "Excel'de yok, sistemde var — muhtemelen Excel'de bu uzman/mağaza pivotta gösterilmemiş";
    } else if (sistem == null && excel != null) {
      const uzmanNormalize = key.split("|")[0];
      if (!uzmanAtamaSayisi.has(uzmanNormalize)) {
        sebepKod = "master_yok";
        sebep = "Excel'de manuel eklenmiş uzman — sistemin Uzman-Mağaza-Grup master listesinde yok";
      } else {
        sebepKod = "sadece_excel";
        sebep = "Excel'de var, sistemde yok — beyan eşleşmesi başarısız veya bu mağazada satış hesaplanmamış";
      }
    } else if (excel != null && sistem != null) {
      const buyuk = Math.max(Math.abs(excel), Math.abs(sistem));
      const oranli = buyuk > 0 ? Math.abs(fark) / buyuk : 0;
      if (oranli > 0.01) {
        if (sistem > excel) {
          sebepKod = "sistem_fazla";
          sebep = "Sistem daha fazla — fallback (arcon_referans/barkod) Excel'in kaçırdığı satırları yakalamış olabilir; ürün kimlik konsolidasyonu birleşik ciro veriyor olabilir";
        } else {
          sebepKod = "excel_fazla";
          sebep = "Excel daha fazla — Excel'de o mağaza için manuel fudge (elle +sayı) veya farklı birim ciro formülü olabilir; sistem sell-out'ta olmayan ürünü prim dışı tutuyor";
        }
      }
    }
    // Excel'de "atama_yok" durumu — sistemde 0 verilmiş olabilir
    if (sebepKod === "sadece_excel" && !atamaSet.has(key)) {
      sebepKod = "atama_yok";
      sebep = "Excel'de var ama bu (uzman × mağaza) için sistemde atama yok — uzmanın atamalı olmadığı mağaza, sistem prim vermiyor";
    }
    sonuc.push({
      uzman_ad: e ? e.uzman_ham : s.ad_soyad,
      magaza_ad: e ? e.magaza_ham : s.prim_magaza,
      bayi: s ? s.bayi : null,
      excel_esas: excel,
      sistem_esas: sistem,
      sistem_adet: s ? Number(s.sistem_adet) : null,
      fark,
      sebep_kod: sebepKod,
      sebep,
    });
  }

  // Özet
  const toplamExcel = sonuc.reduce((a, r) => a + (r.excel_esas || 0), 0);
  const toplamSistem = sonuc.reduce((a, r) => a + (r.sistem_esas || 0), 0);
  const sebepOzet = {};
  for (const r of sonuc) sebepOzet[r.sebep_kod] = (sebepOzet[r.sebep_kod] || 0) + 1;

  res.json({
    ozet: {
      excel_satir: excelMap.size,
      sistem_satir: sistemMap.size,
      birlesik_satir: sonuc.length,
      toplam_excel: +toplamExcel.toFixed(2),
      toplam_sistem: +toplamSistem.toFixed(2),
      fark: +(toplamSistem - toplamExcel).toFixed(2),
      skipped_rows: skipped,
      sebep_kirilim: sebepOzet,
    },
    header,
    satirlar: sonuc.sort((a, b) => Math.abs(b.fark) - Math.abs(a.fark)),
  });
}));

// Bir uzman × mağaza için adım adım hesap detayı.
// Excel doğrulaması için: Zeops beyan istatistiği + uzmanın atama grubu +
// sell-out özeti + satır satır tüm ürünler + KDV'li / hariç ciro + toplam + prim
app.get("/api/satis-primi/:donemId/detay/:uzmanId/:magazaId", wrap(async (req, res) => {
  const { donemId, uzmanId, magazaId } = req.params;
  const oranParam = req.query.oran;
  const overrideOran = oranParam !== undefined && oranParam !== "" ? Number(oranParam) : null;
  const kdvOrani = Number(req.query.kdv ?? 20); // varsayılan %20 KDV

  // Bölüm bazlı satış primi oranı — uzmanın atamalı olduğu bölümün "satis_basi" oranı
  const [[bolumOrani]] = await pool.query(
    `SELECT COALESCE(MAX(k.prim_oran), 1) AS oran, MAX(b.bolum_adi) AS bolum_adi
       FROM uzman_atama a
       JOIN prim_bolum b ON b.id=a.bolum_id
       LEFT JOIN prim_kural k ON k.bolum_id=a.bolum_id AND k.kriter_key='satis_basi'
      WHERE a.donem_id=? AND a.uzman_id=? AND a.magaza_id=?`,
    [donemId, uzmanId, magazaId]
  );
  const oran = overrideOran !== null ? overrideOran : Number(bolumOrani?.oran || 1);

  // 1) Uzman + mağaza + atama bilgisi
  const [[uzman]] = await pool.query(
    "SELECT id, ad_soyad FROM uzman WHERE id=?", [uzmanId]
  );
  const [[magaza]] = await pool.query(
    "SELECT id, prim_magaza, bayi FROM magaza WHERE id=?", [magazaId]
  );
  const [atamalar] = await pool.query(
    `SELECT a.magaza_id, m.prim_magaza, m.bayi, b.bolum_adi, b.markalar,
            b.marka_grubu_key, b.grup_toplam_oran
       FROM uzman_atama a
       JOIN magaza m ON m.id=a.magaza_id
       JOIN prim_bolum b ON b.id=a.bolum_id
      WHERE a.donem_id=? AND a.uzman_id=?`,
    [donemId, uzmanId]
  );

  // 2) Zeops beyan istatistikleri (bu uzman × bu mağaza için)
  // so_adet/so_ciro alt sorguları urun_id → arcon_referans → arcon_barkod
  // sırayla dener; hesapService fallback mantığıyla aynı çalışır.
  const [beyanRows] = await pool.query(
    `SELECT b.id, b.ziyaret_id, b.satis_tarihi, b.durum, b.barkod, b.kod, b.etiket,
            b.adet AS beyan_adet, b.fiyat, b.toplam, b.eslesme_durum,
            b.urun_id, b.uniq_kod_id,
            u.marka, u.durum AS urun_durum,
            uk.uniq_kod, uk.urun_adi AS uniq_ad,
            COALESCE(
              (SELECT SUM(so.adet) FROM sellout so
                WHERE so.donem_id=b.donem_id AND so.magaza_id=b.magaza_id
                  AND so.urun_id=b.urun_id AND so.eslesme_durum='ok'),
              (SELECT SUM(so.adet) FROM sellout so
                WHERE so.donem_id=b.donem_id AND so.magaza_id=b.magaza_id
                  AND UPPER(REPLACE(so.arcon_referans,' ','')) = UPPER(REPLACE(b.kod,' ',''))
                  AND so.eslesme_durum='ok'),
              (SELECT SUM(so.adet) FROM sellout so
                WHERE so.donem_id=b.donem_id AND so.magaza_id=b.magaza_id
                  AND so.arcon_barkod=b.barkod AND so.eslesme_durum='ok')
            ) AS so_adet,
            COALESCE(
              (SELECT SUM(so.ciro_kdv_haric) FROM sellout so
                WHERE so.donem_id=b.donem_id AND so.magaza_id=b.magaza_id
                  AND so.urun_id=b.urun_id AND so.eslesme_durum='ok'),
              (SELECT SUM(so.ciro_kdv_haric) FROM sellout so
                WHERE so.donem_id=b.donem_id AND so.magaza_id=b.magaza_id
                  AND UPPER(REPLACE(so.arcon_referans,' ','')) = UPPER(REPLACE(b.kod,' ',''))
                  AND so.eslesme_durum='ok'),
              (SELECT SUM(so.ciro_kdv_haric) FROM sellout so
                WHERE so.donem_id=b.donem_id AND so.magaza_id=b.magaza_id
                  AND so.arcon_barkod=b.barkod AND so.eslesme_durum='ok')
            ) AS so_ciro,
            hs.prim_adet, hs.birim_ciro, hs.prime_esas_tutar, hs.aciklama AS hesap_aciklama
       FROM satis_beyan b
       LEFT JOIN urun u ON u.id=b.urun_id
       LEFT JOIN uniq_kod uk ON uk.id=b.uniq_kod_id
       LEFT JOIN prim_hesap_satir hs ON hs.beyan_id=b.id
      WHERE b.donem_id=? AND b.uzman_id=? AND b.magaza_id=?
      ORDER BY b.satis_tarihi, u.marka, b.etiket`,
    [donemId, uzmanId, magazaId]
  );

  // Bir beyan satırının neden hesaba girmediğini/girdiğini insan diliyle döner.
  // Öncelik: hesap motoru başarılı sonuç ürettiyse (prim_adet > 0) her koşulda OK.
  // Aksi halde sebep sırayla değerlendirilir.
  function sebepBul(r) {
    if (r.prim_adet && Number(r.prim_adet) > 0) {
      return { kod: "ok", metin: r.hesap_aciklama || "Ok — prime esasa girdi" };
    }
    if (!(r.durum || "").startsWith("Tamamland")) return { kod: "iade", metin: "İade/iptal — durum \"Tamamlandı\" değil" };
    if (r.eslesme_durum === "atama_yok") return { kod: "atama_yok", metin: "Uzmanın atamasına uygun marka değil ya da atama bulunamadı (Uzman-Mağaza-Grup)" };
    if (r.eslesme_durum === "magaza_yok") return { kod: "magaza_yok", metin: "Mağaza adı standart mağaza listesinde bulunamadı" };
    if (r.eslesme_durum === "uzman_yok") return { kod: "uzman_yok", metin: "Uzman veritabanında yok" };
    if (r.eslesme_durum === "urun_yok" || !r.urun_id) return { kod: "urun_yok", metin: "Barkod / kod ile ürün çözümlenemedi (uniq_kod'da yok)" };
    if (r.urun_durum && r.urun_durum !== "aktif") return { kod: "urun_pasif", metin: "Ürün pasif durumda (urun.durum ≠ 'aktif')" };
    if (!r.so_adet || Number(r.so_adet) <= 0) return { kod: "sellout_yok", metin: "Bu ürün bu mağazanın sell-out dosyasında bulunamadı (arcon_referans/barkod da eşleşmedi)" };
    if (r.hesap_aciklama && String(r.hesap_aciklama).startsWith("Kısmi")) {
      return { kod: "kismi", metin: r.hesap_aciklama };
    }
    return { kod: "prim_yok", metin: r.hesap_aciklama || "Prim adeti 0 — hesap motoru açıklamasını kontrol et" };
  }

  // 3) Zeops özet — durum + eslesme_durum kırılımı
  const zeopsOzet = {
    toplam_satir: beyanRows.length,
    toplam_adet: 0,
    tamamlandi: 0,
    iade_iptal: 0,
    esles_ok: 0,
    atama_yok: 0,
    magaza_yok: 0,
    uzman_yok: 0,
    urun_yok: 0,
    urun_pasif: 0,
    sellout_yok: 0,
    hesaba_giren_satir: 0,
    hesaba_giren_adet: 0,
    prime_esas_toplam: 0,
    // Prime esasa girmeyen kısmın Zeops "Toplam" (=fiyat×adet, KDV'li) toplamı — kayıp maliyet göstergesi
    hesap_disi_satir: 0,
    hesap_disi_adet: 0,
    hesap_disi_zeops_toplam: 0,
    // Sebep kırılımı (kaç satır hangi nedenle düştü)
    sebep_kirilim: {},
  };
  for (const r of beyanRows) {
    zeopsOzet.toplam_adet += r.beyan_adet || 0;
    if ((r.durum || "").startsWith("Tamamland")) zeopsOzet.tamamlandi++;
    else zeopsOzet.iade_iptal++;
    switch (r.eslesme_durum) {
      case "ok": zeopsOzet.esles_ok++; break;
      case "atama_yok": zeopsOzet.atama_yok++; break;
      case "magaza_yok": zeopsOzet.magaza_yok++; break;
      case "uzman_yok": zeopsOzet.uzman_yok++; break;
      case "urun_yok": zeopsOzet.urun_yok++; break;
    }
    if (r.urun_id && r.urun_durum && r.urun_durum !== "aktif") zeopsOzet.urun_pasif++;
    if (r.urun_id && (!r.so_adet || Number(r.so_adet) <= 0)) zeopsOzet.sellout_yok++;
    if (r.prim_adet && Number(r.prim_adet) > 0) {
      zeopsOzet.hesaba_giren_satir++;
      zeopsOzet.hesaba_giren_adet += Number(r.prim_adet);
      zeopsOzet.prime_esas_toplam += Number(r.prime_esas_tutar || 0);
    } else {
      zeopsOzet.hesap_disi_satir++;
      zeopsOzet.hesap_disi_adet += Number(r.beyan_adet || 0);
      zeopsOzet.hesap_disi_zeops_toplam += Number(r.toplam || 0);
    }
    const s = sebepBul(r);
    zeopsOzet.sebep_kirilim[s.kod] = (zeopsOzet.sebep_kirilim[s.kod] || 0) + 1;
  }

  // 4) Sell-out özeti — uzmanın atama grubu markalarında bu mağazadaki toplam
  let atamaMarkalari = [];
  for (const a of atamalar) {
    if (a.magaza_id != magazaId) continue;
    try {
      const arr = Array.isArray(a.markalar) ? a.markalar : JSON.parse(a.markalar || "[]");
      for (const m of arr) if (m) atamaMarkalari.push(String(m));
    } catch {}
  }
  // fallback: satırlardan çıkan markalar
  if (!atamaMarkalari.length) {
    atamaMarkalari = [...new Set(beyanRows.map((r) => r.marka).filter(Boolean))];
  }
  const [selloutRows] = await pool.query(
    `SELECT so.arcon_referans AS kod, so.urun_adi AS etiket, so.marka, so.marka_grup,
            SUM(so.adet) AS adet, SUM(so.ciro_kdv_haric) AS ciro_hariç
       FROM sellout so
      WHERE so.donem_id=? AND so.magaza_id=? AND so.eslesme_durum='ok'
      GROUP BY so.arcon_referans, so.urun_adi, so.marka, so.marka_grup
      ORDER BY so.marka, so.urun_adi`,
    [donemId, magazaId]
  );
  const selloutOzet = { toplam_adet: 0, toplam_ciro_hariç: 0, toplam_ciro_dahil: 0, marka_kirilim: [] };
  const markaMap = new Map();
  for (const s of selloutRows) {
    selloutOzet.toplam_adet += Number(s.adet || 0);
    selloutOzet.toplam_ciro_hariç += Number(s.ciro_hariç || 0);
    const marka = (s.marka || "").trim();
    if (!markaMap.has(marka)) markaMap.set(marka, { marka, adet: 0, ciro_hariç: 0 });
    markaMap.get(marka).adet += Number(s.adet || 0);
    markaMap.get(marka).ciro_hariç += Number(s.ciro_hariç || 0);
  }
  selloutOzet.toplam_ciro_dahil = +(selloutOzet.toplam_ciro_hariç * (1 + kdvOrani / 100)).toFixed(2);
  selloutOzet.marka_kirilim = [...markaMap.values()].sort((a, b) => b.ciro_hariç - a.ciro_hariç);

  // 5) Satır bazlı detay — Excel'deki gibi her ürün için birim ciro, KDV'li/hariç
  const satirlar = beyanRows.map((r) => {
    const birim = Number(r.birim_ciro || 0);
    const primAdet = Number(r.prim_adet || 0);
    const primeEsas = Number(r.prime_esas_tutar || 0);
    const kdvhariç_birim = birim;
    const kdvdahil_birim = +(birim * (1 + kdvOrani / 100)).toFixed(2);
    const kdvhariç_toplam = primeEsas;
    const kdvdahil_toplam = +(primeEsas * (1 + kdvOrani / 100)).toFixed(2);
    const s = sebepBul(r);
    return {
      beyan_id: r.id,
      satis_tarihi: r.satis_tarihi,
      barkod: r.barkod,
      kod: r.kod,
      etiket: r.etiket,
      marka: r.marka,
      uniq_kod: r.uniq_kod,
      durum: r.durum,
      eslesme_durum: r.eslesme_durum,
      beyan_adet: r.beyan_adet,
      beyan_fiyat: r.fiyat != null ? Number(r.fiyat) : null,
      beyan_toplam: r.toplam != null ? Number(r.toplam) : null,
      so_adet: r.so_adet ? Number(r.so_adet) : null,
      so_ciro: r.so_ciro ? Number(r.so_ciro) : null,
      prim_adet: primAdet,
      birim_ciro_kdv_hariç: kdvhariç_birim,
      birim_ciro_kdv_dahil: kdvdahil_birim,
      prime_esas_kdv_hariç: kdvhariç_toplam,
      prime_esas_kdv_dahil: kdvdahil_toplam,
      hesap_aciklama: r.hesap_aciklama,
      sebep_kod: s.kod,
      sebep_metin: s.metin,
    };
  });

  const toplam = {
    prim_adet: zeopsOzet.hesaba_giren_adet,
    prime_esas_kdv_hariç: +zeopsOzet.prime_esas_toplam.toFixed(2),
    prime_esas_kdv_dahil: +(zeopsOzet.prime_esas_toplam * (1 + kdvOrani / 100)).toFixed(2),
    satis_primi: +(zeopsOzet.prime_esas_toplam * oran / 100).toFixed(2),
    hesap_disi_satir: zeopsOzet.hesap_disi_satir,
    hesap_disi_adet: zeopsOzet.hesap_disi_adet,
    hesap_disi_zeops_toplam: +zeopsOzet.hesap_disi_zeops_toplam.toFixed(2),
    oran,
    oran_kaynak: overrideOran !== null ? "override" : "bolum_bazli",
    bolum_adi: bolumOrani?.bolum_adi || null,
    kdv_orani: kdvOrani,
  };

  res.json({
    uzman,
    magaza,
    atamalar,
    zeops: zeopsOzet,
    sellout: selloutOzet,
    satirlar,
    toplam,
  });
}));

app.get("/api/satis-primi/:donemId/export", wrap(async (req, res) => {
  const XLSX = require("xlsx");
  const oranParam = req.query.oran;
  const overrideOran = oranParam !== undefined && oranParam !== "" ? Number(oranParam) : null;
  const bolumBazli = overrideOran === null;
  const sql = bolumBazli
    ? `SELECT
         uz.ad_soyad AS "Uzman",
         m.bayi AS "Bayi",
         m.prim_magaza AS "Mağaza",
         SUM(h.prim_adet) AS "Prim Adet",
         ROUND(SUM(h.prime_esas_tutar), 2) AS "Prime Esas",
         COALESCE(MAX(k.prim_oran), 1) AS "Oran %",
         ROUND(SUM(h.prime_esas_tutar) * COALESCE(MAX(k.prim_oran), 1) / 100, 2) AS "Satış Primi"
       FROM prim_hesap_satir h
       JOIN uzman uz ON uz.id = h.uzman_id
       JOIN magaza m ON m.id = h.magaza_id
       LEFT JOIN prim_kural k ON k.bolum_id = h.bolum_id AND k.kriter_key = 'satis_basi'
       WHERE h.donem_id = ? AND h.prim_adet > 0
         AND (h.aciklama LIKE 'Ok%' OR h.aciklama LIKE 'Kısmi Ok%')
       GROUP BY uz.id, m.id, h.bolum_id
       ORDER BY uz.ad_soyad, m.prim_magaza`
    : `SELECT
         uz.ad_soyad AS "Uzman",
         m.bayi AS "Bayi",
         m.prim_magaza AS "Mağaza",
         SUM(h.prim_adet) AS "Prim Adet",
         ROUND(SUM(h.prime_esas_tutar), 2) AS "Prime Esas",
         ? AS "Oran %",
         ROUND(SUM(h.prime_esas_tutar) * ? / 100, 2) AS "Satış Primi"
       FROM prim_hesap_satir h
       JOIN uzman uz ON uz.id = h.uzman_id
       JOIN magaza m ON m.id = h.magaza_id
       WHERE h.donem_id = ? AND h.prim_adet > 0
         AND (h.aciklama LIKE 'Ok%' OR h.aciklama LIKE 'Kısmi Ok%')
       GROUP BY uz.id, m.id
       ORDER BY uz.ad_soyad, m.prim_magaza`;
  const params = bolumBazli
    ? [req.params.donemId]
    : [overrideOran, overrideOran, req.params.donemId];
  const [rows] = await pool.query(sql, params);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Satış Primi");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="satis_primi_${req.params.donemId}.xlsx"`);
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
  // Stok yükleme: import_log tip 'uniq_kod' (eski) veya 'stok'
  const [[stok]] = await pool.query(
    "SELECT COUNT(*) satir FROM import_log WHERE donem_id=? AND tip IN ('stok','uniq_kod')", [d]);
  res.json({ beyan, sellout: so, prim, hedef, siralama: sira, atama, stok });
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
