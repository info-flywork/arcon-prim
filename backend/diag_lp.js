const pool = require("./src/db");
const HEDEF = ["Songül Doğanay","Yasemin Uzun Yılan","Özlem Özdemir","Dilek Çelik","Fatma Akça","Canan Hatip","Gonca Durmuş","Ayşe Nilay Kırışçı","Gülyeter Bekişdamat","Nimet Temel","Dilek Karabına"];
(async () => {
  const [d] = await pool.query("SELECT id,ad,kural_seti FROM donem ORDER BY id DESC");
  const donem = d.find(x=>/agustos|ağustos/i.test(x.ad)) || d[0];
  console.log("DÖNEM:", donem.id, donem.ad, donem.kural_seti);
  for (const nm of HEDEF) {
    const [oz] = await pool.query(
      `SELECT o.uzman_id,o.magaza_id,o.bolum_id,o.prime_esas_toplam,o.siralama_prim,o.detay_json,
              u.ad_soyad, m.prim_magaza, m.bayi, a.grup_adi, b.bolum_adi, b.markalar
         FROM prim_ozet o JOIN uzman u ON u.id=o.uzman_id
         JOIN magaza m ON m.id=o.magaza_id
         LEFT JOIN prim_bolum b ON b.id=o.bolum_id
         LEFT JOIN uzman_atama a ON a.donem_id=o.donem_id AND a.uzman_id=o.uzman_id AND a.magaza_id=o.magaza_id AND a.bolum_id=o.bolum_id
        WHERE o.donem_id=? AND u.ad_soyad=?`, [donem.id, nm]);
    for (const r of oz) {
      console.log(`\n=== ${r.ad_soyad} | ${r.prim_magaza} (${r.bayi}) | grup=${r.grup_adi} | bölüm=${r.bolum_adi} ===`);
      console.log(`   E=${Math.round(r.prime_esas_toplam)} siralamaPrim=${Math.round(r.siralama_prim||0)}`);
      // satış grup ciro kovaları
      const [sg] = await pool.query(
        `SELECT u.marka, u.aks,
                SUM(CASE WHEN h.aciklama LIKE 'Mükerrer%' THEN 0 ELSE h.prime_esas_tutar END) esas
           FROM prim_hesap_satir h LEFT JOIN urun u ON u.id=h.urun_id
          WHERE h.donem_id=? AND h.uzman_id=? AND h.magaza_id=? AND IFNULL(h.bolum_id,0)=IFNULL(?,0)
          GROUP BY u.marka,u.aks HAVING esas>0.5 ORDER BY esas DESC`, [donem.id,r.uzman_id,r.magaza_id,r.bolum_id]);
      console.log("   ciro kırılımı:", sg.map(x=>`${x.marka}/${x.aks||'-'}=${Math.round(x.esas)}`).join(" | "));
      let det=[]; try{det=JSON.parse(r.detay_json||"[]");}catch{}
      for (const dd of det.filter(x=>x&&x.kriter)) {
        console.log(`   [${dd.tuttu?'✓':'✗'}] ${dd.kriter} oran=${dd.oran} tutar=${dd.tutar??'-'} kural="${dd.kural||''}"`);
      }
    }
  }
  process.exit(0);
})().catch(e=>{console.error("HATA:",e.message,e.stack);process.exit(1)});
