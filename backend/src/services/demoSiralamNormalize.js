const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { eleZeopsDisi } = require("./demoZeopsMagaza");
const { aktifMagazaFlatMap } = require("./demoSiralamStore");

const SIRALAMA_HEADERS = [
  "MAĞAZA",
  "ÇEŞİT",
  "MARKA",
  "SIRALAMA",
  "AY",
  "BÖLGE",
  "YIL",
  "BAYİ",
  "Prim Mağaza",
];

const AY_AD = [
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

/** Temmuz çıktısındaki Arcon markaları (Communite: sadece bunlar). */
const BIZIM_MARKALAR = [
  "CAROLINA HERRERA",
  "DIOR",
  "DOLCE & GABBANA",
  "DRIES VAN NOTEN",
  "GIVENCHY",
  "HERMES",
  "ISSEY MIYAKE",
  "JEAN PAUL GAULTIER",
  "LA PRAIRIE",
  "RABANNE",
  "SCENTOLOGIA",
  "SENSAI",
  "SISLEY",
];

/** Communite Arcon markaları (Boyner/Communite marka eşleştirme sekmesi) */
const COMMUNITE_MARKALAR = new Set(
  [
    "CAROLINA HERRERA",
    "DOLCE & GABBANA",
    "DOLCE&GABBANA",
    "DRIES VAN NOTEN",
    "GIVENCHY",
    "HERMES",
    "JEAN PAUL GAULTIER",
    "LA PRAIRIE",
    "RABANNE",
    "SCENTOLOGIA",
    "SENSAI",
    "SISLEY",
  ].map(fold)
);

const TARGET_TO_CESIT = {
  COLOUR: "2-MAKYAJ",
  COLOR: "2-MAKYAJ",
  FRAGRANCE: "1-PARFÜM",
  SKINCARE: "3-CİLT BAKIM",
  HAIRCARE: "4-SAÇ BAKIM",
};

const COMMUNITE_BLOCKS = [
  { cesit: "0-MAĞAZA", rankCol: 0, brandCol: 1 },
  { cesit: "1-PARFÜM", rankCol: 3, brandCol: 4 },
  { cesit: "3-CİLT BAKIM", rankCol: 6, brandCol: 7 },
  { cesit: "2-MAKYAJ", rankCol: 9, brandCol: 10 },
  { cesit: "4-SAÇ BAKIM", rankCol: 12, brandCol: 13 },
];

function fold(s) {
  return String(s || "")
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[—–−一‐]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Birol çıktı sırası */
const BAYI_SIRASI = ["BOYNER", "BEYMEN", "COMMUNITE", "SEVİL", "SEPHORA"];

/** Boyner sıralamada tutulan markalar (Birol Ağustos) */
const BOYNER_MARKALAR = new Set(
  [
    "CAROLINA HERRERA",
    "DIOR",
    "DOLCE&GABBANA",
    "DOLCE & GABBANA",
    "GIVENCHY",
    "HERMES",
    "ISSEY MIYAKE",
    "JEAN PAUL GAULTIER",
    "NARCISO RODRIGUEZ",
    "RABANNE",
  ].map(fold)
);

/** Beymen sıralamada tutulan markalar (Birol Ağustos) */
const BEYMEN_MARKALAR = new Set(
  [
    "BYREDO",
    "CAROLINA HERRERA",
    "DIOR",
    "DOLCE&GABBANA",
    "DOLCE & GABBANA",
    "DR. BARBARA STURM",
    "GIVENCHY",
    "HERMES",
    "JEAN PAUL GAULTIER",
    "L'ARTISAN PARFUMEUR",
    "LA PRAIRIE",
    "PENHALIGON'S",
    "RABANNE",
    "SENSAI",
    "SISLEY",
  ].map(fold)
);

function bayiSirasiIdx(bayi) {
  const i = BAYI_SIRASI.indexOf(String(bayi || "").toLocaleUpperCase("tr-TR"));
  return i < 0 ? 99 : i;
}

function markaBoynerBeymen(ham) {
  const raw = String(ham || "").trim();
  if (!raw) return "";
  const n = fold(raw).replace(/\s*&\s*/g, "&");
  if (n.includes("DOLCE") && n.includes("GABBANA")) return "DOLCE&GABBANA";
  if (n.includes("JEAN PAUL") || n.includes("J.P") || n.includes("GAULTIER")) return "JEAN PAUL GAULTIER";
  if (n.includes("CAROLINA")) return "CAROLINA HERRERA";
  if (n.includes("ISSEY")) return "ISSEY MIYAKE";
  if (n.includes("NARCISO")) return "NARCISO RODRIGUEZ";
  if (n.includes("RABANNE") || n.includes("PACO")) return "RABANNE";
  if (n.includes("BARBARA STURM")) return "DR. BARBARA STURM";
  if (n.includes("ARTISAN")) return "L'ARTISAN PARFUMEUR";
  if (n.includes("PENHALIGON")) return "PENHALIGON'S";
  if (n === "HERMES") return "HERMES";
  if (n === "DIOR") return "DIOR";
  if (n === "GIVENCHY") return "GIVENCHY";
  if (n === "SISLEY") return "SISLEY";
  if (n === "SENSAI") return "SENSAI";
  if (n === "BYREDO") return "BYREDO";
  if (n.includes("LA PRAIRIE")) return "LA PRAIRIE";
  return raw.toLocaleUpperCase("tr-TR").trim();
}

/** CSV’de UTF-8’in latin1 okunması (ä¸\u0080TOTAL …) */
function fixMojibake(s) {
  const raw = String(s ?? "");
  if (!raw) return "";
  if (/TOTAL/i.test(raw) && /[äÃâ]/.test(raw)) {
    try {
      const fixed = Buffer.from(raw, "latin1").toString("utf8");
      if (/TOTAL/i.test(fixed)) return fixed;
    } catch {
      /* ignore */
    }
  }
  return raw;
}

function parseYearMonth(yearMonth) {
  const m = String(yearMonth || "").match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  return { yil: Number(m[1]), ay: Number(m[2]) };
}

function ayEtiket(ym) {
  const p = parseYearMonth(ym);
  if (!p) return "";
  return `${String(p.ay).padStart(2, "0")}-${AY_AD[p.ay] || ""}`;
}

function periodToYm(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = XLSX.SSF.parse_date_code(Math.floor(v));
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(Number(m[1])).padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const d = XLSX.SSF.parse_date_code(Math.floor(Number(s)));
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}`;
  }
  return null;
}

function loadJsonMap(fileName) {
  const p = path.join(__dirname, "../../data/demo", fileName);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function readSheetRows(buffer, dosyaAdi) {
  const wb = XLSX.read(buffer, { type: "buffer", raw: true, cellDates: false, codepage: 65001 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const name = String(dosyaAdi || "").toLocaleLowerCase("tr-TR");
  if (
    name.includes("communite") ||
    name.includes("galataport") ||
    name.includes("boyner") ||
    name.includes("sevil") ||
    name.includes("sevıl")
  ) {
    return { tip: "matrix", matrix: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }) };
  }
  // Communite İstinye (filename)
  if (name.includes("istinye") && name.includes("commun")) {
    return { tip: "matrix", matrix: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }) };
  }
  return {
    tip: "tabular",
    rows: XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true }),
  };
}

function detectKanal(dosyaAdi, tip, matrix) {
  const n = fold(dosyaAdi);
  if (n.includes("ESLESTIR") || n.includes("ESLESME") || n.includes("MARKA ES")) return "atla";
  if (n.includes("SEPHORA")) return "sephora";
  if (n.includes("COMMUNITE") || n.includes("GALATAPORT") || (n.includes("ISTINYE") && n.includes("COMM"))) {
    return "communite";
  }
  if (n.includes("BOYNER")) return "boyner";
  if (n.includes("BEYMEN")) return "beymen";
  if (n.includes("SEVIL") || n.includes("SEVİL")) return "sevil";
  if (tip === "matrix" && Array.isArray(matrix?.[0])) {
    const head = fold(matrix[0].join(" "));
    if (head.includes("PARFUM") && head.includes("GENEL") && (head.includes(" NT") || head.includes("NT,"))) {
      return "sevil";
    }
    if (head.includes("TOPLAM SIRALAMA") || head.includes("SAC BAKIM")) return "communite";
    if (head.includes("ALL SECTION") || head.includes("FRAGRANCE")) return "boyner";
  }
  return "bilinmeyen";
}

function mapLookup(map, key) {
  if (!map) return "";
  const raw = String(key || "").trim();
  if (!raw) return "";
  if (map[raw]) return map[raw];
  const f = fold(raw);
  if (map[f]) return map[f];
  for (const [k, v] of Object.entries(map)) {
    if (fold(k) === f) return v;
  }
  return "";
}

function sevilMarkaArcon(ham, markaMap) {
  const hit = mapLookup(markaMap, ham);
  if (hit) return hit;
  // Ham tam Arcon adıysa kabul et — fuzzy yok (SISLEY GUNES → SISLEY üretmesin)
  const n = fold(ham).replace(/\s+/g, " ").trim();
  if (!n || /GUNES|GÜNES|GÜNEŞ/.test(n)) return "";
  if (!markaMap) return "";
  for (const v of Object.values(markaMap)) {
    if (fold(v) === n) return v;
  }
  return "";
}

function normalizeMarka(v) {
  let s = fold(v)
    .replace(/\bBEAUTY\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  if (s.includes("DOLCE") && s.includes("GABBANA")) return "DOLCE & GABBANA";
  if (s.includes("JEAN PAUL") || s.includes("J.P. GAULTIER") || s === "J.P. GAULTIER" || s.includes("JP GAULTIER")) {
    return "JEAN PAUL GAULTIER";
  }
  if (s.includes("GAULTIER")) return "JEAN PAUL GAULTIER";
  if (s.includes("DRIES VAN NOTEN")) return "DRIES VAN NOTEN";
  if (s.includes("CAROLINA HERRERA")) return "CAROLINA HERRERA";
  if (s.includes("LA PRAIRIE")) return "LA PRAIRIE";
  if (s.includes("ISSEY")) return "ISSEY MIYAKE";
  if (s === "HERMES" || s.includes("HERMES")) return "HERMES";
  if (s.includes("GIVENCHY")) return "GIVENCHY";
  if (s.includes("RABANNE") || s.includes("PACO")) return "RABANNE";
  if (s === "SISLEY") return "SISLEY";
  if (s.includes("SENSAI") || s === "KANEBO" || s.includes("KANEBO")) return "SENSAI";
  if (s.includes("SCENTOLOGIA")) return "SCENTOLOGIA";
  if (s === "DIOR" || s.startsWith("DIOR ")) return "DIOR";
  return s;
}

function isBizimMarka(marka) {
  const n = normalizeMarka(marka);
  if (!n) return false;
  return BIZIM_MARKALAR.some((b) => b === n);
}

/** Target: TOTAL COLOUR/… → çeşit; düz TOTAL → 0-MAĞAZA (Birol) */
function targetCesit(target) {
  const raw = fixMojibake(target);
  const t = fold(raw).replace(/^-+/, "").trim();
  const m = t.match(/TOTAL\s+(COLOUR|COLOR|FRAGRANCE|SKINCARE|HAIRCARE)\b/);
  if (m) return TARGET_TO_CESIT[m[1]] || null;
  if (t === "TOTAL") return "0-MAĞAZA";
  return null;
}

function sephoraMagaza(store, map) {
  const raw = String(store || "").trim();
  if (!raw) return "";
  if (/TOTAL/i.test(raw)) return ""; // marka total satırı değil
  const kod = (raw.match(/^(\d{3,5})/) || [])[1];
  if (kod === "2853") return ""; // E-STORE / online
  if (kod && map[kod]) {
    const m = map[kod];
    if (/ON-?LINE|E-STORE/i.test(m) || m === "(boş)") return "";
    return m;
  }
  const rest = raw.replace(/^\d+\s*/, "").trim();
  return rest ? `SEPHORA ${rest}` : "";
}

function canonRow({ magaza, cesit, marka, sira, ay, yil, bayi, bolge = "" }) {
  const m = String(magaza || "").trim();
  return {
    MAĞAZA: m,
    ÇEŞİT: cesit,
    MARKA: marka,
    SIRALAMA: sira,
    AY: ay,
    BÖLGE: bolge,
    YIL: yil,
    BAYİ: bayi,
    "Prim Mağaza": m,
  };
}

function normalizeSephora(rows, opts) {
  const yearMonth = opts.yearMonth || null;
  const map = opts.sephoraMagazaMap || loadJsonMap("sephora-magaza-eslestirme.json");
  const ay = yearMonth ? ayEtiket(yearMonth) : "";
  const yil = yearMonth ? String(parseYearMonth(yearMonth).yil) : "";
  const out = [];
  let atlananAy = 0;
  let atlananTarget = 0;
  let atlananMagaza = 0;
  let atlananMarka = 0;
  let atlananSira = 0;

  for (const row of rows) {
    const ym = periodToYm(row["Period Selected"] ?? row["Period"]);
    if (yearMonth && ym && ym !== yearMonth) {
      atlananAy++;
      continue;
    }
    if (yearMonth && !ym) {
      atlananAy++;
      continue;
    }
    const cesit = targetCesit(row.Target);
    if (!cesit) {
      atlananTarget++;
      continue;
    }
    const magaza = sephoraMagaza(row.Store, map);
    if (!magaza || magaza === "(boş)") {
      atlananMagaza++;
      continue;
    }
    const marka = normalizeMarka(row.Brand);
    if (!marka || !isBizimMarka(marka)) {
      atlananMarka++;
      continue;
    }
    const sira = Number(row.Rank);
    if (!Number.isFinite(sira) || sira <= 0) {
      atlananSira++;
      continue;
    }
    out.push(
      canonRow({
        magaza,
        cesit,
        marka,
        sira: Math.round(sira),
        ay: ay || (ym ? ayEtiket(ym) : ""),
        yil: yil || (ym ? ym.slice(0, 4) : ""),
        bayi: "SEPHORA",
      })
    );
  }

  out.sort((a, b) =>
    a.MAĞAZA.localeCompare(b.MAĞAZA, "tr") ||
    a.ÇEŞİT.localeCompare(b.ÇEŞİT, "tr") ||
    a.SIRALAMA - b.SIRALAMA
  );

  return {
    kanal: "sephora",
    satirlar: out,
    ozet: {
      giren: rows.length,
      kanonik: out.length,
      atlananAy,
      atlananTarget,
      atlananMagaza,
      atlananMarka,
      atlananSira,
      yearMonth,
      not: "Target: TOTAL → 0-MAĞAZA; TOTAL COLOUR/FRAGRANCE/SKINCARE/HAIRCARE; KANEBO→SENSAI; Rank.",
    },
  };
}

function communiteMagazaAdi(matrix, dosyaAdi) {
  const n = fold(dosyaAdi);
  if (n.includes("ISTINYE")) return "COMMUNITE İSTİNYEPARK";
  if (n.includes("GALATAPORT")) return "COMMUNITE GALATAPORT";
  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const cell = fold(matrix[i]?.[0]);
    if (cell.includes("GALATAPORT")) return "COMMUNITE GALATAPORT";
    if (cell.includes("ISTINYE")) return "COMMUNITE İSTİNYEPARK";
  }
  return "COMMUNITE GALATAPORT";
}

function normalizeCommunite(matrix, opts, dosyaAdi) {
  const yearMonth = opts.yearMonth || null;
  const ay = yearMonth ? ayEtiket(yearMonth) : "08-AĞUSTOS";
  const yil = yearMonth ? String(parseYearMonth(yearMonth).yil) : "2026";
  const magaza = communiteMagazaAdi(matrix, dosyaAdi);
  const out = [];
  let atlananMarka = 0;
  let alinan = 0;

  // Veri satırları: başlık satırından sonra (TOPLAM SIRALAMA …)
  let start = 0;
  for (let i = 0; i < matrix.length; i++) {
    const a = fold(matrix[i]?.[0]);
    const b = fold(matrix[i]?.[1]);
    if (a.includes("TOPLAM") || b.includes("PARFUM") || fold(matrix[i]?.[3]).includes("PARFUM")) {
      start = i + 1;
      break;
    }
  }

  for (let i = start; i < matrix.length; i++) {
    const row = matrix[i] || [];
    for (const block of COMMUNITE_BLOCKS) {
      const markaHam = row[block.brandCol];
      const siraHam = row[block.rankCol];
      if (markaHam == null || String(markaHam).trim() === "") continue;
      const marka = normalizeMarka(markaHam);
      const mf = fold(marka).replace(/\s*&\s*/g, "&");
      // Communite: sadece eşleştirme tablosundaki Arcon markaları (DIOR yok)
      if (!marka || (!COMMUNITE_MARKALAR.has(fold(marka)) && !COMMUNITE_MARKALAR.has(mf))) {
        atlananMarka++;
        continue;
      }
      const sira = Number(siraHam);
      if (!Number.isFinite(sira) || sira <= 0) continue;
      alinan++;
      out.push(
        canonRow({
          magaza,
          cesit: block.cesit,
          marka,
          sira: Math.round(sira),
          ay,
          yil,
          bayi: "COMMUNITE",
        })
      );
    }
  }

  out.sort((a, b) => a.ÇEŞİT.localeCompare(b.ÇEŞİT, "tr") || a.SIRALAMA - b.SIRALAMA);

  return {
    kanal: "communite",
    satirlar: out,
    ozet: {
      girenBlokSatir: Math.max(0, matrix.length - start),
      kanonik: out.length,
      alinanCift: alinan,
      atlananMarka,
      magaza,
      yearMonth,
      not: "Galataport/İstinye: TOPLAM→SAÇ; Communite marka whitelist (eşleştirme sekmesi). DIOR yok.",
    },
  };
}

/**
 * Sevil Ağustos pivot: PARFÜM | CİLT BAKIMI | MAKYAJ | GENEL
 * Kolonlar sevk kodu (NT, İSP…); map gömülü JSON’dan.
 * WEB / GRUP Temmuz’da yok → atlanır.
 */
function normalizeSevil(matrix, opts) {
  const yearMonth = opts.yearMonth || null;
  const ay = yearMonth ? ayEtiket(yearMonth) : "08-AĞUSTOS";
  const yil = yearMonth ? String(parseYearMonth(yearMonth).yil) : "2026";
  const magazaMap = opts.sevilMagazaMap || loadJsonMap("sevil-magaza-eslestirme.json");
  const markaMap = opts.sevilMarkaMap || loadJsonMap("sevil-marka-eslestirme.json");
  const header = matrix[0] || [];
  const out = [];
  let atlananMarka = 0;
  let atlananKod = 0;
  let atlananSira = 0;

  const blockDefs = [
    { cesit: "1-PARFÜM", re: /^PARF/ },
    { cesit: "3-CİLT BAKIM", re: /CILT/ },
    { cesit: "2-MAKYAJ", re: /MAKYAJ/ },
    { cesit: "0-MAĞAZA", re: /GENEL/ },
  ];

  const blocks = [];
  for (let c = 0; c < header.length; c++) {
    const h = fold(header[c]);
    if (!h) continue;
    for (const def of blockDefs) {
      if (def.re.test(h)) {
        blocks.push({ cesit: def.cesit, brandCol: c, startCol: c + 1 });
        break;
      }
    }
  }
  // her bloğun store kolonları bir sonraki bloğa / sona kadar
  for (let i = 0; i < blocks.length; i++) {
    const end = i + 1 < blocks.length ? blocks[i + 1].brandCol : header.length;
    blocks[i].storeCols = [];
    for (let c = blocks[i].startCol; c < end; c++) {
      const kod = String(header[c] || "").trim();
      if (!kod) continue;
      const fk = fold(kod);
      if (fk === "WEB" || fk === "GRUP") continue; // Temmuz’da yok
      blocks[i].storeCols.push({ col: c, kod });
    }
  }

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    for (const block of blocks) {
      const markaHam = row[block.brandCol];
      if (markaHam == null || String(markaHam).trim() === "") continue;
      const marka = sevilMarkaArcon(markaHam, markaMap);
      if (!marka) {
        atlananMarka++;
        continue;
      }
      for (const { col, kod } of block.storeCols) {
        const magaza = mapLookup(magazaMap, kod);
        if (!magaza || /TOPLAM/i.test(magaza)) {
          atlananKod++;
          continue;
        }
        const sira = Number(row[col]);
        if (!Number.isFinite(sira) || sira <= 0) {
          atlananSira++;
          continue;
        }
        out.push(
          canonRow({
            magaza,
            cesit: block.cesit,
            marka,
            sira: Math.round(sira),
            ay,
            yil,
            bayi: "SEVİL",
          })
        );
      }
    }
  }

  out.sort(
    (a, b) =>
      a.MAĞAZA.localeCompare(b.MAĞAZA, "tr") ||
      a.ÇEŞİT.localeCompare(b.ÇEŞİT, "tr") ||
      a.SIRALAMA - b.SIRALAMA
  );

  return {
    kanal: "sevil",
    satirlar: out,
    ozet: {
      girenSatir: Math.max(0, matrix.length - 1),
      kanonik: out.length,
      blok: blocks.map((b) => `${b.cesit}:${b.storeCols.length}`),
      atlananMarka,
      atlananKod,
      atlananSiraBos: atlananSira,
      yearMonth,
      not: "Mağaza/marka eşlemeleri gömülü JSON (sevil-magaza / sevil-marka). WEB+GRUP atlandı.",
    },
  };
}

/** Boyner: yan yana ALL SECTION / FRAGRANCE / SKINCARE / MAKE-UP blokları */
function normalizeBoyner(matrix, opts) {
  const yearMonth = opts.yearMonth || null;
  const ay = yearMonth ? ayEtiket(yearMonth) : "08-AĞUSTOS";
  const yil = yearMonth ? String(parseYearMonth(yearMonth).yil) : "2026";
  const magazaMap = opts.boynerMagazaMap || aktifMagazaFlatMap("boyner");
  const out = [];
  let atlananMarka = 0;
  let atlananMagaza = 0;

  // başlık satırı: ALL SECTION / FRAGRANCE / …
  let headerRow = -1;
  for (let i = 0; i < Math.min(8, matrix.length); i++) {
    const joined = fold((matrix[i] || []).join(" "));
    if (joined.includes("ALL SECTION") || joined.includes("FRAGRANCE") || joined.includes("MAKE-UP") || joined.includes("MAKE UP")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) {
    return { kanal: "boyner", satirlar: [], ozet: { kanonik: 0, not: "Boyner başlık bulunamadı" } };
  }

  const head = matrix[headerRow] || [];
  const blockDefs = [
    { cesit: "0-MAĞAZA", re: /ALL SECTION|MAGAZA/ },
    { cesit: "1-PARFÜM", re: /FRAGRANCE|PARFUM/ },
    { cesit: "3-CİLT BAKIM", re: /SKINCARE|CILT/ },
    { cesit: "2-MAKYAJ", re: /MAKE-?UP|MAKYAJ/ },
  ];
  const starts = [];
  for (let c = 0; c < head.length; c++) {
    const h = fold(head[c]);
    if (!h) continue;
    for (const def of blockDefs) {
      if (def.re.test(h) && !starts.some((s) => s.cesit === def.cesit)) {
        starts.push({ cesit: def.cesit, col: c });
        break;
      }
    }
  }
  // her blok: lokasyon, marka, sıralama (3 kolon)
  const blocks = starts.map((s) => ({
    cesit: s.cesit,
    lokCol: s.col,
    markaCol: s.col + 1,
    siraCol: s.col + 2,
  }));

  const dataStart = headerRow + 2; // satır: kolon adları + veri
  // bazen headerRow+1 = Lokasyon DESC satırı
  const maybeSub = fold((matrix[headerRow + 1] || []).join(" "));
  const start = maybeSub.includes("LOKASYON") || maybeSub.includes("SIRALAMA") ? headerRow + 2 : headerRow + 1;

  for (let r = start; r < matrix.length; r++) {
    const row = matrix[r] || [];
    for (const b of blocks) {
      const lokHam = String(row[b.lokCol] || "").trim();
      const markaHam = row[b.markaCol];
      const sira = Number(row[b.siraCol]);
      if (!lokHam && (markaHam == null || String(markaHam).trim() === "")) continue;
      if (!lokHam) continue;
      if (fold(lokHam).includes("AMAZON") || fold(lokHam).includes("INTERNET") || fold(lokHam).includes("HEPSIBURADA") || fold(lokHam).includes("BOYNERNOW")) {
        atlananMagaza++;
        continue;
      }
      const marka = markaBoynerBeymen(markaHam);
      const mf = fold(marka).replace(/\s*&\s*/g, "&");
      if (!marka || !BOYNER_MARKALAR.has(mf)) {
        atlananMarka++;
        continue;
      }
      if (!Number.isFinite(sira) || sira <= 0) continue;
      // Eşleştirmede yok / #N/A → üretme (Birol kapsamı)
      const magaza = mapLookup(magazaMap, lokHam);
      if (!magaza || /INTERNET|#N\/?A/i.test(magaza)) {
        atlananMagaza++;
        continue;
      }
      out.push(
        canonRow({
          magaza,
          cesit: b.cesit,
          marka,
          sira: Math.round(sira),
          ay,
          yil,
          bayi: "BOYNER",
        })
      );
    }
  }

  out.sort(
    (a, b) =>
      a.MAĞAZA.localeCompare(b.MAĞAZA, "tr") ||
      a.ÇEŞİT.localeCompare(b.ÇEŞİT, "tr") ||
      a.SIRALAMA - b.SIRALAMA
  );

  return {
    kanal: "boyner",
    satirlar: out,
    ozet: {
      kanonik: out.length,
      blok: blocks.map((b) => b.cesit),
      atlananMarka,
      atlananMagaza,
      yearMonth,
      not: "ALL SECTION/FRAGRANCE/SKINCARE/MAKE-UP; sadece eşleşen mağazalar; #N/A ve internet atlandı.",
    },
  };
}

function normalizeBeymen(rows, opts) {
  const yearMonth = opts.yearMonth || null;
  const ay = yearMonth ? ayEtiket(yearMonth) : "08-AĞUSTOS";
  const yil = yearMonth ? String(parseYearMonth(yearMonth).yil) : "2026";
  const magazaMap = opts.beymenMagazaMap || loadJsonMap("beymen-siralam-magaza.json");
  const out = [];
  let atlananMarka = 0;
  let atlananMagaza = 0;

  const axeToCesit = (axe) => {
    const a = fold(axe);
    if (a.includes("PARF")) return "1-PARFÜM";
    if (a.includes("MAKYAJ") || a.includes("MAKE")) return "2-MAKYAJ";
    if (a.includes("CILT") || a.includes("SKIN")) return "3-CİLT BAKIM";
    return "";
  };

  for (const row of rows) {
    const lok = String(
      row.lokasyon || row.Lokasyon || row["Lokasyon ADI"] || row["lokasyon"] || ""
    ).trim();
    const axe = row.axe || row.Axe || row["Ürün MG Üst Grup ADI"] || "";
    const markaHam = row["Ürün Marka ADI"] || row["Urun Marka ADI"] || row.marka || "";
    const sira = Number(row.sıralama ?? row.Sıralama ?? row.siralam ?? row.SIRALAMA);
    if (!lok) continue;
    if (fold(lok) === "BEYMEN.COM" || fold(lok).includes(".COM")) {
      // Birol Ağustos’ta .COM yok; atla
      atlananMagaza++;
      continue;
    }
    const cesit = axeToCesit(axe);
    if (!cesit) continue;
    const marka = markaBoynerBeymen(markaHam);
    const mf = fold(marka).replace(/\s*&\s*/g, "&");
    if (!marka || (!BEYMEN_MARKALAR.has(mf) && !BEYMEN_MARKALAR.has(fold(marka)))) {
      atlananMarka++;
      continue;
    }
    if (!Number.isFinite(sira) || sira <= 0) continue;
    const magaza = mapLookup(magazaMap, lok) || lok;
    out.push(
      canonRow({
        magaza,
        cesit,
        marka,
        sira: Math.round(sira),
        ay,
        yil,
        bayi: "BEYMEN",
      })
    );
  }

  out.sort(
    (a, b) =>
      a.MAĞAZA.localeCompare(b.MAĞAZA, "tr") ||
      a.ÇEŞİT.localeCompare(b.ÇEŞİT, "tr") ||
      a.SIRALAMA - b.SIRALAMA
  );

  return {
    kanal: "beymen",
    satirlar: out,
    ozet: {
      giren: rows.length,
      kanonik: out.length,
      atlananMarka,
      atlananMagaza,
      yearMonth,
      not: "axe→çeşit; mağaza map gömülü; BEYMEN.COM atlandı (Birol’da yok).",
    },
  };
}

/**
 * @param {{ buffer: Buffer, dosyaAdi: string }[]} files
 * @param {{ yearMonth?: string, zeopsIndex?: { bul: (s: string) => string|null, adet?: number } }} opts
 */
function normalizeSiralamFiles(files, opts = {}) {
  const sephoraMagazaMap = loadJsonMap("sephora-magaza-eslestirme.json");
  const sevilMagazaMap = aktifMagazaFlatMap("sevil");
  const sevilMarkaMap = loadJsonMap("sevil-marka-eslestirme.json");
  const boynerMagazaMap = aktifMagazaFlatMap("boyner");
  const beymenMagazaMap = aktifMagazaFlatMap("beymen");
  const kanallar = [];
  const all = [];
  const uyari = [];
  const zeopsDusen = new Map();

  for (const file of files) {
    const parsed = readSheetRows(file.buffer, file.dosyaAdi);
    const kanal = detectKanal(file.dosyaAdi, parsed.tip, parsed.matrix);
    let result;
    if (kanal === "sephora" && parsed.tip === "tabular") {
      result = normalizeSephora(parsed.rows, { ...opts, sephoraMagazaMap });
    } else if (kanal === "communite") {
      result = normalizeCommunite(parsed.matrix || [], opts, file.dosyaAdi);
    } else if (kanal === "sevil") {
      result = normalizeSevil(parsed.matrix || [], { ...opts, sevilMagazaMap, sevilMarkaMap });
    } else if (kanal === "boyner") {
      result = normalizeBoyner(parsed.matrix || [], { ...opts, boynerMagazaMap });
    } else if (kanal === "beymen") {
      result = normalizeBeymen(parsed.rows || [], { ...opts, beymenMagazaMap });
    } else if (kanal === "atla") {
      continue;
    } else {
      result = {
        kanal: "bilinmeyen",
        satirlar: [],
        ozet: { kanonik: 0 },
      };
      uyari.push(`${file.dosyaAdi}: kanal tanınmadı`);
    }
    let satirlar = result.satirlar;
    let zeopsParca = null;
    if (opts.zeopsIndex) {
      zeopsParca = eleZeopsDisi(
        satirlar,
        opts.zeopsIndex,
        (r) => r.MAĞAZA || r["Prim Mağaza"],
        (r, ad) => {
          r.MAĞAZA = ad;
          r["Prim Mağaza"] = ad;
        }
      );
      satirlar = zeopsParca.kalan;
      for (const m of zeopsParca.magazalar) {
        zeopsDusen.set(m.magaza, (zeopsDusen.get(m.magaza) || 0) + m.satir);
      }
    }
    kanallar.push({
      dosyaAdi: file.dosyaAdi,
      ...result,
      ozet: zeopsParca
        ? {
            ...result.ozet,
            atlananZeopsSatir: zeopsParca.satir,
            atlananZeopsMagaza: zeopsParca.magazalar.length,
          }
        : result.ozet,
      satirlar: undefined,
      satirSayisi: satirlar.length,
    });
    all.push(...satirlar);
  }

  all.sort(
    (a, b) =>
      bayiSirasiIdx(a.BAYİ) - bayiSirasiIdx(b.BAYİ) ||
      a.MAĞAZA.localeCompare(b.MAĞAZA, "tr") ||
      a.ÇEŞİT.localeCompare(b.ÇEŞİT, "tr") ||
      a.SIRALAMA - b.SIRALAMA
  );

  const zeopsDisi = [...zeopsDusen.entries()]
    .map(([magaza, satir]) => ({ magaza, satir }))
    .sort((a, b) => a.magaza.localeCompare(b.magaza, "tr"));

  return {
    headers: SIRALAMA_HEADERS,
    satirlar: all,
    onizleme: all.slice(0, 200),
    kanallar,
    ozet: {
      toplamSatir: all.length,
      dosya: files.length,
      zeopsMagaza: opts.zeopsIndex?.adet ?? null,
      atlananZeopsSatir: zeopsDisi.reduce((n, m) => n + m.satir, 0),
      atlananZeopsMagaza: zeopsDisi.length,
      zeopsDisiMagazalar: zeopsDisi,
    },
    uyari,
    yearMonth: opts.yearMonth || null,
  };
}

function toSiralamXlsxBuffer(satirlar) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(satirlar.length ? satirlar : [{}], {
    header: SIRALAMA_HEADERS,
  });
  if (!satirlar.length) {
    XLSX.utils.sheet_add_aoa(ws, [SIRALAMA_HEADERS], { origin: "A1" });
  }
  XLSX.utils.book_append_sheet(wb, ws, "Sıralama Data");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = {
  SIRALAMA_HEADERS,
  BIZIM_MARKALAR,
  normalizeSiralamFiles,
  toSiralamXlsxBuffer,
  parseYearMonth,
  targetCesit,
  normalizeMarka,
};
