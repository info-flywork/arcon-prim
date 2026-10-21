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
//     - iki_grup_bonus: 2+ uzman Sephora/Boyner. Her iki grup ciro ve %1
//       sıralamayı tutarsa kuraldaki %1'in ciro kolonunda verilmiş %0,5'i
//       düşülür, kalan %0,5 T kolonuna yazılır. Tek uzmanda T üçüncü sıralama satırıdır.
//  4. Kazanılan oranlar grup toplam tavanıyla sınırlanır; her kalem
//     prime esas toplam üzerinden TL'ye çevrilir; dönem ek prim oranı
//     (%0,20 varsayılan) toplam prim üzerine eklenir.
// Sonuçlar: prim_hesap_satir (satır bazlı) + prim_ozet (uzman bazlı)
// =====================================================================
const pool = require("../db");
const { normalizeName } = require("../util");
const { loadProductResolver, resolveProductWithBridge, tamamlaEksikAtamalar } = require("./productService");
const { loadUniqBridge } = require("./uniqBridge");
const { relinkDonemBeyan } = require("./beyanRelink");
const { beymenCiltPrimleri, agustosBeymenNicheCiroPrimVar } = require("./beymenCiltKural");
const {
  dfbPrimHaricMi,
  parfumUzmanGrubuMu,
  parfumUzmanSayisiHaritasi,
  puigUzmanGrubuMu,
  hgdUzmanGrubuMu,
} = require("./grupDisiKural");
const { GEZICI_ADLAR, resolvePrimMagaza } = require("./geziciUzman");
const { ekleManuelBirolTutarlari } = require("./manuelBirolTutar");

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

/**
 * Uniq havuzu: prim = min(uzman beyan, mağaza sell-out kalan).
 * Satır taşarsa etiket Mükerrer olur ama kalan sell-out kadar prim yazılır.
 */
/** Prim Hesaplama özeti = rapordaki Prime Esas Toplam Tutar (mükerrer 0). */
function ozetEsasiNetDoldur(hesapSatirlari, ozetMap, inGroupByBeyan = new Map()) {
  for (const acc of ozetMap.values()) {
    acc.primeEsas = 0;
    acc.adet = 0;
    acc.grupEsas = 0; // sadece grup-içi satışların esas'ı (sıralama primi tabanı)
  }
  const gruplar = new Map();
  for (const row of hesapSatirlari) {
    const uzmanId = row[2];
    const magazaId = row[3];
    const bolumId = row[4];
    const uniqId = row[5];
    const urunId = row[6];
    const primAdet = Number(row[8]) || 0;
    const primeEsas = Number(row[10]) || 0;
    const aciklama = String(row[11] || "");
    if (!bolumId) continue;
    const poolKey = `${uzmanId}|${magazaId}|${uniqId || urunId || row[1]}`;
    if (!gruplar.has(poolKey)) gruplar.set(poolKey, []);
    gruplar.get(poolKey).push({ beyanId: row[1], uzmanId, magazaId, bolumId, primAdet, primeEsas, aciklama });
  }
  for (const grup of gruplar.values()) {
    let tasinanEsas = 0;
    let tasinanAdet = 0;
    let hedef = null;
    for (const s of grup) {
      if (/^mükerrer/i.test(s.aciklama)) {
        tasinanEsas += s.primeEsas;
        tasinanAdet += s.primAdet;
        s.primeEsas = 0;
        s.primAdet = 0;
      } else if (!hedef) {
        hedef = s;
      }
    }
    if (hedef) {
      hedef.primeEsas += tasinanEsas;
      hedef.primAdet += tasinanAdet;
    } else if (tasinanEsas > 0 || tasinanAdet > 0) {
      // Tek satır taşma: raporda alta Ok + Mükerrer bölünür; özet mağaza kadar prim tutar.
      const ilk = grup[0];
      ilk.primeEsas = tasinanEsas;
      ilk.primAdet = tasinanAdet;
    }
    for (const s of grup) {
      const acc = ozetMap.get(`${s.uzmanId}|${s.magazaId}|${s.bolumId}`);
      if (!acc) continue;
      acc.primeEsas += s.primeEsas;
      acc.adet += s.primAdet;
      if (inGroupByBeyan.get(s.beyanId)) acc.grupEsas += s.primeEsas;
    }
  }
}

function selloutSatirKarari(beyanAdet, kullanilabilir, oncePrimAlindi, havuzAdet) {
  const beyan = Number(beyanAdet) || 0;
  const kalan = Math.max(0, Number(kullanilabilir) || 0);
  if (kalan <= 0) return { primAdet: 0, aciklama: "Mükerrer Giriş" };
  if (beyan <= kalan) return { primAdet: beyan, aciklama: "Ok" };
  return { primAdet: kalan, aciklama: "Mükerrer Giriş" };
}

// Marka grubu üyelikleri; sell-out dosyasındaki "Marka Grup" kolonundan
// dinamik öğrenilir, bulunamazsa buradaki varsayılanlar kullanılır.
const VARSAYILAN_GRUPLAR = {
  PUIG: [
    "RABANNE", "PACO RABANNE", "CAROLINA HERRERA", "JEAN PAUL GAULTIER", "NINA RICCI",
    "BYREDO", "LARTISAN PARFUMEUR", "LARTISAN PERFUMER", "PENHALIGONS", "PENHALIGON",
    "DRIES VAN NOTEN", "SCENTOLOGIA",
  ],
  HERMES: ["HERMES"],
  DG: ["DOLCE & GABBANA", "DOLCE&GABBANA", "D&G"],
  GIV: ["GIVENCHY"],
  GIVENCHY: ["GIVENCHY"],
  DIOR: ["DIOR"],
  SISLEY: ["SISLEY"],
  LP: ["LA PRAIRIE", "LP"],
  "SENSAİ": ["SENSAI", "SENSAİ"],
  STURM: ["DR.BARBARA STURM", "DR BARBARA STURM", "BARBARA STURM"],
};

/** Excel Group metninden marka anahtarları çıkar (Givenchy+Hermes+Dolce → GIV,HERMES,DG) */
function grupAdindanMarkaAnahtarlari(grupAdi) {
  const g = normalizeName(grupAdi || "");
  if (!g) return [];
  // Parfüm Tüm / "Sisley + Parfüm" / Parfüm → geniş parfüm havuzu (Excel Satış Grup)
  // "Sensai+Tüm Parfüm Markaları" gibi birleşik gruplarda SENSAI de kalmalı
  if (g.includes("TUM MARKA") || g.includes("PARFUM")) {
    // Narciso / Issey / Zadig Excel'de DFB GRUP — Prime Dahil Değil
    const pool = [
      "DIOR", "PUIG", "HERMES", "DG", "GIV", "GIVENCHY",
      "SISLEY", "LP",
    ];
    if (g.includes("SENSAI")) pool.push("SENSAI", "SENSAİ");
    return pool;
  }
  if (g.includes("STURM") || (g.includes("BARBARA") && g.includes("DR"))) {
    return ["DR.BARBARA STURM", "BARBARA STURM", "STURM", "BYREDO", "PENHALIGONS", "PENHALIGON"];
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
    // Narciso / Issey / Zadig DFB — atama adında geçse bile prim yok
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
 * Marka filtresi Excel Prim Grup'tan gelir (Givenchy+Hermes+Dolce → GIV/HERMES/DG).
 * Bölüm (TEK_UZMAN PUIG+…) oran/kural senaryosudur; Puig sızdırmaz.
 */
function genisletMarkalar(markalarJson, grupAdi) {
  let keys = [];
  try {
    keys = Array.isArray(markalarJson) ? [...markalarJson] : JSON.parse(markalarJson || "[]");
  } catch {
    keys = [];
  }
  const ekstra = grupAdindanMarkaAnahtarlari(grupAdi);
  if (ekstra.length) return ekstra;
  return keys;
}

/**
 * Birol RST sıralama havuzu:
 * - Parfüm Tüm → bölüm tablosu (PUIG veya HERMES-DG), DIOR yok
 * - Givenchy+Hermes+Dolce / Puig → Prim Grup markaları (TEK UZMAN PUIG sızdırmaz)
 * - Sisley/LP + Parfüm (Sevil) → PUIG-HERMES-DG-GIV
 */
function tumParfumGrubuMu(grupAdi) {
  const g = normalizeName(grupAdi || "");
  return g.includes("TUM MARKA")
    || g === "PARFUM"
    || /^PARFUM TUM/.test(g)
    || (g.includes("PARFUM") && !/(GIVENCHY|HERMES|DOLCE|GABBANA|PUIG|SISLEY|PRAIRIE|SENSAI|DIOR)/.test(g))
    || (g.includes("TUM MARKA") && g.includes("PARFUM"));
}

function siralamaSayimMarkalari(a, bolumMarkalar = null) {
  const ham = bolumMarkalar || a.hamMarkalar || a.markalar;
  // Bölüm havuzu verilmişse o sayılır. Sephora 2+ Hermes-DG-Givenchy havuzunda GIV vardır. DIOR yok.
  if (bolumMarkalar) return ham;
  const g = normalizeName(a.grup_adi || "");
  if (tumParfumGrubuMu(a.grup_adi)) return ham;

  // TEK birleşik kabuk (PUIG+HGD): Prim Grup dar olsa bile bölüm havuzu
  const isTek = a.uzman_tipi === "TEK_UZMAN"
    || /TEK UZMAN/i.test(String(a.bolum_adi || ""));
  if (isTek && ham && (Array.isArray(ham) ? ham.length : String(ham).length) > 2) {
    return ham;
  }

  const karmaParfum = g.includes("PARFUM")
    && /(SISLEY|PRAIRIE|SENSAI|DOLCE|GABBANA)/.test(g);
  if (karmaParfum) return ["PUIG", "HERMES", "DG", "GIV"];

  // Spesifik COK grup — yalnız kendi marka anahtarları
  const tokens = g.split(/[+\/&,]/).map((t) => t.trim()).filter(Boolean);
  const out = new Set();
  for (const t of tokens.length ? tokens : [g]) {
    if (t.includes("DOLCE") || t.includes("GABBANA") || t === "DG") out.add("DG");
    if (t.includes("RABANNE") || t.includes("PUIG") || t.includes("GAULTIER")
      || t.includes("HERRERA") || t.includes("NINA") || t.includes("RICCI") || t.includes("CAROLINA")
      || t.includes("BYREDO") || t.includes("PENHAL") || t.includes("LARTISAN") || t.includes("DRIES")) {
      out.add("PUIG");
    }
    if (t.includes("HERMES")) out.add("HERMES");
    if (t.includes("GIVENCHY") || t === "GIV") out.add("GIV");
    if (t.includes("SISLEY")) out.add("SISLEY");
    if (t.includes("PRAIRIE") || t === "LP") out.add("LP");
    if (t.includes("SENSAI")) out.add("SENSAI");
  }
  if (out.size) return [...out];
  return ham;
}

/** Sıralama satırındaki bütün eşikler sayılır. Eksik eşik düşülmez. */
function siralamaHedefFiltre(hedefler) {
  return hedefler || [];
}

/**
 * Çift uzman yalnız mağazada hem Puig uzmanı hem Hermes/Dolce/Givenchy uzmanı varsa.
 * Parfüm Tüm bu ikiliden sayılmaz; her zaman tek uzman sayfası.
 * Başka kombinasyonlar (iki Parfüm Tüm, yalnız Puig, yalnız Givenchy) tek sayfadır.
 * Bolum 4 (tek parfüm + Givenchy, GIV yok) çift değilse kendi sayfasında kalır.
 */
const PARFUM_SIRALAMA_AILE = {
  2: { tek: 2, puig: 6, hgd: 7 },
  4: { tek: 4, puig: 6, hgd: 7 },
  6: { tek: 2, puig: 6, hgd: 7 },
  7: { tek: 2, puig: 6, hgd: 7 },
  9: { tek: 9, puig: 11, hgd: 12 },
  11: { tek: 9, puig: 11, hgd: 12 },
  12: { tek: 9, puig: 11, hgd: 12 },
};

function ciftUzmanMagazaSeti(atamalar) {
  const puig = new Set();
  const hgd = new Set();
  for (const a of atamalar || []) {
    if (tumParfumGrubuMu(a.grup_adi)) continue;
    if (puigUzmanGrubuMu(a.grup_adi)) puig.add(a.magaza_id);
    else if (hgdUzmanGrubuMu(a.grup_adi)) hgd.add(a.magaza_id);
  }
  const out = new Set();
  for (const id of puig) if (hgd.has(id)) out.add(id);
  return out;
}

function parfumSiralamaBolumId(a) {
  const id = Number(a.bolum_id);
  const aile = PARFUM_SIRALAMA_AILE[id];
  if (!aile || !parfumUzmanGrubuMu(a.grup_adi)) return id;
  const tekId = id === 4 ? 4 : aile.tek;
  if (tumParfumGrubuMu(a.grup_adi)) return id === 4 ? 2 : aile.tek;
  if (!a.ciftUzman) return tekId;
  if (puigUzmanGrubuMu(a.grup_adi)) return aile.puig;
  if (hgdUzmanGrubuMu(a.grup_adi)) return aile.hgd;
  return tekId;
}

function efektifSiralamaBolumId(a) {
  return parfumSiralamaBolumId(a);
}

function isParfumSatisGrubu(marka, markaGrup, aks) {
  const isKeeper = (x) => {
    const s = normalizeName(x || "");
    return s.includes("DIOR") || s.includes("PRAIRIE") || s === "LP" || s.includes("SISLEY") || s.includes("SENSAI");
  };
  if (isKeeper(marka) || isKeeper(markaGrup)) return false; // kendi satış grubu, parfüm kovasına girmez
  const a = normalizeName(aks || "");
  return a === "" || a.includes("PARFUM");
}

function markaGrubunda(markalarJson, marka, markaGrupMap) {
  const m = normalizeName(marka || "");
  if (!m) return false;
  if (dfbPrimHaricMi(m)) return false;
  if (!markalarJson) return true; // grup tanımsızsa tüm markalar dahil
  const keys = Array.isArray(markalarJson) ? markalarJson : JSON.parse(markalarJson);
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

/** Eski Zeops kopyalarını dosya atamasından ayır. Sütun ilk eklendiğinde bir kez. */
async function ensureAtamaKaynakKolonu(conn) {
  const [cols] = await conn.query("SHOW COLUMNS FROM uzman_atama LIKE 'kaynak'");
  if (cols.length) return;
  await conn.query(
    "ALTER TABLE uzman_atama ADD COLUMN kaynak VARCHAR(16) NOT NULL DEFAULT 'dosya'"
  );
  await conn.query(
    `UPDATE uzman_atama a
     JOIN (
       SELECT donem_id, uzman_id, bolum_id, MIN(id) mid
       FROM uzman_atama
       GROUP BY donem_id, uzman_id, bolum_id
     ) m ON m.donem_id=a.donem_id AND m.uzman_id=a.uzman_id AND m.bolum_id=a.bolum_id
     SET a.kaynak='zeops'
     WHERE a.id <> m.mid`
  );
}

/** Gezici hariç, bayi tutmayan Zeops kopyasını sil. O satış prime girmez. */
async function silCaprazBayiKopyalari(conn, donemId) {
  const ph = GEZICI_ADLAR.map(() => "?").join(",");
  await conn.query(
    `DELETE a FROM uzman_atama a
     JOIN uzman u ON u.id=a.uzman_id
     JOIN magaza m ON m.id=a.magaza_id
     WHERE a.donem_id=? AND a.kaynak='zeops'
       AND u.normal_ad NOT IN (${ph})
       AND NOT EXISTS (
         SELECT 1 FROM uzman_atama d
         JOIN magaza md ON md.id=d.magaza_id
         WHERE d.donem_id=a.donem_id AND d.uzman_id=a.uzman_id AND d.kaynak='dosya'
           AND UPPER(TRIM(md.bayi)) = UPPER(TRIM(m.bayi))
       )`,
    [donemId, ...GEZICI_ADLAR]
  );
}

async function hesapla(donemId, options = {}) {
  const conn = options.connection || await pool.getConnection();
  const ownsConnection = !options.connection;
  const mukerrerMod = resolveMukerrerMod(options);
  try {
    if (ownsConnection) await conn.beginTransaction();
    await relinkDonemBeyan(conn, donemId);
    await ensureAtamaKaynakKolonu(conn);
    await silCaprazBayiKopyalari(conn, donemId);
    // Gezici: Zeops mağazasına bayi fark etmeksizin. Diğerleri: yalnız aynı bayi.
    await tamamlaEksikAtamalar(conn, donemId);
    await conn.query("DELETE FROM prim_hesap_satir WHERE donem_id=?", [donemId]);
    await conn.query("DELETE FROM prim_ozet WHERE donem_id=?", [donemId]);

    const [[donem]] = await conn.query("SELECT * FROM donem WHERE id=?", [donemId]);
    if (!donem) throw new Error("Dönem bulunamadı");
    if (donem.durum === "kapandi" && !options.allowClosed) {
      throw new Error("Kapalı dönem hesaplanamaz.");
    }

    // --- Referans verileri yükle ---
    const [atamalar] = await conn.query(
      `SELECT a.*, u.ad_soyad, u.normal_ad, m.prim_magaza, m.bayi, b.markalar, b.kanal, b.bolum_adi,
              b.grup_toplam_oran, b.max_prim_oran, b.marka_grubu_key, b.uzman_tipi, b.alt_kanal
       FROM uzman_atama a
       JOIN uzman u ON u.id=a.uzman_id
       JOIN magaza m ON m.id=a.magaza_id
       JOIN prim_bolum b ON b.id=a.bolum_id
       WHERE a.donem_id=?`, [donemId]
    );
    // Excel Group > bölüm marka listesi: Givenchy+Hermes+Dolce → GIV de dahil
    for (const a of atamalar) {
      a.hamMarkalar = a.markalar; // bölümün ham marka listesi (sıralama tabanı grup filtresi için)
      a.markalar = genisletMarkalar(a.markalar, a.grup_adi);
    }
    const parfumSayisiByMag = parfumUzmanSayisiHaritasi(atamalar);
    const ciftMag = ciftUzmanMagazaSeti(atamalar);
    for (const a of atamalar) {
      a.parfumSayisi = parfumSayisiByMag.get(a.magaza_id) || 0;
      a.ciftUzman = ciftMag.has(a.magaza_id);
      a.siralamaBolumId = efektifSiralamaBolumId(a);
    }
    const [kurallar] = await conn.query(
      `SELECT k.*, b.marka_grubu_key, b.bolum_adi AS b_adi, b.alt_kanal, b.markalar AS b_markalar, b.uzman_tipi AS b_uzman_tipi
       FROM prim_kural k
       JOIN prim_bolum b ON b.id=k.bolum_id`
    );
    const [tumBolumler] = await conn.query(
      "SELECT id, markalar, uzman_tipi, bolum_adi, grup_toplam_oran, max_prim_oran FROM prim_bolum WHERE aktif=1"
    );
    const bolumMetaById = new Map(tumBolumler.map((b) => [b.id, b]));
    for (const a of atamalar) {
      if (Number(a.siralamaBolumId) === Number(a.bolum_id)) continue;
      const meta = bolumMetaById.get(a.siralamaBolumId);
      if (!meta) continue;
      if (meta.grup_toplam_oran != null) a.grup_toplam_oran = meta.grup_toplam_oran;
      if (meta.max_prim_oran != null) a.max_prim_oran = meta.max_prim_oran;
    }
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
    const { canonOf: canonUniq, codeToUniq, normKod, normBar, refKodVariants } = await loadUniqBridge(conn);
    const barsByCanon = new Map();
    const refsByCanon = new Map();
    for (const [k, canon] of codeToUniq) {
      if (k.startsWith("b:")) {
        if (!barsByCanon.has(canon)) barsByCanon.set(canon, []);
        barsByCanon.get(canon).push(k.slice(2));
      } else if (k.startsWith("c:")) {
        if (!refsByCanon.has(canon)) refsByCanon.set(canon, []);
        refsByCanon.get(canon).push(k.slice(2));
      }
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
       LEFT JOIN urun u ON u.id=so.urun_id
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
        // LAP65187548 ↔ 65187548: aynı kalan nesnesini paylaş (çift tüketim olmasın)
        const variants = refKodVariants(r.arcon_referans);
        let kayit = null;
        for (const rk of variants) {
          const mevcut = soRefMap.get(`${r.magaza_id}|${rk}`);
          if (mevcut) {
            kayit = mevcut;
            break;
          }
        }
        if (!kayit) {
          kayit = { adet: 0, ciro: 0, marka, kalan: 0 };
        }
        kayit.adet += adet;
        kayit.ciro += ciro;
        kayit.kalan += adet;
        if (marka) kayit.marka = marka;
        for (const rk of variants) {
          soRefMap.set(`${r.magaza_id}|${rk}`, kayit);
        }
      }
      if (r.arcon_barkod) {
        addSoKayit(soBarMap, `${r.magaza_id}|${normBar(r.arcon_barkod)}`, adet, ciro, marka);
      }
      if (r.urun_id) {
        addSoKayit(soMap, `${r.magaza_id}|${r.urun_id}`, adet, ciro, marka);
      }
      // Uniq havuzu: Excel Uniq Kod köprüsü (alias'lar aynı kanona birleşir)
      const poolUniq = canonUniq(r.arcon_referans, r.arcon_barkod, r.urun_uniq)
        || (r.urun_uniq ? normKod(r.urun_uniq) : null);
      if (poolUniq) {
        addSoKayit(soUniqMap, `${r.magaza_id}|${poolUniq}`, adet, ciro, marka);
      }
    }

    // Marka -> Marka Grup öğrenilmiş eşleme (sell-out'tan)
    const [mgRows] = await conn.query(
      `SELECT DISTINCT u.marka, so.marka_grup
       FROM sellout so JOIN urun u ON u.id=so.urun_id
       WHERE so.donem_id=? AND so.marka_grup IS NOT NULL`, [donemId]
    );
    const markaGrupMap = new Map();
    for (const r of mgRows) {
      const m = normalizeName(r.marka);
      if (!m) continue;
      // Sturm sell-out'ta bazen PUIG yazar; kendi uzmanına kalsın.
      if (m.includes("STURM") || m.includes("BARBARA")) continue;
      markaGrupMap.set(m, r.marka_grup);
    }

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

    // Hedefler: (mağaza × PRİM GRUP) -> hedef ciro. Birol'un ÇOKETOPLA mantığı:
    // uzmanın Sell-Out Mağazası + Prim Grubu ikilisinin toplam hedefi.
    const [hedefRows] = await conn.query(
      "SELECT magaza_id, magaza_ham, prim_grup, hedef_ciro FROM hedef WHERE donem_id=?", [donemId]
    );
    const grupKey = (g) => normalizeName(g || "").replace(/\s*\+\s*/g, "+");
    const hedefGrupMap = new Map();      // "magazaId|GRUP" -> ciro
    const hedefGrupHamMap = new Map();   // "NORMMAGAZA|GRUP" -> ciro (magaza_id NULL fallback)
    for (const r of hedefRows) {
      const g = grupKey(r.prim_grup);
      if (!g) continue;
      const c = Number(r.hedef_ciro);
      if (r.magaza_id != null) hedefGrupMap.set(`${r.magaza_id}|${g}`, c);
      if (r.magaza_ham) hedefGrupHamMap.set(`${normalizeName(r.magaza_ham)}|${g}`, c);
    }

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
    const siraList = [];
    // Marka adı normalizasyonu: "DOLCE & GABBANA" ile "DOLCE&GABBANA" eşleşsin (& boşlukları)
    const markaKeyNorm = (x) => normalizeName(x).replace(/\s*&\s*/g, "&");
    for (const r of siraRows) {
      const cesit = cesitAnahtar(r.cesit);
      siraMap.set(`${r.magaza_id}|${cesit}|${markaKeyNorm(r.marka)}`, r.sira);
      siraList.push({ magazaId: r.magaza_id, cesit, marka: r.marka, sira: Number(r.sira) });
    }

    // Beyan satırları:
    // - urun_id resolved olanları JOIN'le urun.marka'yı alıyoruz
    // - urun_id NULL olsa bile (barkod tanınmamış) hesap denemek üzere dahil et,
    //   çünkü fallback (arcon_referans / arcon_barkod) ile sell-out'ta bulunabilir
    // - atama_yok / urun_yok gibi düşürülmüş kayıtları da dahil et; hesap motoru
    //   bolumSec ve fallback'e göre kendi kararını verecek. Böylece Excel'deki
    //   "beyanda ne varsa görelim" mantığına yakın davranıyoruz.
    const [beyanlar] = await conn.query(
      `SELECT b.*, u.marka AS urun_marka, u.uniq_kod AS urun_uniq, u.aks AS urun_aks FROM satis_beyan b
       LEFT JOIN urun u ON u.id=b.urun_id
       WHERE b.donem_id=? AND b.magaza_id IS NOT NULL
         AND (b.durum IS NULL OR b.durum LIKE 'Tamamland%')
       ORDER BY b.satis_tarihi, b.id`, [donemId]
    );

    // urun_id boş / inceleme kalanlar için barkod-referans → marka fallback
    const resolver = await loadProductResolver(conn);
    const uniqBridge = await loadUniqBridge(conn);
    async function markaCoz(b) {
      if (b.urun_marka) return b.urun_marka;
      const match = await resolveProductWithBridge(
        conn, resolver, { barcode: b.barkod, reference: b.kod }, uniqBridge,
      );
      if (match.status === "ok" && match.matches?.[0]?.marka) {
        b.urun_id = b.urun_id || match.productId;
        if (!b.urun_aks) b.urun_aks = match.matches[0].aks || null;
        return match.matches[0].marka;
      }
      return null;
    }

    // Master atama + Zeops’ta satışı olup kopyalanan mağazalar.
    // Kopya yoksa (uzmanın hiç senaryosu yoksa) o mağaza kapsam dışı kalır.
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
    // Gezici: Zeops mağazası. Aynı bayi: Zeops kalır. Farklı bayi: prim yok.
    function resolveSoMagaza(uzmanId, magazaId) {
      const list = uzmanBolumler.get(uzmanId) || [];
      return resolvePrimMagaza({
        uzmanNormal: list[0]?.normal_ad || "",
        zeopsMagazaId: magazaId,
        atamalar: list,
        bayiOf: (id) => normalizeName(magazaBayi.get(id) || ""),
      });
    }

    // Prim: mağazada ataması varsa ver. Karşı parfüm grubu da aynı senaryoyla prime girer.
    // DFB (Narciso / Issey / Zadig) tik açıkken prime girmez.
    const dfbPrimDisi = donem.dfb_prim_disi == null || Number(donem.dfb_prim_disi) === 1;
    function bolumSec(uzmanId, magazaId, urunMarka, aks) {
      const dogrudanlar = atamaByUzmanMagaza.get(`${uzmanId}|${magazaId}`) || [];
      if (!dogrudanlar.length) return null;
      if (dfbPrimDisi && dfbPrimHaricMi(urunMarka)) return null;
      for (const d of dogrudanlar) {
        if (markaGrubunda(d.markalar, urunMarka, markaGrupMap)) return d;
      }
      return dogrudanlar[0];
    }

    // Excel Uniq Kod master: farklı referans/barkod aynı UNIQ KOD ise tek havuz
    // (GVCP036792 + GVCP090770 → GVCP00000018). Ayrı uniq'ler birleşmez.
    function havuzAnahtar(b, canon) {
      if (canon) return normKod(canon);
      if (b.urun_uniq) return normKod(b.urun_uniq);
      return null;
    }

    function selloutKaydiBul(magazaId, b) {
      const canon = canonUniq(b.kod, b.barkod, b.urun_uniq);
      const pool = havuzAnahtar(b, canon);
      let so = null;
      let soKaynakKey = null;
      if (pool) {
        const uniqHit = soUniqMap.get(`${magazaId}|${pool}`);
        if (uniqHit) {
          so = uniqHit;
          soKaynakKey = `uniq:${magazaId}|${pool}`;
        }
      }
      if (!so && b.kod) {
        for (const rk of refKodVariants(b.kod)) {
          const refAlt = soRefMap.get(`${magazaId}|${rk}`);
          if (refAlt) {
            so = refAlt;
            soKaynakKey = pool ? `uniq:${magazaId}|${pool}` : `ref:${magazaId}|${rk}`;
            break;
          }
        }
      }
      if (!so && b.barkod) {
        const barAlt = soBarMap.get(`${magazaId}|${normBar(b.barkod)}`);
        if (barAlt) {
          so = barAlt;
          soKaynakKey = pool ? `uniq:${magazaId}|${pool}` : `bar:${magazaId}|${normBar(b.barkod)}`;
        }
      }
      // Uniq tutmazsa aynı ürünün diğer barkod / referansları (eski-yeni kod)
      if (!so && canon) {
        for (const bar of barsByCanon.get(canon) || []) {
          const barAlt = soBarMap.get(`${magazaId}|${bar}`);
          if (barAlt) {
            so = barAlt;
            soKaynakKey = pool ? `uniq:${magazaId}|${pool}` : `bar:${magazaId}|${bar}`;
            break;
          }
        }
      }
      if (!so && canon) {
        for (const ref of refsByCanon.get(canon) || []) {
          let hit = null;
          let hitKod = null;
          for (const rk of refKodVariants(ref)) {
            const refAlt = soRefMap.get(`${magazaId}|${rk}`);
            if (refAlt) {
              hit = refAlt;
              hitKod = rk;
              break;
            }
          }
          if (hit) {
            so = hit;
            soKaynakKey = pool ? `uniq:${magazaId}|${pool}` : `ref:${magazaId}|${hitKod}`;
            break;
          }
        }
      }
      if (!so && canon && canon !== pool) {
        const canonHit = soUniqMap.get(`${magazaId}|${canon}`);
        if (canonHit) {
          so = canonHit;
          soKaynakKey = pool ? `uniq:${magazaId}|${pool}` : `uniq:${magazaId}|${canon}`;
        }
      }
      if (!so && b.urun_id) {
        const idAlt = soMap.get(`${magazaId}|${b.urun_id}`);
        if (idAlt) {
          so = idAlt;
          soKaynakKey = pool ? `uniq:${magazaId}|${pool}` : `urun:${magazaId}|${b.urun_id}`;
        }
      }
      return { so, soKaynakKey, pool };
    }

    function selloutEsle(b) {
      const { so: soHam, soKaynakKey: keyHam } = selloutKaydiBul(b.magaza_id, b);
      let so = soHam;
      let soKaynakKey = keyHam;
      if (!soKaynakKey) soKaynakKey = `x:${b.id}`;
      so = soUzmanIcin(b.uzman_id, so, soKaynakKey);

      let primAdet = 0, birim = 0, aciklama = null;
      if (so && so.adet > 0) {
        birim = so.ciro / so.adet;
        const kullanilabilir = Math.max(0, so.kalan);
        const beyanAdet = Number(b.adet) || 0;
        const oncePrimAlindi = so.adet - so.kalan;
        const karar = selloutSatirKarari(beyanAdet, kullanilabilir, oncePrimAlindi, so.adet);
        primAdet = karar.primAdet;
        aciklama = karar.aciklama;
        if (primAdet > 0) so.kalan -= primAdet;
      } else {
        aciklama = "Mağazada Eşleşmeyen Satış";
      }
      return { primAdet, birim, aciklama, primeEsas: +(primAdet * birim).toFixed(2) };
    }

    // ---- 1) Satır bazlı prime esas tutar (sell-out tahsisi) ----
    const hesapSatirlari = [];
    const inGroupByBeyan = new Map(); // beyan_id -> ürün, atama grubunda mı (sıralama tabanı için)
    // uzman × mağaza × bölüm — aynı noktada iki grup ayrı özet satırı üretir
    const ozetMap = new Map(); // "uzman|magaza|bolum" -> özet akümülatörü
    // Sevil DIOR kolonları: grupta DIOR olmasa bile (DG+LP, Sisley…) DIOR satış dilimi
    // üzerinden Mağaza %0.50 / Parfüm ilk 2 %0.33 (Excel Prim Hesaplama M/O)
    const sevilDiorEsas = new Map(); // "uzman|magaza" -> DIOR prime esas
    const beymenMarkaEsas = []; // Beymen özel cilt: markanın kendi prime esası
    const beyanDurumGuncelle = []; // { id, durum } — satır satır UPDATE yerine toplu

    for (const b of beyanlar) {
      const urunMarka = await markaCoz(b);
      b.urun_marka = urunMarka;
      if (!urunMarka) {
        // Atama var olsa bile marka bilinmeden grup kararı verilemez
        beyanDurumGuncelle.push({ id: b.id, durum: "urun_yok" });
        continue;
      }
      const soMagazaId = resolveSoMagaza(b.uzman_id, b.magaza_id);
      if (soMagazaId == null) {
        hesapSatirlari.push([
          donemId, b.id, b.uzman_id, b.magaza_id, null, b.uniq_kod_id,
          b.urun_id, b.adet, 0, 0, 0, "Mağazada Eşleşmeyen Satış",
        ]);
        beyanDurumGuncelle.push({ id: b.id, durum: "atama_yok" });
        continue;
      }
      const bSo = { ...b, magaza_id: soMagazaId };
      const atama = bolumSec(b.uzman_id, soMagazaId, urunMarka, b.urun_aks);
      const isDiorUrun = normalizeName(urunMarka).includes("DIOR");
      const isSevilMag = normalizeName(magazaBayi.get(b.magaza_id) || "").includes("SEVIL")
        || normalizeName(magazaBayi.get(soMagazaId) || "").includes("SEVIL");
      const uzmaninAtamasiVar = (uzmanBolumler.get(b.uzman_id) || []).length > 0;

      if (!atama) {
        // Prim yok; Rapor Açıklama yine Excel gibi Ok / Mükerrer / Mağazada.
        // Havuzu düşürme — grup dışı sığan primi in-group uzmandan çalmasın.
        let aciklama = "Mağazada Eşleşmeyen Satış";
        if (isDiorUrun && isSevilMag && uzmaninAtamasiVar) {
          const esle = selloutEsle(bSo);
          if (esle.primeEsas > 0) {
            const dk = `${b.uzman_id}|${soMagazaId}`;
            sevilDiorEsas.set(dk, (sevilDiorEsas.get(dk) || 0) + esle.primeEsas);
          }
          aciklama = esle.aciklama;
        } else {
          const { so } = selloutKaydiBul(soMagazaId, b);
          if (so && so.adet > 0) {
            aciklama = selloutSatirKarari(Number(b.adet) || 0, so.adet, 0, so.adet).aciklama;
          }
        }
        hesapSatirlari.push([
          donemId, b.id, b.uzman_id, soMagazaId, null, b.uniq_kod_id,
          b.urun_id, b.adet, 0, 0, 0, aciklama,
        ]);
        beyanDurumGuncelle.push({ id: b.id, durum: "atama_yok" });
        continue;
      }

      const { primAdet, birim, aciklama, primeEsas } = selloutEsle(bSo);
      if (primeEsas > 0 && normalizeName(magazaBayi.get(soMagazaId) || "").includes("BEYMEN")) {
        beymenMarkaEsas.push({
          uzmanId: b.uzman_id,
          magazaId: soMagazaId,
          marka: urunMarka,
          esas: primeEsas,
        });
      }
      if (isDiorUrun && isSevilMag && primeEsas > 0) {
        const dk = `${b.uzman_id}|${soMagazaId}`;
        sevilDiorEsas.set(dk, (sevilDiorEsas.get(dk) || 0) + primeEsas);
      }
      hesapSatirlari.push([
        donemId, b.id, b.uzman_id, soMagazaId, atama.bolum_id, b.uniq_kod_id,
        b.urun_id, b.adet, primAdet, +birim.toFixed(2), primeEsas, aciklama,
      ]);
      inGroupByBeyan.set(b.id, isParfumSatisGrubu(urunMarka, markaGrupMap.get(normalizeName(urunMarka)), b.urun_aks));
      const key = `${b.uzman_id}|${soMagazaId}|${atama.bolum_id}`;
      if (!ozetMap.has(key)) {
        ozetMap.set(key, { atama: { ...atama, magaza_id: soMagazaId }, primeEsas: 0, adet: 0 });
      }
      if (b.eslesme_durum === "atama_yok") {
        beyanDurumGuncelle.push({ id: b.id, durum: "ok" });
      }
    }

    ozetEsasiNetDoldur(hesapSatirlari, ozetMap, inGroupByBeyan);

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
    function ciroHedefiTutuyorMu(magazaId, markalarJson, grupAdi, esasBaz) {
      // Birol mantığı: kıyas uzmanın kendi prime-esas'ı (esasBaz).
      const kendiEsas = Number(esasBaz || 0);
      const markalar = grupMarkalari(markalarJson, tumMarkalar, markaGrupMap);
      let gerceklesen = 0;
      for (const m of markalar) gerceklesen += mapGetMarka(cirodanMarka, magazaId, m);
      // Hedef: (mağaza × Prim Grup) tek değeri. Önce magaza_id, yoksa ham ad ile.
      const g = grupKey(grupAdi);
      let hedefToplam = hedefGrupMap.get(`${magazaId}|${g}`);
      if (hedefToplam == null) {
        const st = normalizeName(magazaMap.get(magazaId) || "");
        if (st) hedefToplam = hedefGrupHamMap.get(`${st}|${g}`);
      }
      if (hedefToplam == null) return { tuttu: false, neden: "hedef verisi yok", kendiEsas, gerceklesen, hedefToplam: 0 };
      return { tuttu: kendiEsas >= hedefToplam, kendiEsas, gerceklesen, hedefToplam };
    }

    function siralamaMarkaTutuyorMu(magazaId, markalarJson, hedefler) {
      // Satırdaki eşiklerin hepsi birlikte tutulmalı (VE). Biri tutmazsa satır tutmaz.
      const list = hedefler || [];
      if (!list.length) return { tuttu: false, neden: "hedef tanımı yok", detay: [] };
      const markalar = grupMarkalari(markalarJson, tumMarkalar, markaGrupMap);
      const sonuclar = [];
      for (const h of list) {
        const sayi = markalar.filter((m) => {
          const s = siraMap.get(`${magazaId}|PARFUM|${markaKeyNorm(m)}`);
          return s && s <= h.hedef_sira;
        }).length;
        sonuclar.push({ ilk: h.hedef_sira, gereken: h.hedef_marka_sayisi, bulunan: sayi, tuttu: sayi >= (h.hedef_marka_sayisi || 1) });
      }
      return { tuttu: sonuclar.every((s) => s.tuttu), detay: sonuclar };
    }

    function kategoriSiralamaTutuyorMu(magazaId, markalarJson, kategori, hedefSira) {
      const markalar = grupMarkalari(markalarJson, tumMarkalar, markaGrupMap);
      const enIyi = markalar
        .map((m) => siraMap.get(`${magazaId}|${kategori}|${markaKeyNorm(m)}`))
        .filter((s) => s != null);
      if (!enIyi.length) return { tuttu: false, neden: "sıralama verisi yok" };
      const min = Math.min(...enIyi);
      return { tuttu: min <= hedefSira, sira: min };
    }

    // Aynı Sevil mağazada birden fazla bölüm özeti olsa da DIOR kolonları bir kez
    const sevilDiorKolonVerildi = new Set();

    // Beymen LP/Sensai/Sisley sabit TL kademeleri — prim_kural ekranından
    const beymenCiltKademe = (() => {
      const out = {
        LP: { cilt: [] },
        SENSAI: { cilt: [], makyaj: [] },
        SISLEY: { cilt: [], makyaj: [] },
      };
      for (const k of kurallar) {
        if (k.satir_tipi !== "kural") continue;
        if (String(k.prim_tip || "").toLowerCase() !== "sabit_tl") continue;
        const bolum = normalizeName(k.b_adi || "");
        const alt = normalizeName(k.alt_kanal || "");
        let marka = null;
        if (bolum.includes("LP") && alt.includes("BEYMEN")) marka = "LP";
        else if (bolum.includes("SENSAI") && bolum.includes("BEYMEN")) marka = "SENSAI";
        else if (bolum.includes("SISLEY") && bolum.includes("BEYMEN")) marka = "SISLEY";
        if (!marka) continue;
        const ad = normalizeName(k.kriter_adi || "");
        let bucket = null;
        if (k.kriter_key === "makyaj_siralama" || ad.includes("MAKYAJ")) bucket = "makyaj";
        else if (k.kriter_key === "cilt_siralama" || ad.includes("CILT")) bucket = "cilt";
        if (!bucket || !out[marka][bucket]) continue;
        const hedefler = hedeflerByKural.get(k.id) || [];
        let max = hedefler[0]?.hedef_sira;
        if (max == null) {
          const m = ad.match(/ILK\s*(\d+)/);
          max = m ? Number(m[1]) : null;
        }
        if (max == null || !Number.isFinite(Number(max))) continue;
        out[marka][bucket].push({ max: Number(max), tutar: Number(k.prim_tutar || 0) });
      }
      for (const mk of Object.keys(out)) {
        for (const b of Object.keys(out[mk])) {
          out[mk][b].sort((a, c) => a.max - c.max);
        }
      }
      return out;
    })();

    const beymenCilt = beymenCiltPrimleri({
      kuralSeti: donem.kural_seti,
      satirlar: beymenMarkaEsas,
      siralar: siraList,
      magazaAd: magazaMap,
      kademe: beymenCiltKademe,
    });
    const beymenCiltYazildi = new Set();

    /** Bu sıralama kuralları beymenCiltPrimleri ile ödenir — çift yazmamak için atlanır. */
    const beymenCiltKuralMi = (k) => {
      const bolum = normalizeName(k.b_adi || "");
      const alt = normalizeName(k.alt_kanal || "");
      if (bolum.includes("LP") && alt.includes("BEYMEN")) return true;
      if (bolum.includes("SENSAI") && bolum.includes("BEYMEN")) return true;
      if (bolum.includes("SISLEY") && bolum.includes("BEYMEN")) return true;
      return false;
    };
    const BEYMEN_CILT_KRITER = new Set([
      "cilt_siralama", "makyaj_siralama", "ozel", "magaza_birinci",
    ]);

    // ---- 3) Uzman × mağaza bazında kuralları uygula ----
    // Kardeş uzmanların (bonus kuralı) kendi prime-esas'ı: (uzman|magaza|bolum) -> esas
    const esasByUMB = new Map();
    for (const _acc of ozetMap.values()) {
      const _a = _acc.atama;
      esasByUMB.set(`${_a.uzman_id}|${_a.magaza_id}|${_a.bolum_id}`, _acc.primeEsas);
    }

    // 2+ uzman Sephora (6+7) ve Boyner (11+12): her iki grubun sıralama satırlarından
    // en az biri ve her uzmanın kendi ciro hedefi tutarsa kalan %0,5 T kolonuna gider.
    function ikiGrupSiralamaCifti(bolumId) {
      const id = Number(bolumId);
      if (id === 6 || id === 7) return [6, 7];
      if (id === 11 || id === 12) return [11, 12];
      return null;
    }
    function grupSiralamaTuttu(magazaId, bolumId) {
      const meta = bolumMetaById.get(bolumId);
      const havuz = meta?.markalar;
      const kurallarB = (kurallarByBolum.get(bolumId) || [])
        .filter((x) => x.satir_tipi === "kural" && x.kriter_key === "siralama_marka");
      if (!kurallarB.length || !havuz) return false;
      const sayim = siralamaSayimMarkalari({ hamMarkalar: havuz }, havuz);
      return kurallarB.some((k) => siralamaMarkaTutuyorMu(
        magazaId,
        sayim,
        siralamaHedefFiltre(hedeflerByKural.get(k.id) || [])
      ).tuttu);
    }
    function kisiCiroTuttu(x) {
      return ciroHedefiTutuyorMu(
        x.magaza_id,
        x.markalar,
        x.grup_adi,
        esasByUMB.get(`${x.uzman_id}|${x.magaza_id}|${x.bolum_id}`) || 0
      ).tuttu;
    }
    function grupCiroTuttu(magazaId, bolumId) {
      const kisiler = atamalar.filter(
        (x) => x.magaza_id === magazaId && Number(x.siralamaBolumId) === Number(bolumId)
      );
      if (!kisiler.length) return false;
      return kisiler.some((x) => kisiCiroTuttu(x));
    }
    const ikiGrupCache = new Map();
    function ikiGrupKalanYarim(magazaId, siralamaBolumId) {
      const cift = ikiGrupSiralamaCifti(siralamaBolumId);
      if (!cift) return false;
      const key = `${magazaId}|${cift[0]}`;
      if (ikiGrupCache.has(key)) return ikiGrupCache.get(key);
      const ok = cift.every(
        (bid) => grupSiralamaTuttu(magazaId, bid) && grupCiroTuttu(magazaId, bid)
      );
      ikiGrupCache.set(key, ok);
      return ok;
    }

    for (const [key, acc] of ozetMap) {
      const a = acc.atama;
      const efektifBolumId = a.siralamaBolumId || a.bolum_id;
      const bolumKurallari = (kurallarByBolum.get(efektifBolumId) || []).filter((k) => k.satir_tipi === "kural");
      const detay = [];
      let satisOran = 0, hedefOran = 0, siralamaOran = 0, bonusOran = 0, siralamaMarkaOran = 0;
      let tKolonOran = 0;
      const siralamaMarkaIslendi = { done: false };
      let diorKolonTutar = 0;
      let sabitKuralTutar = 0;
      const kademeSiralamaIslendi = new Set();

      // Sevil + DIOR sıralama → Excel M/O kolonları (Parfüm Tüm VEYA grupta DIOR olmasa bile)
      const gNormAtama = normalizeName(a.grup_adi || "");
      const isTumParfumAtama = gNormAtama.includes("TUM MARKA")
        || gNormAtama.includes("PARFUM");
      const isSevilAtama = normalizeName(magazaBayi.get(a.magaza_id) || a.bayi || "").includes("SEVIL");
      const diorMagSira = isSevilAtama
        ? Number(siraMap.get(`${a.magaza_id}|GENEL|DIOR`))
        : null;
      const diorParSira = isSevilAtama
        ? Number(siraMap.get(`${a.magaza_id}|PARFUM|DIOR`))
        : null;
      const diorMakSira = isSevilAtama
        ? Number(siraMap.get(`${a.magaza_id}|MAKYAJ|DIOR`))
        : null;
      const diorCiltSira = isSevilAtama
        ? Number(siraMap.get(`${a.magaza_id}|CILT|DIOR`))
        : null;
      const diorEsas = Number(sevilDiorEsas.get(`${a.uzman_id}|${a.magaza_id}`) || 0);
      const isDiorBolumA = normalizeName(a.bolum_adi || "").includes("DIOR");
      const sevilDiorKolon = isSevilAtama
        && !isDiorBolumA
        && diorEsas > 0
        && ((diorMagSira === 1) || (diorParSira > 0 && diorParSira <= 2)
            || (diorMakSira === 1) || (diorCiltSira > 0 && diorCiltSira <= 3));
      // Parfüm Tüm'de DIOR kolon önceliği Puig siralama_marka yığılmasını keser
      const sevilDiorMarkaOncelik = sevilDiorKolon && isTumParfumAtama;

      const kuralSabitMi = (k) => String(k.prim_tip || "yuzde").toLowerCase() === "sabit_tl";
      /** Koşul tuttuysa % kovasına ekle veya sabit TL yaz; detay satırı üretir. */
      const odulUygula = (k, sonuc, oranEkle) => {
        if (!sonuc.tuttu) {
          detay.push({
            kural: k.kriter_adi, kriter: k.kriter_key,
            oran: Number(k.prim_oran || 0), prim_tip: k.prim_tip || "yuzde",
            ...sonuc,
          });
          return;
        }
        if (kuralSabitMi(k)) {
          const tutar = +Number(k.prim_tutar || 0).toFixed(2);
          sabitKuralTutar += tutar;
          detay.push({
            kural: k.kriter_adi, kriter: k.kriter_key,
            oran: 0, prim_tip: "sabit_tl", tutar, tip: "sabit_kural",
            ...sonuc,
          });
          return;
        }
        oranEkle(Number(k.prim_oran || 0));
        detay.push({
          kural: k.kriter_adi, kriter: k.kriter_key,
          oran: Number(k.prim_oran || 0), prim_tip: "yuzde",
          ...sonuc,
        });
      };

      for (const k of bolumKurallari) {
        const hedefler = hedeflerByKural.get(k.id) || [];
        let sonuc = { tuttu: false };
        // Beymen LP/Sensai/Sisley sıralama sabitleri → beymenCiltPrimleri (çift prim yok)
        if (beymenCiltKuralMi(k) && BEYMEN_CILT_KRITER.has(k.kriter_key)) {
          detay.push({
            kural: k.kriter_adi,
            kriter: k.kriter_key,
            oran: Number(k.prim_oran || 0),
            prim_tip: k.prim_tip || "yuzde",
            tutar: Number(k.prim_tutar || 0),
            tuttu: false,
            neden: "beymen_cilt motoru uygular",
          });
          continue;
        }
        switch (k.kriter_key) {
          case "satis_basi":
            odulUygula(k, { tuttu: true }, (oran) => { satisOran += oran; });
            // satis detayına tip ekle (odulUygula zaten yazdı; satışı işaretle)
            if (detay.length) {
              const son = detay[detay.length - 1];
              if (son.kural === k.kriter_adi) son.tip = son.tip || "satis";
            }
            continue;
          case "ciro_hedefi":
          case "ciro_hedefi_kosullu":
          case "hedef_tutarsa":
            sonuc = ciroHedefiTutuyorMu(a.magaza_id, a.markalar, a.grup_adi, acc.primeEsas);
            odulUygula(k, sonuc, (oran) => { hedefOran += oran; });
            continue;
          case "siralama_marka":
            // Tüm siralama_marka kardeşleri tek seferde (TEK kapısı / Parfüm Tüm çift tablo / exclusive)
            if (siralamaMarkaIslendi.done) continue;
            siralamaMarkaIslendi.done = true;
            if (sevilDiorMarkaOncelik) {
              for (const sk of bolumKurallari.filter((x) => x.kriter_key === "siralama_marka")) {
                detay.push({
                  kural: sk.kriter_adi, kriter: "siralama_marka",
                  oran: Number(sk.prim_oran || 0), prim_tip: sk.prim_tip || "yuzde",
                  tuttu: false, neden: "Sevil DIOR kolon önceliği",
                });
              }
              continue;
            }
            {
              const bolumIds = [efektifBolumId];
              const adaylar = []; // { kural, sonuc, oran, bid }
              for (const bid of bolumIds) {
                const bMeta = bolumMetaById.get(bid);
                const bMarkalar = bMeta?.markalar || a.hamMarkalar;
                const sayim = siralamaSayimMarkalari(
                  {
                    ...a,
                    hamMarkalar: bMarkalar,
                    uzman_tipi: bMeta?.uzman_tipi || a.uzman_tipi,
                    bolum_adi: bMeta?.bolum_adi || a.bolum_adi,
                  },
                  bMarkalar
                );
                const kurallarB = (kurallarByBolum.get(bid) || []).filter(
                  (x) => x.satir_tipi === "kural" && x.kriter_key === "siralama_marka"
                ).sort((a, b) => Number(a.id) - Number(b.id));
                kurallarB.forEach((sk, kolon) => {
                  const hh = siralamaHedefFiltre(hedeflerByKural.get(sk.id) || []);
                  const r = siralamaMarkaTutuyorMu(a.magaza_id, sayim, hh);
                  adaylar.push({ kural: sk, sonuc: r, oran: Number(sk.prim_oran || 0), bid, kolon });
                });
              }
              // Her satır kendi VE eşikleriyle bağımsız. Tutan satırın oranı yazılır.
              // kolon: sayfadaki sıra. 0 = %1, 1 = ilk %0,5, 2 = ikinci %0,5.
              for (const x of adaylar) {
                odulUygula(
                  x.kural,
                  { ...x.sonuc, kolon: x.kolon },
                  (oran) => { siralamaMarkaOran += oran; }
                );
              }
            }
            continue;
          case "cilt_siralama":
          case "makyaj_siralama": {
            // Aynı kriterde birden fazla eşik (ilk 2 / ilk 5 veya cilt 1/2/3) → exclusive kademe
            // (Birol: makyaj ilk2=%1 yoksa ilk5=%0,5; cilt 1=%1,5 / 2=%1 / 3=%0,5 — toplanmaz)
            const kriterKey = k.kriter_key;
            if (kademeSiralamaIslendi.has(kriterKey)) continue;
            kademeSiralamaIslendi.add(kriterKey);
            const kat = kriterKey === "cilt_siralama" ? "CILT" : "MAKYAJ";
            const kardesler = bolumKurallari.filter((x) => x.kriter_key === kriterKey);
            const kademeler = kardesler.map((x) => {
              const hh = hedeflerByKural.get(x.id) || [];
              let max = Number(hh[0]?.hedef_sira);
              if (!Number.isFinite(max)) {
                const m = normalizeName(x.kriter_adi || "").match(/ILK\s*(\d+)/);
                max = m ? Number(m[1]) : (kat === "CILT" ? 3 : 5);
              }
              return { kural: x, max };
            }).sort((a, b) => a.max - b.max);
            const enGenis = kademeler.length ? kademeler[kademeler.length - 1].max : (kat === "CILT" ? 3 : 5);
            const baz = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, kat, enGenis);
            let secilen = null;
            if (baz.tuttu && baz.sira != null) {
              for (const kad of kademeler) {
                if (Number(baz.sira) <= kad.max) { secilen = kad; break; }
              }
            }
            for (const kad of kademeler) {
              if (secilen && kad.kural.id === secilen.kural.id) {
                odulUygula(kad.kural, { tuttu: true, sira: baz.sira }, (oran) => { siralamaOran += oran; });
              } else {
                detay.push({
                  kural: kad.kural.kriter_adi,
                  kriter: kriterKey,
                  oran: Number(kad.kural.prim_oran || 0),
                  prim_tip: kad.kural.prim_tip || "yuzde",
                  tuttu: false,
                  sira: baz.sira,
                  neden: secilen
                    ? `exclusive kademe: ${secilen.kural.kriter_adi}`
                    : (baz.neden || "sıra tutmadı"),
                });
              }
            }
            continue;
          }
          case "parfum_siralama":
            sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "PARFUM", hedefler[0]?.hedef_sira || 2);
            odulUygula(k, sonuc, (oran) => { siralamaOran += oran; });
            continue;
          case "sac_siralama":
            sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "SAC", hedefler[0]?.hedef_sira || 1);
            odulUygula(k, sonuc, (oran) => { siralamaOran += oran; });
            continue;
          case "magaza_birinci":
            sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "GENEL", 1);
            if (!sonuc.tuttu) {
              // genel çeşit yoksa parfüm 1.liğine bak
              sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "PARFUM", 1);
            }
            odulUygula(k, sonuc, (oran) => { siralamaOran += oran; });
            continue;
          case "kumul_siralama":
            sonuc = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, "GENEL", hedefler[0]?.hedef_sira || 1);
            odulUygula(k, sonuc, (oran) => { siralamaOran += oran; });
            continue;
          case "ozel": {
            // "SIRALAMA İLK N OLURSA" (Sensai) → GENEL; "CİLT BAKIMINDA İLK N" (Sisley) → CİLT.
            // Aynı kategoride birden fazla eşik (ilk 2 / ilk 4) → exclusive (Birol: yalnız en sıkı).
            const ad0 = normalizeName(k.kriter_adi || "");
            let kat = "GENEL";
            if (ad0.includes("CILT")) kat = "CILT";
            else if (ad0.includes("MAKYAJ")) kat = "MAKYAJ";
            else if (ad0.includes("SAC")) kat = "SAC";
            else if (ad0.includes("PARF")) kat = "PARFUM";
            const ozelKey = `ozel:${kat}`;
            if (kademeSiralamaIslendi.has(ozelKey)) continue;
            kademeSiralamaIslendi.add(ozelKey);
            const kardesler = bolumKurallari.filter((x) => {
              if (x.kriter_key !== "ozel") return false;
              const adx = normalizeName(x.kriter_adi || "");
              let kx = "GENEL";
              if (adx.includes("CILT")) kx = "CILT";
              else if (adx.includes("MAKYAJ")) kx = "MAKYAJ";
              else if (adx.includes("SAC")) kx = "SAC";
              else if (adx.includes("PARF")) kx = "PARFUM";
              return kx === kat;
            });
            const kademeler = kardesler.map((x) => {
              const m = normalizeName(x.kriter_adi || "").match(/ILK\s*(\d+)/);
              return { kural: x, max: m ? Number(m[1]) : 1 };
            }).sort((a, b) => a.max - b.max);
            const enGenis = kademeler.length ? kademeler[kademeler.length - 1].max : 1;
            const baz = kategoriSiralamaTutuyorMu(a.magaza_id, a.markalar, kat, enGenis);
            let secilen = null;
            if (baz.tuttu && baz.sira != null) {
              for (const kad of kademeler) {
                if (Number(baz.sira) <= kad.max) { secilen = kad; break; }
              }
            }
            for (const kad of kademeler) {
              if (secilen && kad.kural.id === secilen.kural.id) {
                odulUygula(kad.kural, { tuttu: true, sira: baz.sira }, (oran) => { siralamaOran += oran; });
              } else {
                detay.push({
                  kural: kad.kural.kriter_adi,
                  kriter: "ozel",
                  oran: Number(kad.kural.prim_oran || 0),
                  prim_tip: kad.kural.prim_tip || "yuzde",
                  tuttu: false,
                  sira: baz.sira,
                  neden: secilen
                    ? `exclusive kademe: ${secilen.kural.kriter_adi}`
                    : (baz.neden || "sıra tutmadı"),
                });
              }
            }
            continue;
          }
          default:
            sonuc = { tuttu: false, neden: "manuel değerlendirme gerekli (özel kural)" };
            detay.push({ kural: k.kriter_adi, kriter: k.kriter_key, oran: k.prim_oran, prim_tip: k.prim_tip || "yuzde", ...sonuc });
        }
      }

      // Sevil DIOR kolonları: DIOR satış dilimi × oran (Excel M/O satır bazlı)
      const diorKolonKey = `${a.uzman_id}|${a.magaza_id}`;
      // Sevil DIOR (genel Dior primi): 4 kolon, HEPSİ tam DIOR cirosu üzerinden.
      //   Mağaza 1.lik %0,50 | Makyaj ilk1 %0,33 | Parfüm ilk2 %0,34 | Cilt ilk3 %0,33
      if (sevilDiorKolon && !sevilDiorKolonVerildi.has(diorKolonKey)) {
        sevilDiorKolonVerildi.add(diorKolonKey);
        const diorPush = (kosul, kriter, oran, ad, sira) => {
          if (!kosul) return;
          const tutar = +(diorEsas * oran / 100).toFixed(2);
          diorKolonTutar += tutar;
          detay.push({
            kural: ad, kriter, oran, tuttu: true, sira,
            esas_baz: +diorEsas.toFixed(2), tutar, tip: "sevil_dior",
          });
        };
        diorPush(diorMagSira === 1, "magaza_birinci", 0.5, "DIOR Mağaza 1.lik (Sevil)", 1);
        diorPush(diorMakSira === 1, "makyaj_siralama", 0.33, "DIOR Makyaj ilk 1 (Sevil)", diorMakSira);
        diorPush(diorParSira > 0 && diorParSira <= 2, "parfum_siralama", 0.34, "DIOR Parfüm ilk 2 (Sevil)", diorParSira);
        diorPush(diorCiltSira > 0 && diorCiltSira <= 3, "cilt_siralama", 0.33, "DIOR Cilt ilk 3 (Sevil)", diorCiltSira);
      }

      // Sevil parfüm sıralaması yalnız parfüm grubuna (Parfüm Tüm, Puig, Hermes/DG veya parfümle karma).
      // La Prairie / Sisley / Sensai kendi cilt-makyaj primini alır; parfüm sayfasına yazılmaz.
      {
        const sevilParfumRst = isSevilAtama && parfumUzmanGrubuMu(a.grup_adi);
        const zatenSira = bolumKurallari.some((x) => x.kriter_key === "siralama_marka");
        if (sevilParfumRst && !zatenSira && siralamaMarkaOran === 0) {
          let baseId = 9;
          if (a.ciftUzman && !tumParfumGrubuMu(a.grup_adi)) {
            baseId = hgdUzmanGrubuMu(a.grup_adi) ? 12 : 11;
          }
          const bolumIds = [baseId];
          for (const bid of bolumIds) {
            const bMeta = bolumMetaById.get(bid);
            const havuz = bMeta?.markalar || ["PUIG", "HERMES", "DG", "GIV"];
            const sayim = siralamaSayimMarkalari({ ...a, hamMarkalar: havuz }, havuz);
            const kurallarB = (kurallarByBolum.get(bid) || []).filter(
              (x) => x.satir_tipi === "kural" && x.kriter_key === "siralama_marka"
            ).sort((a, b) => Number(a.id) - Number(b.id));
            kurallarB.forEach((sk, kolon) => {
              const r = siralamaMarkaTutuyorMu(
                a.magaza_id,
                sayim,
                siralamaHedefFiltre(hedeflerByKural.get(sk.id) || [])
              );
              odulUygula(
                sk,
                { ...r, kolon, not: "Sevil parfüm sıralama" },
                (oran) => { siralamaMarkaOran += oran; }
              );
            });
          }
        }
      }

      // iki_grup_bonus tam %1 yazılmaz. 2+ Sephora/Boyner'de kalan %0,5 T kolonundadır.
      const bonusKurallari = kurallar.filter(
        (k) => k.satir_tipi === "bonus" && k.b_adi === a.bolum_adi
          && k.kriter_key !== "iki_grup_bonus"
          && !normalizeName(k.kriter_adi || "").includes("IKI GRUP")
      );
      for (const bk of bonusKurallari) {
        // Aynı mağazadaki tüm kardeş senaryolar (aynı bolum_adi) için
        // ciro + ilk sıralama kuralı tutuyor mu?
        const kardesler = atamalar.filter(
          (x) => x.magaza_id === a.magaza_id && x.bolum_adi === a.bolum_adi
        );
        const hepsiTuttu = kardesler.length > 0 && kardesler.every((x) => {
          const ciro = ciroHedefiTutuyorMu(x.magaza_id, x.markalar, x.grup_adi, esasByUMB.get(`${x.uzman_id}|${x.magaza_id}|${x.bolum_id}`) || 0);
          const ilkSira = (kurallarByBolum.get(x.bolum_id) || []).find((r) => r.kriter_key === "siralama_marka");
          const sira = ilkSira
            ? siralamaMarkaTutuyorMu(
              x.magaza_id,
              siralamaSayimMarkalari(x),
              hedeflerByKural.get(ilkSira.id) || []
            )
            : { tuttu: false };
          return ciro.tuttu && sira.tuttu;
        });
        if (hepsiTuttu) {
          if (String(bk.prim_tip || "yuzde").toLowerCase() === "sabit_tl") {
            const tutar = +Number(bk.prim_tutar || 0).toFixed(2);
            sabitKuralTutar += tutar;
            detay.push({
              kural: bk.kriter_adi, oran: 0, prim_tip: "sabit_tl", tutar,
              tuttu: true, tip: "sabit_kural",
            });
          } else {
            bonusOran += Number(bk.prim_oran);
            detay.push({
              kural: bk.kriter_adi, oran: bk.prim_oran, prim_tip: "yuzde",
              tuttu: true, tip: "bonus",
            });
          }
        } else {
          detay.push({
            kural: bk.kriter_adi, oran: bk.prim_oran,
            prim_tip: bk.prim_tip || "yuzde", tuttu: false, tip: "bonus",
          });
        }
      }

      // 2+ uzman: ciro kolonu %0,5'i zaten öder. Her iki grupta sıralama satırı ve
      // ciro tutarsa kuraldaki %1'in kalan %0,5'i T kolonuna yazılır. Tek uzmana uygulanmaz.
      if (ikiGrupKalanYarim(a.magaza_id, a.siralamaBolumId) && kisiCiroTuttu(a)) {
        tKolonOran = 0.5;
        detay.push({
          kural: "Her iki grubun ciro ve sıralama hedefi — kalan %0,5",
          kriter: "t_kolon",
          oran: 0.5,
          prim_tip: "yuzde",
          tuttu: true,
          tip: "t_kolon",
          kolon: 2,
        });
      }

      // Tavan uygulaması (bonus + Sevil DIOR kolon tutarı + T kalanı tavan dışı)
      const tavan = Number(a.grup_toplam_oran || a.max_prim_oran || 99);
      let toplamOran = satisOran + hedefOran + siralamaOran + siralamaMarkaOran;
      if (toplamOran > tavan) {
        detay.push({ kural: "TAVAN", not: `%${toplamOran} -> %${tavan}` });
        // Tavanı aşan kısmı önce diğer sıralamadan, sonra parfüm merdiveninden, sonra hedeften düş
        let asim = toplamOran - tavan;
        const d1 = Math.min(asim, siralamaOran); siralamaOran -= d1; asim -= d1;
        const d2 = Math.min(asim, siralamaMarkaOran); siralamaMarkaOran -= d2; asim -= d2;
        if (asim > 0) { hedefOran = Math.max(0, hedefOran - asim); asim = 0; }
        toplamOran = tavan;
      }

      const esas = +acc.primeEsas.toFixed(2);
      // Ağustos Beymen: Byredo ve Penhaligon's ciro %1 yok.
      // Suadiye'de Byredo %1 kalır. Tersane'de Byredo ve Penhaligon's %1 kalır. DBS %1 kalır.
      let satisEsas = esas;
      if (donem.kural_seti === "agustos") {
        const mag = magazaMap.get(a.magaza_id) || a.prim_magaza || "";
        if (normalizeName(mag).includes("BEYMEN")) {
          let dus = 0;
          for (const x of beymenMarkaEsas) {
            if (x.uzmanId !== a.uzman_id || x.magazaId !== a.magaza_id) continue;
            if (!agustosBeymenNicheCiroPrimVar(mag, x.marka)) dus += x.esas;
          }
          satisEsas = Math.max(0, +(esas - dus).toFixed(2));
          if (dus > 0) {
            detay.push({
              kural: "Ağustos Beymen Byredo / Penhaligon's ciro primi yok",
              tip: "satis",
              esas_baz: satisEsas,
              dusulen: +dus.toFixed(2),
            });
          }
        }
      }
      // Excel gibi: 0 esas olan (sadece Mükerrer/Sell-out yok satırları olan)
      // uzman-mağazalar özet listesine girmez — prim rakamı 0 zaten
      if (esas <= 0) continue;

      const ciltKey = `${a.uzman_id}|${a.magaza_id}`;
      let beymenCiltTutar = 0;
      if (!beymenCiltYazildi.has(ciltKey) && beymenCilt.has(ciltKey)) {
        beymenCiltYazildi.add(ciltKey);
        const cilt = beymenCilt.get(ciltKey);
        beymenCiltTutar = Number(cilt.tutar) || 0;
        if (cilt.detay?.length) detay.push(...cilt.detay);
      }

      // NOT: Eskiden burada Excel'in Prim Çalışma sayfasındaki
      // "Sephora Bağdat + Beymen + %0,05" (=%0,5) kolonundan alınmış bir
      // otomatik bayi bonusu kodu vardı. Ancak bu bonus prim_bolum/prim_kural
      // tablosunda TANIMLI DEĞİL — yani resmi bir kural değil, Excel formülü.
      // Sistemi sade tutmak için kaldırıldı: yalnızca prim_kural tablosundaki
      // kurallar uygulanır. İhtiyaç olursa prim_kural tablosuna eklenmeli.

      // Sıralama primi TABANI: sadece grup-içi esas (grup dışı satışlar hariç — Birol mantığı).
      const grupEsas = +((acc.grupEsas != null ? acc.grupEsas : acc.primeEsas)).toFixed(2);
      detay.push({ kriter: "grup_esas_baz", grupEsas });
      const satisPrim = +(satisEsas * satisOran / 100).toFixed(2);
      const hedefPrim = +(esas * hedefOran / 100).toFixed(2);
      const tKolonTutar = tKolonOran > 0 ? +(esas * tKolonOran / 100).toFixed(2) : 0;
      const siralamaPrim = +(grupEsas * siralamaMarkaOran / 100 + esas * siralamaOran / 100 + diorKolonTutar + beymenCiltTutar + sabitKuralTutar + tKolonTutar).toFixed(2);
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
          0, ekPrim, toplamOran + bonusOran + tKolonOran, toplamPrim,
          JSON.stringify(detay),
        ]
      );
    }

    await ekleManuelBirolTutarlari(conn, donem);

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

module.exports = {
  hesapla,
  markaGrubunda,
  grupMarkalari,
  genisletMarkalar,
  grupAdindanMarkaAnahtarlari,
  siralamaSayimMarkalari,
  tumParfumGrubuMu,
  efektifSiralamaBolumId,
  siralamaHedefFiltre,
  selloutSatirKarari,
  ozetEsasiNetDoldur,
};
