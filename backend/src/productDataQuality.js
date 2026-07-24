const pool = require("./db");

const SENTINELS = ["0", "0,00", "#N/A", "N/A", "TBC", "-"];

async function collectProductDataQuality(conn = pool) {
  const [[totals]] = await conn.query(`
    SELECT COUNT(*) AS legacy_rows,
           COUNT(DISTINCT NULLIF(uniq_kod,'')) AS uniq_codes,
           SUM(uniq_kod IS NULL OR uniq_kod='') AS missing_uniq,
           COUNT(DISTINCT NULLIF(barkod,'')) AS barcodes,
           COUNT(DISTINCT NULLIF(referans,'')) AS references_count
    FROM uniq_kod
  `);
  const [[fallback]] = await conn.query(`
    SELECT
      SUM((uniq_kod IS NULL OR uniq_kod='')
          AND stok_list_uniq_kod IS NOT NULL AND stok_list_uniq_kod<>'') AS fallback_only,
      SUM(uniq_kod IS NOT NULL AND uniq_kod<>''
          AND stok_list_uniq_kod IS NOT NULL AND stok_list_uniq_kod<>''
          AND uniq_kod<>stok_list_uniq_kod) AS conflicting_uniq_columns,
      SUM(COALESCE(NULLIF(uniq_kod,''), NULLIF(stok_list_uniq_kod,'')) IS NULL) AS orphan_rows
    FROM uniq_kod
  `);
  const [[conflicts]] = await conn.query(`
    SELECT
      (SELECT COUNT(*) FROM (
        SELECT barkod
        FROM uniq_kod
        WHERE barkod IS NOT NULL AND barkod<>''
        GROUP BY barkod
        HAVING COUNT(DISTINCT COALESCE(NULLIF(uniq_kod,''),NULLIF(stok_list_uniq_kod,'')))>1
      ) b) AS conflicting_barcodes,
      (SELECT COUNT(*) FROM (
        SELECT referans
        FROM uniq_kod
        WHERE referans IS NOT NULL AND referans<>''
        GROUP BY referans
        HAVING COUNT(DISTINCT COALESCE(NULLIF(uniq_kod,''),NULLIF(stok_list_uniq_kod,'')))>1
      ) r) AS conflicting_references
  `);
  const [sentinels] = await conn.query(`
    SELECT field_name, value, COUNT(*) AS row_count
    FROM (
      SELECT 'uniq_kod' AS field_name, UPPER(TRIM(uniq_kod)) AS value FROM uniq_kod
      UNION ALL
      SELECT 'stok_list_uniq_kod', UPPER(TRIM(stok_list_uniq_kod)) FROM uniq_kod
      UNION ALL
      SELECT 'barkod', UPPER(TRIM(barkod)) FROM uniq_kod
      UNION ALL
      SELECT 'referans', UPPER(TRIM(referans)) FROM uniq_kod
    ) identifiers
    WHERE value IN (?)
    GROUP BY field_name, value
    ORDER BY row_count DESC
  `, [SENTINELS]);
  const [topMultiBarcode] = await conn.query(`
    SELECT COALESCE(NULLIF(uniq_kod,''),NULLIF(stok_list_uniq_kod,'')) AS uniq_code,
           MAX(marka) AS brand,
           MAX(COALESCE(NULLIF(uniq_urun_adi,''),urun_adi)) AS product_name,
           COUNT(DISTINCT NULLIF(barkod,'')) AS barcode_count
    FROM uniq_kod
    WHERE COALESCE(NULLIF(uniq_kod,''),NULLIF(stok_list_uniq_kod,'')) IS NOT NULL
    GROUP BY uniq_code
    HAVING barcode_count>1
    ORDER BY barcode_count DESC
    LIMIT 20
  `);
  const [metadataConflicts] = await conn.query(`
    SELECT COALESCE(NULLIF(uniq_kod,''),NULLIF(stok_list_uniq_kod,'')) AS uniq_code,
           COUNT(DISTINCT NULLIF(TRIM(marka),'')) AS brand_count,
           COUNT(DISTINCT NULLIF(TRIM(COALESCE(NULLIF(uniq_urun_adi,''),urun_adi)),'')) AS name_count,
           COUNT(DISTINCT NULLIF(TRIM(aks),'')) AS aks_count,
           COUNT(DISTINCT NULLIF(TRIM(cinsiyet),'')) AS gender_count
    FROM uniq_kod
    WHERE COALESCE(NULLIF(uniq_kod,''),NULLIF(stok_list_uniq_kod,'')) IS NOT NULL
    GROUP BY uniq_code
    HAVING brand_count>1 OR name_count>1 OR aks_count>1 OR gender_count>1
    ORDER BY brand_count+name_count+aks_count+gender_count DESC
    LIMIT 50
  `);
  return { totals, fallback, conflicts, sentinels, topMultiBarcode, metadataConflicts };
}

async function main() {
  try {
    console.log(JSON.stringify(await collectProductDataQuality(), null, 2));
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Ürün veri kalite raporu üretilemedi:", error.message);
    process.exit(1);
  });
}

module.exports = { SENTINELS, collectProductDataQuality };
