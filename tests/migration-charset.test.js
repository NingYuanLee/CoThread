import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./database.js";
import { migrate } from "../scripts/migrate.js";

test("quote and recycle migrations match existing tables when schema defaults differ", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    await db.query("DROP TABLE message_quotes, version_recycle");
    await db.execute("DELETE FROM schema_migrations WHERE name IN ('018_message_quotes.sql','019_version_recycle.sql')");
    const schema = new URL(database.url).pathname.slice(1);
    assert.match(schema, /^cothread_test_[a-f0-9]+$/);
    await db.query(`ALTER DATABASE \`${schema}\` CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci`);
    await migrate(db);
    const [tables] = await db.execute("SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('message_quotes','version_recycle')");
    assert.equal(tables.length, 2);
    assert.ok(tables.every((table) => table.TABLE_COLLATION === "utf8mb4_0900_ai_ci"));
    await migrate(db);
    const [receipts] = await db.execute("SELECT name FROM schema_migrations WHERE name IN ('018_message_quotes.sql','019_version_recycle.sql')");
    assert.equal(receipts.length, 2);
  } finally {
    await database.close();
  }
});
