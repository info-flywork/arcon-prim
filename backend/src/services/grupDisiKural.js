// =====================================================================
// İki rakip parfüm grubu:
//   Puig = Rabanne, Jean Paul Gaultier, Carolina Herrera
//   HGD  = Hermes, Givenchy, Dolce
// Tek uzmanlı mağazada kural yok — sattığına prim.
// 2+ parfüm sorumlusu varsa karşı grubun parfümü Grup Dışı (prim yok).
// Parfüm Tüm / Dior / Sensai / LP bu kesime girmez.
// Narciso / Issey / Zadig DFB — Prime Dahil Değil.
// =====================================================================
const { normalizeName } = require("../util");

const PUIG_PARCALAR = [
  "PUIG", "RABANNE", "PACO", "GAULTIER", "HERRERA",
  "NINA RICCI", "CAROLINA", "JEAN PAUL", "JPG",
];

function aksParfumMu(aks) {
  return normalizeName(aks || "").includes("PARFUM");
}

function puigMarkaMi(marka, markaGrup) {
  const m = normalizeName(marka || "");
  const g = normalizeName(markaGrup || "");
  if (g === "PUIG" || g.startsWith("PUIG ")) return true;
  if (!m) return false;
  if (m.includes("NINA") && m.includes("RICCI")) return true;
  return PUIG_PARCALAR.some((p) => m.includes(p));
}

function givenchyMarkaMi(marka, markaGrup) {
  const m = normalizeName(marka || "");
  const g = normalizeName(markaGrup || "");
  if (g === "GIV" || g === "GIVENCHY" || g.startsWith("GIV ")) return true;
  return m.includes("GIVENCHY") || m === "GIV";
}

function hermesMarkaMi(marka, markaGrup) {
  const m = normalizeName(marka || "");
  const g = normalizeName(markaGrup || "");
  return g.includes("HERMES") || m.includes("HERMES");
}

function dgMarkaMi(marka, markaGrup) {
  const m = normalizeName(marka || "");
  const g = normalizeName(markaGrup || "");
  if (g === "DG" || g.includes("DOLCE") || g.includes("GABBANA")) return true;
  return m.includes("DOLCE") || m.includes("GABBANA") || m.includes("D&G") || m === "DG";
}

/** Puig ürünleri pratikte parfüm; AKS boşsa da parfüm sayılır. */
function puigParfumMu(marka, aks, markaGrup) {
  if (!puigMarkaMi(marka, markaGrup)) return false;
  const a = normalizeName(aks || "");
  return !a || a.includes("PARFUM");
}

/** Givenchy makyaj/cilt ayrı; parfüm ancak AKS=PARFÜM iken. */
function givenchyParfumMu(marka, aks, markaGrup) {
  return givenchyMarkaMi(marka, markaGrup) && aksParfumMu(aks);
}

function hgdParfumMu(marka, aks, markaGrup) {
  if (puigMarkaMi(marka, markaGrup)) return false;
  if (!aksParfumMu(aks)) return false;
  return givenchyMarkaMi(marka, markaGrup)
    || hermesMarkaMi(marka, markaGrup)
    || dgMarkaMi(marka, markaGrup);
}

function grupDisiUrunuMu(marka, aks, markaGrup) {
  return puigParfumMu(marka, aks, markaGrup) || givenchyParfumMu(marka, aks, markaGrup);
}

/** Atama grubu parfüm havuzu mu? (Puig / Givenchy / Hermes / DG / Parfüm Tüm) */
function parfumUzmanGrubuMu(grupAdi) {
  const g = normalizeName(grupAdi || "");
  if (!g) return false;
  if (g.includes("PARFUM") || g.includes("TUM MARKA")) return true;
  if (g.includes("PUIG") || g.includes("RABANNE") || g.includes("GAULTIER") || g.includes("HERRERA")) return true;
  if (g.includes("GIVENCHY")) return true;
  if (g.includes("HERMES")) return true;
  if (g.includes("DOLCE") || g.includes("GABBANA") || g.includes("D&G")) return true;
  if (/(^|[^A-Z])GIV([^A-Z]|$)/.test(g) && !g.includes("SENSAI")) return true;
  if (/(^|[^A-Z])DG([^A-Z]|$)/.test(g)) return true;
  return false;
}

/** Puig uzmanı (Rabanne / JPG / Carolina). Hermes-Giv-Dolce ve Parfüm Tüm değil. */
function puigUzmanGrubuMu(grupAdi) {
  const g = normalizeName(grupAdi || "");
  if (!g) return false;
  if (g.includes("TUM MARKA")) return false;
  if (g.includes("GIVENCHY") || g.includes("HERMES") || g.includes("DOLCE") || g.includes("GABBANA")) {
    return false;
  }
  if (/(^|[^A-Z])GIV([^A-Z]|$)/.test(g)) return false;
  if (/(^|[^A-Z])DG([^A-Z]|$)/.test(g) && !g.includes("PUIG")) return false;
  return g.includes("PUIG") || g.includes("RABANNE") || g.includes("GAULTIER") || g.includes("HERRERA");
}

/** Hermes / Givenchy / Dolce sorumlusu (tek Hermes veya Giv+Hermes+Dolce). Puig ve Parfüm Tüm değil. */
function hgdUzmanGrubuMu(grupAdi) {
  const g = normalizeName(grupAdi || "");
  if (!g) return false;
  if (g.includes("TUM MARKA")) return false;
  if (puigUzmanGrubuMu(grupAdi)) return false;
  if (g.includes("GIVENCHY") || g.includes("HERMES") || g.includes("DOLCE") || g.includes("GABBANA")) {
    return true;
  }
  if (/(^|[^A-Z])GIV([^A-Z]|$)/.test(g) && !g.includes("SENSAI")) return true;
  if (/(^|[^A-Z])DG([^A-Z]|$)/.test(g)) return true;
  return false;
}

function hgdParcaSayisi(grupAdi) {
  const g = normalizeName(grupAdi || "");
  let n = 0;
  if (g.includes("HERMES")) n += 1;
  if (g.includes("GIVENCHY") || (/(^|[^A-Z])GIV([^A-Z]|$)/.test(g) && !g.includes("SENSAI"))) n += 1;
  if (g.includes("DOLCE") || g.includes("GABBANA") || (/(^|[^A-Z])DG([^A-Z]|$)/.test(g) && !g.includes("PUIG"))) n += 1;
  return n;
}

/** Yalnız bir HGD markasına bakıyor (Hermes veya Givenchy veya Dolce). */
function hgdTekMarkaGrubuMu(grupAdi) {
  return hgdUzmanGrubuMu(grupAdi) && hgdParcaSayisi(grupAdi) === 1;
}

/** Yalnız Hermes bakıyor. */
function hermesTekGrubuMu(grupAdi) {
  return hgdTekMarkaGrubuMu(grupAdi) && normalizeName(grupAdi || "").includes("HERMES");
}

/** Puig satışı yalnız Giv+Hermes+Dolce (2+ marka) grubunda kesilir. Tek Giv / tek Hermes / tek Dolce kesilmez. */
function hgdPuigKesilirGrubuMu(grupAdi) {
  return hgdUzmanGrubuMu(grupAdi) && hgdParcaSayisi(grupAdi) >= 2;
}

function parfumHavuzUrunuMu(marka, aks, markaGrup) {
  return puigParfumMu(marka, aks, markaGrup) || hgdParfumMu(marka, aks, markaGrup);
}

/** Excel SATIŞ TÜRÜ: DFB GRUP-Prime Dahil Değil — Narciso / Issey / Zadig. */
function dfbPrimHaricMi(marka) {
  const m = normalizeName(marka || "");
  if (!m) return false;
  if (m.includes("NARCISO")) return true;
  if (m.includes("ISSEY") || m.includes("MIYAKE")) return true;
  if (m.includes("ZADIG")) return true;
  return false;
}

function uzmanSayisiHaritasi(atamalar, grupFn) {
  const byMag = new Map();
  for (const a of atamalar || []) {
    if (!grupFn(a.grup_adi)) continue;
    if (a.magaza_id == null || a.uzman_id == null) continue;
    if (!byMag.has(a.magaza_id)) byMag.set(a.magaza_id, new Set());
    byMag.get(a.magaza_id).add(a.uzman_id);
  }
  const out = new Map();
  for (const [id, set] of byMag) out.set(id, set.size);
  return out;
}

function puigUzmanSayisiHaritasi(atamalar) {
  return uzmanSayisiHaritasi(atamalar, puigUzmanGrubuMu);
}

/** Mağazadaki Puig + Hermes/Giv/DG + Parfüm Tüm sorumluları. Dior/Sensai/LP sayılmaz. */
function parfumUzmanSayisiHaritasi(atamalar) {
  return uzmanSayisiHaritasi(atamalar, parfumUzmanGrubuMu);
}

function parfumUzmanAtamasi(atamalar, uzmanId, magazaId) {
  const list = (atamalar || []).filter(
    (a) => a.uzman_id === uzmanId && a.magaza_id === magazaId && parfumUzmanGrubuMu(a.grup_adi)
  );
  return list[0] || null;
}

/**
 * 2+ parfüm sorumlusu varsa:
 *   Puig uzmanı → Hermes/Givenchy/Dolce parfüm kesilir
 *   Givenchy+Hermes+Dolce grubu → Puig kesilir
 *   Tek Hermes / tek Givenchy / tek Dolce Puig satsa prim (kesilmez)
 * Tek uzmanlı yerde kesim yok.
 */
function grupDisiSatiriMi({
  primGrup,
  marka,
  aks,
  markaGrup,
  parfumUzmanSayisi,
  puigUzmanSayisi,
} = {}) {
  const n = Number(parfumUzmanSayisi ?? puigUzmanSayisi ?? 0);
  if (n < 2) return false;
  if (puigUzmanGrubuMu(primGrup)) return hgdParfumMu(marka, aks, markaGrup);
  if (hgdPuigKesilirGrubuMu(primGrup)) return puigParfumMu(marka, aks, markaGrup);
  return false;
}

module.exports = {
  aksParfumMu,
  puigMarkaMi,
  givenchyMarkaMi,
  puigParfumMu,
  givenchyParfumMu,
  hgdParfumMu,
  grupDisiUrunuMu,
  parfumUzmanGrubuMu,
  puigUzmanGrubuMu,
  hgdUzmanGrubuMu,
  hermesTekGrubuMu,
  hgdTekMarkaGrubuMu,
  hgdPuigKesilirGrubuMu,
  parfumHavuzUrunuMu,
  dfbPrimHaricMi,
  puigUzmanSayisiHaritasi,
  parfumUzmanSayisiHaritasi,
  parfumUzmanAtamasi,
  grupDisiSatiriMi,
};
