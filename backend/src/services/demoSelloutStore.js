/**
 * Demo Arcon sell-out son üretimi — sayfa yenilense de kalsın.
 * XLSX her zaman diskte (data/demo/sonuc/son.xlsx).
 * Meta: disk + MySQL (xlsx DB'ye yazılmaz — paket boyutu / Failed to fetch).
 * Dönem sellout tablosuna dokunmaz.
 */
const fs = require("fs");
const path = require("path");
const pool = require("../db");

const DIR = path.join(__dirname, "../../data/demo/sonuc");
const META_PATH = path.join(DIR, "meta.json");
const XLSX_PATH = path.join(DIR, "son.xlsx");

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS demo_sellout_sonuc (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      donem_ym VARCHAR(7) DEFAULT NULL,
      satir_sayisi INT NOT NULL DEFAULT 0,
      parcalar_json LONGTEXT DEFAULT NULL,
      ornek_json LONGTEXT DEFAULT NULL,
      headers_json LONGTEXT DEFAULT NULL,
      kaynak_dosyalar LONGTEXT DEFAULT NULL,
      kaydedildi_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function payloadFromNormalize(sonuc, { yearMonth, dosyaAdlari } = {}) {
  return {
    demo: true,
    format: "arcon-sellout-xlsx",
    kaydedildi: true,
    kaydedildiAt: new Date().toISOString(),
    yearMonth: yearMonth || null,
    donem: sonuc.donem,
    satirSayisi: sonuc.satirSayisi,
    parcalar: sonuc.parcalar,
    ornek: sonuc.ornek,
    headers: sonuc.headers,
    kaynakDosyalar: dosyaAdlari || [],
    xlsxIndir: "/api/demo/sellout/xlsx",
  };
}

function saveToDisk(meta, xlsxBase64) {
  ensureDir();
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), "utf8");
  if (xlsxBase64) {
    fs.writeFileSync(XLSX_PATH, Buffer.from(xlsxBase64, "base64"));
  }
}

async function saveToDb(meta) {
  await ensureTable();
  await pool.query(
    `INSERT INTO demo_sellout_sonuc
       (id, donem_ym, satir_sayisi, parcalar_json, ornek_json, headers_json, kaynak_dosyalar)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       donem_ym=VALUES(donem_ym),
       satir_sayisi=VALUES(satir_sayisi),
       parcalar_json=VALUES(parcalar_json),
       ornek_json=VALUES(ornek_json),
       headers_json=VALUES(headers_json),
       kaynak_dosyalar=VALUES(kaynak_dosyalar)`,
    [
      meta.yearMonth,
      meta.satirSayisi || 0,
      JSON.stringify(meta.parcalar || []),
      JSON.stringify(meta.ornek || []),
      JSON.stringify(meta.headers || []),
      JSON.stringify(meta.kaynakDosyalar || []),
    ]
  );
}

async function saveDemoSonuc(sonuc, opts = {}) {
  const xlsxBase64 = sonuc.xlsxBase64 || null;
  const meta = payloadFromNormalize(sonuc, opts);
  saveToDisk(meta, xlsxBase64);
  let dbOk = false;
  let dbHata = null;
  try {
    await saveToDb(meta);
    dbOk = true;
  } catch (e) {
    dbHata = e.message;
    console.error("demo_sellout_sonuc DB kayıt:", e.message);
  }
  return { ...meta, disk: true, db: dbOk, dbHata, xlsxHazir: Boolean(xlsxBase64 && fs.existsSync(XLSX_PATH)) };
}

function loadFromDisk() {
  if (!fs.existsSync(META_PATH)) return null;
  const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
  return {
    ...meta,
    xlsxIndir: "/api/demo/sellout/xlsx",
    xlsxHazir: fs.existsSync(XLSX_PATH),
    kaynak: "disk",
  };
}

async function loadFromDb() {
  await ensureTable();
  const [[row]] = await pool.query(
    `SELECT donem_ym, satir_sayisi, parcalar_json, ornek_json, headers_json,
            kaynak_dosyalar, kaydedildi_at
       FROM demo_sellout_sonuc WHERE id=1`
  );
  if (!row || row.satir_sayisi == null) return null;
  const parse = (v) => {
    if (v == null) return null;
    if (typeof v === "object") return v;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  };
  return {
    demo: true,
    format: "arcon-sellout-xlsx",
    kaydedildi: true,
    kaydedildiAt: row.kaydedildi_at,
    yearMonth: row.donem_ym,
    satirSayisi: row.satir_sayisi,
    parcalar: parse(row.parcalar_json) || [],
    ornek: parse(row.ornek_json) || [],
    headers: parse(row.headers_json) || [],
    kaynakDosyalar: parse(row.kaynak_dosyalar) || [],
    xlsxIndir: "/api/demo/sellout/xlsx",
    xlsxHazir: fs.existsSync(XLSX_PATH),
    kaynak: "db",
  };
}

async function loadDemoSonuc() {
  const disk = loadFromDisk();
  if (disk) return disk;
  try {
    return await loadFromDb();
  } catch (e) {
    console.error("demo_sellout_sonuc DB okuma:", e.message);
    return null;
  }
}

function readXlsxBuffer() {
  if (!fs.existsSync(XLSX_PATH)) return null;
  return fs.readFileSync(XLSX_PATH);
}

module.exports = {
  saveDemoSonuc,
  loadDemoSonuc,
  readXlsxBuffer,
  DIR,
  XLSX_PATH,
  META_PATH,
};
