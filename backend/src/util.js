// Ortak yardımcılar: Türkçe normalizasyon, sayı/tarih ayrıştırma

// "Yıldırım  Tezer " -> "YILDIRIM TEZER" (TR karakterler sadeleştirilir)
function normalizeName(s) {
  if (!s) return "";
  return String(s)
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C");
}

// Mağaza adı normalizasyonu (alias anahtarı)
function normalizeStore(s) {
  return normalizeName(s);
}

// "5.800,00" / "  2.258,33TL. " / 5800 -> Number
function parseTrNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).replace(/TL\.?/gi, "").replace(/[₺\s]/g, "").trim();
  if (!s || s === "-") return 0;
  // 1.234.567,89 -> 1234567.89
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // "1.234" gibi binlik ayraçlı tam sayı ihtimali: son grupta 3 hane varsa binlik say
    const m = s.match(/^\d{1,3}(\.\d{3})+$/);
    if (m) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// "5/1/2026" (M/D/YYYY), "05.01.2026", Excel seri numarası -> "YYYY-MM-DD"
function parseDate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel seri numarası (1900 sistemi)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (m) {
    // Zeops ihracı M/D/YYYY formatında (5/1/2026 = 1 Mayıs 2026)
    const [, a, b, y] = m;
    const month = String(a).padStart(2, "0");
    const day = String(b).padStart(2, "0");
    return `${y}-${month}-${day}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return s.slice(0, 10);
  return null;
}

// Barkod temizle (bilimsel gösterim, boşluk vb.)
function cleanBarcode(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (/e\+/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = n.toFixed(0);
  }
  s = s.replace(/\D/g, "");
  return s || null;
}

module.exports = { normalizeName, normalizeStore, parseTrNumber, parseDate, cleanBarcode };
