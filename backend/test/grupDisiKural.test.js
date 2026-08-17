const test = require("node:test");
const assert = require("node:assert/strict");
const {
  puigParfumMu,
  givenchyParfumMu,
  grupDisiUrunuMu,
  parfumUzmanGrubuMu,
  puigUzmanGrubuMu,
  parfumHavuzUrunuMu,
  dfbPrimHaricMi,
  parfumUzmanSayisiHaritasi,
  grupDisiSatiriMi,
} = require("../src/services/grupDisiKural");

test("Puig ürünü AKS boş olsa da parfüm sayılır", () => {
  assert.equal(puigParfumMu("PACO RABANNE", null), true);
  assert.equal(puigParfumMu("Jean Paul Gaultier", "PARFÜM"), true);
  assert.equal(puigParfumMu("DIOR", "PARFÜM"), false);
});

test("Givenchy parfüm yalnızca AKS=PARFÜM iken", () => {
  assert.equal(givenchyParfumMu("GIVENCHY", "PARFÜM"), true);
  assert.equal(givenchyParfumMu("GIVENCHY", "MAKYAJ"), false);
  assert.equal(givenchyParfumMu("GIVENCHY", null), false);
});

test("grup dışı ürünü sadece Puig/Givenchy parfüm", () => {
  assert.equal(grupDisiUrunuMu("RABANNE", "PARFÜM"), true);
  assert.equal(grupDisiUrunuMu("GIVENCHY", "PARFÜM"), true);
  assert.equal(grupDisiUrunuMu("GIVENCHY", "MAKYAJ"), false);
  assert.equal(grupDisiUrunuMu("DIOR", "PARFÜM"), false);
});

test("Puig uzmanı Dalia/Uğur; Atilla Givenchy değil", () => {
  assert.equal(puigUzmanGrubuMu("Puig"), true);
  assert.equal(puigUzmanGrubuMu("Givenchy"), false);
  assert.equal(puigUzmanGrubuMu("Parfüm Tüm Markalar"), false);
  assert.equal(puigUzmanGrubuMu("Givenchy+Hermes+Dolce"), false);
  assert.equal(puigUzmanGrubuMu("Hermes"), false);
  assert.equal(parfumUzmanGrubuMu("Givenchy"), true);
});

test("Narciso / Issey / Zadig DFB — prim dahil değil", () => {
  assert.equal(dfbPrimHaricMi("NARCISO RODRIGUEZ"), true);
  assert.equal(dfbPrimHaricMi("ISSEY MIYAKE"), true);
  assert.equal(dfbPrimHaricMi("ZADIG&VOLTAIRE"), true);
  assert.equal(dfbPrimHaricMi("PACO RABANNE"), false);
});

test("tek uzman havuzu Puig+Giv+Hermes+DG parfüm", () => {
  assert.equal(parfumHavuzUrunuMu("RABANNE", null), true);
  assert.equal(parfumHavuzUrunuMu("GIVENCHY", "PARFÜM"), true);
  assert.equal(parfumHavuzUrunuMu("DIOR", "PARFÜM"), false);
});

test("mağaza Puig uzman sayısı Givenchy'yi saymaz", () => {
  const map = parfumUzmanSayisiHaritasi([
    { magaza_id: 1, uzman_id: 10, grup_adi: "Givenchy" },
    { magaza_id: 1, uzman_id: 11, grup_adi: "Puig" },
    { magaza_id: 1, uzman_id: 12, grup_adi: "Puig" },
    { magaza_id: 1, uzman_id: 13, grup_adi: "Sensai" },
  ]);
  assert.equal(map.get(1), 2); // Dalia + Uğur; Atilla sayılmaz
  const tek = parfumUzmanSayisiHaritasi([
    { magaza_id: 2, uzman_id: 20, grup_adi: "Givenchy" },
    { magaza_id: 2, uzman_id: 21, grup_adi: "Puig" },
  ]);
  assert.equal(tek.get(2), 1);
});

test("Grup Dışı yalnız Puig uzmanı + 2+ Puig + Giv/Hermes/DG parfüm; Atilla kesilmez", () => {
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "GIVENCHY",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), true, "Dalia Givenchy parfüm → grup dışı");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "DOLCE & GABBANA",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), true, "Bozdağ DG → grup dışı");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "HERMES",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), true, "Bozdağ Hermes → grup dışı");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "RABANNE",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Dalia kendi Puig'i → prim");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Givenchy",
    marka: "RABANNE",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Atilla Puig satmış → etiket grup dışı değil");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Givenchy",
    marka: "GIVENCHY",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Atilla Givenchy parfüm → prim");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "GIVENCHY",
    aks: "PARFÜM",
    parfumUzmanSayisi: 1,
  }), false, "tek Puig'li yerde ayrım yok");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "DIOR",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Dior grup dışı etiketi değil (prim fallback)");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Givenchy",
    marka: "DIOR",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Atilla Dior → grup dışı değil (prim fallback)");
});
