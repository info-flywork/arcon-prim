// =====================================================================
// Grup dışı yalnızca o noktanın sorumlu Puig uzmanında (Dalia, Uğur):
// 2+ Puig uzmanlı mağazada Givenchy / Hermes / DG parfüm etiketlenir.
// Givenchy çalışanı (Atilla) kesilmez — sattığına prim (Dior, Sensai dahil).
// Tek Puig'li noktada ayrım yok. Kalan herkese sattığı prim.
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
  // "GIV" tek başına veya + ile (GIV+HERMES) — SENSAI'ye denk gelmesin
  if (/(^|[^A-Z])GIV([^A-Z]|$)/.test(g) && !g.includes("SENSAI")) return true;
  if (/(^|[^A-Z])DG([^A-Z]|$)/.test(g)) return true;
  return false;
}

/**
 * Asıl Puig uzmanı (Dalia / Uğur). Givenchy, Hermes, Parfüm Tüm sayılmaz.
 * Grup dışı kuralı yalnızca bunları keser.
 */
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

function parfumHavuzUrunuMu(marka, aks, markaGrup) {
  if (puigParfumMu(marka, aks, markaGrup)) return true;
  if (!aksParfumMu(aks)) return false;
  return givenchyMarkaMi(marka, markaGrup)
    || hermesMarkaMi(marka, markaGrup)
    || dgMarkaMi(marka, markaGrup);
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

/** mağaza_id → Puig uzmanı adedi (Dalia/Uğur tipi). Givenchy çalışanı sayılmaz. */
function puigUzmanSayisiHaritasi(atamalar) {
  const byMag = new Map();
  for (const a of atamalar || []) {
    if (!puigUzmanGrubuMu(a.grup_adi)) continue;
    if (a.magaza_id == null || a.uzman_id == null) continue;
    if (!byMag.has(a.magaza_id)) byMag.set(a.magaza_id, new Set());
    byMag.get(a.magaza_id).add(a.uzman_id);
  }
  const out = new Map();
  for (const [id, set] of byMag) out.set(id, set.size);
  return out;
}

/** Eski ad: artık yalnızca Puig uzmanını sayar. */
function parfumUzmanSayisiHaritasi(atamalar) {
  return puigUzmanSayisiHaritasi(atamalar);
}

function parfumUzmanAtamasi(atamalar, uzmanId, magazaId) {
  const list = (atamalar || []).filter(
    (a) => a.uzman_id === uzmanId && a.magaza_id === magazaId && parfumUzmanGrubuMu(a.grup_adi)
  );
  return list[0] || null;
}

/**
 * Grup Dışı etiketi yalnız sorumlu Puig uzmanında: 2+ Puig + Giv/Hermes/DG
 * parfüm. Atilla ve diğerleri kesilmez — sattıklarına prim.
 */
function grupDisiSatiriMi({
  primGrup,
  marka,
  aks,
  markaGrup,
  parfumUzmanSayisi,
  puigUzmanSayisi,
} = {}) {
  const n = Number(puigUzmanSayisi ?? parfumUzmanSayisi ?? 0);
  if (n < 2) return false;
  if (!puigUzmanGrubuMu(primGrup)) return false;
  if (puigParfumMu(marka, aks, markaGrup)) return false;
  return parfumHavuzUrunuMu(marka, aks, markaGrup);
}

module.exports = {
  aksParfumMu,
  puigMarkaMi,
  givenchyMarkaMi,
  puigParfumMu,
  givenchyParfumMu,
  grupDisiUrunuMu,
  parfumUzmanGrubuMu,
  puigUzmanGrubuMu,
  parfumHavuzUrunuMu,
  dfbPrimHaricMi,
  puigUzmanSayisiHaritasi,
  parfumUzmanSayisiHaritasi,
  parfumUzmanAtamasi,
  grupDisiSatiriMi,
};
