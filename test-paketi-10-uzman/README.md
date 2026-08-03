# 10 Uzman Test Paketi — Haziran 2026 Test

Dosyalar **gerçek Excel (.xlsx)** — Google Sheets / Excel’de kolon kolon açılır.
`beklenen_Toplanmis.xlsx` Arcon Prim Hesaplama gibi **renkli başlıklı**dır.

## Yükleme sırası
1. `00_Stok_Liste.xlsx` *(ürün barkod/uniq — önce yükle)*
2. `01_Uzman-Magaza-Grup.xlsx`
3. `02_Zeops_Ham_Data.xlsx`
4. `03_Sellout_Data.xlsx`
5. `04_Hedef.xlsx`
6. `05_Siralama.xlsx`
7. Prim hesapla

## Teyit
- `beklenen_Satir_Satir.xlsx` ↔ sistem satır satır Excel
- `beklenen_Toplanmis.xlsx` ↔ sistem toplanmış Excel (renkli Prim Hesaplama)

## 10 uzman
| Uzman | Prim Mağaza | Kod | Grup | Senaryo |
|---|---|---|---|---|
| Yıldırım Tezer | BOYNER ERENKÖY | 34.ERY.BOY | Puig | Puig satış + 1 Grup Dışı (Issey). Hedef tutmaz. |
| Ahmet Bilici | BEYMEN ZORLU | 34.ZRL.BYP | Dolce & Gabbana | DG Ok + Beymen %0,5 ek. Hedef tutar. |
| Ayşen Kübra Es | BEYMEN SUADİYE | 34.SDY.BYP | DIOR | Dior Ok + Beymen. Aynı ziyarette 2× aynı ürün → Adet=2. |
| Ayşe Sadi | SEPHORA İSTİNYE PARK | 34.IST.SPH | DIOR | Sephora Dior. |
| Begüm Sevde Özbey | SEPHORA BAĞDAT CADDESİ | 34.BCi.SPH | Sensai | Sensai + Bağdat ekstra. |
| Aysel Coşkun | SEVİL ŞAŞKINBAKKAL | 34.SSK.SEV | La Prairie | LP Sevil +%0,5. |
| Melike Öztürk Aşık | SEPHORA İZMİR HİLLTOWN | 35.İHW.SPH | DIOR | Çok satır Dior. |
| Hadi Serkan Kaleli | SEPHORA İZMİR İSTİNYE PARK | 35.İMR.İNK | Givenchy+Hermes+Dolce | Givenchy+Hermes Ok; Dior Grup Dışı. |
| Ahmet Bozdağ | SEPHORA VADİ İSTANBUL | 34.VİB.SPH | Puig | Puig Ok. |
| Arel Tunalı | BOYNER ANTALYA | 07.ANT.BOY | Puig | Puig hedef tutar. |

## Beklenen toplanmış özet
| Uzman | E | F | H | G | I | L | W |
|---|---:|---:|---:|---:|---:|---:|---:|
| Yıldırım Tezer | 19000 | 190 | 0 | 0 | 0 | 0 | 190 |
| Ahmet Bilici | 24000 | 240 | 120 | 0 | 0 | 120 | 480 |
| Ayşen Kübra Es | 16000 | 160 | 80 | 0 | 0 | 80 | 320 |
| Ayşe Sadi | 16000 | 160 | 0 | 0 | 0 | 0 | 160 |
| Begüm Sevde Özbey | 20000 | 200 | 100 | 200 | 0 | 100 | 600 |
| Aysel Coşkun | 14000 | 140 | 0 | 0 | 70 | 70 | 280 |
| Melike Öztürk Aşık | 24000 | 240 | 0 | 0 | 0 | 120 | 360 |
| Hadi Serkan Kaleli | 21500 | 215 | 0 | 0 | 0 | 107.5 | 322.5 |
| Ahmet Bozdağ | 12000 | 120 | 0 | 0 | 0 | 60 | 180 |
| Arel Tunalı | 16000 | 160 | 0 | 0 | 0 | 80 | 240 |

Yeniden üret: `node uret.js`