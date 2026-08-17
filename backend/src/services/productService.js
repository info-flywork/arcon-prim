const pool = require("../db");
const { relinkDonemBeyan } = require("./beyanRelink");

const INVALID_VALUES = new Set(["", "0", "0,00", "#N/A", "N/A", "TBC", "-", "NULL"]);

class ProductConflictError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = "ProductConflictError";
    this.status = 409;
    this.detail = detail;
  }
}

function cleanRaw(value) {
  if (value === null || value === undefined) return "";
  return String(value).normalize("NFKC").replace(/\p{Cf}/gu, "").trim();
}

function normalizeCode(value) {
  const raw = cleanRaw(value);
  if (!raw) return null;
  const normalized = raw.toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
  return INVALID_VALUES.has(normalized) ? null : normalized;
}

function normalizeBarcode(value) {
  const raw = cleanRaw(value);
  if (!raw || /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(raw)) return null;
  const normalized = raw.replace(/\D/g, "");
  if (!normalized || normalized === "0") return null;
  return normalized;
}

function normalizeCanonicalCode(value) {
  return normalizeCode(value);
}

function identityCandidates({ barcode, reference, stockCode } = {}) {
  const result = [];
  const add = (tip, raw, normalized, method) => {
    if (!normalized) return;
    const key = `${tip}|${normalized}`;
    if (!result.some((item) => item.key === key)) {
      result.push({ key, tip, raw: cleanRaw(raw), normalized, method });
    }
  };

  const barcodeNormalized = normalizeBarcode(barcode);
  if (barcodeNormalized) {
    add("barkod", barcode, barcodeNormalized, "barkod");
  } else if (cleanRaw(barcode)) {
    add("stok_kodu", barcode, normalizeCode(barcode), "barkod_alfanumerik");
  }

  if (cleanRaw(reference)) {
    const normalized = normalizeCode(reference);
    add("referans", reference, normalized, "referans");
    add("stok_kodu", reference, normalized, "referans_stok_kodu");
  }
  if (cleanRaw(stockCode)) {
    add("stok_kodu", stockCode, normalizeCode(stockCode), "stok_kodu");
  }
  return result;
}

async function loadProductResolver(conn = pool) {
  // inceleme ürünleri de eşleşsin: aksi halde Rabanne set gibi stokta olan
  // ürünler urun_id=null kalıp yanlışlıkla "Atama yok / Grup Dışı" görünüyor.
  const [rows] = await conn.query(`
    SELECT k.id AS identifier_id, k.urun_id, k.tip, k.deger_normalize,
           u.uniq_kod, u.marka, u.urun_adi, u.aks, u.durum
    FROM urun_kimlik k
    JOIN urun u ON u.id=k.urun_id
    WHERE k.aktif=1 AND u.durum IN ('aktif','inceleme')
  `);
  const identifierMap = new Map();
  for (const row of rows) {
    const key = `${row.tip}|${row.deger_normalize}`;
    const existing = identifierMap.get(key);
    // Aynı kimlikte birden fazla ürün varsa aktif olanı tercih et
    if (!existing || (existing.durum !== "aktif" && row.durum === "aktif")) {
      identifierMap.set(key, row);
    }
  }
  return { identifierMap };
}

function resolveProduct(resolver, rawIdentifiers) {
  const candidates = identityCandidates(rawIdentifiers);
  if (!candidates.length) {
    return { status: "kimlik_gecersiz", candidates, matches: [] };
  }

  const matches = candidates
    .map((candidate) => {
      const found = resolver.identifierMap.get(candidate.key);
      return found ? { ...candidate, ...found } : null;
    })
    .filter(Boolean);
  const byProduct = new Map();
  for (const match of matches) {
    const id = Number(match.urun_id);
    if (!byProduct.has(id)) byProduct.set(id, match);
  }
  const productIds = [...byProduct.keys()];
  if (productIds.length > 1) {
    // Aktif varsa onu seç; yoksa çakışma
    const aktif = matches.find((m) => m.durum === "aktif");
    if (aktif && new Set(matches.filter((m) => m.durum === "aktif").map((m) => Number(m.urun_id))).size === 1) {
      return {
        status: "ok",
        candidates,
        matches,
        productId: aktif.urun_id,
        identifierId: aktif.identifier_id,
        method: aktif.method,
      };
    }
    return { status: "urun_cakisma", candidates, matches, productIds };
  }
  if (!productIds.length) return { status: "urun_yok", candidates, matches: [] };

  const selected = matches[0];
  return {
    status: "ok",
    candidates,
    matches,
    productId: selected.urun_id,
    identifierId: selected.identifier_id,
    method: selected.method,
  };
}

async function assertProductEditable(conn, productId) {
  const [[used]] = await conn.query(`
    SELECT COUNT(*) AS count_used
    FROM (
      SELECT sb.id
      FROM satis_beyan sb JOIN donem d ON d.id=sb.donem_id
      WHERE sb.urun_id=? AND d.durum='kapandi'
      UNION ALL
      SELECT so.id
      FROM sellout so JOIN donem d ON d.id=so.donem_id
      WHERE so.urun_id=? AND d.durum='kapandi'
    ) closed_usage
  `, [productId, productId]);
  if (Number(used.count_used) > 0) {
    throw new ProductConflictError("Ürün kapalı bir dönemde kullanılmış; geçmiş kayıtları değiştirecek işlem yapılamaz.");
  }
}

async function addIdentifier(conn, productId, { tip, deger, kaynak = "manuel" }) {
  if (!["barkod", "referans", "stok_kodu"].includes(tip)) {
    throw new Error("Geçersiz ürün kimlik tipi");
  }
  const normalized = tip === "barkod" ? normalizeBarcode(deger) : normalizeCode(deger);
  if (!normalized) throw new Error("Boş veya geçersiz ürün kimliği");

  const [[existing]] = await conn.query(
    "SELECT id, urun_id FROM urun_kimlik WHERE tip=? AND deger_normalize=?",
    [tip, normalized]
  );
  if (existing && Number(existing.urun_id) !== Number(productId)) {
    throw new ProductConflictError("Bu kimlik başka bir ürüne bağlı.", {
      tip, deger, normalized, existingProductId: existing.urun_id,
    });
  }
  if (existing) {
    await conn.query("UPDATE urun_kimlik SET aktif=1 WHERE id=?", [existing.id]);
    return existing.id;
  }
  const [result] = await conn.query(
    `INSERT INTO urun_kimlik (urun_id, tip, deger_ham, deger_normalize, kaynak)
     VALUES (?,?,?,?,?)`,
    [productId, tip, cleanRaw(deger), normalized, kaynak]
  );
  return result.insertId;
}

async function createProduct(data, connection = null) {
  const conn = connection || await pool.getConnection();
  const ownsConnection = !connection;
  try {
    if (ownsConnection) await conn.beginTransaction();
    const uniqCode = normalizeCanonicalCode(data.uniq_kod);
    if (!uniqCode) throw new Error("Geçerli uniq_kod zorunlu");
    if (!cleanRaw(data.marka) || !cleanRaw(data.urun_adi)) {
      throw new Error("marka ve urun_adi zorunlu");
    }
    const [result] = await conn.query(
      `INSERT INTO urun (uniq_kod, marka, urun_adi, aks, cinsiyet, durum)
       VALUES (?,?,?,?,?,?)`,
      [uniqCode, cleanRaw(data.marka), cleanRaw(data.urun_adi), cleanRaw(data.aks) || null,
        cleanRaw(data.cinsiyet) || null, data.durum || "aktif"]
    );
    for (const identifier of data.identifiers || []) {
      await addIdentifier(conn, result.insertId, identifier);
    }
    if (ownsConnection) await conn.commit();
    return result.insertId;
  } catch (error) {
    if (ownsConnection) await conn.rollback();
    throw error;
  } finally {
    if (ownsConnection) conn.release();
  }
}

async function withDbLockRetry(fn, maxAttempts = 5) {
  let last;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const lock =
        e.code === "ER_LOCK_WAIT_TIMEOUT" ||
        e.errno === 1205 ||
        e.code === "ER_LOCK_DEADLOCK" ||
        e.errno === 1213;
      if (!lock || attempt === maxAttempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1) + Math.random() * 200));
    }
  }
  throw last;
}

async function bulkUpdateFacts(conn, table, updates, opts = {}) {
  const batchSize = Math.max(10, Number(opts.batchSize) || 100);
  const commitEach = opts.commitEach === true;
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  for (let offset = 0; offset < updates.length; offset += batchSize) {
    const batch = updates.slice(offset, offset + batchSize);
    if (!batch.length) continue;
    const cases = () => batch.map(() => "WHEN ? THEN ?").join(" ");
    const ids = batch.map((row) => row.id);
    const values = (field) => batch.flatMap((row) => [row.id, row[field]]);
    await withDbLockRetry(() => conn.query(
      `UPDATE ${table} SET
         urun_id=CASE id ${cases()} END,
         urun_kimlik_id=CASE id ${cases()} END,
         eslesme_yontemi=CASE id ${cases()} END,
         eslesme_durum=CASE id ${cases()} END
       WHERE id IN (${ids.map(() => "?").join(",")})`,
      [
        ...values("productId"),
        ...values("identifierId"),
        ...values("method"),
        ...values("matchStatus"),
        ...ids,
      ]
    ));
    // Küçük batch sonrası commit → satır kilitleri uzun süre tutulmasın
    if (commitEach) {
      await conn.commit();
      await conn.beginTransaction();
    }
    onProgress?.({
      asama: "esleme",
      yapilan: Math.min(offset + batch.length, updates.length),
      toplam: updates.length,
      tablo: table,
    });
  }
}

function sameId(a, b) {
  if (a == null && b == null) return true;
  return Number(a) === Number(b);
}

async function remapPeriod(donemId, connection = null, opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const conn = connection || await pool.getConnection();
  const ownsConnection = !connection;
  try {
    // Tek mega-transaction tüm Zeops satırlarını kilitleyip timeout üretiyordu.
    // Kendi connection'ımızda kısa batch TX / autocommit kullanıyoruz.
    if (ownsConnection) {
      try {
        await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");
        await conn.query("SET SESSION innodb_lock_wait_timeout = 15");
      } catch {
        /* hosting kısıtlı olabilir */
      }
    }

    const [[period]] = await conn.query("SELECT durum FROM donem WHERE id=?", [donemId]);
    if (!period) throw new Error("Dönem bulunamadı");
    if (period.durum === "kapandi") throw new ProductConflictError("Kapalı dönem yeniden eşlenemez.");

    onProgress?.({ asama: "esleme", yapilan: 0, toplam: 1, adim: "atama" });

    if (ownsConnection) await conn.beginTransaction();
    // Uzman-mağaza Excel master'a sadık kal: Zeops'ta başka mağazada satış
    // görünce atama kopyalama KAPALI (Bozdağ Akasya + Marmara Forum bug'ı).
    const atamaEklenen = 0;
    await relinkDonemBeyan(conn, donemId);
    if (ownsConnection) await conn.commit();

    const resolver = await loadProductResolver(conn);
    const [assignmentRows] = await conn.query(
      "SELECT uzman_id,magaza_id FROM uzman_atama WHERE donem_id=?",
      [donemId]
    );
    const assignmentSet = new Set(assignmentRows.map((row) => `${row.uzman_id}|${row.magaza_id}`));
    const [claims] = await conn.query(
      `SELECT id, barkod, kod, magaza_id, uzman_id,
              urun_id, urun_kimlik_id, eslesme_yontemi, eslesme_durum
         FROM satis_beyan WHERE donem_id=?`,
      [donemId]
    );

    onProgress?.({ asama: "esleme", yapilan: 0, toplam: claims.length || 1, adim: "beyan", tablo: "satis_beyan" });

    const claimUpdates = [];
    for (const row of claims) {
      const match = resolveProduct(resolver, { barcode: row.barkod, reference: row.kod });
      const status = match.status === "ok"
        ? (!row.magaza_id
          ? "magaza_yok"
          : !row.uzman_id
            ? "uzman_yok"
            : !assignmentSet.has(`${row.uzman_id}|${row.magaza_id}`)
              ? "atama_yok"
              : "ok")
        : match.status;
      const productId = match.productId || null;
      const identifierId = match.identifierId || null;
      const method = match.method || null;
      // Değişmeyen satırları tekrar UPDATE etme (canlıda asıl yavaşlık buydu)
      if (
        sameId(productId, row.urun_id)
        && sameId(identifierId, row.urun_kimlik_id)
        && String(method || "") === String(row.eslesme_yontemi || "")
        && String(status || "") === String(row.eslesme_durum || "")
      ) {
        continue;
      }
      claimUpdates.push({
        id: row.id,
        productId,
        identifierId,
        method,
        matchStatus: status,
      });
    }

    if (ownsConnection && claimUpdates.length) await conn.beginTransaction();
    await bulkUpdateFacts(conn, "satis_beyan", claimUpdates, {
      batchSize: 100,
      commitEach: ownsConnection && claimUpdates.length > 0,
      onProgress,
    });
    if (ownsConnection && claimUpdates.length) {
      try { await conn.commit(); } catch { /* son batch commit etmiş olabilir */ }
    }

    const [sellouts] = await conn.query(
      `SELECT id, arcon_barkod, arcon_referans, magaza_id,
              urun_id, urun_kimlik_id, eslesme_yontemi, eslesme_durum
         FROM sellout WHERE donem_id=?`,
      [donemId]
    );
    onProgress?.({ asama: "esleme", yapilan: 0, toplam: sellouts.length || 1, adim: "sellout", tablo: "sellout" });

    const selloutUpdates = [];
    for (const row of sellouts) {
      const match = resolveProduct(resolver, { barcode: row.arcon_barkod, reference: row.arcon_referans });
      const matchStatus = match.status === "ok" && !row.magaza_id ? "magaza_yok" : match.status;
      const productId = match.productId || null;
      const identifierId = match.identifierId || null;
      const method = match.method || null;
      if (
        sameId(productId, row.urun_id)
        && sameId(identifierId, row.urun_kimlik_id)
        && String(method || "") === String(row.eslesme_yontemi || "")
        && String(matchStatus || "") === String(row.eslesme_durum || "")
      ) {
        continue;
      }
      selloutUpdates.push({
        id: row.id,
        productId,
        identifierId,
        method,
        matchStatus,
      });
    }

    if (ownsConnection && selloutUpdates.length) await conn.beginTransaction();
    await bulkUpdateFacts(conn, "sellout", selloutUpdates, {
      batchSize: 100,
      commitEach: ownsConnection && selloutUpdates.length > 0,
      onProgress,
    });
    if (ownsConnection && selloutUpdates.length) {
      try { await conn.commit(); } catch { /* ignore */ }
    }

    return {
      claims: claims.length,
      sellouts: sellouts.length,
      claimGuncellenen: claimUpdates.length,
      selloutGuncellenen: selloutUpdates.length,
      claimUnmatched: claimUpdates.filter((row) => row.matchStatus !== "ok").length,
      selloutUnmatched: selloutUpdates.filter((row) => row.matchStatus !== "ok").length,
      atamaEklenen,
      claimOk: claims.length - claimUpdates.filter((row) => row.matchStatus !== "ok").length,
      selloutOk: sellouts.length - selloutUpdates.filter((row) => row.matchStatus !== "ok").length,
    };
  } catch (error) {
    if (ownsConnection) {
      try { await conn.rollback(); } catch { /* ignore */ }
    }
    throw error;
  } finally {
    if (ownsConnection) conn.release();
  }
}

/** Zeops’ta satışı görünen uzman-mağaza için master’da atama yoksa, uzmanın mevcut senaryosunu kopyala. */
async function tamamlaEksikAtamalar(conn, donemId) {
  const [eksik] = await conn.query(
    `SELECT DISTINCT b.uzman_id, b.magaza_id
     FROM satis_beyan b
     WHERE b.donem_id=? AND b.uzman_id IS NOT NULL AND b.magaza_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM uzman_atama a
         WHERE a.donem_id=b.donem_id AND a.uzman_id=b.uzman_id AND a.magaza_id=b.magaza_id
       )
       AND EXISTS (
         SELECT 1 FROM uzman_atama a2
         WHERE a2.donem_id=b.donem_id AND a2.uzman_id=b.uzman_id
       )`,
    [donemId]
  );
  let eklenen = 0;
  for (const row of eksik) {
    const [[kaynak]] = await conn.query(
      `SELECT bolum_id, grup_adi, pay_orani FROM uzman_atama
       WHERE donem_id=? AND uzman_id=? ORDER BY id LIMIT 1`,
      [donemId, row.uzman_id]
    );
    if (!kaynak) continue;
    await conn.query(
      `INSERT INTO uzman_atama (donem_id, uzman_id, magaza_id, bolum_id, grup_adi, pay_orani)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE pay_orani=VALUES(pay_orani)`,
      [donemId, row.uzman_id, row.magaza_id, kaynak.bolum_id, kaynak.grup_adi || null, kaynak.pay_orani]
    );
    eklenen += 1;
  }
  return eklenen;
}

async function mergeProducts(sourceProductId, targetProductId) {
  if (Number(sourceProductId) === Number(targetProductId)) throw new Error("Aynı ürün birleştirilemez");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await assertProductEditable(conn, sourceProductId);
    const [[source]] = await conn.query("SELECT * FROM urun WHERE id=? FOR UPDATE", [sourceProductId]);
    const [[target]] = await conn.query("SELECT * FROM urun WHERE id=? FOR UPDATE", [targetProductId]);
    if (!source || !target) throw new Error("Kaynak veya hedef ürün bulunamadı");

    const [identifiers] = await conn.query("SELECT * FROM urun_kimlik WHERE urun_id=?", [sourceProductId]);
    if (identifiers.length) {
      await conn.query(
        "UPDATE urun_kimlik SET urun_id=?, kaynak='birlesim' WHERE urun_id=?",
        [targetProductId, sourceProductId]
      );
    }
    for (const table of ["satis_beyan", "sellout", "prim_hesap_satir"]) {
      await conn.query(`UPDATE ${table} SET urun_id=? WHERE urun_id=?`, [targetProductId, sourceProductId]);
    }
    await conn.query("UPDATE urun_legacy_map SET urun_id=? WHERE urun_id=?", [targetProductId, sourceProductId]);
    await conn.query(
      "UPDATE urun SET durum='pasif', birlesilen_urun_id=? WHERE id=?",
      [targetProductId, sourceProductId]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  INVALID_VALUES,
  ProductConflictError,
  cleanRaw,
  normalizeCode,
  normalizeBarcode,
  normalizeCanonicalCode,
  identityCandidates,
  loadProductResolver,
  resolveProduct,
  assertProductEditable,
  addIdentifier,
  createProduct,
  remapPeriod,
  tamamlaEksikAtamalar,
  mergeProducts,
};
