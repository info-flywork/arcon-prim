-- Dönem bazlı serbest özel durum / kural talimatı (prim hesabında kullanılır)
ALTER TABLE `donem`
  ADD COLUMN `ozel_talimat` TEXT NULL AFTER `ek_prim_oran`;
