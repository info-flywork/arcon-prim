CREATE TABLE `urun` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uniq_kod` VARCHAR(100) NOT NULL,
  `marka` VARCHAR(120) NOT NULL,
  `urun_adi` VARCHAR(255) NOT NULL,
  `aks` VARCHAR(60) DEFAULT NULL,
  `cinsiyet` VARCHAR(30) DEFAULT NULL,
  `durum` ENUM('aktif','inceleme','pasif') NOT NULL DEFAULT 'aktif',
  `birlesilen_urun_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_urun_uniq_kod` (`uniq_kod`),
  KEY `idx_urun_marka_ad` (`marka`,`urun_adi`),
  KEY `idx_urun_durum` (`durum`),
  CONSTRAINT `fk_urun_birlesilen` FOREIGN KEY (`birlesilen_urun_id`) REFERENCES `urun` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `urun_kimlik` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `urun_id` BIGINT UNSIGNED NOT NULL,
  `tip` ENUM('barkod','referans','stok_kodu') NOT NULL,
  `deger_ham` VARCHAR(150) NOT NULL,
  `deger_normalize` VARCHAR(150) NOT NULL,
  `kaynak` VARCHAR(40) NOT NULL DEFAULT 'migration',
  `aktif` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_urun_kimlik` (`tip`,`deger_normalize`),
  KEY `idx_urun_kimlik_urun` (`urun_id`),
  CONSTRAINT `fk_urun_kimlik_urun` FOREIGN KEY (`urun_id`) REFERENCES `urun` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `urun_legacy_map` (
  `legacy_uniq_kod_id` INT UNSIGNED NOT NULL,
  `urun_id` BIGINT UNSIGNED NOT NULL,
  `esleme_nedeni` VARCHAR(80) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`legacy_uniq_kod_id`),
  KEY `idx_legacy_map_urun` (`urun_id`),
  CONSTRAINT `fk_legacy_map_legacy` FOREIGN KEY (`legacy_uniq_kod_id`) REFERENCES `uniq_kod` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_legacy_map_urun` FOREIGN KEY (`urun_id`) REFERENCES `urun` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `urun_esleme_cakisma` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tip` ENUM('barkod','referans','stok_kodu','uniq_kod') NOT NULL,
  `deger_ham` VARCHAR(150) DEFAULT NULL,
  `deger_normalize` VARCHAR(150) NOT NULL,
  `kaynak` VARCHAR(60) NOT NULL,
  `aday_urunler_json` JSON NOT NULL,
  `durum` ENUM('acik','cozuldu','yoksayildi') NOT NULL DEFAULT 'acik',
  `cozulen_urun_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cakisma_tip_deger` (`tip`,`deger_normalize`),
  KEY `idx_cakisma_durum` (`durum`),
  CONSTRAINT `fk_cakisma_cozulen` FOREIGN KEY (`cozulen_urun_id`) REFERENCES `urun` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `satis_beyan`
  ADD COLUMN `urun_id` BIGINT UNSIGNED DEFAULT NULL AFTER `uniq_kod_id`,
  ADD COLUMN `urun_kimlik_id` BIGINT UNSIGNED DEFAULT NULL AFTER `urun_id`,
  ADD COLUMN `eslesme_yontemi` VARCHAR(40) DEFAULT NULL AFTER `urun_kimlik_id`,
  MODIFY COLUMN `eslesme_durum`
    ENUM('ok','urun_yok','urun_cakisma','kimlik_gecersiz','magaza_yok','uzman_yok','atama_yok') DEFAULT NULL,
  ADD KEY `idx_beyan_urun` (`urun_id`),
  ADD KEY `idx_beyan_urun_kimlik` (`urun_kimlik_id`);

ALTER TABLE `sellout`
  ADD COLUMN `urun_id` BIGINT UNSIGNED DEFAULT NULL AFTER `uniq_kod_id`,
  ADD COLUMN `urun_kimlik_id` BIGINT UNSIGNED DEFAULT NULL AFTER `urun_id`,
  ADD COLUMN `eslesme_yontemi` VARCHAR(40) DEFAULT NULL AFTER `urun_kimlik_id`,
  MODIFY COLUMN `eslesme_durum`
    ENUM('ok','urun_yok','urun_cakisma','kimlik_gecersiz','magaza_yok') DEFAULT NULL,
  ADD KEY `idx_sellout_urun` (`urun_id`),
  ADD KEY `idx_sellout_urun_kimlik` (`urun_kimlik_id`);

ALTER TABLE `prim_hesap_satir`
  ADD COLUMN `urun_id` BIGINT UNSIGNED DEFAULT NULL AFTER `uniq_kod_id`,
  ADD KEY `idx_phs_urun` (`urun_id`);
