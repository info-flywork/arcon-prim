/**
 * PRİM KRİTERLERİ GÜNCEL VERSİYON_271026 farkları:
 * 1) Sephora 2+ HERMES-DG-GIV: ilk 15 / ilk 17 hedefleri
 * 2) Sephora Givenchy / DG: makyaj ilk 2 → ilk 3
 * 3) Sephora Sisley: satılan %2 → %1,5; grup toplam %4,5 → %4
 * 4) Beymen niche / DBS mağaza-% matrisi (Ağustos 2026+)
 */
async function up(conn) {
  // --- 1) Sephora 2+ Hermes-DG-GIV sıralama hedefleri ---
  const [[k19]] = await conn.query(
    `SELECT k.id FROM prim_kural k
     JOIN prim_bolum b ON b.id=k.bolum_id
     WHERE b.marka_grubu_key='hermes_dg_siralama_hedefi'
       AND k.kriter_key='siralama_marka' AND k.prim_oran=1
     LIMIT 1`
  );
  if (k19) {
    await conn.query(
      `UPDATE prim_kural SET kriter_adi=?, kural_key=? WHERE id=?`,
      [
        "İlk 6  (1 Marka ) , ilk 10 (1 marka) , ilk 15 (1 marka)",
        "siralama_ilk6_10_15",
        k19.id,
      ]
    );
    const [[h15]] = await conn.query(
      "SELECT id FROM prim_kural_hedef WHERE kural_id=? AND hedef_sira=15",
      [k19.id]
    );
    if (!h15) {
      await conn.query(
        `INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
         VALUES (?, 'sira', 15, 1, 3)`,
        [k19.id]
      );
    }
  }

  const [[k20]] = await conn.query(
    `SELECT k.id FROM prim_kural k
     JOIN prim_bolum b ON b.id=k.bolum_id
     WHERE b.marka_grubu_key='hermes_dg_siralama_hedefi'
       AND k.kriter_key='siralama_marka' AND k.prim_oran=0.5
     LIMIT 1`
  );
  if (k20) {
    await conn.query(
      `UPDATE prim_kural SET kriter_adi=?, kural_key=? WHERE id=?`,
      [
        "ilk 8 (1 marka ), ilk 12 (1 marka ) ilk 17 (1 marka)",
        "siralama_ilk8_12_17",
        k20.id,
      ]
    );
    const [[h17]] = await conn.query(
      "SELECT id FROM prim_kural_hedef WHERE kural_id=? AND hedef_sira=17",
      [k20.id]
    );
    if (!h17) {
      await conn.query(
        `INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
         VALUES (?, 'sira', 17, 1, 3)`,
        [k20.id]
      );
    }
  }

  // --- 2) Sephora Givenchy / DG: makyaj ilk 3 ---
  // Not: canlı DB'de kural_key makyaj_ilk_2_24 formunda; kesin düzeltme 018'de.
  for (const key of ["sephora_givenchy", "sephora_dg"]) {
    const [[k]] = await conn.query(
      `SELECT k.id FROM prim_kural k
       JOIN prim_bolum b ON b.id=k.bolum_id
       WHERE b.marka_grubu_key=? AND k.kural_key='makyaj_ilk_2'
       LIMIT 1`,
      [key]
    );
    if (!k) continue;
    await conn.query(
      `UPDATE prim_kural SET kural_key='makyaj_ilk_3', kriter_adi='MAKYAJ İLK 3' WHERE id=?`,
      [k.id]
    );
    await conn.query(
      `UPDATE prim_kural_hedef SET hedef_sira=3 WHERE kural_id=? AND hedef_sira=2`,
      [k.id]
    );
    const [[h3]] = await conn.query(
      "SELECT id FROM prim_kural_hedef WHERE kural_id=? AND hedef_sira=3",
      [k.id]
    );
    if (!h3) {
      await conn.query(
        `INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
         VALUES (?, 'sira', 3, NULL, 1)`,
        [k.id]
      );
    }
  }

  // --- 3) Sephora Sisley: %1,5 satılan, toplam %4 ---
  await conn.query(
    `UPDATE prim_kural k
     JOIN prim_bolum b ON b.id=k.bolum_id
     SET k.prim_oran=1.5
     WHERE b.marka_grubu_key='sisley_sephora_cadde' AND k.kriter_key='satis_basi'`
  );
  await conn.query(
    `UPDATE prim_kural k
     JOIN prim_bolum b ON b.id=k.bolum_id
     SET k.prim_oran=4, k.kriter_adi='Sıralama İlk 2 olursa Toplam'
     WHERE b.marka_grubu_key='sisley_sephora_cadde' AND k.satir_tipi='grup_toplam'`
  );
  await conn.query(
    `UPDATE prim_bolum
     SET grup_toplam_oran=4, max_prim_oran=4
     WHERE marka_grubu_key='sisley_sephora_cadde'`
  );

  // --- 4) Beymen niche / DBS mağaza-% matrisi ---
  await conn.query(`
    CREATE TABLE IF NOT EXISTS beymen_niche_satis_oran (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      magaza_anahtar VARCHAR(60) NOT NULL,
      marka_anahtar VARCHAR(40) NOT NULL,
      oran DECIMAL(6,3) NOT NULL,
      kaynak VARCHAR(80) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_magaza_marka (magaza_anahtar, marka_anahtar)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const kaynak = "KRITER_271026";
  const satirlar = [
    // ZORLU
    ["ZORLU", "BYREDO", 1],
    ["ZORLU", "PENHALIGON", 1],
    ["ZORLU", "DBS", 1],
    // TERSANE
    ["TERSANE", "BYREDO", 0.2],
    ["TERSANE", "PENHALIGON", 0.2],
    ["TERSANE", "DBS", 0.2],
    ["TERSANE", "LARTISAN", 0.2],
    ["TERSANE", "CAROLINA_HERRERA", 0.2],
    // AQUA FLORYA
    ["AQUA", "DBS", 0.5],
    // İSTİNYEPARK (İstanbul)
    ["ISTINYEPARK", "BYREDO", 0.5],
    ["ISTINYEPARK", "PENHALIGON", 0.5],
    ["ISTINYEPARK", "DBS", 1],
    // AKASYA
    ["AKASYA", "BYREDO", 0.5],
    ["AKASYA", "PENHALIGON", 0.5],
    // SUADIYE
    ["SUADIYE", "BYREDO", 0.25],
    ["SUADIYE", "DBS", 0.25],
    ["SUADIYE", "DIOR", 0.5],
    // PANORA / ARMADA / KAVAKLIDERE
    ["PANORA", "DBS", 0.33],
    ["ARMADA", "DBS", 0.33],
    ["KAVAKLIDERE", "DBS", 0.34],
    // İZMİR İSTİNYEPARK
    ["IZMIR_ISTINYE", "DBS", 0.5],
    ["IZMIR_ISTINYE", "HERMES", 0.5],
  ];

  await conn.query("DELETE FROM beymen_niche_satis_oran WHERE kaynak=?", [kaynak]);
  if (satirlar.length) {
    await conn.query(
      `INSERT INTO beymen_niche_satis_oran (magaza_anahtar, marka_anahtar, oran, kaynak)
       VALUES ?`,
      [satirlar.map(([m, a, o]) => [m, a, o, kaynak])]
    );
  }
}

module.exports = { up };
