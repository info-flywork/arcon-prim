// Migration çalıştırıcı: backend klasöründe `npm run migrate`
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("./db");

function checksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function sqlStatements(sql) {
  const temiz = sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  return temiz
    .split(/;\s*(?:[\r\n]|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function ensureMigrationTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      dosya VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (dosya)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function runMigration(conn, dir, file) {
  const fullPath = path.join(dir, file);
  const content = fs.readFileSync(fullPath, "utf8");
  const sum = checksum(content);
  const [[applied]] = await conn.query(
    "SELECT checksum FROM schema_migrations WHERE dosya=?",
    [file]
  );
  if (applied) {
    if (applied.checksum !== sum) {
      throw new Error(`${file} daha önce farklı checksum ile uygulanmış; mevcut migration dosyasını değiştirmeyin.`);
    }
    console.log(`== ${file} (zaten uygulandı)`);
    return;
  }

  console.log(`>> ${file}`);
  if (file.endsWith(".sql")) {
    for (const statement of sqlStatements(content)) await conn.query(statement);
  } else {
    delete require.cache[require.resolve(fullPath)];
    const migration = require(fullPath);
    if (typeof migration.up !== "function") throw new Error(`${file}: up(conn) export edilmeli`);
    await migration.up(conn);
  }
  await conn.query(
    "INSERT INTO schema_migrations (dosya, checksum) VALUES (?,?)",
    [file, sum]
  );
}

async function main() {
  const dir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => /\.(sql|js)$/.test(f)).sort();
  const conn = await pool.getConnection();
  try {
    await ensureMigrationTable(conn);
    for (const file of files) await runMigration(conn, dir, file);
    console.log("Migration tamamlandı.");
  } finally {
    conn.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Migration hatası:", e.message);
    process.exit(1);
  });
}

module.exports = { checksum, sqlStatements, runMigration, main };
