-- ---------------------------------------------------------------
-- Excel Prim Tablosu ile DB prim_kural_hedef arasındaki tutarsızlık düzeltmesi
--
-- Excel'de tanımlı ama DB'de eksik olan 2 sıralama hedefi ekleniyor:
--   - Kural 3 (SEPHORA Tek Uzman Puig-Hermes-DG-GIV, %0.5):
--     "ilk 10 (3 marka), ilk 12 (1 marka), ilk 15 (1 marka), ilk 17 (1 marka)"
--     DB'de "ilk 15 (1M)" hedefi eksik → ekleniyor
--   - Kural 27 (BOYNER Tek Uzman Puig-Hermes-DG-GIV, %0.5):
--     Aynı tanım, aynı eksik → ekleniyor
--
-- Bu düzeltme yapılmazsa: sıralama hedefinde 1 marka ilk 15'te olan uzman
-- için ekstra prim tetiklenmez, uzman haksız yere primsiz kalır.
-- ---------------------------------------------------------------

-- Kural 3 için "ilk 15 (1 marka)" hedefi zaten yoksa ekle
INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT 3, 'siralama_marka', 15, 1, 3
WHERE NOT EXISTS (
  SELECT 1 FROM prim_kural_hedef
  WHERE kural_id = 3 AND hedef_sira = 15 AND hedef_marka_sayisi = 1
);

-- Kural 27 için "ilk 15 (1 marka)" hedefi zaten yoksa ekle
INSERT INTO prim_kural_hedef (kural_id, hedef_tipi, hedef_sira, hedef_marka_sayisi, sira)
SELECT 27, 'siralama_marka', 15, 1, 3
WHERE NOT EXISTS (
  SELECT 1 FROM prim_kural_hedef
  WHERE kural_id = 27 AND hedef_sira = 15 AND hedef_marka_sayisi = 1
);

-- Doğrulama sorgusu (opsiyonel, çalıştırıldıktan sonra kontrol için):
-- SELECT kural_id, hedef_sira, hedef_marka_sayisi
--   FROM prim_kural_hedef
--  WHERE kural_id IN (3, 27)
--  ORDER BY kural_id, hedef_sira;
