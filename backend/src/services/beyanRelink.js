// Zeops, uzman-mağaza dosyasından önce yüklenince uzman_id / magaza_id boş kalır.
const { resolveUzmanId, normalizeStore, resolveStoreId } = require("../util");

async function loadMagazaMap(conn) {
  const [stores] = await conn.query("SELECT id, prim_magaza FROM magaza");
  const [aliases] = await conn.query("SELECT alias, magaza_id FROM magaza_alias");
  const map = new Map();
  for (const s of stores) map.set(normalizeStore(s.prim_magaza), s.id);
  for (const a of aliases) {
    map.set(normalizeStore(a.alias) || String(a.alias || "").trim(), a.magaza_id);
  }
  return map;
}

async function relinkBeyanMagaza(conn, donemId) {
  const map = await loadMagazaMap(conn);
  const [beyan] = await conn.query(
    `SELECT id, magaza_ham FROM satis_beyan
      WHERE donem_id=? AND magaza_id IS NULL
        AND magaza_ham IS NOT NULL AND TRIM(magaza_ham)<>''`,
    [donemId]
  );
  const byMag = new Map();
  for (const row of beyan) {
    const mid = resolveStoreId(map, row.magaza_ham);
    if (!mid) continue;
    if (!byMag.has(mid)) byMag.set(mid, []);
    byMag.get(mid).push(row.id);
  }
  let beyanBaglanan = 0;
  for (const [mid, ids] of byMag) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await conn.query(
        `UPDATE satis_beyan SET magaza_id=? WHERE id IN (${chunk.map(() => "?").join(",")})`,
        [mid, ...chunk]
      );
    }
    beyanBaglanan += ids.length;
  }

  const [so] = await conn.query(
    `SELECT id, magaza_ham FROM sellout
      WHERE donem_id=? AND magaza_id IS NULL
        AND magaza_ham IS NOT NULL AND TRIM(magaza_ham)<>''`,
    [donemId]
  );
  const soByMag = new Map();
  for (const row of so) {
    const mid = resolveStoreId(map, row.magaza_ham);
    if (!mid) continue;
    if (!soByMag.has(mid)) soByMag.set(mid, []);
    soByMag.get(mid).push(row.id);
  }
  let selloutBaglanan = 0;
  for (const [mid, ids] of soByMag) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await conn.query(
        `UPDATE sellout SET magaza_id=? WHERE id IN (${chunk.map(() => "?").join(",")})`,
        [mid, ...chunk]
      );
    }
    selloutBaglanan += ids.length;
  }
  return { beyanBaglanan, selloutBaglanan };
}

async function relinkBeyanUzman(conn, donemId) {
  const [uzmanlar] = await conn.query("SELECT id, normal_ad FROM uzman");
  const uzmanMap = new Map(uzmanlar.map((u) => [u.normal_ad, u.id]));
  const [rows] = await conn.query(
    `SELECT id, uzman_ham, magaza_id, urun_id, eslesme_durum
       FROM satis_beyan
      WHERE donem_id=? AND uzman_id IS NULL
        AND uzman_ham IS NOT NULL AND TRIM(uzman_ham)<>''`,
    [donemId]
  );
  if (!rows.length) return { baglanan: 0 };

  const [assignmentRows] = await conn.query(
    "SELECT uzman_id, magaza_id FROM uzman_atama WHERE donem_id=?",
    [donemId]
  );
  const assignmentSet = new Set(assignmentRows.map((r) => `${r.uzman_id}|${r.magaza_id}`));

  const byUzman = new Map();
  const eslesmeByDurum = new Map();
  for (const row of rows) {
    const uid = resolveUzmanId(uzmanMap, row.uzman_ham);
    if (!uid) continue;
    if (!byUzman.has(uid)) byUzman.set(uid, []);
    byUzman.get(uid).push(row.id);

    let durum = row.eslesme_durum;
    if (!durum || durum === "uzman_yok" || durum === "atama_yok" || durum === "magaza_yok") {
      if (!row.magaza_id) durum = "magaza_yok";
      else if (!assignmentSet.has(`${uid}|${row.magaza_id}`)) durum = "atama_yok";
      else if (!row.urun_id) durum = "urun_yok";
      else durum = "ok";
    }
    if (durum && durum !== row.eslesme_durum) {
      if (!eslesmeByDurum.has(durum)) eslesmeByDurum.set(durum, []);
      eslesmeByDurum.get(durum).push(row.id);
    }
  }

  let baglanan = 0;
  for (const [uid, ids] of byUzman) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await conn.query(
        `UPDATE satis_beyan SET uzman_id=? WHERE id IN (${chunk.map(() => "?").join(",")})`,
        [uid, ...chunk]
      );
    }
    baglanan += ids.length;
  }
  for (const [durum, ids] of eslesmeByDurum) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await conn.query(
        `UPDATE satis_beyan SET eslesme_durum=? WHERE id IN (${chunk.map(() => "?").join(",")})`,
        [durum, ...chunk]
      );
    }
  }
  return { baglanan };
}

async function relinkBeyanUrun(conn, donemId) {
  const { loadProductResolver, resolveProductWithBridge } = require("./productService");
  const { loadUniqBridge } = require("./uniqBridge");
  const resolver = await loadProductResolver(conn);
  const uniqBridge = await loadUniqBridge(conn);
  const [assignmentRows] = await conn.query(
    "SELECT uzman_id, magaza_id FROM uzman_atama WHERE donem_id=?",
    [donemId]
  );
  const assignmentSet = new Set(assignmentRows.map((r) => `${r.uzman_id}|${r.magaza_id}`));

  const [rows] = await conn.query(
    `SELECT id, barkod, kod, magaza_id, uzman_id, urun_id, urun_kimlik_id,
            eslesme_yontemi, eslesme_durum
       FROM satis_beyan
      WHERE donem_id=? AND (urun_id IS NULL OR eslesme_durum IN ('urun_yok','urun_cakisma'))`,
    [donemId]
  );
  if (!rows.length) return { baglanan: 0 };

  let baglanan = 0;
  for (const row of rows) {
    const match = await resolveProductWithBridge(
      conn, resolver, { barcode: row.barkod, reference: row.kod }, uniqBridge,
    );
    if (match.status !== "ok") continue;
    let eslesme = "ok";
    if (!row.magaza_id) eslesme = "magaza_yok";
    else if (!row.uzman_id) eslesme = "uzman_yok";
    else if (!assignmentSet.has(`${row.uzman_id}|${row.magaza_id}`)) eslesme = "atama_yok";

    await conn.query(
      `UPDATE satis_beyan SET urun_id=?, urun_kimlik_id=?, eslesme_yontemi=?, eslesme_durum=?
       WHERE id=?`,
      [match.productId, match.identifierId || null, match.method || null, eslesme, row.id]
    );
    baglanan++;
  }
  return { baglanan };
}

async function relinkDonemBeyan(conn, donemId) {
  const mag = await relinkBeyanMagaza(conn, donemId);
  const uz = await relinkBeyanUzman(conn, donemId);
  const ur = await relinkBeyanUrun(conn, donemId);
  return { baglanan: uz.baglanan, urunBaglanan: ur.baglanan, ...mag };
}

module.exports = { relinkBeyanUzman, relinkBeyanMagaza, relinkBeyanUrun, relinkDonemBeyan };
