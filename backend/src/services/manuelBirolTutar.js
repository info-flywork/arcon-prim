// Geçici: Zeops isim farkı. Elif Öz satışları Elif Danışan, Ceyda Özmutlu satışları Ceyda Özkan.
// Birol Ağustos toplamları. Silinmek üzere işaretli.
const SATIRLAR = [
  {
    adSoyad: "Elif Danışan",
    ad: "Elif",
    soyad: "Danışan",
    magaza: "COMMUNITE GALATAPORT",
    grup: "Sensai+Sisley+La Prairie",
    esas: 588675,
    prim1: 5886.75,
  },
  {
    adSoyad: "Ceyda Özkan",
    ad: "Ceyda",
    soyad: "Özkan",
    magaza: "SEVİL ŞAŞKINBAKKAL",
    grup: "Parfüm Tüm Markalar",
    esas: 229321,
    prim1: 2293.21,
  },
];

const NOT = "MANUEL Birol tutarı - silinecek";

function agustosMu(donem) {
  return String(donem?.kural_seti || "") === "agustos";
}

async function ekleManuelBirolTutarlari(conn, donem) {
  if (!agustosMu(donem)) return 0;
  const detay = JSON.stringify([{ kural: NOT, tip: "manuel" }]);
  let n = 0;
  for (const s of SATIRLAR) {
    const [rows] = await conn.query(
      `SELECT a.uzman_id, a.magaza_id, a.bolum_id
         FROM uzman u
         JOIN uzman_atama a ON a.uzman_id=u.id AND a.donem_id=?
         JOIN magaza m ON m.id=a.magaza_id
        WHERE u.ad_soyad=? AND m.prim_magaza=? AND IFNULL(a.grup_adi,'')<>''
        LIMIT 1`,
      [donem.id, s.adSoyad, s.magaza]
    );
    const a = rows[0];
    if (!a) continue;
    await conn.query(
      `INSERT INTO prim_ozet
       (donem_id, uzman_id, magaza_id, bolum_id, prime_esas_toplam,
        satis_prim_oran, satis_prim, hedef_prim_oran, hedef_prim,
        siralama_prim_oran, siralama_prim, bonus_oran, bonus_prim,
        devreden_prim, ek_prim, toplam_oran, toplam_prim, detay_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         prime_esas_toplam=VALUES(prime_esas_toplam),
         satis_prim_oran=VALUES(satis_prim_oran),
         satis_prim=VALUES(satis_prim),
         hedef_prim_oran=0, hedef_prim=0,
         siralama_prim_oran=0, siralama_prim=0,
         bonus_oran=0, bonus_prim=0,
         devreden_prim=0, ek_prim=0,
         toplam_oran=VALUES(toplam_oran),
         toplam_prim=VALUES(toplam_prim),
         detay_json=VALUES(detay_json)`,
      [
        donem.id, a.uzman_id, a.magaza_id, a.bolum_id, s.esas,
        1, s.prim1, 0, 0,
        0, 0, 0, 0,
        0, 0, 1, s.prim1,
        detay,
      ]
    );
    n += 1;
  }
  return n;
}

function manuelPrimCalismaSatirlari(donem) {
  if (!agustosMu(donem)) return [];
  return SATIRLAR.map((s) => ({
    ad: s.ad,
    soyad: s.soyad,
    birlestirilmis_isim: s.adSoyad,
    ad_soyad: s.adSoyad,
    prim_grup: s.grup,
    durum: "Tamamlandı",
    magaza_ham: s.magaza,
    sellout_magaza: s.magaza,
    etiket: NOT,
    rapor_aciklama: "Ok",
    satis_notlari: NOT,
    prime_esas_tutar: s.esas,
    prime_esas_tutar_net: s.esas,
    birim_ciro: s.esas,
    prim_yuzde_1: s.prim1,
    toplam_satis_primi: s.prim1,
    satis_turu: "Manuel",
  }));
}

module.exports = { ekleManuelBirolTutarlari, manuelPrimCalismaSatirlari };
