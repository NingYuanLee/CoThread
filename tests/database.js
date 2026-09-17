import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { createDatabase } from "../server/db.js";
import { migrate } from "../scripts/migrate.js";

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

async function resetSchema(connection, name) {
  await connection.query("SET FOREIGN_KEY_CHECKS=0");
  try {
    const [objects] = await connection.query(
      `SELECT TABLE_NAME,TABLE_TYPE FROM information_schema.TABLES
       WHERE TABLE_SCHEMA=? ORDER BY TABLE_TYPE='VIEW' DESC,TABLE_NAME`,
      [name],
    );
    for (const object of objects) {
      const kind = object.TABLE_TYPE === "VIEW" ? "VIEW" : "TABLE";
      await connection.query(`DROP ${kind} IF EXISTS ${quoteIdentifier(object.TABLE_NAME)}`);
    }
    await connection.query(
      `ALTER DATABASE ${quoteIdentifier(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
  }
}

const PROTECTED_TEST_DATABASES = new Set(["cothread", "cothread_dev"]);

export async function testDatabase() {
  const configured = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!configured)
    throw new Error("集成测试需要 TEST_DATABASE_URL（推荐）或 DATABASE_URL 指向独立测试库");
  const source = new URL(configured);
  const sourceDatabase = source.pathname.slice(1);
  if (PROTECTED_TEST_DATABASES.has(sourceDatabase.toLowerCase()))
    throw new Error(
      `集成测试不能清库 ${sourceDatabase}（日常开发库）。请配置 TEST_DATABASE_URL 指向独立测试库，例如 127.0.0.1:3307/cothread_test。`,
    );
  if (!/(?:^|_)(?:dev|test)(?:_|$)/i.test(sourceDatabase))
    throw new Error("集成测试数据库名称必须包含独立单词 dev 或 test");
  const password = decodeURIComponent(source.password);
  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true,
    ...(process.env.DATABASE_SSL_CA ? { ca: await readFile(process.env.DATABASE_SSL_CA, "utf8") } : {}) } : undefined;
  const control = await mysql.createConnection({
    host: source.hostname,
    port: Number(source.port || 3306),
    user: decodeURIComponent(source.username),
    password,
    database: sourceDatabase,
    ssl,
  });
  const lockName = `cothread_test:${sourceDatabase}`.slice(0, 64);
  let locked = false;
  let db;
  try {
    const [[lock]] = await control.query("SELECT GET_LOCK(?,120) acquired", [lockName]);
    if (Number(lock.acquired) !== 1) throw new Error("等待测试库锁超时");
    locked = true;
    await resetSchema(control, sourceDatabase);
    db = await createDatabase(configured);
    await migrate(db);
    return {
      db,
      url: configured,
      async close() {
        await db.end();
        try { if (locked) await control.query("SELECT RELEASE_LOCK(?)", [lockName]); }
        finally { await control.end(); }
      },
    };
  } catch (error) {
    await db?.end().catch(() => {});
    if (locked) await control.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => {});
    await control.end().catch(() => {});
    throw error;
  }
}
