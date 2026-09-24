// Beymen özel (cilt) — Ağustos / Eylül ayrımı.
// Kaynak: Prim Çalışma sayfası "Ağustos Beymen özel (cilt)".
//
// Ağustos (1-30):
//   Niche (Penhaligon's & ByRedo) mağaza sıralaması, Hermes hariç.
//   Sıra eşiği "Ağustos +3": 4 / 5 / 6 / 7 / 10 / 13.
//   Ciro primi yok. İstisna: Suadiye'de Byredo %1, Tersane'de Byredo ve Penhaligon's %1.
//   İki markaya bakan uzmanda tutarlar yarı.
//   Tersane'de bu çift yerine kendi kademesi: birincilik 30.000, ilk 4 = 20.000, ilk 7 = 10.000.
//   DBS cilt: La Prairie varsa ilk 3 = 30.000 / ilk 2 = 60.000;
//   La Prairie yoksa eşik bir sıra sıkılaşır. 2 mağaza yarı, 3 mağaza üçte bir.
//   DBS ciro kazancı %1, markanın kendi prime esas tutarı üzerinden.
//
// Eylül:
//   Sensai, Sisley, La Prairie cilt (ve makyaj) kademeleri + o markada %1.
//   Niche tablosu Eylül sıralarıyla (1 / 2 / 3 / 4 / 7 / 10), Hermes hariç, ciro yok.
//   İzmir İstinyepark: Hermes uzmanı %1, DBS ilk 2 = 10.000.
//   Suadiye: Dior uzmanı %1, DBS ilk 2 = 10.000, Byredo 30 / 20 / 10 bin.
//   Aqua Florya: Givenchy uzmanı %1, DBS ilk 2 = 10.000.
//   Tersane: Byredo + Penhaligon's + L'Artisan %1, DBS ilk 2 = 10.000 ve %1,
//   CH makyaj ilk 1 = 20.000 / ilk 2 = 10.000, CH parfüm ilk 5 = 20.000 / ilk 10 = 10.000.
const { normalizeName } = require("../util");

const NICHE_AGUSTOS_TEK = [
  { max: 4, tutar: 100000 },
  { max: 5, tutar: 90000 },
  { max: 6, tutar: 80000 },
  { max: 7, tutar: 70000 },
  { max: 10, tutar: 50000 },
  { max: 13, tutar: 25000 },
];
const NICHE_AGUSTOS_IKI = NICHE_AGUSTOS_TEK.map((k) => ({ max: k.max, tutar: k.tutar / 2 }));
const NICHE_EYLUL_TEK = [
  { max: 1, tutar: 100000 },
  { max: 2, tutar: 90000 },
  { max: 3, tutar: 80000 },
  { max: 4, tutar: 70000 },
  { max: 7, tutar: 50000 },
  { max: 10, tutar: 25000 },
];
const NICHE_EYLUL_IKI = NICHE_EYLUL_TEK.map((k) => ({ max: k.max, tutar: k.tutar / 2 }));
const TERSANE_AGUSTOS = [
  { max: 1, tutar: 30000 },
  { max: 4, tutar: 20000 },
  { max: 7, tutar: 10000 },
];
const SUADIYE_BYREDO = TERSANE_AGUSTOS;

function markaAnahtar(marka) {
  const n = normalizeName(marka);
  if (!n) return null;
  if (n.includes("BYREDO")) return "BYREDO";
  if (n.includes("PENHALIGON")) return "PENHALIGON";
  if (n.includes("ARTISAN")) return "LARTISAN";
  if (n.includes("DRIES") || n.includes("VAN NOTEN")) return "DRIES";
  if (n.includes("STURM") || (n.includes("BARBARA") && n.includes("DR"))) return "DBS";
  if (n.includes("HERMES")) return "HERMES";
  if (n.includes("DIOR")) return "DIOR";
  if (n.includes("GIVENCHY") || n === "GIV") return "GIVENCHY";
  if (n.includes("HERRERA") || n.includes("CAROLINA")) return "CH";
  if (n.includes("PRAIRIE") || n === "LP") return "LP";
  if (n.includes("SISLEY")) return "SISLEY";
  if (n.includes("SENSAI")) return "SENSAI";
  return null;
}

/**
 * Ağustos Beymen ciro %1.
 * Byredo ve Penhaligon's yazılmaz.
 * Suadiye'de Byredo yazılır. Tersane'de Byredo ve Penhaligon's yazılır.
 * DBS ve diğer markalar bu kesintinin dışında kalır.
 */
function agustosBeymenNicheCiroPrimVar(magaza, marka) {
  const tip = magazaTip(magaza);
  if (!tip) return true;
  const anahtar = markaAnahtar(marka);
  if (anahtar !== "BYREDO" && anahtar !== "PENHALIGON") return true;
  if (tip === "TERSANE") return true;
  if (tip === "SUADIYE" && anahtar === "BYREDO") return true;
  return false;
}

function magazaTip(ad) {
  const n = normalizeName(ad || "");
  if (!n.includes("BEYMEN")) return null;
  if (n.includes("TERSANE")) return "TERSANE";
  if (n.includes("SUADIYE")) return "SUADIYE";
  if (n.includes("AQUA")) return "AQUA";
  if (n.includes("IZMIR") && n.includes("ISTINYE")) return "IZMIR_ISTINYE";
  return "DIGER";
}

function kademeTutar(sira, kademeler) {
  if (sira == null || !Number.isFinite(sira)) return 0;
  for (const k of kademeler) {
    if (sira <= k.max) return k.tutar;
  }
  return 0;
}

function siraIndex(siralar) {
  const by = new Map();
  for (const r of siralar || []) {
    const key = `${r.magazaId}|${r.cesit}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push({ marka: normalizeName(r.marka), sira: Number(r.sira) });
  }
  return by;
}

/** Markanın en iyi sırası. exclude daha iyi sıradaki markaları düşer (Hermes / La Prairie). */
function enIyiSira(index, magazaId, cesit, kabul, exclude) {
  const list = index.get(`${magazaId}|${cesit}`) || [];
  const benim = list.filter((x) => kabul(x.marka) && Number.isFinite(x.sira));
  if (!benim.length) return null;
  const ham = Math.min(...benim.map((x) => x.sira));
  if (!exclude) return ham;
  const dus = list.filter((x) => x.sira < ham && exclude(x.marka)).length;
  return ham - dus;
}

function hermesMi(marka) {
  return marka.includes("HERMES");
}
function lpMi(marka) {
  return marka.includes("PRAIRIE") || marka === "LP";
}
function byredoMu(marka) {
  return marka.includes("BYREDO");
}
function penhaligonMu(marka) {
  return marka.includes("PENHALIGON");
}
function driesMu(marka) {
  return marka.includes("DRIES") || marka.includes("VAN NOTEN");
}
function artisanMu(marka) {
  return marka.includes("ARTISAN");
}
/** PUIG Niche: Byredo, Penhaligon's, L'Artisan, Dries Van Noten. DBS cilt tablosunda ayrı. */
function nicheParfumMu(marka) {
  return byredoMu(marka) || penhaligonMu(marka) || artisanMu(marka) || driesMu(marka);
}

function tl(n) {
  return +Number(n || 0).toFixed(2);
}

function yuzdeTutar(esas, oran) {
  return tl(Number(esas || 0) * oran / 100);
}

/**
 * @returns {Map<string, {tutar:number, detay:object[]}>} anahtar uzmanId|magazaId
 */
function beymenCiltPrimleri({ kuralSeti, satirlar, siralar, magazaAd }) {
  const set = String(kuralSeti || "").toLocaleLowerCase("tr-TR");
  const sonuc = new Map();
  if (set !== "agustos" && set !== "eylul") return sonuc;

  const index = siraIndex(siralar);
  const adOf = (id) => {
    if (!magazaAd) return "";
    if (typeof magazaAd.get === "function") {
      return magazaAd.get(id) || magazaAd.get(Number(id)) || "";
    }
    return magazaAd[id] || "";
  };

  // uzman|magaza|markaKey -> esas
  const hucre = new Map();
  const uzmanMagazalar = new Map(); // uzman -> Set magaza
  for (const s of satirlar || []) {
    const key = markaAnahtar(s.marka);
    const tip = magazaTip(adOf(s.magazaId));
    if (!key || !tip || !(s.esas > 0)) continue;
    const hk = `${s.uzmanId}|${s.magazaId}|${key}`;
    hucre.set(hk, (hucre.get(hk) || 0) + Number(s.esas));
    if (!uzmanMagazalar.has(s.uzmanId)) uzmanMagazalar.set(s.uzmanId, new Set());
    uzmanMagazalar.get(s.uzmanId).add(s.magazaId);
  }

  function esas(uzmanId, magazaId, key) {
    return hucre.get(`${uzmanId}|${magazaId}|${key}`) || 0;
  }

  function ekle(uzmanId, magazaId, tutar, detay) {
    if (!(tutar > 0)) return;
    const k = `${uzmanId}|${magazaId}`;
    if (!sonuc.has(k)) sonuc.set(k, { tutar: 0, detay: [] });
    const o = sonuc.get(k);
    o.tutar = tl(o.tutar + tutar);
    o.detay.push({ ...detay, tutar: tl(tutar), tuttu: true, tip: "beymen_cilt" });
  }

  // DBS mağaza sayısı (Ağustos tutar ölçeği) — sadece DBS satışı olan Beymen mağazaları
  const dbsMagazaSayisi = new Map();
  for (const [hk] of hucre) {
    const [uzmanId, magazaId, key] = hk.split("|");
    if (key !== "DBS") continue;
    if (!dbsMagazaSayisi.has(uzmanId)) dbsMagazaSayisi.set(uzmanId, new Set());
    dbsMagazaSayisi.get(uzmanId).add(magazaId);
  }

  const dbsAday = [];
  const çiftler = new Set();
  for (const hk of hucre.keys()) {
    const [uzmanId, magazaId] = hk.split("|");
    çiftler.add(`${uzmanId}|${magazaId}`);
  }

  for (const cift of çiftler) {
    const [uzmanId, magazaId] = cift.split("|");
    const tip = magazaTip(adOf(Number(magazaId) || magazaId));
    const uid = Number(uzmanId) || uzmanId;
    const mid = Number(magazaId) || magazaId;

    const byredo = esas(uid, mid, "BYREDO");
    const pen = esas(uid, mid, "PENHALIGON");
    const lartisan = esas(uid, mid, "LARTISAN");
    const dries = esas(uid, mid, "DRIES");
    const dbs = esas(uid, mid, "DBS");
    const ikiMarka = byredo > 0 && pen > 0;

    if (set === "agustos") {
      if (tip === "TERSANE" && (byredo > 0 || pen > 0 || lartisan > 0 || dries > 0)) {
        const sira = enIyiSira(index, mid, "PARFUM", nicheParfumMu, hermesMi);
        const tutar = kademeTutar(sira, TERSANE_AGUSTOS);
        ekle(uid, mid, tutar, {
          kural: "Tersane Niche (Ağustos)",
          kriter: "beymen_cilt",
          sira,
          not: "Byredo, Penhaligon's, L'Artisan, Dries. Birincilik 30.000 / ilk 4 = 20.000 / ilk 7 = 10.000. Ciro primi yok.",
        });
      } else if (byredo > 0 || pen > 0 || lartisan > 0 || dries > 0) {
        const sira = enIyiSira(index, mid, "PARFUM", nicheParfumMu, hermesMi);
        const tablo = ikiMarka ? NICHE_AGUSTOS_IKI : NICHE_AGUSTOS_TEK;
        const tutar = kademeTutar(sira, tablo);
        ekle(uid, mid, tutar, {
          kural: ikiMarka
            ? "PUIG Niche iki marka (Ağustos +3)"
            : "PUIG Niche tek uzman (Ağustos +3)",
          kriter: "beymen_cilt",
          sira,
          not: "Byredo, Penhaligon's, L'Artisan, Dries. Hermes hariç. Ciro primi yok.",
        });
      }

      if (dbs > 0) {
        const lpVar = (index.get(`${mid}|CILT`) || []).some((x) => lpMi(x.marka));
        const sira = enIyiSira(index, mid, "CILT", (m) => m.includes("STURM") || m.includes("BARBARA"), null);
        const magSay = dbsMagazaSayisi.get(String(uid))?.size || dbsMagazaSayisi.get(uid)?.size || 1;
        const tutar = dbsAgustosTutar(sira, magSay, lpVar);
        dbsAday.push({ uid, mid, tutar, sira, magSay, lpVar });
        ekle(uid, mid, yuzdeTutar(dbs, 1), {
          kural: "DBS ciro %1 (Ağustos)",
          kriter: "beymen_cilt",
          oran: 1,
          esas_baz: tl(dbs),
        });
      }
    }

    if (set === "eylul") {
      if (tip === "SUADIYE" && byredo > 0) {
        const sira = enIyiSira(index, mid, "PARFUM", byredoMu, hermesMi);
        ekle(uid, mid, kademeTutar(sira, SUADIYE_BYREDO), {
          kural: "Suadiye Byredo (Eylül)",
          kriter: "beymen_cilt",
          sira,
        });
      }
      const genelPen = pen > 0 || lartisan > 0 || dries > 0;
      const genelByredo = byredo > 0 && tip !== "SUADIYE";
      if (genelByredo || genelPen) {
        const sira = enIyiSira(
          index,
          mid,
          "PARFUM",
          (m) => (genelByredo && byredoMu(m)) || (pen > 0 && penhaligonMu(m)) || (lartisan > 0 && artisanMu(m)) || (dries > 0 && driesMu(m)),
          hermesMi
        );
        const tablo = (genelByredo && genelPen) ? NICHE_EYLUL_IKI : NICHE_EYLUL_TEK;
        ekle(uid, mid, kademeTutar(sira, tablo), {
          kural: (genelByredo && genelPen)
            ? "Penhaligon's & ByRedo iki marka (Eylül)"
            : "Penhaligon's & ByRedo tek uzman (Eylül)",
          kriter: "beymen_cilt",
          sira,
          not: "Hermes hariç. Ciro primi yok.",
        });
      }

      if (tip === "TERSANE") {
        const nicheEsas = byredo + pen + lartisan + dries;
        ekle(uid, mid, yuzdeTutar(nicheEsas, 1), {
          kural: "Tersane Byredo + Penhaligon's + L'Artisan %1 (Eylül)",
          kriter: "beymen_cilt",
          oran: 1,
          esas_baz: tl(nicheEsas),
        });
        const chMak = enIyiSira(index, mid, "MAKYAJ", (m) => m.includes("HERRERA") || m.includes("CAROLINA"), null);
        const chPar = enIyiSira(index, mid, "PARFUM", (m) => m.includes("HERRERA") || m.includes("CAROLINA"), null);
        if (esas(uid, mid, "CH") > 0) {
          const makTutar = chMak != null && chMak <= 1 ? 20000 : chMak != null && chMak <= 2 ? 10000 : 0;
          const parTutar = chPar != null && chPar <= 5 ? 20000 : chPar != null && chPar <= 10 ? 10000 : 0;
          ekle(uid, mid, makTutar, { kural: "Tersane CH makyaj (Eylül)", kriter: "beymen_cilt", sira: chMak });
          ekle(uid, mid, parTutar, { kural: "Tersane CH parfüm (Eylül)", kriter: "beymen_cilt", sira: chPar });
        }
      }

      if (tip === "IZMIR_ISTINYE") {
        ekle(uid, mid, yuzdeTutar(esas(uid, mid, "HERMES"), 1), {
          kural: "İzmir İstinyepark Hermes uzmanı %1 (Eylül)",
          kriter: "beymen_cilt",
          oran: 1,
          esas_baz: tl(esas(uid, mid, "HERMES")),
        });
      }
      if (tip === "SUADIYE") {
        ekle(uid, mid, yuzdeTutar(esas(uid, mid, "DIOR"), 1), {
          kural: "Suadiye Dior uzmanı %1 (Eylül)",
          kriter: "beymen_cilt",
          oran: 1,
          esas_baz: tl(esas(uid, mid, "DIOR")),
        });
      }
      if (tip === "AQUA") {
        ekle(uid, mid, yuzdeTutar(esas(uid, mid, "GIVENCHY"), 1), {
          kural: "Aqua Florya Givenchy uzmanı %1 (Eylül)",
          kriter: "beymen_cilt",
          oran: 1,
          esas_baz: tl(esas(uid, mid, "GIVENCHY")),
        });
      }

      const dbsMagaza = tip === "IZMIR_ISTINYE" || tip === "SUADIYE" || tip === "AQUA" || tip === "TERSANE";
      if (dbs > 0 && dbsMagaza) {
        const sira = enIyiSira(index, mid, "CILT", (m) => m.includes("STURM") || m.includes("BARBARA"), null);
        if (sira != null && sira <= 2) {
          ekle(uid, mid, 10000, {
            kural: "DBS ilk 2 = 10.000 (Eylül)",
            kriter: "beymen_cilt",
            sira,
          });
        }
        if (tip === "TERSANE") {
          ekle(uid, mid, yuzdeTutar(dbs, 1), {
            kural: "Tersane DBS ciro %1 (Eylül)",
            kriter: "beymen_cilt",
            oran: 1,
            esas_baz: tl(dbs),
          });
        }
      }

      eylulMarkaBlok(ekle, index, uid, mid, esas(uid, mid, "LP"), "CILT", (m) => lpMi(m), [
        { max: 1, tutar: 60000 },
        { max: 2, tutar: 30000 },
      ], null, "La Prairie cilt (Eylül)");
      eylulMarkaBlok(ekle, index, uid, mid, esas(uid, mid, "SENSAI"), "CILT", (m) => m.includes("SENSAI"), [
        { max: 3, tutar: 40000 },
        { max: 5, tutar: 20000 },
      ], [
        { max: 8, tutar: 20000 },
        { max: 10, tutar: 10000 },
      ], "Sensai (Eylül)");
      eylulMarkaBlok(ekle, index, uid, mid, esas(uid, mid, "SISLEY"), "CILT", (m) => m.includes("SISLEY"), [
        { max: 4, tutar: 40000 },
        { max: 6, tutar: 20000 },
      ], [
        { max: 8, tutar: 20000 },
        { max: 10, tutar: 10000 },
      ], "Sisley (Eylül)");
    }
  }

  const enIyiDbs = new Map();
  for (const aday of dbsAday) {
    const once = enIyiDbs.get(aday.uid);
    if (!once || aday.tutar > once.tutar) enIyiDbs.set(aday.uid, aday);
  }
  for (const aday of enIyiDbs.values()) {
    const n = Math.min(aday.magSay || 1, 3);
    ekle(aday.uid, aday.mid, aday.tutar, {
      kural: `DBS cilt (Ağustos, ${n} mağaza)`,
      kriter: "beymen_cilt",
      sira: aday.sira,
      not: aday.lpVar ? "La Prairie sıralamada var" : "La Prairie yok, eşik bir sıra sıkı",
    });
  }

  return sonuc;
}

function dbsAgustosTutar(sira, magSay, lpVar) {
  if (sira == null) return 0;
  const n = magSay >= 3 ? 3 : magSay === 2 ? 2 : 1;
  const tablo = {
    1: { ust: 60000, alt: 30000 },
    2: { ust: 30000, alt: 15000 },
    3: { ust: 20000, alt: 10000 },
  }[n];
  const ustMax = lpVar ? 2 : 1;
  const altMax = lpVar ? 3 : 2;
  if (sira <= ustMax) return tablo.ust;
  if (sira <= altMax) return tablo.alt;
  return 0;
}

function eylulMarkaBlok(ekle, index, uid, mid, markaEsas, cesit, kabul, ciltKademe, makyajKademe, ad) {
  if (!(markaEsas > 0)) return;
  const sira = enIyiSira(index, mid, cesit, kabul, null);
  ekle(uid, mid, kademeTutar(sira, ciltKademe), {
    kural: ad,
    kriter: "beymen_cilt",
    sira,
  });
  if (makyajKademe) {
    const mak = enIyiSira(index, mid, "MAKYAJ", kabul, null);
    ekle(uid, mid, kademeTutar(mak, makyajKademe), {
      kural: `${ad} makyaj`,
      kriter: "beymen_cilt",
      sira: mak,
    });
  }
  ekle(uid, mid, yuzdeTutar(markaEsas, 1), {
    kural: `${ad} ciro %1`,
    kriter: "beymen_cilt",
    oran: 1,
    esas_baz: tl(markaEsas),
  });
}

module.exports = { beymenCiltPrimleri, markaAnahtar, magazaTip, agustosBeymenNicheCiroPrimVar };
