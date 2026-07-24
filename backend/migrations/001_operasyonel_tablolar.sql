-- =====================================================================
-- Arcon Prim Sistemi — Operasyonel Tablolar
-- Mevcut kural tablolarının (prim_bolum, prim_kural, prim_kural_hedef,
-- prim_kriter_tipi, uniq_kod) üzerine eklenir.
-- Veritabanı: d87077pkbgfakv_prim_module
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------
-- 1. Dönem (ay/yıl)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `donem` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `yil` SMALLINT UNSIGNED NOT NULL,
  `ay` TINYINT UNSIGNED NOT NULL,
  `ad` VARCHAR(30) NOT NULL,                -- "Mayıs 2026"
  `durum` ENUM('acik','hesaplandi','kapandi') NOT NULL DEFAULT 'acik',
  `ek_prim_oran` DECIMAL(5,2) NOT NULL DEFAULT 0.20,  -- toplam primden ek prim %
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_donem` (`yil`,`ay`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- 2. Mağaza master (Uzman-Mağaza-Grup sekmesinden)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `magaza` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `magaza_kodu` VARCHAR(30) DEFAULT NULL,          -- 34.ERY.BOY
  `bayi` VARCHAR(50) NOT NULL,                     -- BOYNER / BEYMEN / SEPHORA / YKM...
  `magaza_adi` VARCHAR(150) NOT NULL,              -- ERENKÖY
  `prim_magaza` VARCHAR(150) NOT NULL,             -- BOYNER ERENKÖY (standart ad, eşleşme anahtarı)
  `sehir` VARCHAR(60) DEFAULT NULL,
  `bolge` VARCHAR(60) DEFAULT NULL,
  `aktif` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_prim_magaza` (`prim_magaza`),
  KEY `idx_bayi` (`bayi`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Zeops / sell-out dosyalarındaki farklı mağaza yazımlarını
-- standart mağazaya bağlayan eşleme (alias) tablosu
CREATE TABLE IF NOT EXISTS `magaza_alias` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `alias` VARCHAR(200) NOT NULL,        -- dosyada geçen ham ad (normalize edilmiş)
  `magaza_id` INT UNSIGNED NOT NULL,
  `kaynak` ENUM('zeops','sellout','siralama','hedef','manuel') NOT NULL DEFAULT 'manuel',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_alias` (`alias`),
  KEY `idx_magaza` (`magaza_id`),
  CONSTRAINT `fk_alias_magaza` FOREIGN KEY (`magaza_id`) REFERENCES `magaza`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- 3. Uzman master
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `uzman` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ad_soyad` VARCHAR(150) NOT NULL,          -- görünen ad
  `normal_ad` VARCHAR(150) NOT NULL,         -- normalize edilmiş anahtar (büyük harf, TR karakter sadeleştirilmiş)
  `aktif` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_normal_ad` (`normal_ad`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- 4. Uzman atama: uzman × mağaza × dönem × prim bölümü (senaryo)
--    NOKTA UZMAN SAYISI buradan türetilir.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `uzman_atama` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `donem_id` INT UNSIGNED NOT NULL,
  `uzman_id` INT UNSIGNED NOT NULL,
  `magaza_id` INT UNSIGNED NOT NULL,
  `bolum_id` INT UNSIGNED NOT NULL,          -- prim_bolum.id (kural senaryosu)
  `grup_adi` VARCHAR(150) DEFAULT NULL,      -- kaynak dosyadaki serbest grup adı (DIOR, PUIG...)
  `pay_orani` DECIMAL(5,2) NOT NULL DEFAULT 1.00,  -- 0,5 = yarım nokta (sheet'teki "1,5 uzman" durumları)
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_atama` (`donem_id`,`uzman_id`,`magaza_id`),
  KEY `idx_magaza` (`magaza_id`),
  KEY `idx_bolum` (`bolum_id`),
  CONSTRAINT `fk_atama_donem` FOREIGN KEY (`donem_id`) REFERENCES `donem`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_atama_uzman` FOREIGN KEY (`uzman_id`) REFERENCES `uzman`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_atama_magaza` FOREIGN KEY (`magaza_id`) REFERENCES `magaza`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_atama_bolum` FOREIGN KEY (`bolum_id`) REFERENCES `prim_bolum`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- 5. Satış beyanı (Zeops Ham Data)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `satis_beyan` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `donem_id` INT UNSIGNED NOT NULL,
  `ziyaret_id` VARCHAR(30) DEFAULT NULL,
  `uzman_id` INT UNSIGNED DEFAULT NULL,
  `uzman_ham` VARCHAR(150) DEFAULT NULL,     -- dosyadaki ham ad soyad
  `magaza_id` INT UNSIGNED DEFAULT NULL,
  `magaza_ham` VARCHAR(200) DEFAULT NULL,
  `islem_tarihi` DATE DEFAULT NULL,
  `satis_tarihi` DATE DEFAULT NULL,
  `durum` VARCHAR(50) DEFAULT NULL,
  `barkod` VARCHAR(50) DEFAULT NULL,
  `kod` VARCHAR(80) DEFAULT NULL,
  `etiket` VARCHAR(255) DEFAULT NULL,
  `adet` INT NOT NULL DEFAULT 1,
  `fiyat` DECIMAL(12,2) DEFAULT NULL,
  `toplam` DECIMAL(12,2) DEFAULT NULL,
  `satis_notlari` VARCHAR(255) DEFAULT NULL,
  `uniq_kod_id` INT UNSIGNED DEFAULT NULL,   -- uniq_kod.id eşleşmesi
  `eslesme_durum` ENUM('ok','urun_yok','magaza_yok','uzman_yok','atama_yok') DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_donem` (`donem_id`),
  KEY `idx_uzman` (`uzman_id`),
  KEY `idx_magaza` (`magaza_id`),
  KEY `idx_barkod` (`barkod`),
  KEY `idx_eslesme` (`eslesme_durum`),
  CONSTRAINT `fk_beyan_donem` FOREIGN KEY (`donem_id`) REFERENCES `donem`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- 6. Sell-out (bayi resmi satış)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sellout` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `donem_id` INT UNSIGNED NOT NULL,
  `bayi` VARCHAR(50) DEFAULT NULL,
  `urun_adi` VARCHAR(255) DEFAULT NULL,
  `arcon_referans` VARCHAR(80) DEFAULT NULL,
  `arcon_barkod` VARCHAR(50) DEFAULT NULL,
  `adet` INT NOT NULL DEFAULT 0,
  `ciro_kdv_haric` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `magaza_id` INT UNSIGNED DEFAULT NULL,
  `magaza_ham` VARCHAR(200) DEFAULT NULL,
  `marka` VARCHAR(100) DEFAULT NULL,
  `marka_grup` VARCHAR(100) DEFAULT NULL,
  `urun_grubu` VARCHAR(60) DEFAULT NULL,     -- PARFÜM / MAKYAJ / CİLT BAKIM
  `uniq_kod_id` INT UNSIGNED DEFAULT NULL,
  `eslesme_durum` ENUM('ok','urun_yok','magaza_yok') DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_donem` (`donem_id`),
  KEY `idx_magaza` (`magaza_id`),
  KEY `idx_barkod` (`arcon_barkod`),
  KEY `idx_uniq` (`uniq_kod_id`),
  CONSTRAINT `fk_sellout_donem` FOREIGN KEY (`donem_id`) REFERENCES `donem`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- 7. Ciro hedefleri (Mayıs Hedef sekmesi)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hedef` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `donem_id` INT UNSIGNED NOT NULL,
  `magaza_id` INT UNSIGNED DEFAULT NULL,
  `magaza_ham` VARCHAR(200) DEFAULT NULL,
  `marka` VARCHAR(100) NOT NULL,
  `hedef_ciro` DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hedef` (`donem_id`,`magaza_id`,`marka`),
  CONSTRAINT `fk_hedef_donem` FOREIGN KEY (`donem_id`) REFERENCES `donem`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- 8. Sıralamalar (Mayıs Sıralama sekmesi)
--    cesit: 1-PARFÜM / 2-MAKYAJ / 3-CİLT ... kategori sıralamaları
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `siralama` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `donem_id` INT UNSIGNED NOT NULL,
  `magaza_id` INT UNSIGNED DEFAULT NULL,
  `magaza_ham` VARCHAR(200) DEFAULT NULL,
  `cesit` VARCHAR(60) DEFAULT NULL,
  `marka` VARCHAR(100) NOT NULL,
  `sira` SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_siralama` (`donem_id`,`magaza_id`,`cesit`,`marka`),
  CONSTRAINT `fk_siralama_donem` FOREIGN KEY (`donem_id`) REFERENCES `donem`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- 9. Hesap sonuçları
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `prim_hesap_satir` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `donem_id` INT UNSIGNED NOT NULL,
  `beyan_id` BIGINT UNSIGNED NOT NULL,
  `uzman_id` INT UNSIGNED NOT NULL,
  `magaza_id` INT UNSIGNED NOT NULL,
  `bolum_id` INT UNSIGNED DEFAULT NULL,
  `uniq_kod_id` INT UNSIGNED DEFAULT NULL,
  `beyan_adet` INT NOT NULL,
  `prim_adet` INT NOT NULL,                       -- sell-out ile sınırlanmış adet
  `birim_ciro` DECIMAL(12,2) NOT NULL DEFAULT 0,  -- sell-out KDV hariç birim ciro
  `prime_esas_tutar` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `aciklama` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_donem_uzman` (`donem_id`,`uzman_id`),
  CONSTRAINT `fk_phs_donem` FOREIGN KEY (`donem_id`) REFERENCES `donem`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `prim_ozet` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `donem_id` INT UNSIGNED NOT NULL,
  `uzman_id` INT UNSIGNED NOT NULL,
  `magaza_id` INT UNSIGNED NOT NULL,
  `bolum_id` INT UNSIGNED DEFAULT NULL,
  `prime_esas_toplam` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `satis_prim_oran` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `satis_prim` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `hedef_prim_oran` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `hedef_prim` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `siralama_prim_oran` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `siralama_prim` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `bonus_oran` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `bonus_prim` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `devreden_prim` DECIMAL(14,2) NOT NULL DEFAULT 0,   -- önceki dönemden kalan
  `ek_prim` DECIMAL(14,2) NOT NULL DEFAULT 0,         -- toplam primden % (dönem parametresi)
  `toplam_oran` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `toplam_prim` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `detay_json` JSON DEFAULT NULL,                     -- hangi kural neden tuttu/tutmadı
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ozet` (`donem_id`,`uzman_id`,`magaza_id`),
  CONSTRAINT `fk_ozet_donem` FOREIGN KEY (`donem_id`) REFERENCES `donem`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- 10. Import log
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `import_log` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `donem_id` INT UNSIGNED DEFAULT NULL,
  `tip` ENUM('zeops','sellout','hedef','siralama','uzman_magaza','uniq_kod') NOT NULL,
  `dosya_adi` VARCHAR(255) DEFAULT NULL,
  `satir_sayisi` INT NOT NULL DEFAULT 0,
  `hatali_satir` INT NOT NULL DEFAULT 0,
  `mesaj` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- Kural verisindeki tespit edilen eksikler için düzeltmeler
-- (Prim Tablosu sekmesindeki metinle karşılaştırıldı)
-- kural 3: "ilk 15 (1 marka)" hedefi girilmemiş
-- kural 10: "ilk 15 (5 marka)" hedefi girilmemiş
-- ---------------------------------------------------------------
INSERT INTO `prim_kural_hedef` (`kural_id`,`hedef_tipi`,`hedef_sira`,`hedef_marka_sayisi`,`sira`)
SELECT 3,'siralama_marka',15,1,4 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `prim_kural_hedef` WHERE `kural_id`=3 AND `hedef_sira`=15);

INSERT INTO `prim_kural_hedef` (`kural_id`,`hedef_tipi`,`hedef_sira`,`hedef_marka_sayisi`,`sira`)
SELECT 10,'siralama_marka',15,5,3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `prim_kural_hedef` WHERE `kural_id`=10 AND `hedef_sira`=15);

INSERT INTO `prim_kural_hedef` (`kural_id`,`hedef_tipi`,`hedef_sira`,`hedef_marka_sayisi`,`sira`)
SELECT 27,'siralama_marka',15,1,4 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `prim_kural_hedef` WHERE `kural_id`=27 AND `hedef_sira`=15);
