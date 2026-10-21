-- Sephora 2+ uzman sayfası: HERMES-DG-GIV (Givenchy).
-- Eski havuz yalnız HERMES+DG idi; Givenchy uzmanı ilk 6 / ilk 8 hesabına girmiyordu.
UPDATE prim_bolum
SET markalar = JSON_ARRAY('HERMES', 'DG', 'GIV')
WHERE id = 7
  AND marka_grubu_key = 'hermes_dg_siralama_hedefi';
