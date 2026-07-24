-- Değişiklik izi: prim = maaş; kim, ne zaman, neyi değiştirdi kaydı zorunlu.
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tablo` VARCHAR(50) NOT NULL,
  `kayit_id` VARCHAR(50) DEFAULT NULL,
  `islem` ENUM('ekleme','guncelleme','silme','kilit','hesap') NOT NULL,
  `detay` JSON DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tablo` (`tablo`),
  KEY `idx_tarih` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
