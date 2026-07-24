const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/db");
const { remapPeriod } = require("../src/services/productService");

test("kapalı dönem ürün eşlemesi değiştirilemez", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
  let createdPeriodId = null;
  try {
    let [[period]] = await pool.query("SELECT id FROM donem WHERE durum='kapandi' LIMIT 1");
    if (!period) {
      const [result] = await pool.query(
        "INSERT INTO donem (yil,ay,ad,durum) VALUES (2099,12,'Test kapalı dönem','kapandi')"
      );
      createdPeriodId = result.insertId;
      period = { id: createdPeriodId };
    }
    await assert.rejects(() => remapPeriod(period.id), /Kapalı dönem yeniden eşlenemez/);
  } finally {
    if (createdPeriodId) await pool.query("DELETE FROM donem WHERE id=?", [createdPeriodId]);
    await pool.end();
  }
});
