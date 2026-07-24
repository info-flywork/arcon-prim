/**
 * Her Stok Liste satırı için:
 *   hedef uniq = UNIQ KOD (doluysa) || STOK KODU
 * Barkod / stok_kodu kimliklerini o ürüne taşır (gerekirse ürün oluşturur).
 *
 * Böylece aynı Uniq-sheet ürününe bağlı ama Stok'ta UNIQ'suz satırlar
 * kendi STOK KODU ile ayrı kanonik kimliğe ayrılır.
 *
 * node src/fixUniqPerStokRow.js [--dry-run]
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

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const buffer = fs.readFileSync(STOK_FILE);
  const workbook = XLSX.read(buffer.toString("utf8"), { type: "string", raw: false, codepage: 65001 });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false });

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [urunler] = await pool.query("SELECT id, uniq_kod, marka, urun_adi, durum FROM urun");
  const byUniq = new Map(urunler.map((u) => [u.uniq_kod, u]));
  const byId = new Map(urunler.map((u) => [u.id, u]));

  const [kimlikler] = await pool.query(
    "SELECT id, tip, deger_normalize, deger_ham, urun_id FROM urun_kimlik WHERE aktif=1"
  );
  const kimlikByKey = new Map();
  for (const k of kimlikler) kimlikByKey.set(`${k.tip}|${k.deger_normalize}`, k);

  let created = 0;
  let moved = 0;
  let already = 0;
  let skipped = 0;
  const moveSamples = [];

  const conn = await pool.getConnection();
  try {
    if (!dryRun) await conn.beginTransaction();

    for (const row of rows) {
      const stokHam = pick(row, "STOK KODU");
      const stok = normalizeCanonicalCode(stokHam);
      const barkod = normalizeBarcode(pick(row, "BARKOD 1", "BARKOD"));
      const uniq = normalizeCanonicalCode(pick(row, "UNIQ KOD"));
      if (!stok) {
        skipped += 1;
        continue;
      }

      const targetUniq = uniq || stok;
      const marka = pick(row, "MARKA") || "Bilinmiyor";
      const urunAdi = pick(row, "UNIQ ADI") || pick(row, "STOK ADI") || stok;

      let product = byUniq.get(targetUniq);
      if (!product || product.durum === "pasif") {
        if (dryRun) {
          created += 1;
          product = { id: -(created), uniq_kod: targetUniq, marka, urun_adi: urunAdi, durum: "aktif" };
          byUniq.set(targetUniq, product);
        } else {
          await conn.query(
            `INSERT INTO urun (uniq_kod, marka, urun_adi, aks, cinsiyet, durum)
             VALUES (?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
               marka=VALUES(marka),
               urun_adi=VALUES(urun_adi),
               durum=IF(durum='pasif','aktif',durum),
               birlesilen_urun_id=NULL`,
            [
              targetUniq,
              marka,
              urunAdi,
              pick(row, "AKS") || null,
              pick(row, "CİNSİYET", "CINSIYET") || null,
              uniq ? "aktif" : "inceleme",
            ]
          );
          const [[ex]] = await conn.query(
            "SELECT id, uniq_kod, marka, urun_adi, durum FROM urun WHERE uniq_kod=?",
            [targetUniq]
          );
          product = ex;
          byUniq.set(targetUniq, product);
          byId.set(product.id, product);
          created += 1;
        }
      }

      const identifiers = [];
      if (barkod) identifiers.push({ tip: "barkod", norm: barkod, ham: pick(row, "BARKOD 1", "BARKOD") });
      identifiers.push({ tip: "stok_kodu", norm: stok, ham: stokHam });
      identifiers.push({ tip: "referans", norm: stok, ham: stokHam });

      for (const idn of identifiers) {
        const key = `${idn.tip}|${idn.norm}`;
        const existing = kimlikByKey.get(key);

        if (existing && Number(existing.urun_id) === Number(product.id)) {
          already += 1;
          continue;
        }

        if (existing && Number(existing.urun_id) !== Number(product.id)) {
          if (!dryRun) {
            const [[dup]] = await conn.query(
              "SELECT id FROM urun_kimlik WHERE tip=? AND deger_normalize=? AND urun_id=? AND id<>? LIMIT 1",
              [idn.tip, idn.norm, product.id, existing.id]
            );
            if (dup) {
              await conn.query(
                "UPDATE urun_kimlik SET aktif=0, kaynak='stok_uniq_duzelt_atlandi' WHERE id=?",
                [existing.id]
              );
            } else {
              await conn.query(
                "UPDATE urun_kimlik SET urun_id=?, kaynak='stok_uniq_duzelt' WHERE id=?",
                [product.id, existing.id]
              );
            }
          }
          moved += 1;
          if (moveSamples.length < 15) {
            moveSamples.push({
              tip: idn.tip,
              deger: idn.norm,
              fromUniq: byId.get(existing.urun_id)?.uniq_kod || null,
              toUniq: targetUniq,
              stokUniqBos: !uniq,
            });
          }
          existing.urun_id = product.id;
          continue;
        }

        if (!existing) {
          if (!dryRun) {
            await conn.query(
              `INSERT INTO urun_kimlik (urun_id, tip, deger_ham, deger_normalize, kaynak, aktif)
               VALUES (?,?,?,?, 'stok_uniq_duzelt', 1)
               ON DUPLICATE KEY UPDATE urun_id=VALUES(urun_id), aktif=1, kaynak='stok_uniq_duzelt'`,
              [product.id, idn.tip, idn.ham, idn.norm]
            );
            const [[kid]] = await conn.query(
              "SELECT id, tip, deger_normalize, urun_id FROM urun_kimlik WHERE tip=? AND deger_normalize=?",
              [idn.tip, idn.norm]
            );
            kimlikByKey.set(key, kid);
          }
          moved += 1;
        }
      }
    }

    if (!dryRun) {
      await conn.query(
        "INSERT INTO audit_log (tablo, kayit_id, islem, detay) VALUES (?,?,?,?)",
        [
          "urun",
          "stok-uniq-per-row",
          "guncelleme",
          JSON.stringify({ created, moved, already, kural: "satir: uniq||stok_kodu" }),
        ]
      );
      await conn.commit();
    }
  } catch (error) {
    if (!dryRun) await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  const [verify] = await pool.query(`
    SELECT u.id, u.uniq_kod, k.tip, k.deger_normalize
    FROM urun_kimlik k
    JOIN urun u ON u.id = k.urun_id
    WHERE k.aktif=1 AND k.deger_normalize IN ('8411061124802','PCH65227568','PCH65165902')
    ORDER BY k.deger_normalize, k.tip
  `);

  console.log(JSON.stringify({ dryRun, created, moved, already, skipped, moveSamples, verify }, null, 2));
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
