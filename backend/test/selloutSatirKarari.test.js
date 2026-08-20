const test = require("node:test");
const assert = require("node:assert/strict");
const { selloutSatirKarari, ozetEsasiNetDoldur } = require("../src/services/hesapService");

test("satır sığarsa Ok", () => {
  assert.deepEqual(selloutSatirKarari(2, 13, 0, 13), { primAdet: 2, aciklama: "Ok" });
});

test("Serkan: ilk satır 3 vs SO 1 → Mükerrer, prim 1", () => {
  assert.deepEqual(
    selloutSatirKarari(3, 1, 0, 1),
    { primAdet: 1, aciklama: "Mükerrer Giriş" },
  );
});

test("Dilek: 2 Ok + 5 kalan 3 → 3 Mükerrer, toplam 5", () => {
  const a = selloutSatirKarari(2, 5, 0, 5);
  const b = selloutSatirKarari(5, 5 - a.primAdet, a.primAdet, 5);
  assert.deepEqual(a, { primAdet: 2, aciklama: "Ok" });
  assert.deepEqual(b, { primAdet: 3, aciklama: "Mükerrer Giriş" });
  assert.equal(a.primAdet + b.primAdet, 5);
});

test("concealer 1+3, mağaza 3 → 1 Ok + 2 Mükerrer, toplam 3", () => {
  const a = selloutSatirKarari(1, 3, 0, 3);
  const b = selloutSatirKarari(3, 3 - a.primAdet, a.primAdet, 3);
  assert.equal(a.primAdet, 1);
  assert.equal(a.aciklama, "Ok");
  assert.deepEqual(b, { primAdet: 2, aciklama: "Mükerrer Giriş" });
  assert.equal(a.primAdet + b.primAdet, 3);
});

test("palette: uzman 1+11, mağaza 11 → 1 Ok + 10 Mükerrer", () => {
  const a = selloutSatirKarari(1, 11, 0, 11);
  const b = selloutSatirKarari(11, 11 - a.primAdet, a.primAdet, 11);
  assert.equal(a.primAdet, 1);
  assert.deepEqual(b, { primAdet: 10, aciklama: "Mükerrer Giriş" });
});

test("havuz bitince Mükerrer", () => {
  assert.deepEqual(selloutSatirKarari(3, 0, 3, 5), { primAdet: 0, aciklama: "Mükerrer Giriş" });
});

function satir(uzman, magaza, bolum, uniq, urun, primAdet, esas, aciklama) {
  return [724, 1, uzman, magaza, bolum, uniq, urun, primAdet, primAdet, 100, esas, aciklama];
}

test("özet: Ok + Mükerrer kardeş → ödenen prim Ok esas'ta toplanır", () => {
  const ozet = new Map([["1|10|5", { primeEsas: 99, adet: 99 }]]);
  ozetEsasiNetDoldur([
    satir(1, 10, 5, 100, 200, 1, 2000, "Ok"),
    satir(1, 10, 5, 100, 200, 2, 4000, "Mükerrer Giriş"),
  ], ozet);
  assert.equal(ozet.get("1|10|5").primeEsas, 6000);
});

test("özet: tek taşma satırı (Ok yok) → mağaza kadar esas kalır", () => {
  const ozet = new Map([["1|10|5", { primeEsas: 0, adet: 0 }]]);
  ozetEsasiNetDoldur([
    satir(1, 10, 5, 100, 200, 1, 2258, "Mükerrer Giriş"),
  ], ozet);
  assert.equal(ozet.get("1|10|5").primeEsas, 2258);
});
