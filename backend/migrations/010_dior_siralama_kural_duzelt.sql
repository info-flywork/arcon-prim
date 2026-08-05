-- ---------------------------------------------------------------
-- DIOR sıralama: ozel kalan kurallar + Boyner DIOR atama notu
--
-- DIOR bölümü (id=13) kanal=SEPHORA kalır; Boyner DIOR eşlemesi
-- importService.eslestirBolum çapraz kanal fallback ile yapılır.
-- Mevcut dönem atamaları ayrıca script ile bolum_id=13 yapılır.
--
-- 1) "Makyak ilk 1" ozel → makyaj_siralama
-- 2) BEYMEN DIOR "CİLT BAKIM İLK 3" ozel → cilt_siralama
-- ---------------------------------------------------------------

UPDATE prim_kural
   SET kriter_key = 'makyaj_siralama',
       kriter_adi = 'Makyaj ilk 1'
 WHERE id = 44 AND kriter_key = 'ozel' AND kriter_adi LIKE 'Makyak%';

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT 44, 'genel_siralama', 1, NULL, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural_hedef WHERE kural_id = 44);

UPDATE prim_kural
   SET kriter_key = 'cilt_siralama'
 WHERE id = 60 AND kriter_key = 'ozel' AND kriter_adi LIKE 'CİLT BAKIM İLK 3%';

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT 60, 'genel_siralama', 3, NULL, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural_hedef WHERE kural_id = 60);

-- LP GRUBU: Cilt 1.lik ozel → cilt_siralama
UPDATE prim_kural
   SET kriter_key = 'cilt_siralama'
 WHERE id IN (74, 78) AND kriter_key = 'ozel' AND kriter_adi LIKE 'CİLT BAKIMINDA 1%';

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT 74, 'genel_siralama', 1, NULL, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural_hedef WHERE kural_id = 74);

INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT 78, 'genel_siralama', 1, NULL, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM prim_kural_hedef WHERE kural_id = 78);
