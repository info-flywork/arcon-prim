const test = require("node:test");
const assert = require("node:assert/strict");
const {
  puigParfumMu,
  givenchyParfumMu,
  grupDisiUrunuMu,
  parfumUzmanGrubuMu,
  puigUzmanGrubuMu,
  hgdUzmanGrubuMu,
  hermesTekGrubuMu,
  hgdTekMarkaGrubuMu,
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

test("grup dışı ürünü Puig veya Givenchy parfüm", () => {
  assert.equal(grupDisiUrunuMu("RABANNE", "PARFÜM"), true);
  assert.equal(grupDisiUrunuMu("GIVENCHY", "PARFÜM"), true);
  assert.equal(grupDisiUrunuMu("GIVENCHY", "MAKYAJ"), false);
  assert.equal(grupDisiUrunuMu("DIOR", "PARFÜM"), false);
});

test("Puig vs Hermes-Givenchy-Dolce uzman grupları", () => {
  assert.equal(puigUzmanGrubuMu("Puig"), true);
  assert.equal(puigUzmanGrubuMu("Givenchy"), false);
  assert.equal(puigUzmanGrubuMu("Parfüm Tüm Markalar"), false);
  assert.equal(puigUzmanGrubuMu("Givenchy+Hermes+Dolce"), false);
  assert.equal(hgdUzmanGrubuMu("Givenchy"), true);
  assert.equal(hgdUzmanGrubuMu("Hermes"), true);
  assert.equal(hermesTekGrubuMu("Hermes"), true);
  assert.equal(hermesTekGrubuMu("Givenchy+Hermes+Dolce"), false);
  assert.equal(hgdTekMarkaGrubuMu("Givenchy"), true);
  assert.equal(hgdTekMarkaGrubuMu("Dolce"), true);
  assert.equal(hgdTekMarkaGrubuMu("Givenchy+Hermes+Dolce"), false);
  assert.equal(hgdUzmanGrubuMu("Givenchy+Hermes+Dolce"), true);
  assert.equal(hgdUzmanGrubuMu("Puig"), false);
  assert.equal(hgdUzmanGrubuMu("Parfüm Tüm Markalar"), false);
  assert.equal(parfumUzmanGrubuMu("Givenchy"), true);
});

test("Narciso / Issey / Zadig DFB — prim dahil değil", () => {
  assert.equal(dfbPrimHaricMi("NARCISO RODRIGUEZ"), true);
  assert.equal(dfbPrimHaricMi("ISSEY MIYAKE"), true);
  assert.equal(dfbPrimHaricMi("ZADIG&VOLTAIRE"), true);
  assert.equal(dfbPrimHaricMi("PACO RABANNE"), false);
});

test("parfüm havuzu Puig+Giv+Hermes+DG", () => {
  assert.equal(parfumHavuzUrunuMu("RABANNE", null), true);
  assert.equal(parfumHavuzUrunuMu("GIVENCHY", "PARFÜM"), true);
  assert.equal(parfumHavuzUrunuMu("DIOR", "PARFÜM"), false);
});

test("mağaza parfüm uzman sayısı Puig + HGD; Dior/Sensai sayılmaz", () => {
  const map = parfumUzmanSayisiHaritasi([
    { magaza_id: 1, uzman_id: 10, grup_adi: "Givenchy" },
    { magaza_id: 1, uzman_id: 11, grup_adi: "Puig" },
    { magaza_id: 1, uzman_id: 12, grup_adi: "Puig" },
    { magaza_id: 1, uzman_id: 13, grup_adi: "Sensai" },
  ]);
  assert.equal(map.get(1), 3); // Atilla + Dalia + Uğur
  const tek = parfumUzmanSayisiHaritasi([
    { magaza_id: 2, uzman_id: 20, grup_adi: "Givenchy+Hermes+Dolce" },
  ]);
  assert.equal(tek.get(2), 1);
  const dior = parfumUzmanSayisiHaritasi([
    { magaza_id: 3, uzman_id: 30, grup_adi: "Givenchy" },
    { magaza_id: 3, uzman_id: 31, grup_adi: "Dior" },
  ]);
  assert.equal(dior.get(3), 1);
});

test("2+ uzmanda Puig ↔ HGD karşılıklı kesilir; tek uzmanda kesim yok", () => {
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "GIVENCHY",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), true, "Puigci Givenchy → grup dışı");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "DOLCE & GABBANA",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), true, "Puigci DG → grup dışı");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "HERMES",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), true, "Puigci Hermes → grup dışı");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Givenchy+Hermes+Dolce",
    marka: "RABANNE",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), true, "HGD uzmanı Puig → grup dışı");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Hermes",
    marka: "RABANNE",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Hermes tek bakıyor Puig satsa → prim");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Givenchy",
    marka: "JEAN PAUL GAULTIER",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Givenchy tek bakıyor Puig satsa → prim");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Dolce",
    marka: "RABANNE",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Dolce tek bakıyor Puig satsa → prim");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "RABANNE",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Puigci kendi Puig'i → prim");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Givenchy",
    marka: "GIVENCHY",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Atilla Givenchy → prim");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Givenchy+Hermes+Dolce",
    marka: "RABANNE",
    aks: "PARFÜM",
    parfumUzmanSayisi: 1,
  }), false, "tek uzman HGD → Puig prim");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "GIVENCHY",
    aks: "PARFÜM",
    parfumUzmanSayisi: 1,
  }), false, "tek uzman Puig → Givenchy prim");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Puig",
    marka: "DIOR",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Dior kesilmez");
  assert.equal(grupDisiSatiriMi({
    primGrup: "Parfüm Tüm Markalar",
    marka: "RABANNE",
    aks: "PARFÜM",
    parfumUzmanSayisi: 2,
  }), false, "Parfüm Tüm kesilmez");
});
