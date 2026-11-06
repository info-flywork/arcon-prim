-- Sephora · 2+ parfüm uzmanı · PUIG SIRALAMA HEDEFİ
-- Eski (yanlış / Boyner kopyası):
--   %1  → ilk 5 (1) + ilk 10 (2) + ilk 15 (1)
--   %0,5 → ilk 5 (1) + ilk 10 (1) + ilk 15 (1)
-- Güncel kriter (PRİM GÜNCEL KRİTERLER):
--   %1  → ilk 5 (1) + ilk 10 (1) + ilk 15 (1)
--   %0,5 → ilk 10 (2) + ilk 15 (1)
-- Boyner 2+ Puig (k31/k32) aynı kalır.

-- kural 14 = %1 sıralama
UPDATE prim_kural
SET kriter_adi = 'ilk 5 (1 Marka)  ilk 10 (1 Marka) , ilk 15 (1 marka)'
WHERE id = 14
  AND bolum_id = 6
  AND kriter_key = 'siralama_marka';

-- hedef id 15 = kural 14 / ilk 10
UPDATE prim_kural_hedef
SET hedef_marka_sayisi = 1
WHERE id = 15
  AND kural_id = 14
  AND hedef_sira = 10;

-- kural 15 = %0,5 sıralama (ilk 5 kalkar, ilk 10 = 2 marka)
UPDATE prim_kural
SET kriter_adi = 'ilk 10 (2 Marka) , ilk 15 (1 marka)'
WHERE id = 15
  AND bolum_id = 6
  AND kriter_key = 'siralama_marka';

DELETE FROM prim_kural_hedef
WHERE kural_id = 15
  AND hedef_sira = 5
  AND hedef_marka_sayisi = 1;

UPDATE prim_kural_hedef
SET hedef_marka_sayisi = 2, sira = 1
WHERE kural_id = 15
  AND hedef_sira = 10;

UPDATE prim_kural_hedef
SET sira = 2
WHERE kural_id = 15
  AND hedef_sira = 15;
