// =====================================================================
// PRİM HESAP MOTORU
// Akış (dönem bazında):
//  1. Beyan satırları (Zeops) sell-out ile eşleştirilir:
//     birim ciro = sellout ciro / sellout adet  (mağaza × uniq ürün)
//     prim adedi sell-out adediyle sınırlanır (fazla beyan prim almaz)
//  2. Uzmanın senaryosu (prim_bolum) atamadan gelir; satis_basi oranı
//     prime esas tutara uygulanır.
//  3. Koşullu kurallar değerlendirilir:
//     - ciro_hedefi / hedef_tutarsa: mağaza × grup markaları sell-out
//       cirosu >= hedef toplamı
//     - siralama_marka: grup markalarından N tanesi ilk X'te mi
//       (prim_kural_hedef satırlarının tamamı sağlanmalı)
//     - cilt/parfum/makyaj/sac_siralama (genel_siralama): ilgili kategori
//       çeşidinde markanın sırası <= hedef_sira
//     - magaza_birinci: kategori sıralamasında 1.lik
//     - iki_grup_bonus: aynı mağazadaki kardeş senaryoların tamamının
//       ciro + sıralama hedefi tutarsa
//  4. Kazanılan oranlar grup toplam tavanıyla sınırlanır; her kalem
//     prime esas toplam üzerinden TL'ye çevrilir; dönem ek prim oranı
//     (%0,20 varsayılan) toplam prim üzerine eklenir.
// Sonuçlar: prim_hesap_satir (satır bazlı) + prim_ozet (uzman bazlı)
// =====================================================================
const pool = require("../db");
const { normalizeName } = require("../util");

// Marka grubu üyelikleri; sell-out dosyasındaki "Marka Grup" kolonundan
// dinamik öğrenilir, bulunamazsa buradaki varsayılanlar kullanılır.
const VARSAYILAN_GRUPLAR = {
  PUIG: ["RABANNE", "PACO RABANNE", "CAROLINA HERRERA", "JEAN PAUL GAULTIER", "NINA RICCI"],
  HERMES: ["HERMES"],
  DG: ["DOLCE & GABBANA", "DOLCE&GABBANA", "D&G"],
  GIV: ["GIVENCHY"],
  DIOR: ["DIOR"],
  SISLEY: ["SISLEY"],
  LP: ["LA PRAIRIE", "LP"],
  "SENSAİ": ["SENSAI", "SENSAİ"],
};

function markaGrubunda(markalarJson, marka, markaGrupMap) {
  if (!markalarJson) return true; // grup tanımsızsa tüm markalar dahil
  const keys = Array.isArray(markalarJson) ? markalarJson : JSON.parse(markalarJson);
  const m = normalizeName(marka || "");
  if (!m) return false;
  for (const key of keys) {
    const k = normalizeName(key);
    if (m === k || m.includes(k)) return true;
    // sell-out'tan öğrenilen grup eşlemesi
    const grup = markaGrupMap.get(m);
    if (grup && normalizeName(grup) === k) return true;
    const list = VARSAYILAN_GRUPLAR[key] || VARSAYILAN_GRUPLAR[k] || [];
    if (list.some((x) => m === normalizeName(x) || m.includes(normalizeName(x)))) return true;
  }
  return false;
}

function grupMarkalari(markalarJson, tumMarkalar, markaGrupMap) {
  // Bir bölümün markalar listesini gerçek marka adlarına genişletir
  return tumMarkalar.filter((m) => markaGrubunda(markalarJson, m, markaGrupMap));
}

async function hesapla(donemId, options = {}) {
  const conn = options.connection || await pool.getConnection();
  const ownsConnection = !options.connection;
  try {
    if (ownsConnection) await conn.beginTransaction();
    await conn.query("DELETE FROM prim_hesap_satir WHERE donem_id=?", [donemId]);
    await conn.query("DELETE FROM prim_ozet WHERE donem_id=?", [donemId]);

    const [[donem]] = await conn.query("SELECT * FROM donem WHERE id=?", [donemId]);
    if (!donem) throw new Error("Dönem bulunamadı");
    if (donem.durum === "kapandi" && !options.allowClosed) {
      throw new Error("Kapalı dönem hesaplanamaz.");
    }

    // --- Referans verileri yükle ---
    const [atamalar] = await conn.query(
      `SELECT a.*, u.ad_soyad, m.prim_magaza, m.bayi, b.markalar, b.kanal, b.bolum_adi,
              b.grup_toplam_oran, b.max_prim_oran, b.marka_grubu_key
       FROM uzman_atama a
       JOIN uzman u ON u.id=a.uzman_id
       JOIN magaza m ON m.id=a.magaza_id
       JOIN prim_bolum b ON b.id=a.bolum_id
       WHERE a.donem_id=?`, [donemId]
    );
    const [kurallar] = await conn.query(
      `SELECT k.*, b.marka_grubu_key, b.bolum_adi AS b_adi FROM prim_kural k
       JOIN prim_bolum b ON b.id=k.bolum_id`
    );
    const [hedefSatirlari] = await conn.query("SELECT * FROM prim_kural_hedef");
    const hedeflerByKural = new Map();
    for (const h of hedefSatirlari) {
      if (!hedeflerByKural.has(h.kural_id)) hedeflerByKural.set(h.kural_id, []);
      hedeflerByKural.get(h.kural_id).push(h);
    }
    const kurallarByBolum = new Map();
    for (const k of kurallar) {
      if (!kurallarByBolum.has(k.bolum_id)) kurallarByBolum.set(k.bolum_id, []);
      kurallarByBolum.get(k.bolum_id).push(k);
    }

    // Sell-out toplamları: mağaza × kanonik ürün (birim ciro + adet)
    const [soUrun] = await conn.query(
      `SELECT so.magaza_id, so.urun_id, SUM(so.adet) adet,
              SUM(so.ciro_kdv_haric) ciro, u.marka
       FROM sellout so
       JOIN urun u ON u.id=so.urun_id AND u.durum='aktif'
       WHERE so.donem_id=? AND so.eslesme_durum='ok'
         AND so.urun_id IS NOT NULL AND so.magaza_id IS NOT NULL
       GROUP BY so.magaza_id, so.urun_id, u.marka`, [donemId]
    );
    const soMap = new Map(); // "magaza|urun" -> {adet, ciro, marka, kalanAdet}
    for (const r of soUrun) {
      soMap.set(`${r.magaza_id}|${r.urun_id}`, { adet: r.adet, ciro: r.ciro, marka: r.marka, kalan: r.adet });
    }

    // Marka -> Marka Grup öğrenilmiş eşleme (sell-out'tan)
    const [mgRows] = await conn.query(
      `SELECT DISTINCT u.marka, so.marka_grup
       FROM sellout so JOIN urun u ON u.id=so.urun_id
       WHERE so.donem_id=? AND u.durum='aktif' AND so.marka_grup IS NOT NULL`, [donemId]
    );
    const markaGrupMap = new Map(mgRows.map((r) => [normalizeName(r.marka), r.marka_grup]));

    // Mağaza × marka sell-out cirosu (ciro hedefi kontrolü)
    const [soMarka] = await conn.query(
      `SELECT so.magaza_id, u.marka, SUM(so.ciro_kdv_haric) ciro
       FROM sellout so JOIN urun u ON u.id=so.urun_id AND u.durum='aktif'
       WHERE so.donem_id=? AND so.magaza_id IS NOT NULL AND so.eslesme_durum='ok'
       GROUP BY so.magaza_id, u.marka`, [donemId]
    );
    const cirodanMarka = new Map(); // "magaza|MARKA" -> ciro
    const tumMarkalarSet = new Set();
    for (const r of soMarka) {
      cirodanMarka.set(`${r.magaza_id}|${normalizeName(r.marka)}`, r.ciro);
      tumMarkalarSet.add(String(r.marka || "").trim());
    }
    const tumMarkalar = [...tumMarkalarSet];

    // Hedefler: "magaza|MARKA" -> hedef ciro
    const [hedefRows] = await conn.query(
      "SELECT magaza_id, marka, hedef_ciro FROM hedef WHERE donem_id=? AND magaza_id IS NOT NULL", [donemId]
    );
    const hedefMap = new Map(hedefRows.map((r) => [`${r.magaza_id}|${normalizeName(r.marka)}`, r.hedef_ciro]));

    // Sıralamalar: "magaza|cesitAnahtar|MARKA" -> sira
    const [siraRows] = await conn.query(
      "SELECT magaza_id, cesit, marka, sira FROM siralama WHERE donem_id=? AND magaza_id IS NOT NULL", [donemId]
    );
    function cesitAnahtar(c) {
      const n = normalizeName(c || "");
      if (n.includes("PARF")) return "PARFUM";
      if (n.includes("MAKYAJ")) return "MAKYAJ";
      if (n.includes("CILT") || n.includes("CİLT")) return "CILT";
      if (n.includes("SAC") || n.includes("SAÇ")) return "SAC";
      return "GENEL";
    }
    const siraMap = new Map();
    for (const r of siraRows) {
      siraMap.set(`${r.magaza_id}|${cesitAnahtar(r.cesit)}|${normalizeName(r.marka)}`, r.sira);
    }

    // Beyan satırları (eşleşmiş)
    const [beyanlar] = await conn.query(
      `SELECT b.*, u.marka AS urun_marka FROM satis_beyan b
       JOIN urun u ON u.id=b.urun_id AND u.durum='aktif'
       WHERE b.donem_id=? AND b.eslesme_durum='ok'
         AND (b.durum IS NULL OR b.durum LIKE 'Tamamland%')
       ORDER BY b.magaza_id, b.urun_id, b.id`, [donemId]
    );

    // Atama araması: "uzman|magaza" -> atama
    const atamaMap = new Map(atamalar.map((a) => [`${a.uzman_id}|${a.magaza_id}`, a]));

    // ---- 1) Satır bazlı prime esas tutar (sell-out tahsisi) ----
    const hesapSatirlari = [];
    const ozetMap = new Map(); // "uzman|magaza" -> özet akümülatörü
    for (const b of beyanlar) {
      const atama = atamaMap.get(`${b.uzman_id}|${b.magaza_id}`);
      if (!atama) {
        await conn.query("UPDATE satis_beyan SET eslesme_durum='atama_yok' WHERE id=?", [b.id]);
        continue;
      }
      // Uzmanın marka grubu dışındaki ürünler prim dışı
      if (!markaGrubunda(atama.markalar, b.urun_marka, markaGrupMap)) continue;

      // Arcon terminolojisi: adet <= sell-out ise "Ok", aşan kısım "Mükerrer Giriş"
      const so = soMap.get(`${b.magaza_id}|${b.urun_id}`);
      let primAdet = 0, birim = 0, aciklama = null;
      if (so && so.adet > 0) {
        birim = so.ciro / so.adet;
        primAdet = Math.min(b.adet, Math.max(0, so.kalan));
        so.kalan -= primAdet;
        if (primAdet === b.adet) aciklama = "Ok";
        else if (primAdet > 0) aciklama = `Kısmi Ok — ${b.adet - primAdet} adet Mükerrer Giriş (prim yok)`;
        else aciklama = "Mükerrer Giriş — mağaza satış adedi aşıldı, prim hesaplanmadı";
      } else {
        aciklama = "Sell-out kaydı yok — prim hesaplanmadı";
      }
      const primeEsas = +(primAdet * birim).toFixed(2);
      hesapSatirlari.push([
        donemId, b.id, b.uzman_id, b.magaza_id, atama.bolum_id, b.uniq_kod_id,
        b.urun_id, b.adet, primAdet, +birim.toFixed(2), primeEsas, aciklama,
      ]);
      const key = `${b.uzman_id}|${b.magaza_id}`;
      if (!ozetMap.has(key)) {
        ozetMap.set(key, { atama, primeEsas: 0, adet: 0 });
      }
      ozetMap.get(key).primeEsas += primeEsas;
      ozetMap.get(key).adet += primAdet;
    }
    // toplu insert
    for (let i = 0; i < hesapSatirlari.length; i += 500) {
      await conn.query(
        `INSERT INTO prim_hesap_satir
         (donem_id, beyan_id, uzman_id, magaza_id, bolum_id, uniq_kod_id, urun_id,
          beyan_adet, prim_adet, birim_ciro, prime_esas_tutar, aciklama) VALUES ?`,
        [hesapSatirlari.slice(i, i + 500)]
      );
    }

    // ---- 2) Koşul değerlendirme yardımcıları ----
    function ciroHedefiTutuyorMu(magazaId, markalarJson) {
      const markalar = grupMarkalari(markalarJson, tumMarkalar, markaGrupMap);
      let gerceklesen = 0, hedefToplam = 0, hedefVar = false;
      for (const m of markalar) {
        const nm = normalizeName(m);
        gerceklesen += cirodanMarka.get(`${magazaId}|${nm}`) || 0;
        const h = hedefMap.get(`${magazaId}|${nm}`);
        if (h) { hedefToplam += h; hedefVar = true; }
      }
      if (!hedefVar) return { tuttu: false, neden: "hedef verisi yok", gerceklesen, hedefToplam };
      return { tuttu: gerceklesen >= hedefToplam, gerceklesen, hedefToplam };
    }

    function siralamaMarkaTutuyorMu(magazaId, markalarJson, hedefler) {
      // hedeflerin TAMAMI sağlanmalı: grup markalarından en az N tanesi ilk X'te
      const markalar = grupMarkalari(markalarJson, tumMarkalar, markaGrupMap);
      const sonuclar = [];
      for (const h of hedefler) {
        const sayi = markalar.filter((m) => {
          const s = siraMap.get(`${magazaId}|PARFUM|${normalizeName(m)}`);
          return s && s <= h.hedef_sira;
        }).length;
        sonuclar.push({ ilk: h.hedef_sira, gereken: h.hedef_marka_sayisi, bulunan: sayi, tuttu: sayi >= (h.hedef_marka_sayisi || 1) });
      }
      return { tuttu: sonuclar.every((s) => s.tuttu), detay: sonuclar };
    }

    function kategoriSiralamaTutuyorMu(magazaId, markalarJson, kategori, hedefSira) {
      const markalar = grupMarkalari(markalarJson, tumMarkalar, markaGrupMap);
      const enIyi = markalar
        .map((m) => siraMap.get(`${magazaId}|${kategori}|${normalizeName(m)}`))
        .filter((s) => s != null);
      if (!enIyi.length) return { tuttu: false, neden: "sıralama verisi yok" };
      const min = Math.min(...enIyi);
      return { tuttu: min <= hedefSira, sira: min };
    }

    // ---- 3) Uzman × mağaza bazında kuralları uygula ----
    for (const [key, acc] of ozetMap) {
      const a = acc.atama;
      const bolumKurallari = (kurallarByBolum.get(a.bolum_id) || []).filter((k) => k.satir_tipi === "kural");
      const detay = [];
      let satisOran = 0, hedefOran = 0, siralamaOran = 0, bonusOran = 0;

      for (const k of bolumKurallari) {
        const hedefler = hedeflerByKural.get(k.id) || [];
        let sonuc = { tuttu: false };
        switch (k.kriter_key) {
          case "satis_basi":
            satisOran += Number(k.prim_oran);
            detay.push({ kural: k.kriter_adi, oran: k.prim_oran, tuttu: true, tip: "satis" });
            continue;
          case "ciro_hedefi":
          case "ciro_hedefi_kosullu":
          case "hedef_tutarsa":
            sonuc = ciroHedefiTutuyorMu(a.magaza_id, a.markalar);
            if (sonuc.tuttu) hedefOran += Number(k.prim_oran);
            break;
          case "siralama_marka":
            sonuc = hedefler.length
              ? siralamaMarkaTutuyorMu(a.magaza_id, a.markalar, hedefler)
              : { tuttu: false, neden: "hedef tanımı yok" };
            if (sonuc.tuttu) siralamaOran += Number(k.prim_oran);
            break;
          case "cilt_siralama":
            sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "CILT", hedefler[0]?.hedef_sira || 3);
            if (sonuc.tuttu) siralamaOran += Number(k.prim_oran);
            break;
          case "parfum_siralama":
            sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "PARFUM", hedefler[0]?.hedef_sira || 2);
            if (sonuc.tuttu) siralamaOran += Number(k.prim_oran);
            break;
          case "makyaj_siralama":
            sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "MAKYAJ", hedefler[0]?.hedef_sira || 1);
            if (sonuc.tuttu) siralamaOran += Number(k.prim_oran);
            break;
          case "sac_siralama":
            sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "SAC", hedefler[0]?.hedef_sira || 1);
            if (sonuc.tuttu) siralamaOran += Number(k.prim_oran);
            break;
          case "magaza_birinci":
            sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "GENEL", 1);
            if (!sonuc.tuttu) {
              // genel çeşit yoksa parfüm 1.liğine bak
              sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "PARFUM", 1);
            }
            if (sonuc.tuttu) siralamaOran += Number(k.prim_oran);
            break;
          case "kumul_siralama":
            sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "GENEL", hedefler[0]?.hedef_sira || 1);
            if (sonuc.tuttu) siralamaOran += Number(k.prim_oran);
            break;
          default:
            sonuc = { tuttu: false, neden: "manuel değerlendirme gerekli (özel kural)" };
        }
        detay.push({ kural: k.kriter_adi, kriter: k.kriter_key, oran: k.prim_oran, ...sonuc });
      }

      // iki_grup_bonus: aynı bölüm adını taşıyan başlık bölümündeki bonus kuralı
      const bonusKurallari = kurallar.filter(
        (k) => k.satir_tipi === "bonus" && k.b_adi === a.bolum_adi
      );
      for (const bk of bonusKurallari) {
        // Aynı mağazadaki tüm kardeş senaryolar (aynı bolum_adi) için
        // ciro + ilk sıralama kuralı tutuyor mu?
        const kardesler = atamalar.filter(
          (x) => x.magaza_id === a.magaza_id && x.bolum_adi === a.bolum_adi
        );
        const hepsiTuttu = kardesler.length > 0 && kardesler.every((x) => {
          const ciro = ciroHedefiTutuyorMu(x.magaza_id, x.markalar);
          const ilkSira = (kurallarByBolum.get(x.bolum_id) || []).find((r) => r.kriter_key === "siralama_marka");
          const sira = ilkSira
            ? siralamaMarkaTutuyorMu(x.magaza_id, x.markalar, hedeflerByKural.get(ilkSira.id) || [])
            : { tuttu: false };
          return ciro.tuttu && sira.tuttu;
        });
        if (hepsiTuttu) bonusOran += Number(bk.prim_oran);
        detay.push({ kural: bk.kriter_adi, oran: bk.prim_oran, tuttu: hepsiTuttu, tip: "bonus" });
      }

      // Tavan uygulaması (bonus tavan dışı — pivottaki gibi ayrı kalem)
      const tavan = Number(a.grup_toplam_oran || a.max_prim_oran || 99);
      let toplamOran = satisOran + hedefOran + siralamaOran;
      if (toplamOran > tavan) {
        detay.push({ kural: "TAVAN", not: `%${toplamOran} -> %${tavan}` });
        // Tavanı aşan kısmı sıralama kaleminden düş
        siralamaOran -= toplamOran - tavan;
        if (siralamaOran < 0) { hedefOran += siralamaOran; siralamaOran = 0; }
        toplamOran = tavan;
      }

      const esas = +acc.primeEsas.toFixed(2);
      const satisPrim = +(esas * satisOran / 100).toFixed(2);
      const hedefPrim = +(esas * hedefOran / 100).toFixed(2);
      const siralamaPrim = +(esas * siralamaOran / 100).toFixed(2);
      const bonusPrim = +(esas * bonusOran / 100).toFixed(2);
      const araToplam = satisPrim + hedefPrim + siralamaPrim + bonusPrim;
      const ekPrim = +(araToplam * Number(donem.ek_prim_oran || 0) / 100).toFixed(2);
      const toplamPrim = +(araToplam + ekPrim).toFixed(2);

      await conn.query(
        `INSERT INTO prim_ozet
         (donem_id, uzman_id, magaza_id, bolum_id, prime_esas_toplam,
          satis_prim_oran, satis_prim, hedef_prim_oran, hedef_prim,
          siralama_prim_oran, siralama_prim, bonus_oran, bonus_prim,
          devreden_prim, ek_prim, toplam_oran, toplam_prim, detay_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          donemId, a.uzman_id, a.magaza_id, a.bolum_id, esas,
          satisOran, satisPrim, hedefOran, hedefPrim,
          siralamaOran, siralamaPrim, bonusOran, bonusPrim,
          0, ekPrim, toplamOran + bonusOran, toplamPrim,
          JSON.stringify(detay),
        ]
      );
    }

    await conn.query("UPDATE donem SET durum='hesaplandi' WHERE id=?", [donemId]);
    if (ownsConnection) await conn.commit();

    const [[sonuc]] = await conn.query(
      "SELECT COUNT(*) uzman_sayisi, SUM(toplam_prim) toplam FROM prim_ozet WHERE donem_id=?",
      [donemId]
    );
    return { uzmanMagazaSayisi: sonuc.uzman_sayisi, toplamPrim: sonuc.toplam, satirSayisi: hesapSatirlari.length };
  } catch (e) {
    if (ownsConnection) await conn.rollback();
    throw e;
  } finally {
    if (ownsConnection) conn.release();
  }
}

module.exports = { hesapla, markaGrubunda, grupMarkalari };
