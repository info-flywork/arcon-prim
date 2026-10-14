const pool = require("./src/db");
(async () => {
  const [d] = await pool.query("SELECT id,ad FROM donem ORDER BY id DESC");
  const donem = d.find(x=>/agustos|ağustos/i.test(x.ad)) || d[0];
  for (const ad of ["Ebru Savaş","Abdullah Çelik"]) {
    const [[o]] = await pool.query(
      `SELECT o.magaza_id,o.bolum_id,a.grup_adi,b.bolum_adi,b.markalar,m.prim_magaza,o.detay_json,o.siralama_prim
       FROM prim_ozet o JOIN uzman u ON u.id=o.uzman_id JOIN magaza m ON m.id=o.magaza_id
       LEFT JOIN uzman_atama a ON a.donem_id=o.donem_id AND a.uzman_id=o.uzman_id AND a.magaza_id=o.magaza_id AND a.bolum_id=o.bolum_id
       LEFT JOIN prim_bolum b ON b.id=o.bolum_id
       WHERE o.donem_id=? AND u.ad_soyad LIKE ? ORDER BY o.prime_esas_toplam DESC LIMIT 1`,[donem.id,`%${ad}%`]);
    console.log("\n==",ad,"| bölüm",o.bolum_id,o.bolum_adi,"| grup:",o.grup_adi,"| bölüm markalar:",o.markalar,"| sir_prim=",Number(o.siralama_prim).toFixed(0));
    let det=[]; try{det=Array.isArray(o.detay_json)?o.detay_json:JSON.parse(o.detay_json||"[]")}catch{}
    const gb=det.find(x=>x.kriter==='grup_esas_baz'); console.log("   grup_esas_baz=",gb&&gb.grupEsas);
    det.filter(x=>x.kriter==='siralama_marka').forEach(x=>console.log("   %"+x.oran,"tuttu",x.tuttu,JSON.stringify(x.detay)));
    const [sir]=await pool.query("SELECT marka,sira FROM siralama WHERE donem_id=? AND magaza_id=? AND cesit LIKE '%PARF%' ORDER BY sira",[donem.id,o.magaza_id]);
    console.log("   PARFÜM sıra:",sir.map(s=>s.marka+":"+s.sira).join(", "));
  }
  process.exit(0);
})().catch(e=>{console.error("HATA:",e.message);process.exit(1)});
