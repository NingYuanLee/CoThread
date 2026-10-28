import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { testDatabase } from "./database.js";
import { migrate } from "../scripts/migrate.js";

const MIGRATIONS = new URL("../migrations/", import.meta.url);
const RECREATED_TABLES = ["message_quotes", "version_recycle"];
const BASE_MIGRATIONS = ["018_message_quotes.sql", "019_version_recycle.sql"];

// 本用例会删掉这两张表并从 018/019 重放迁移；019 之后任何还会 ALTER 这两张表的
// 迁移也必须一起重放，否则它们留下的列（例如 080 的 purged_at）会从这个被重建的
// 库里消失，同分片后续用例就会报 Unknown column。
async function replayedMigrations() {
  const names = (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();
  const dependents = [];
  for (const name of names) {
    if (BASE_MIGRATIONS.includes(name)) continue;
    const sql = await readFile(new URL(name, MIGRATIONS), "utf8");
    if (RECREATED_TABLES.some((table) => sql.includes(table))) dependents.push(name);
  }
  return [...BASE_MIGRATIONS, ...dependents];
}

test("quote and recycle migrations match existing tables when schema defaults differ", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const replay = await replayedMigrations();
    const placeholders = replay.map(() => "?").join(",");
    await db.query("DROP TABLE message_quotes, version_recycle");
    await db.execute(`DELETE FROM schema_migrations WHERE name IN (${placeholders})`, replay);
    const schema = new URL(database.url).pathname.slice(1);
    assert.match(schema, /(?:^|_)(?:dev|test)(?:_|$)/i);
    await db.query(`ALTER DATABASE \`${schema}\` CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci`);
    await migrate(db);
    const [tables] = await db.execute(
      "SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('message_quotes','version_recycle')",
    );
    assert.equal(tables.length, 2);
    assert.ok(tables.every((table) => table.TABLE_COLLATION === "utf8mb4_0900_ai_ci"));
    // 重建后的表必须带回后续迁移加的列，本用例不能把残缺结构留给同分片其他用例。
    const [columns] = await db.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='version_recycle' AND COLUMN_NAME='purged_at'",
    );
    assert.equal(columns.length, 1);
    await migrate(db);
    const [receipts] = await db.execute(
      `SELECT name FROM schema_migrations WHERE name IN (${placeholders})`,
      replay,
    );
    assert.equal(receipts.length, replay.length);
  } finally {
    await database.close();
  }
});
