#!/usr/bin/env node
/**
 * 10 uzmanlı gerçekçi test paketi — gerçek Excel (.xlsx) üretir.
 * Çalıştır: node uret.js
 *
 * Çıktılar Google Sheets / Excel’de kolon kolon açılır (CSV değil).
 */
const fs = require("fs");
const path = require("path");
const ExcelJS = require(path.join(__dirname, "..", "backend", "node_modules", "exceljs"));

const OUT = __dirname;
const DONEM = "Haziran 2026 Test";

async function writeXlsx(file, sheetName, headers, rows, widths = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = headers.map((h) => ({
    header: h,
    key: h,
    width: widths[h] || Math.min(28, Math.max(12, String(h).length + 2)),
  }));

  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    cell.font = { bold: true, size: 11, name: "Calibri", color: { argb: "FF000000" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFB0B0B0" } },
      bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
      left: { style: "thin", color: { argb: "FFB0B0B0" } },
      right: { style: "thin", color: { argb: "FFB0B0B0" } },
    };
  });

  for (const r of rows) {
    const row = ws.addRow(headers.map((h) => (r[h] == null ? "" : r[h])));
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { size: 11, name: "Calibri" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE0E0E0" } },
        bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
        left: { style: "thin", color: { argb: "FFE0E0E0" } },
        right: { style: "thin", color: { argb: "FFE0E0E0" } },
      };
    });
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const fp = path.join(OUT, file);
  await wb.xlsx.writeFile(fp);
  return fp;
}

function tlNum(n) {
  return Number(n);
}

// --- Gerçek ürün barkodları ---
const URUN = {
  rabanne: {
    marka: "RABANNE", barkod: "3349666002025", kod: "PPR68428000",
    etiket: "PACO ULV MAN TOKEN GIFT SG50+BALM50", uniq: "PPR68428000", aks: "PARFÜM",
  },
  ch: {
    marka: "CAROLINA HERRERA", barkod: "8411061000002", kod: "PCH-TST-002",
    etiket: "CAROLINA HERRERA GOOD GIRL 80ML", uniq: "PCH-TST-002", aks: "PARFÜM",
  },
  jpg: {
    marka: "JEAN PAUL GAULTIER", barkod: "3423470317107", kod: "JPG3171050",
    etiket: "JPG CLASSIQUE EDT BOTTLE 50 ML", uniq: "JPG3171050", aks: "PARFÜM",
  },
  dior: {
    marka: "DIOR", barkod: "3348900006201", kod: "F095355009",
    etiket: "CCP AMBRE NUIT EDP SPR 125 ML", uniq: "DIOR00002462", aks: "PARFÜM",
  },
  dg: {
    marka: "DOLCE & GABBANA", barkod: "3423220000792", kod: "DGB30700040101",
    etiket: "THE ONLY ONE EDP 30ML+TS10ML", uniq: "DGB30700040101", aks: "PARFÜM",
  },
  givenchy: {
    marka: "GIVENCHY", barkod: "3274870002717", kod: "GVCP037476",
    etiket: "ANGE OU DEMON LE SECRET EDP 100 ML", uniq: "GVCP00000024", aks: "PARFÜM",
  },
  hermes: {
    marka: "HERMES", barkod: "3346130000005", kod: "HRM-TST-005",
    etiket: "HERMES TERRE EDT 100ML", uniq: "HRM-TST-005", aks: "PARFÜM",
  },
  sensai: {
    marka: "SENSAI", barkod: "4969385605537", kod: "KNB90463X",
    etiket: "CELLULAR PERFORMANCE CREAM SPECIAL VERSION 40 ML", uniq: "KNB000000037", aks: "CİLT BAKIM",
  },
  lp: {
    marka: "LA PRAIRIE", barkod: "7611773022859", kod: "LP109732",
    etiket: "WHITE CAVIAR ILLUMINATING CLARIFYING LOTION 200 ML", uniq: "LP0000000025", aks: "CİLT BAKIM",
  },
  issey: {
    marka: "ISSEY MIYAKE", barkod: "3423470300161", kod: "IM0000000001",
    etiket: "L'EAU D'ISSEY EDT 100 ML", uniq: "IM0000000001", aks: "PARFÜM",
  },
};

const BIRIM = {
  rabanne: 5000, ch: 4000, jpg: 3500, dior: 8000, dg: 6000,
  givenchy: 7000, hermes: 7500, sensai: 10000, lp: 14000, issey: 3000,
};

/** Gerçek mağaza kodları + kısa mağaza adı (orijinal Excel gibi) */
const UZMANLAR = [
  {
    ad: "Yıldırım", soyad: "Tezer", sehir: "İSTANBUL", magazaKodu: "34.ERY.BOY",
    bayi: "BOYNER", magazaAdi: "ERENKÖY", primMagaza: "BOYNER ERENKÖY", grup: "Puig",
    not: "Puig satış + 1 Grup Dışı (Issey). Hedef tutmaz.",
    hedefTutacak: false,
    satirlar: [
      { ziyaret: "900.001", urun: "rabanne", adet: 2, fiyat: 5800 },
      { ziyaret: "900.001", urun: "ch", adet: 1, fiyat: 4200 },
      { ziyaret: "900.002", urun: "rabanne", adet: 1, fiyat: 5800 },
      { ziyaret: "900.003", urun: "issey", adet: 1, fiyat: 3900 },
    ],
  },
  {
    ad: "Ahmet", soyad: "Bilici", sehir: "İSTANBUL", magazaKodu: "34.ZRL.BYP",
    bayi: "BEYMEN", magazaAdi: "ZORLU", primMagaza: "BEYMEN ZORLU", grup: "Dolce & Gabbana",
    not: "DG Ok + Beymen %0,5 ek. Hedef tutar.",
    hedefTutacak: true,
    satirlar: [
      { ziyaret: "900.010", urun: "dg", adet: 3, fiyat: 6500 },
      { ziyaret: "900.011", urun: "dg", adet: 1, fiyat: 6500 },
    ],
  },
  {
    ad: "Ayşen Kübra", soyad: "Es", sehir: "İSTANBUL", magazaKodu: "34.SDY.BYP",
    bayi: "BEYMEN", magazaAdi: "SUADİYE", primMagaza: "BEYMEN SUADİYE", grup: "DIOR",
    not: "Dior Ok + Beymen. Aynı ziyarette 2× aynı ürün → Adet=2.",
    hedefTutacak: true,
    satirlar: [
      { ziyaret: "900.020", urun: "dior", adet: 1, fiyat: 8900 },
      { ziyaret: "900.020", urun: "dior", adet: 1, fiyat: 8900 },
    ],
  },
  {
    ad: "Ayşe", soyad: "Sadi", sehir: "İSTANBUL", magazaKodu: "34.IST.SPH",
    bayi: "SEPHORA", magazaAdi: "İSTİNYE PARK", primMagaza: "SEPHORA İSTİNYE PARK", grup: "DIOR",
    not: "Sephora Dior.",
    hedefTutacak: false,
    satirlar: [
      { ziyaret: "900.030", urun: "dior", adet: 2, fiyat: 8900 },
    ],
  },
  {
    ad: "Begüm Sevde", soyad: "Özbey", sehir: "İSTANBUL", magazaKodu: "34.BCi.SPH",
    bayi: "SEPHORA", magazaAdi: "BAĞDAT CADDESİ", primMagaza: "SEPHORA BAĞDAT CADDESİ", grup: "Sensai",
    not: "Sensai + Bağdat ekstra.",
    hedefTutacak: true,
    satirlar: [
      { ziyaret: "900.040", urun: "sensai", adet: 2, fiyat: 12000 },
    ],
  },
  {
    ad: "Aysel", soyad: "Coşkun", sehir: "İSTANBUL", magazaKodu: "34.SSK.SEV",
    bayi: "SEVİL", magazaAdi: "ŞAŞKINBAKKAL", primMagaza: "SEVİL ŞAŞKINBAKKAL", grup: "La Prairie",
    not: "LP Sevil +%0,5.",
    hedefTutacak: true,
    satirlar: [
      { ziyaret: "900.050", urun: "lp", adet: 1, fiyat: 15000 },
    ],
  },
  {
    ad: "Melike", soyad: "Öztürk Aşık", sehir: "İZMİR", magazaKodu: "35.İHW.SPH",
    bayi: "SEPHORA", magazaAdi: "İZMİR HİLLTOWN", primMagaza: "SEPHORA İZMİR HİLLTOWN", grup: "DIOR",
    not: "Çok satır Dior.",
    hedefTutacak: true,
    satirlar: [
      { ziyaret: "900.060", urun: "dior", adet: 1, fiyat: 8900 },
      { ziyaret: "900.060", urun: "dior", adet: 1, fiyat: 8900 },
      { ziyaret: "900.061", urun: "dior", adet: 1, fiyat: 8900 },
    ],
  },
  {
    ad: "Hadi Serkan", soyad: "Kaleli", sehir: "İZMİR", magazaKodu: "35.İMR.İNK",
    bayi: "SEPHORA", magazaAdi: "İZMİR İSTİNYE PARK", primMagaza: "SEPHORA İZMİR İSTİNYE PARK",
    grup: "Givenchy+Hermes+Dolce",
    not: "Givenchy+Hermes Ok; Dior Grup Dışı.",
    hedefTutacak: true,
    satirlar: [
      { ziyaret: "900.070", urun: "givenchy", adet: 2, fiyat: 7100 },
      { ziyaret: "900.071", urun: "hermes", adet: 1, fiyat: 8200 },
      { ziyaret: "900.072", urun: "dior", adet: 1, fiyat: 8900 },
    ],
  },
  {
    ad: "Ahmet", soyad: "Bozdağ", sehir: "İSTANBUL", magazaKodu: "34.VİB.SPH",
    bayi: "SEPHORA", magazaAdi: "VADİ İSTANBUL", primMagaza: "SEPHORA VADİ İSTANBUL", grup: "Puig",
    not: "Puig Ok.",
    hedefTutacak: true,
    satirlar: [
      { ziyaret: "900.080", urun: "rabanne", adet: 1, fiyat: 5800 },
      { ziyaret: "900.081", urun: "jpg", adet: 2, fiyat: 4500 },
    ],
  },
  {
    ad: "Arel", soyad: "Tunalı", sehir: "ANTALYA", magazaKodu: "07.ANT.BOY",
    bayi: "BOYNER", magazaAdi: "ANTALYA", primMagaza: "BOYNER ANTALYA", grup: "Puig",
    not: "Puig hedef tutar.",
    hedefTutacak: true,
    satirlar: [
      { ziyaret: "900.090", urun: "ch", adet: 4, fiyat: 4200 },
    ],
  },
];

function fullName(u) {
  return `${u.ad} ${u.soyad}`;
}
function norm(s) {
  return String(s || "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/İ/g, "I")
    .trim();
}
function grupMarkalari(grup) {
  const g = norm(grup);
  if (g === "PUIG") return ["RABANNE", "CAROLINA HERRERA", "JEAN PAUL GAULTIER"];
  if (g.includes("GIVENCHY")) return ["GIVENCHY", "HERMES", "DOLCE & GABBANA"];
  if (g.includes("DOLCE") || g === "DOLCE & GABBANA") return ["DOLCE & GABBANA"];
  if (g === "DIOR") return ["DIOR"];
  if (g.includes("SENSAI")) return ["SENSAI"];
  if (g.includes("LA PRAIRIE") || g === "LP" || g.endsWith(" LP") || g.startsWith("LP ")) return ["LA PRAIRIE"];
  return [grup];
}
function grupIciMi(grup, marka) {
  const marks = grupMarkalari(grup).map(norm);
  const m = norm(marka);
  if (marks.some((x) => x === m || m.includes(x) || x.includes(m))) return true;
  if (norm(grup) === "PUIG" && (m === "RABANNE" || m === "PACO RABANNE")) return true;
  return false;
}

async function main() {
  // Eski CSV’leri kaldır
  for (const f of fs.readdirSync(OUT)) {
    if (f.endsWith(".csv")) fs.unlinkSync(path.join(OUT, f));
  }

  // 0) Stok Liste — test ürünlerinin barkod / uniq kaydı (gerçek kolon düzeni)
  const stokRows = Object.values(URUN).map((ur) => ({
    "BARKOD 1": ur.barkod,
    "STOK KODU": ur.kod,
    "STOK ADI": ur.etiket,
    "SEKTÖR ADI": "SELEKTIF TEKLİ",
    "MARKA": ur.marka,
    "AKTİF/DELİST": "AKTİF",
    "ÜRÜN GRUP KODU": ur.aks === "CİLT BAKIM" ? "3-CB-00" : (ur.aks === "MAKYAJ" ? "2-MK-00" : "1-PA-00"),
    "ÜRÜN GRUBU ADI": ur.aks === "CİLT BAKIM" ? "CİLT BAKIM" : (ur.aks === "MAKYAJ" ? "MAKYAJ" : "PARFÜM - ANA ÜRÜN"),
    "UNIQ KOD": ur.uniq,
    "UNIQ ADI": ur.etiket,
    "AKS": ur.aks,
    "CİNSİYET": "",
  }));
  await writeXlsx(
    "00_Stok_Liste.xlsx",
    "Stok Liste",
    ["BARKOD 1", "STOK KODU", "STOK ADI", "SEKTÖR ADI", "MARKA", "AKTİF/DELİST", "ÜRÜN GRUP KODU", "ÜRÜN GRUBU ADI", "UNIQ KOD", "UNIQ ADI", "AKS", "CİNSİYET"],
    stokRows,
    { "STOK ADI": 42, "UNIQ ADI": 42, "MARKA": 20, "BARKOD 1": 16, "UNIQ KOD": 16 }
  );

  // 1) Uzman-Mağaza-Grup — gerçek Excel kolon düzeni
  const uzmanRows = UZMANLAR.map((u) => ({
    "ŞEHİR": u.sehir,
    "MAĞAZA KODU": u.magazaKodu,
    "BAYİ": u.bayi,
    "MAĞAZA": u.magazaAdi,
    "PRİM MAĞAZA": u.primMagaza,
    "Uzman Ad-Soyad": fullName(u),
    "Group": u.grup,
  }));
  await writeXlsx(
    "01_Uzman-Magaza-Grup.xlsx",
    "Uzman-Mağaza-Grup",
    ["ŞEHİR", "MAĞAZA KODU", "BAYİ", "MAĞAZA", "PRİM MAĞAZA", "Uzman Ad-Soyad", "Group"],
    uzmanRows,
    { "ŞEHİR": 12, "MAĞAZA KODU": 14, "BAYİ": 12, "MAĞAZA": 18, "PRİM MAĞAZA": 26, "Uzman Ad-Soyad": 22, "Group": 24 }
  );

  // 2) Zeops
  const zeops = [];
  for (const u of UZMANLAR) {
    for (const s of u.satirlar) {
      const ur = URUN[s.urun];
      zeops.push({
        "Ziyaret ID": s.ziyaret,
        "Ad": u.ad,
        "Soyad": u.soyad,
        "İşlem Tarihi": new Date(2026, 5, 5),
        "Durum": "Tamamlandı",
        "Satış Tarihi": new Date(2026, 5, 5),
        "Mağaza": u.primMagaza,
        "Barkod": ur.barkod,
        "Kod": ur.kod,
        "Etiket": ur.etiket,
        "Adet": s.adet,
        "Fiyat": tlNum(s.fiyat),
        "Toplam": tlNum(s.fiyat * s.adet),
        "Satış Notları": "",
      });
    }
  }
  await writeXlsx(
    "02_Zeops_Ham_Data.xlsx",
    "Zeops Ham Data",
    ["Ziyaret ID", "Ad", "Soyad", "İşlem Tarihi", "Durum", "Satış Tarihi", "Mağaza", "Barkod", "Kod", "Etiket", "Adet", "Fiyat", "Toplam", "Satış Notları"],
    zeops,
    { "Etiket": 40, "Mağaza": 26, "Barkod": 16 }
  );

  // 3) Sell-out
  const sellMap = new Map();
  for (const u of UZMANLAR) {
    for (const s of u.satirlar) {
      const ur = URUN[s.urun];
      const key = `${u.primMagaza}|${ur.barkod}`;
      if (!sellMap.has(key)) {
        sellMap.set(key, { bayi: u.bayi, magaza: u.primMagaza, urun: s.urun, ur, adet: 0 });
      }
      sellMap.get(key).adet += s.adet;
    }
  }
  const sellout = [];
  for (const v of sellMap.values()) {
    const soAdet = v.adet + 2;
    const birim = BIRIM[v.urun];
    sellout.push({
      "Bayi": v.bayi,
      "Ürün Adı": v.ur.etiket,
      "Arcon Referans": v.ur.kod,
      "Arcon Barkod": v.ur.barkod,
      "Prim Unıq Kod": v.ur.uniq,
      "Adet": soAdet,
      "Ciro Kdv Hariç": soAdet * birim,
      "Mağaza": v.magaza,
      "Prim Mağaza": v.magaza,
      "Mağaza Kod": "",
      "Ay Sıra": 6,
      "Ay": "Haziran",
      "Arcon Marka": v.ur.marka,
      "Marka Grup": v.urun === "issey" ? "BPI" : (["rabanne", "ch", "jpg"].includes(v.urun) ? "PUIG" : v.ur.marka),
    });
  }
  await writeXlsx(
    "03_Sellout_Data.xlsx",
    "Sell-out Data",
    ["Bayi", "Ürün Adı", "Arcon Referans", "Arcon Barkod", "Prim Unıq Kod", "Adet", "Ciro Kdv Hariç", "Mağaza", "Prim Mağaza", "Mağaza Kod", "Ay Sıra", "Ay", "Arcon Marka", "Marka Grup"],
    sellout,
    { "Ürün Adı": 40, "Prim Mağaza": 26 }
  );

  // 4) Hedef
  const magazaMarkaCiro = new Map();
  for (const v of sellMap.values()) {
    const soAdet = v.adet + 2;
    const ciro = soAdet * BIRIM[v.urun];
    const k = `${v.magaza}|${v.ur.marka}`;
    magazaMarkaCiro.set(k, (magazaMarkaCiro.get(k) || 0) + ciro);
  }
  const hedef = [];
  for (const u of UZMANLAR) {
    const markalar = grupMarkalari(u.grup);
    let gercek = 0;
    for (const m of markalar) gercek += magazaMarkaCiro.get(`${u.primMagaza}|${m}`) || 0;
    const carpan = u.hedefTutacak ? 0.8 : 1.5;
    const hedefToplam = Math.round(gercek * carpan) || 100000;
    const pay = Math.max(1, Math.round(hedefToplam / markalar.length));
    for (const m of markalar) {
      hedef.push({
        "BAYİ": u.bayi,
        "MAĞAZA KOD": u.magazaKodu,
        "MAĞAZA ADI": u.primMagaza,
        "MARKA": m,
        "AKS": u.grup,
        "Haz-26": pay,
        "REVİZE Mayıs": pay,
      });
    }
  }
  await writeXlsx(
    "04_Hedef.xlsx",
    "Hedef",
    ["BAYİ", "MAĞAZA KOD", "MAĞAZA ADI", "MARKA", "AKS", "Haz-26", "REVİZE Mayıs"],
    hedef,
    { "MAĞAZA ADI": 26, "MARKA": 22 }
  );

  // 5) Sıralama
  const siralama = [];
  for (const u of UZMANLAR) {
    for (const m of grupMarkalari(u.grup)) {
      for (const c of ["1-PARFÜM", "2-MAKYAJ", "3-CİLT BAKIM"]) {
        siralama.push({
          "MAĞAZA": u.primMagaza,
          "ÇEŞİT": c,
          "MARKA": m,
          "SIRALAMA": 5,
          "AY": "06-HAZİRAN",
          "BÖLGE": u.sehir === "İZMİR" ? "EGE" : (u.sehir === "ANTALYA" ? "AKDENİZ" : "MARMARA"),
          "YIL": 2026,
          "BAYİ": u.bayi,
        });
      }
    }
  }
  await writeXlsx(
    "05_Siralama.xlsx",
    "Sıralama",
    ["MAĞAZA", "ÇEŞİT", "MARKA", "SIRALAMA", "AY", "BÖLGE", "YIL", "BAYİ"],
    siralama,
    { "MAĞAZA": 26, "MARKA": 22 }
  );

  // ===== Beklenen hesap =====
  const kalan = new Map();
  for (const v of sellMap.values()) kalan.set(`${v.magaza}|${v.ur.barkod}`, v.adet + 2);

  const ham = [];
  for (const u of UZMANLAR) {
    for (const s of u.satirlar) {
      const ur = URUN[s.urun];
      const birim = BIRIM[s.urun];
      const icinde = grupIciMi(u.grup, ur.marka);
      let primAdet = 0;
      let aciklama = "Grup dışı";
      let satisTuru = "Grup Dışı";
      if (icinde) {
        const k = `${u.primMagaza}|${ur.barkod}`;
        const kul = Math.min(s.adet, Math.max(0, kalan.get(k) || 0));
        kalan.set(k, (kalan.get(k) || 0) - kul);
        primAdet = kul;
        if (primAdet === s.adet) aciklama = "Ok";
        else if (primAdet > 0) aciklama = `Kısmi Ok — ${s.adet - primAdet} adet mükerrer`;
        else aciklama = "Mükerrer beyan — sell-out kalanı 0";
        satisTuru = primAdet > 0 ? "Grup Satış" : "Mağazada Eşleşmeyen Satış";
      }
      ham.push({
        u, s, ur, birim, primAdet,
        primeEsas: +(primAdet * birim).toFixed(2),
        aciklama, satisTuru,
      });
    }
  }

  const birlesikMap = new Map();
  for (const h of ham) {
    const key = `${h.s.ziyaret}|${fullName(h.u)}|${h.u.primMagaza}|${h.ur.barkod}`;
    if (!birlesikMap.has(key)) {
      birlesikMap.set(key, {
        "Ziyaret ID": h.s.ziyaret,
        "Ad": h.u.ad,
        "Soyad": h.u.soyad,
        "Birleştirilmiş İsim": fullName(h.u),
        "Uzman Ad-Soyad": fullName(h.u),
        "Prim Grup": h.u.grup,
        "Mağaza": h.u.primMagaza,
        "Barkod": h.ur.barkod,
        "Kod": h.ur.kod,
        "Etiket": h.ur.etiket,
        "Marka": h.ur.marka,
        "Uniq Kod": h.ur.uniq,
        "Uniq Ad": h.ur.etiket,
        "Adet": 0,
        "Prim Hesaplanan Adet": 0,
        "Prime Esas Toplam Tutar": 0,
        "Prime Esas Birim Ciro": h.birim,
        "Rapor Açıklama": h.aciklama,
        "Satış Türü": h.satisTuru,
        "Sell-Out Adet": (sellMap.get(`${h.u.primMagaza}|${h.ur.barkod}`)?.adet || 0) + 2,
        "Bayi": h.u.bayi,
        _urunKey: h.s.urun,
      });
    }
    const t = birlesikMap.get(key);
    t.Adet += h.s.adet;
    t["Prim Hesaplanan Adet"] += h.primAdet;
    t["Prime Esas Toplam Tutar"] = +(t["Prime Esas Toplam Tutar"] + h.primeEsas).toFixed(2);
    if (String(t["Rapor Açıklama"]).startsWith("Ok") && !String(h.aciklama).startsWith("Ok")) {
      t["Rapor Açıklama"] = h.aciklama;
    }
    if (h.satisTuru === "Grup Satış") t["Satış Türü"] = "Grup Satış";
  }

  const uzmanUrun = new Map();
  for (const t of birlesikMap.values()) {
    const uk = `${t["Uzman Ad-Soyad"]}|${t.Mağaza}|${t.Barkod}`;
    uzmanUrun.set(uk, (uzmanUrun.get(uk) || 0) + t.Adet);
  }

  const beklenenSatir = [];
  for (const t of birlesikMap.values()) {
    const uk = `${t["Uzman Ad-Soyad"]}|${t.Mağaza}|${t.Barkod}`;
    t["Uzman Toplam Satış"] = uzmanUrun.get(uk);
    t["Mağaza Toplam Satış"] = t["Sell-Out Adet"];
    t.Kontrol = t["Mağaza Toplam Satış"] - t["Uzman Toplam Satış"];
    t["Mağaza KDV Hariç Ciro"] = t["Sell-Out Adet"] * BIRIM[t._urunKey];
    const E = t["Prime Esas Toplam Tutar"];
    t["Prim % 1"] = +(E * 0.01).toFixed(2);
    t["Sephora Sensai + %1"] = 0;
    t["Sephora Bağdat + Beymen + % 0,05"] = 0;
    t["Sevil LP +% 0,05"] = 0;
    if (t.Bayi === "BEYMEN" || t.Mağaza.includes("BAĞDAT")) {
      t["Sephora Bağdat + Beymen + % 0,05"] = +(E * 0.005).toFixed(2);
    }
    if (t.Bayi === "SEPHORA" && norm(t["Prim Grup"]).includes("SENSAI")) {
      t["Sephora Sensai + %1"] = +(E * 0.01).toFixed(2);
    }
    if ((t.Bayi === "SEVİL" || t.Bayi === "SEVIL") && norm(t["Prim Grup"]).includes("LA PRAIRIE")) {
      t["Sevil LP +% 0,05"] = +(E * 0.005).toFixed(2);
    }
    t["Toplam Satış Primi"] = +(
      t["Prim % 1"] + t["Sephora Sensai + %1"] + t["Sephora Bağdat + Beymen + % 0,05"] + t["Sevil LP +% 0,05"]
    ).toFixed(2);
    delete t._urunKey;
    beklenenSatir.push(t);
  }

  const satirHeaders = [
    "Ziyaret ID", "Ad", "Soyad", "Birleştirilmiş İsim", "Uzman Ad-Soyad", "Prim Grup",
    "Mağaza", "Barkod", "Kod", "Etiket", "Marka", "Uniq Kod", "Uniq Ad",
    "Uzman Toplam Satış", "Mağaza Toplam Satış", "Kontrol", "Rapor Açıklama",
    "Adet", "Prim Hesaplanan Adet", "Sell-Out Adet", "Mağaza KDV Hariç Ciro",
    "Prime Esas Birim Ciro", "Prime Esas Toplam Tutar",
    "Prim % 1", "Sephora Sensai + %1", "Sephora Bağdat + Beymen + % 0,05", "Sevil LP +% 0,05",
    "Toplam Satış Primi", "Bayi", "Satış Türü",
  ];
  await writeXlsx("beklenen_Satir_Satir.xlsx", "Prim Çalışma", satirHeaders, beklenenSatir);

  const ozet = new Map();
  for (const h of ham) {
    const key = fullName(h.u) + "|" + h.u.primMagaza;
    if (!ozet.has(key)) {
      ozet.set(key, {
        uzman: fullName(h.u), marka_grup: h.u.grup, magaza: h.u.primMagaza,
        bayi: h.u.bayi, hedefTutacak: h.u.hedefTutacak, E: 0, not: h.u.not,
        u: h.u,
      });
    }
    ozet.get(key).E = +(ozet.get(key).E + h.primeEsas).toFixed(2);
  }

  // Hedef tutarı (K kolonu) — uzman grubunun mağaza hedef toplamı
  const hedefByUzman = new Map();
  for (const u of UZMANLAR) {
    let t = 0;
    for (const m of grupMarkalari(u.grup)) {
      // hedef satırlarından
      const hit = hedef.find((x) => x["MAĞAZA ADI"] === u.primMagaza && x.MARKA === m);
      if (hit) t += Number(hit["REVİZE Mayıs"] || 0);
    }
    hedefByUzman.set(fullName(u) + "|" + u.primMagaza, t);
  }

  const pivotKolonlar = [
    { key: "uzman", ad: "Satır Etiketleri", g: 22, renk: "siyah" },
    { key: "marka_grup", ad: "Marka Grup", g: 18, renk: "siyah" },
    { key: "magaza", ad: "Sell-Out Mağaza", g: 22, renk: "siyah" },
    { key: "satis_grup", ad: "Satış Grup", g: 16, renk: "siyah" },
    { key: "E", ad: "Prime Esas Toplam Tutar", g: 18, sayi: true, renk: "siyah" },
    { key: "F", ad: "Prim % 1", g: 12, sayi: true, renk: "satis" },
    { key: "G", ad: "Sensai Sephora +\nSisley Cadde + %1", g: 18, sayi: true, renk: "satis" },
    { key: "H", ad: "Sephora Bağdat + Beymen + % 0,05", g: 18, sayi: true, renk: "satis" },
    { key: "I", ad: "Toplam Sevil LP", g: 14, sayi: true, renk: "satis" },
    { key: "J", ad: "Toplam Toplam", g: 14, sayi: true, renk: "satis" },
    { key: "K", ad: "Haziran\nHedefler", g: 14, sayi: true, renk: "hedef" },
    { key: "L", ad: "Hedef\nPrim ( % 0,50 )", g: 14, sayi: true, renk: "hedef" },
    { key: "M", ad: "Dior Mağaza\n1.Lik  % 0,50", g: 14, sayi: true, renk: "dior" },
    { key: "N", ad: "Dior Makyaj\n1. lik % 0,33", g: 14, sayi: true, renk: "dior" },
    { key: "O", ad: "Dior Parfüm\nİlk 2 % 0,33", g: 14, sayi: true, renk: "dior" },
    { key: "P", ad: "Dior Cilt Bakım\nİlk 3 % 0,33", g: 14, sayi: true, renk: "dior" },
    { key: "Q", ad: "LP Mağaza - CİLT Bakım\n1. LİK Ve Diğer Sıralama Primleri", g: 20, sayi: true, renk: "lp" },
    { key: "R", ad: "Parfüm % 1", g: 12, sayi: true, renk: "parfum" },
    { key: "S", ad: "Parfüm % 0,5", g: 12, sayi: true, renk: "parfum" },
    { key: "T", ad: "Parfüm % 0,5", g: 12, sayi: true, renk: "parfum" },
    { key: "U", ad: "Önceki dönemden\nKalan", g: 14, sayi: true, renk: "kalan" },
    { key: "V", ad: "Toplam Primden\nEk Prim ( % 0,20 )", g: 16, sayi: true, renk: "toplam" },
    { key: "W", ad: "Toplam\nPrim", g: 14, sayi: true, renk: "toplam" },
    { key: "X", ad: "Prim\nAçıklama", g: 28, renk: "aciklama" },
    { key: "Y", ad: "Toplam Prim\nYüzdesi", g: 14, yuzde: true, renk: "aciklama" },
  ];

  const pivotRenkArgb = {
    siyah: { bg: "FF1F1F1F", fg: "FFFFC000" },
    satis: { bg: "FFBDD7EE", fg: "FF000000" },
    hedef: { bg: "FF1F1F1F", fg: "FFFFFFFF" },
    dior: { bg: "FFC6EFCE", fg: "FF000000" },
    lp: { bg: "FFF8CBAD", fg: "FF000000" },
    parfum: { bg: "FFE2D5F1", fg: "FF000000" },
    kalan: { bg: "FFF4B183", fg: "FF000000" },
    toplam: { bg: "FF1F4E79", fg: "FFFFFFFF" },
    aciklama: { bg: "FFC00000", fg: "FFFFFFFF" },
  };

  const beklenenToplanmis = [];
  let genelE = 0, genelW = 0;
  for (const o of ozet.values()) {
    const E = o.E;
    const F = +(E * 0.01).toFixed(2);
    let G = 0, H = 0, I = 0;
    const grupU = norm(o.marka_grup);
    if (o.bayi === "SEPHORA" && grupU.includes("SENSAI")) G = F;
    if (o.bayi === "BEYMEN" || o.magaza.includes("BAĞDAT")) H = +(E * 0.005).toFixed(2);
    if ((o.bayi === "SEVİL" || o.bayi === "SEVIL") && (grupU.includes("LA PRAIRIE") || grupU.includes("LP"))) {
      I = +(E * 0.005).toFixed(2);
    }
    const J = +(F + G + H + I).toFixed(2);
    const K = hedefByUzman.get(o.uzman + "|" + o.magaza) || 0;
    const L = o.hedefTutacak ? +(E * 0.005).toFixed(2) : 0;
    const W = +(J + L).toFixed(2);
    const Y = E > 0 ? W / E : 0;
    genelE += E;
    genelW += W;
    beklenenToplanmis.push({
      uzman: o.uzman,
      marka_grup: o.marka_grup,
      magaza: o.magaza,
      satis_grup: o.marka_grup,
      E, F, G, H, I, J, K, L,
      M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0, T: 0, U: 0, V: 0,
      W, X: o.not, Y,
      tip: "detay",
    });
  }
  // Genel toplam satırı (sarı)
  beklenenToplanmis.push({
    uzman: "Genel Toplam",
    marka_grup: "", magaza: "", satis_grup: "",
    E: +genelE.toFixed(2),
    F: +beklenenToplanmis.reduce((a, r) => a + (r.tip === "detay" ? r.F : 0), 0).toFixed(2),
    G: +beklenenToplanmis.reduce((a, r) => a + (r.tip === "detay" ? r.G : 0), 0).toFixed(2),
    H: +beklenenToplanmis.reduce((a, r) => a + (r.tip === "detay" ? r.H : 0), 0).toFixed(2),
    I: +beklenenToplanmis.reduce((a, r) => a + (r.tip === "detay" ? r.I : 0), 0).toFixed(2),
    J: +beklenenToplanmis.reduce((a, r) => a + (r.tip === "detay" ? r.J : 0), 0).toFixed(2),
    K: +beklenenToplanmis.reduce((a, r) => a + (r.tip === "detay" ? r.K : 0), 0).toFixed(2),
    L: +beklenenToplanmis.reduce((a, r) => a + (r.tip === "detay" ? r.L : 0), 0).toFixed(2),
    M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0, T: 0, U: 0, V: 0,
    W: +genelW.toFixed(2),
    X: "",
    Y: genelE > 0 ? genelW / genelE : 0,
    tip: "genel_toplam",
  });

  // Arcon Prim Hesaplama formatında renkli Excel
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Prim Hesaplama");
    ws.columns = pivotKolonlar.map((k) => ({ width: k.g }));

    // Üst filtre satırları (Excel’deki gibi)
    ws.addRow(["Mağaza Toplam Satış", "(Tümü)"]);
    ws.addRow(["Marka", "(Tümü)"]);
    ws.addRow(["SATIŞ TÜRÜ", "(Tümü)"]);
    ws.addRow(["Prime Esas Toplam Tutar", "(Birden Çok Öğe)"]);
    ws.addRow([]);

    const basRow = ws.addRow(pivotKolonlar.map((k) => k.ad));
    basRow.height = 42;
    for (let i = 1; i <= pivotKolonlar.length; i++) {
      const cell = basRow.getCell(i);
      const renk = pivotRenkArgb[pivotKolonlar[i - 1].renk] || pivotRenkArgb.siyah;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: renk.bg } };
      cell.font = { color: { argb: renk.fg }, bold: true, size: 10, name: "Calibri" };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF666666" } },
        right: { style: "thin", color: { argb: "FF666666" } },
      };
    }

    for (const s of beklenenToplanmis) {
      const row = ws.addRow(pivotKolonlar.map((k) => {
        const v = s[k.key];
        if (v == null || v === "") return "";
        return v;
      }));
      const sari = s.tip === "genel_toplam" || s.tip === "uzman_toplam";
      for (let i = 1; i <= pivotKolonlar.length; i++) {
        const cell = row.getCell(i);
        const kol = pivotKolonlar[i - 1];
        cell.font = { size: 10, name: "Calibri", bold: !!sari };
        cell.border = {
          top: { style: "thin", color: { argb: "FFCCCCCC" } },
          bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
          left: { style: "thin", color: { argb: "FFCCCCCC" } },
          right: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
        if (sari) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE699" } };
        }
        if (kol.sayi && typeof cell.value === "number") {
          cell.numFmt = cell.value === 0 ? '"-TL."' : '#,##0.00"TL."';
          cell.alignment = { horizontal: "right" };
        }
        if (kol.yuzde && typeof cell.value === "number") {
          cell.numFmt = "0.00%";
          cell.alignment = { horizontal: "right" };
        }
      }
    }

    ws.views = [{ state: "frozen", ySplit: 6 }];
    await wb.xlsx.writeFile(path.join(OUT, "beklenen_Toplanmis.xlsx"));
  }

  const md = [];
  md.push(`# 10 Uzman Test Paketi — ${DONEM}`);
  md.push("");
  md.push("Dosyalar **gerçek Excel (.xlsx)** — Google Sheets / Excel’de kolon kolon açılır.");
  md.push("`beklenen_Toplanmis.xlsx` Arcon Prim Hesaplama gibi **renkli başlıklı**dır.");
  md.push("");
  md.push("## Yükleme sırası");
  md.push("1. `00_Stok_Liste.xlsx` *(ürün barkod/uniq — önce yükle)*");
  md.push("2. `01_Uzman-Magaza-Grup.xlsx`");
  md.push("3. `02_Zeops_Ham_Data.xlsx`");
  md.push("4. `03_Sellout_Data.xlsx`");
  md.push("5. `04_Hedef.xlsx`");
  md.push("6. `05_Siralama.xlsx`");
  md.push("7. Prim hesapla");
  md.push("");
  md.push("## Teyit");
  md.push("- `beklenen_Satir_Satir.xlsx` ↔ sistem satır satır Excel");
  md.push("- `beklenen_Toplanmis.xlsx` ↔ sistem toplanmış Excel (renkli Prim Hesaplama)");
  md.push("");
  md.push("## 10 uzman");
  md.push("| Uzman | Prim Mağaza | Kod | Grup | Senaryo |");
  md.push("|---|---|---|---|---|");
  for (const u of UZMANLAR) {
    md.push(`| ${fullName(u)} | ${u.primMagaza} | ${u.magazaKodu} | ${u.grup} | ${u.not} |`);
  }
  md.push("");
  md.push("## Beklenen toplanmış özet");
  md.push("| Uzman | E | F | H | G | I | L | W |");
  md.push("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of beklenenToplanmis.filter((x) => x.tip === "detay")) {
    md.push(`| ${r.uzman} | ${r.E} | ${r.F} | ${r.H} | ${r.G} | ${r.I} | ${r.L} | ${r.W} |`);
  }
  md.push("");
  md.push("Yeniden üret: `node uret.js`");
  fs.writeFileSync(path.join(OUT, "README.md"), md.join("\n"), "utf8");

  console.log("Üretilen Excel dosyaları:");
  for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith(".xlsx")).sort()) {
    console.log(" -", f);
  }
  console.log("\nToplanmış:");
  for (const r of beklenenToplanmis.filter((x) => x.tip === "detay")) {
    console.log(`  ${r.uzman.padEnd(22)} E=${String(r.E).padStart(7)}  W=${r.W}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
