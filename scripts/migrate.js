import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createDatabase, query } from "../server/db.js";

// MySQL DDL commits independently of the file-level migration receipt. A cold
// start can fail after ADD COLUMN succeeded, so retry only a verified match.
async function matchingExistingColumn(conn, statement) {
  const match = statement.match(/^ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+COLUMN\s+`?(\w+)`?\s+(CHAR\(\d+\)|VARCHAR\(\d+\)|BOOLEAN|TINYINT\s+UNSIGNED|INT\s+UNSIGNED|DATETIME(?:\(\d+\))?)\s+(NULL|NOT\s+NULL)(?:\s+DEFAULT\s+(FALSE|TRUE|NULL|\d+))?$/i);
  if (!match) return false;
  const [, table, column, type, nullable, defaultValue] = match;
  const [actual] = await query(conn,
    `SELECT c.COLUMN_TYPE,c.IS_NULLABLE,c.COLUMN_DEFAULT,c.EXTRA,c.COLLATION_NAME,t.TABLE_COLLATION
     FROM information_schema.COLUMNS c JOIN information_schema.TABLES t
     ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME
     WHERE c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME=? AND c.COLUMN_NAME=?`, [table, column]);
  const expectedType = type.toLowerCase().replace(/\s+/g, " ").replace(/^boolean$/, "tinyint(1)");
  const expectedDefault = !defaultValue || /^null$/i.test(defaultValue) ? null
    : /^false$/i.test(defaultValue) ? "0" : /^true$/i.test(defaultValue) ? "1" : defaultValue;
  return !!actual && actual.COLUMN_TYPE.toLowerCase() === expectedType
    && actual.IS_NULLABLE === (/^null$/i.test(nullable) ? "YES" : "NO")
    && (actual.COLUMN_DEFAULT === null ? null : String(actual.COLUMN_DEFAULT)) === expectedDefault
    && !actual.EXTRA
    && (!actual.COLLATION_NAME || actual.COLLATION_NAME === actual.TABLE_COLLATION);
}

async function matchingExistingIndex(conn, statement) {
  const match = statement.match(/^CREATE\s+UNIQUE\s+INDEX\s+`?(\w+)`?\s+ON\s+`?(\w+)`?\s*\(\s*`?(\w+)`?\s*\)$/i);
  if (!match) return false;
  const [, indexName, table, column] = match;
  const rows = await query(conn, `SELECT COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX`, [table, indexName]);
  return rows.length === 1 && rows[0].COLUMN_NAME === column && Number(rows[0].NON_UNIQUE) === 0;
}

export async function migrate(db, directory = new URL("../migrations/", import.meta.url)) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  // Warm schemas need one read, not one database round trip per migration.
  // Recheck under the lock when work remains, so overlapping cold starts are safe.
  try {
    const applied = new Set((await query(db, "SELECT name FROM schema_migrations")).map((row) => row.name));
    if (names.every((name) => applied.has(name))) return;
  } catch (error) { if (error.code !== "ER_NO_SUCH_TABLE") throw error; }
  const conn = await db.getConnection();
  let locked = false;
  try {
    const [lock] = await query(
      conn,
      "SELECT GET_LOCK('cothread_migrate',30) acquired",
    );
    if (Number(lock.acquired) !== 1) throw new Error("数据库迁移锁超时");
    locked = true;
    await query(
      conn,
      "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(191) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
    );
    const applied = new Set((await query(conn, "SELECT name FROM schema_migrations")).map((row) => row.name));
    for (const name of names) {
      if (applied.has(name)) continue;
      const sql = await readFile(
        typeof directory === "string" ? join(directory, name) : new URL(name, directory),
        "utf8",
      );
      const statements = sql
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean);
      for (const [index, statement] of statements.entries()) {
        try {
          await query(conn, statement);
        } catch (error) {
          if (error.code === "ER_DUP_FIELDNAME" && await matchingExistingColumn(conn, statement)) continue;
          if (error.code === "ER_DUP_KEYNAME" && await matchingExistingIndex(conn, statement)) continue;
          error.migrationName = name;
          error.statementNumber = index + 1;
          throw error;
        }
      }
      await query(conn, "INSERT INTO schema_migrations(name) VALUES(?)", [
        name,
      ]);
      console.log(`Applied ${name}`);
    }
  } finally {
    try { if (locked) await query(conn, "SELECT RELEASE_LOCK('cothread_migrate')"); }
    finally { conn.release(); }
  }
}
if (process.argv[1]?.endsWith("migrate.js")) {
  void (async () => {
    const db = await createDatabase();
    try { await migrate(db); }
    finally { await db.end(); }
  })().catch((error) => { console.error("Migration failed", { code: error.code || error.name }); process.exitCode = 1; });
}
