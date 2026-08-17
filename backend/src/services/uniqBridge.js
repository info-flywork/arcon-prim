// Excel Prim Çalışma Uniq köprüsü:
// Zeops referans/barkod ≠ sell-out referans/barkod olsa bile aynı UNIQ KOD → aynı ürün.
// Ör. TOO EDPI NEW DGI89663500999 + THE ONLY ONE DGI89663500000 → DGB000000243
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const UNIQ_FILE = path.join(__dirname, "../../data/master/uniq-kod.csv");

function normKod(v) {
  return String(v || "").trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
}
function normBar(v) {
  return String(v || "").trim().replace(/\D/g, "");
}

let csvCache = null;

function loadUniqCsvRows() {
  if (csvCache) return csvCache;
  csvCache = [];
  if (!fs.existsSync(UNIQ_FILE)) return csvCache;
  const buffer = fs.readFileSync(UNIQ_FILE);
  const workbook = XLSX.read(buffer.toString("utf8"), { type: "string", raw: false, codepage: 65001 });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const headerIdx = rows.findIndex((r) =>
    Object.values(r).some((v) => String(v).toLocaleUpperCase("tr-TR").trim() === "MARKA")
  );
  let dataRows = rows;
  if (headerIdx >= 0) {
    const headerRow = rows[headerIdx];
    const keys = Object.keys(headerRow);
    const headers = keys.map((k) => String(headerRow[k] || "").trim());
    dataRows = rows.slice(headerIdx + 1).map((r) => {
      const obj = {};
      keys.forEach((k, i) => { obj[headers[i] || k] = r[k]; });
      return obj;
    });
  }
  const pick = (row, ...names) => {
    for (const name of names) {
      if (row[name] != null && String(row[name]).trim() !== "") return row[name];
    }
    const map = {};
    for (const [k, v] of Object.entries(row)) {
      map[String(k).trim().toLocaleUpperCase("tr-TR")] = v;
    }
    for (const name of names) {
      const hit = map[String(name).trim().toLocaleUpperCase("tr-TR")];
      if (hit != null && String(hit).trim() !== "") return hit;
    }
    return "";
  };
  for (const row of dataRows) {
    const canon = normKod(pick(row, "UNIQ KOD"));
    if (!canon) continue;
    const refs = [canon];
    const bars = [];
    for (let i = 1; i <= 6; i++) {
      const ref = normKod(pick(row, `REFERANS-${i}`, `REFERANS ${i}`));
      const bar = normBar(pick(row, `BARKOD-${i}`, `BARKOD ${i}`));
      if (ref) refs.push(ref);
      if (bar) bars.push(bar);
    }
    csvCache.push({ canon, refs, bars });
  }
  return csvCache;
}

function mapCode(codeToUniq, code, canon, asBarkod) {
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

/**
 * Referans/barkod → kanonik UNIQ KOD.
 * Önce urun_kimlik, sonra uniq_kod tablosu, en sonda Excel master (çakışmada Excel kazanır).
 */
async function loadUniqBridge(conn) {
  const codeToUniq = new Map();

  try {
    const [kim] = await conn.query(`
      SELECT k.tip, k.deger_normalize, u.uniq_kod
        FROM urun_kimlik k
        JOIN urun u ON u.id=k.urun_id
       WHERE k.aktif=1 AND u.uniq_kod IS NOT NULL AND u.uniq_kod<>''
    `);
    for (const row of kim) {
      const canon = normKod(row.uniq_kod);
      if (!canon) continue;
      if (String(row.tip || "").toLowerCase() === "barkod") {
        mapCode(codeToUniq, row.deger_normalize, canon, true);
      } else {
        mapCode(codeToUniq, row.deger_normalize, canon, false);
      }
    }
  } catch { /* kimlik yok */ }

  try {
    const [uniqRows] = await conn.query(
      `SELECT referans, barkod, stok_kodu, stok_barkod_1, uniq_kod, stok_list_uniq_kod
         FROM uniq_kod`
    );
    for (const row of uniqRows) {
      const canon = normKod(row.stok_list_uniq_kod) || normKod(row.uniq_kod) || normKod(row.referans);
      if (!canon) continue;
      mapCode(codeToUniq, row.referans, canon, false);
      mapCode(codeToUniq, row.stok_kodu, canon, false);
      mapCode(codeToUniq, row.uniq_kod, canon, false);
      mapCode(codeToUniq, row.stok_list_uniq_kod, canon, false);
      mapCode(codeToUniq, row.barkod, canon, true);
      mapCode(codeToUniq, row.stok_barkod_1, canon, true);
    }
  } catch { /* tablo boş/yok */ }

  for (const item of loadUniqCsvRows()) {
    for (const ref of item.refs) mapCode(codeToUniq, ref, item.canon, false);
    for (const bar of item.bars) mapCode(codeToUniq, bar, item.canon, true);
  }

  function canonOf(ref, bar, urunUniq) {
    if (ref) {
      const hit = codeToUniq.get(`c:${normKod(ref)}`);
      if (hit) return hit;
    }
    if (bar) {
      const hit = codeToUniq.get(`b:${normBar(bar)}`);
      if (hit) return hit;
    }
    if (urunUniq) {
      const u = normKod(urunUniq);
      if (u) {
        const aliased = codeToUniq.get(`c:${u}`);
        if (aliased) return aliased;
        return u;
      }
    }
    return ref ? normKod(ref) : null;
  }

  return { canonOf, codeToUniq, normKod, normBar };
}

module.exports = { loadUniqBridge, normKod, normBar };
