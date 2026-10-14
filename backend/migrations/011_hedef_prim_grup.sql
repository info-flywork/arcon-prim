-- ---------------------------------------------------------------
-- Hedef modeli: marka bazından (mağaza × PRİM GRUP) bazına geçiş.
-- Birol'un çalışmasında hedef, uzmanın Sell-Out Mağazası + Prim Grubu
-- (Parfüm Tüm Markalar / Dior / Givenchy+Hermes+Dolce / Puig) ikilisine
-- göre ÇOKETOPLA ile alınıyor. importHedef artık bu kırılımda tek satır
-- yazıyor; prim_grup alanı eşleştirme anahtarı.
-- ---------------------------------------------------------------
ALTER TABLE `hedef`
  ADD COLUMN `prim_grup` VARCHAR(120) DEFAULT NULL AFTER `marka`;

ALTER TABLE `hedef`
  ADD INDEX `ix_hedef_grup` (`donem_id`,`magaza_id`,`prim_grup`);
