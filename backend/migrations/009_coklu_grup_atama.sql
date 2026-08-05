-- Aynı uzman + mağaza için birden fazla marka grubu atamasına izin ver
-- (örn. Akın Karyağ @ SEPHORA M1 ADANA → Puig + Givenchy+Hermes+Dolce)

ALTER TABLE `uzman_atama`
  DROP INDEX `uk_atama`,
  ADD UNIQUE KEY `uk_atama` (`donem_id`, `uzman_id`, `magaza_id`, `bolum_id`);

-- Özet de uzman × mağaza × bölüm bazında ayrı satır tutabilsin
ALTER TABLE `prim_ozet`
  DROP INDEX `uk_ozet`,
  ADD UNIQUE KEY `uk_ozet` (`donem_id`, `uzman_id`, `magaza_id`, `bolum_id`);
