/**
 * Stok Liste'ye göre urun.uniq_kod düzeltmesi:
 * - Stok satırında UNIQ KOD doluysa → ürün uniq_kod = UNIQ KOD
 * - Boşsa → ürün uniq_kod = STOK KODU
 *
 * Hedef uniq başka ürüne aitse: kaynak ürün o ürüne birleştirilir.
 *
 * Çalıştır: node src/fixUniqFromStok.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const mysql = require("mysql2/promise");
const { normalizeCanonicalCode, normalizeBarcode } = require("./services/productService");

const STOK_FILE = path.join(__dirname, "../data/master/stok-liste.csv");

function pick(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== "") return String(row[key]).trim();
  }
  const map = {};
  for (const [k, v] of Object.entries(row)) {
    map[String(k).trim().toLocaleUpperCase("tr-TR")] = v;
  }
  for (const key of keys) {
    const hit = map[String(key).trim().toLocaleUpperCase("tr-TR")];
    if (hit != null && String(hit).trim() !== "") return String(hit).trim();
  }
  return "";
}

function readStokRows() {
  const buffer = fs.readFileSync(STOK_FILE);
  const workbook = XLSX.read(buffer.toString("utf8"), { type: "string", raw: false, codepage: 65001 });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = readStokRows();
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: false,
  });

  const [kimlikler] = await pool.query(`
    SELECT k.tip, k.deger_normalize, k.urun_id, u.uniq_kod
    FROM urun_kimlik k
    JOIN urun u ON u.id = k.urun_id
    WHERE k.aktif = 1 AND k.tip IN ('barkod', 'stok_kodu', 'referans')
      AND u.durum <> 'pasif'
  `);
  const byKey = new Map();
  for (const row of kimlikler) byKey.set(`${row.tip}|${row.deger_normalize}`, row);

  const proposals = new Map(); // urun_id -> { current, targets: Map }

  for (const row of rows) {
    const stokHam = pick(row, "STOK KODU");
    const stok = normalizeCanonicalCode(stokHam);
    const barkod = normalizeBarcode(pick(row, "BARKOD 1", "BARKOD"));
    const uniq = normalizeCanonicalCode(pick(row, "UNIQ KOD"));
    if (!stok) continue;
    const target = uniq || stok;
    const kaynak = uniq ? "stok_uniq" : "stok_kodu";

    const hit =
      byKey.get(`stok_kodu|${stok}`) ||
      byKey.get(`referans|${stok}`) ||
      (barkod ? byKey.get(`barkod|${barkod}`) : null);
    if (!hit) continue;

    if (!proposals.has(hit.urun_id)) {
      proposals.set(hit.urun_id, { current: hit.uniq_kod, targets: new Map() });
    }
    const proposal = proposals.get(hit.urun_id);
    const prev = proposal.targets.get(target) || { count: 0, kaynak, stok };
    prev.count += 1;
    // UNIQ satırı, stok_kodu fallback'inden öncelikli sayılsın
    if (kaynak === "stok_uniq") prev.kaynak = "stok_uniq";
    proposal.targets.set(target, prev);
  }

  const [allUrun] = await pool.query("SELECT id, uniq_kod FROM urun");
  const ownerByUniq = new Map(allUrun.map((u) => [u.uniq_kod, u.id]));

  const updates = [];
  const merges = [];
  const conflicts = [];
  let alreadyOk = 0;

  for (const [urunId, proposal] of proposals.entries()) {
    const entries = [...proposal.targets.entries()].map(([code, meta]) => ({ code, ...meta }));
    const uniqOnes = entries.filter((e) => e.kaynak === "stok_uniq");
    const poolEntries = (uniqOnes.length ? uniqOnes : entries).sort((a, b) => b.count - a.count);

    // Birden fazla farklı UNIQ kod → çakışma, elle bakılsın
    const uniqCodes = [...new Set(uniqOnes.map((e) => e.code))];
    if (uniqCodes.length > 1) {
      conflicts.push({ urunId, current: proposal.current, options: uniqCodes });
      continue;
    }

    const top = poolEntries[0];
    if (!top) continue;
    if (top.code === proposal.current) {
      alreadyOk += 1;
      continue;
    }

    const ownerId = ownerByUniq.get(top.code);
    if (ownerId && Number(ownerId) !== Number(urunId)) {
      merges.push({
        sourceId: urunId,
        targetId: ownerId,
        from: proposal.current,
        to: top.code,
        kaynak: top.kaynak,
      });
      continue;
    }

    updates.push({
      urunId,
      from: proposal.current,
      to: top.code,
      kaynak: top.kaynak,
    });
  }

  console.log(JSON.stringify({
    dryRun,
    stokSatir: rows.length,
    urunOneri: proposals.size,
    alreadyOk,
    guncellenecek: updates.length,
    birlestirilecek: merges.length,
    cakisma: conflicts.length,
  }, null, 2));

  if (conflicts.length) {
    console.log("Çakışma örnekleri:", conflicts.slice(0, 10));
  }
  if (dryRun) {
    console.log("Güncelleme örnekleri:", updates.slice(0, 5));
    console.log("Birleşim örnekleri:", merges.slice(0, 5));
    await pool.end();
    return;
  }

  const conn = await pool.getConnection();
  let updated = 0;
  let merged = 0;
  try {
    await conn.beginTransaction();

    for (const item of updates) {
      await conn.query("UPDATE urun SET uniq_kod=? WHERE id=?", [item.to, item.urunId]);
      ownerByUniq.set(item.to, item.urunId);
      updated += 1;
    }

    for (const item of merges) {
      // Kimlikleri taşı (çakışan tip+değer varsa kaynak kimliği pasifle)
      const [ids] = await conn.query("SELECT id, tip, deger_normalize FROM urun_kimlik WHERE urun_id=?", [item.sourceId]);
      for (const kid of ids) {
        const [[exists]] = await conn.query(
          "SELECT id FROM urun_kimlik WHERE tip=? AND deger_normalize=? AND urun_id=? LIMIT 1",
          [kid.tip, kid.deger_normalize, item.targetId]
        );
        if (exists) {
          await conn.query("UPDATE urun_kimlik SET aktif=0, kaynak='birlesim_atlandi' WHERE id=?", [kid.id]);
        } else {
          await conn.query(
            "UPDATE urun_kimlik SET urun_id=?, kaynak='birlesim' WHERE id=?",
            [item.targetId, kid.id]
          );
        }
      }
      for (const table of ["satis_beyan", "sellout", "prim_hesap_satir"]) {
        await conn.query(`UPDATE ${table} SET urun_id=? WHERE urun_id=?`, [item.targetId, item.sourceId]);
      }
      await conn.query("UPDATE urun_legacy_map SET urun_id=? WHERE urun_id=?", [item.targetId, item.sourceId]);
      await conn.query(
        "UPDATE urun SET durum='pasif', birlesilen_urun_id=? WHERE id=?",
        [item.targetId, item.sourceId]
      );
      merged += 1;
    }

    await conn.query(
      "INSERT INTO audit_log (tablo, kayit_id, islem, detay) VALUES (?,?,?,?)",
      [
        "urun",
        "stok-uniq-fix",
        "guncelleme",
        JSON.stringify({
          updated,
          merged,
          conflicts: conflicts.length,
          kural: "stok_uniq || stok_kodu",
        }),
      ]
    );

    await conn.commit();
    console.log(JSON.stringify({ ok: true, updated, merged, conflicts: conflicts.length }, null, 2));
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
