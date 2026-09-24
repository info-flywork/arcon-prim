const test = require("node:test");
const assert = require("node:assert/strict");
const { geziciUzmanMi, resolvePrimMagaza } = require("../src/services/geziciUzman");

test("gezici adlar, dosyadaki yazım dahil", () => {
  assert.equal(geziciUzmanMi("Dılbırin Yiğit"), true);
  assert.equal(geziciUzmanMi("Dilberin Yiğit"), true);
  assert.equal(geziciUzmanMi("Dalıa Kasap"), true);
  assert.equal(geziciUzmanMi("Rabia Çolduk"), true);
  assert.equal(geziciUzmanMi("Tuğba Eryuva"), true);
  assert.equal(geziciUzmanMi("Burak Ünverdi"), true);
  assert.equal(geziciUzmanMi("Uğur Hamarat"), true);
  assert.equal(geziciUzmanMi("Muhammed Enes Akkurt"), false);
  assert.equal(geziciUzmanMi("Dılbırin Yiğit Toplam"), false);
});

test("aynı bayi alınır, farklı bayi prime girmez", () => {
  const bayiOf = (id) => ({ 1: "BEYMEN", 2: "BEYMEN", 3: "BOYNER" }[id]);
  const atamalar = [{ magaza_id: 1, kaynak: "dosya" }];
  assert.equal(
    resolvePrimMagaza({ uzmanNormal: "BIHTER YILDIRIM", zeopsMagazaId: 2, atamalar, bayiOf }),
    2
  );
  assert.equal(
    resolvePrimMagaza({ uzmanNormal: "BIHTER YILDIRIM", zeopsMagazaId: 3, atamalar, bayiOf }),
    null
  );
  assert.equal(
    resolvePrimMagaza({ uzmanNormal: "RABIA COLDUK", zeopsMagazaId: 3, atamalar, bayiOf }),
    3
  );
});
