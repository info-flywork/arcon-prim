const {
  cleanRaw,
  normalizeCode,
  normalizeBarcode,
  normalizeCanonicalCode,
  identityCandidates,
  loadProductResolver,
  resolveProduct,
} = require("../src/services/productService");

function metadataScore(row) {
  return [
    row.marka, row.stok_marka, row.uniq_urun_adi, row.stok_list_uniq_adi,
    row.urun_adi, row.stok_adi, row.aks, row.cinsiyet,
  ].filter((value) => cleanRaw(value)).length;
}

function bestMetadata(rows) {
  return [...rows].sort((a, b) => metadataScore(b) - metadataScore(a) || a.id - b.id)[0];
}

function identifierSources(row) {
  const result = [];
  const add = (tip, raw, normalized, source) => {
    if (normalized) result.push({ tip, raw: cleanRaw(raw), normalized, source, legacyId: row.id });
  };
  for (const [raw, source] of [[row.barkod, "barkod"], [row.stok_barkod_1, "stok_barkod_1"]]) {
    const barcode = normalizeBarcode(raw);
    if (barcode) add("barkod", raw, barcode, source);
    else if (cleanRaw(raw)) add("stok_kodu", raw, normalizeCode(raw), source);
  }
  add("referans", row.referans, normalizeCode(row.referans), "referans");
  add("stok_kodu", row.stok_kodu, normalizeCode(row.stok_kodu), "stok_kodu");
  return result;
}

async function productIdByCode(conn, uniqCode) {
  const [[row]] = await conn.query("SELECT id FROM urun WHERE uniq_kod=?", [uniqCode]);
  return row.id;
}

async function backfillFactMatches(conn, table, rows, resolver) {
  const updates = rows.map((row) => {
    const match = resolveProduct(resolver, {
      barcode: row.barcode_value,
      reference: row.reference_value,
      stockCode: row.stock_code_value,
    });
    const productId = match.status === "ok" ? match.productId : row.mapped_product_id;
    const currentStatus = row.current_status;
    let status = match.status;
    if (match.status === "ok" && currentStatus && !["urun_yok", "urun_cakisma", "kimlik_gecersiz"].includes(currentStatus)) {
      status = currentStatus;
    }
    return {
      id: row.id,
      productId: productId || null,
      identifierId: match.status === "ok" ? match.identifierId : null,
      method: match.status === "ok" ? match.method : null,
      status,
    };
  });

  for (let offset = 0; offset < updates.length; offset += 400) {
    const batch = updates.slice(offset, offset + 400);
    const ids = batch.map((row) => row.id);
    const cases = () => batch.map(() => "WHEN ? THEN ?").join(" ");
    const values = (field) => batch.flatMap((row) => [row.id, row[field]]);
    await conn.query(
      `UPDATE ${table} SET
         urun_id=CASE id ${cases()} END,
         urun_kimlik_id=CASE id ${cases()} END,
         eslesme_yontemi=CASE id ${cases()} END,
         eslesme_durum=CASE id ${cases()} END
       WHERE id IN (${ids.map(() => "?").join(",")})`,
      [...values("productId"), ...values("identifierId"), ...values("method"), ...values("status"), ...ids]
    );
  }
}

async function up(conn) {
  const [legacyRows] = await conn.query("SELECT * FROM uniq_kod ORDER BY id");
  await conn.beginTransaction();
  try {
    const groups = new Map();
    const assignment = new Map();
    const uniqColumnConflicts = [];

    for (const row of legacyRows) {
      const primaryCode = normalizeCanonicalCode(row.uniq_kod);
      const stockCode = normalizeCanonicalCode(row.stok_list_uniq_kod);
      let canonicalCode;
      let reason;
      if (primaryCode && stockCode && primaryCode !== stockCode) {
        canonicalCode = `LEGACY-${row.id}`;
        reason = "uniq_kolon_cakismasi";
        uniqColumnConflicts.push({ row, primaryCode, stockCode });
      } else if (primaryCode || stockCode) {
        canonicalCode = primaryCode || stockCode;
        reason = primaryCode ? "uniq_kod" : "stok_list_uniq_kod";
      } else {
        canonicalCode = `LEGACY-${row.id}`;
        reason = "gecici_urun";
      }
      if (!groups.has(canonicalCode)) groups.set(canonicalCode, []);
      groups.get(canonicalCode).push(row);
      assignment.set(row.id, { canonicalCode, reason });
    }

    const productIds = new Map();
    for (const [canonicalCode, rows] of groups) {
      const best = bestMetadata(rows);
      const review = canonicalCode.startsWith("LEGACY-");
      await conn.query(
        `INSERT INTO urun (uniq_kod, marka, urun_adi, aks, cinsiyet, durum)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           marka=VALUES(marka), urun_adi=VALUES(urun_adi),
           aks=COALESCE(VALUES(aks),aks), cinsiyet=COALESCE(VALUES(cinsiyet),cinsiyet),
           durum=IF(durum='pasif',durum,VALUES(durum))`,
        [
          canonicalCode,
          cleanRaw(best.marka || best.stok_marka) || "Bilinmiyor",
          cleanRaw(best.uniq_urun_adi || best.stok_list_uniq_adi || best.urun_adi || best.stok_adi) || `İncelenecek ürün ${best.id}`,
          cleanRaw(best.aks) || null,
          cleanRaw(best.cinsiyet) || null,
          review ? "inceleme" : "aktif",
        ]
      );
      productIds.set(canonicalCode, await productIdByCode(conn, canonicalCode));
    }

    for (const row of legacyRows) {
      const item = assignment.get(row.id);
      const productId = productIds.get(item.canonicalCode);
      assignment.set(row.id, { ...item, productId });
      await conn.query(
        `INSERT INTO urun_legacy_map (legacy_uniq_kod_id, urun_id, esleme_nedeni)
         VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE urun_id=VALUES(urun_id), esleme_nedeni=VALUES(esleme_nedeni)`,
        [row.id, productId, item.reason]
      );
    }

    for (const conflict of uniqColumnConflicts) {
      const productId = assignment.get(conflict.row.id).productId;
      const normalized = `LEGACY-${conflict.row.id}-UNIQ`;
      await conn.query(
        `INSERT INTO urun_esleme_cakisma
           (tip,deger_ham,deger_normalize,kaynak,aday_urunler_json)
         VALUES ('uniq_kod',?,?,?,?)
         ON DUPLICATE KEY UPDATE
           deger_ham=VALUES(deger_ham), aday_urunler_json=VALUES(aday_urunler_json), durum='acik'`,
        [
          `${conflict.primaryCode} <> ${conflict.stockCode}`,
          normalized,
          `uniq_kod:${conflict.row.id}`,
          JSON.stringify([{ productId, primaryCode: conflict.primaryCode, stockCode: conflict.stockCode }]),
        ]
      );
    }

    const candidates = new Map();
    for (const row of legacyRows) {
      const assigned = assignment.get(row.id);
      if (assigned.canonicalCode.startsWith("LEGACY-")) continue;
      for (const identifier of identifierSources(row)) {
        const key = `${identifier.tip}|${identifier.normalized}`;
        if (!candidates.has(key)) candidates.set(key, new Map());
        const byProduct = candidates.get(key);
        if (!byProduct.has(assigned.productId)) byProduct.set(assigned.productId, []);
        byProduct.get(assigned.productId).push(identifier);
      }
    }

    for (const [key, byProduct] of candidates) {
      const [tip, normalized] = key.split("|");
      const allSources = [...byProduct.values()].flat();
      if (byProduct.size > 1) {
        await conn.query(
          `INSERT INTO urun_esleme_cakisma
             (tip,deger_ham,deger_normalize,kaynak,aday_urunler_json)
           VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             deger_ham=VALUES(deger_ham), kaynak=VALUES(kaynak),
             aday_urunler_json=VALUES(aday_urunler_json), durum='acik'`,
          [
            tip,
            allSources[0].raw,
            normalized,
            "legacy_backfill",
            JSON.stringify([...byProduct.entries()].map(([productId, sources]) => ({
              productId,
              legacyIds: [...new Set(sources.map((source) => source.legacyId))],
            }))),
          ]
        );
        continue;
      }
      const [[productId, sources]] = [...byProduct.entries()];
      await conn.query(
        `INSERT INTO urun_kimlik
           (urun_id,tip,deger_ham,deger_normalize,kaynak)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           deger_ham=VALUES(deger_ham), kaynak=VALUES(kaynak)`,
        [productId, tip, sources[0].raw, normalized, `legacy:${sources[0].source}`]
      );
    }

    await conn.query(`
      UPDATE prim_hesap_satir h
      LEFT JOIN urun_legacy_map lm ON lm.legacy_uniq_kod_id=h.uniq_kod_id
      SET h.urun_id=lm.urun_id
    `);

    const resolver = await loadProductResolver(conn);
    const [claimRows] = await conn.query(`
      SELECT sb.id, sb.barkod AS barcode_value, sb.kod AS reference_value,
             NULL AS stock_code_value, sb.eslesme_durum AS current_status,
             lm.urun_id AS mapped_product_id
      FROM satis_beyan sb
      LEFT JOIN urun_legacy_map lm ON lm.legacy_uniq_kod_id=sb.uniq_kod_id
    `);
    await backfillFactMatches(conn, "satis_beyan", claimRows, resolver);

    const [selloutRows] = await conn.query(`
      SELECT so.id, so.arcon_barkod AS barcode_value, so.arcon_referans AS reference_value,
             NULL AS stock_code_value, so.eslesme_durum AS current_status,
             lm.urun_id AS mapped_product_id
      FROM sellout so
      LEFT JOIN urun_legacy_map lm ON lm.legacy_uniq_kod_id=so.uniq_kod_id
    `);
    await backfillFactMatches(conn, "sellout", selloutRows, resolver);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}

module.exports = { up, identifierSources, metadataScore };
