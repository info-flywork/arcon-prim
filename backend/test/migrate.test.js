const test = require("node:test");
const assert = require("node:assert/strict");
const { checksum, sqlStatements } = require("../src/migrate");

test("migration checksum içerik değişikliğini algılar", () => {
  assert.equal(checksum("SELECT 1;"), checksum("SELECT 1;"));
  assert.notEqual(checksum("SELECT 1;"), checksum("SELECT 2;"));
});

test("SQL migration yorumları atlanıp ifadeler ayrılır", () => {
  assert.deepEqual(
    sqlStatements("-- açıklama\nCREATE TABLE x (id INT);\nINSERT INTO x VALUES (1);"),
    ["CREATE TABLE x (id INT)", "INSERT INTO x VALUES (1)"]
  );
});
