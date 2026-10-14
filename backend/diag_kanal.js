const pool = require("./src/db");
(async () => {
  const [d] = await pool.query("SELECT id,ad FROM donem ORDER BY id DESC");
  const donem = d.find(x=>/agustos|ağustos/i.test(x.ad)) || d[0];
  console.log("DÖNEM:", donem.id, donem.ad);

  // Tüm bölümler + siralama_marka kuralları + hedef eşikleri
  const [bol] = await pool.query("SELECT id,bolum_adi,markalar,grup_toplam_oran FROM prim_bolum ORDER BY id");
  for (const b of bol) {
    const [kur] = await pool.query("SELECT id,kriter_key,prim_oran,kriter_adi FROM prim_kural WHERE bolum_id=? AND satir_tipi='kural' ORDER BY id",[b.id]);
    if (!kur.some(k=>k.kriter_key==='siralama_marka')) continue; // sadece merdiveni olan bölümler
    // bu bölüme atanmış gruplar
    const [gr] = await pool.query("SELECT DISTINCT grup_adi FROM uzman_atama WHERE donem_id=? AND bolum_id=?",[donem.id,b.id]);
    console.log(`\n### BÖLÜM ${b.id}: ${b.bolum_adi} | markalar=${b.markalar} | tavan=${b.grup_toplam_oran}`);
    console.log("   atanan gruplar:", gr.map(x=>x.grup_adi).join(" | ")||"(yok)");
    for (const k of kur.filter(k=>k.kriter_key==='siralama_marka')) {
      const [h]=await pool.query("SELECT hedef_sira,hedef_marka_sayisi FROM prim_kural_hedef WHERE kural_id=? ORDER BY hedef_sira",[k.id]);
      console.log(`   %${k.prim_oran} [${k.kriter_adi}] -> ${h.map(x=>`ilk${x.hedef_sira}(${x.hedef_marka_sayisi})`).join(" , ")}`);
    }
  }
  process.exit(0);
})().catch(e=>{console.error("HATA:",e.message);process.exit(1)});
