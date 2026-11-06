const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "../../data/istisna-prim");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function dosyaYolu(donemId) {
  ensureDir();
  return path.join(DATA_DIR, `donem_${Number(donemId)}.json`);
}

function oku(donemId) {
  const p = dosyaYolu(donemId);
  if (!fs.existsSync(p)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function yaz(donemId, kayitlar) {
  fs.writeFileSync(dosyaYolu(donemId), JSON.stringify(kayitlar, null, 2), "utf8");
}

function ekle(donemId, kayit) {
  const liste = oku(donemId);
  const row = {
    id: crypto.randomBytes(8).toString("hex"),
    created_at: new Date().toISOString(),
    donem_id: Number(donemId),
    uzman: String(kayit.uzman || "").trim(),
    magaza: String(kayit.magaza || "").trim() || null,
    kanal: String(kayit.kanal || "").trim() || null,
    tutar: Number(kayit.tutar) || 0,
    kolon: String(kayit.kolon || "Q").toUpperCase(),
    tip: String(kayit.tip || "diger"),
    onay: String(kayit.onay || "").trim() || null,
    aciklama: String(kayit.aciklama || "").trim(),
    kaynak: "chatbot",
  };
  liste.push(row);
  yaz(donemId, liste);
  return row;
}

function sil(donemId, id) {
  const liste = oku(donemId);
  const next = liste.filter((k) => k.id !== id);
  yaz(donemId, next);
  return { silinen: liste.length - next.length };
}

function guncelle(donemId, id, patch) {
  const liste = oku(donemId);
  const i = liste.findIndex((k) => k.id === id);
  if (i < 0) return null;
  const izinli = ["uzman", "magaza", "kanal", "tutar", "kolon", "tip", "onay", "aciklama"];
  for (const k of izinli) {
    if (patch[k] !== undefined) liste[i][k] = patch[k];
  }
  if (patch.tutar !== undefined) liste[i].tutar = Number(patch.tutar) || 0;
  if (patch.kolon) liste[i].kolon = String(patch.kolon).toUpperCase();
  liste[i].updated_at = new Date().toISOString();
  yaz(donemId, liste);
  return liste[i];
}

module.exports = { oku, ekle, sil, guncelle, DATA_DIR };
