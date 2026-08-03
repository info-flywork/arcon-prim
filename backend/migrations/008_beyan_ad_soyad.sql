-- Zeops Ad / Soyad alanlarını beyan satırında sakla (Prim Çalışma kolonları)
ALTER TABLE `satis_beyan`
  ADD COLUMN `ad` VARCHAR(100) DEFAULT NULL AFTER `uzman_ham`,
  ADD COLUMN `soyad` VARCHAR(100) DEFAULT NULL AFTER `ad`;
