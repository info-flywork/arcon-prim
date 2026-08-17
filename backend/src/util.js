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

/**
 * Zeops ham ad → uzman_id.
 * Exact match + "Yasemin UZUN Yılan" → "Yasemin Uzun" (uzman adının tüm
 * tokenları ham ada sırayla gömülü; en uzun eşleşme kazanır).
 */
function resolveUzmanId(uzmanMap, uzmanHam) {
  const ham = normalizeName(uzmanHam);
  if (!ham) return null;
  if (uzmanMap.has(ham)) return uzmanMap.get(ham);

  const hamTokens = ham.split(" ").filter(Boolean);
  if (hamTokens.length < 2) return null;

  let best = null; // { id, len }
  let tie = false;
  for (const [normalAd, id] of uzmanMap) {
    const uTokens = String(normalAd).split(" ").filter(Boolean);
    if (uTokens.length < 2) continue;
    // Ham, uzman adıyla başlamalı veya uzman tokenları sırayla ham içinde olmalı
    let hi = 0;
    let ok = true;
    for (const t of uTokens) {
      while (hi < hamTokens.length && hamTokens[hi] !== t) hi++;
      if (hi >= hamTokens.length) { ok = false; break; }
      hi++;
    }
    if (!ok) continue;
    const len = uTokens.join(" ").length;
    if (!best || len > best.len) {
      best = { id, len };
      tie = false;
    } else if (len === best.len && best.id !== id) {
      tie = true;
    }
  }
  if (!best || tie) return null;
  return best.id;
}

// Mağaza adı normalizasyonu (alias anahtarı)
function normalizeStore(s) {
  return normalizeName(s);
}

/** Exact alias/ad, yoksa tek mağaza: "SEPHORA CITYS" → "SEPHORA CITYS KOZYATAGI" */
function resolveStoreId(map, ham) {
  const n = normalizeStore(ham);
  if (!n) return null;
  if (map.has(n)) return map.get(n);
  const ids = new Set();
  for (const [key, id] of map) {
    if (key && (key === n || key.startsWith(`${n} `))) ids.add(id);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

// "5.800,00" / "  2.258,33TL. " / 5800 -> Number
function parseTrNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return 0;
    // CSV/xlsx bazen TR binlik "584.098" (=584098) değerini float 584.098 yapar.
    // Tek grup, tam 3 ondalık hane → binlik ayraç olarak yorumla.
    const asStr = String(v);
    if (v >= 1 && /^\d{1,3}\.\d{3}$/.test(asStr)) {
      return Number(asStr.replace(/\./g, ""));
    }
    return v;
  }
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

// "5/1/2026" / "5/1/26" (M/D/Y Zeops), "05.01.2026" (D.M.Y TR), Excel seri -> "YYYY-MM-DD"
function parseDate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel seri numarası (1900 sistemi)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const yil4 = (y) => {
    if (y.length === 4) return y;
    const n = Number(y);
    if (!Number.isFinite(n)) return null;
    // 2 haneli yıl: SheetJS CSV'de "5/1/26" üretir
    return n >= 70 ? `19${String(n).padStart(2, "0")}` : `20${String(n).padStart(2, "0")}`;
  };
  // Zeops / SheetJS: M/D/YYYY veya M/D/YY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const y = yil4(m[3]);
    if (!y) return null;
    return `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }
  // TR: D.M.YYYY veya D.M.YY
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (m) {
    const y = yil4(m[3]);
    if (!y) return null;
    return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
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

module.exports = { normalizeName, normalizeStore, resolveStoreId, parseTrNumber, parseDate, cleanBarcode, resolveUzmanId };
