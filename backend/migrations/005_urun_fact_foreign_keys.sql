ALTER TABLE `satis_beyan`
  ADD CONSTRAINT `fk_beyan_urun` FOREIGN KEY (`urun_id`) REFERENCES `urun` (`id`),
  ADD CONSTRAINT `fk_beyan_urun_kimlik` FOREIGN KEY (`urun_kimlik_id`) REFERENCES `urun_kimlik` (`id`);

ALTER TABLE `sellout`
  ADD CONSTRAINT `fk_sellout_urun` FOREIGN KEY (`urun_id`) REFERENCES `urun` (`id`),
  ADD CONSTRAINT `fk_sellout_urun_kimlik` FOREIGN KEY (`urun_kimlik_id`) REFERENCES `urun_kimlik` (`id`);

ALTER TABLE `prim_hesap_satir`
  ADD CONSTRAINT `fk_phs_urun` FOREIGN KEY (`urun_id`) REFERENCES `urun` (`id`);
