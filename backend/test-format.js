// Geçici test — sonra silinecek
const XLSX = require("xlsx");
const { importSellout, importZeops, importUzmanMagaza, importHedef, importSiralama } = require("./src/services/importService");

async function tek(ad, buffer, fn) {
  try {
    const r = await fn(buffer, 1, "t.xlsx");
    console.log(ad, ":", r.hata ? "RED " + r.hata.slice(0, 100) : "GEÇTİ");
    if (r.gorulen_basliklar) console.log("  görülen:", r.gorulen_basliklar.slice(0, 6).join(", "));
  } catch (e) {
    console.log(ad, ": format GEÇTİ, DB durdurdu:", e.code || e.message);
  }
}

function ws(aoa, sheetName = "Sheet1") {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

(async () => {
  // 1) Sell-out — "Ciro Kdv Hariç Toplam Tutar" gibi uzun başlık
  await tek("Sell-out (uzun ciro başlığı)", ws([
    ["Bayi", "Ürün Adı", "Arcon Referans", "Arcon Barkod", "Adet", "Ciro Kdv Hariç Toplam Tutar", "Mağaza", "Prim Mağaza", "Marka"],
    ["BEYMEN", "DA GLASS 306", "E000001655", "3348901834872", 1, "2.258,33", "BEYMEN SUADİYE", "BEYMEN SUADİYE", "DIOR"],
  ]), importSellout);

  // 2) Uzman-Mağaza-Grup — boş A sütunu, başlık 2. satırda
  await tek("Uzman-Mağaza (boş A, başlık 2. satır)", ws([
    [null, null, null, null, null, null, null],
    [null, "MAĞAZA KODU", "BAYİ", "MAĞAZA", "PRİM MAĞAZA", "Uzman Ad-Sıyad", "Group"],
    [null, "34.ZRL.BYP", "BEYMEN", "ZORLU", "BEYMEN ZORLU", "RAMAZAN KARADENİZ", "DIOR"],
  ]), importUzmanMagaza);

  // 3) Zeops — düz
  await tek("Zeops", ws([
    ["Ziyaret ID", "Ad", "Soyad", "İşlem Tarihi", "Durum", "Satış Tarihi", "Mağaza", "Barkod", "Kod", "Etiket", "Adet", "Fiyat", "Toplam"],
    ["321.579", "Yıldırım", "Tezer", "5/1/2026", "Tamamlandı", "5/1/2026", "BOYNER ERENKÖY", "3349668627547", "PPR65199571", "INVICTUS", 1, "6.552,50", "6.552,50"],
  ]), importZeops);

  // 4) Hedef
  await tek("Hedef", ws([
    ["BAYİ", "MAĞAZA KOD", "MAĞAZA ADI", "MARKA", "AKS", "REVİZE Haziran"],
    ["SEPHORA", "34.AKS.SPH", "SEPHORA AKASYA", "CAROLINA HERRERA", "Puig", "723.320"],
  ]), importHedef);

  // 5) Sıralama
  await tek("Sıralama", ws([
    ["MAĞAZA", "ÇEŞİT", "MARKA", "SIRALAMA", "AY", "BÖLGE", "YIL", "BAYİ"],
    ["BOYNER ADANA", "1-PARFÜM", "DIOR", 5, "05-MAYIS", "İÇ ANADOLU", 2026, "BOYNER"],
  ]), importSiralama);

  // 6) Yanlış dosya — Zeops'u Sell-out kutusuna
  await tek("YANLIŞ (Zeops -> Sell-out)", ws([
    ["Ziyaret ID", "Ad", "Soyad", "Mağaza", "Barkod", "Adet"],
    ["1", "A", "B", "M", "1234", 1],
  ]), importSellout);

  process.exit(0);
})();
