const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeBarcode,
  normalizeCode,
  identityCandidates,
  resolveProduct,
} = require("../src/services/productService");

function resolver(entries) {
  return {
    identifierMap: new Map(entries.map((entry) => [
      `${entry.tip}|${entry.value}`,
      {
        identifier_id: entry.identifierId,
        urun_id: entry.productId,
        tip: entry.tip,
        deger_normalize: entry.value,
      },
    ])),
  };
}

test("iki farklı barkod aynı kanonik ürüne çözümlenir", () => {
  const productResolver = resolver([
    { tip: "barkod", value: "3349660123456", identifierId: 1, productId: 42 },
    { tip: "barkod", value: "3349660999999", identifierId: 2, productId: 42 },
  ]);
  assert.equal(resolveProduct(productResolver, { barcode: "3349660123456" }).productId, 42);
  assert.equal(resolveProduct(productResolver, { barcode: "3349660999999" }).productId, 42);
});

test("barkod ve referans farklı ürünlere çıkarsa sessiz öncelik uygulanmaz", () => {
  const productResolver = resolver([
    { tip: "barkod", value: "3349660123456", identifierId: 1, productId: 42 },
    { tip: "referans", value: "REF-99", identifierId: 2, productId: 99 },
  ]);
  const result = resolveProduct(productResolver, { barcode: "3349660123456", reference: "REF-99" });
  assert.equal(result.status, "urun_cakisma");
  assert.deepEqual(result.productIds, [42, 99]);
});

test("relansman barkodu aynı ürüne yeni alias olarak çözümlenebilir", () => {
  const productResolver = resolver([
    { tip: "barkod", value: "3349660777777", identifierId: 8, productId: 42 },
  ]);
  const result = resolveProduct(productResolver, { barcode: "3349660777777" });
  assert.equal(result.status, "ok");
  assert.equal(result.identifierId, 8);
});

test("sentinel ve boş değerler aktif kimlik adayı üretmez", () => {
  assert.equal(normalizeCode(" TBC "), null);
  assert.equal(normalizeCode("#N/A"), null);
  assert.equal(normalizeCode("0,00"), null);
  assert.equal(identityCandidates({ barcode: "TBC", reference: "#N/A" }).length, 0);
});

test("metin barkodlarında baştaki sıfır korunur ve görünmez karakter temizlenir", () => {
  assert.equal(normalizeBarcode(" 0123456789012\u200B "), "0123456789012");
  assert.equal(normalizeCode(" ref \u200B 01 "), "REF01");
});

test("alfanümerik barkod stok kodu adayı olur", () => {
  const [candidate] = identityCandidates({ barcode: "DGB-001" });
  assert.equal(candidate.tip, "stok_kodu");
  assert.equal(candidate.normalized, "DGB-001");
});
