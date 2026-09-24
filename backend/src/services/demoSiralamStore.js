const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "../../data/demo/siralam-sonuc");
const META = path.join(DIR, "meta.json");
const XLSX_PATH = path.join(DIR, "siralam.xlsx");
const DEMO_DATA = path.join(__dirname, "../../data/demo");

const MAGAZA_MAP_DOSYALARI = {
  boyner: "boyner-magaza-eslestirme.json",
  sevil: "sevil-magaza-eslestirme.json",
  beymen: "beymen-siralam-magaza.json",
};

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function saveSiralamSonuc(sonuc, xlsxBuffer, { yearMonth, dosyaAdlari } = {}) {
  ensureDir();
  fs.writeFileSync(XLSX_PATH, xlsxBuffer);
  const meta = {
    kaydedildiAt: new Date().toISOString(),
    yearMonth: yearMonth || null,
    dosyaAdlari: dosyaAdlari || [],
    ozet: sonuc.ozet,
    kanallar: sonuc.kanallar,
    uyari: sonuc.uyari,
    headers: sonuc.headers,
    satirSayisi: sonuc.satirlar.length,
    onizleme: sonuc.onizleme,
  };
  fs.writeFileSync(META, JSON.stringify(meta, null, 2), "utf8");
  return {
    ...meta,
    kaydedildi: true,
    xlsxIndir: "/api/demo/siralam/xlsx",
  };
}

function loadSiralamSonuc() {
  if (!fs.existsSync(META)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(META, "utf8"));
    return { ...meta, xlsxIndir: "/api/demo/siralam/xlsx" };
  } catch {
    return null;
  }
}

function readSiralamXlsxBuffer() {
  if (!fs.existsSync(XLSX_PATH)) return null;
  return fs.readFileSync(XLSX_PATH);
}

function magazaMapPath(kanal) {
  const file = MAGAZA_MAP_DOSYALARI[String(kanal || "").toLowerCase()];
  if (!file) return null;
  return path.join(DEMO_DATA, file);
}

/** Ham JSON oku (string veya { arcon, aktif }) */
function loadMagazaMapRaw(kanal) {
  const p = magazaMapPath(kanal);
  if (!p || !fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function parseMapEntry(v) {
  if (typeof v === "string") {
    const arcon = v.trim();
    if (!arcon || /^#N\/?A$/i.test(arcon)) return null;
    return { arcon, aktif: true };
  }
  if (v && typeof v === "object") {
    const arcon = String(v.arcon || v.ad || "").trim();
    if (!arcon || /^#N\/?A$/i.test(arcon)) return null;
    const aktif = v.aktif === false || v.pasif === true ? false : true;
    return { arcon, aktif };
  }
  return null;
}

/** UI: tüm satırlar (pasif dahil) */
function loadMagazaMapSatirlari(kanal) {
  const raw = loadMagazaMapRaw(kanal);
  const satirlari = [];
  for (const [hamRaw, v] of Object.entries(raw)) {
    const ham = String(hamRaw || "").trim();
    if (!ham) continue;
    const p = parseMapEntry(v);
    if (!p) continue;
    satirlari.push({ ham, arcon: p.arcon, aktif: p.aktif });
  }
  satirlari.sort((a, b) => a.ham.localeCompare(b.ham, "tr"));
  return satirlari;
}

/** Normalize: sadece aktif → { ham: arcon } */
function aktifMagazaFlatMap(kanal) {
  const flat = {};
  for (const s of loadMagazaMapSatirlari(kanal)) {
    if (s.aktif) flat[s.ham] = s.arcon;
  }
  return flat;
}

/** Eski API uyumu */
function loadMagazaMap(kanal) {
  return aktifMagazaFlatMap(kanal);
}

function saveMagazaMap(kanal, input) {
  const p = magazaMapPath(kanal);
  if (!p) throw new Error(`Bilinmeyen kanal: ${kanal}`);

  let satirlari = [];
  if (Array.isArray(input)) {
    satirlari = input;
  } else if (input && Array.isArray(input.satirlari)) {
    satirlari = input.satirlari;
  } else if (input && typeof input === "object") {
    // { ham: arcon } veya { ham: { arcon, aktif } }
    for (const [ham, v] of Object.entries(input)) {
      if (ham === "satirlari" || ham === "map" || ham === "kanal") continue;
      const pEntry = parseMapEntry(typeof v === "string" ? v : { ...v, arcon: v?.arcon || v });
      if (!pEntry) continue;
      satirlari.push({
        ham,
        arcon: pEntry.arcon,
        aktif: typeof v === "object" && v && "aktif" in v ? v.aktif !== false : pEntry.aktif,
      });
    }
  } else {
    throw new Error("satirlari veya map gerekli");
  }

  const cleaned = {};
  for (const s of satirlari) {
    const ham = String(s?.ham || "").trim();
    const arcon = String(s?.arcon || "").trim();
    if (!ham || !arcon || /^#N\/?A$/i.test(arcon)) continue;
    cleaned[ham] = {
      arcon,
      aktif: s?.aktif === false || s?.pasif === true ? false : true,
    };
  }
  const sorted = Object.fromEntries(
    Object.entries(cleaned).sort((a, b) => a[0].localeCompare(b[0], "tr"))
  );
  fs.writeFileSync(p, JSON.stringify(sorted, null, 2) + "\n", "utf8");

  const liste = loadMagazaMapSatirlari(kanal);
  const aktifAdet = liste.filter((x) => x.aktif).length;
  return {
    kanal,
    adet: liste.length,
    aktifAdet,
    pasifAdet: liste.length - aktifAdet,
    satirlari: liste,
    map: aktifMagazaFlatMap(kanal),
  };
}

module.exports = {
  saveSiralamSonuc,
  loadSiralamSonuc,
  readSiralamXlsxBuffer,
  MAGAZA_MAP_DOSYALARI,
  loadMagazaMap,
  loadMagazaMapSatirlari,
  aktifMagazaFlatMap,
  saveMagazaMap,
};
