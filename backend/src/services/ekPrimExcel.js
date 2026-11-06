const ExcelJS = require("exceljs");
const store = require("./ekPrimStore");
const { normalizeName } = require("../util");

const TIP_AD = {
  isten_ayrilma_devralma: "İşten ayrılma / marka devralma",
  izin_siralamasi: "İzin — sıralama değerlendirmesi",
  inisiyatif_onayli: "İnisiyatif (onaylı)",
  koruma_primi: "Koruma primi",
  toplu_kurumsal_siralama: "Toplu/kurumsal satış — sıralama kaybı",
  diger: "Diğer",
};

const PARA_KOLON = new Set(["E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W"]);

function magazaNorm(s) {
  return normalizeName(s || "").replace(/\s+/g, " ");
}

/**
 * Istisna kayıtlarını rapor satırlarına uygular (mutasyonlu kopya).
 * Detay + uzman_toplam satırlarına kolon ekler; X açıklamaya not düşer; W yenilenir.
 */
function uygulaIstisnaSatirlara(satirlar, kayitlar) {
  const clone = (satirlar || []).map((s) => ({ ...s }));
  const uygulanan = [];

  for (const k of kayitlar || []) {
    const kolon = String(k.kolon || "Q").toUpperCase();
    if (!PARA_KOLON.has(kolon) && kolon !== "X") {
      uygulanan.push({ ...k, durum: "atlandi", neden: `kolon ${kolon}` });
      continue;
    }
    const uKey = normalizeName(k.uzman);
    const mKey = k.magaza ? magazaNorm(k.magaza) : null;
    const uzmanEslesir = (ad) => {
      const n = normalizeName(ad);
      if (n === uKey) return true;
      // "Toplam Ahmet Bilici" / "Ahmet Bilici Toplam"
      const strip = n.replace(/^TOPLAM\s+/, "").replace(/\s+TOPLAM$/, "");
      return strip === uKey;
    };
    const adaylar = clone.filter((s) => {
      if (s.tip === "genel_toplam") return false;
      if (!uzmanEslesir(s.uzman)) return false;
      if (mKey && magazaNorm(s.magaza) !== mKey && s.tip === "detay") return false;
      return true;
    });
    if (!adaylar.length) {
      uygulanan.push({ ...k, durum: "uzman_bulunamadi" });
      continue;
    }

    const tutar = Number(k.tutar) || 0;
    const not = [
      `[İstisna/${TIP_AD[k.tip] || k.tip}]`,
      `${tutar.toLocaleString("tr-TR")} TL → ${kolon}`,
      k.aciklama || "",
      k.onay ? `Onay: ${k.onay}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    // Önce bir detay satıra yaz (tercihen mağaza eşleşen); yoksa uzman_toplam
    let hedef =
      adaylar.find((s) => s.tip === "detay" && (!mKey || magazaNorm(s.magaza) === mKey)) ||
      adaylar.find((s) => s.tip === "detay") ||
      adaylar.find((s) => s.tip === "uzman_toplam") ||
      adaylar[0];

    if (kolon !== "X") {
      hedef[kolon] = Number(hedef[kolon] || 0) + tutar;
    }
    const oncekiX = String(hedef.X || "").trim();
    hedef.X = oncekiX ? `${oncekiX} | ${not}` : not;

    // Uzman toplam satırına da aynı kolonu yansıt (rapor tutarlılığı)
    const tot = adaylar.find((s) => s.tip === "uzman_toplam");
    if (tot && tot !== hedef && kolon !== "X") {
      tot[kolon] = Number(tot[kolon] || 0) + tutar;
      const tx = String(tot.X || "").trim();
      tot.X = tx ? `${tx} | ${not}` : not;
    }

    // W yenile (J+L..U; V ayrı)
    for (const s of adaylar) {
      if (s.tip === "genel_toplam") continue;
      const parts = ["J", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U"].map(
        (c) => Number(s[c] || 0)
      );
      s.W = parts.reduce((a, b) => a + b, 0) + Number(s.V || 0);
      const e = Number(s.E || 0);
      s.Y = e > 0 ? s.W / e : 0;
    }

    uygulanan.push({
      ...k,
      durum: "uygulandi",
      hedef_tip: hedef.tip,
      hedef_magaza: hedef.magaza || null,
    });
  }

  return { satirlar: clone, uygulanan };
}

function istisnaSheetYaz(wb, kayitlar, donemAd, donemId) {
  const ws = wb.addWorksheet("İstisna Ek Prim");
  ws.columns = [
    { header: "ID", key: "id", width: 16 },
    { header: "Uzman", key: "uzman", width: 28 },
    { header: "Mağaza", key: "magaza", width: 28 },
    { header: "Kanal", key: "kanal", width: 14 },
    { header: "Tutar (TL)", key: "tutar", width: 14 },
    { header: "Kolon", key: "kolon", width: 10 },
    { header: "Tip", key: "tip", width: 32 },
    { header: "Onay", key: "onay", width: 24 },
    { header: "Açıklama", key: "aciklama", width: 48 },
    { header: "Kayıt zamanı", key: "created_at", width: 22 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };

  let toplam = 0;
  for (const k of kayitlar) {
    toplam += Number(k.tutar) || 0;
    ws.addRow({
      id: k.id,
      uzman: k.uzman,
      magaza: k.magaza || "",
      kanal: k.kanal || "",
      tutar: Number(k.tutar) || 0,
      kolon: k.kolon,
      tip: TIP_AD[k.tip] || k.tip,
      onay: k.onay || "",
      aciklama: k.aciklama || "",
      created_at: k.created_at || "",
    });
  }
  const sumRow = ws.addRow({ uzman: "TOPLAM", tutar: toplam });
  sumRow.font = { bold: true };
  ws.getColumn("tutar").numFmt = "#,##0.00";

  const meta = wb.addWorksheet("Bilgi");
  meta.addRow(["Dönem", donemAd || donemId]);
  meta.addRow(["Kayıt adedi", kayitlar.length]);
  meta.addRow(["Toplam tutar", toplam]);
  meta.addRow([]);
  meta.addRow([
    "Not",
    "Toplu/kurumsal satış sıralama kaybı, işten ayrılma, izin ve onaylı inisiyatif kayıtları Prim Hesaplama sheet’ine kolon kolon işlenir.",
  ]);
  return toplam;
}

function primHesaplamaSheetYaz(wb, satirlar, donemAd) {
  const ws = wb.addWorksheet("Prim Hesaplama");
  const kolonlar = [
    { key: "uzman", ad: "Uzman Ad-Soyad", w: 24 },
    { key: "marka_grup", ad: "Prim Grup", w: 18 },
    { key: "magaza", ad: "Sell-Out Mağaza", w: 22 },
    { key: "satis_grup", ad: "Satış Grup", w: 16 },
    { key: "E", ad: "Prime Esas Toplam Tutar", w: 16 },
    { key: "F", ad: "Prim % 1", w: 12 },
    { key: "G", ad: "Bağdat/Beymen %0,05", w: 14 },
    { key: "H", ad: "Sensai Sephora %1", w: 14 },
    { key: "I", ad: "Sevil DG+LP %0,05", w: 14 },
    { key: "J", ad: "Toplam Satış Primi", w: 14 },
    { key: "L", ad: "Hedef Prim", w: 12 },
    { key: "M", ad: "Dior Mağaza", w: 12 },
    { key: "N", ad: "Dior Makyaj", w: 12 },
    { key: "O", ad: "Dior Parfüm", w: 12 },
    { key: "P", ad: "Dior Cilt", w: 12 },
    { key: "Q", ad: "LP ve diğer / istisna", w: 16 },
    { key: "R", ad: "Parfüm %1", w: 12 },
    { key: "S", ad: "Parfüm %0,5", w: 12 },
    { key: "T", ad: "Parfüm %0,5 (2)", w: 12 },
    { key: "U", ad: "Kalan", w: 10 },
    { key: "V", ad: "Ek Prim %0,20", w: 12 },
    { key: "W", ad: "Toplam Prim", w: 14 },
    { key: "X", ad: "Prim Açıklama", w: 40 },
  ];
  ws.columns = kolonlar.map((k) => ({ width: k.w }));
  const bas = ws.addRow(kolonlar.map((k) => k.ad));
  bas.font = { bold: true, color: { argb: "FFFFFFFF" } };
  bas.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  });

  for (const s of satirlar) {
    if (s.tip === "genel_toplam") continue;
    const row = ws.addRow(
      kolonlar.map((k) => {
        const v = s[k.key];
        if (v == null || v === "") return "";
        return v;
      })
    );
    for (let i = 0; i < kolonlar.length; i++) {
      const key = kolonlar[i].key;
      if (PARA_KOLON.has(key)) {
        const cell = row.getCell(i + 1);
        if (typeof cell.value === "number") cell.numFmt = '#,##0.00"TL."';
      }
    }
    if (s.tip === "uzman_toplam") row.font = { bold: true };
  }

  ws.addRow([]);
  ws.addRow([`Dönem: ${donemAd || ""} — istisna / chatbot düzeltmeleri işlenmiş kopya`]);
}

async function istisnaXlsxBuffer(donemId, donemAd, opts = {}) {
  const kayitlar = store.oku(donemId);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Arcon Prim";
  istisnaSheetYaz(wb, kayitlar, donemAd, donemId);

  if (opts.satirlar && opts.uygula) {
    const { satirlar, uygulanan } = uygulaIstisnaSatirlara(opts.satirlar, kayitlar);
    primHesaplamaSheetYaz(wb, satirlar, donemAd);

    const log = wb.addWorksheet("Uygulama Log");
    log.columns = [
      { header: "Uzman", key: "uzman", width: 24 },
      { header: "Kolon", key: "kolon", width: 10 },
      { header: "Tutar", key: "tutar", width: 12 },
      { header: "Durum", key: "durum", width: 18 },
      { header: "Hedef tip", key: "hedef_tip", width: 14 },
      { header: "Hedef mağaza", key: "hedef_magaza", width: 22 },
      { header: "Neden", key: "neden", width: 24 },
    ];
    log.getRow(1).font = { bold: true };
    for (const u of uygulanan) {
      log.addRow({
        uzman: u.uzman,
        kolon: u.kolon,
        tutar: u.tutar,
        durum: u.durum,
        hedef_tip: u.hedef_tip || "",
        hedef_magaza: u.hedef_magaza || "",
        neden: u.neden || "",
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

module.exports = { istisnaXlsxBuffer, uygulaIstisnaSatirlara, TIP_AD };
