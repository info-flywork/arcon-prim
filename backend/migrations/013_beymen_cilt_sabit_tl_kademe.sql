-- Beymen cilt sabit TL kademeleri (Prim Çalışma tablosu):
-- La Prairie: ilk2=30.000 / ilk1=60.000 + ciro %1
-- Sensai: cilt ilk5=20.000 / ilk3=40.000 ; makyaj ilk10=10.000 / ilk8=20.000 + ciro %1
-- Sisley: cilt ilk6=20.000 / ilk4=40.000 ; makyaj ilk10=10.000 / ilk8=20.000 + ciro %1
-- (DBS kademeleri kodda: beymenCiltKural — ayrı bölüm satırı yok)

-- ---- LP BEYMEN (bolum 19) ----
UPDATE prim_kural
   SET kriter_adi = 'CİLT BAKIMINDA İLK 1',
       kriter_key = 'cilt_siralama',
       prim_tip = 'sabit_tl',
       prim_tutar = 60000,
       prim_oran = 0
 WHERE id = 74;

UPDATE prim_kural_hedef SET hedef_sira = 1 WHERE kural_id = 74;

INSERT INTO prim_kural (bolum_id, kriter_key, kural_key, kriter_adi, prim_oran, prim_tip, prim_tutar, satir_tipi, not_metni, sira)
SELECT 19, 'cilt_siralama', 'cilt_ilk_2_lp_beymen', 'CİLT BAKIMINDA İLK 2', 0, 'sabit_tl', 30000, 'kural',
       'Beymen LP cilt sıralama sabit TL', 74
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural WHERE kural_key = 'cilt_ilk_2_lp_beymen');

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT k.id, 'sira', 2, NULL, 1
FROM prim_kural k
WHERE k.kural_key = 'cilt_ilk_2_lp_beymen'
  AND NOT EXISTS (SELECT 1 FROM prim_kural_hedef h WHERE h.kural_id = k.id);

-- Beymen LP mağaza 1. bu tabloda yok → etkisiz
UPDATE prim_kural SET prim_oran = 0, prim_tip = 'yuzde', prim_tutar = 0 WHERE id = 75;

-- ---- SENSAİ BEYMEN (bolum 21) ----
UPDATE prim_kural
   SET kriter_adi = 'CİLT BAKIMINDA İLK 3',
       kriter_key = 'cilt_siralama',
       prim_tip = 'sabit_tl',
       prim_tutar = 40000,
       prim_oran = 0
 WHERE id = 82;

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT 82, 'sira', 3, NULL, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural_hedef WHERE kural_id = 82);

INSERT INTO prim_kural (bolum_id, kriter_key, kural_key, kriter_adi, prim_oran, prim_tip, prim_tutar, satir_tipi, not_metni, sira)
SELECT 21, 'cilt_siralama', 'cilt_ilk_5_sensai_beymen', 'CİLT BAKIMINDA İLK 5', 0, 'sabit_tl', 20000, 'kural',
       'Beymen Sensai cilt sıralama sabit TL', 82
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural WHERE kural_key = 'cilt_ilk_5_sensai_beymen');

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT k.id, 'sira', 5, NULL, 1
FROM prim_kural k
WHERE k.kural_key = 'cilt_ilk_5_sensai_beymen'
  AND NOT EXISTS (SELECT 1 FROM prim_kural_hedef h WHERE h.kural_id = k.id);

UPDATE prim_kural
   SET kriter_adi = 'MAKYAJDA İLK 8',
       kriter_key = 'makyaj_siralama',
       prim_tip = 'sabit_tl',
       prim_tutar = 20000,
       prim_oran = 0
 WHERE id = 83;

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT 83, 'sira', 8, NULL, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural_hedef WHERE kural_id = 83);

INSERT INTO prim_kural (bolum_id, kriter_key, kural_key, kriter_adi, prim_oran, prim_tip, prim_tutar, satir_tipi, not_metni, sira)
SELECT 21, 'makyaj_siralama', 'makyaj_ilk_10_sensai_beymen', 'MAKYAJDA İLK 10', 0, 'sabit_tl', 10000, 'kural',
       'Beymen Sensai makyaj sıralama sabit TL', 83
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural WHERE kural_key = 'makyaj_ilk_10_sensai_beymen');

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT k.id, 'sira', 10, NULL, 1
FROM prim_kural k
WHERE k.kural_key = 'makyaj_ilk_10_sensai_beymen'
  AND NOT EXISTS (SELECT 1 FROM prim_kural_hedef h WHERE h.kural_id = k.id);

-- ---- SISLEY BEYMEN (bolum 14) ----
UPDATE prim_kural
   SET kriter_adi = 'CİLT BAKIMINDA İLK 4',
       kriter_key = 'cilt_siralama',
       prim_tip = 'sabit_tl',
       prim_tutar = 40000,
       prim_oran = 0
 WHERE id = 49;

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT 49, 'sira', 4, NULL, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural_hedef WHERE kural_id = 49);

INSERT INTO prim_kural (bolum_id, kriter_key, kural_key, kriter_adi, prim_oran, prim_tip, prim_tutar, satir_tipi, not_metni, sira)
SELECT 14, 'cilt_siralama', 'cilt_ilk_6_sisley_beymen', 'CİLT BAKIMINDA İLK 6', 0, 'sabit_tl', 20000, 'kural',
       'Beymen Sisley cilt sıralama sabit TL', 49
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural WHERE kural_key = 'cilt_ilk_6_sisley_beymen');

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT k.id, 'sira', 6, NULL, 1
FROM prim_kural k
WHERE k.kural_key = 'cilt_ilk_6_sisley_beymen'
  AND NOT EXISTS (SELECT 1 FROM prim_kural_hedef h WHERE h.kural_id = k.id);

UPDATE prim_kural
   SET kriter_adi = 'MAKYAJDA İLK 8',
       kriter_key = 'makyaj_siralama',
       prim_tip = 'sabit_tl',
       prim_tutar = 20000,
       prim_oran = 0
 WHERE id = 50;

UPDATE prim_kural_hedef SET hedef_sira = 8 WHERE kural_id = 50;

INSERT INTO prim_kural (bolum_id, kriter_key, kural_key, kriter_adi, prim_oran, prim_tip, prim_tutar, satir_tipi, not_metni, sira)
SELECT 14, 'makyaj_siralama', 'makyaj_ilk_10_sisley_beymen', 'MAKYAJDA İLK 10', 0, 'sabit_tl', 10000, 'kural',
       'Beymen Sisley makyaj sıralama sabit TL', 50
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural WHERE kural_key = 'makyaj_ilk_10_sisley_beymen');

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT k.id, 'sira', 10, NULL, 1
FROM prim_kural k
WHERE k.kural_key = 'makyaj_ilk_10_sisley_beymen'
  AND NOT EXISTS (SELECT 1 FROM prim_kural_hedef h WHERE h.kural_id = k.id);
