const pool = require("./src/db");
(async () => {
  const [d] = await pool.query("SELECT id,ad FROM donem ORDER BY id DESC");
  const donem = d.find(x=>/agustos|ağustos/i.test(x.ad)) || d[0];
  console.log("DÖNEM:", donem.id, donem.ad, "\n");

  const [rows] = await pool.query(
    `SELECT u.ad_soyad, m.prim_magaza, a.grup_adi, o.prime_esas_toplam, o.hedef_prim, o.detay_json
       FROM prim_ozet o JOIN uzman u ON u.id=o.uzman_id JOIN magaza m ON m.id=o.magaza_id
       LEFT JOIN uzman_atama a ON a.donem_id=o.donem_id AND a.uzman_id=o.uzman_id AND a.magaza_id=o.magaza_id AND a.bolum_id=o.bolum_id
      WHERE o.donem_id=? ORDER BY u.ad_soyad`,[donem.id]);

  // ihtilaflı isimler
  const extra = ["Nihal Badaş","İlhan Baylan","Gülnur Gürer Aydın","Zehra Karaca","Kayhan Çetinkılıç","Emirhan Çimen","Akın Karyağ","Mesut Yılmaz"];
  const missing = ["Aysun İriz Kanpolat","Esra Karaca","Murat Altun","Çiğdem Temuçin Tank"];
  const bak = new Set([...extra,...missing]);

  for (const r of rows) {
    if (![...bak].some(b=>String(r.ad_soyad).includes(b))) continue;
    let det=[]; try{det=Array.isArray(r.detay_json)?r.detay_json:JSON.parse(r.detay_json||"[]")}catch{}
    const ch=det.find(x=>x.kriter==="ciro_hedefi"||x.kriter==="hedef_tutarsa"||x.kriter==="ciro_hedefi_kosullu"||/hedef/i.test(x.kriter||""));
    console.log(`${r.ad_soyad} | ${r.prim_magaza} | ${r.grup_adi}`);
    console.log(`   E=${Number(r.prime_esas_toplam).toFixed(0)}  hedef_prim=${Number(r.hedef_prim).toFixed(0)}`);
    if (ch) console.log(`   ciro kuralı: gerçekleşen=${ch.gerceklesen?.toFixed?.(0)} hedef=${ch.hedefToplam?.toFixed?.(0)} tuttu=${ch.tuttu} neden=${ch.neden||""}`);
    else console.log("   (detay_json'da ciro hedefi kuralı YOK)");
  }
  process.exit(0);
})().catch(e=>{console.error("HATA:",e.message);process.exit(1)});
