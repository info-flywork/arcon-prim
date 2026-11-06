/** Sephora Givenchy / DG: Makyaj ilk 2 → ilk 3 (kural_key suffix'li: makyaj_ilk_2_24). */
async function up(conn) {
  for (const key of ["sephora_givenchy", "sephora_dg"]) {
    const [rows] = await conn.query(
      `SELECT k.id, k.kural_key FROM prim_kural k
       JOIN prim_bolum b ON b.id=k.bolum_id
       WHERE b.marka_grubu_key=? AND k.kriter_key='makyaj_siralama'
         AND (k.kural_key LIKE 'makyaj_ilk_2%' OR k.kriter_adi LIKE '%İLK 2%' OR k.kriter_adi LIKE '%ILK 2%')`,
      [key]
    );
    for (const k of rows) {
      const newKey = String(k.kural_key || "").replace("makyaj_ilk_2", "makyaj_ilk_3");
      await conn.query(
        `UPDATE prim_kural SET kural_key=?, kriter_adi='MAKYAJ İLK 3' WHERE id=?`,
        [newKey || "makyaj_ilk_3", k.id]
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
  }
}

module.exports = { up };
