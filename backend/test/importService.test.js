const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { _internals } = require("../src/services/importService");

test("başlık satırı çalışma sayfası A1 dışında başlasa da doğru okunur", () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(worksheet, [
    ["BAYİ", "MAĞAZA", "Barkod"],
    ["BOYNER", "BOYNER ERENKÖY", "0123456789012"],
  ], { origin: "A2" });
  XLSX.utils.book_append_sheet(workbook, worksheet, "Ham Veri");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const rows = _internals.readSheet(buffer, ["BAYİ", "MAĞAZA", "Barkod"], ["Ham Veri"]);
  assert.deepEqual(Object.keys(rows[0]), ["BAYİ", "MAĞAZA", "Barkod"]);
  assert.equal(rows[0].Barkod, "0123456789012");
});
