/**
 * Birol kuralı: Zeops ham datada geçmeyen mağaza sıralama ve sell-out’ta yok.
 * Eşleşme Mağaza adına göre. ISTANBUL / CENTER token’ı yazım farkı sayılır
 * (BEYMEN İSTANBUL İSTİNYEPARK ↔ BEYMEN İSTİNYE PARK, ZORLU CENTER ↔ ZORLU).
 */
const XLSX = require("xlsx");

const DROP_TOKEN = new Set(["ISTANBUL", "CENTER"]);

function fold(s) {
  return String(s ?? "")
    .replace(/İ/g, "I")
    .replace(/ı/g, "I")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchKey(s) {
  return fold(s)
    .split(" ")
    .filter((t) => t && !DROP_TOKEN.has(t))
    .join("");
}

function readRows(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false, codepage: 65001 });
  const name =
    wb.SheetNames.find((n) => /zeops/i.test(n)) ||
    wb.SheetNames.find((n) => /ham/i.test(n)) ||
    wb.SheetNames[0];
  const sh = wb.Sheets[name];
  if (!sh) return [];
  return XLSX.utils.sheet_to_json(sh, { defval: "", raw: false });
}

function magazaHucre(row) {
  if (!row || typeof row !== "object") return "";
  const direct = row["Mağaza"] ?? row["Magaza"] ?? row["MAĞAZA"] ?? row["MAĞAZA ADI"];
  if (direct != null && String(direct).trim()) return String(direct).trim();
  for (const [k, v] of Object.entries(row)) {
    const f = fold(k).replace(/ /g, "");
    if (f === "MAGAZA" || f === "MAGAZAADI") return String(v ?? "").trim();
  }
  return "";
}

/**
 * @param {Buffer} buffer Zeops ham data (Mağaza kolonu)
 */
function loadZeopsMagazaIndex(buffer) {
  const rows = readRows(buffer);
  const byFold = new Map();
  const keyOwner = new Map();
  const ambiguous = new Set();

  for (const row of rows) {
    const name = magazaHucre(row);
    if (!name) continue;
    const f = fold(name);
    if (!byFold.has(f)) byFold.set(f, name);
    const k = matchKey(name);
    if (!k) continue;
    const prev = keyOwner.get(k);
    if (prev && prev !== byFold.get(f)) ambiguous.add(k);
    else keyOwner.set(k, byFold.get(f));
  }
  for (const k of ambiguous) keyOwner.delete(k);

  return {
    adet: byFold.size,
    /** Zeops’taki kanonik yazımı döner; yoksa null. */
    bul(ham) {
      const name = String(ham || "").trim();
      if (!name) return null;
      const f = fold(name);
      if (byFold.has(f)) return byFold.get(f);
      const k = matchKey(name);
      if (k && keyOwner.has(k)) return keyOwner.get(k);
      return null;
    },
  };
}

/**
 * Zeops’ta olmayan mağaza satırını at. Eşleşen yazımı Zeops adına çeker.
 * @param {object[]} rows
 * @param {{ bul: (s: string) => string|null }} index
 * @param {(row: object) => string} oku
 * @param {(row: object, ad: string) => void} yaz
 */
function eleZeopsDisi(rows, index, oku, yaz) {
  const kalan = [];
  const dusen = new Map();
  let yazimHizalanan = 0;
  for (const row of rows) {
    const ad = String(oku(row) || "").trim();
    const hit = index.bul(ad);
    if (!hit) {
      const key = ad || "(boş mağaza)";
      dusen.set(key, (dusen.get(key) || 0) + 1);
      continue;
    }
    if (hit !== ad) {
      yaz(row, hit);
      yazimHizalanan++;
    }
    kalan.push(row);
  }
  const magazalar = [...dusen.entries()]
    .map(([magaza, satir]) => ({ magaza, satir }))
    .sort((a, b) => a.magaza.localeCompare(b.magaza, "tr"));
  const satir = magazalar.reduce((n, m) => n + m.satir, 0);
  return { kalan, satir, magazalar, yazimHizalanan };
}

module.exports = {
  loadZeopsMagazaIndex,
  eleZeopsDisi,
  fold,
  matchKey,
};
