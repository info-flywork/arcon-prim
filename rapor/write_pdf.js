// Flywork Prim İnceleme Notu — sade, örnek odaklı PDF
// Ton: suçlayıcı değil; mağaza müdürü beyanı sorumluluğu
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const EKRAN = path.join(__dirname, "ekranlar");
const OUT_HTML = path.join(__dirname, "flywork_prim_raporu.html");
const OUT_PDF = path.join(__dirname, "flywork_prim_raporu.pdf");

function b64(file) {
  return fs.readFileSync(path.join(EKRAN, file)).toString("base64");
}

const img = (file, caption) => `
  <figure>
    <img src="data:image/png;base64,${b64(file)}" alt="${caption}" />
    <figcaption>${caption}</figcaption>
  </figure>`;

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>Flywork — Arcon Mayıs 2026 Prim Çalışma İnceleme Notu</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1f2a37; font-size: 11.5pt; line-height: 1.55;
    max-width: 780px; margin: 0 auto;
  }
  h1 { color: #1F3864; font-size: 20pt; margin: 0 0 6px; }
  h2 { color: #2E74B5; font-size: 14pt; margin: 28px 0 10px; page-break-after: avoid; }
  h3 { color: #5B7D9B; font-size: 12pt; margin: 18px 0 8px; page-break-after: avoid; }
  .kicker { color: #666; font-size: 10pt; letter-spacing: .04em; text-transform: uppercase; }
  .meta { color: #555; margin-bottom: 28px; }
  p { margin: 0 0 10px; }
  .note {
    background: #f5f8fc; border-left: 3px solid #2E74B5;
    padding: 10px 12px; margin: 14px 0; font-size: 10.5pt;
  }
  code, .mono {
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 10pt; color: #2E74B5;
  }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 10pt; }
  th { background: #1F3864; color: #fff; text-align: left; padding: 7px 8px; }
  td { border-bottom: 1px solid #dde3ea; padding: 7px 8px; vertical-align: top; }
  figure {
    margin: 14px 0 18px; page-break-inside: avoid;
    border: 1px solid #e3e8ef; border-radius: 8px; overflow: hidden; background: #fff;
  }
  figure img { width: 100%; display: block; }
  figcaption {
    padding: 8px 10px; font-size: 9.5pt; color: #555; background: #f7f9fc;
    border-top: 1px solid #e3e8ef;
  }
  .footer { margin-top: 36px; color: #888; font-size: 9.5pt; text-align: center; }
  .cover { text-align: center; padding: 48px 0 36px; page-break-after: always; }
  .cover h1 { font-size: 26pt; margin-bottom: 8px; }
  .cover .sub { font-size: 13pt; color: #555; font-style: italic; }
  ul { margin: 8px 0 12px 18px; padding: 0; }
  li { margin-bottom: 6px; }
</style>
</head>
<body>

<section class="cover">
  <div class="kicker">Flywork</div>
  <h1>Prim Çalışma İnceleme Notu</h1>
  <p class="sub">Arcon — Mayıs 2026 Excel dosyası</p>
  <p class="meta" style="margin-top:28px">Hazırlayan: <strong>Sena Özyiğit</strong><br/>Temmuz 2026</p>
</section>

<p class="note">
  Bu not kişilere yönelik bir değerlendirme değildir. Amaç, Excel hesabına giren
  bazı tutarların <strong>sellout yerine mağaza müdürü beyanına</strong> dayandığını
  somut satır örnekleriyle göstermek ve sorumluluğu doğru yere —
  beyanı sağlayan mağaza yönetimi ile bu beyanın doğrulanmadan Excel’e işlenmesi —
  yerleştirmektir.
</p>

<h2>1) Küçük bir örnek: sellout boş, tutar dolu</h2>
<p>
  <strong>Nurgül Kesgün / SEPHORA KANYON / Dior</strong> — Prim Çalışma Satış primleri,
  <strong>242. satır</strong>.
</p>
<p>
  Sell-Out Adet (AD) ve Mağaza KDV Hariç Ciro (AE) hücreleri <strong>boş</strong>.
  Buna rağmen Prime Esas Birim Ciro (AF) hücresinde formül şöyle:
</p>
<p class="mono">=EĞERHATA(AE242/AD242;"0")+1920000</p>
<p>
  Yani standart birim ciro hesabının yanına sabit bir tutar eklenmiş.
  Bu tutar sellout’tan gelmiyor; uygulamada <strong>mağaza müdürünün beyanının</strong>
  satıra yansıtılması amacıyla yazılıyor. Beyanın içeriği ve doğruluğu
  <strong>mağaza yönetiminin sorumluluğunda</strong>dır.
</p>

${img("01_af242_formul.png", "Görsel 1 — AF242 formül çubuğunda +1920000 (mağaza müdürü beyanına dayanan sabit tutar)")}

<p>
  Aynı satırda sonuç şöyle görünüyor: AD/AE boş; AF ve AG 1.920.000 TL;
  Prim %1 kolonu (AH) standart formülle <span class="mono">=AG×0,01</span> hesaplanıyor → 19.200 TL.
  Oran doğru; fark, oran uygulanmadan önce tabanın mağaza beyanıyla yükseltilmiş olması.
</p>

${img("02_af242_sonuc.png", "Görsel 2 — 242. satır: AD/AE boş; AF/AG 1.920.000 TL; AH 19.200 TL")}

${img("03_ah242_yuzde1.png", "Görsel 3 — AH242 =+$AG242*0,01 (oran kuralı doğru; taban beyan kaynaklı)")}

<table>
  <thead>
    <tr><th>Hücre</th><th>Değer</th><th>Kaynak</th></tr>
  </thead>
  <tbody>
    <tr><td>AD / AE — Sellout</td><td>Boş</td><td>Eşleşme yok</td></tr>
    <tr><td>AF — Prime Esas Birim Ciro</td><td>1.920.000 TL</td><td>Mağaza müdürü beyanı</td></tr>
    <tr><td>AH — Prim %1</td><td>19.200 TL</td><td>Standart oran × beyan tabanı</td></tr>
  </tbody>
</table>

<h2>2) Bu tutar hedef tablosundan da gelmiyor</h2>
<p>
  Mayıs Hedef sayfasında SEPHORA KANYON × DIOR revize hedefi
  <strong>1.058.966 TL</strong>. Formüle yazılan sabit tutar bundan ayrı bir girdi;
  hedef hücresinden otomatik çekilmiyor. Karşılaştırma yalnızca kaynağın
  farklı olduğunu göstermek içindir.
</p>

${img("05_mayis_hedef_kanyon.png", "Görsel 4 — Mayıs Hedef: SEPHORA KANYON × DIOR = 1.058.966 TL")}

<h2>3) Pivot’ta da benzer iz</h2>
<p>
  Prim Çalışma2_Sıralamalar sayfasında bazı satırlarda marka / mağaza alanları boş
  olduğu halde Prime Esas ve Prim %1 dolu görülebiliyor. Bu da satırın
  sellout zincirinden değil, operasyonel beyan satırından geldiğine işaret eder.
</p>

${img("04_pivot_bos_satirlar.png", "Görsel 5 — Pivot: marka/mağaza boş, tutar dolu satırlar")}

<h2>4) Ne söylüyoruz, ne demiyoruz</h2>
<ul>
  <li><strong>Söylüyoruz:</strong> Bu örnekte prim tabanı sellout’tan değil, mağaza müdürü beyanından geliyor.</li>
  <li><strong>Söylüyoruz:</strong> %1 oranı doğru çalışıyor; mesele oran değil, tabanın kaynağı.</li>
  <li><strong>Söylüyoruz:</strong> Sorumluluk beyanı veren mağaza yönetimi ile beyanı doğrulamadan Excel’e alan süreçte.</li>
  <li><strong>Demiyoruz:</strong> Uzman hile yaptı / kişi suçlu. Satırdaki isim yalnızca etikettir.</li>
  <li><strong>Demiyoruz:</strong> Tüm dönemin priminin geçersiz olduğu. Bu not tek satırlık net bir örnek üzerinden yapısal boşluğu gösterir.</li>
</ul>

<div class="note">
  Benzer yapıda (formüle sabit tutar eklenmiş) başka satırlar da vardır; burada bilerek
  tek ve net bir örnekle yetinildi. Amaç rakam yığınıyla abartmak değil,
  Excel’in kendi ekranından kaynağı göstermektir.
</div>

<h2>5) Flywork tarafı</h2>
<p>
  Flywork Prim Sistemi, prim tabanını sellout ile doğrulanabilir kayıtlardan üretir;
  mağaza beyanını bağımsız bir girdi olarak izlenebilir biçimde ayırır ve
  formüle gizli sabit eklemeye kapalı otomatik hesap sunar. Böylece
  “beyan mı, sellout mu?” sorusu dönem sonunda kaybolmaz.
</p>

<p class="footer">— Flywork · Arcon Mayıs 2026 Prim Çalışma İnceleme Notu —</p>

</body>
</html>`;

fs.writeFileSync(OUT_HTML, html, "utf8");
console.log("✓ HTML yazıldı:", OUT_HTML);

const chrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${OUT_PDF}`,
    `file://${OUT_HTML}`,
  ],
  { stdio: "inherit" }
);
console.log("✓ PDF yazıldı:", OUT_PDF);
console.log("  Boyut:", (fs.statSync(OUT_PDF).size / 1024).toFixed(0), "KB");
