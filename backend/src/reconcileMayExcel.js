const fs = require("fs");
const path = require("path");
const pool = require("./db");
const {
  importUzmanMagaza,
  importZeops,
  importSellout,
  importHedef,
  importSiralama,
} = require("./services/importService");
const { hesapla, markaGrubunda } = require("./services/hesapService");
const { normalizeName, cleanBarcode } = require("./util");

function addAggregate(map, key, amount) {
  map.set(key, +((map.get(key) || 0) + amount).toFixed(2));
}

async function legacyProjection(conn, periodId) {
  const [legacyRows] = await conn.query(
    "SELECT id,barkod,stok_barkod_1,referans,stok_kodu,uniq_kod,stok_list_uniq_kod,marka FROM uniq_kod ORDER BY id"
  );
  const canonicalByUniq = new Map();
  for (const row of legacyRows) {
    const code = String(row.uniq_kod || row.stok_list_uniq_kod || "").trim();
    if (code && !canonicalByUniq.has(code)) canonicalByUniq.set(code, row.id);
  }
  const canonical = (row) => {
    const code = String(row.uniq_kod || row.stok_list_uniq_kod || "").trim();
    return (code && canonicalByUniq.get(code)) || row.id;
  };
  const byBarcode = new Map();
  const byReference = new Map();
  const byId = new Map(legacyRows.map((row) => [row.id, row]));
  for (const row of legacyRows) {
    const id = canonical(row);
    if (row.barkod) byBarcode.set(String(row.barkod), id);
    if (row.stok_barkod_1 && !byBarcode.has(String(row.stok_barkod_1))) {
      byBarcode.set(String(row.stok_barkod_1), id);
    }
    if (row.referans) byReference.set(normalizeName(row.referans), id);
    if (row.stok_kodu && !byReference.has(normalizeName(row.stok_kodu))) {
      byReference.set(normalizeName(row.stok_kodu), id);
    }
  }
  const resolveLegacy = (barcode, reference) => {
    const clean = cleanBarcode(barcode);
    return (clean && byBarcode.get(clean))
      || (reference && byReference.get(normalizeName(reference)))
      || null;
  };

  const [sellouts] = await conn.query(
    "SELECT * FROM sellout WHERE donem_id=? AND magaza_id IS NOT NULL",
    [periodId]
  );
  const selloutMap = new Map();
  for (const row of sellouts) {
    const legacyId = resolveLegacy(row.arcon_barkod, row.arcon_referans);
    if (!legacyId) continue;
    const key = `${row.magaza_id}|${legacyId}`;
    const current = selloutMap.get(key) || { quantity: 0, revenue: 0, remaining: 0 };
    current.quantity += Number(row.adet);
    current.revenue += Number(row.ciro_kdv_haric);
    current.remaining += Number(row.adet);
    selloutMap.set(key, current);
  }

  const [assignments] = await conn.query(`
    SELECT a.uzman_id,a.magaza_id,b.markalar
    FROM uzman_atama a JOIN prim_bolum b ON b.id=a.bolum_id
    WHERE a.donem_id=?
  `, [periodId]);
  const assignmentMap = new Map(assignments.map((row) => [`${row.uzman_id}|${row.magaza_id}`, row]));
  const [brandGroups] = await conn.query(`
    SELECT DISTINCT marka,marka_grup FROM sellout
    WHERE donem_id=? AND marka IS NOT NULL AND marka_grup IS NOT NULL
  `, [periodId]);
  const brandGroupMap = new Map(brandGroups.map((row) => [normalizeName(row.marka), row.marka_grup]));
  const [legacyMaps] = await conn.query("SELECT legacy_uniq_kod_id,urun_id FROM urun_legacy_map");
  const productByLegacy = new Map(legacyMaps.map((row) => [row.legacy_uniq_kod_id, row.urun_id]));

  const [claims] = await conn.query(
    "SELECT * FROM satis_beyan WHERE donem_id=? ORDER BY magaza_id,barkod,id",
    [periodId]
  );
  const result = new Map();
  for (const row of claims) {
    if (!row.magaza_id || !row.uzman_id || (row.durum && !String(row.durum).startsWith("Tamamland"))) continue;
    const legacyId = resolveLegacy(row.barkod, row.kod);
    if (!legacyId) continue;
    const assignment = assignmentMap.get(`${row.uzman_id}|${row.magaza_id}`);
    if (!assignment) continue;
    const legacyProduct = byId.get(legacyId);
    if (!markaGrubunda(assignment.markalar, legacyProduct?.marka, brandGroupMap)) continue;
    const sellout = selloutMap.get(`${row.magaza_id}|${legacyId}`);
    let eligibleQuantity = 0;
    let unitRevenue = 0;
    if (sellout?.quantity > 0) {
      unitRevenue = sellout.revenue / sellout.quantity;
      eligibleQuantity = Math.min(Number(row.adet), Math.max(0, sellout.remaining));
      sellout.remaining -= eligibleQuantity;
    }
    const productId = productByLegacy.get(legacyId);
    if (!productId) continue;
    addAggregate(result, `${row.uzman_id}|${row.magaza_id}|${productId}`, eligibleQuantity * unitRevenue);
  }
  return result;
}

async function reconcileMayExcel(filePath) {
  const buffer = fs.readFileSync(filePath);
  const [periodResult] = await pool.query(`
    INSERT INTO donem (yil,ay,ad,durum) VALUES (2026,5,'Mayıs 2026','acik')
    ON DUPLICATE KEY UPDATE ad=VALUES(ad),durum='acik'
  `);
  const [[period]] = await pool.query("SELECT id FROM donem WHERE yil=2026 AND ay=5");
  const periodId = period.id || periodResult.insertId;
  const imports = {};
  imports.assignments = await importUzmanMagaza(buffer, periodId, path.basename(filePath));
  imports.zeops = await importZeops(buffer, periodId, path.basename(filePath));
  imports.sellout = await importSellout(buffer, periodId, path.basename(filePath));
  imports.targets = await importHedef(buffer, periodId, path.basename(filePath));
  imports.rankings = await importSiralama(buffer, periodId, path.basename(filePath));
  for (const [name, result] of Object.entries(imports)) {
    if (result.hata) throw new Error(`${name}: ${result.hata}`);
  }

  const conn = await pool.getConnection();
  try {
    const legacy = await legacyProjection(conn, periodId);
    const calculation = await hesapla(periodId);
    const [newRows] = await conn.query(`
      SELECT uzman_id,magaza_id,urun_id,SUM(prime_esas_tutar) AS amount
      FROM prim_hesap_satir WHERE donem_id=? AND urun_id IS NOT NULL
      GROUP BY uzman_id,magaza_id,urun_id
    `, [periodId]);
    const current = new Map(newRows.map((row) => [
      `${row.uzman_id}|${row.magaza_id}|${row.urun_id}`,
      Number(row.amount),
    ]));
    const keys = new Set([...legacy.keys(), ...current.keys()]);
    const differences = [...keys].map((key) => ({
      key,
      legacy: legacy.get(key) || 0,
      normalized: current.get(key) || 0,
      delta: +((current.get(key) || 0) - (legacy.get(key) || 0)).toFixed(2),
    })).filter((row) => Math.abs(row.delta) >= 0.01)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const productIds = [...new Set(differences.map((row) => Number(row.key.split("|")[2])))];
    const [products] = productIds.length
      ? await conn.query("SELECT id,uniq_kod,marka,urun_adi,durum FROM urun WHERE id IN (?)", [productIds])
      : [[]];
    const productMap = new Map(products.map((product) => [Number(product.id), product]));
    for (const difference of differences) {
      const productId = Number(difference.key.split("|")[2]);
      const product = productMap.get(productId);
      difference.product = product || null;
      difference.reason = product?.durum === "inceleme"
        ? "UNIQ'siz/geçici ürün primden bloke edildi"
        : difference.normalized === 0
          ? "Normalize resolver veya marka grubu eşleşmesi yok"
          : "Ürün birleştirme ya da sell-out tahsis anahtarı değişti";
    }
    const reasonSummary = {};
    for (const difference of differences) {
      if (!reasonSummary[difference.reason]) reasonSummary[difference.reason] = { groups: 0, delta: 0 };
      reasonSummary[difference.reason].groups++;
      reasonSummary[difference.reason].delta = +(reasonSummary[difference.reason].delta + difference.delta).toFixed(2);
    }
    const [unmatched] = await conn.query(`
      SELECT source,eslesme_durum,COUNT(*) AS rows_count,SUM(adet) AS quantity
      FROM (
        SELECT 'zeops' AS source,eslesme_durum,adet FROM satis_beyan WHERE donem_id=?
        UNION ALL
        SELECT 'sellout',eslesme_durum,adet FROM sellout WHERE donem_id=?
      ) facts
      WHERE eslesme_durum<>'ok'
      GROUP BY source,eslesme_durum
      ORDER BY source,rows_count DESC
    `, [periodId, periodId]);
    return {
      periodId,
      imports,
      calculation,
      legacyProductGroups: legacy.size,
      normalizedProductGroups: current.size,
      differingProductGroups: differences.length,
      totalPrimeBaseDelta: +differences.reduce((sum, row) => sum + row.delta, 0).toFixed(2),
      differenceReasons: reasonSummary,
      topDifferences: differences.slice(0, 50),
      unmatched,
    };
  } finally {
    conn.release();
  }
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Excel dosya yolu zorunlu");
  try {
    console.log(JSON.stringify(await reconcileMayExcel(filePath), null, 2));
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Mayıs mutabakatı başarısız:", error);
    process.exit(1);
  });
}

module.exports = { legacyProjection, reconcileMayExcel };
