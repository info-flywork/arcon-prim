const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "../../data/demo/hedef-sonuc");
const META = path.join(DIR, "meta.json");
const XLSX_PATH = path.join(DIR, "hedef.xlsx");

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function saveHedefSonuc(sonuc, xlsxBuffer, { yearMonth, dosyaAdlari } = {}) {
  ensureDir();
  fs.writeFileSync(XLSX_PATH, xlsxBuffer);
  const meta = {
    kaydedildiAt: new Date().toISOString(),
    yearMonth: yearMonth || null,
    dosyaAdlari: dosyaAdlari || [],
    ozet: sonuc.ozet,
    kanallar: sonuc.kanallar,
    uyari: sonuc.uyari,
    headers: sonuc.ozetHeaders || sonuc.headers,
    ozetHeaders: sonuc.ozetHeaders,
    // Ana çıktı = Birol özet satır sayısı
    satirSayisi: (sonuc.ozetSatirlar || []).length,
    markaSatirSayisi: (sonuc.satirlar || []).length,
    ozetSatirSayisi: (sonuc.ozetSatirlar || []).length,
    onizleme: sonuc.onizleme,
    ozetOnizleme: sonuc.ozetOnizleme,
  };
  fs.writeFileSync(META, JSON.stringify(meta, null, 2), "utf8");
  return {
    ...meta,
    kaydedildi: true,
    xlsxIndir: "/api/demo/hedef/xlsx",
  };
}

function loadHedefSonuc() {
  if (!fs.existsSync(META)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(META, "utf8"));
    return { ...meta, xlsxIndir: "/api/demo/hedef/xlsx" };
  } catch {
    return null;
  }
}

function readHedefXlsxBuffer() {
  if (!fs.existsSync(XLSX_PATH)) return null;
  return fs.readFileSync(XLSX_PATH);
}

module.exports = {
  saveHedefSonuc,
  loadHedefSonuc,
  readHedefXlsxBuffer,
};
