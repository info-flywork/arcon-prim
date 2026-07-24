const pool = require("./db");
const { hesapla } = require("./services/hesapService");

function rowsToMap(rows) {
  return new Map(rows.map((row) => [
    `${row.uzman_id}|${row.magaza_id}|${row.urun_id}`,
    Number(row.prime_esas_tutar || 0),
  ]));
}

async function financialReconciliation(conn) {
  const [[period]] = await conn.query(`
    SELECT id, ad, durum FROM donem
    ORDER BY (ay=5) DESC, yil DESC, ay DESC LIMIT 1
  `);
  if (!period) return { skipped: "Karşılaştırılacak dönem yok" };

  const [beforeRows] = await conn.query(`
    SELECT uzman_id, magaza_id, urun_id, SUM(prime_esas_tutar) AS prime_esas_tutar
    FROM prim_hesap_satir
    WHERE donem_id=? AND urun_id IS NOT NULL
    GROUP BY uzman_id, magaza_id, urun_id
  `, [period.id]);
  const [[beforeSummary]] = await conn.query(
    "SELECT COUNT(*) AS rows_count, COALESCE(SUM(toplam_prim),0) AS total_bonus FROM prim_ozet WHERE donem_id=?",
    [period.id]
  );

  await hesapla(period.id, { connection: conn, allowClosed: true });
  const [afterRows] = await conn.query(`
    SELECT uzman_id, magaza_id, urun_id, SUM(prime_esas_tutar) AS prime_esas_tutar
    FROM prim_hesap_satir
    WHERE donem_id=? AND urun_id IS NOT NULL
    GROUP BY uzman_id, magaza_id, urun_id
  `, [period.id]);
  const [[afterSummary]] = await conn.query(
    "SELECT COUNT(*) AS rows_count, COALESCE(SUM(toplam_prim),0) AS total_bonus FROM prim_ozet WHERE donem_id=?",
    [period.id]
  );

  const before = rowsToMap(beforeRows);
  const after = rowsToMap(afterRows);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const differences = [...keys].map((key) => ({
    key,
    before: before.get(key) || 0,
    after: after.get(key) || 0,
    delta: +((after.get(key) || 0) - (before.get(key) || 0)).toFixed(2),
  })).filter((row) => Math.abs(row.delta) >= 0.01)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    period,
    baselineAvailable: beforeRows.length > 0,
    before: {
      productGroups: beforeRows.length,
      bonusRows: Number(beforeSummary.rows_count),
      totalBonus: Number(beforeSummary.total_bonus),
    },
    after: {
      productGroups: afterRows.length,
      bonusRows: Number(afterSummary.rows_count),
      totalBonus: Number(afterSummary.total_bonus),
    },
    totalBonusDelta: +(Number(afterSummary.total_bonus) - Number(beforeSummary.total_bonus)).toFixed(2),
    differingProductGroups: differences.length,
    topDifferences: differences.slice(0, 30),
  };
}

async function validateProductMigration() {
  const conn = await pool.getConnection();
  let transactionOpen = false;
  try {
    const [[products]] = await conn.query(`
      SELECT COUNT(*) AS products,
             SUM(durum='aktif') AS active_products,
             SUM(durum='inceleme') AS review_products
      FROM urun
    `);
    const [[identifiers]] = await conn.query(`
      SELECT COUNT(*) AS identifiers,
             COUNT(DISTINCT CONCAT(tip,'|',deger_normalize)) AS unique_identifiers,
             SUM(tip='barkod') AS barcodes
      FROM urun_kimlik WHERE aktif=1
    `);
    const [[multiBarcode]] = await conn.query(`
      SELECT COUNT(*) AS products_with_multiple_barcodes
      FROM (
        SELECT urun_id FROM urun_kimlik
        WHERE aktif=1 AND tip='barkod'
        GROUP BY urun_id HAVING COUNT(*)>1
      ) products
    `);
    const [[conflicts]] = await conn.query(`
      SELECT SUM(durum='acik') AS open_conflicts,
             SUM(durum='cozuldu') AS resolved_conflicts
      FROM urun_esleme_cakisma
    `);
    const [[integrity]] = await conn.query(`
      SELECT
        (SELECT COUNT(*) FROM urun_legacy_map lm LEFT JOIN urun u ON u.id=lm.urun_id WHERE u.id IS NULL) AS dangling_legacy,
        (SELECT COUNT(*) FROM satis_beyan b LEFT JOIN urun u ON u.id=b.urun_id WHERE b.urun_id IS NOT NULL AND u.id IS NULL) AS dangling_claims,
        (SELECT COUNT(*) FROM sellout s LEFT JOIN urun u ON u.id=s.urun_id WHERE s.urun_id IS NOT NULL AND u.id IS NULL) AS dangling_sellout,
        (SELECT COUNT(*) FROM prim_hesap_satir h LEFT JOIN urun u ON u.id=h.urun_id WHERE h.urun_id IS NOT NULL AND u.id IS NULL) AS dangling_calculation,
        (SELECT COUNT(*) FROM satis_beyan WHERE uniq_kod_id IS NOT NULL AND urun_id IS NULL) AS claims_missing_product,
        (SELECT COUNT(*) FROM sellout WHERE uniq_kod_id IS NOT NULL AND urun_id IS NULL) AS sellout_missing_product
    `);

    await conn.beginTransaction();
    transactionOpen = true;
    const reconciliation = await financialReconciliation(conn);
    await conn.rollback();
    transactionOpen = false;

    const passed = Object.values(integrity).every((value) => Number(value) === 0)
      && Number(identifiers.identifiers) === Number(identifiers.unique_identifiers);
    return {
      passed,
      products,
      identifiers,
      multiBarcode,
      conflicts,
      integrity,
      financialReconciliation: reconciliation,
    };
  } finally {
    if (transactionOpen) await conn.rollback();
    conn.release();
  }
}

async function main() {
  try {
    const report = await validateProductMigration();
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Ürün migration doğrulaması başarısız:", error);
    process.exit(1);
  });
}

module.exports = { validateProductMigration, financialReconciliation };
