// Flywork Prim Raporu - Word doküman üretici
// Hazırlayan: Sena Özyiğit
const {
  Document, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  Packer, ImageRun,
} = require("docx");
const fs = require("fs");
const path = require("path");

const EKRAN_DIR = path.join(__dirname, "ekranlar");

function imgWidthHeight(file, maxW = 540) {
  // Bilinen boyutlar (sips çıktısı); en-boy oranını koru
  const dims = {
    "01_af242_formul.png": [1262, 720],
    "02_af242_sonuc.png": [1282, 794],
    "03_ah242_yuzde1.png": [1276, 642],
    "04_pivot_bos_satirlar.png": [1278, 776],
    "05_mayis_hedef_kanyon.png": [1282, 806],
  };
  const [w, h] = dims[file] || [1280, 720];
  const width = maxW;
  const height = Math.round((h / w) * maxW);
  return { width, height };
}

function ekranGorsel(file, aciklama) {
  const full = path.join(EKRAN_DIR, file);
  const { width, height } = imgWidthHeight(file);
  const data = fs.readFileSync(full);
  return [
    new Paragraph({
      spacing: { before: 160, after: 60 },
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          type: "png",
          data,
          transformation: { width, height },
          altText: { title: aciklama, description: aciklama, name: file },
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 160 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: aciklama, italics: true, color: "555555", size: 18 }),
      ],
    }),
  ];
}

// ---------------- Yardımcı fonksiyonlar ----------------
function p(children, opts = {}) {
  return new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: 120 }, ...opts });
}
function t(text, opts = {}) {
  return new TextRun({ text, ...opts });
}
function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32, color: "1F3864" })],
  });
}
function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true, size: 26, color: "2E74B5" })],
  });
}
function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, color: "5B7D9B" })],
  });
}
function bodyPara(runs, opts = {}) {
  return new Paragraph({ spacing: { after: 120, line: 300 }, ...opts,
    children: Array.isArray(runs) ? runs : [runs] });
}
function ekranPlaceholder(no, aciklama) {
  return new Paragraph({
    spacing: { before: 100, after: 100 },
    alignment: AlignmentType.CENTER,
    border: {
      top: { style: BorderStyle.SINGLE, size: 6, color: "888888" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "888888" },
      left: { style: BorderStyle.SINGLE, size: 6, color: "888888" },
      right: { style: BorderStyle.SINGLE, size: 6, color: "888888" },
    },
    children: [
      new TextRun({ text: `[Ekran Görüntüsü ${no}]`, bold: true, italics: true, color: "555555", size: 22 }),
      new TextRun({ text: `  ·  ${aciklama}`, italics: true, color: "666666", size: 20 }),
    ],
  });
}

function cell(text, opts = {}) {
  const { bold = false, bg, width = 2000, align = "left", size = 20, colSpan } = opts;
  // Koyu arka planlı hücrelerde metin rengini otomatik beyaz yap (okunabilirlik)
  let color = opts.color;
  if (!color && bg && (bg === "1F3864" || bg === "2E74B5")) color = "FFFFFF";
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: colSpan,
    shading: bg ? { type: ShadingType.CLEAR, color: "auto", fill: bg } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: align === "right" ? AlignmentType.RIGHT : (align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT),
      children: [new TextRun({ text, bold, size, color })],
    })],
  });
}
function headCell(text, width, align = "left") {
  return cell(text, { bold: true, bg: "1F3864", width, align, color: "FFFFFF", size: 20 });
}

function tableRow(cells) {
  return new TableRow({ children: cells });
}

// ---------------- Rapor içeriği ----------------
const children = [];

// Kapak
children.push(new Paragraph({ spacing: { before: 2400 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "FLYWORK", bold: true, size: 56, color: "1F3864" })],
}));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 },
  children: [new TextRun({ text: "PRİM RAPORU", bold: true, size: 44, color: "1F3864" })],
}));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 },
  children: [new TextRun({ text: "Arcon Mayıs 2026 Prim Çalışma İncelemesi", size: 28, color: "555555", italics: true })],
}));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
  children: [new TextRun({ text: "Hazırlayan", size: 22, color: "666666" })],
}));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
  children: [new TextRun({ text: "Sena Özyiğit", bold: true, size: 28, color: "1F3864" })],
}));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
  children: [new TextRun({ text: "Temmuz 2026", size: 22, color: "666666" })],
}));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ---------------- Yönetici Özeti ----------------
children.push(heading1("Yönetici Özeti"));

children.push(bodyPara([
  t("Bu rapor, Arcon'un Mayıs 2026 dönemine ait "),
  t("Arcon Prim Çalışma Dosyalar_24062026.xlsx", { italics: true }),
  t(" dosyası üzerinde yürütülen sistematik incelemenin bulgularını içermektedir. İnceleme; Prim Tablosu'nda tanımlı kurallarla, Prim Çalışma sayfalarında hesaplanan primlerin karşılığının tutarlı olup olmadığını değerlendirmiştir."),
]));

children.push(bodyPara(t("İnceleme sonucunda altı ana konu tespit edilmiştir:", { bold: true })));

children.push(bodyPara([
  t("1) ", { bold: true }),
  t("Sellout eşleşmesi olmayan satırlara, mağaza müdürü beyanına dayanan tutarların eklenmesi. ", { bold: true }),
  t("Prim Çalışma Satış primleri sayfasında bazı satırlarda \"Prime Esas Birim Ciro\" formülüne sabit tutarlar yazılmıştır. Bu tutarlar sellout kaynağından üretilmemekte; uygulamada mağaza müdürlerinin sözlü / operasyonel beyanlarının prim hesabına yansıtılması amacıyla eklenmektedir. Sorumluluk, beyanı sağlayan mağaza yönetiminde ve bu beyanın doğrulanmadan Excel'e işlenmesinde toplanır."),
]));

children.push(bodyPara([
  t("2) ", { bold: true }),
  t("Prim Çalışma pivot sayfasındaki bonus kolonlarının koşul denetimi yapmadan hesaplanması. ", { bold: true }),
  t("Prim Çalışma2_Sıralamalar sayfasındaki Hedef Primi, Dior Sıralama Primleri ve LP Mağaza Primleri kolonları, Prim Tablosu'nda tanımlı koşulları (\"hedef tutarsa\", \"ilk 2'de olursa\", \"1.'de olursa\") denetlemeden her satıra uygulanabilmektedir."),
]));

children.push(bodyPara([
  t("3) ", { bold: true }),
  t("İptal işlemlerinin satır bazlı uygulanması. ", { bold: true }),
  t("Bazı satırların \"Prim Hesaplanan Adet\" formülleri elle sıfırlanmıştır. Aynı iş koşuluna sahip diğer satırlarda böyle bir işlem bulunmayabilir. Bu durum kararların merkezi bir kural yerine satır bazlı değerlendirmelerle alındığını göstermektedir."),
]));

children.push(bodyPara([
  t("4) ", { bold: true }),
  t("Uzman master listesinde tanımlı olmayan kişilere prim satırı açılması. ", { bold: true }),
  t("Uzman-Mağaza-Grup master listesinde kaydı bulunmayan bazı kişilere Prim Çalışma sayfasında satır açılarak prim hesaplanmıştır. Bu da atama sürecinin Excel dışında yürütülebildiğini gösterir."),
]));

children.push(bodyPara([
  t("5) ", { bold: true }),
  t("Zeops beyanları ile sellout adetlerinin her zaman çakışmaması. ", { bold: true }),
  t("Bir uzmanın belirli bir mağaza × ürün için Zeops'a girdiği toplam adet, mağazanın sellout kaydındaki adetten fazla olabilmektedir. Bu farkın bir kısmı Zeops erişim kesintisi veya mağaza yönetimi tarafından yapılan toplu aktarımlardan kaynaklanabilir; Excel dosyası ise sellout kalanıyla otomatik sınırlama uygulamaz."),
]));

children.push(bodyPara([
  t("6) ", { bold: true }),
  t("Prim hesabının mağaza yönetimi beyanlarıyla iç içe yürütülmesi. ", { bold: true }),
  t("Ortak payda şudur: Excel dosyası yalnızca otomatik kural motoru gibi çalışmamakta; mağaza müdürlerinin sağladığı beyanlar da hesabın parçası haline gelmektedir. Bu nedenle dönem sonu prim tutarının hangi kısmının sellout'tan, hangi kısmının mağaza beyanından geldiğini ayırmak mevcut dosyada zordur."),
]));

children.push(bodyPara([
  t("Bu rapor, örnek satırlar üzerinden yukarıdaki konuları Excel ekran görüntüleriyle belgelemektedir. Amaç kişileri suçlamak değil; beyan kaynağını (mağaza yönetimi) ve sistem tasarımındaki doğrulama boşluğunu görünür kılmaktır."),
]));

// ---------------- Yöntem ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1("İnceleme Yöntemi"));

children.push(bodyPara([
  t("İnceleme Excel dosyasının şu sayfaları üzerinde yapılmıştır:"),
]));

const yontemMaddeleri = [
  ["Prim Tablosu", "Her prim bölümü için tanımlı kural setleri (satış primi oranı, sıralama koşulları, hedef primi, kümül primi vb.)"],
  ["Uzman-Mağaza-Grup", "Uzmanların atandığı mağaza ve marka grubu master verisi"],
  ["Mayıs Sell-out Data", "Mağazaların Mayıs 2026 dönemi resmi ciro ve adet verileri"],
  ["Mayıs Sıralama", "Marka × mağaza × çeşit (parfüm/makyaj/cilt/mağaza toplamı) bazında sıralama verileri"],
  ["Mayıs Hedef", "Mağaza × marka bazında dönem satış hedefleri"],
  ["Mayıs Zeops Ham Data", "Uzmanların beyan ettiği satış işlemleri"],
  ["Prim Çalışma Satış primleri", "Zeops beyanlarının Prime Esas hesabına dönüştürüldüğü ana hesap sayfası"],
  ["Prim Çalışma2_Sıralamalar", "Uzman × mağaza pivot toplamları, tüm bonus kolonlarıyla birlikte"],
];
for (const [ad, aciklama] of yontemMaddeleri) {
  children.push(bodyPara([
    t("• "),
    t(ad, { bold: true }),
    t(" — " + aciklama),
  ]));
}

children.push(bodyPara([
  t("Bulgular, tüm iddialar Excel'in kendi sayfalarındaki değerlerle karşılaştırılarak doğrulanmıştır. Rapordaki her sayısal iddia, aynı Excel dosyası açıldığında ilgili hücreye ve formüle gidilerek teyit edilebilir."),
]));

// ---------------- BÖLÜM 1: MAĞAZA MÜDÜRÜ BEYANI (Nurgül) ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1("Bulgu 1 — Mağaza Müdürü Beyanına Dayanan Tutar Eklemesi"));
children.push(heading2("Örnek: Nurgül Kesgün / SEPHORA KANYON / Dior"));

children.push(bodyPara([
  t("Bu bölümdeki örnek, uzmana yönelik bir eleştiri değildir. Satırda görülen tutar, sellout verisinden üretilmemiş; uygulamada "),
  t("mağaza müdürlerinin sözlü / operasyonel beyanlarının", { bold: true }),
  t(" prim hesabına yansıtılması amacıyla formüle eklenmiştir. Beyanın doğruluğu ve kaynağı mağaza yönetiminin sorumluluğundadır; Excel dosyası bu beyanı bağımsız sellout kaydıyla doğrulamadan kabul etmektedir."),
]));

children.push(heading3("Uzman ve Mağaza Bilgisi"));
children.push(bodyPara([t("• Uzman: "), t("Nurgül Kesgün", { bold: true })]));
children.push(bodyPara([t("• Mağaza: "), t("SEPHORA KANYON", { bold: true })]));
children.push(bodyPara([t("• Marka Grubu: "), t("Dior", { bold: true })]));

children.push(heading3("Formül Kontrolü"));
children.push(bodyPara([
  t("Prim Çalışma Satış primleri sayfasında 242. satırdaki "),
  t("Prime Esas Birim Ciro (AF242)", { bold: true }),
  t(" hücresinin formülü incelendiğinde, standart birim ciro hesabının yanına sabit bir tutarın eklendiği görülmektedir."),
]));

children.push(bodyPara([t("Standart formül yapısı:", { bold: true })]));
children.push(bodyPara(t("=EĞERHATA(AE242/AD242;\"0\")", { font: "Consolas", color: "555555" })));

children.push(bodyPara([t("Dosyadaki mevcut formül:", { bold: true })]));
children.push(bodyPara(t("=EĞERHATA(AE242/AD242;\"0\")+1920000", { font: "Consolas", color: "2E74B5" })));

children.push(bodyPara([
  t("Formülün sonundaki "),
  t("+1920000", { bold: true }),
  t(" ifadesi, sellout kaynaklı birim ciro hesabına 1.920.000 TL eklemektedir. Aynı satırda Sell-Out Adet (AD) ve Mağaza KDV Hariç Ciro (AE) hücreleri boştur; yani tutar sellout eşleşmesinden gelmemektedir. Bu tutarın kaynağı, mağaza müdürü beyanının Excel'e işlenmesidir."),
]));

children.push(...ekranGorsel(
  "01_af242_formul.png",
  "Görsel 1 — AF242 formül çubuğu: =EĞERHATA(AE242/AD242;\"0\")+1920000 (mağaza müdürü beyanına dayanan sabit tutar)"
));

children.push(heading3("Hesaba Yansıması"));
children.push(bodyPara([
  t("Aynı satırda %1 satış primi formülü standarttır (AG × %1). Yani oran kuralı doğrudur; fark, oran uygulanmadan önce tabanın mağaza beyanıyla yükseltilmiş olmasından kaynaklanır."),
]));

const tbl1 = new Table({
  width: { size: 8000, type: WidthType.DXA },
  columnWidths: [3000, 2500, 2500],
  rows: [
    tableRow([
      cell("Hücre", { bold: true, bg: "1F3864", width: 3000, align: "left", size: 20 }),
      cell("Değer", { bold: true, bg: "1F3864", width: 2500, align: "right", size: 20 }),
      cell("Kaynak", { bold: true, bg: "1F3864", width: 2500, align: "center", size: 20 }),
    ]),
    tableRow([
      cell("AD242 / AE242 — Sellout adet / ciro", { width: 3000 }),
      cell("Boş", { width: 2500, align: "right" }),
      cell("Sellout eşleşmesi yok", { width: 2500, align: "center", size: 16 }),
    ]),
    tableRow([
      cell("AF242 — Prime Esas Birim Ciro", { width: 3000 }),
      cell("1.920.000,00 TL", { width: 2500, align: "right" }),
      cell("Mağaza müdürü beyanı", { width: 2500, align: "center", size: 16 }),
    ]),
    tableRow([
      cell("AG242 — Prime Esas Toplam Tutar", { width: 3000 }),
      cell("1.920.000,00 TL", { width: 2500, align: "right" }),
      cell("AF × prim adet", { width: 2500, align: "center" }),
    ]),
    tableRow([
      cell("AH242 — Prim %1", { width: 3000, bold: true }),
      cell("19.200,00 TL", { width: 2500, align: "right", bold: true }),
      cell("AG × %1 (standart oran)", { width: 2500, align: "center", size: 16 }),
    ]),
  ],
});
children.push(tbl1);
children.push(bodyPara(t(" ")));

children.push(...ekranGorsel(
  "02_af242_sonuc.png",
  "Görsel 2 — 242. satır: AD/AE boş; AF ve AG 1.920.000 TL; AH 19.200 TL satış primi"
));

children.push(...ekranGorsel(
  "03_ah242_yuzde1.png",
  "Görsel 3 — AH242 formülü =+$AG242*0,01 (oran doğru; taban mağaza beyanından geliyor)"
));

children.push(bodyPara([
  t("Aynı uzmanın SEPHORA KANYON'daki diğer satırlarında birim ciro çoğunlukla boş / sıfırdır; çünkü ilgili ürünlerin sellout eşleşmesi yoktur. 242. satırda ise mağaza müdürü beyanına dayanan tutar sayesinde prime esas üretilmiş ve prim hesabına girmiştir."),
]));

children.push(heading3("Hedef Kaydıyla Karşılaştırma"));
children.push(bodyPara([
  t("Mayıs Hedef sayfasında SEPHORA KANYON × DIOR için tanımlı revize hedef "),
  t("1.058.966 TL", { bold: true }),
  t(" seviyesindedir. Formüle eklenen 1.920.000 TL, bu hedefin üzerindedir. Bu karşılaştırma, eklenen tutarın sellout / hedef tablosundan otomatik gelmediğini; mağaza beyanının ayrı bir girdi olarak işlendiğini gösterir."),
]));

children.push(...ekranGorsel(
  "05_mayis_hedef_kanyon.png",
  "Görsel 4 — Mayıs Hedef: SEPHORA KANYON × DIOR revize hedef 1.058.966 TL"
));

children.push(heading3("Bonus Kolonlarında Zincir Etki"));

children.push(bodyPara([
  t("Prim Çalışma2_Sıralamalar pivotunda, birim ciro üzerinden yalnızca satış primi değil; hedef ve sıralama bonus kolonları da Prime Esas Toplam üzerinden çarpım uygular. Bu nedenle mağaza müdürü beyanıyla yükselen taban, birden fazla prim kalemini etkiler."),
]));

children.push(...ekranGorsel(
  "04_pivot_bos_satirlar.png",
  "Görsel 5 — Prim Çalışma2_Sıralamalar: bazı satırlarda marka/mağaza boş olsa da Prime Esas ve Prim %1 dolu (beyan kaynaklı satırlar)"
));

const tbl2 = new Table({
  width: { size: 9000, type: WidthType.DXA },
  columnWidths: [3500, 2000, 3500],
  rows: [
    tableRow([
      cell("Kalem", { bold: true, bg: "1F3864", width: 3500 }),
      cell("Verilen Tutar", { bold: true, bg: "1F3864", width: 2000, align: "right" }),
      cell("Formül", { bold: true, bg: "1F3864", width: 3500, align: "center" }),
    ]),
    tableRow([
      cell("Prime Esas Toplam", { width: 3500 }),
      cell("2.000.806 TL", { width: 2000, align: "right" }),
      cell("Tüm satırlar (1.920.000 beyan + 80.806 diğer)", { width: 3500, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Prim %1 (Satış)", { width: 3500 }),
      cell("20.008 TL", { width: 2000, align: "right" }),
      cell("Prime Esas × %1", { width: 3500, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Hedef Prim %0,5", { width: 3500 }),
      cell("10.004 TL", { width: 2000, align: "right" }),
      cell("Prime Esas × %0,5 (koşul denetimi yok)", { width: 3500, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Dior Mağaza 1.Lik %0,5", { width: 3500 }),
      cell("10.004 TL", { width: 2000, align: "right" }),
      cell("Prime Esas × %0,5 (koşulsuz)", { width: 3500, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Dior Makyaj 1.lik %0,33", { width: 3500 }),
      cell("6.603 TL", { width: 2000, align: "right" }),
      cell("Prime Esas × %0,33 (koşulsuz)", { width: 3500, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Dior Parfüm İlk 2 %0,33", { width: 3500 }),
      cell("6.603 TL", { width: 2000, align: "right" }),
      cell("Prime Esas × %0,33 (koşulsuz)", { width: 3500, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Dior Cilt Bakım İlk 3 %0,33", { width: 3500 }),
      cell("6.803 TL", { width: 2000, align: "right" }),
      cell("Prime Esas × %0,33 (koşulsuz)", { width: 3500, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("TOPLAM PRİM", { width: 3500, bold: true, bg: "FFE699" }),
      cell("~60.025 TL", { width: 2000, align: "right", bold: true, bg: "FFE699" }),
      cell("", { width: 3500, bg: "FFE699" }),
    ]),
  ],
});
children.push(tbl2);
children.push(bodyPara(t(" ")));

children.push(heading3("Sıralama ve Hedef Koşullarının Durumu"));

children.push(bodyPara([
  t("Prim Tablosu'nda Dior bölümü için tanımlı kurallar:"),
]));
const diorKurallar = [
  ["Satılan ürün başına", "%1", "Koşulsuz"],
  ["Cilt İlk 3", "%0,33", "Cilt bakım sıralamasında ilk 3'te olma"],
  ["Parfüm ilk 2", "%0,33", "Parfüm sıralamasında ilk 2'de olma"],
  ["Makyak ilk 1", "%0,33", "Makyaj sıralamasında 1. olma"],
  ["Hedef tutarsa", "%0,50", "Mağaza × marka ciro hedefinin gerçekleştirilmesi"],
  ["Mağaza 1.ci ise", "%0,50", "Mağaza toplam sıralamasında 1. olma"],
];
const tblDior = new Table({
  width: { size: 9000, type: WidthType.DXA },
  columnWidths: [3000, 1500, 4500],
  rows: [
    tableRow([
      cell("Kural", { bold: true, bg: "1F3864", width: 3000 }),
      cell("Oran", { bold: true, bg: "1F3864", width: 1500, align: "center" }),
      cell("Koşul", { bold: true, bg: "1F3864", width: 4500 }),
    ]),
    ...diorKurallar.map(([k, o, s]) => tableRow([
      cell(k, { width: 3000 }),
      cell(o, { width: 1500, align: "center" }),
      cell(s, { width: 4500 }),
    ])),
  ],
});
children.push(tblDior);
children.push(bodyPara(t(" ")));

children.push(bodyPara([
  t("SEPHORA KANYON × DIOR için Mayıs Sıralama sayfasında kayıt bulunmamaktadır (benzer kayıt BOYNER KANYON × DIOR'dur). Mayıs Sell-out'ta aynı mağaza × marka toplamı yaklaşık "),
  t("937.576 TL", { bold: true }),
  t(" olup hedef (1.058.966 TL) altında kalmaktadır. Buna rağmen pivot bonus kolonları koşul denetimi yapmadan tutar üretebilmektedir."),
]));

children.push(heading3("Özet Değerlendirme"));

const tblKural = new Table({
  width: { size: 9000, type: WidthType.DXA },
  columnWidths: [2500, 2000, 2500, 2000],
  rows: [
    tableRow([
      cell("Prim Kalemi", { bold: true, bg: "1F3864", width: 2500 }),
      cell("Verilen", { bold: true, bg: "1F3864", width: 2000, align: "right" }),
      cell("Kural Şartı", { bold: true, bg: "1F3864", width: 2500 }),
      cell("Gözlem", { bold: true, bg: "1F3864", width: 2000, align: "center" }),
    ]),
    tableRow([
      cell("Satış %1", { width: 2500 }),
      cell("20.008 TL", { width: 2000, align: "right" }),
      cell("Koşulsuz", { width: 2500 }),
      cell("Tabanın 1.920.000 TL'si mağaza müdürü beyanı", { width: 2000, align: "center", size: 16 }),
    ]),
    tableRow([
      cell("Hedef %0,5", { width: 2500 }),
      cell("10.004 TL", { width: 2000, align: "right" }),
      cell("Hedef tutarsa", { width: 2500 }),
      cell("Hedef tutmamış (937.576 < 1.058.966)", { width: 2000, align: "center", size: 16 }),
    ]),
    tableRow([
      cell("Dior Mağaza 1.Lik %0,5", { width: 2500 }),
      cell("10.004 TL", { width: 2000, align: "right" }),
      cell("Mağaza sıralamada 1.", { width: 2500 }),
      cell("Sıralama verisi yok", { width: 2000, align: "center", size: 16 }),
    ]),
    tableRow([
      cell("Dior Makyaj 1.lik %0,33", { width: 2500 }),
      cell("6.603 TL", { width: 2000, align: "right" }),
      cell("Makyaj sıralamada 1.", { width: 2500 }),
      cell("Sıralama verisi yok", { width: 2000, align: "center", size: 16 }),
    ]),
    tableRow([
      cell("Dior Parfüm İlk 2 %0,33", { width: 2500 }),
      cell("6.603 TL", { width: 2000, align: "right" }),
      cell("Parfüm sıralamada ilk 2", { width: 2500 }),
      cell("Sıralama verisi yok", { width: 2000, align: "center", size: 16 }),
    ]),
    tableRow([
      cell("Dior Cilt İlk 3 %0,33", { width: 2500 }),
      cell("6.803 TL", { width: 2000, align: "right" }),
      cell("Cilt sıralamada ilk 3", { width: 2500 }),
      cell("Sıralama verisi yok", { width: 2000, align: "center", size: 16 }),
    ]),
  ],
});
children.push(tblKural);
children.push(bodyPara(t(" ")));

children.push(bodyPara([
  t("Prime esas üzerindeki 1.920.000 TL'lik mağaza müdürü beyanı çıkarıldığında, sellout eşleşmesinden gelen Dior prime esas yaklaşık "),
  t("80.806 TL", { bold: true }),
  t(" seviyesindedir. Bu tutar üzerinden yalnızca satış primi:"),
]));
children.push(bodyPara(t("80.806 TL × %1 = 808 TL", { font: "Consolas", bold: true })));

children.push(bodyPara([
  t("Excel dosyası aynı uzman için Mayıs 2026'da yaklaşık "),
  t("60.025 TL", { bold: true }),
  t(" toplam prim hesaplamıştır. Aradaki fark ~"),
  t("59.217 TL", { bold: true }),
  t(". Bunun yaklaşık 19.200 TL'si 242. satırdaki mağaza müdürü beyanından; kalanı bonus kolonlarının koşul denetimi yapmadan çalışmasından gelmektedir. Sorumluluk zinciri: beyanı sağlayan mağaza yönetimi → beyanı doğrulamadan Excel'e işleyen süreç."),
]));

// ---------------- BÖLÜM 2: KOŞULSUZ OTOMATİK (Ayşe Nilay) ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1("Bulgu 2 — Bonus Kolonlarında Koşul Denetimi Yapılmayan Hesaplama"));
children.push(heading2("Örnek: Ayşe Nilay Kirişçi / Boyner İzmir Hilltown + Boyner İzmir İstinye Park / Dior"));

children.push(bodyPara([
  t("Bulgu 1, mağaza müdürü beyanına dayanan bir tutar eklemesini göstermektedir. Ayşe Nilay Kirişçi örneği ise "),
  t("böyle bir sabit tutar eklemesi olmasa da", { bold: true, italics: true }),
  t(" bonus kolonlarının sıralama / hedef şartını denetlemeden otomatik tutar üretebildiğini gösterir."),
]));

children.push(heading3("Uzman Master Bilgisi"));
children.push(bodyPara([t("Uzman-Mağaza-Grup sayfasına göre Ayşe Nilay Kirişçi iki mağazada Dior grup atamasına sahiptir:")]));
children.push(bodyPara([t("• "), t("BOYNER İZMİR HİLLTOWN", { bold: true }), t(" — Dior")]));
children.push(bodyPara([t("• "), t("BOYNER İZMİR İSTİNYE PARK", { bold: true }), t(" — Dior")]));

children.push(ekranPlaceholder(8, "Uzman-Mağaza-Grup — Ayşe Nilay Kirişçi'nin iki Dior ataması"));

children.push(heading3("Sıralama Gerçekleri"));

children.push(bodyPara([t("Mayıs Sıralama sayfasında ilgili mağaza × marka kombinasyonları için kayıtlı sıralamalar aşağıdaki gibidir:")]));

children.push(bodyPara(t("BOYNER İZMİR HİLLTOWN × DIOR", { bold: true })));
const siralamaHilltown = new Table({
  width: { size: 9000, type: WidthType.DXA },
  columnWidths: [2500, 1500, 2500, 2500],
  rows: [
    tableRow([
      cell("Çeşit", { bold: true, bg: "1F3864", width: 2500 }),
      cell("Sırası", { bold: true, bg: "1F3864", width: 1500, align: "center" }),
      cell("Dior Kural Şartı", { bold: true, bg: "1F3864", width: 2500 }),
      cell("Şartı Sağlıyor mu?", { bold: true, bg: "1F3864", width: 2500, align: "center" }),
    ]),
    tableRow([cell("0-Mağaza", { width: 2500 }), cell("2.", { width: 1500, align: "center" }), cell("1. olması", { width: 2500 }), cell("Hayır", { width: 2500, align: "center", bold: true })]),
    tableRow([cell("1-Parfüm", { width: 2500 }), cell("3.", { width: 1500, align: "center" }), cell("İlk 2'de olması", { width: 2500 }), cell("Hayır", { width: 2500, align: "center", bold: true })]),
    tableRow([cell("2-Makyaj", { width: 2500 }), cell("2.", { width: 1500, align: "center" }), cell("1. olması", { width: 2500 }), cell("Hayır", { width: 2500, align: "center", bold: true })]),
    tableRow([cell("3-Cilt Bakım", { width: 2500 }), cell("5.", { width: 1500, align: "center" }), cell("İlk 3'te olması", { width: 2500 }), cell("Hayır", { width: 2500, align: "center", bold: true })]),
  ],
});
children.push(siralamaHilltown);
children.push(bodyPara(t(" ")));

children.push(bodyPara(t("BOYNER İZMİR İSTİNYE PARK × DIOR", { bold: true })));
const siralamaIstinye = new Table({
  width: { size: 9000, type: WidthType.DXA },
  columnWidths: [2500, 1500, 2500, 2500],
  rows: [
    tableRow([
      cell("Çeşit", { bold: true, bg: "1F3864", width: 2500 }),
      cell("Sırası", { bold: true, bg: "1F3864", width: 1500, align: "center" }),
      cell("Dior Kural Şartı", { bold: true, bg: "1F3864", width: 2500 }),
      cell("Şartı Sağlıyor mu?", { bold: true, bg: "1F3864", width: 2500, align: "center" }),
    ]),
    tableRow([cell("0-Mağaza", { width: 2500 }), cell("3.", { width: 1500, align: "center" }), cell("1. olması", { width: 2500 }), cell("Hayır", { width: 2500, align: "center", bold: true })]),
    tableRow([cell("1-Parfüm", { width: 2500 }), cell("5.", { width: 1500, align: "center" }), cell("İlk 2'de olması", { width: 2500 }), cell("Hayır", { width: 2500, align: "center", bold: true })]),
    tableRow([cell("2-Makyaj", { width: 2500 }), cell("2.", { width: 1500, align: "center" }), cell("1. olması", { width: 2500 }), cell("Hayır", { width: 2500, align: "center", bold: true })]),
    tableRow([cell("3-Cilt Bakım", { width: 2500 }), cell("6.", { width: 1500, align: "center" }), cell("İlk 3'te olması", { width: 2500 }), cell("Hayır", { width: 2500, align: "center", bold: true })]),
  ],
});
children.push(siralamaIstinye);
children.push(bodyPara(t(" ")));

children.push(bodyPara([t("Her iki mağazada da hiçbir Dior kural şartı sağlanmamaktadır.")]));

children.push(ekranPlaceholder(9, "Mayıs Sıralama — Boyner İzmir Hilltown/İstinye Park × Dior sıralamaları"));

children.push(heading3("Excel'in Verdiği Primler"));

children.push(bodyPara([t("Sıralama şartları sağlanmadığı halde, Prim Çalışma2 pivot sayfasında Ayşe Nilay Kirişçi'ye tüm Dior bonusları hesaplanarak verilmiştir:")]));

const anilTbl = new Table({
  width: { size: 9500, type: WidthType.DXA },
  columnWidths: [3200, 1800, 1800, 2700],
  rows: [
    tableRow([
      cell("Kalem", { bold: true, bg: "1F3864", width: 3200 }),
      cell("Hilltown", { bold: true, bg: "1F3864", width: 1800, align: "right" }),
      cell("İstinye Park", { bold: true, bg: "1F3864", width: 1800, align: "right" }),
      cell("Kural Durumu", { bold: true, bg: "1F3864", width: 2700, align: "center" }),
    ]),
    tableRow([
      cell("Prime Esas", { width: 3200 }),
      cell("642.653 TL", { width: 1800, align: "right" }),
      cell("233.517 TL", { width: 1800, align: "right" }),
      cell("Gerçek satıştan hesaplanmış", { width: 2700, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Prim %1", { width: 3200 }),
      cell("6.427 TL", { width: 1800, align: "right" }),
      cell("2.335 TL", { width: 1800, align: "right" }),
      cell("Koşulsuz kural, tutar doğru", { width: 2700, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Hedef Prim %0,5", { width: 3200 }),
      cell("3.213 TL", { width: 1800, align: "right" }),
      cell("1.168 TL", { width: 1800, align: "right" }),
      cell("Hedef tutmuyor", { width: 2700, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Dior Mağaza 1.Lik %0,5", { width: 3200 }),
      cell("3.213 TL", { width: 1800, align: "right" }),
      cell("1.168 TL", { width: 1800, align: "right" }),
      cell("Mağaza sıralamada 2. / 3.", { width: 2700, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Dior Makyaj 1.lik %0,33", { width: 3200 }),
      cell("2.121 TL", { width: 1800, align: "right" }),
      cell("—", { width: 1800, align: "right" }),
      cell("Makyaj sıralamada 2.", { width: 2700, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Dior Parfüm İlk 2 %0,33", { width: 3200 }),
      cell("2.121 TL", { width: 1800, align: "right" }),
      cell("—", { width: 1800, align: "right" }),
      cell("Parfüm sıralamada 3. / 5.", { width: 2700, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("Dior Cilt Bakım İlk 3 %0,33", { width: 3200 }),
      cell("2.185 TL", { width: 1800, align: "right" }),
      cell("—", { width: 1800, align: "right" }),
      cell("Cilt sıralamada 5. / 6.", { width: 2700, align: "center", size: 18 }),
    ]),
    tableRow([
      cell("TOPLAM", { width: 3200, bold: true, bg: "FFE699" }),
      cell("19.279 TL", { width: 1800, align: "right", bold: true, bg: "FFE699" }),
      cell("4.670 TL", { width: 1800, align: "right", bold: true, bg: "FFE699" }),
      cell("İki mağaza toplam: 23.950 TL", { width: 2700, align: "center", bold: true, bg: "FFE699" }),
    ]),
  ],
});
children.push(anilTbl);
children.push(bodyPara(t(" ")));

children.push(ekranPlaceholder(10, "Prim Çalışma2 — Ayşe Nilay Kirişçi'nin iki mağaza satırı ve toplam"));

children.push(heading3("Değerlendirme"));

children.push(bodyPara([
  t("Ayşe Nilay Kirişçi durumunda, Bulgu 1'de görülen türde bir manuel formül müdahalesi bulunmamaktadır. Ancak Prim Çalışma pivot sayfasındaki bonus kolonlarının formülleri "),
  t("=+E×oran", { font: "Consolas" }),
  t(" şeklindedir ve sıralama şartını denetlememektedir. Bu nedenle sıralamada Dior kural şartlarını sağlamayan mağaza × marka kombinasyonlarına da tüm bonuslar otomatik olarak uygulanmaktadır."),
]));

children.push(bodyPara([
  t("Ayşe Nilay Kirişçi'nin Dior bölümü kurallarına göre yalnızca satılan ürün başına primi hakkedilmektedir:"),
]));
children.push(bodyPara(t("876.170 TL (Toplam Prime Esas) × %1 = 8.762 TL", { font: "Consolas", bold: true })));

children.push(bodyPara([
  t("Excel dosyası ise iki mağaza toplamı olarak "),
  t("23.950 TL", { bold: true }),
  t(" prim hesaplamıştır. Aradaki fark "),
  t("~15.188 TL", { bold: true }),
  t(". Bu fark, bonus kolonlarının sıralama şartını denetlemeden uyguladığı otomatik çarpımlardan kaynaklanmaktadır."),
]));

// ---------------- BULGU 3: MASTER LİSTEDE OLMAYAN UZMANLAR ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1("Bulgu 3 — Uzman Master Listesinde Bulunmayan Kişilere Prim Tahakkuku"));
children.push(heading2("Örnek: Nursu Tamcı / BEYMEN ZORLU"));

children.push(bodyPara([
  t("Prim hesaplama sürecinin başlangıç noktası, bir dönemde hangi uzmanın hangi mağazada, hangi marka grubunun sorumlusu olduğunu tanımlayan "),
  t("Uzman-Mağaza-Grup", { italics: true }),
  t(" master listesidir. Bu liste, prim kurallarının doğru uzmana ve doğru bölüme uygulanabilmesi için kritik bir referans kaynağıdır."),
]));

children.push(bodyPara([
  t("Yapılan incelemede, Uzman-Mağaza-Grup listesinde tanımlı olmadığı halde Prim Çalışma Satış primleri sayfasında satırları bulunan ve Prim Çalışma2 pivotunda prim tahakkuk ettirilen kişiler tespit edilmiştir. Örnek olarak "),
  t("Nursu Tamcı", { bold: true }),
  t(" adlı uzman incelenmiştir."),
]));

children.push(heading3("Master Kontrol"));
children.push(bodyPara([
  t("Uzman-Mağaza-Grup sayfasında \"Nursu\" araması yapıldığında sonuç bulunmamaktadır. Yani sistemin resmi uzman atamalarında bu kişi yer almamaktadır."),
]));
children.push(ekranPlaceholder(11, "Uzman-Mağaza-Grup — \"Nursu\" araması sonuç vermez"));

children.push(heading3("Zeops Beyanları"));
children.push(bodyPara([
  t("Aynı dönem Zeops Ham Data sayfasında Nursu Tamcı adına 57 satış işlemi kaydı bulunmaktadır. Bu beyanlar dört farklı mağazaya dağılmaktadır: BEYMEN BEAUTY NİŞANTAŞI CITYS (27 adet), BEYMEN ZORLU (26 adet), BEYMEN TERSANE (5 adet), SEPHORA MALL OF İSTANBUL (3 adet)."),
]));

children.push(heading3("Prim Çalışma Kaydı"));
children.push(bodyPara([
  t("Master listede tanımlı olmamasına rağmen, Prim Çalışma Satış primleri sayfasının 3606. satırında Nursu Tamcı için BEYMEN ZORLU adına bir kayıt açılmıştır. Bu satırdaki \"Prime Esas Birim Ciro\" hücresinin formülü şu şekildedir:"),
]));
children.push(bodyPara(t("=EĞERHATA(AE3606/AD3606;\"0\")+300000", { font: "Consolas", color: "2E74B5" })));

children.push(bodyPara([
  t("Yani formüle 300.000 TL sabit değer eklenerek prime esas oluşturulmuştur. Prim Çalışma2 pivotunda Nursu Tamcı için toplam prim yaklaşık 4.500 TL olarak tahakkuk ettirilmiştir."),
]));
children.push(ekranPlaceholder(12, "Prim Çalışma Satış primleri — Nursu Tamcı Row 3606 formülü"));

children.push(heading3("Değerlendirme"));
children.push(bodyPara([
  t("Master listede bulunmayan bir kişiye, doğrudan formüle sabit değer eklenerek prim tahakkuk ettirilmesi, prim sürecinin master veriden bağımsız işleyebildiğini göstermektedir. Uzman tanımlama akışının merkezi bir kural setine bağlı olmadığı bu durum, aynı yaklaşımın diğer 21 kişi için de tekrarlandığı yapılan tarama ile doğrulanmıştır (toplam 22 kişi, Zeops'ta beyanları var ancak master listede kayıtlı değil)."),
]));

// ---------------- BULGU 4: ZEOPS ERİŞİM KESİNTİLERİ VE MANUEL AKTARIM ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1("Bulgu 4 — Zeops Beyanlarının Sellout Verisinden Bağımsız Aktarılması"));

children.push(bodyPara([
  t("Prim hesabının iki temel veri kaynağı vardır: uzmanın işlem anında Zeops sistemine girdiği beyanlar ve mağazanın resmî satışlarını yansıtan sellout verileri. Sağlıklı bir hesap için bu iki kaynağın birbirini doğrulaması beklenir."),
]));

children.push(bodyPara([
  t("Yapılan tarama sonucunda, bir uzmanın belirli bir mağaza × ürün için Zeops'a girdiği toplam adedin, aynı mağazanın sellout kaydındaki gerçek satış adedinden fazla olduğu "),
  t("4.313 satır", { bold: true }),
  t(" tespit edilmiştir. Bu satırlar 235 uzmanı ve toplam "),
  t("6.393 fazla adet", { bold: true }),
  t(" beyanı kapsamaktadır. Yalnızca %1 satış primi üzerinden hesaplanan tutar "),
  t("127.811 TL", { bold: true }),
  t(" olarak bulunmaktadır."),
]));

children.push(heading3("Olası Süreç Nedenleri"));
children.push(bodyPara([
  t("Zeops sisteminin uzmanlar tarafından her işlem anında erişilebilir olmadığı, günün yoğun saatlerinde sistem yavaşlığı veya kesintisi yaşanabildiği bilinmektedir. Bu durumlarda:"),
]));
children.push(bodyPara([
  t("• Uzmanlar satış anında beyan girişi yapamayabilir; sonradan (dönem sonu, gün sonu gibi) topluca aktarabilir."),
]));
children.push(bodyPara([
  t("• Mağaza yönetimi, uzmanın Zeops'a giremediği satışları toplayarak dönem içinde sisteme aktarabilir."),
]));
children.push(bodyPara([
  t("• Bu manuel aktarım sırasında sellout verisiyle çakıştırma yapılmadığı için aynı satış birden fazla kez beyan edilebilir."),
]));

children.push(heading3("Örnek: Özlem Karadağ / SEPHORA MERSİN"));
children.push(bodyPara([
  t("Bir uzman × ürün × mağaza için beyan adedinin sellout adedinden fazla olması durumunun somut bir örneği aşağıdaki gibidir. Özlem Karadağ'ın SEPHORA MERSİN'de bir Dior parfüm ürünü için 14 adet Zeops beyanı bulunmakta; aynı ürün için mağazanın sellout kaydında ise 8 adet satış görünmektedir. İki kaynak arasındaki fark, otomatik bir sellout sınırlaması olmadığında prim tabanına yansımaktadır."),
]));

const ozelmTbl = new Table({
  width: { size: 9000, type: WidthType.DXA },
  columnWidths: [3500, 1800, 1800, 1900],
  rows: [
    tableRow([
      cell("Ürün", { bold: true, bg: "1F3864", width: 3500 }),
      cell("Zeops Beyan", { bold: true, bg: "1F3864", width: 1800, align: "right" }),
      cell("Sellout Adet", { bold: true, bg: "1F3864", width: 1800, align: "right" }),
      cell("Fark", { bold: true, bg: "1F3864", width: 1900, align: "right" }),
    ]),
    tableRow([
      cell("JAD PARF FL 100ML INT26", { width: 3500 }),
      cell("14", { width: 1800, align: "right" }),
      cell("8", { width: 1800, align: "right" }),
      cell("+6", { width: 1900, align: "right", bold: true }),
    ]),
    tableRow([
      cell("MD PARFUM SPR 125ML", { width: 3500 }),
      cell("4", { width: 1800, align: "right" }),
      cell("1", { width: 1800, align: "right" }),
      cell("+3", { width: 1900, align: "right", bold: true }),
    ]),
    tableRow([
      cell("JAD EDP SPR 100ML INT25", { width: 3500 }),
      cell("8", { width: 1800, align: "right" }),
      cell("5", { width: 1800, align: "right" }),
      cell("+3", { width: 1900, align: "right", bold: true }),
    ]),
    tableRow([
      cell("SAUVAGE EDP SPRAY 100ML", { width: 3500 }),
      cell("8", { width: 1800, align: "right" }),
      cell("5", { width: 1800, align: "right" }),
      cell("+3", { width: 1900, align: "right", bold: true }),
    ]),
    tableRow([
      cell("FRV HYDRA NUDE FDT 2,5N", { width: 3500 }),
      cell("15", { width: 1800, align: "right" }),
      cell("9", { width: 1800, align: "right" }),
      cell("+6", { width: 1900, align: "right", bold: true }),
    ]),
  ],
});
children.push(ozelmTbl);
children.push(bodyPara(t(" ")));

children.push(bodyPara([
  t("Özlem Karadağ örneğinde toplam 89 satırda beyan adedi sellout adedinin üzerindedir; fark toplamı 132 adet, yalnızca %1 satış primi üzerinden hesaplanan etki yaklaşık 4.833 TL'dir. Bu farkların bir kısmı Zeops erişim kesintisi veya toplu aktarım kaynaklı olabilir. Asıl gözlem, Excel dosyasında sellout kalanıyla otomatik bir denetimin bulunmamasıdır."),
]));

// ---------------- BULGU 5: MAĞAZA YÖNETİMİNİN İŞLEYİŞE OPERASYONEL KATKISI ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1("Bulgu 5 — Mağaza Yönetiminin Prim Hesabına Operasyonel Katkısı"));

children.push(bodyPara([
  t("Bulgu 1'de mağaza müdürü beyanına dayanan tutarlar, Bulgu 3'te master listede olmayan kişilere açılan satırlar ve Bulgu 4'te sellout adedinin üzerine çıkan beyanlar birlikte değerlendirildiğinde, prim hesabının yalnızca otomatik formüllerle değil; "),
  t("mağaza yönetiminin sağladığı beyanlarla", { bold: true }),
  t(" da beslendiği görülmektedir."),
]));

children.push(bodyPara([
  t("Sözü edilen operasyonel süreç şu adımları içerebilir:"),
]));

children.push(bodyPara([
  t("• ", { bold: true }),
  t("Zeops erişilemediği durumlarda uzmanların gerçekleştirdiği satışların mağaza yönetimi tarafından derlenip toplu olarak Zeops'a girilmesi,"),
]));
children.push(bodyPara([
  t("• ", { bold: true }),
  t("Sellout verisinden veya mağaza kayıtlarından toplu ciro rakamlarının okunup uygun uzmanın satırına yansıtılması için Excel'de birim ciro / prime esas hücrelerinin elle güncellenmesi,"),
]));
children.push(bodyPara([
  t("• ", { bold: true }),
  t("Master listede tanımlı olmayan yeni gelen uzmanlar için Prim Çalışma dosyasında doğrudan satır açılıp ödeme yapılabilmesini sağlayan ek girdiler,"),
]));
children.push(bodyPara([
  t("• ", { bold: true }),
  t("Uzmanın atamalı olmadığı bir mağazada gerçekleştirdiği satışın primlenip primlenmeyeceğine ilişkin kararların satır bazında ve manuel olarak verilmesi."),
]));

children.push(bodyPara([
  t("Bu süreç, tek başına ele alındığında pratik ve iş sürekliliğine katkı sağlayan bir yaklaşımdır. Ancak "),
  t("dönem sonu bir prim hesap tablosunun tamamen kural tabanlı, denetlenebilir ve tekrarlanabilir olması gerektiğinde", { bold: true }),
  t(", söz konusu manuel katkıların hesabı Excel'in kendisinden ayrıştırılamaması bir sorun oluşturmaktadır. Yani hangi satırın Excel'in kural motorundan, hangisinin mağaza yönetimince eklendiğinden geldiğini ayırt etmek mevcut dosya üzerinde mümkün değildir."),
]));

// ---------------- BÖLÜM 3: DİĞER BULGULAR ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1("Diğer Bulgular"));

children.push(heading2("Mağaza Müdürü Beyanına Dayanan Tutar Eklemeleri"));

children.push(bodyPara([
  t("Prim Çalışma Satış primleri sayfasında Bulgu 1'de tarif edilen türde, formüle sabit tutar eklenmiş toplam "),
  t("17 satır", { bold: true }),
  t(" aşağıda listelenmiştir. Bu tutarlar sellout'tan üretilmemiş; uygulamada mağaza müdürlerinin beyanlarının Excel'e yansıtılmasıyla oluşmuştur. Tutarlar yalnızca satış primi (%1) üzerinden hesaplanmış etkidir; bonus kolonları dahil edilmemiştir."),
]));

const fudgeSatirlari = [
  ["Furkan Soku", "SEPHORA AQUA FLORYA", "2.164.137 TL", "21.641 TL"],
  ["Nurgül Kesgün", "SEPHORA KANYON", "1.920.000 TL", "19.200 TL"],
  ["Şenay Doğan", "SEPHORA EMAAR", "1.871.000 TL", "18.710 TL"],
  ["Vedat Genç", "SEPHORA TERSANE", "1.836.000 TL", "18.360 TL"],
  ["Hikmet Terzioğlu", "BOYNER FORUM KAYSERİ", "1.286.468 TL", "12.865 TL"],
  ["Deniz Biçer", "SEPHORA CITYS KOZYATAGI", "1.169.291 TL", "11.693 TL"],
  ["Bihter Yıldırım", "SEPHORA VADİ İSTANBUL", "584.000 TL", "5.840 TL"],
  ["Dilek Çelik", "BOYNER İSTİNYE PARK", "545.472 TL", "5.455 TL"],
  ["Gencay Gökmen", "BEYMEN AQUA FLORYA", "500.000 TL", "5.000 TL"],
  ["Duygu Dağdeviren", "BEYMEN BEAUTY NİŞANTAŞI", "500.000 TL", "5.000 TL"],
  ["Yelda Çıtır", "BOYNER ERENKÖY", "340.000 TL", "3.400 TL"],
  ["Nursu Tamcı", "BEYMEN ZORLU", "300.000 TL", "3.000 TL"],
  ["Banu Ayabak", "SEPHORA AQUA FLORYA", "298.000 TL", "2.980 TL"],
  ["Muammer Cenk Özkan", "BOYNER CEVAHİR", "250.000 TL", "2.500 TL"],
  ["Tamer Aksu", "BOYNER METROPOL", "250.000 TL", "2.500 TL"],
  ["Faruk Karlı", "BOYNER CEVAHİR", "250.000 TL", "2.500 TL"],
];
const fudgeTable = new Table({
  width: { size: 9500, type: WidthType.DXA },
  columnWidths: [2800, 2800, 2200, 1700],
  rows: [
    tableRow([
      cell("Uzman", { bold: true, bg: "1F3864", width: 2800 }),
      cell("Mağaza", { bold: true, bg: "1F3864", width: 2800 }),
      cell("Manuel Eklenen", { bold: true, bg: "1F3864", width: 2200, align: "right" }),
      cell("%1 Etki", { bold: true, bg: "1F3864", width: 1700, align: "right" }),
    ]),
    ...fudgeSatirlari.map(([u, m, ek, et]) => tableRow([
      cell(u, { width: 2800 }),
      cell(m, { width: 2800 }),
      cell(ek, { width: 2200, align: "right" }),
      cell(et, { width: 1700, align: "right" }),
    ])),
    tableRow([
      cell("TOPLAM", { width: 2800, bold: true, bg: "FFE699" }),
      cell("17 satır / 16 uzman — kaynak: mağaza müdürü beyanı", { width: 2800, bg: "FFE699", size: 16 }),
      cell("14.064.368 TL", { width: 2200, align: "right", bold: true, bg: "FFE699" }),
      cell("140.644 TL", { width: 1700, align: "right", bold: true, bg: "FFE699" }),
    ]),
  ],
});
children.push(fudgeTable);
children.push(bodyPara(t(" ")));
children.push(bodyPara([
  t("Not: ", { bold: true }),
  t("Listedeki uzman adları, tutarın yazıldığı satır etiketidir. Beyanın içeriği ve doğruluğu mağaza müdürlüğünün sorumluluğundadır; uzman bu tutarı üretmiş kişi olarak değerlendirilmemelidir."),
]));

children.push(heading2("Prim Hesaplanan Adet Formülü Sıfırlaması"));

children.push(bodyPara([
  t("Prim Çalışma Satış primleri sayfasında \"Prim Hesaplanan Adet\" kolonunun (AC) normal formülü "),
  t("=+AA[satır]", { font: "Consolas" }),
  t(" şeklindedir (Adet kolonunun değeri). Ancak bazı satırlarda formülün "),
  t("=+AA[satır]-AA[satır]", { font: "Consolas", color: "2E74B5" }),
  t(" şeklinde değiştirildiği ve dolayısıyla prim adedinin manuel olarak sıfırlandığı tespit edilmiştir. Bu türde manuel iptal içeren toplam "),
  t("5.123 satır", { bold: true }),
  t(" bulunmakta ve 233 uzmanı etkilemektedir."),
]));

children.push(bodyPara([
  t("Bu iptallerin bir kısmı, uzmanın atama mağazası dışındaki noktalarda yaptığı satışlarla ilgili olabilir (mağaza atama kuralı gereği). Ancak Excel dosyasında bu iptaller sistematik bir formülle değil, satır bazında elle uygulanmaktadır. Örneğin Ahmet Bozdağ'ın SEPHORA VADİ İSTANBUL ataması bulunmakta; SEPHORA CAPACITY, SEPHORA CEVAHİR, SEPHORA NİŞANTAŞI ve SEPHORA KANYON'da atamalı olmadığı halde satışları bulunmaktadır. Excel dosyasında yalnızca SEPHORA NİŞANTAŞI ve SEPHORA KANYON satırları iptal edilmiş; SEPHORA CAPACITY ve SEPHORA CEVAHİR satırları iptal edilmeksizin primlendirilmiştir. Aynı iş koşulunun benzer mağazalarda farklı uygulanması, kararların satır bazlı bireysel değerlendirmelerle alındığını göstermektedir."),
]));

children.push(heading2("Mükerrer Beyanların Denetlenmemesi"));

children.push(bodyPara([
  t("Excel dosyası, bir uzmanın aynı ürünü aynı mağazada birden çok kez beyan etmesi durumunda sellout'taki gerçek satış adediyle karşılaştırma yapmamaktadır. \"Prim Hesaplanan Adet\" formülü doğrudan beyan adedini almakta, sellout kalanıyla sınırlama uygulanmamaktadır."),
]));

children.push(bodyPara([
  t("Yapılan sistematik taramada, Mayıs 2026 döneminde bir uzmanın belirli bir mağaza × ürün kombinasyonu için beyan ettiği toplam adet, sellout'taki resmi adetten fazla olan "),
  t("4.313 satır", { bold: true }),
  t(" tespit edilmiştir. Bu satırlar 235 uzmanı kapsamakta ve toplam "),
  t("6.393 fazla adet", { bold: true }),
  t(" beyanı barındırmaktadır. Yalnızca %1 satış primi üzerinden hesaplanan etki yaklaşık "),
  t("127.811 TL", { bold: true }),
  t(" seviyesindedir. Bu tutar, sellout kalanıyla sınırlama uygulanmadığı durumda prim tabanına yansıyan farkı ifade eder; uzmanların niyetine ilişkin bir değerlendirme içermez."),
]));

// ---------------- SAYISAL ETKİ ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1("Sayısal Etki Özeti (Mayıs 2026)"));

const etkiTable = new Table({
  width: { size: 9500, type: WidthType.DXA },
  columnWidths: [5500, 2000, 2000],
  rows: [
    tableRow([
      cell("Bulgu Türü", { bold: true, bg: "1F3864", width: 5500 }),
      cell("Etkilenen Uzman", { bold: true, bg: "1F3864", width: 2000, align: "center" }),
      cell("Prim Tablosu karşılığı sınırlı tutar (%1 üzerinden)", { bold: true, bg: "1F3864", width: 2000, align: "right", size: 18 }),
    ]),
    tableRow([
      cell("Prime Esas formülüne mağaza müdürü beyanına dayanan sabit tutar (17 satır)", { width: 5500 }),
      cell("16", { width: 2000, align: "center" }),
      cell("140.644 TL", { width: 2000, align: "right" }),
    ]),
    tableRow([
      cell("Beyan adedinin sellout adedini aşması (kaynaklar arası fark)", { width: 5500 }),
      cell("235", { width: 2000, align: "center" }),
      cell("127.811 TL", { width: 2000, align: "right" }),
    ]),
    tableRow([
      cell("Bonus kolonlarında koşul denetimi yapılmayan otomatik çarpımlar (Hedef, Dior sıralamaları, LP mağaza)", { width: 5500 }),
      cell("Sistem geneli", { width: 2000, align: "center" }),
      cell("Tahmini (ayrıca doğrulanmalı)", { width: 2000, align: "right", size: 18 }),
    ]),
    tableRow([
      cell("TOPLAM (yalnızca ölçülen iki kalem, %1 üzerinden)", { width: 5500, bold: true, bg: "FFE699" }),
      cell("", { width: 2000, bg: "FFE699" }),
      cell("~268.455 TL", { width: 2000, align: "right", bold: true, bg: "FFE699" }),
    ]),
    tableRow([
      cell("Bayi bonusu, sıralama ve ek prim çarpanlarıyla birlikte tahmini üst bant", { width: 5500, bold: true, bg: "FFE699" }),
      cell("", { width: 2000, bg: "FFE699" }),
      cell("Ayrı kalem doğrulaması gerekir", { width: 2000, align: "right", bold: true, bg: "FFE699", size: 18 }),
    ]),
  ],
});
children.push(etkiTable);
children.push(bodyPara(t(" ")));

children.push(bodyPara([
  t("Not: ", { bold: true }),
  t("Yukarıdaki tutarlar Mayıs 2026 Excel dosyasındaki formül ve satır taramasına dayanır. Tahmini üst bant rakamları bilinçli olarak raporda sabitlenmemiştir; sunumda yalnızca ölçülmüş kalemlerin kullanılması önerilir."),
]));

// ---------------- SONUÇ ----------------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(heading1("Sonuç ve Değerlendirme"));

children.push(bodyPara([
  t("Arcon'un Mayıs 2026 dönemi Prim Çalışma Excel dosyası incelendiğinde, Prim Tablosu'nda tanımlı koşulların bir kısmının otomatik ve denetlenebilir biçimde uygulanmadığı görülmektedir. Hesaba giren tutarların bir kısmı sellout'tan, bir kısmı ise "),
  t("mağaza müdürlerinin beyanlarından", { bold: true }),
  t(" gelmektedir. Beyanın doğruluğu mağaza yönetiminin sorumluluğundadır; Excel bu beyanı bağımsız kaynakla doğrulamadan kabul etmektedir."),
]));

children.push(bodyPara([
  t("Ölçülen iki kalem üzerinden yalnızca %1 satış primi etkisi yaklaşık "),
  t("268.455 TL", { bold: true }),
  t(" seviyesindedir (mağaza müdürü beyanına dayanan sabit tutarlar ~140.644 TL; beyan–sellout adet farkı ~127.811 TL). Bonus kolonlarının koşul denetimi yapmadan çalışması ek etki üretebilir. Rapor içindeki ekran görüntüleri (özellikle Nurgül Kesgün / AF242 örneği) bu gözlemi Excel satırları üzerinden belgelemektedir."),
]));

children.push(bodyPara([
  t("Bu inceleme uzmanları veya bireyleri suçlamak için değildir. Amaç; sorumluluğu doğru yere — mağaza müdürü beyanı ve bu beyanın doğrulanmadan Excel'e işlenmesi — yerleştirmek ve Flywork Prim Sistemi ile sellout doğrulamalı, beyanı izlenebilir otomatik bir sürecin neden gerekli olduğunu göstermektir."),
]));

children.push(bodyPara(t(" ")));
children.push(bodyPara(t(" ")));
children.push(bodyPara(t("— Rapor sonu —", { italics: true, color: "888888" }), { alignment: AlignmentType.CENTER }));

// ---------------- Doküman ayarları ----------------
const doc = new Document({
  creator: "Sena Özyiğit",
  title: "Flywork Prim Raporu",
  description: "Arcon Mayıs 2026 Prim Çalışma İncelemesi",
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22 },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
      },
    },
    children,
  }],
});

// Yaz
const outPath = path.join(__dirname, "flywork_prim_raporu.docx");
Packer.toBuffer(doc).then((buffer) => {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);
  console.log(`✓ Rapor yazıldı: ${outPath}`);
  console.log(`  Boyut: ${(buffer.length / 1024).toFixed(1)} KB`);
}).catch((e) => { console.error(e); process.exit(1); });
