-- Kural ödülü: yüzde (%) veya sabit TL.
-- prim_tip = 'yuzde' → prim_oran kullanılır (mevcut davranış)
-- prim_tip = 'sabit_tl' → koşul tutunca prim_tutar TL eklenir

ALTER TABLE prim_kural
  ADD COLUMN prim_tip ENUM('yuzde','sabit_tl') NOT NULL DEFAULT 'yuzde' AFTER prim_oran,
  ADD COLUMN prim_tutar DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER prim_tip;

DROP VIEW IF EXISTS prim_table;

CREATE VIEW prim_table AS
SELECT
  k.id AS id,
  b.bolum_key AS bolum_key,
  b.bolum_adi AS bolum_adi,
  b.kanal AS kanal,
  b.alt_kanal AS alt_kanal,
  b.uzman_tipi AS uzman_tipi,
  b.marka_grubu_key AS marka_grubu_key,
  b.marka_grubu_adi AS marka_grubu_adi,
  b.markalar AS markalar,
  b.max_prim_oran AS max_prim_oran,
  b.grup_toplam_oran AS grup_toplam_oran,
  kt.kriter_key AS kriter_key,
  kt.kriter_adi AS kriter_tipi,
  kt.kategori AS kategori,
  k.kural_key AS kural_key,
  k.kriter_adi AS kriter_adi,
  k.prim_oran AS prim_oran,
  k.prim_tip AS prim_tip,
  k.prim_tutar AS prim_tutar,
  k.satir_tipi AS satir_tipi,
  k.not_metni AS not_metni,
  k.sira AS sira
FROM prim_kural k
JOIN prim_bolum b ON b.id = k.bolum_id
JOIN prim_kriter_tipi kt ON kt.kriter_key = k.kriter_key;
