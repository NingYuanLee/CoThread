import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createDatabase, query } from "../server/db.js";
import { seedInitialAdmin } from "./seed.js";
import { assertProductionWriteAllowed } from "../server/database-policy.js";

/**
 * 迁移 checksum 必须与检出时的行尾无关：CI / ECS 检出得到 LF，Windows 在
 * `core.autocrlf=true` 下历史上可能得到 CRLF。旧实现直接对磁盘原文取哈希，
 * 同一个文件在两个平台会记录出不同 checksum，部署时表现为「迁移文件已变更」
 * 直接启动失败。这里统一把 CRLF / 孤立 CR 归一成 LF 再哈希。
 */
export function normalizeSqlEol(sql) {
  return String(sql).replace(/\r\n?/g, "\n");
}

export function migrationChecksum(sql) {
  return createHash("sha256").update(normalizeSqlEol(sql), "utf8").digest("hex");
}

/**
 * 历史 checksum 集合：只差行尾、内容未变的迁移应被识别成「重基线」，
 * 而不是报「文件已变更」。真正的正文改动仍会命中 mismatch。
 */
export function legacyMigrationChecksums(sql) {
  const lf = normalizeSqlEol(sql);
  const crlf = lf.replace(/\n/g, "\r\n");
  const variants = new Set([String(sql), lf, crlf]);
  return new Set(
    [...variants].map((text) => createHash("sha256").update(text, "utf8").digest("hex")),
  );
}

async function ensureChecksumColumn(conn) {
  try {
    await query(conn, "ALTER TABLE schema_migrations ADD COLUMN checksum CHAR(64) NULL");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }
}

function checksumMismatch(name, expected, actual) {
  const error = new Error(
    `迁移文件 ${name} 已变更：数据库 checksum=${actual || "缺失"}，当前文件 checksum=${expected}`,
  );
  error.code = "MIGRATION_CHECKSUM_MISMATCH";
  error.migrationName = name;
  error.expectedChecksum = expected;
  error.actualChecksum = actual || null;
  return error;
}

// MySQL DDL commits independently of the file-level migration receipt. A cold
// start can fail after ADD COLUMN succeeded, so retry only a verified match.
async function matchingExistingColumn(conn, statement) {
  const match = statement.match(
    /^ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+COLUMN\s+`?(\w+)`?\s+(CHAR\(\d+\)|VARCHAR\(\d+\)|TEXT|JSON|BOOLEAN|TINYINT\s+UNSIGNED|INT\s+UNSIGNED|DATETIME(?:\(\d+\))?)\s+(NULL|NOT\s+NULL)(?:\s+DEFAULT\s+(FALSE|TRUE|NULL|\d+))?$/i,
  );
  if (!match) return false;
  const [, table, column, type, nullable, defaultValue] = match;
  const [actual] = await query(
    conn,
    `SELECT c.COLUMN_TYPE,c.IS_NULLABLE,c.COLUMN_DEFAULT,c.EXTRA,c.COLLATION_NAME,t.TABLE_COLLATION
     FROM information_schema.COLUMNS c JOIN information_schema.TABLES t
     ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME
     WHERE c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME=? AND c.COLUMN_NAME=?`,
    [table, column],
  );
  const expectedType = type
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^boolean$/, "tinyint(1)")
    .replace(/^json$/, "json");
  const expectedDefault =
    !defaultValue || /^null$/i.test(defaultValue)
      ? null
      : /^false$/i.test(defaultValue)
        ? "0"
        : /^true$/i.test(defaultValue)
          ? "1"
          : defaultValue;
  return (
    !!actual &&
    actual.COLUMN_TYPE.toLowerCase() === expectedType &&
    actual.IS_NULLABLE === (/^null$/i.test(nullable) ? "YES" : "NO") &&
    (actual.COLUMN_DEFAULT === null ? null : String(actual.COLUMN_DEFAULT)) === expectedDefault &&
    !actual.EXTRA &&
    (!actual.COLLATION_NAME || actual.COLLATION_NAME === actual.TABLE_COLLATION)
  );
}

async function matchingExistingIndex(conn, statement) {
  const match = statement.match(
    /^CREATE\s+UNIQUE\s+INDEX\s+`?(\w+)`?\s+ON\s+`?(\w+)`?\s*\(\s*`?(\w+)`?\s*\)$/i,
  );
  if (!match) return false;
  const [, indexName, table, column] = match;
  const rows = await query(
    conn,
    `SELECT COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX`,
    [table, indexName],
  );
  return rows.length === 1 && rows[0].COLUMN_NAME === column && Number(rows[0].NON_UNIQUE) === 0;
}

export async function migrate(
  db,
  directory = new URL("../migrations/", import.meta.url),
  { seedAdmin = false } = {},
) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const migrations = new Map();
  for (const name of names) {
    const sql = await readFile(
      typeof directory === "string" ? join(directory, name) : new URL(name, directory),
      "utf8",
    );
    migrations.set(name, { sql, checksum: migrationChecksum(sql) });
  }
  // Warm schemas need one read, not one database round trip per migration.
  // Recheck under the lock when work remains, so overlapping cold starts are safe.
  let schemaUpToDate = false;
  try {
    const applied = await query(db, "SELECT name,checksum FROM schema_migrations");
    schemaUpToDate = names.every((name) => {
      const row = applied.find((item) => item.name === name);
      return row && row.checksum === migrations.get(name).checksum;
    });
  } catch (error) {
    if (error.code !== "ER_NO_SUCH_TABLE" && error.code !== "ER_BAD_FIELD_ERROR") throw error;
  }
  if (!schemaUpToDate) {
    const conn = await db.getConnection();
    let locked = false;
    try {
      const [lock] = await query(conn, "SELECT GET_LOCK('cothread_migrate',30) acquired");
      if (Number(lock.acquired) !== 1) throw new Error("数据库迁移锁超时");
      locked = true;
      await query(
        conn,
        "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(191) PRIMARY KEY, checksum CHAR(64) NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      );
      await ensureChecksumColumn(conn);
      const applied = new Map(
        (await query(conn, "SELECT name,checksum FROM schema_migrations")).map((row) => [
          row.name,
          row,
        ]),
      );
      for (const name of names) {
        const migration = migrations.get(name);
        const existing = applied.get(name);
        if (existing) {
          if (!existing.checksum) {
            await query(conn, "UPDATE schema_migrations SET checksum=? WHERE name=?", [
              migration.checksum,
              name,
            ]);
            continue;
          }
          if (existing.checksum === migration.checksum) continue;
          if (legacyMigrationChecksums(migration.sql).has(existing.checksum)) {
            // 仅行尾差异（历史 CRLF 检出）：一次性重基线，避免部署被历史哈希卡死。
            await query(conn, "UPDATE schema_migrations SET checksum=? WHERE name=?", [
              migration.checksum,
              name,
            ]);
            console.log(`Rebaselined ${name}（仅行尾差异）`);
            continue;
          }
          throw checksumMismatch(name, migration.checksum, existing.checksum);
        }
        const sql = migration.sql;
        const statements = sql
          .split(";")
          .map((x) => x.trim())
          .filter(Boolean);
        for (const [index, statement] of statements.entries()) {
          try {
            await query(conn, statement);
          } catch (error) {
            if (
              error.code === "ER_DUP_FIELDNAME" &&
              (await matchingExistingColumn(conn, statement))
            )
              continue;
            if (error.code === "ER_DUP_KEYNAME" && (await matchingExistingIndex(conn, statement)))
              continue;
            error.migrationName = name;
            error.statementNumber = index + 1;
            throw error;
          }
        }
        await query(conn, "INSERT INTO schema_migrations(name,checksum) VALUES(?,?)", [
          name,
          migration.checksum,
        ]);
        console.log(`Applied ${name}`);
      }
    } finally {
      try {
        if (locked) await query(conn, "SELECT RELEASE_LOCK('cothread_migrate')");
      } finally {
        conn.release();
      }
    }
  }
  if (seedAdmin) await seedInitialAdmin(db);
}
if (process.argv[1]?.endsWith("migrate.js")) {
  void (async () => {
    assertProductionWriteAllowed();
    const db = await createDatabase();
    try {
      await migrate(db, undefined, { seedAdmin: true });
    } finally {
      await db.end();
    }
  })().catch((error) => {
    console.error("Migration failed", {
      migrationName: error.migrationName,
      statementNumber: error.statementNumber,
      code: error.code || error.name,
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
}
