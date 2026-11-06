-- Mağaza × marka × AKS kataloğu (hangi mağazada hangi marka / hangi AKS satılıyor)
CREATE TABLE IF NOT EXISTS `magaza_marka_aks` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `bayi` VARCHAR(40) NULL,
  `prim_magaza` VARCHAR(150) NOT NULL,
  `magaza_id` INT UNSIGNED NULL,
  `marka` VARCHAR(120) NOT NULL,
  `marka_norm` VARCHAR(120) NOT NULL,
  `aks` VARCHAR(255) NULL,
  `aks_norm` VARCHAR(255) NULL,
  `kaynak` VARCHAR(80) NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_magaza_marka` (`prim_magaza`, `marka_norm`),
  KEY `idx_magaza_id` (`magaza_id`),
  KEY `idx_marka_norm` (`marka_norm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
