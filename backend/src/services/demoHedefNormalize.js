const XLSX = require("xlsx");
const ExcelJS = require("exceljs");

const HEDEF_HEADERS = [
  "BAYİ",
  "MAĞAZA ADI",
  "Prim Mağaza",
  "MARKA",
  "Prim Hedef",
  "Hedef Ciro",
  "AY",
  "YIL",
];

/** Birol sağ alan (sarı özet) — ana çıktı */
const OZET_HEADERS = ["mağaza prim", "Prim Hedef", "Toplam Ağu.26"];

function fold(s) {
  return String(s || "")
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTrNumber(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    // SheetJS: "662.250" → 662.25 (trailing 0 düşer). Hedef ciroları tamsayı —
    // ondalıklı + küçük değer ≈ TR binlik noktası.
    if (!Number.isInteger(v) && v > 0 && v < 100000) {
      const frac = String(v).split(".")[1] || "";
      if (frac.length >= 1 && frac.length <= 3) return Math.round(v * 1000);
    }
    return v;
  }
  let s = String(v).replace(/\s|\u00a0/g, "").replace(/TL\.?/gi, "");
  if (!s || s === "-" || s === "-.") return null;
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

function pick(row, ...names) {
  const keys = Object.keys(row || {});
  for (const name of names) {
    const hit = keys.find((k) => fold(k) === fold(name));
    if (hit != null && row[hit] !== "" && row[hit] != null) return row[hit];
  }
  for (const name of names) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const hit = keys.find((k) => re.test(String(k).trim()));
    if (hit != null && row[hit] !== "" && row[hit] != null) return row[hit];
  }
  return null;
}

function normalizeMarka(ham) {
  const n = fold(ham).replace(/\s*&\s*/g, " & ");
  if (!n) return "";
  if (n.includes("PACO") && n.includes("RABANNE")) return "RABANNE";
  if (n === "RABANNE" || n.includes("RABANNE")) return "RABANNE";
  if (n.includes("DOLCE") && n.includes("GABBANA")) return "DOLCE & GABBANA";
  if (n.includes("JEAN PAUL") || n.includes("J.P") || n.includes("GAULTIER")) return "JEAN PAUL GAULTIER";
  if (n.includes("CAROLINA")) return "CAROLINA HERRERA";
  if (n === "DIOR" || n.startsWith("DIOR ")) return "DIOR";
  if (n.includes("GIVENCHY")) return "GIVENCHY";
  if (n.includes("HERMES")) return "HERMES";
  if (n.includes("ISSEY")) return "ISSEY MIYAKE";
  return String(ham || "").trim().toLocaleUpperCase("tr-TR");
}

function ayEtiket(yearMonth) {
  const m = String(yearMonth || "").match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return "";
  const ay = Number(m[2]);
  const adlar = [
    "",
    "OCAK",
    "ŞUBAT",
    "MART",
    "NİSAN",
    "MAYIS",
    "HAZİRAN",
    "TEMMUZ",
    "AĞUSTOS",
    "EYLÜL",
    "EKİM",
    "KASIM",
    "ARALIK",
  ];
  return `${String(ay).padStart(2, "0")}-${adlar[ay] || ""}`;
}

function readRows(buffer, dosyaAdi) {
  const lower = String(dosyaAdi || "").toLowerCase();
  // raw:true → "662.250" string kalır; Number’a düşüp 662.25 olmaz
  if (lower.endsWith(".csv")) {
    let text = buffer.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const wb = XLSX.read(text, { type: "string", raw: true, codepage: 65001 });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
  }
  const wb = XLSX.read(buffer, { type: "buffer", raw: true, codepage: 65001 });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
}

function isRightSideJunk(row) {
  // Aynı CSV'de sağdaki Birol özet kolonları __EMPTY_* olarak gelebilir — atla
  const bayi = pick(row, "BAYİ", "Bayi");
  const marka = pick(row, "MARKA", "Marka");
  return !bayi && !marka;
}

/**
 * Ham hedef (sol tablo) → Arcon marka satırları + Birol tarzı özet.
 * @param {{ buffer: Buffer, dosyaAdi: string }[]} files
 * @param {{ yearMonth?: string }} opts
 */
function normalizeHedefFiles(files, opts = {}) {
  const yearMonth = opts.yearMonth || null;
  const ay = yearMonth ? ayEtiket(yearMonth) : "";
  const yil = yearMonth ? yearMonth.slice(0, 4) : "";
  const satirlar = [];
  const uyari = [];
  let atlanan = 0;

  for (const file of files) {
    const rows = readRows(file.buffer, file.dosyaAdi);
    for (const row of rows) {
      if (isRightSideJunk(row)) {
        atlanan++;
        continue;
      }
      const bayi = String(pick(row, "BAYİ", "Bayi") || "").trim().toLocaleUpperCase("tr-TR");
      const magazaAdi = String(pick(row, "MAĞAZA ADI", "MAGAZA ADI", "Mağaza") || "").trim();
      const primMagaza = String(
        pick(row, "mağaza prim", "magaza prim", "Prim Mağaza", "PRİM MAĞAZA") || magazaAdi
      ).trim();
      const markaHam = pick(row, "MARKA", "Marka");
      const marka = normalizeMarka(markaHam);
      const primHedef = String(pick(row, "Prim Hedef", "PRIM HEDEF", "Hedef Grup") || "").trim();
      const tutar =
        parseTrNumber(
          pick(
            row,
            "Toplam Ağu.26",
            "Toplam Agu.26",
            "Hedef Ciro",
            "HEDEF",
            "REVİZE",
            "Toplam"
          )
        ) ||
        (() => {
          const keys = Object.keys(row);
          const k = keys.find((key) => /toplam|a[gğ]u|hedef|rev/i.test(key) && !/prim hedef/i.test(key));
          return k ? parseTrNumber(row[k]) : null;
        })();

      if (!bayi || !marka || !primMagaza) {
        atlanan++;
        continue;
      }
      if (tutar == null || tutar <= 0) {
        atlanan++;
        continue;
      }

      satirlar.push({
        BAYİ: bayi,
        "MAĞAZA ADI": magazaAdi || primMagaza,
        "Prim Mağaza": primMagaza,
        MARKA: marka,
        "Prim Hedef": primHedef || "Parfüm Tüm Markalar",
        "Hedef Ciro": Math.round(tutar),
        AY: ay,
        YIL: yil,
      });
    }
  }

  satirlar.sort(
    (a, b) =>
      a.BAYİ.localeCompare(b.BAYİ, "tr") ||
      a["Prim Mağaza"].localeCompare(b["Prim Mağaza"], "tr") ||
      a.MARKA.localeCompare(b.MARKA, "tr")
  );

  // Birol sağ özet: mağaza × Prim Hedef + sarı Toplam satırı
  const grup = new Map();
  for (const r of satirlar) {
    const k = `${r["Prim Mağaza"]}||${r["Prim Hedef"]}`;
    grup.set(k, (grup.get(k) || 0) + Number(r["Hedef Ciro"]));
  }
  const ozet = [];
  const byMag = new Map();
  for (const [k, tutar] of grup) {
    const [mag, hedef] = k.split("||");
    if (!byMag.has(mag)) byMag.set(mag, []);
    byMag.get(mag).push({ hedef, tutar });
  }
  for (const mag of [...byMag.keys()].sort((a, b) => a.localeCompare(b, "tr"))) {
    const items = byMag.get(mag).sort((a, b) => a.hedef.localeCompare(b.hedef, "tr"));
    let magTot = 0;
    items.forEach((it, idx) => {
      ozet.push({
        "mağaza prim": idx === 0 ? mag : "",
        "Prim Hedef": it.hedef,
        "Toplam Ağu.26": it.tutar,
        _toplamSatir: false,
        _magaza: mag,
      });
      magTot += it.tutar;
    });
    ozet.push({
      "mağaza prim": `${mag} Toplam`,
      "Prim Hedef": "",
      "Toplam Ağu.26": magTot,
      _toplamSatir: true,
      _magaza: mag,
    });
  }

  const bayiSay = {};
  for (const r of satirlar) bayiSay[r.BAYİ] = (bayiSay[r.BAYİ] || 0) + 1;

  const ozetTemiz = ozet.map(({ _toplamSatir, _magaza, ...rest }) => rest);

  return {
    headers: OZET_HEADERS,
    satirlar,
    ozetSatirlar: ozet,
    ozetTemiz,
    ozetHeaders: OZET_HEADERS,
    // UI / ana önizleme = Birol sağ alan
    onizleme: ozetTemiz.slice(0, 200),
    ozetOnizleme: ozetTemiz.slice(0, 200),
    markaOnizleme: satirlar.slice(0, 200),
    ozet: {
      kanonik: satirlar.length,
      ozetSatir: ozet.length,
      atlanan,
      yearMonth,
      bayi: bayiSay,
      not: "Ana çıktı = Birol sağ özet (mağaza prim × Prim Hedef + Toplam). Sheet 2: marka detay.",
    },
    uyari,
    kanallar: Object.entries(bayiSay).map(([kanal, satirSayisi]) => ({ kanal, satirSayisi })),
  };
}

function formatTrBinlik(n) {
  if (n == null || n === "") return "";
  const num = Math.round(Number(n));
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString("tr-TR");
}

async function toHedefXlsxBuffer(sonuc) {
  const wb = new ExcelJS.Workbook();

  // 1) Ana sheet = Birol sağ (sarı Toplam)
  const ozetSheet = wb.addWorksheet("Hedef Özet", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ozetSheet.columns = [
    { header: "mağaza prim", key: "mag", width: 36 },
    { header: "Prim Hedef", key: "hedef", width: 28 },
    { header: "Toplam Ağu.26", key: "ciro", width: 16 },
  ];
  const hdr = ozetSheet.getRow(1);
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF595959" } };

  for (const r of sonuc.ozetSatirlar || []) {
    const row = ozetSheet.addRow({
      mag: r["mağaza prim"],
      hedef: r["Prim Hedef"],
      ciro: formatTrBinlik(r["Toplam Ağu.26"]),
    });
    if (r._toplamSatir) {
      row.font = { bold: true };
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFF00" },
        };
      });
    }
  }

  // 2) Marka detay (sol ham → import için)
  const markaSheet = wb.addWorksheet("Hedef Data");
  markaSheet.columns = HEDEF_HEADERS.map((h) => ({
    header: h,
    key: h,
    width: h === "Hedef Ciro" ? 14 : 22,
  }));
  markaSheet.getRow(1).font = { bold: true };
  for (const r of sonuc.satirlar || []) {
    markaSheet.addRow({
      ...r,
      "Hedef Ciro": formatTrBinlik(r["Hedef Ciro"]),
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = {
  HEDEF_HEADERS,
  OZET_HEADERS,
  normalizeHedefFiles,
  toHedefXlsxBuffer,
};
