// Arcon Mayıs 2026 — sunum kanıt Excel'i (nötr ton)
const ExcelJS = require("exceljs");
const path = require("path");

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sena Özyiğit";
  wb.created = new Date();

  // ---- 1. Özet ----
  const ozet = wb.addWorksheet("1. Özet");
  ozet.columns = [
    { header: "Kalem", key: "kalem", width: 55 },
    { header: "Ölçüm", key: "olcum", width: 28 },
    { header: "Not", key: "not", width: 55 },
  ];
  ozet.getRow(1).font = { bold: true };
  ozet.addRows([
    {
      kalem: "Dönem / dosya",
      olcum: "Mayıs 2026",
      not: "Arcon Prim Çalışma Dosyalar_24062026.xlsx",
    },
    {
      kalem: "Formüle sabit sayı eklenen satır",
      olcum: "17 satır / 16 uzman",
      not: "Kolon AF — Prime Esas Birim Ciro; yalnızca %1 etki ~140.644 TL",
    },
    {
      kalem: "Beyan adedi > sellout adedi",
      olcum: "4.313 satır / 235 uzman",
      not: "Yalnızca %1 etki ~127.811 TL; niyet değerlendirmesi yok",
    },
    {
      kalem: "Prim Hesaplanan Adet elle sıfırlama",
      olcum: "5.123 satır / 233 uzman",
      not: "Formül: =+AA-AA (satır bazlı)",
    },
    {
      kalem: "Ölçülen iki kalem toplamı (%1)",
      olcum: "~268.455 TL",
      not: "Bonus / sıralama etkileri ayrıca doğrulanmalı",
    },
    {
      kalem: "Rapor tonu",
      olcum: "Sistem tasarımı gözlemi",
      not: "Kişi suçlaması değildir; Excel satırları üzerinden teyit edilebilir",
    },
  ]);

  // ---- 2. Formül eklemeleri ----
  const fudge = wb.addWorksheet("2. Formül Eklemeleri");
  fudge.columns = [
    { header: "Öneri spot-check sırası", key: "sira", width: 12 },
    { header: "Uzman", key: "uzman", width: 24 },
    { header: "Mağaza", key: "magaza", width: 28 },
    { header: "Manuel eklenen (TL)", key: "ek", width: 18 },
    { header: "%1 etki (TL)", key: "etki", width: 14 },
    { header: "Excel satır (yaklaşık)", key: "row", width: 18 },
    { header: "Kolon / formül örneği", key: "formul", width: 45 },
  ];
  fudge.getRow(1).font = { bold: true };
  const fudgeRows = [
    [1, "Nurgül Kesgün", "SEPHORA KANYON", 1920000, 19200, 242, "=EĞERHATA(AE242/AD242;\"0\")+1920000"],
    [2, "Furkan Soku", "SEPHORA AQUA FLORYA", 2164137, 21641, "", "AF kolonunda +sabit"],
    [3, "Şenay Doğan", "SEPHORA EMAAR", 1871000, 18710, "", "AF kolonunda +sabit"],
    [4, "Vedat Genç", "SEPHORA TERSANE", 1836000, 18360, "", "AF kolonunda +sabit"],
    [5, "Hikmet Terzioğlu", "BOYNER FORUM KAYSERİ", 1286468, 12865, "", "AF kolonunda +sabit"],
    [6, "Deniz Biçer", "SEPHORA CITYS KOZYATAGI", 1169291, 11693, "", "AF kolonunda +sabit"],
    [7, "Bihter Yıldırım", "SEPHORA VADİ İSTANBUL", 584000, 5840, "", "AF kolonunda +sabit"],
    [8, "Dilek Çelik", "BOYNER İSTİNYE PARK", 545472, 5455, "", "AF kolonunda +sabit"],
    [9, "Gencay Gökmen", "BEYMEN AQUA FLORYA", 500000, 5000, "", "AF kolonunda +sabit"],
    [10, "Duygu Dağdeviren", "BEYMEN BEAUTY NİŞANTAŞI", 500000, 5000, "", "AF kolonunda +sabit"],
    [11, "Yelda Çıtır", "BOYNER ERENKÖY", 340000, 3400, "", "AF + iptal satırları bir arada"],
    [12, "Nursu Tamcı", "BEYMEN ZORLU", 300000, 3000, 3606, "=EĞERHATA(AE3606/AD3606;\"0\")+300000"],
    [13, "Banu Ayabak", "SEPHORA AQUA FLORYA", 298000, 2980, "", "AF kolonunda +sabit"],
    [14, "Muammer Cenk Özkan", "BOYNER CEVAHİR", 250000, 2500, "", "AF kolonunda +sabit"],
    [15, "Tamer Aksu", "BOYNER METROPOL", 250000, 2500, "", "AF kolonunda +sabit"],
    [16, "Faruk Karlı", "BOYNER CEVAHİR", 250000, 2500, "", "AF kolonunda +sabit"],
  ];
  for (const r of fudgeRows) {
    fudge.addRow({
      sira: r[0], uzman: r[1], magaza: r[2], ek: r[3], etki: r[4], row: r[5], formul: r[6],
    });
  }
  fudge.getColumn("ek").numFmt = "#,##0";
  fudge.getColumn("etki").numFmt = "#,##0";

  // ---- 3. Spot check (sunum) ----
  const spot = wb.addWorksheet("3. Sunum Spot-Check");
  spot.columns = [
    { header: "Sıra", key: "sira", width: 8 },
    { header: "Ne göster", key: "ne", width: 40 },
    { header: "Sayfa", key: "sayfa", width: 32 },
    { header: "Nasıl bul", key: "nasil", width: 50 },
    { header: "Beklenen gözlem", key: "gozlem", width: 55 },
  ];
  spot.getRow(1).font = { bold: true };
  spot.addRows([
    {
      sira: 1,
      ne: "Nurgül — birim ciro formülüne +1.920.000",
      sayfa: "Prim Çalışma Satış primleri",
      nasil: "Ctrl+G → 242 → AF hücresi / formül çubuğu",
      gozlem: "Normal formül + sabit sayı; sellout eşleşmesi olmayan satırda taban üretilmiş",
    },
    {
      sira: 2,
      ne: "Ayşe Nilay — bonus = E × oran (şartsız)",
      sayfa: "Prim Çalışma2_Sıralamalar + Mayıs Sıralama",
      nasil: "Uzman adıyla filtrele; sıralama şartı ile karşılaştır",
      gozlem: "Hedef / sıralama şartı tutmasa da bonus kolonları dolu",
    },
    {
      sira: 3,
      ne: "Özlem Karadağ — beyan > sellout",
      sayfa: "Zeops Ham + Sell-out Data",
      nasil: "SEPHORA MERSİN × JAD PARF FL 100ML",
      gozlem: "Zeops 14 / sellout 8; Excel adedi Zeops’tan alıyor",
    },
    {
      sira: 4,
      ne: "Yelda — hem +340.000 hem iptal satırları",
      sayfa: "Prim Çalışma Satış primleri",
      nasil: "Uzman adı filtre + AC formülü =AA-AA araması",
      gozlem: "Aynı uzman için hem ekleme hem sıfırlama örnekleri",
    },
  ]);

  // ---- 4. Mükerrer özet ----
  const muk = wb.addWorksheet("4. Beyan-Sellout Farkı");
  muk.columns = [
    { header: "Uzman", key: "uzman", width: 24 },
    { header: "Mükerrer satır (özet)", key: "satir", width: 18 },
    { header: "Fazla adet", key: "adet", width: 12 },
    { header: "Fazla ciro (TL)", key: "ciro", width: 16 },
    { header: "%1 etki (TL)", key: "etki", width: 14 },
    { header: "Not", key: "not", width: 40 },
  ];
  muk.getRow(1).font = { bold: true };
  muk.addRows([
    { uzman: "Özlem Karadağ", satir: 89, adet: 132, ciro: 483263, etki: 4833, not: "SEPHORA MERSİN — örnek ürün tablosu Word’de" },
    { uzman: "Beyzagül Doğan", satir: 85, adet: 128, ciro: 480005, etki: 4800, not: "Özet tarama" },
    { uzman: "Yelda Çıtır", satir: 85, adet: 117, ciro: 334563, etki: 3346, not: "Ayrıca formül eklemesi + iptaller" },
    { uzman: "Furkan Nihat Sezer", satir: 46, adet: 81, ciro: 295267, etki: 2953, not: "Özet tarama" },
    { uzman: "Burcu Şimşek", satir: 23, adet: 36, ciro: 280996, etki: 2810, not: "Özet tarama" },
    { uzman: "Bihter Yıldırım", satir: 70, adet: 92, ciro: 257528, etki: 2575, not: "Özet tarama" },
    { uzman: "Duygu Haklıol", satir: 45, adet: 63, ciro: 235741, etki: 2357, not: "Özet tarama" },
    { uzman: "Nuray Özsamancı", satir: 22, adet: 37, ciro: 233969, etki: 2340, not: "Özet tarama" },
    { uzman: "Ayşe Sadi", satir: 71, adet: 81, ciro: 228319, etki: 2283, not: "Özet tarama" },
    { uzman: "Türkan Otay", satir: 24, adet: 39, ciro: 213052, etki: 2131, not: "Özet tarama" },
  ]);
  for (const col of ["ciro", "etki"]) muk.getColumn(col).numFmt = "#,##0";

  // ---- 5. Yöntem ----
  const yontem = wb.addWorksheet("5. Yöntem");
  yontem.columns = [
    { header: "Adım", key: "adim", width: 8 },
    { header: "Kaynak sayfa", key: "kaynak", width: 32 },
    { header: "Ne yapıldı", key: "ne", width: 70 },
  ];
  yontem.getRow(1).font = { bold: true };
  yontem.addRows([
    { adim: 1, kaynak: "Prim Tablosu", ne: "Bölüm kuralları (oran, sıralama şartı, hedef) referans alındı" },
    { adim: 2, kaynak: "Prim Çalışma Satış primleri", ne: "AF formüllerinde '+sabit sayı' taranır; AC formülünde =AA-AA sıfırlamaları sayılır" },
    { adim: 3, kaynak: "Zeops + Sell-out", ne: "Uzman × mağaza × ürün bazında beyan adedi ile sellout adedi karşılaştırılır" },
    { adim: 4, kaynak: "Prim Çalışma2_Sıralamalar", ne: "Bonus kolonlarının E×oran üretip üretmediği örnek uzmanlarla doğrulanır" },
    { adim: 5, kaynak: "Mayıs Sıralama / Hedef", ne: "Şartın sağlanıp sağlanmadığı bağımsız kaynakla kontrol edilir" },
  ]);
  yontem.addRow({});
  yontem.addRow({
    adim: "",
    kaynak: "Sunum notu",
    ne: "Canlıda 3–4 spot-check yeterli. İstenirse ilgili satıra gidilerek formül teyit edilebilir. Ekran görüntüsü opsiyoneldir.",
  });

  const out = path.join(__dirname, "Arcon_Mayis2026_Kanit_Ozeti.xlsx");
  await wb.xlsx.writeFile(out);
  console.log("✓ Kanıt Excel yazıldı:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
