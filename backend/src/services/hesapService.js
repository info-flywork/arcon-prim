// =====================================================================
// PRİM HESAP MOTORU
// Akış (dönem bazında):
//  1. Beyan satırları (Zeops) sell-out ile eşleştirilir:
//     birim ciro = sellout ciro / sellout adet  (mağaza × uniq ürün)
//     eşleşme: referans → barkod → urun_id → uniq
//     (1 ürünün birden fazla barkodu/referansı olabilir; uniq köprüdür)
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
const { loadProductResolver, resolveProduct } = require("./productService");

/**
 * Sell-out mükerrer modu:
 *  - "ortak"       : mağaza×ürün ortak havuz (eski; uzmanlar birbirinin hakkını düşürür)
 *  - "uzman_tavan" : Excel mantığı — her uzman kendi tavanında min(beyan, sell-out);
 *                   uzmanlar ortak havuzu paylaşmaz
 * Geri almak: SELLOUT_MUKERRER_MOD=ortak veya hesapla(..., { mukerrerMod: "ortak" })
 */
function resolveMukerrerMod(options = {}) {
  const raw = String(options.mukerrerMod || process.env.SELLOUT_MUKERRER_MOD || "uzman_tavan")
    .trim()
    .toLocaleLowerCase("tr-TR");
  return raw === "ortak" ? "ortak" : "uzman_tavan";
}

// Marka grubu üyelikleri; sell-out dosyasındaki "Marka Grup" kolonundan
// dinamik öğrenilir, bulunamazsa buradaki varsayılanlar kullanılır.
const VARSAYILAN_GRUPLAR = {
  PUIG: ["RABANNE", "PACO RABANNE", "CAROLINA HERRERA", "JEAN PAUL GAULTIER", "NINA RICCI"],
  HERMES: ["HERMES"],
  DG: ["DOLCE & GABBANA", "DOLCE&GABBANA", "D&G"],
  GIV: ["GIVENCHY"],
  GIVENCHY: ["GIVENCHY"],
  DIOR: ["DIOR"],
  SISLEY: ["SISLEY"],
  LP: ["LA PRAIRIE", "LP"],
  "SENSAİ": ["SENSAI", "SENSAİ"],
};

/** Excel Group metninden marka anahtarları çıkar (Givenchy+Hermes+Dolce → GIV,HERMES,DG) */
function grupAdindanMarkaAnahtarlari(grupAdi) {
  const g = normalizeName(grupAdi || "");
  if (!g) return [];
  // Parfüm / tüm markalar → geniş parfüm havuzu (SISLEY'e düşmesin)
  if (g.includes("TUM MARKA") || (g.includes("PARFUM") && g.includes("TUM"))) {
    return [
      "DIOR", "PUIG", "HERMES", "DG", "GIV", "GIVENCHY",
      "SISLEY", "LP", "NARCISO RODRIGUEZ", "ISSEY MIYAKE", "ZADIG&VOLTAIRE",
    ];
  }
  const out = new Set();
  const tokens = g.split(/[+\/&,]/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens.length ? tokens : [g]) {
    if (t.includes("DOLCE") || t.includes("GABBANA") || t === "D&G" || t === "DG") out.add("DG");
    if (t.includes("RABANNE") || t.includes("PUIG") || t.includes("GAULTIER")
      || t.includes("HERRERA") || t.includes("NINA") || t.includes("RICCI") || t.includes("CAROLINA")) {
      out.add("PUIG");
    }
    if (t.includes("HERMES")) out.add("HERMES");
    if (t.includes("GIVENCHY") || t === "GIV") out.add("GIV");
    if (t.includes("DIOR")) out.add("DIOR");
    if (t.includes("SISLEY")) out.add("SISLEY");
    if (t.includes("PRAIRIE") || t === "LP") out.add("LP");
    if (t.includes("SENSAI")) out.add("SENSAI");
    if (t.includes("NARCISO")) out.add("NARCISO RODRIGUEZ");
    if (t.includes("ISSEY") || t.includes("MIYAKE")) out.add("ISSEY MIYAKE");
    if (t.includes("ZADIG")) out.add("ZADIG&VOLTAIRE");
  }
  // Tam metin fallback (token yoksa)
  if (!out.size) {
    if (g.includes("GIVENCHY") || g.includes("GIV")) out.add("GIV");
    if (g.includes("HERMES")) out.add("HERMES");
    if (g.includes("DOLCE") || g.includes("GABBANA") || g.includes("DG")) out.add("DG");
    if (g.includes("PUIG")) out.add("PUIG");
  }
  return [...out];
}

/**
 * Bölüm markalar listesini Excel Group ile birleştir.
 * Örn. bolum=HERMES+DG ama grup_adi=Givenchy+Hermes+Dolce → GIV de eklenir.
 * Böylece Givenchy satışı / hedefi de bu atamaya dahil olur.
 */
function genisletMarkalar(markalarJson, grupAdi) {
  let keys = [];
  try {
    keys = Array.isArray(markalarJson) ? [...markalarJson] : JSON.parse(markalarJson || "[]");
  } catch {
    keys = [];
  }
  const ekstra = grupAdindanMarkaAnahtarlari(grupAdi);
  const seen = new Set(keys.map((k) => normalizeName(k)));
  for (const e of ekstra) {
    if (!seen.has(normalizeName(e))) {
      keys.push(e);
      seen.add(normalizeName(e));
    }
  }
  return keys;
}

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
  const mukerrerMod = resolveMukerrerMod(options);
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
    // Excel Group > bölüm marka listesi: Givenchy+Hermes+Dolce → GIV de dahil
    for (const a of atamalar) {
      a.markalar = genisletMarkalar(a.markalar, a.grup_adi);
    }
    const [kurallar] = await conn.query(
      `SELECT k.*, b.marka_grubu_key, b.bolum_adi AS b_adi FROM prim_kural k
       JOIN prim_bolum b ON b.id=k.bolum_id`
    );
    // Mağaza → bayi haritası (Beymen bonus tespiti için Zeops mağazasının
    // bayisi gerekli; atama mağazasının bayisiyle karışmasın diye ayrı yüklüyoruz)
    const [magazaRows] = await conn.query("SELECT id, bayi, prim_magaza FROM magaza");
    const magazaBayi = new Map(magazaRows.map((r) => [r.id, (r.bayi || "").toUpperCase().trim()]));
    const magazaMap = new Map(magazaRows.map((r) => [r.id, r.prim_magaza || ""]));

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

    // Sell-out kayıtları — mükerrer koruma (kalan tracking).
    // ortak: tüm uzmanlar aynı kalanı paylaşır
    // uzman_tavan: her uzman mağaza sell-out adedini kendi tavanı olarak görür (Excel)
    // Eşleşme: uniq(ref) → uniq havuz → referans → barkod → urun_id
    // (1 ürünün birden fazla barkodu olabilir; Excel Uniq köprüsü öncelikli)
    const soMap = new Map();      // magaza × urun_id
    const soRefMap = new Map();    // magaza × arcon_referans (satır bazlı birim — birleşmez)
    const soBarMap = new Map();    // magaza × arcon_barkod
    const soUniqMap = new Map();   // magaza × kanonik uniq (çoklu barkod fallback havuzu)
    const soUzmanKalan = new Map();
    const normKod = (v) => String(v || "").trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
    const normBar = (v) => String(v || "").trim().replace(/\D/g, "");

    const [uniqRows] = await conn.query(
      `SELECT referans, barkod, stok_kodu, stok_barkod_1, uniq_kod, stok_list_uniq_kod
       FROM uniq_kod`
    );
    const codeToUniq = new Map();
    function mapCodeToUniq(code, canon, asBarkod) {
      const u = normKod(canon);
      if (!u) return;
      if (asBarkod) {
        const b = normBar(code);
        if (b) codeToUniq.set(`b:${b}`, u);
      } else {
        const c = normKod(code);
        if (c) codeToUniq.set(`c:${c}`, u);
      }
    }
    for (const row of uniqRows) {
      // Excel: uniq boşsa Uniq kolonu çoğu zaman referansın kendisi
      const canon = normKod(row.stok_list_uniq_kod) || normKod(row.uniq_kod) || normKod(row.referans);
      if (!canon) continue;
      mapCodeToUniq(row.referans, canon, false);
      mapCodeToUniq(row.stok_kodu, canon, false);
      mapCodeToUniq(row.uniq_kod, canon, false);
      mapCodeToUniq(row.stok_list_uniq_kod, canon, false);
      mapCodeToUniq(row.barkod, canon, true);
      mapCodeToUniq(row.stok_barkod_1, canon, true);
    }
    // Excel Prim Çalışma: TOO EDPI NEW (DGI89664500999) → Uniq DGIP1TO1L04
    // (bizde yanlışlıkla DGB000000244'e bağlıydı; Excel ile hizala)
    mapCodeToUniq("DGI89664500999", "DGIP1TO1L04", false);
    mapCodeToUniq("8057971185702", "DGIP1TO1L04", true);

    function canonUniq(ref, bar, urunUniq) {
      if (ref) {
        const hit = codeToUniq.get(`c:${normKod(ref)}`);
        if (hit) return hit;
      }
      if (bar) {
        const hit = codeToUniq.get(`b:${normBar(bar)}`);
        if (hit) return hit;
      }
      if (urunUniq) return normKod(urunUniq) || null;
      return ref ? normKod(ref) : null;
    }

    function addSoKayit(map, key, adet, ciro, marka) {
      const mevcut = map.get(key);
      if (mevcut) {
        mevcut.adet += adet;
        mevcut.ciro += ciro;
        mevcut.kalan += adet;
      } else {
        map.set(key, { adet, ciro, marka, kalan: adet });
      }
    }

    function soUzmanIcin(uzmanId, so, kaynakKey) {
      if (mukerrerMod !== "uzman_tavan" || !so || !uzmanId) return so;
      const key = `${uzmanId}|${kaynakKey}`;
      let kopya = soUzmanKalan.get(key);
      if (!kopya) {
        kopya = {
          adet: so.adet,
          ciro: so.ciro,
          marka: so.marka,
          kalan: so.adet,
        };
        soUzmanKalan.set(key, kopya);
      }
      return kopya;
    }

    const [soAll] = await conn.query(
      `SELECT so.magaza_id, so.urun_id, so.arcon_referans, so.arcon_barkod,
              SUM(so.adet) adet, SUM(so.ciro_kdv_haric) ciro,
              MAX(u.marka) urun_marka, MAX(u.uniq_kod) urun_uniq, MAX(so.marka) marka
       FROM sellout so
       LEFT JOIN urun u ON u.id=so.urun_id AND u.durum='aktif'
       WHERE so.donem_id=? AND so.magaza_id IS NOT NULL
       GROUP BY so.magaza_id, so.urun_id, so.arcon_referans, so.arcon_barkod`, [donemId]
    );

    for (const r of soAll) {
      const adet = Number(r.adet) || 0;
      const ciro = Number(r.ciro) || 0;
      if (adet <= 0) continue;
      const marka = r.urun_marka || r.marka;
      // Ref/barkod ayrı tutulur → Excel Uniq=referans eşlemesinde doğru birim ciro
      if (r.arcon_referans) {
        addSoKayit(soRefMap, `${r.magaza_id}|${normKod(r.arcon_referans)}`, adet, ciro, marka);
      }
      if (r.arcon_barkod) {
        addSoKayit(soBarMap, `${r.magaza_id}|${normBar(r.arcon_barkod)}`, adet, ciro, marka);
      }
      if (r.urun_id) {
        addSoKayit(soMap, `${r.magaza_id}|${r.urun_id}`, adet, ciro, marka);
      }
      // Uniq havuzu: yalnızca sell-out satırının kendi kanonu (beyan alias'ı burada yok)
      const canon = canonUniq(r.arcon_referans, r.arcon_barkod, r.urun_uniq);
      if (canon) {
        addSoKayit(soUniqMap, `${r.magaza_id}|${canon}`, adet, ciro, marka);
      }
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
    const hedefMap = new Map(hedefRows.map((r) => [`${r.magaza_id}|${normalizeName(r.marka)}`, Number(r.hedef_ciro)]));

    // Hedef/sell-out marka adı farkları: "PACO RABANNE" ↔ "RABANNE"
    function markaAnahtarVaryantlari(marka) {
      const nm = normalizeName(marka || "");
      if (!nm) return [];
      const set = new Set([nm]);
      if (nm === "RABANNE" || nm === "PACO RABANNE") {
        set.add("RABANNE");
        set.add("PACO RABANNE");
      }
      if (nm.startsWith("PACO ")) set.add(nm.replace(/^PACO\s+/, ""));
      if (nm === "RABANNE") set.add("PACO RABANNE");
      return [...set];
    }
    function mapGetMarka(map, magazaId, marka) {
      for (const v of markaAnahtarVaryantlari(marka)) {
        const val = map.get(`${magazaId}|${v}`);
        if (val != null) return Number(val);
      }
      return 0;
    }

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

    // Beyan satırları:
    // - urun_id resolved olanları JOIN'le urun.marka'yı alıyoruz
    // - urun_id NULL olsa bile (barkod tanınmamış) hesap denemek üzere dahil et,
    //   çünkü fallback (arcon_referans / arcon_barkod) ile sell-out'ta bulunabilir
    // - atama_yok / urun_yok gibi düşürülmüş kayıtları da dahil et; hesap motoru
    //   bolumSec ve fallback'e göre kendi kararını verecek. Böylece Excel'deki
    //   "beyanda ne varsa görelim" mantığına yakın davranıyoruz.
    const [beyanlar] = await conn.query(
      `SELECT b.*, u.marka AS urun_marka, u.uniq_kod AS urun_uniq FROM satis_beyan b
       LEFT JOIN urun u ON u.id=b.urun_id
       WHERE b.donem_id=? AND b.magaza_id IS NOT NULL
         AND (b.durum IS NULL OR b.durum LIKE 'Tamamland%')
       ORDER BY b.magaza_id, b.urun_id, b.id`, [donemId]
    );

    // urun_id boş / inceleme kalanlar için barkod-referans → marka fallback
    const resolver = await loadProductResolver(conn);
    function markaCoz(b) {
      if (b.urun_marka) return b.urun_marka;
      const match = resolveProduct(resolver, { barcode: b.barkod, reference: b.kod });
      if (match.status === "ok" && match.matches?.[0]?.marka) {
        b.urun_id = b.urun_id || match.productId;
        return match.matches[0].marka;
      }
      return null;
    }

    // Uzman-Mağaza-Grup Excel master: uzman yalnızca o dosyadaki mağaza(lar)da
    // primlenir. Başka mağazada satış olsa bile grup dışı (Excel Prim Çalışma).
    const uzmanBolumler = new Map(); // uzman_id -> [atama_kaydı]
    for (const a of atamalar) {
      if (!uzmanBolumler.has(a.uzman_id)) uzmanBolumler.set(a.uzman_id, []);
      uzmanBolumler.get(a.uzman_id).push(a);
    }
    // Aynı uzman-mağaza için birden fazla grup olabilir (Puig + Hermes-DG)
    const atamaByUzmanMagaza = new Map(); // "uzman|magaza" -> [atama...]
    for (const a of atamalar) {
      const k = `${a.uzman_id}|${a.magaza_id}`;
      if (!atamaByUzmanMagaza.has(k)) atamaByUzmanMagaza.set(k, []);
      atamaByUzmanMagaza.get(k).push(a);
    }

    // Sadece bu uzman × bu Zeops mağazası ataması + ürün markası grubu uyarsa prim.
    // Diğer mağazadaki atamayı buraya taşıma → grup dışı.
    function bolumSec(uzmanId, magazaId, urunMarka) {
      const dogrudanlar = atamaByUzmanMagaza.get(`${uzmanId}|${magazaId}`) || [];
      for (const d of dogrudanlar) {
        if (markaGrubunda(d.markalar, urunMarka, markaGrupMap)) return d;
      }
      return null;
    }

    function selloutEsle(b) {
      let so = null;
      let soKaynakKey = null;
      const canon = canonUniq(b.kod, b.barkod, b.urun_uniq);
      if (canon) {
        const uniqRef = soRefMap.get(`${b.magaza_id}|${canon}`);
        if (uniqRef) {
          so = uniqRef;
          soKaynakKey = `uniq:${b.magaza_id}|${canon}`;
        }
      }
      if (!so && canon) {
        const uniqAlt = soUniqMap.get(`${b.magaza_id}|${canon}`);
        if (uniqAlt) {
          so = uniqAlt;
          soKaynakKey = `uniq:${b.magaza_id}|${canon}`;
        }
      }
      if (!so && b.kod) {
        const refAlt = soRefMap.get(`${b.magaza_id}|${normKod(b.kod)}`);
        if (refAlt) {
          so = refAlt;
          soKaynakKey = canon ? `uniq:${b.magaza_id}|${canon}` : `ref:${b.magaza_id}|${normKod(b.kod)}`;
        }
      }
      if (!so && b.barkod) {
        const barAlt = soBarMap.get(`${b.magaza_id}|${normBar(b.barkod)}`);
        if (barAlt) {
          so = barAlt;
          soKaynakKey = canon ? `uniq:${b.magaza_id}|${canon}` : `bar:${b.magaza_id}|${normBar(b.barkod)}`;
        }
      }
      if (!so && b.urun_id) {
        const idAlt = soMap.get(`${b.magaza_id}|${b.urun_id}`);
        if (idAlt) {
          so = idAlt;
          soKaynakKey = canon ? `uniq:${b.magaza_id}|${canon}` : `urun:${b.magaza_id}|${b.urun_id}`;
        }
      }
      if (!soKaynakKey) soKaynakKey = `x:${b.id}`;
      so = soUzmanIcin(b.uzman_id, so, soKaynakKey);

      let primAdet = 0, birim = 0, aciklama = null;
      if (so && so.adet > 0) {
        birim = so.ciro / so.adet;
        const kullanilabilir = Math.max(0, so.kalan);
        primAdet = Math.min(b.adet, kullanilabilir);
        so.kalan -= primAdet;
        if (primAdet === b.adet) aciklama = "Ok";
        else if (primAdet > 0) aciklama = `Kısmi Ok — ${b.adet - primAdet} adet mükerrer (sell-out kalanı yetmedi)`;
        else aciklama = `Mükerrer beyan — sell-out kalanı 0, prim verilmedi`;
      } else {
        aciklama = "Sell-out kaydı yok — prim hesaplanmadı";
      }
      return { primAdet, birim, aciklama, primeEsas: +(primAdet * birim).toFixed(2) };
    }

    // ---- 1) Satır bazlı prime esas tutar (sell-out tahsisi) ----
    const hesapSatirlari = [];
    // uzman × mağaza × bölüm — aynı noktada iki grup ayrı özet satırı üretir
    const ozetMap = new Map(); // "uzman|magaza|bolum" -> özet akümülatörü
    // Sevil DIOR kolonları: grupta DIOR olmasa bile (DG+LP, Sisley…) DIOR satış dilimi
    // üzerinden Mağaza %0.50 / Parfüm ilk 2 %0.33 (Excel Prim Hesaplama M/O)
    const sevilDiorEsas = new Map(); // "uzman|magaza" -> DIOR prime esas
    const beyanDurumGuncelle = []; // { id, durum } — satır satır UPDATE yerine toplu

    for (const b of beyanlar) {
      const urunMarka = markaCoz(b);
      b.urun_marka = urunMarka;
      if (!urunMarka) {
        // Atama var olsa bile marka bilinmeden grup kararı verilemez
        beyanDurumGuncelle.push({ id: b.id, durum: "urun_yok" });
        continue;
      }
      const atama = bolumSec(b.uzman_id, b.magaza_id, urunMarka);
      const isDiorUrun = normalizeName(urunMarka).includes("DIOR");
      const isSevilMag = normalizeName(magazaBayi.get(b.magaza_id) || "").includes("SEVIL");
      const uzmaninAtamasiVar = (uzmanBolumler.get(b.uzman_id) || []).length > 0;

      if (!atama) {
        // Grup dışı DIOR @ Sevil: satış primi yok, ama DIOR sıralama kolonları için esas biriktir
        if (isDiorUrun && isSevilMag && uzmaninAtamasiVar) {
          const { primeEsas } = selloutEsle(b);
          if (primeEsas > 0) {
            const dk = `${b.uzman_id}|${b.magaza_id}`;
            sevilDiorEsas.set(dk, (sevilDiorEsas.get(dk) || 0) + primeEsas);
          }
        }
        beyanDurumGuncelle.push({ id: b.id, durum: "atama_yok" });
        continue;
      }

      const { primAdet, birim, aciklama, primeEsas } = selloutEsle(b);
      if (isDiorUrun && isSevilMag && primeEsas > 0) {
        const dk = `${b.uzman_id}|${b.magaza_id}`;
        sevilDiorEsas.set(dk, (sevilDiorEsas.get(dk) || 0) + primeEsas);
      }
      hesapSatirlari.push([
        donemId, b.id, b.uzman_id, b.magaza_id, atama.bolum_id, b.uniq_kod_id,
        b.urun_id, b.adet, primAdet, +birim.toFixed(2), primeEsas, aciklama,
      ]);
      const key = `${b.uzman_id}|${b.magaza_id}|${atama.bolum_id}`;
      if (!ozetMap.has(key)) {
        ozetMap.set(key, { atama: { ...atama, magaza_id: b.magaza_id }, primeEsas: 0, adet: 0 });
      }
      ozetMap.get(key).primeEsas += primeEsas;
      ozetMap.get(key).adet += primAdet;
    }

    // Aynı sonuç: eslesme_durum güncellemesi — N tekil UPDATE yerine batch
    const byDurum = new Map();
    for (const item of beyanDurumGuncelle) {
      if (!byDurum.has(item.durum)) byDurum.set(item.durum, []);
      byDurum.get(item.durum).push(item.id);
    }
    for (const [durum, ids] of byDurum) {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        await conn.query(
          `UPDATE satis_beyan SET eslesme_durum=? WHERE id IN (${chunk.map(() => "?").join(",")})`,
          [durum, ...chunk]
        );
      }
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
        gerceklesen += mapGetMarka(cirodanMarka, magazaId, m);
        const h = mapGetMarka(hedefMap, magazaId, m);
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

    // Aynı Sevil mağazada birden fazla bölüm özeti olsa da DIOR kolonları bir kez
    const sevilDiorKolonVerildi = new Set();

    // ---- 3) Uzman × mağaza bazında kuralları uygula ----
    for (const [key, acc] of ozetMap) {
      const a = acc.atama;
      const bolumKurallari = (kurallarByBolum.get(a.bolum_id) || []).filter((k) => k.satir_tipi === "kural");
      const detay = [];
      let satisOran = 0, hedefOran = 0, siralamaOran = 0, bonusOran = 0;
      let diorKolonTutar = 0;

      // Sevil + DIOR sıralama → Excel M/O kolonları (Parfüm Tüm VEYA grupta DIOR olmasa bile)
      const gNormAtama = normalizeName(a.grup_adi || "");
      const isTumParfumAtama = gNormAtama.includes("TUM MARKA")
        || (gNormAtama.includes("PARFUM") && gNormAtama.includes("TUM"));
      const isSevilAtama = normalizeName(magazaBayi.get(a.magaza_id) || a.bayi || "").includes("SEVIL");
      const diorMagSira = isSevilAtama
        ? Number(siraMap.get(`${a.magaza_id}|GENEL|DIOR`))
        : null;
      const diorParSira = isSevilAtama
        ? Number(siraMap.get(`${a.magaza_id}|PARFUM|DIOR`))
        : null;
      const diorEsas = Number(sevilDiorEsas.get(`${a.uzman_id}|${a.magaza_id}`) || 0);
      const sevilDiorKolon = isSevilAtama
        && diorEsas > 0
        && ((diorMagSira === 1) || (diorParSira > 0 && diorParSira <= 2));
      // Parfüm Tüm'de DIOR kolon önceliği Puig siralama_marka yığılmasını keser
      const sevilDiorMarkaOncelik = sevilDiorKolon && isTumParfumAtama;

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
            if (sevilDiorMarkaOncelik) {
              sonuc = { tuttu: false, neden: "Sevil DIOR kolon önceliği" };
              break;
            }
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

      // Sevil DIOR kolonları: DIOR satış dilimi × oran (Excel M/O satır bazlı)
      const diorKolonKey = `${a.uzman_id}|${a.magaza_id}`;
      if (sevilDiorKolon && !sevilDiorKolonVerildi.has(diorKolonKey)) {
        sevilDiorKolonVerildi.add(diorKolonKey);
        if (diorMagSira === 1) {
          const tutar = +(diorEsas * 0.5 / 100).toFixed(2);
          diorKolonTutar += tutar;
          detay.push({
            kural: "DIOR Mağaza 1.lik (Sevil)",
            kriter: "magaza_birinci", oran: 0.5, tuttu: true, sira: 1,
            esas_baz: +diorEsas.toFixed(2), tutar,
          });
        }
        if (diorParSira > 0 && diorParSira <= 2) {
          const tutar = +(diorEsas * 0.33 / 100).toFixed(2);
          diorKolonTutar += tutar;
          detay.push({
            kural: "DIOR Parfüm ilk 2 (Sevil)",
            kriter: "parfum_siralama", oran: 0.33, tuttu: true, sira: diorParSira,
            esas_baz: +diorEsas.toFixed(2), tutar,
          });
        }
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

      // Tavan uygulaması (bonus + Sevil DIOR kolon tutarı tavan dışı — Excel ayrı kolon)
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
      // Excel gibi: 0 esas olan (sadece Mükerrer/Sell-out yok satırları olan)
      // uzman-mağazalar özet listesine girmez — prim rakamı 0 zaten
      if (esas <= 0) continue;

      // NOT: Eskiden burada Excel'in Prim Çalışma sayfasındaki
      // "Sephora Bağdat + Beymen + %0,05" (=%0,5) kolonundan alınmış bir
      // otomatik bayi bonusu kodu vardı. Ancak bu bonus prim_bolum/prim_kural
      // tablosunda TANIMLI DEĞİL — yani resmi bir kural değil, Excel formülü.
      // Sistemi sade tutmak için kaldırıldı: yalnızca prim_kural tablosundaki
      // kurallar uygulanır. İhtiyaç olursa prim_kural tablosuna eklenmeli.

      const satisPrim = +(esas * satisOran / 100).toFixed(2);
      const hedefPrim = +(esas * hedefOran / 100).toFixed(2);
      const siralamaPrim = +(esas * siralamaOran / 100 + diorKolonTutar).toFixed(2);
      const bonusPrim = +(esas * bonusOran / 100).toFixed(2);
      const araToplam = satisPrim + hedefPrim + siralamaPrim + bonusPrim;
      const ekPrim = +(araToplam * Number(donem.ek_prim_oran || 0) / 100).toFixed(2);
      const toplamPrim = +(araToplam + ekPrim).toFixed(2);
      const siralamaOranKayit = esas > 0
        ? +((siralamaPrim / esas) * 100).toFixed(4)
        : siralamaOran;

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
          siralamaOranKayit, siralamaPrim, bonusOran, bonusPrim,
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
    return {
      uzmanMagazaSayisi: sonuc.uzman_sayisi,
      toplamPrim: sonuc.toplam,
      satirSayisi: hesapSatirlari.length,
      mukerrerMod,
    };
  } catch (e) {
    if (ownsConnection) await conn.rollback();
    throw e;
  } finally {
    if (ownsConnection) conn.release();
  }
}

module.exports = { hesapla, markaGrubunda, grupMarkalari, genisletMarkalar, grupAdindanMarkaAnahtarlari };
