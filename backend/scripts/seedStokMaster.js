const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const pool = require("../src/db");
const { importStok } = require("../src/services/importService");

const file = path.join(__dirname, "..", "data/master/stok-liste.csv");
const buf = fs.readFileSync(file);
const donemId = Number(process.argv[2] || 835);

(async () => {
  const t0 = Date.now();
  console.log("host", process.env.DB_HOST, "db", process.env.DB_NAME);
  console.log("import başlıyor… bytes", buf.length, "donem", donemId);
  let lastLog = 0;
  const sonuc = await importStok(buf, donemId, "stok-liste-agustos-2026.csv", {
    onProgress: (p) => {
      if (p.asama !== "satir" || (p.yapilan || 0) - lastLog >= 2000 || p.yapilan === p.toplam) {
        console.log("progress", p);
        lastLog = p.yapilan || lastLog;
      }
    },
  });
  console.log("sonuc", JSON.stringify(sonuc, null, 2));
  console.log("ms", Date.now() - t0);
  const [[u]] = await pool.query("SELECT COUNT(*) c FROM urun");
  const [tips] = await pool.query(
    "SELECT tip, COUNT(*) c FROM urun_kimlik WHERE aktif=1 GROUP BY tip"
  );
  console.log("after", { urun: u.c, kimlik: tips });
  await pool.end();
  process.exit(0);
})().catch(async (e) => {
  console.error("FAIL", e.code || "", e.message);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
