/**
 * Mağaza-Marka Rapor Excel → magaza_marka_aks
 * Kullanım: node scripts/importMagazaMarkaAks.js "/path/to/file.xlsx"
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const path = require("path");
const XLSX = require("xlsx");
const pool = require("../src/db");
const { normalizeName, normalizeStore } = require("../src/util");

function aksNorm(s) {
  return normalizeName(s || "")
    .replace(/Ç/g, "C")
    .replace(/,\s*/g, ",")
    .trim();
}

function markaNorm(s) {
  return normalizeName(s || "")
    .replace(/&/g, " ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const excelPath =
    process.argv[2] ||
    "/Users/flywork/Downloads/PRİM KRİTERLERİ GÜNCEL VERSİYON_271026 (1).xlsx";
  const wb = XLSX.readFile(excelPath, { cellDates: false });
  const sheetName =
    wb.SheetNames.find((n) => /ma[gğ]aza.?marka.?rapor/i.test(n)) ||
    "Mağaza-Marka Rapor";
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });

  // header satırını bul
  let start = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i].map((x) => String(x || "").toLocaleUpperCase("tr-TR"));
    if (r.some((c) => c.includes("PRİM MAĞAZA") || c.includes("PRIM MAGAZA")) &&
        r.some((c) => c.includes("MARKA"))) {
      start = i + 1;
      break;
    }
  }

  let bayi = "";
  let primMagaza = "";
  const kayitlar = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const a = String(r[0] || "").trim();
    const b = String(r[1] || "").trim();
    const c = String(r[2] || "").trim();
    const d = String(r[3] || "").trim();
    if (a) bayi = a;
    if (b) primMagaza = b;
    if (!c || !primMagaza) continue;
    if (/^toplam/i.test(c) || /^genel/i.test(c)) continue;
    kayitlar.push({
      bayi: bayi || null,
      prim_magaza: primMagaza,
      marka: c,
      marka_norm: markaNorm(c),
      aks: d || null,
      aks_norm: aksNorm(d) || null,
    });
  }

  const conn = await pool.getConnection();
  try {
    const [magazalar] = await conn.query("SELECT id, prim_magaza FROM magaza");
    const magMap = new Map(
      magazalar.map((m) => [normalizeStore(m.prim_magaza), m.id])
    );

    await conn.beginTransaction();
    await conn.query("DELETE FROM magaza_marka_aks");
    const batch = [];
    let eslesen = 0;
    for (const k of kayitlar) {
      const mid = magMap.get(normalizeStore(k.prim_magaza)) || null;
      if (mid) eslesen++;
      batch.push([
        k.bayi,
        k.prim_magaza,
        mid,
        k.marka,
        k.marka_norm,
        k.aks,
        k.aks_norm,
        path.basename(excelPath).slice(0, 80),
      ]);
      if (batch.length >= 400) {
        await conn.query(
          `INSERT INTO magaza_marka_aks
            (bayi, prim_magaza, magaza_id, marka, marka_norm, aks, aks_norm, kaynak)
           VALUES ?`,
          [batch.splice(0, batch.length)]
        );
      }
    }
    if (batch.length) {
      await conn.query(
        `INSERT INTO magaza_marka_aks
          (bayi, prim_magaza, magaza_id, marka, marka_norm, aks, aks_norm, kaynak)
         VALUES ?`,
        [batch]
      );
    }
    await conn.commit();
    const [[cnt]] = await conn.query("SELECT COUNT(*) n FROM magaza_marka_aks");
    const [[st]] = await conn.query(
      "SELECT COUNT(DISTINCT prim_magaza) n FROM magaza_marka_aks"
    );
    console.log(
      JSON.stringify(
        {
          sheet: sheetName,
          satir: kayitlar.length,
          yazilan: cnt.n,
          magaza: st.n,
          magaza_id_eslesen: eslesen,
        },
        null,
        2
      )
    );
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
