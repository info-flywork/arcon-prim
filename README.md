# Arcon Prim Sistemi

Uzman (satış danışmanı) primlerini hesaplayan sistem.
**Backend:** Node.js (Express) · **Frontend:** Next.js · **DB:** MySQL (`d87077pkbgfakv_prim_module`)

## Mimari

```
Excel dosyaları ──► Backend API (import) ──► MySQL ──► Hesap Motoru ──► Rapor ekranları
                        :4000                                              Next.js :3000
```

Mevcut kural tabloları (`prim_bolum`, `prim_kural`, `prim_kural_hedef`, `prim_kriter_tipi`, `uniq_kod`)
olduğu gibi kullanılır; migration yalnızca operasyonel tabloları ekler.

## Kurulum

```bash
# 1) Backend
cd backend
npm install
cp .env.example .env        # DB şifresini doldur
npm run migrate             # operasyonel tabloları oluşturur
npm run dev                 # http://localhost:4000

# 2) Frontend (yeni terminal)
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

## Aylık Girdi Dosyaları (Excel)

Sadece **ham kaynak** dosyalar yüklenir — Google Sheets'teki formüllü ara sekmeler sisteme taşındı, artık gerekmez.

| # | Dosya | Sheets'teki karşılığı | Sıklık |
|---|-------|----------------------|--------|
| 1 | Uzman-Mağaza-Grup | `Uzman-Mağaza-Grup` | Değişince (master) |
| 2 | Sell-out Data | `Mayıs Sell-out Data` | Aylık |
| 3 | Zeops Ham Data | `Mayıs Zeops Ham Data` | Aylık |
| 4 | Ciro Hedefleri | `Mayıs Hedef` | Aylık |
| 5 | Marka Sıralamaları | `Mayıs Sıralama` | Aylık |

Yükleme sırası önemli: **önce 1 ve 2** (mağaza/ürün eşleşmesi bunlara dayanır), sonra 3-4-5.
`Çalışılmış İlk Kısım`, `Prim Çalışma*`, `Stok Liste`, `Uniq Kod` sekmeleri **girdi değildir** —
stok/uniq verisi DB'deki `uniq_kod` tablosunda yaşar, eksik ürünler Eşleşmeyenler ekranından eklenir.

## Aylık İş Akışı

1. **Dönem oluştur** (Özet sayfası)
2. **Dosyaları yükle** (Veri Yükleme) — yükleme sonuçları ve eşleşmeyen sayıları anında görünür
3. **Eşleşmeyenleri temizle** (Eşleşmeyenler): barkod→UNIQ kod bağla, mağaza adı→standart mağaza eşle, dosyayı tekrar yükle
4. **Atamaları kontrol et** (Uzman Atamaları): senaryo (prim bölümü) yanlışsa düzelt
5. **Primleri Hesapla** (Özet)
6. **Raporu incele / CSV al** (Prim Raporu) — satır detayı + kural değerlendirme JSON'u ile denetlenebilir

## Hesap Mantığı (özet)

- Birim ciro = sell-out ciro / sell-out adet (mağaza × UNIQ ürün)
- Prim adedi sell-out adediyle sınırlanır (fazla beyan prim almaz, satırda "kısmi prim" notu düşülür)
- Prime esas tutar = prim adedi × birim ciro; uzmanın marka grubu dışındaki ürünler prim dışı
- Satış primi + (tutarsa) ciro hedefi + sıralama + bonus kalemleri; bölüm tavanıyla sınırlanır
- Dönem parametresi olarak ek prim (%0,20 varsayılan) toplam üzerine eklenir
- Sonuçlar `prim_hesap_satir` (satır) ve `prim_ozet` (uzman × mağaza, detay_json ile) tablolarına yazılır

## Bilinen Açık Noktalar (Arcon ile netleştirilecek)

- `ozel` kriterli kurallar (ör. Beymen "CİLT BAKIMINDA 1. OLURSA" varyantları) kategori sıralama verisi
  gelmedikçe otomatik değerlendirilemez — detay_json'da "manuel değerlendirme" olarak işaretlenir.
- Sıralama dosyasında yalnız `1-PARFÜM` çeşidi varsa makyaj/cilt/saç kategorili kurallar (DIOR, Sisley, LP)
  hedef tutmamış sayılır; kategori sıralamaları da dosyaya eklenmelidir.
- "Nisan'dan kalan" devreden prim şu an manuel (prim_ozet.devreden_prim alanı hazır).
- Grup satışlarında (aynı noktada 2+ uzman) pay bölüşümü: `uzman_atama.pay_orani` alanı hazır,
  şu an her uzman kendi beyan satırından prim alıyor.
- Kural verisinde tespit edilen 2 eksik sıralama hedefi (kural 3 ve 10'daki "ilk 15") migration ile eklendi.
