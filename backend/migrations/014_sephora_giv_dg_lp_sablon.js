/**
 * Birol mail şablonları (Eylül revize):
 * - SEPHORA GIVENCHY / SEPHORA DOLCE&GABBANA
 *   satış %1 + makyaj ilk2 %1 / ilk5 %0,5 + parfüm ilk10 %0,5 + kümül ilk8 %0,5 = %3,5
 * - SEPHORA LA PRAIRIE
 *   satış %2 + cilt 1 %1,5 / 2 %1 / 3 %0,5 (1. olursa toplam %3,5)
 *
 * Saf Givenchy / Dolce&Gabbana / La Prairie atamaları Sephora'da yeni bölüme taşınır.
 */
async function up(conn) {
  async function ensureBolum(row) {
    const [[varMi]] = await conn.query(
      "SELECT id FROM prim_bolum WHERE bolum_key=? LIMIT 1",
      [row.bolum_key]
    );
    if (varMi) return varMi.id;
    const [ins] = await conn.query(
      `INSERT INTO prim_bolum
       (bolum_key, bolum_adi, kanal, alt_kanal, uzman_tipi, marka_grubu_key, marka_grubu_adi,
        markalar, max_prim_oran, grup_toplam_oran, onay_tarihi, aktif, sira)
       VALUES (?,?,?,?,?,?,?,?,?,?,CURDATE(),1,?)`,
      [
        row.bolum_key, row.bolum_adi, row.kanal, row.alt_kanal, row.uzman_tipi,
        row.marka_grubu_key, row.marka_grubu_adi, JSON.stringify(row.markalar),
        row.max_prim_oran, row.grup_toplam_oran, row.sira,
      ]
    );
    return ins.insertId;
  }

  async function ensureKural(bolumId, row) {
    const [[varMi]] = await conn.query(
      "SELECT id FROM prim_kural WHERE bolum_id=? AND kural_key=? LIMIT 1",
      [bolumId, row.kural_key]
    );
    if (varMi) {
      await conn.query(
        `UPDATE prim_kural SET kriter_key=?, kriter_adi=?, prim_oran=?, prim_tip=?, prim_tutar=?,
         satir_tipi=?, sira=? WHERE id=?`,
        [row.kriter_key, row.kriter_adi, row.prim_oran, row.prim_tip || "yuzde",
          row.prim_tutar || 0, row.satir_tipi || "kural", row.sira, varMi.id]
      );
      return varMi.id;
    }
    const [ins] = await conn.query(
      `INSERT INTO prim_kural
       (bolum_id, kriter_key, kural_key, kriter_adi, prim_oran, prim_tip, prim_tutar, satir_tipi, not_metni, sira)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        bolumId, row.kriter_key, row.kural_key, row.kriter_adi, row.prim_oran,
        row.prim_tip || "yuzde", row.prim_tutar || 0, row.satir_tipi || "kural",
        row.not_metni || null, row.sira,
      ]
    );
    return ins.insertId;
  }

  async function ensureHedef(kuralId, hedefSira) {
    const [[varMi]] = await conn.query(
      "SELECT id FROM prim_kural_hedef WHERE kural_id=? AND hedef_sira=? LIMIT 1",
      [kuralId, hedefSira]
    );
    if (varMi) return;
    await conn.query(
      `INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
       VALUES (?, 'sira', ?, NULL, 1)`,
      [kuralId, hedefSira]
    );
  }

  const givDgKurallar = [
    { kriter_key: "satis_basi", kural_key: "satis_basi", kriter_adi: "SATILAN ÜRÜN BAŞINA", prim_oran: 1, sira: 1 },
    { kriter_key: "makyaj_siralama", kural_key: "makyaj_ilk_2", kriter_adi: "MAKYAJ İLK 2", prim_oran: 1, sira: 2, hedef: 2 },
    { kriter_key: "makyaj_siralama", kural_key: "makyaj_ilk_5", kriter_adi: "MAKYAJ İLK 5", prim_oran: 0.5, sira: 3, hedef: 5 },
    { kriter_key: "parfum_siralama", kural_key: "parfum_ilk_10", kriter_adi: "PARFÜM İLK 10", prim_oran: 0.5, sira: 4, hedef: 10 },
    { kriter_key: "kumul_siralama", kural_key: "kumul_ilk_8", kriter_adi: "KÜMÜL İLK 8 OLURSA", prim_oran: 0.5, sira: 5, hedef: 8,
      not_metni: "Makyaj ilk 2 olursa toplam %3,5; yalnızca ilk 5 olursa %3" },
    { kriter_key: "grup_toplam", kural_key: "grup_toplam", kriter_adi: "Toplam", prim_oran: 3.5, sira: 6, satir_tipi: "grup_toplam" },
  ];

  const lpKurallar = [
    { kriter_key: "satis_basi", kural_key: "satis_basi", kriter_adi: "SATILAN ÜRÜN BAŞINA", prim_oran: 2, sira: 1 },
    { kriter_key: "cilt_siralama", kural_key: "cilt_ilk_1", kriter_adi: "CİLT BAKIMINDA 1. OLURSA", prim_oran: 1.5, sira: 2, hedef: 1 },
    { kriter_key: "cilt_siralama", kural_key: "cilt_ilk_2", kriter_adi: "CİLT BAKIMINDA 2. OLURSA", prim_oran: 1, sira: 3, hedef: 2 },
    { kriter_key: "cilt_siralama", kural_key: "cilt_ilk_3", kriter_adi: "CİLT BAKIMINDA 3. OLURSA", prim_oran: 0.5, sira: 4, hedef: 3 },
    { kriter_key: "grup_toplam", kural_key: "grup_toplam", kriter_adi: "Toplam", prim_oran: 3.5, sira: 5, satir_tipi: "grup_toplam",
      not_metni: "Sıralama 1. olursa toplam %3,5" },
  ];

  const givId = await ensureBolum({
    bolum_key: "sephora_givenchy",
    bolum_adi: "SEPHORA GIVENCHY",
    kanal: "SEPHORA",
    alt_kanal: null,
    uzman_tipi: null,
    marka_grubu_key: "sephora_givenchy",
    marka_grubu_adi: "SEPHORA GIVENCHY",
    markalar: ["GIV"],
    max_prim_oran: 3.5,
    grup_toplam_oran: 3.5,
    sira: 24,
  });
  const dgId = await ensureBolum({
    bolum_key: "sephora_dg",
    bolum_adi: "SEPHORA DOLCE&GABBANA",
    kanal: "SEPHORA",
    alt_kanal: null,
    uzman_tipi: null,
    marka_grubu_key: "sephora_dg",
    marka_grubu_adi: "SEPHORA DOLCE&GABBANA",
    markalar: ["DG"],
    max_prim_oran: 3.5,
    grup_toplam_oran: 3.5,
    sira: 25,
  });
  const lpId = await ensureBolum({
    bolum_key: "sephora_la_prairie",
    bolum_adi: "SEPHORA LA PRAIRIE",
    kanal: "SEPHORA",
    alt_kanal: null,
    uzman_tipi: null,
    marka_grubu_key: "sephora_la_prairie",
    marka_grubu_adi: "SEPHORA LA PRAIRIE",
    markalar: ["LP"],
    max_prim_oran: 3.5,
    grup_toplam_oran: 3.5,
    sira: 26,
  });

  for (const [bolumId, liste] of [[givId, givDgKurallar], [dgId, givDgKurallar]]) {
    for (const row of liste) {
      const kid = await ensureKural(bolumId, {
        ...row,
        kural_key: `${row.kural_key}_${bolumId}`,
      });
      if (row.hedef) await ensureHedef(kid, row.hedef);
    }
  }
  for (const row of lpKurallar) {
    const kid = await ensureKural(lpId, {
      ...row,
      kural_key: `${row.kural_key}_${lpId}`,
    });
    if (row.hedef) await ensureHedef(kid, row.hedef);
  }

  // Eylül (ve açık dönemler): saf marka atamalarını yeni bölüme taşı (Sephora)
  await conn.query(
    `UPDATE uzman_atama a
     JOIN magaza m ON m.id = a.magaza_id
     JOIN donem d ON d.id = a.donem_id
     SET a.bolum_id = ?
     WHERE UPPER(TRIM(m.bayi)) LIKE '%SEPHORA%'
       AND d.durum IN ('acik','hesaplandi')
       AND TRIM(a.grup_adi) IN ('Givenchy', 'GIVENCHY', 'Givenchy ')`,
    [givId]
  );
  await conn.query(
    `UPDATE uzman_atama a
     JOIN magaza m ON m.id = a.magaza_id
     JOIN donem d ON d.id = a.donem_id
     SET a.bolum_id = ?
     WHERE UPPER(TRIM(m.bayi)) LIKE '%SEPHORA%'
       AND d.durum IN ('acik','hesaplandi')
       AND (
         TRIM(a.grup_adi) IN ('Dolce&Gabbana', 'Dolce & Gabbana', 'DOLCE & GABBANA', 'DG')
         OR UPPER(REPLACE(REPLACE(a.grup_adi,' ',''),'&','')) IN ('DOLCEGABBANA','DOLCE&GABBANA')
       )`,
    [dgId]
  );
  await conn.query(
    `UPDATE uzman_atama a
     JOIN magaza m ON m.id = a.magaza_id
     JOIN donem d ON d.id = a.donem_id
     SET a.bolum_id = ?
     WHERE UPPER(TRIM(m.bayi)) LIKE '%SEPHORA%'
       AND d.durum IN ('acik','hesaplandi')
       AND TRIM(a.grup_adi) IN ('La Prairie', 'LA PRAIRIE', 'LP', 'La Prairie ')`,
    [lpId]
  );
}

module.exports = { up };
