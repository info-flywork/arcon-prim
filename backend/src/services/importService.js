// Excel import servisleri
// Girdi dosyaları (aylık):
//   1. Zeops Ham Data        -> satis_beyan
//   2. Sell-out Data         -> sellout
//   3. Hedef                 -> hedef
//   4. Sıralama              -> siralama
// Master (değişince):
//   5. Uzman-Mağaza-Grup     -> magaza, uzman, uzman_atama
const XLSX = require("xlsx");
const pool = require("../db");
const { normalizeName, normalizeStore, parseTrNumber, parseDate, resolveUzmanId } = require("../util");
const {
  cleanRaw,
  normalizeCanonicalCode,
  identityCandidates,
  loadProductResolver,
  resolveProduct,
} = require("./productService");

// Bir sekmede beklenen başlıkların geçtiği satırı bulur (ilk 50 satır taranır).
// Gerçek dosyalarda başlık her zaman 1. satırda değildir: boş satırlar,
// birleştirilmiş hücreler, not satırları olabilir — Excel'e sadık kalıyoruz.
function baslikSatiriBul(ws, beklenen) {
  const ham = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  let enIyi = { skor: -1, satir: 0 };
  const sinir = Math.min(ham.length, 50);
  for (let i = 0; i < sinir; i++) {
    const hucreler = (ham[i] || []).map((h) => normalizeName(h));
    const skor = beklenen.filter((b) => hucreler.includes(normalizeName(b))).length;
    if (skor > enIyi.skor) enIyi = { skor, satir: i };
  }
  return enIyi;
}

// Çok sekmeli dosyalara ve kaymış başlık satırlarına karşı koruma:
// beklenen kolonlara en çok benzeyen sekme + başlık satırı seçilir.
function readSheet(buffer, beklenen = [], tercihEdilenSekmeler = []) {
  // CSV dosyalarını UTF-8 olarak decode et. Aksi halde xlsx paketi Latin-1
  // varsayar ve "ŞEHİR" → "Å EHÄ°R" gibi mojibake oluşur (Google Sheets export'ta yaşandı).
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK" — xlsx/zip signature
  let wb;
  if (isZip) {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } else {
    let s = buffer.toString("utf8");
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // BOM'u at
    wb = XLSX.read(s, { type: "string", cellDates: false, codepage: 65001 });
  }
  let secili = { ad: wb.SheetNames[0], satir: 0, skor: -1 };
  const tercih = wb.SheetNames.find((name) =>
    tercihEdilenSekmeler.some((expected) => normalizeName(name) === normalizeName(expected))
  );
  if (tercih) {
    const s = baslikSatiriBul(wb.Sheets[tercih], beklenen);
    secili = { ad: tercih, satir: s.satir, skor: s.skor };
  }
  if (beklenen.length) {
    for (const ad of tercih ? [] : wb.SheetNames) {
      const s = baslikSatiriBul(wb.Sheets[ad], beklenen);
      if (s.skor > secili.skor) secili = { ad, satir: s.satir, skor: s.skor };
    }
  }
  // range: başlık satırından itibaren oku (üstteki boş/not satırları atlanır)
  const ws = wb.Sheets[secili.ad];
  const sheetStart = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r : 0;
  // CSV: raw:false — "5.800,00" string kalsın (parseTrNumber → 5800).
  // raw:true iken SheetJS bunu US ondalık sanıp 5.8 yapıyor.
  // XLSX: raw:true — Excel hücreleri gerçek sayı olarak gelsin.
  return XLSX.utils.sheet_to_json(ws, {
    defval: null,
    raw: isZip,
    range: sheetStart + secili.satir,
  });
}

// Kolon adlarını normalize ederek esnek başlık eşleme
function pick(row, ...candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const nc = normalizeName(c);
    const k = keys.find((k) => normalizeName(k) === nc);
    if (k !== undefined) return row[k];
  }
  return null;
}

// ---- Format emniyeti -------------------------------------------------------
// Her import tipinin zorunlu kolonları (her madde alternatifleriyle).
// Dosya bu kolonları içermiyorsa veri KAYDEDİLMEDEN reddedilir.
const PROFILLER = {
  zeops: {
    ad: "Zeops Ham Data",
    zorunlu: [["Ziyaret ID"], ["Barkod"], ["Adet"], ["Mağaza", "Magaza"], ["Ad"], ["Soyad"]],
  },
  sellout: {
    ad: "Sell-out Data",
    zorunlu: [["Bayi", "BAYİ"], ["Arcon Barkod"], ["Adet"], ["Ciro Kdv Hariç", "Ciro Kdv Haric", "Ciro"], ["Prim Mağaza", "Prim Magaza", "Mağaza"]],
  },
  hedef: {
    ad: "Ciro Hedefleri",
    zorunlu: [["MARKA", "Marka"], ["MAĞAZA ADI", "MAGAZA ADI", "Mağaza", "PRİM MAĞAZA"]],
  },
  siralama: {
    ad: "Marka Sıralamaları",
    zorunlu: [["MARKA", "Marka"], ["SIRALAMA", "Sira"], ["MAĞAZA", "Magaza", "Prim Mağaza Eşleşenler"]],
  },
  "uzman-magaza": {
    ad: "Uzman-Mağaza-Grup",
    zorunlu: [["PRİM MAĞAZA", "PRIM MAGAZA"], ["Uzman Ad-Soyad", "Uzman Ad-Sıyad", "UZMAN"], ["BAYİ", "BAYI"]],
  },
  stok: {
    ad: "Stok Liste",
    zorunlu: [["STOK KODU"], ["STOK ADI"], ["MARKA"], ["BARKOD 1", "BARKOD"]],
  },
};

// Esnek başlık eşleşmesi: birebir, önek, ya da içerme.
// "Ciro Kdv Hariç" beklerken dosyada "Ciro Kdv Hariç Toplam Tutar" varsa tanır.
function basliklardaGecerMi(basliklar, arananlar) {
  return arananlar.some((a) => {
    const t = normalizeName(a);
    return basliklar.some((b) => b === t || b.startsWith(t) || t.startsWith(b) || b.includes(t) || t.includes(b));
  });
}

// null döner = geçerli; {hata, gorulen_basliklar} döner = uygun değil
function formatKontrol(rows, tip) {
  const profil = PROFILLER[tip];
  if (!profil) return null;
  if (!rows.length) return { hata: "Dosya boş ya da başlık satırı okunamadı. Veri kaydedilmedi." };
  const gorulen = Object.keys(rows[0]).filter((k) => !k.startsWith("__EMPTY"));
  const basliklarNorm = gorulen.map(normalizeName);
  const eksik = profil.zorunlu.filter((g) => !basliklardaGecerMi(basliklarNorm, g));
  if (!eksik.length) return null;
  let tahmin = null;
  for (const [t, p] of Object.entries(PROFILLER)) {
    if (t === tip) continue;
    if (p.zorunlu.every((g) => basliklardaGecerMi(basliklarNorm, g))) { tahmin = p.ad; break; }
  }
  return {
    hata:
      `Bu dosya '${profil.ad}' formatına uymuyor. Eksik kolon(lar): ${eksik.map((g) => g[0]).join(", ")}.` +
      (tahmin ? ` Yüklediğiniz dosya '${tahmin}' dosyasına benziyor — yanlış kutuya yüklemiş olabilirsiniz.` : "") +
      " Veri kaydedilmedi.",
    gorulen_basliklar: gorulen,
  };
}

// ---- Mağaza / uzman çözümleme yardımcıları -------------------------------

async function loadStoreMaps(conn) {
  const [stores] = await conn.query("SELECT id, prim_magaza FROM magaza");
  const [aliases] = await conn.query("SELECT alias, magaza_id FROM magaza_alias");
  const map = new Map();
  for (const s of stores) map.set(normalizeStore(s.prim_magaza), s.id);
  for (const a of aliases) map.set(a.alias, a.magaza_id);
  return map;
}

async function loadUzmanMap(conn) {
  const [rows] = await conn.query("SELECT id, normal_ad FROM uzman");
  return new Map(rows.map((r) => [r.normal_ad, r.id]));
}

async function loadLegacyRepresentatives(conn) {
  const [rows] = await conn.query(
    "SELECT urun_id, MIN(legacy_uniq_kod_id) AS legacy_id FROM urun_legacy_map GROUP BY urun_id"
  );
  return new Map(rows.map((row) => [Number(row.urun_id), row.legacy_id]));
}

/** Group adını prim_bolum ile eşleştir (Dolce & Gabbana → BEYMEN DG vb.)
 *  altKanal: SEVIL/BEYMEN gibi — aynı marka grubunda iki farklı bölüm varsa
 *  (Beymen mağazasındaki DG %1.5, Sevil noktasındaki DG %1.0 gibi) doğru seçim
 */
function eslestirBolum(bolumler, { kanal, grup, uzmanTipi, altKanal }) {
  // Kanal filtresi: bölüm.kanal NULL = tüm kanallara açık (ör. DIOR Sephora+Boyner)
  let candidates = bolumler.filter((b) => !b.kanal || !kanal || b.kanal === kanal);
  // Sonra alt_kanal filtresi — DB'de alt_kanal tanımlı olan bölümler için
  if (altKanal) {
    const altFilter = candidates.filter((b) => {
      if (!b.alt_kanal) return true; // alt_kanal tanımsızsa (genel bölüm) dahil et
      return b.alt_kanal === altKanal;
    });
    if (altFilter.length) candidates = altFilter;
  } else {
    // alt_kanal belirtilmediyse, alt_kanal='BEYMEN' varsayılan (mağaza noktası,
    // özel bir Sevil noktası değil). Aksi halde çift kayıtta yanlış olan seçilebilir.
    const altKanalliBolumler = candidates.filter((b) => b.alt_kanal);
    const varsayilan = altKanalliBolumler.filter((b) => b.alt_kanal === 'BEYMEN');
    const altKanalSız = candidates.filter((b) => !b.alt_kanal);
    if (varsayilan.length) candidates = [...altKanalSız, ...varsayilan];
  }
  const grupNorm = normalizeName(grup);
  if (!candidates.length) return null;

  // PARFÜM TÜM MARKALAR / TÜM MARKALAR → SISLEY'e düşmesin; Puig-Hermes-DG-GIV TEK senaryosu
  const isTumParfum = grupNorm.includes("TUM MARKA")
    || (grupNorm.includes("PARFUM") && grupNorm.includes("TUM"));
  if (isTumParfum) {
    const tip = uzmanTipi || "TEK_UZMAN";
    const puanli = candidates
      .filter((b) => b.marka_grubu_key && /PUIG|HERMES|DG|GIV/i.test(String(b.marka_grubu_key)))
      .map((b) => ({
        b,
        sc: (b.uzman_tipi === tip ? 2 : 0) + (/PUIG.*HERMES|HERMES.*DG/i.test(String(b.marka_grubu_key)) ? 2 : 1),
      }))
      .sort((a, c) => c.sc - a.sc);
    if (puanli[0]) return puanli[0].b;
    const tek = candidates.find((b) => b.uzman_tipi === tip && b.marka_grubu_key)
      || candidates.find((b) => b.uzman_tipi === tip);
    if (tek) return tek;
  }

  const tokens = grupNorm.split(/[+\/&,]/).map((t) => t.trim()).filter(Boolean);
  const aliases = new Set(tokens);
  for (const t of tokens) {
    if (t.includes("DOLCE") || t.includes("GABBANA") || t === "D&G" || t === "DG") {
      aliases.add("DG"); aliases.add("DOLCE"); aliases.add("GABBANA");
    }
    if (t.includes("RABANNE") || t.includes("PUIG") || t.includes("GAULTIER")
      || t.includes("HERRERA") || t.includes("NINA") || t.includes("RICCI") || t.includes("CAROLINA")) {
      aliases.add("PUIG"); aliases.add("RABANNE");
    }
    if (t.includes("HERMES")) aliases.add("HERMES");
    if (t.includes("GIVENCHY") || t === "GIV") {
      aliases.add("GIVENCHY"); aliases.add("GIV");
    }
    if (t.includes("DIOR")) aliases.add("DIOR");
    if (t.includes("SISLEY")) aliases.add("SISLEY");
    if (t.includes("PRAIRIE") || t === "LP") aliases.add("LP");
    if (t.includes("SENSAI")) aliases.add("SENSAI");
  }

  // Marka grubu net olan bölümler (DIOR, SISLEY…) boş Puig kabuğuna (markalar=null) tercih edilir
  let best = null;
  for (const b of candidates) {
    const adi = normalizeName(b.marka_grubu_adi || b.bolum_adi || "");
    const key = normalizeName(b.marka_grubu_key || "");
    const marks = normalizeName(JSON.stringify(b.markalar || []));
    const hasMarka = !!(b.marka_grubu_key || (Array.isArray(b.markalar) && b.markalar.length) || b.markalar);
    let sc = 0;
    if (grupNorm && adi && (adi.includes(grupNorm) || grupNorm.includes(adi))) sc += 5;
    if (grupNorm && key && (key.includes(grupNorm) || grupNorm.includes(key))) sc += 4;
    for (const a of aliases) {
      if (!a) continue;
      if (adi.includes(a) || key.includes(a) || marks.includes(a)) sc += 3;
      if (a === "DG" && (adi.includes("DG") || key.includes("DG") || marks.includes("DG"))) sc += 4;
    }
    if (uzmanTipi && b.uzman_tipi === uzmanTipi) sc += 1;
    // Marka tanımsız kabuk bölümler (yalnız bonus vb.) zayıf kalsın
    if (!hasMarka && sc > 0 && sc < 3) sc = 0;
    if (!best || sc > best.sc) best = { b, sc };
  }
  if (best && best.sc > 0) return best.b;

  // Kanalda bulunamadıysa marka grubu net bölümleri tüm listeden dene (DIOR: SEPHORA kaydı → Boyner)
  if (kanal) {
    const cross = eslestirBolum(bolumler, { kanal: null, grup, uzmanTipi: null, altKanal: null });
    if (cross && (cross.marka_grubu_key || cross.markalar)) return cross;
  }

  return candidates.find((b) => b.uzman_tipi === uzmanTipi && b.marka_grubu_key)
    || candidates.find((b) => b.marka_grubu_key)
    || null;
}

// ---- 5. Uzman-Mağaza-Grup (master) ---------------------------------------
// Beklenen kolonlar: ŞEHİR, MAĞAZA KODU, BAYİ, MAĞAZA, PRİM MAĞAZA, Uzman Ad-Soyad, Group
async function importUzmanMagaza(buffer, donemId, dosyaAdi) {
  const rows = readSheet(
    buffer,
    ["PRİM MAĞAZA", "BAYİ", "Uzman Ad-Sıyad", "Group"],
    ["Uzman-Mağaza-Grup"]
  );
  const formatHata = formatKontrol(rows, "uzman-magaza");
  if (formatHata) return formatHata;
  const conn = await pool.getConnection();
  let ok = 0, err = 0;
  const yeniUzmanSet = new Set();
  const yeniMagazaSet = new Set();
  const errors = [];
  try {
    await conn.beginTransaction();
    // Dosya master: dönem atamalarını baştan yaz (çoklu grup satırları korunur)
    await conn.query("DELETE FROM uzman_atama WHERE donem_id=?", [donemId]);
    const [bolumler] = await conn.query(
      "SELECT id, kanal, alt_kanal, uzman_tipi, marka_grubu_key, marka_grubu_adi, markalar FROM prim_bolum WHERE aktif=1"
    );
    // Mağaza başına uzman sayısını önce hesapla (senaryo seçimi için)
    const storeCount = new Map();
    for (const row of rows) {
      const pm = pick(row, "PRİM MAĞAZA", "PRIM MAGAZA");
      if (!pm) continue;
      const key = normalizeStore(pm);
      storeCount.set(key, (storeCount.get(key) || 0) + 1);
    }

    for (const row of rows) {
      const pm = pick(row, "PRİM MAĞAZA", "PRIM MAGAZA");
      const uzmanAd = pick(row, "Uzman Ad-Soyad", "Uzman Ad-Sıyad", "UZMAN");
      if (!pm || !uzmanAd) { err++; continue; }
      const bayi = String(pick(row, "BAYİ", "BAYI") || "").trim().toLocaleUpperCase("tr-TR");
      const grup = String(pick(row, "Group", "GRUP") || "").trim();
      const primMagaza = String(pm).trim();
      const magazaAdi = String(pick(row, "MAĞAZA", "MAGAZA") || primMagaza).trim();
      const magazaKodu = pick(row, "MAĞAZA KODU", "MAGAZA KODU") || null;
      const sehir = pick(row, "ŞEHİR", "SEHIR") || null;

      // Yeni mağaza/bayi Excel'de varsa otomatik sisteme eklenir; varsa bayi/ad/şehir güncellenir
      const [[mevcutMagaza]] = await conn.query("SELECT id FROM magaza WHERE prim_magaza=?", [primMagaza]);
      await conn.query(
        `INSERT INTO magaza (magaza_kodu, bayi, magaza_adi, prim_magaza, sehir, aktif)
         VALUES (?,?,?,?,?,1)
         ON DUPLICATE KEY UPDATE
           magaza_kodu=COALESCE(VALUES(magaza_kodu), magaza_kodu),
           bayi=VALUES(bayi),
           magaza_adi=VALUES(magaza_adi),
           sehir=COALESCE(VALUES(sehir), sehir),
           aktif=1`,
        [magazaKodu, bayi || "?", magazaAdi, primMagaza, sehir]
      );
      if (!mevcutMagaza) yeniMagazaSet.add(primMagaza);
      const [[st]] = await conn.query("SELECT id FROM magaza WHERE prim_magaza=?", [primMagaza]);

      // Uzman: DB'de yoksa ekle (manuel "Uzman Ekle" gerekmez)
      const normal = normalizeName(uzmanAd);
      const [[mevcutUzman]] = await conn.query("SELECT id FROM uzman WHERE normal_ad=?", [normal]);
      await conn.query(
        `INSERT INTO uzman (ad_soyad, normal_ad, aktif) VALUES (?,?,1)
         ON DUPLICATE KEY UPDATE ad_soyad=VALUES(ad_soyad), aktif=1`,
        [String(uzmanAd).trim(), normal]
      );
      if (!mevcutUzman) yeniUzmanSet.add(normal);
      const [[uz]] = await conn.query("SELECT id FROM uzman WHERE normal_ad=?", [normal]);

      // Senaryo (bolum) seçimi: kanal + alt_kanal + grup adı
      // Bayi SEVIL → BEYMEN kanalında SEVIL alt_kanalı (Beymen'in Sevil noktası).
      // Bayi BEYMEN → BEYMEN kanalında BEYMEN alt_kanalı (Beymen mağazası).
      // Aksi halde DB'de aynı grup için iki bölüm varken (BEYMEN DG %1.5 vs SEVIL DG %1.0)
      // rastgele biri seçilir; alt_kanal ayrımı bu bug'ı kapatır.
      let kanal = ["SEPHORA", "BOYNER", "BEYMEN"].find((k) => bayi.includes(k)) || null;
      let altKanal = null;
      if (bayi === "SEVIL" || bayi.includes("SEVİL") || bayi.includes("SEVIL")) {
        kanal = "BEYMEN";
        altKanal = "SEVIL";
      } else if (kanal === "BEYMEN") {
        altKanal = "BEYMEN";
      }
      const uzmanSayisi = storeCount.get(normalizeStore(pm)) || 1;
      const uzmanTipi = uzmanSayisi >= 2 ? "COK_UZMAN" : "TEK_UZMAN";
      const bolum = eslestirBolum(bolumler, { kanal, grup, uzmanTipi, altKanal });
      if (!bolum) { err++; errors.push(`Bölüm bulunamadı: ${pm} / ${grup}`); continue; }

      await conn.query(
        `INSERT INTO uzman_atama (donem_id, uzman_id, magaza_id, bolum_id, grup_adi)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE grup_adi=VALUES(grup_adi)`,
        [donemId, uz.id, st.id, bolum.id, grup]
      );
      ok++;
    }
    const yeniUzman = yeniUzmanSet.size;
    const yeniMagaza = yeniMagazaSet.size;
    const ozet = [
      `${ok} atama`,
      yeniUzman ? `${yeniUzman} yeni uzman` : null,
      yeniMagaza ? `${yeniMagaza} yeni mağaza` : null,
      err ? `${err} sorunlu` : null,
    ].filter(Boolean).join(" · ");
    await conn.query(
      "INSERT INTO import_log (donem_id, tip, dosya_adi, satir_sayisi, hatali_satir, mesaj) VALUES (?,?,?,?,?,?)",
      [donemId, "uzman_magaza", dosyaAdi, ok, err, [ozet, ...errors.slice(0, 40)].filter(Boolean).join("\n") || null]
    );
    await conn.commit();
    return { ok, err, yeniUzman, yeniMagaza, errors: errors.slice(0, 50) };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---- 1. Zeops Ham Data ----------------------------------------------------
async function importZeops(buffer, donemId, dosyaAdi) {
  const rows = readSheet(
    buffer,
    ["Ziyaret ID", "Ad", "Soyad", "Mağaza", "Barkod", "Adet"],
    ["Mayıs Zeops Ham Data", "Zeops Ham Data"]
  );
  const formatHata = formatKontrol(rows, "zeops");
  if (formatHata) return formatHata;
  const conn = await pool.getConnection();
  let ok = 0, err = 0;
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM satis_beyan WHERE donem_id=?", [donemId]);
    const storeMap = await loadStoreMaps(conn);
    const uzmanMap = await loadUzmanMap(conn);
    const productResolver = await loadProductResolver(conn);
    const legacyByProduct = await loadLegacyRepresentatives(conn);
    const [assignmentRows] = await conn.query(
      "SELECT uzman_id,magaza_id FROM uzman_atama WHERE donem_id=?",
      [donemId]
    );
    const assignmentSet = new Set(assignmentRows.map((row) => `${row.uzman_id}|${row.magaza_id}`));

    const batch = [];
    for (const row of rows) {
      const ad = pick(row, "Ad") || "";
      const soyad = pick(row, "Soyad") || "";
      const uzmanHam = `${ad} ${soyad}`.trim() || pick(row, "Uzman", "Uzman Ad-Soyad");
      const magazaHam = pick(row, "Mağaza", "Magaza");
      const barkod = cleanRaw(pick(row, "Barkod")) || null;
      const kod = pick(row, "Kod");
      const uzmanId = resolveUzmanId(uzmanMap, uzmanHam);
      const magazaId = storeMap.get(normalizeStore(magazaHam)) || null;
      const productMatch = resolveProduct(productResolver, { barcode: barkod, reference: kod });
      const productId = productMatch.productId || null;
      const uniqId = productId ? legacyByProduct.get(Number(productId)) || null : null;

      let eslesme = productMatch.status;
      if (eslesme === "ok" && !magazaId) eslesme = "magaza_yok";
      else if (eslesme === "ok" && !uzmanId) eslesme = "uzman_yok";
      else if (eslesme === "ok" && !assignmentSet.has(`${uzmanId}|${magazaId}`)) eslesme = "atama_yok";

      batch.push([
        donemId,
        String(pick(row, "Ziyaret ID") || "").trim() || null,
        uzmanId, uzmanHam || null,
        String(ad).trim() || null,
        String(soyad).trim() || null,
        magazaId, magazaHam || null,
        parseDate(pick(row, "İşlem Tarihi", "Islem Tarihi")),
        parseDate(pick(row, "Satış Tarihi", "Satis Tarihi")),
        pick(row, "Durum"),
        barkod, kod,
        pick(row, "Etiket"),
        Math.round(parseTrNumber(pick(row, "Adet"))) || 1,
        parseTrNumber(pick(row, "Fiyat")),
        parseTrNumber(pick(row, "Toplam")),
        pick(row, "Satış Notları", "Satis Notlari"),
        uniqId, productId, productMatch.identifierId || null, productMatch.method || null, eslesme,
      ]);
      if (eslesme === "ok") ok++; else err++;
      if (batch.length >= 500) {
        await insertBeyanBatch(conn, batch);
        batch.length = 0;
      }
    }
    if (batch.length) await insertBeyanBatch(conn, batch);
    await conn.query(
      "INSERT INTO import_log (donem_id, tip, dosya_adi, satir_sayisi, hatali_satir) VALUES (?,?,?,?,?)",
      [donemId, "zeops", dosyaAdi, rows.length, err]
    );
    await conn.commit();
    return { toplam: rows.length, eslesen: ok, eslesmeyen: err };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function insertBeyanBatch(conn, batch) {
  await conn.query(
    `INSERT INTO satis_beyan
     (donem_id, ziyaret_id, uzman_id, uzman_ham, ad, soyad, magaza_id, magaza_ham, islem_tarihi, satis_tarihi,
      durum, barkod, kod, etiket, adet, fiyat, toplam, satis_notlari, uniq_kod_id,
      urun_id, urun_kimlik_id, eslesme_yontemi, eslesme_durum)
     VALUES ?`,
    [batch]
  );
}

// ---- 2. Sell-out Data ------------------------------------------------------
async function importSellout(buffer, donemId, dosyaAdi) {
  const rows = readSheet(
    buffer,
    ["Bayi", "Arcon Barkod", "Adet", "Prim Mağaza", "Arcon Marka"],
    ["Mayıs Sell-out Data", "Sell-out Data"]
  );
  const formatHata = formatKontrol(rows, "sellout");
  if (formatHata) return formatHata;
  const conn = await pool.getConnection();
  let ok = 0, err = 0;
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM sellout WHERE donem_id=?", [donemId]);
    const storeMap = await loadStoreMaps(conn);
    const productResolver = await loadProductResolver(conn);
    const legacyByProduct = await loadLegacyRepresentatives(conn);

    const batch = [];
    for (const row of rows) {
      const magazaHam = pick(row, "Prim Mağaza", "Prim Magaza", "Mağaza", "Magaza");
      const barkod = cleanRaw(pick(row, "Arcon Barkod", "Barkod")) || null;
      const ref = pick(row, "Arcon Referans", "Referans");
      const magazaId = storeMap.get(normalizeStore(magazaHam)) || null;
      const productMatch = resolveProduct(productResolver, { barcode: barkod, reference: ref });
      const productId = productMatch.productId || null;
      const uniqId = productId ? legacyByProduct.get(Number(productId)) || null : null;
      let eslesme = productMatch.status;
      if (eslesme === "ok" && !magazaId) eslesme = "magaza_yok";

      batch.push([
        donemId,
        pick(row, "Bayi", "BAYİ"),
        pick(row, "Ürün Adı", "Urun Adi"),
        ref, barkod,
        Math.round(parseTrNumber(pick(row, "Adet"))),
        parseTrNumber(pick(row, "Ciro Kdv Hariç", "Ciro Kdv Haric", "Ciro")),
        magazaId, magazaHam,
        pick(row, "Arcon Marka", "Marka"),
        pick(row, "Marka Grup"),
        pick(row, "Ürün Grubu", "Urun Grubu"),
        uniqId, productId, productMatch.identifierId || null, productMatch.method || null, eslesme,
      ]);
      if (eslesme === "ok") ok++; else err++;
      if (batch.length >= 500) {
        await insertSelloutBatch(conn, batch);
        batch.length = 0;
      }
    }
    if (batch.length) await insertSelloutBatch(conn, batch);
    // Emniyet: sell-out dosyasında ciro olmak zorunda. Toplam 0 ise
    // büyük ihtimalle yanlış dosya (örn. Zeops) yüklendi — geri al.
    const [[ciroKontrol]] = await conn.query(
      "SELECT SUM(ciro_kdv_haric) t FROM sellout WHERE donem_id=?", [donemId]
    );
    if (!ciroKontrol.t || Number(ciroKontrol.t) === 0) {
      await conn.rollback();
      return {
        hata: "Dosyada 'Ciro Kdv Hariç' verisi bulunamadı (toplam 0 TL). Yanlış dosya yüklemiş olabilirsiniz — sell-out dosyasını kontrol edin. Veri kaydedilmedi.",
      };
    }
    await conn.query(
      "INSERT INTO import_log (donem_id, tip, dosya_adi, satir_sayisi, hatali_satir) VALUES (?,?,?,?,?)",
      [donemId, "sellout", dosyaAdi, rows.length, err]
    );
    await conn.commit();
    return { toplam: rows.length, eslesen: ok, eslesmeyen: err };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function insertSelloutBatch(conn, batch) {
  await conn.query(
    `INSERT INTO sellout
     (donem_id, bayi, urun_adi, arcon_referans, arcon_barkod, adet, ciro_kdv_haric,
      magaza_id, magaza_ham, marka, marka_grup, urun_grubu, uniq_kod_id,
      urun_id, urun_kimlik_id, eslesme_yontemi, eslesme_durum)
     VALUES ?`,
    [batch]
  );
}

// ---- 3. Hedef --------------------------------------------------------------
async function importHedef(buffer, donemId, dosyaAdi) {
  const rows = readSheet(
    buffer,
    ["BAYİ", "MAĞAZA KOD", "MAĞAZA ADI", "MARKA"],
    ["Mayıs Hedef", "Hedef"]
  );
  const formatHata = formatKontrol(rows, "hedef");
  if (formatHata) return formatHata;
  const conn = await pool.getConnection();
  let ok = 0, err = 0;
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM hedef WHERE donem_id=?", [donemId]);
    const storeMap = await loadStoreMaps(conn);
    for (const row of rows) {
      const magazaHam = pick(row, "MAĞAZA ADI", "MAGAZA ADI", "Mağaza", "PRİM MAĞAZA");
      const marka = pick(row, "MARKA", "Marka");
      // Hedef kolonu dosyadan dosyaya değişiyor: "REVİZE Mayıs", "Haz-26",
      // hatta başlığı bir üst satırda kalmış isimsiz kolon (2026 Haziran
      // dosyasındaki gibi). Sırayla dene:
      const keys = Object.keys(row);
      let hedefCiro = pick(row, "REVİZE  Mayıs", "REVİZE Mayıs", "REVİZE", "HEDEF", "Hedef");
      if (hedefCiro === null || parseTrNumber(hedefCiro) <= 0) {
        // 1) başlığında REV/HEDEF geçen dolu kolon
        let k = keys.find((k) => /REV|HEDEF/i.test(k) && parseTrNumber(row[k]) > 0);
        // 2) başlıksız kalmış (__EMPTY) dolu kolon — bölünmüş başlık durumu
        if (!k) k = [...keys].reverse().find((k) => /__EMPTY/.test(k) && parseTrNumber(row[k]) > 0);
        // 3) "Haz-26" gibi ay kodlu dolu kolon
        if (!k) k = [...keys].reverse().find((k) => /^[A-Za-zÇĞİÖŞÜçğıöşü]{3}-\d{2}$/.test(k.trim()) && parseTrNumber(row[k]) > 0);
        // 4) " Mayıs" gibi doğrudan ay adı olan dolu kolon
        if (!k) {
          const aylar = /^(OCAK|SUBAT|MART|NISAN|MAYIS|HAZIRAN|TEMMUZ|AGUSTOS|EYLUL|EKIM|KASIM|ARALIK)$/;
          k = [...keys].reverse().find((key) => aylar.test(normalizeName(key)) && parseTrNumber(row[key]) > 0);
        }
        hedefCiro = k ? row[k] : null;
      }
      const tutar = parseTrNumber(hedefCiro);
      if (!magazaHam || !marka) { err++; continue; }
      // 0/boş hedef kaydedilmez: 0 hedef "hedef tuttu" sayılıp haksız prim doğurur
      if (tutar <= 0) { err++; continue; }
      const magazaId = storeMap.get(normalizeStore(magazaHam)) || null;
      await conn.query(
        `INSERT INTO hedef (donem_id, magaza_id, magaza_ham, marka, hedef_ciro)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE hedef_ciro=VALUES(hedef_ciro)`,
        [donemId, magazaId, String(magazaHam).trim(), String(marka).trim().toLocaleUpperCase("tr-TR"), tutar]
      );
      ok++;
    }
    await conn.query(
      "INSERT INTO import_log (donem_id, tip, dosya_adi, satir_sayisi, hatali_satir) VALUES (?,?,?,?,?)",
      [donemId, "hedef", dosyaAdi, rows.length, err]
    );
    await conn.commit();
    return { toplam: rows.length, eslesen: ok, eslesmeyen: err };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---- 4. Sıralama ------------------------------------------------------------
async function importSiralama(buffer, donemId, dosyaAdi) {
  const rows = readSheet(
    buffer,
    ["MAĞAZA", "ÇEŞİT", "MARKA", "SIRALAMA"],
    ["Mayıs Sıralama", "Sıralama"]
  );
  const formatHata = formatKontrol(rows, "siralama");
  if (formatHata) return formatHata;
  const conn = await pool.getConnection();
  let ok = 0, err = 0;
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM siralama WHERE donem_id=?", [donemId]);
    const storeMap = await loadStoreMaps(conn);
    for (const row of rows) {
      const magazaHam = pick(row, "Prim Mağaza Eşleşenler", "MAĞAZA", "Magaza");
      const marka = pick(row, "MARKA", "Marka");
      const sira = Math.round(parseTrNumber(pick(row, "SIRALAMA", "Sira")));
      if (!magazaHam || !marka || !sira) { err++; continue; }
      const magazaId = storeMap.get(normalizeStore(magazaHam)) || null;
      await conn.query(
        `INSERT INTO siralama (donem_id, magaza_id, magaza_ham, cesit, marka, sira)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE sira=VALUES(sira)`,
        [donemId, magazaId, String(magazaHam).trim(), pick(row, "ÇEŞİT", "CESIT"), String(marka).trim().toLocaleUpperCase("tr-TR"), sira]
      );
      ok++;
    }
    await conn.query(
      "INSERT INTO import_log (donem_id, tip, dosya_adi, satir_sayisi, hatali_satir) VALUES (?,?,?,?,?)",
      [donemId, "siralama", dosyaAdi, rows.length, err]
    );
    await conn.commit();
    return { toplam: rows.length, eslesen: ok, eslesmeyen: err };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---- 6. Stok Liste -> kanonik ürün + alias tamamlama -----------------------
async function flushKimlikBatch(conn, batch) {
  if (!batch.length) return;
  const placeholders = batch.map(() => "(?,?,?,?,?)").join(",");
  const values = batch.flatMap((item) => [
    item.urun_id, item.tip, item.deger_ham, item.deger_normalize, item.kaynak,
  ]);
  // Aynı kimlik başka ürüne bağlıysa IGNORE eder; çakışmalar ayrıca sayılır
  await conn.query(
    `INSERT IGNORE INTO urun_kimlik (urun_id, tip, deger_ham, deger_normalize, kaynak)
     VALUES ${placeholders}`,
    values
  );
  batch.length = 0;
}

async function importStok(buffer, donemId, dosyaAdi, opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const rows = readSheet(
    buffer,
    ["STOK KODU", "STOK ADI", "MARKA", "BARKOD 1", "UNIQ KOD"],
    ["Stok Liste"]
  );
  const formatHata = formatKontrol(rows, "stok");
  if (formatHata) return formatHata;

  // Her satır değerlendirilir. Hız için:
  // - zaten tam eşleşen satırda ekstra INSERT yapılmaz (atlanan; satır yok sayılmaz)
  // - yeni ürün/kimlikler toplu INSERT ile yazılır
  const PRODUCT_BATCH = 80;
  const KIMLIK_BATCH = 200;
  const conn = await pool.getConnection();
  let eklenen = 0, aliasEklenen = 0, atlanan = 0, err = 0;

  try {
    try {
      await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await conn.query("SET SESSION innodb_lock_wait_timeout = 15");
    } catch {
      /* hosting kısıtlı olabilir */
    }

    onProgress?.({ asama: "hazirlik", yapilan: 0, toplam: rows.length });

    const resolver = await loadProductResolver(conn);
    const [products] = await conn.query("SELECT id, uniq_kod, durum, marka, urun_adi FROM urun");
    const productByUniq = new Map(products.map((product) => [product.uniq_kod, product]));
    const productById = new Map(products.map((product) => [Number(product.id), product]));

    const pendingProducts = []; // { canonical, marka, urun_adi, aks, cinsiyet, durum, identifiers[] }
    const pendingByCanonical = new Map();
    const pendingKimlik = [];
    const pendingUniqUpdate = []; // { productId, canonical, activate }
    const pendingCakisma = [];

    function queueKimlik(urunId, identifier, product) {
      if (resolver.identifierMap.has(identifier.key)) {
        const existing = resolver.identifierMap.get(identifier.key);
        if (Number(existing.urun_id) !== Number(urunId)) {
          err++;
          return false;
        }
        return false; // zaten bu üründe
      }
      pendingKimlik.push({
        urun_id: urunId,
        tip: identifier.tip,
        deger_ham: identifier.raw,
        deger_normalize: identifier.normalized,
        kaynak: "stok_import",
      });
      if (product?.durum === "aktif" || product?.durum === "inceleme") {
        resolver.identifierMap.set(identifier.key, {
          identifier_id: null,
          urun_id: urunId,
          tip: identifier.tip,
          deger_normalize: identifier.normalized,
          uniq_kod: product.uniq_kod,
          marka: product.marka,
          urun_adi: product.urun_adi,
          durum: product.durum,
        });
      }
      return true;
    }

    async function flushProducts() {
      if (!pendingProducts.length) return;
      await conn.beginTransaction();
      try {
        for (let i = 0; i < pendingProducts.length; i += PRODUCT_BATCH) {
          const chunk = pendingProducts.slice(i, i + PRODUCT_BATCH);
          const placeholders = chunk.map(() => "(?,?,?,?,?,?)").join(",");
          const values = chunk.flatMap((item) => [
            item.canonical, item.marka, item.urun_adi, item.aks, item.cinsiyet, item.durum,
          ]);
          const [result] = await conn.query(
            `INSERT INTO urun (uniq_kod, marka, urun_adi, aks, cinsiyet, durum)
             VALUES ${placeholders}`,
            values
          );
          let id = Number(result.insertId);
          for (const item of chunk) {
            const product = {
              id,
              uniq_kod: item.canonical,
              durum: item.durum,
              marka: item.marka,
              urun_adi: item.urun_adi,
            };
            productByUniq.set(item.canonical, product);
            productById.set(id, product);
            eklenen++;
            for (const identifier of item.identifiers) {
              if (queueKimlik(id, identifier, product)) aliasEklenen++;
            }
            id += 1;
          }
        }
        await flushKimlikBatch(conn, pendingKimlik);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }
      pendingProducts.length = 0;
    }

    async function flushKimlik() {
      if (!pendingKimlik.length) return;
      await conn.beginTransaction();
      try {
        while (pendingKimlik.length) {
          const chunk = pendingKimlik.splice(0, KIMLIK_BATCH);
          await flushKimlikBatch(conn, chunk);
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const barkod = cleanRaw(pick(row, "BARKOD 1", "BARKOD")) || null;
      const stokKodu = pick(row, "STOK KODU");
      const stokAdi = pick(row, "STOK ADI");
      const identifiers = identityCandidates({ barcode: barkod, stockCode: stokKodu });
      if (!identifiers.length) {
        err++;
        continue;
      }

      const match = resolveProduct(resolver, { barcode: barkod, stockCode: stokKodu });
      if (match.status === "urun_cakisma") {
        const first = identifiers[0];
        pendingCakisma.push({
          tip: first.tip,
          raw: first.raw,
          normalized: first.normalized,
          json: JSON.stringify(match.productIds.map((productId) => ({ productId, row: rowIndex + 2 }))),
        });
        err++;
        continue;
      }

      const uniq = normalizeCanonicalCode(pick(row, "UNIQ KOD"));
      const stokNormalized = normalizeCanonicalCode(stokKodu);
      // Kural: Stok'ta UNIQ varsa o; yoksa STOK KODU kanonik kimliktir
      const canonicalCode = uniq || stokNormalized;
      if (!canonicalCode) {
        err++;
        continue;
      }

      let product = match.status === "ok"
        ? productById.get(Number(match.productId))
        : productByUniq.get(canonicalCode);

      // Tüm kimlikler zaten bu ürüne bağlıysa DB yazmadan say (satır yine işlendi)
      if (product && match.status === "ok") {
        const eksikKimlik = identifiers.filter((id) => !resolver.identifierMap.has(id.key));
        const uniqDegisecek = product.uniq_kod !== canonicalCode;
        if (!eksikKimlik.length && !uniqDegisecek) {
          atlanan++;
          if (rowIndex % 500 === 0) {
            onProgress?.({ asama: "tarama", yapilan: rowIndex + 1, toplam: rows.length });
          }
          continue;
        }
      }

      if (!product) {
        // Aynı dosyada daha önce kuyruğa alınan uniq'i tekrar ekleme
        const queued = pendingByCanonical.get(canonicalCode);
        if (queued) {
          for (const identifier of identifiers) {
            if (!queued.identifiers.some((x) => x.key === identifier.key)) {
              queued.identifiers.push(identifier);
            }
          }
          // Ürün henüz INSERT edilmedi; kimlikler flushProducts'ta eklenecek
          continue;
        }
        const item = {
          canonical: canonicalCode,
          marka: cleanRaw(pick(row, "MARKA")) || "Bilinmiyor",
          urun_adi: cleanRaw(pick(row, "UNIQ ADI") || stokAdi) || `İncelenecek stok ${rowIndex + 2}`,
          aks: cleanRaw(pick(row, "AKS")) || null,
          cinsiyet: cleanRaw(pick(row, "CİNSİYET", "CINSIYET")) || null,
          durum: uniq ? "aktif" : "inceleme",
          identifiers: [...identifiers],
        };
        pendingProducts.push(item);
        pendingByCanonical.set(canonicalCode, item);
        if (pendingProducts.length >= PRODUCT_BATCH) {
          await flushProducts();
          pendingByCanonical.clear();
        }
      } else {
        if (product.uniq_kod !== canonicalCode) {
          pendingUniqUpdate.push({
            productId: product.id,
            canonical: canonicalCode,
            activate: !!uniq,
          });
          productByUniq.delete(product.uniq_kod);
          product.uniq_kod = canonicalCode;
          productByUniq.set(canonicalCode, product);
        }
        let newAlias = 0;
        for (const identifier of identifiers) {
          if (queueKimlik(product.id, identifier, product)) newAlias++;
        }
        aliasEklenen += newAlias;
        if (!newAlias && match.status === "ok" && product.uniq_kod === canonicalCode) atlanan++;
        if (pendingKimlik.length >= KIMLIK_BATCH) await flushKimlik();
      }

      if (rowIndex % 500 === 0) {
        onProgress?.({ asama: "tarama", yapilan: rowIndex + 1, toplam: rows.length });
      }
    }

    await flushProducts();
    await flushKimlik();

    // Uniq güncellemeleri (az sayıda beklenir)
    if (pendingUniqUpdate.length) {
      await conn.beginTransaction();
      try {
        for (const item of pendingUniqUpdate) {
          const [[owner]] = await conn.query(
            "SELECT id FROM urun WHERE uniq_kod=? AND id<>? LIMIT 1",
            [item.canonical, item.productId]
          );
          if (!owner) {
            await conn.query(
              "UPDATE urun SET uniq_kod=?, durum=IF(?,'aktif',durum) WHERE id=?",
              [item.canonical, item.activate ? 1 : 0, item.productId]
            );
          }
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    }

    if (pendingCakisma.length) {
      await conn.beginTransaction();
      try {
        for (const item of pendingCakisma) {
          await conn.query(
            `INSERT INTO urun_esleme_cakisma
               (tip,deger_ham,deger_normalize,kaynak,aday_urunler_json)
             VALUES (?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
               aday_urunler_json=VALUES(aday_urunler_json), kaynak=VALUES(kaynak), durum='acik'`,
            [item.tip, item.raw, item.normalized, `stok_import:${dosyaAdi}`, item.json]
          );
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    }

    await conn.query(
      "INSERT INTO import_log (donem_id, tip, dosya_adi, satir_sayisi, hatali_satir, mesaj) VALUES (?,?,?,?,?,?)",
      [donemId || null, "uniq_kod", dosyaAdi, rows.length, err,
        `${eklenen} yeni ürün, ${aliasEklenen} yeni kimlik; ${atlanan} satır değişmedi`]
    );

    onProgress?.({ asama: "bitti", yapilan: rows.length, toplam: rows.length });

    return {
      toplam: rows.length,
      eslesen: eklenen + aliasEklenen,
      eslesmeyen: err,
      mesaj: `${eklenen} yeni ürün, ${aliasEklenen} yeni barkod/referans eklendi; ${atlanan} satır zaten günceldi`,
    };
  } finally {
    conn.release();
  }
}

module.exports = {
  importZeops,
  importSellout,
  importHedef,
  importSiralama,
  importUzmanMagaza,
  importStok,
  _internals: { baslikSatiriBul, readSheet, pick, formatKontrol },
};
