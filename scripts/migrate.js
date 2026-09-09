import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createDatabase, query } from "../server/db.js";
export async function migrate(db, directory = new URL("../migrations/", import.meta.url)) {
  const conn = await db.getConnection();
  try {
    const [lock] = await query(
      conn,
      "SELECT GET_LOCK('cothread_migrate',30) acquired",
    );
    if (Number(lock.acquired) !== 1) throw new Error("数据库迁移锁超时");
    await query(
      conn,
      "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(191) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
    );
    for (const name of (
      await readdir(directory)
    )
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      if (
        (
          await query(conn, "SELECT name FROM schema_migrations WHERE name=?", [
            name,
          ])
        ).length
      )
        continue;
      const sql = await readFile(
        typeof directory === "string" ? join(directory, name) : new URL(name, directory),
        "utf8",
      );
      for (const statement of sql
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean))
        await query(conn, statement);
      await query(conn, "INSERT INTO schema_migrations(name) VALUES(?)", [
        name,
      ]);
      console.log(`Applied ${name}`);
    }
  } finally {
    await query(conn, "SELECT RELEASE_LOCK('cothread_migrate')");
    conn.release();
  }
}
if (process.argv[1]?.endsWith("migrate.js")) {
  void (async () => {
    const db = await createDatabase();
    try { await migrate(db); }
    finally { await db.end(); }
  })().catch((error) => { console.error("Migration failed", { code: error.code || error.name }); process.exitCode = 1; });
}
