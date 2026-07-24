const mysql = require("mysql2/promise");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "d87077pkbgfakv_prim_module",
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,          // MySQL boşta bağlantıyı kesince süreç düşmesin
  keepAliveInitialDelay: 10000,
  charset: "utf8mb4_unicode_ci",
  decimalNumbers: true,
  namedPlaceholders: true,
});

module.exports = pool;
