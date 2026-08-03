# TEST PAKETİ — BEKLENEN SONUÇLAR (Manuel Hesaplı)

**Fake veri ama gerçek gibi:** Gerçek mağaza adları (SEPHORA CEVAHİR, BEYMEN ZORLU vs), gerçek Türk uzman isimleri (sistemde olmayan yeni kişiler), gerçekçi Arcon Referans / Barkod formatı.

**Önemli:** Bunu yüklerken **YENİ BİR DÖNEM** oluştur (ör: "TEST-2026") ki gerçek Mayıs/Haziran verilerini bozmasın. Sistem donem_id ile ayrıştırıyor.

## Yükleme sırası

1. `test_uzman_magaza_grup.xlsx` — Uzman-Mağaza-Grup master
2. `test_sellout.xlsx` — Sell-Out Data
3. `test_zeops.xlsx` — Zeops Ham Data
4. (Opsiyonel) `test_hedef.xlsx`, `test_siralama.xlsx`, `test_stok.xlsx`

## Uzmanlar (sistemde daha önce olmayanlar)

| Uzman | Mağaza | Grup | Prim Bölümü | Satış Başına Oran |
|---|---|---|---|---|
| Deniz Yıldız | SEPHORA CEVAHİR | Puig | Sephora Tek Uzman | %1 |
| Meryem Kaptan | BEYMEN ZORLU | Dolce & Gabbana | Beymen DG | %1.5 |
| Kerem Aslan | BOYNER İSTİNYE PARK | Hermes | Boyner Tek Uzman | %1 |
| Sibel Bakır | BEYMEN SUADİYE | Sensai | Sensai Grubu Beymen | %1.5 |
| Onur Şahin | SEPHORA KANYON | Puig | Sephora 2+ Uzman (grup) | %1 |
| Zeynep Kılıç | SEPHORA KANYON | Hermes | Sephora 2+ Uzman (grup) | %1 |

## Kilit prensipler

- **Prim adet = beyan adet** (Excel mantığı)
- **Birim ciro** = sellout ciro / sellout adet (aynı mağaza × ürün)
- **Prime esas** = prim adet × birim ciro
- **Satış primi** = prime esas × bölüm oranı
- İade/İptal satırları hesaba girmez
- Sell-out'ta olmayan ürün → 0 prim
- Uzmanın atamalı olduğu mağazada satış → hesaba girer

---

## SENARYO 1 — Deniz Yıldız / SEPHORA CEVAHİR (Puig, %1)

**Sell-out:**

| Kod | Ürün | Sellout Adet | Sellout Ciro | Birim Ciro |
|---|---|---|---|---|
| PPR65240001 | RABANNE INVICTUS EDT 100ML | 5 | 5.000 TL | **1.000 TL** |
| PCH65240002 | CAROLINA HERRERA GOOD GIRL 80ML | 3 | 3.000 TL | **1.000 TL** |

**Zeops:**

| Ziyaret | Durum | Kod | Adet | Prime Esas |
|---|---|---|---|---|
| 900001 | Tamamlandı | PPR65240001 | 1 | **1.000** |
| 900002 | Tamamlandı | PPR65240001 | 1 | **1.000** |
| 900003 | Tamamlandı | PCH65240002 | 1 | **1.000** |
| 900004 | **İade** | PCH65240002 | 1 | 0 |
| 900005 | Tamamlandı | PPR65240001 | 1 | **1.000** |

**Beklenen:** 4 adet · **4.000 TL prime esas** · %1 = **40 TL prim**

---

## SENARYO 2 — Meryem Kaptan / BEYMEN ZORLU (D&G, %1.5)

**Sell-out:**

| Kod | Ürün | Sellout Adet | Sellout Ciro | Birim Ciro |
|---|---|---|---|---|
| DGIP1TO1S01 | DG Q EDPI 100ML | 4 | 40.000 TL | **10.000 TL** |
| DGI89663500004 | DG TOO EDPI 100ML | 2 | 15.000 TL | **7.500 TL** |

**Zeops:**

| Ziyaret | Durum | Kod | Adet | Prime Esas |
|---|---|---|---|---|
| 900006 | Tamamlandı | DGIP1TO1S01 | 1 | 10.000 |
| 900007 | Tamamlandı | DGIP1TO1S01 | 1 | 10.000 |
| 900008 | Tamamlandı | DGIP1TO1S01 | 1 | 10.000 |
| 900009 | Tamamlandı | DGI89663500004 | 1 | 7.500 |
| 900010 | Tamamlandı | DGI89663500004 | 1 | 7.500 |
| 900011 | **İptal** | DGIP1TO1S01 | 1 | 0 |

**Beklenen:** 5 adet · **45.000 TL prime esas** · %1.5 = **675 TL prim**

---

## SENARYO 3 — Kerem Aslan / BOYNER İSTİNYE PARK (Hermes, %1)

**Sell-out:**

| Kod | Ürün | Sellout Adet | Sellout Ciro | Birim Ciro |
|---|---|---|---|---|
| HRM65240005 | HERMES TERRE EDT 100ML | 2 | 4.000 TL | **2.000 TL** |
| HRM65240006 | HERMES ROUGE HERMES 100ML | 3 | 9.000 TL | **3.000 TL** |

**Zeops:**

| Ziyaret | Durum | Kod | Adet | Prime Esas | Not |
|---|---|---|---|---|---|
| 900012 | Tamamlandı | HRM65240005 | 1 | 2.000 | |
| 900013 | Tamamlandı | HRM65240006 | 1 | 3.000 | |
| 900014 | Tamamlandı | HRM65240006 | 1 | 3.000 | |
| 900015 | Tamamlandı | HRM65240007 | 1 | **0** | Sell-out'ta yok! |

**Beklenen:** 3 adet (900015 hariç) · **8.000 TL prime esas** · %1 = **80 TL prim** · 1 satır hesap dışı

---

## SENARYO 4 — Sibel Bakır / BEYMEN SUADİYE (Sensai, %1.5)

**Sell-out:**

| Kod | Ürün | Sellout Adet | Sellout Ciro | Birim Ciro |
|---|---|---|---|---|
| SNS65240008 | SENSAI CELLULAR CREAM 50ML | 2 | 6.000 TL | **3.000 TL** |
| SNS65240009 | SENSAI SILKY MASK | 1 | 2.000 TL | **2.000 TL** |

**Zeops:**

| Ziyaret | Durum | Kod | Adet | Prime Esas |
|---|---|---|---|---|
| 900016 | Tamamlandı | SNS65240008 | 1 | 3.000 |
| 900017 | Tamamlandı | SNS65240008 | 1 | 3.000 |
| 900018 | Tamamlandı | SNS65240009 | 1 | 2.000 |

**Beklenen:** 3 adet · **8.000 TL prime esas** · %1.5 = **120 TL prim**

---

## SENARYO 5 — Grup Satış / SEPHORA KANYON (%1 her ikisi)

**Sell-out:**

| Kod | Ürün | Sellout Adet | Sellout Ciro | Birim Ciro |
|---|---|---|---|---|
| PPR65240010 | RABANNE PACO 100ML | 5 | 15.000 TL | **3.000 TL** |
| HRM65240011 | HERMES TERRE 200ML | 3 | 9.000 TL | **3.000 TL** |

**Onur Şahin (Puig):**

| Ziyaret | Kod | Adet | Prime Esas |
|---|---|---|---|
| 900019 | PPR65240010 | 1 | 3.000 |
| 900020 | PPR65240010 | 1 | 3.000 |
| 900021 | PPR65240010 | 1 | 3.000 |

Beklenen: 3 adet · **9.000 TL** · %1 = **90 TL prim**

**Zeynep Kılıç (Hermes):**

| Ziyaret | Kod | Adet | Prime Esas |
|---|---|---|---|
| 900022 | HRM65240011 | 1 | 3.000 |
| 900023 | HRM65240011 | 1 | 3.000 |

Beklenen: 2 adet · **6.000 TL** · %1 = **60 TL prim**

---

## GENEL TOPLAM — Beklenen Sistem Çıktısı

| Uzman | Mağaza | Bölüm | Prim Adet | Prime Esas | Oran | Satış Primi |
|---|---|---|---|---|---|---|
| Deniz Yıldız | SEPHORA CEVAHİR | Sephora Tek Uzman (Puig) | 4 | 4.000 | %1 | **40 TL** |
| Meryem Kaptan | BEYMEN ZORLU | Beymen DG | 5 | 45.000 | %1.5 | **675 TL** |
| Kerem Aslan | BOYNER İSTİNYE PARK | Boyner Tek Uzman (Hermes) | 3 | 8.000 | %1 | **80 TL** |
| Sibel Bakır | BEYMEN SUADİYE | Sensai Beymen | 3 | 8.000 | %1.5 | **120 TL** |
| Onur Şahin | SEPHORA KANYON | Sephora 2+ Uzman (Puig) | 3 | 9.000 | %1 | **90 TL** |
| Zeynep Kılıç | SEPHORA KANYON | Sephora 2+ Uzman (Hermes) | 2 | 6.000 | %1 | **60 TL** |

**Toplam:** 20 prim adet · **80.000 TL prime esas** · **1.065 TL satış primi**

---

## Test Adımları

1. Özet → **+ Yeni Dönem** → "TEST-2026" oluştur ve aktif et
2. **Veri Yükleme** ekranından sırayla yükle:
   - Uzman-Mağaza-Grup → `test_uzman_magaza_grup.xlsx`
   - Sell-Out Data → `test_sellout.xlsx`
   - Zeops Ham Data → `test_zeops.xlsx`
3. Özet → **Primleri Hesapla**
4. **Satış Primi** ekranı — Bu tablo yukarıdaki "GENEL TOPLAM" ile birebir eşleşmeli
5. Her uzmana tıklayıp **detay modalını** aç — Prim Adet, Birim Ciro, Prime Esas birebir eşleşmeli
6. **Prim Raporu** ekranı — bölüm bazlı gerçek oranlarla (%1 veya %1.5) net prim gösterir

Herhangi bir uzman × mağazanın sonucu farklı çıkarsa, o senaryoyu birlikte satır satır incelenir — bug var demektir.
