const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const pool = require("../db");

const DATA_DIR = path.join(__dirname, "../../data/master");
const UNIQ_FILE = path.join(DATA_DIR, "uniq-kod.csv");
const STOK_FILE = path.join(DATA_DIR, "stok-liste.csv");

function norm(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/\s+/g, "");
}

function readRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw Object.assign(new Error(`Master dosya yok: ${path.basename(filePath)}`), { status: 404 });
  }
  const buffer = fs.readFileSync(filePath);
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const workbook = isZip
    ? XLSX.read(buffer, { type: "buffer" })
    : XLSX.read(buffer.toString("utf8"), { type: "string", raw: false, codepage: 65001 });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

function pick(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== "") return row[key];
  }
  // Esnek: başlık boşluk/büyük-küçük farkı
  const map = {};
  for (const [k, v] of Object.entries(row)) map[String(k).trim().toLocaleUpperCase("tr-TR")] = v;
  for (const key of keys) {
    const hit = map[String(key).trim().toLocaleUpperCase("tr-TR")];
    if (hit != null && String(hit).trim() !== "") return hit;
  }
  return "";
}

function parseUniqSheet(rows) {
  // Başlık satırı ortadaysa (ilk satır boş) — object keys MARKA içermiyorsa satırları tara
  let dataRows = rows;
  if (!rows.length || !Object.keys(rows[0]).some((k) => /MARKA/i.test(k))) {
    // sheet_to_json bazen ilk boş satırı __EMPTY yapar; MARKA satırını bul
    const headerIdx = rows.findIndex((r) =>
      Object.values(r).some((v) => String(v).toLocaleUpperCase("tr-TR") === "MARKA")
    );
    if (headerIdx >= 0) {
      const headerRow = rows[headerIdx];
      const keys = Object.keys(headerRow);
      const headers = keys.map((k) => String(headerRow[k] || "").trim());
      dataRows = rows.slice(headerIdx + 1).map((r) => {
        const obj = {};
        keys.forEach((k, i) => { obj[headers[i] || k] = r[k]; });
        return obj;
      });
    }
  }

  const byBarkod = new Map();
  const byReferans = new Map();
  const products = [];

  for (const row of dataRows) {
    const marka = String(pick(row, "MARKA")).trim();
    const urunAdi = String(pick(row, "Ürün Adı", "Urun Adi")).trim();
    const uniqKod = norm(pick(row, "UNIQ KOD"));
    const uniqAdi = String(pick(row, "UNIQ ÜRÜN ADI", "UNIQ URUN ADI")).trim();
    const pairs = [];
    for (let i = 1; i <= 6; i++) {
      const barkod = norm(pick(row, `BARKOD-${i}`, `BARKOD ${i}`));
      const referans = norm(pick(row, `REFERANS-${i}`, `REFERANS ${i}`));
      if (barkod || referans) pairs.push({ barkod, referans });
    }
    if (!pairs.length) continue;
    const product = { marka, urunAdi, uniqKod, uniqAdi, pairs };
    products.push(product);
    for (const pair of pairs) {
      if (pair.barkod) {
        if (!byBarkod.has(pair.barkod)) byBarkod.set(pair.barkod, []);
        byBarkod.get(pair.barkod).push(product);
      }
      if (pair.referans) {
        if (!byReferans.has(pair.referans)) byReferans.set(pair.referans, []);
        byReferans.get(pair.referans).push(product);
      }
    }
  }
  return { products, byBarkod, byReferans };
}

function parseStokListe(rows) {
  const byBarkod = new Map();
  const byStok = new Map();
  const list = [];
  for (const row of rows) {
    const item = {
      stokKodu: String(pick(row, "STOK KODU")).trim(),
      stokAdi: String(pick(row, "STOK ADI")).trim(),
      marka: String(pick(row, "MARKA")).trim(),
      barkod: norm(pick(row, "BARKOD 1", "BARKOD")),
      uniqKod: norm(pick(row, "UNIQ KOD")),
      uniqAdi: String(pick(row, "UNIQ ADI")).trim(),
    };
    list.push(item);
    if (item.barkod) {
      if (!byBarkod.has(item.barkod)) byBarkod.set(item.barkod, []);
      byBarkod.get(item.barkod).push(item);
    }
    if (item.stokKodu) byStok.set(norm(item.stokKodu), item);
  }
  return { list, byBarkod, byStok };
}

function compareMasterFiles() {
  const uniq = parseUniqSheet(readRows(UNIQ_FILE));
  const stok = parseStokListe(readRows(STOK_FILE));

  const seen = new Set();
  const ayni = [];
  const cakisma = [];
  const uniqBos = [];
  const stokBos = [];

  function pushCompare(up, sr, eslesme, anahtar) {
    const key = `${eslesme}|${anahtar}|${up.uniqKod}|${sr.uniqKod}|${sr.stokKodu}`;
    if (seen.has(key)) return;
    seen.add(key);

    const item = {
      eslesme,
      anahtar,
      marka: up.marka || sr.marka || null,
      urun_adi: up.urunAdi || null,
      barkod: sr.barkod || (eslesme === "barkod" ? anahtar : null),
      stok_kodu: sr.stokKodu || null,
      stok_adi: sr.stokAdi || null,
      uniq_sheet_uniq: up.uniqKod || null,
      uniq_sheet_ad: up.uniqAdi || null,
      stok_uniq: sr.uniqKod || null,
      stok_uniq_adi: sr.uniqAdi || null,
    };

    if (up.uniqKod && sr.uniqKod && up.uniqKod === sr.uniqKod) ayni.push(item);
    else if (up.uniqKod && sr.uniqKod && up.uniqKod !== sr.uniqKod) cakisma.push(item);
    else if (!up.uniqKod && sr.uniqKod) uniqBos.push(item);
    else if (up.uniqKod && !sr.uniqKod) stokBos.push(item);
  }

  for (const [barkod, products] of uniq.byBarkod.entries()) {
    for (const up of products) {
      for (const sr of stok.byBarkod.get(barkod) || []) {
        pushCompare(up, sr, "barkod", barkod);
      }
    }
  }

  for (const [ref, products] of uniq.byReferans.entries()) {
    const sr = stok.byStok.get(ref);
    if (!sr) continue;
    for (const up of products) pushCompare(up, sr, "referans=stok_kodu", ref);
  }

  return {
    kaynak: {
      uniq_dosya: path.basename(UNIQ_FILE),
      stok_dosya: path.basename(STOK_FILE),
      aciklama:
        "Aynı barkod veya (Uniq REFERANS = Stok STOK KODU) ile eşlenen ürünlerde UNIQ KOD karşılaştırılır. " +
        "İkisi de aynıysa kabul edilir. Farklıysa burada listelenir. " +
        "Bir ürünün birden fazla barkodu olabilir; kanonik kimlik UNIQ KOD’dur.",
    },
    ozet: {
      uniq_urun_satir: uniq.products.length,
      stok_satir: stok.list.length,
      ayni: ayni.length,
      cakisma: cakisma.length,
      uniq_sheet_bos: uniqBos.length,
      stok_uniq_bos: stokBos.length,
    },
    cakisma,
    uniq_sheet_bos: uniqBos,
    stok_uniq_bos: stokBos,
  };
}

async function enrichWithDb(rows) {
  if (!rows.length) return rows;
  const barkods = [...new Set(rows.map((r) => r.barkod).filter(Boolean))];
  const stoklar = [...new Set(rows.map((r) => norm(r.stok_kodu)).filter(Boolean))];
  const dbMap = new Map();

  if (barkods.length) {
    const [kimlikler] = await pool.query(
      `SELECT k.deger_normalize, u.id AS urun_id, u.uniq_kod, u.urun_adi
       FROM urun_kimlik k
       JOIN urun u ON u.id = k.urun_id
       WHERE k.aktif=1 AND k.tip='barkod' AND k.deger_normalize IN (?)`,
      [barkods]
    );
    for (const row of kimlikler) dbMap.set(`barkod:${row.deger_normalize}`, row);
  }
  if (stoklar.length) {
    const [kimlikler] = await pool.query(
      `SELECT k.deger_normalize, u.id AS urun_id, u.uniq_kod, u.urun_adi
       FROM urun_kimlik k
       JOIN urun u ON u.id = k.urun_id
       WHERE k.aktif=1 AND k.tip IN ('referans','stok_kodu') AND k.deger_normalize IN (?)`,
      [stoklar]
    );
    for (const row of kimlikler) dbMap.set(`kod:${row.deger_normalize}`, row);
  }

  return rows.map((row) => {
    const hit =
      (row.barkod && dbMap.get(`barkod:${row.barkod}`)) ||
      (row.stok_kodu && dbMap.get(`kod:${norm(row.stok_kodu)}`)) ||
      null;
    return {
      ...row,
      db_urun_id: hit?.urun_id || null,
      db_uniq_kod: hit?.uniq_kod || null,
      db_urun_adi: hit?.urun_adi || null,
    };
  });
}

/**
 * Stok Liste satır satır ↔ DB uniq karşılaştırması.
 * Beklenen uniq = Stok UNIQ (doluysa) || STOK KODU
 */
async function compareStokVsDb() {
  const stok = parseStokListe(readRows(STOK_FILE));
  const rows = stok.list.map((sr) => {
    const stokUniq = sr.uniqKod || null;
    const stokKodu = sr.stokKodu || null;
    const beklenen = stokUniq || (stokKodu ? norm(stokKodu) : null);
    return {
      marka: sr.marka || null,
      stok_adi: sr.stokAdi || null,
      barkod: sr.barkod || null,
      stok_kodu: stokKodu,
      stok_uniq: stokUniq,
      stok_uniq_adi: sr.uniqAdi || null,
      beklenen_uniq: beklenen,
      beklenen_kaynak: stokUniq ? "stok_uniq" : "stok_kodu",
    };
  }).filter((r) => r.beklenen_uniq);

  const enriched = await enrichWithDb(rows);

  const tam = [];
  const farkli = [];
  const dbYok = [];

  for (const row of enriched) {
    const item = {
      ...row,
      durum: !row.db_uniq_kod
        ? "db_yok"
        : row.db_uniq_kod === row.beklenen_uniq
          ? "tam"
          : "farkli",
    };
    if (item.durum === "tam") tam.push(item);
    else if (item.durum === "farkli") farkli.push(item);
    else dbYok.push(item);
  }

  return {
    kural: "Beklenen UNIQ = Stok Liste UNIQ KOD (varsa) aksi halde STOK KODU. DB’deki urun.uniq_kod ile birebir karşılaştırılır.",
    ozet: {
      stok_satir: stok.list.length,
      karsilastirilan: enriched.length,
      tam: tam.length,
      farkli: farkli.length,
      db_yok: dbYok.length,
      yuzde_tam: enriched.length
        ? Math.round((tam.length / enriched.length) * 1000) / 10
        : 0,
    },
    tam,
    farkli,
    db_yok: dbYok,
  };
}

async function getUniqFarklar() {
  const result = compareMasterFiles();
  result.cakisma = await enrichWithDb(result.cakisma);
  result.uniq_sheet_bos = await enrichWithDb(result.uniq_sheet_bos);
  result.stok_uniq_bos = await enrichWithDb(result.stok_uniq_bos);
  result.stok_db = await compareStokVsDb();
  return result;
}

module.exports = { getUniqFarklar, compareMasterFiles, compareStokVsDb, DATA_DIR };
