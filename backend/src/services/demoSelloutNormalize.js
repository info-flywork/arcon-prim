/**
 * Demo-only: parça parça ham sell-out → mevcut import'un kanonik kolonları.
 * Mevcut importService / hesapService'e dokunmaz; DB'ye yazmaz.
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { eleZeopsDisi } = require("./demoZeopsMagaza");

const KDV_ORAN = 1.2;

/** Import'un zorunlu çektiği çekirdek kolonlar. */
const ARCON_SELLOUT_HEADERS = [
  "Bayi",
  "Ürün Adı",
  "Arcon Referans",
  "Arcon Barkod",
  "Adet",
  "Ciro Kdv Hariç",
  "Prim Mağaza",
  "Arcon Marka",
  "Marka Grup",
  "Ürün Grubu",
];

/**
 * Onların yüklediği tek Sell-out Excel başlıkları (Temmuz sell_out.xlsx ile aynı sıra).
 * Unıq Kod yazımı kaynak dosyadaki gibi (ı).
 */
const ARCON_SELLOUT_FULL_HEADERS = [
  "Bayi",
  "Ürün Adı",
  "Arcon Referans",
  "Arcon Barkod",
  "Adet",
  "Ciro Kdv Dahil",
  "Ciro Kdv Hariç",
  "Mağaza",
  "Prim Mağaza",
  "Mağaza Kod",
  "Ay Sıra",
  "Ay",
  "Yıl",
  "Arcon Marka",
  "Marka Grup",
  "Ürün Grubu",
  "Şehir",
  "Bölge",
  "Arcon Ref Adı",
  "Sektör Adı",
  "Bölge2",
  "Rapor Bayi",
  "Ürün Grubu Detay",
  "Cinsiyet",
];

const AY_ADLARI = [
  "",
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const CANON_HEADERS = [...ARCON_SELLOUT_HEADERS, "_kaynak", "_not"];

function parseYearMonth(yearMonth) {
  const m = String(yearMonth || "").match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const yil = Number(m[1]);
  const ay = Number(m[2]);
  if (!yil || ay < 1 || ay > 12) return null;
  return { yil, ay, ayAdi: AY_ADLARI[ay] };
}

function toFullArconRow(partial, donem) {
  const haric = Number(partial["Ciro Kdv Hariç"]);
  const ciroHaric = Number.isFinite(haric) ? Math.round(haric * 100) / 100 : "";
  const ciroDahil =
    ciroHaric === "" ? "" : Math.round(ciroHaric * KDV_ORAN * 100) / 100;
  const magaza = partial["Prim Mağaza"] || partial.Mağaza || "";
  const urunAdi = partial["Ürün Adı"] || "";
  const grup = urunGrubuNormalize(
    partial["Ürün Grubu"] || partial["Ürün Grubu Detay"] || "",
    urunAdi
  );
  const grupDetay = urunGrubuNormalize(
    partial["Ürün Grubu Detay"] || partial["Ürün Grubu"] || "",
    urunAdi
  );
  return {
    Bayi: partial.Bayi || "",
    "Ürün Adı": partial["Ürün Adı"] || "",
    "Arcon Referans": partial["Arcon Referans"] || "",
    "Arcon Barkod": partial["Arcon Barkod"] || "",
    Adet: partial.Adet ?? "",
    "Ciro Kdv Dahil": ciroDahil,
    "Ciro Kdv Hariç": ciroHaric,
    Mağaza: magaza,
    "Prim Mağaza": magaza,
    "Mağaza Kod": partial["Mağaza Kod"] || "",
    "Ay Sıra": donem?.ay ?? "",
    Ay: donem?.ayAdi || "",
    Yıl: donem?.yil ?? "",
    "Arcon Marka": partial["Arcon Marka"] || "",
    "Marka Grup": partial["Marka Grup"] || "",
    "Ürün Grubu": grup,
    Şehir: partial.Şehir || "",
    Bölge: partial.Bölge || "",
    "Arcon Ref Adı": partial["Arcon Ref Adı"] || partial["Ürün Adı"] || "",
    "Sektör Adı": partial["Sektör Adı"] || "",
    Bölge2: partial.Bölge2 || "",
    "Rapor Bayi": partial["Rapor Bayi"] || partial.Bayi || "",
    "Ürün Grubu Detay": grupDetay || grup,
    Cinsiyet: partial.Cinsiyet || "",
  };
}

function toXlsxBuffer(rows, sheetName = "Sell-out Data") {
  const aoa = [
    ARCON_SELLOUT_FULL_HEADERS,
    ...rows.map((r) => ARCON_SELLOUT_FULL_HEADERS.map((h) => (r[h] == null ? "" : r[h]))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(sheetName).slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function markaGrupTahmin(marka) {
  const m = String(marka || "").toLocaleUpperCase("tr-TR").trim();
  if (!m) return "";
  if (m.includes("DIOR")) return "DIOR";
  if (m.includes("HERMES") || m.includes("HERMÈS")) return "HERMES";
  if (m.includes("GIVENCHY")) return "GIVENCHY";
  if (m.includes("DOLCE") || m.includes("GABBANA") || m === "DG") return "DOLCE&GABBANA";
  if (m.includes("SISLEY")) return "SISLEY";
  if (m.includes("LA PRAIRIE") || m.includes("PRAIRIE")) return "LA PRAIRIE";
  if (m.includes("SENSAI")) return "SENSAI";
  if (
    m.includes("RABANNE") ||
    m.includes("GAULTIER") ||
    m.includes("HERRERA") ||
    m.includes("BYREDO") ||
    m.includes("PENHALIGON") ||
    m.includes("NARCISO") ||
    m.includes("ISSEY") ||
    m.includes("ZADIG")
  ) {
    return "PUIG";
  }
  return m;
}

function urunGrubuNormalize(v, urunAdi = "") {
  const foldTr = (x) =>
    String(x || "")
      .toLocaleUpperCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  const s = foldTr(v);
  const name = foldTr(urunAdi);
  if (!s && !name) return "";

  // Sephora Department / Beymen üst grup / Boyner Section / açık etiket
  if (s.includes("TOOL") || s.includes("BRUSH")) return "MAKYAJ";
  // Sephora: HAIRCARE → SAÇ; Boyner Format: Hair Care → PARFÜM (saç parfümü vb.)
  if (s === "HAIRCARE") return "SAÇ BAKIM";
  if (s.includes("HAIR CARE")) return "PARFÜM";
  if (s.includes("SAC BAKIM")) return "SAÇ BAKIM";
  if (s === "SKINCARE" || s.includes("SKIN CARE") || s.includes("CILT BAKIM")) return "CİLT BAKIM";
  if (s.includes("GUNES") || s.includes("VUCUT BAKIM") || s.includes("BEBEK BAKIM") || s.includes("KISISEL BAKIM")) {
    return "CİLT BAKIM";
  }
  if (s.includes("EV KOZMETIK")) return "PARFÜM";
  // Beymen detay adları (yanlışlıkla üst yerine gelirse)
  if (
    s === "ALLIK" ||
    s === "RUJ" ||
    s === "FONDOTEN" ||
    s === "OJE" ||
    s === "MASKARA" ||
    s === "PUDRA" ||
    s === "AYDINLATICI" ||
    s === "BRONZ PUDRA" ||
    s === "EYELINER" ||
    s === "AUTO BRONZANT" ||
    s.includes("GOZ FARI") ||
    s.includes("GOZ KALEMI") ||
    s.includes("DUDAK") ||
    s.includes("MAKYAJ")
  ) {
    return "MAKYAJ";
  }
  if (s.includes("YASLANMAYI") || s.includes("NEMLENDIRICI") || s.includes("ONARICI") || s.includes("TONIK")) {
    return "CİLT BAKIM";
  }
  if (
    s.includes("PARF") ||
    s.includes("FRAGRAN") ||
    s.includes("PERFUME") ||
    s.includes("EAU DE") ||
    s === "AFTER SHAVE" ||
    s.includes("DEODORANT")
  ) {
    return "PARFÜM";
  }
  if (
    s.includes("MAKE UP") ||
    s.includes("MAKEUP") ||
    s.includes("MAKE-UP") ||
    s.includes("COLOUR") ||
    s.includes("COLOR") ||
    s.includes("COSMETIC") ||
    s.includes("MAKE")
  ) {
    return "MAKYAJ";
  }
  if (s.includes("OZELSERI") || s.includes("OZEL SERI")) return "OZELSERİ";

  // Sevil ham: grup=BAKIM → ürün adından SAÇ / CİLT ayır
  const sacAd =
    name.includes("HAIRCARE") ||
    name.includes("HAIR CARE") ||
    name.includes("HAIR RITUEL") ||
    /\bHAIR\b/.test(name) ||
    name.includes("CHEVEUX") ||
    name.includes("SHAMPOO") ||
    name.includes("CONDITIONER") ||
    name.includes("DEMELANTE") ||
    name.includes("SOIN LAVANT") ||
    name.includes("PELLICUL") ||
    name.includes("DANDRUFF") ||
    name.includes("FORTIFIANT") ||
    name.includes("CURL CARE") ||
    name.includes("COIFFURE");

  if (s === "BAKIM" || s.includes("BAKIM")) {
    return sacAd ? "SAÇ BAKIM" : "CİLT BAKIM";
  }
  if (s.includes("SKIN") || s.includes("BODY CARE")) return "CİLT BAKIM";

  return String(v || "").trim().toLocaleUpperCase("tr-TR");
}

function loadJson(name) {
  const p = path.join(__dirname, "../../data/demo", name);
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** Map değeri string veya { arcon, aktif } olabilir (Boyner sıralama formatı). */
function resolveMagazaAd(map, ham) {
  if (!ham || !map) return "";
  const v = map[ham];
  if (v == null || v === "") return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (v.aktif === false) return "";
    return String(v.arcon || v.ad || "").trim();
  }
  return String(v).trim();
}

function parseTrNumber(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let s = String(v).replace(/\s|\u00a0/g, "").replace(/TL\.?/gi, "");
  if (!s || s === "-" || s === "-.") return null;
  // 1.234.567 / -7.550 / 4.750,50 (EU binlik; eksi iadeler dahil)
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function csvOrXlsxToMatrix(buffer, dosyaAdi) {
  const lower = String(dosyaAdi || "").toLowerCase();
  // CSV: SheetJS Türkçe başlıkları bozabiliyor → UTF-8 satır satır oku
  if (lower.endsWith(".csv") || looksLikeCsv(buffer)) {
    let text = buffer.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    // bazen Windows-1254 / yanlış double-encode; Ã ile başlıyorsa latin1→utf8 dene
    if (/Ã.|Ä.|Å./.test(text.slice(0, 200)) && !/Ürün|Satış|Mağaza/.test(text.slice(0, 200))) {
      try {
        text = Buffer.from(buffer.toString("binary"), "latin1").toString("utf8");
      } catch (_) {
        /* keep utf8 */
      }
    }
    const lines = text.split(/\r?\n/).filter((l) => l.length);
    const matrix = lines.map((line) => parseCsvLine(line));
    return { sheet: "csv", matrix, dosyaAdi };
  }
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false, codepage: 65001 });
  const name = wb.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false });
  return { sheet: name, matrix, dosyaAdi };
}

function looksLikeCsv(buffer) {
  const head = buffer.slice(0, 80).toString("utf8");
  return head.includes(",") && !head.includes("PK\u0003\u0004");
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function pick(row, ...keys) {
  const entries = Object.entries(row);
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return row[k];
    const want = foldKey(k);
    const found = entries.find(([h]) => foldKey(h) === want);
    if (found && found[1] != null && String(found[1]).trim() !== "") return found[1];
  }
  // kısmi: Satış (VD) / Satis Miktari gibi
  for (const k of keys) {
    const want = foldKey(k);
    const found = entries.find(([h]) => foldKey(h).includes(want) || want.includes(foldKey(h)));
    if (found && found[1] != null && String(found[1]).trim() !== "") return found[1];
  }
  return "";
}

function foldKey(s) {
  return String(s || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9()]+/g, "");
}

/** Online / outlet — prim yok (Birol Format’ta da yok). Sell-out’ta atlanır. */
function isOnlineMagaza(...parts) {
  const s = parts
    .filter((p) => p != null && String(p).trim() !== "")
    .map((p) => String(p).toLocaleUpperCase("tr-TR"))
    .join(" ");
  if (!s) return false;
  if (/ON[\s-]?LINE|E[\s-]?STORE|ESTORE|INTERNET|E[\s-]?COM\b/.test(s)) return true;
  if (/BEYMEN\.COM|COMMUNITESTORE\.COM|SEPHORA\.COM/.test(s)) return true;
  if (/\.COM\b/.test(s) && /BEYMEN|SEPHORA|COMMUNITE|BOYNER|SEV[İI]L/.test(s)) return true;
  // Boyner pazaryeri / e-ticaret lokasyonları (Birol’da yok)
  if (/\b(TRENDYOL|AMAZON|HEPSIBURADA|BOYNERNOW|PAZARAMA)\b/.test(s)) return true;
  // Sevil sanal / online mağaza adı
  if (/SEV[İI]L\s+SANAL|\bSANAL\b/.test(s) && /SEV[İI]L|SANAL/.test(s)) return true;
  // Boyner outlet lokasyonları (Birol sell-out’ta yok — prim yok)
  if (/\bOUTLET\b|_OUTLET|OUTLET_/.test(s)) return true;
  // Sephora E-STORE mağaza kodu
  if (/^2853$/.test(String(parts[0] || "").trim())) return true;
  return false;
}

function matrixToObjects(matrix, headerRowIndex) {
  const hdr = (matrix[headerRowIndex] || []).map((h) => String(h || "").trim());
  const out = [];
  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    if (!row.some((c) => String(c || "").trim())) continue;
    const obj = {};
    hdr.forEach((h, j) => {
      if (h) obj[h] = row[j];
    });
    out.push(obj);
  }
  return out;
}

function detectKanal(dosyaAdi, sampleKeys) {
  const n = `${dosyaAdi} ${sampleKeys.join(" ")}`.toLocaleUpperCase("tr-TR");
  if (n.includes("SEVİL") || n.includes("SEVIL")) return "sevil";
  if (n.includes("BEYMEN") || n.includes("URETICI BARKOD") || n.includes("ÜRETİCİ BARKOD")) return "beymen";
  if (n.includes("SEPHORA") || n.includes("EAN CODE")) return "sephora";
  if (n.includes("BOYNER") || n.includes("POS KASA SATIŞ NET TUTAR")) return "boyner";
  if (n.includes("COMMUNITE")) return "communite";
  if (sampleKeys.some((k) => /Satış \(VD\)/i.test(k)) && sampleKeys.some((k) => /^Mgz$/i.test(k))) return "sevil";
  if (sampleKeys.some((k) => /URETICI BARKOD|ÜRETİCİ BARKOD/i.test(k))) return "beymen";
  if (sampleKeys.some((k) => /EAN Code/i.test(k))) return "sephora";
  if (sampleKeys.some((k) => /Pos Kasa Satış Net Tutar/i.test(k))) return "boyner";
  return "bilinmiyor";
}

function canonRow({
  bayi,
  barkod,
  adet,
  ciro,
  magaza,
  marka,
  urunAdi,
  referans,
  markaGrup,
  urunGrubu,
  kaynak,
  not,
}) {
  const m = marka || "";
  return {
    Bayi: bayi || "",
    "Ürün Adı": urunAdi || "",
    "Arcon Referans": referans || "",
    "Arcon Barkod": barkod || "",
    Adet: adet,
    "Ciro Kdv Hariç": ciro,
    "Prim Mağaza": magaza || "",
    "Arcon Marka": m,
    "Marka Grup": markaGrup || markaGrupTahmin(m),
    "Ürün Grubu": urunGrubuNormalize(urunGrubu, urunAdi),
    _kaynak: kaynak || "",
    _not: not || "",
  };
}

function normalizeSevil(rows, maps, dosyaAdi, opts = {}) {
  const sevilMap = maps.sevil || {};
  const refByBarkod = opts.refByBarkod || {};
  const out = [];
  let atlanan = 0;
  let kdvDusulen = 0;
  let refDb = 0;
  let atlananOnline = 0;
  const eslesmeyenKod = new Set();

  for (const row of rows) {
    const kod = String(pick(row, "Mgz", "MGZ", "Mağaza Kod") || "").trim();
    const barkod = String(pick(row, "Barkod") || "").trim();
    const adet = parseTrNumber(pick(row, "Satış Miktarı", "Satis Miktari", "Adet"));
    const vd = parseTrNumber(pick(row, "Satış (VD)", "Satis (VD)", "Satış VD"));
    if (adet == null || !barkod || vd == null) {
      atlanan++;
      continue;
    }
    const ciro = Math.round((vd / KDV_ORAN) * 100) / 100;
    kdvDusulen++;
    const magaza = sevilMap[kod] || "";
    if (kod && !magaza) eslesmeyenKod.add(kod);
    const magazaFinal = magaza || `SEVİL KOD:${kod}`;
    if (isOnlineMagaza(kod, magaza, magazaFinal)) {
      atlananOnline++;
      continue;
    }
    // Onların Arcon Ref = ürün kartındaki stok_kodu (SHR169250); ham Ürün Kodu (KT-169250) değil.
    const hamKod = String(pick(row, "Ürün Kodu", "Urun Kodu") || "").trim();
    const dbRef = refByBarkod[barkod] || "";
    if (dbRef) refDb++;
    out.push(
      canonRow({
        bayi: "SEVİL",
        barkod,
        adet: Math.round(adet),
        ciro,
        magaza: magazaFinal,
        marka: String(pick(row, "MARKA Açıklama", "MARKA", "Marka") || "").trim(),
        urunAdi: String(pick(row, "Ürün Adı", "Urun Adi") || "").trim(),
        referans: dbRef || hamKod,
        urunGrubu: String(pick(row, "ÜRÜN GRUBU Açıklama", "URUN GRUBU", "Ürün Grubu") || "").trim(),
        kaynak: dosyaAdi,
        not: magaza ? `KDV dahil ${vd} → /1.2` : `KDV /1.2; mağaza kod eşleşmedi: ${kod}`,
      })
    );
  }
  return {
    kanal: "sevil",
    satirlar: out,
    ozet: {
      giren: rows.length,
      kanonik: out.length,
      atlanan,
      atlananOnline,
      kdvDusulen,
      arconRefDb: refDb,
      eslesmeyenMagazaKod: [...eslesmeyenKod],
    },
    uyari: [],
  };
}

function normalizeBeymen(rows, opts, dosyaAdi) {
  const yearMonth = opts.yearMonth || null;
  const refByBarkod = opts.refByBarkod || {};
  const out = [];
  let atlananFiyat = 0;
  let atlananAy = 0;
  let atlananBarkod = 0;
  let atlananOnline = 0;
  let refDb = 0;

  for (const row of rows) {
    const ay = String(pick(row, "Zaman Yıl-Ay ADI", "Zaman Yil-Ay ADI") || "").trim();
    if (yearMonth && ay && ay !== yearMonth) {
      atlananAy++;
      continue;
    }
    const ciro = parseTrNumber(
      pick(row, "2026 Dİ POS-D Net Satış Ciro", "2026 DI POS-D Net Satış Ciro")
    );
    const adet = parseTrNumber(
      pick(row, "2026 Dİ POS-D Net Satış Miktar", "2026 DI POS-D Net Satış Miktar")
    );
    if (ciro == null || adet == null || adet === 0) {
      atlananFiyat++;
      continue;
    }
    const barkodHam = String(
      pick(
        row,
        "Ürün Varyant URETICI BARKOD",
        "Ürün Varyant ÜRETİCİ BARKOD",
        "Urun Varyant URETICI BARKOD"
      ) || ""
    ).trim();
    // Hamda bazen '3473311540805?' gibi soru işaretli geliyor — sadece rakamlar
    const barkod = barkodHam.replace(/\D/g, "");
    if (!barkod || barkod.length < 8) {
      atlananBarkod++;
      continue;
    }
    const magaza = String(pick(row, "Lokasyon ADI", "Lokasyon Adi") || "").trim();
    if (isOnlineMagaza(magaza)) {
      atlananOnline++;
      continue;
    }
    const hamRef = String(pick(row, "Ürün Ana FİRMA ÜRÜN KODU AKTİF") || "").trim();
    const dbRef = refByBarkod[barkod] || "";
    if (dbRef) refDb++;
    out.push(
      canonRow({
        bayi: "BEYMEN",
        barkod,
        adet: Math.round(adet),
        ciro: Math.round(ciro * 100) / 100,
        magaza,
        marka: String(pick(row, "Ürün Marka ADI", "Urun Marka ADI") || "").trim(),
        urunAdi: String(pick(row, "Ürün Varyant ADI", "Ürün Ana ADI") || "").trim(),
        referans: dbRef || hamRef,
        urunGrubu: String(pick(row, "Ürün MG Üst Grup ADI", "Ürün MG Detay Grup ADI") || "").trim(),
        kaynak: dosyaAdi,
        not: "üretici barkod; üst grup→kanonik ürün grubu",
      })
    );
  }
  return {
    kanal: "beymen",
    satirlar: out,
    ozet: {
      giren: rows.length,
      kanonik: out.length,
      atlananFiyat,
      atlananAy,
      atlananBarkod,
      atlananOnline,
      arconRefDb: refDb,
      yearMonthFiltre: yearMonth || null,
    },
    uyari: [],
  };
}

function normalizeSephora(rows, maps, dosyaAdi, opts = {}) {
  const sephMap = maps.sephora || {};
  const eanMap = maps.sephoraEan || {};
  const refByBarkod = opts.refByBarkod || {};
  const out = [];
  let atlanan = 0;
  let eanMapHit = 0;
  let refDb = 0;
  let atlananOnline = 0;
  const eslesmeyen = new Set();

  for (const row of rows) {
    const qty = parseTrNumber(pick(row, "Quantity N", "Quantity"));
    const sales = parseTrNumber(pick(row, "Sales VAT N", "Sales VAT"));
    const hamEan = String(pick(row, "EAN Code", "EAN") || "").trim();
    if (!hamEan || qty == null || qty === 0 || sales == null) {
      atlanan++;
      continue;
    }
    const ciro = Math.round((sales / KDV_ORAN) * 100) / 100;
    const kod = String(pick(row, "Store Code") || "").trim();
    const magaza = sephMap[kod] || "";
    if (kod && !magaza) eslesmeyen.add(kod);
    const storeDesc = String(pick(row, "Simple Store Description") || "").trim();
    const magazaFinal = magaza || (storeDesc ? `SEPHORA ${storeDesc}` : `SEPHORA KOD:${kod}`);
    if (isOnlineMagaza(kod, magaza, storeDesc, magazaFinal)) {
      atlananOnline++;
      continue;
    }
    const matKod = String(pick(row, "Material Code") || "").trim();

    // Onların Format’ı: ham EAN → Arcon Barkod + Arcon Ref (stok).
    // Map yoksa DB stok; barkod ham EAN kalır.
    const mapped = eanMap[hamEan];
    let barkod = hamEan;
    let referans = matKod;
    let notEk = "";
    if (mapped && (mapped.barkod || mapped.ref)) {
      eanMapHit++;
      if (mapped.barkod) barkod = mapped.barkod;
      if (mapped.ref) referans = mapped.ref;
      notEk = mapped.barkod && mapped.barkod !== hamEan ? `; EAN→Arcon ${hamEan}→${barkod}` : "; EAN map ref";
    } else {
      const dbRef = refByBarkod[hamEan] || refByBarkod[barkod] || "";
      if (dbRef) {
        refDb++;
        referans = dbRef;
        notEk = "; DB stok_kodu";
      }
    }

    out.push(
      canonRow({
        bayi: "SEPHORA",
        barkod,
        adet: Math.round(qty),
        ciro,
        magaza: magazaFinal,
        marka: String(pick(row, "Brand") || "").trim(),
        urunAdi: String(pick(row, "Material") || "").trim(),
        referans,
        urunGrubu: String(pick(row, "Department") || "").trim(),
        kaynak: dosyaAdi,
        not: (magaza ? "Sales VAT /1.2" : `Sales VAT /1.2; map yok: ${kod}`) + notEk,
      })
    );
  }
  return {
    kanal: "sephora",
    satirlar: out,
    ozet: {
      giren: rows.length,
      kanonik: out.length,
      atlanan,
      atlananOnline,
      eanMapHit,
      refDb,
      eslesmeyenMagazaKod: [...eslesmeyen],
    },
    uyari: [],
  };
}

function normalizeBoyner(rows, maps, dosyaAdi) {
  const boynerMap = maps.boyner || {};
  const out = [];
  let atlanan = 0;
  let atlananOnline = 0;
  const eslesmeyen = new Set();

  for (const row of rows) {
    const adet = parseTrNumber(pick(row, "Pos Kasa Satış Net Miktar", "Pos Kasa Satis Net Miktar"));
    const ciro = parseTrNumber(
      pick(row, "Pos Kasa Satış Net Tutar KDV'siz", "Pos Kasa Satis Net Tutar KDVsiz")
    );
    const barkod = String(pick(row, "Urun ANAEAN", "Ürün ANAEAN") || "").trim();
    // Hamda barkodsuz GWP/numune bazen '-1' / -1 geliyor — geçersiz, atla
    const barkodTemiz = barkod.replace(/^'+/, "").trim();
    if (
      !barkodTemiz ||
      barkodTemiz === "-1" ||
      barkodTemiz === "0" ||
      !/\d{8,}/.test(barkodTemiz) ||
      adet == null ||
      adet === 0 ||
      ciro == null
    ) {
      atlanan++;
      continue;
    }
    const lok = String(pick(row, "Lokasyon DESC", "Lokasyon") || "").trim();
    const magaza = resolveMagazaAd(boynerMap, lok) || lok;
    if (lok && !resolveMagazaAd(boynerMap, lok)) eslesmeyen.add(lok);
    if (isOnlineMagaza(lok, magaza)) {
      atlananOnline++;
      continue;
    }
    out.push(
      canonRow({
        bayi: "BOYNER",
        barkod: barkodTemiz,
        adet: Math.round(adet),
        ciro: Math.round(ciro * 100) / 100,
        magaza,
        marka: String(pick(row, "Urun Marka DESC", "Ürün Marka DESC") || "").trim(),
        urunAdi: String(pick(row, "Urun DESC", "Ürün DESC") || "").trim(),
        // Arcon Referans = ürün kodu (Urun Model: HRM108409V0). SATICI MALZEME İngilizce isim.
        referans: String(pick(row, "Urun Model", "Urun SATICI MALZEME") || "").trim(),
        urunGrubu: String(pick(row, "Section DESC", "Product Group DESC") || "").trim(),
        kaynak: dosyaAdi,
        not: "KDVsiz tutar hamda",
      })
    );
  }
  return {
    kanal: "boyner",
    satirlar: out,
    ozet: {
      giren: rows.length,
      kanonik: out.length,
      atlanan,
      atlananOnline,
      eslesmeyenLokasyon: [...eslesmeyen].slice(0, 40),
    },
    uyari: [],
  };
}

/**
 * Communite ham: satır ürün × sütun lokasyon pivot.
 * Satır 3: lokasyon adları (her 3 kolonda bir blok)
 * Satır 4: Pos Kasa Miktar | SAP Miktar | SAP Tutar KDVsiz
 * Onların Arcon Format'ı SAP kolonlarını kullanır; HORIZON / Genel Toplam atlanır.
 */
function normalizeCommunite(matrix, maps, dosyaAdi, opts = {}) {
  const magMap = maps.communite || {};
  const refByBarkod = opts.refByBarkod || {};
  const SKIP_LOK = new Set(["GENEL TOPLAM", "HORIZON DAĞITIM MERKEZI", "COMMUNITESTORE.COM"]);

  let locRowIdx = -1;
  let metricRowIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 12); i++) {
    const row = matrix[i] || [];
    const joined = row.map((c) => String(c || "").trim()).join("|");
    if (/Lokasyon DESC/i.test(joined)) locRowIdx = i + 1;
    if (/Urun Marka DESC/i.test(joined) && /ANAEAN/i.test(joined)) metricRowIdx = i;
  }
  if (locRowIdx < 0 || metricRowIdx < 0 || locRowIdx >= matrix.length) {
    return {
      kanal: "communite",
      satirlar: [],
      ozet: { giren: matrix.length, kanonik: 0, atlanan: matrix.length },
      uyari: [{ tip: "communite_pivot", mesaj: "Pivot başlık satırları bulunamadı." }],
    };
  }

  const locRow = matrix[locRowIdx] || [];
  const blocks = [];
  for (let c = 0; c < locRow.length; c++) {
    const lok = String(locRow[c] || "").trim();
    if (!lok) continue;
    const up = lok.toLocaleUpperCase("tr-TR");
    if (SKIP_LOK.has(up) || up.includes("GENEL TOPLAM") || up.startsWith("HORIZON")) continue;
    if (isOnlineMagaza(lok, up)) continue;
    // Blok: [Pos miktar, SAP miktar, SAP tutar] — lokasyon adı SAP miktar kolonunun 1 önünde
    // Hamda lokasyon başlığı Pos kolonunun üzerinde (c, c+1, c+2)
    blocks.push({ lok, posCol: c, sapAdetCol: c + 1, sapCiroCol: c + 2 });
  }

  const out = [];
  let atlanan = 0;
  let atlananOnline = 0;
  let refDb = 0;
  const eslesmeyen = new Set();
  let marka = "";

  for (let i = metricRowIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    if (!row.some((c) => String(c || "").trim())) continue;

    const m = String(row[0] || "").trim();
    if (m) marka = m;
    const barkod = String(row[2] || "").trim();
    const urunAdi = String(row[3] || "").trim();
    if (!barkod) {
      atlanan++;
      continue;
    }

    const dbRef = refByBarkod[barkod] || "";
    if (dbRef) refDb++;

    for (const b of blocks) {
      const adet = parseTrNumber(row[b.sapAdetCol]);
      const ciro = parseTrNumber(row[b.sapCiroCol]);
      if (adet == null || ciro == null) continue;
      if (adet === 0 && ciro === 0) continue;

      const magaza = magMap[b.lok] || b.lok;
      if (b.lok && !magMap[b.lok]) eslesmeyen.add(b.lok);
      if (isOnlineMagaza(b.lok, magaza)) {
        atlananOnline++;
        continue;
      }

      out.push(
        canonRow({
          bayi: "COMMUNITE",
          barkod,
          adet: Math.round(adet),
          ciro: Math.round(ciro * 100) / 100,
          magaza,
          marka,
          urunAdi,
          referans: dbRef,
          kaynak: dosyaAdi,
          not: magMap[b.lok] ? "SAP pivot unpivot" : `SAP pivot; mağaza map yok: ${b.lok}`,
        })
      );
    }
  }

  return {
    kanal: "communite",
    satirlar: out,
    ozet: {
      giren: matrix.length - (metricRowIdx + 1),
      kanonik: out.length,
      atlanan,
      atlananOnline,
      refDb,
      lokasyonBlok: blocks.map((b) => b.lok),
      eslesmeyenLokasyon: [...eslesmeyen],
    },
    uyari: [],
  };
}

function loadMaps() {
  return {
    sevil: loadJson("sevil-magaza-eslestirme.json"),
    sephora: loadJson("sephora-magaza-eslestirme.json"),
    sephoraEan: loadJson("sephora-ean-eslestirme.json"),
    boyner: loadJson("boyner-magaza-eslestirme.json"),
    communite: loadJson("communite-magaza-eslestirme.json"),
  };
}

function toCsv(rows, { arconOnly = false } = {}) {
  const hdr = arconOnly ? ARCON_SELLOUT_HEADERS : CANON_HEADERS;
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [hdr.join(",")];
  for (const r of rows) {
    lines.push(hdr.map((h) => esc(r[h])).join(","));
  }
  return lines.join("\n");
}

/**
 * @param {{ buffer: Buffer, dosyaAdi: string }[]} files
 * @param {{ yearMonth?: string, zeopsIndex?: { bul: (s: string) => string|null, adet?: number } }} opts
 */
function normalizeSelloutFiles(files, opts = {}) {
  const maps = loadMaps();
  const parcalar = [];
  const tum = [];

  for (const file of files) {
    const { matrix } = csvOrXlsxToMatrix(file.buffer, file.dosyaAdi);
    const flatJoin = matrix
      .slice(0, 8)
      .map((r) => (r || []).join("|"))
      .join("||");

    if (/Lokasyon DESC/i.test(flatJoin) && /COMMUNITE/i.test(flatJoin + file.dosyaAdi)) {
      const r = normalizeCommunite(matrix, maps, file.dosyaAdi, opts);
      tum.push(...r.satirlar);
      parcalar.push({
        dosyaAdi: file.dosyaAdi,
        kanal: r.kanal,
        ozet: r.ozet,
        uyari: r.uyari,
      });
      continue;
    }

    let headerIdx = 0;
    if (/Product Group ID/i.test(flatJoin)) {
      headerIdx = matrix.findIndex((r) => (r || []).some((c) => String(c) === "Product Group ID"));
      if (headerIdx < 0) headerIdx = 5;
    }

    const rows = matrixToObjects(matrix, headerIdx);
    const keys = rows[0] ? Object.keys(rows[0]) : (matrix[headerIdx] || []).map(String);
    const kanal = detectKanal(file.dosyaAdi, keys);
    let result;
    if (kanal === "sevil") result = normalizeSevil(rows, maps, file.dosyaAdi, opts);
    else if (kanal === "beymen") result = normalizeBeymen(rows, opts, file.dosyaAdi);
    else if (kanal === "sephora") result = normalizeSephora(rows, maps, file.dosyaAdi, opts);
    else if (kanal === "boyner") result = normalizeBoyner(rows, maps, file.dosyaAdi);
    else {
      result = {
        kanal,
        satirlar: [],
        ozet: { giren: rows.length, kanonik: 0, atlanan: rows.length },
        uyari: [{ tip: "taninamadi", mesaj: `Kanal tanınamadı: ${file.dosyaAdi}`, keys: keys.slice(0, 12) }],
      };
    }
    tum.push(...result.satirlar);
    parcalar.push({
      dosyaAdi: file.dosyaAdi,
      kanal: result.kanal,
      ozet: result.ozet,
      uyari: result.uyari,
    });
  }

  // Birol Format: iade yok (adet/ciro negatif satır üretilmez)
  // canonRow alanları: Adet / Ciro Kdv Hariç
  let atlananIade = 0;
  const tumNet = [];
  for (const r of tum) {
    const adet = Number(r.Adet ?? r.adet);
    const ciro = Number(r["Ciro Kdv Hariç"] ?? r.ciro);
    if ((Number.isFinite(adet) && adet < 0) || (Number.isFinite(ciro) && ciro < 0)) {
      atlananIade++;
      continue;
    }
    tumNet.push(r);
  }

  let zeopsEleme = null;
  let tumZeops = tumNet;
  if (opts.zeopsIndex) {
    zeopsEleme = eleZeopsDisi(
      tumNet,
      opts.zeopsIndex,
      (r) => r["Prim Mağaza"] || r.Mağaza,
      (r, ad) => {
        r["Prim Mağaza"] = ad;
        if ("Mağaza" in r) r.Mağaza = ad;
      }
    );
    tumZeops = zeopsEleme.kalan;
  }

  const donem = parseYearMonth(opts.yearMonth);
  const fullRows = tumZeops.map((r) => toFullArconRow(r, donem));
  const xlsxBuf = toXlsxBuffer(fullRows, "Sell-out Data");

  return {
    headers: ARCON_SELLOUT_FULL_HEADERS,
    satirSayisi: tumZeops.length,
    ornek: fullRows.slice(0, 100),
    parcalar,
    ozet: {
      atlananIade,
      zeopsMagaza: opts.zeopsIndex?.adet ?? null,
      atlananZeopsSatir: zeopsEleme?.satir ?? 0,
      atlananZeopsMagaza: zeopsEleme?.magazalar?.length ?? 0,
      zeopsYazim: zeopsEleme?.yazimHizalanan ?? 0,
      zeopsDisiMagazalar: zeopsEleme?.magazalar ?? [],
    },
    csv: toCsv(tumZeops, { arconOnly: true }),
    csvDebug: toCsv(tumZeops, { arconOnly: false }),
    xlsxBase64: xlsxBuf.toString("base64"),
    donem,
  };
}

function rowsFromDbSellout(dbRows, donem) {
  return (dbRows || []).map((r) =>
    toFullArconRow(
      {
        Bayi: r.bayi || "",
        "Ürün Adı": r.urun_adi || "",
        "Arcon Referans": r.arcon_referans || "",
        "Arcon Barkod": r.arcon_barkod || "",
        Adet: r.adet,
        "Ciro Kdv Hariç": Number(r.ciro_kdv_haric),
        "Prim Mağaza": r.magaza_ham || "",
        "Arcon Marka": r.marka || "",
        "Marka Grup": r.marka_grup || "",
        "Ürün Grubu": r.urun_grubu || "",
      },
      donem
    )
  );
}

module.exports = {
  normalizeSelloutFiles,
  CANON_HEADERS,
  ARCON_SELLOUT_HEADERS,
  ARCON_SELLOUT_FULL_HEADERS,
  KDV_ORAN,
  toCsv,
  toXlsxBuffer,
  toFullArconRow,
  rowsFromDbSellout,
  parseYearMonth,
  isOnlineMagaza,
};
