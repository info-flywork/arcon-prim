-- ---------------------------------------------------------------
-- SENSAİ SEPHORA ve SISLEY (SEPHORA CADDE) satış primi %1.5 → %2
-- Grup toplam tavanı %3.5 → %4, max_prim_oran %3.5 → %4
--
-- Karar gerekçesi: Excel Prim Tablosu'nda satış primi %2 olarak yazılı
-- (Arcon toplantısı 31.07.2026 kararı). Matematiksel toplam %4 olur.
-- ---------------------------------------------------------------

-- 1) Bölüm 22 (SENSAİ SEPHORA) — satis_basi kuralını %2 yap
UPDATE prim_kural
   SET prim_oran = 2.0
 WHERE bolum_id = 22 AND kriter_key = 'satis_basi';

-- 2) Bölüm 22 grup_toplam kuralı %4
UPDATE prim_kural
   SET prim_oran = 4.0
 WHERE bolum_id = 22 AND satir_tipi = 'grup_toplam';

-- 3) Bölüm 22 tavan
UPDATE prim_bolum
   SET max_prim_oran = 4.00, grup_toplam_oran = 4.00
 WHERE id = 22;

-- 4) Bölüm 23 (SISLEY SEPHORA CADDE) — satis_basi kuralını %2 yap
UPDATE prim_kural
   SET prim_oran = 2.0
 WHERE bolum_id = 23 AND kriter_key = 'satis_basi';

-- 5) Bölüm 23 grup_toplam kuralı %4 (Excel'de Toplam %4 idi zaten)
UPDATE prim_kural
   SET prim_oran = 4.0
 WHERE bolum_id = 23 AND satir_tipi = 'grup_toplam';

-- 6) Bölüm 23 tavan (zaten %4'tü ama garantiye alıyoruz)
UPDATE prim_bolum
   SET max_prim_oran = 4.00, grup_toplam_oran = 4.00
 WHERE id = 23;

-- Doğrulama sorgusu (opsiyonel):
-- SELECT b.id, b.bolum_adi, b.marka_grubu_adi, b.max_prim_oran, b.grup_toplam_oran,
--        k.kriter_adi, k.prim_oran
--   FROM prim_bolum b
--   JOIN prim_kural k ON k.bolum_id = b.id
--  WHERE b.id IN (22, 23)
--  ORDER BY b.id, k.sira;
