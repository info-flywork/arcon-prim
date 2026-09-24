const { normalizeName } = require("../util");

/** Mağaza hücresi GEZİCİ olanlar + ayrıca Rabia Çolduk. Bayi fark etmez, Zeops mağazası kalır. */
const GEZICI_ADLAR = [
  "Dilberin Yiğit",
  "Dılbırin Yiğit",
  "Tuğba Eryuva",
  "Burak Ünverdi",
  "Dalia Kasap",
  "Dalıa Kasap",
  "Uğur Hamarat",
  "Rabia Çolduk",
].map((ad) => normalizeName(ad));

function geziciUzmanMi(adVeyaNormal) {
  const n = normalizeName(adVeyaNormal || "");
  if (!n || n.endsWith(" TOPLAM")) return false;
  return GEZICI_ADLAR.includes(n);
}

/**
 * Zeops mağazası dosyada varsa ya da aynı bayideyse kalır
 * (Beymen Zorlu ataması, Zeops Beymen İstinye → alınır).
 * Bayi farklıysa prim yazılmaz (Beymen ataması, Zeops Boyner → alınmaz).
 * Gezicide Zeops mağazası her zaman kalır.
 * Dönüş null ise satır prime girmez.
 */
function resolvePrimMagaza({ uzmanNormal, zeopsMagazaId, atamalar, bayiOf }) {
  if (zeopsMagazaId == null) return zeopsMagazaId;
  if (geziciUzmanMi(uzmanNormal)) return zeopsMagazaId;
  const dosya = (atamalar || []).filter((a) => a.kaynak !== "zeops");
  const dosyaBayi = new Set(dosya.map((a) => bayiOf(a.magaza_id)));
  const zeopsBayi = bayiOf(zeopsMagazaId);
  if (dosya.some((a) => a.magaza_id === zeopsMagazaId) || (zeopsBayi && dosyaBayi.has(zeopsBayi))) {
    return zeopsMagazaId;
  }
  return null;
}

module.exports = { geziciUzmanMi, GEZICI_ADLAR, resolvePrimMagaza };
