import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { migrate } from "../scripts/migrate.js";
import { Service } from "../server/service.js";
import { hashPassword } from "../server/auth.js";
import { createMakersApp } from "../server/makers.js";

test("Makers login recovers partial child migration on a database with a different default charset", async () => {
  const database = await testDatabase();
  const db = database.db;
  let server;
  try {
    const user = { id: randomUUID(), kind: "session" };
    const email = `${user.id}@test.com`, password = "migration-recovery-password";
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [user.id, email, "Migration test", await hashPassword(password)]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "Keep existing data" });
    const thread = await service.createThread(user, project.id, { title: "Existing discussion" });
    const message = await service.postMessage(user, thread.id, { body: "@小祥 保留这条原始请求" });
    // Reproduce production: five columns committed, no new tables, no receipt.
    await query(db, "DROP TABLE agent_requests,agent_task_updates,agent_child_sessions");
    await query(db, "DELETE FROM schema_migrations WHERE name='017_child_agents.sql'");
    const schema = new URL(database.url).pathname.slice(1);
    assert.match(schema, /(?:^|_)(?:dev|test)(?:_|$)/i);
    await db.query(`ALTER DATABASE \`${schema}\` CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci`);
    server = createMakersApp(async () => { await migrate(db); return db; }).listen(0, "127.0.0.1");
    await new Promise((done) => server.once("listening", done));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200, await response.text());
    assert.ok(response.headers.get("set-cookie"));
    const tables = await query(db,
      `SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME IN ('agent_requests','agent_task_updates','agent_child_sessions')`);
    assert.equal(tables.length, 3);
    assert.ok(tables.every((table) => table.TABLE_COLLATION === "utf8mb4_0900_ai_ci"));
    assert.equal((await query(db, "SELECT body FROM messages WHERE id=?", [message.id]))[0].body, "@小祥 保留这条原始请求");
    assert.equal((await query(db, "SELECT status FROM agent_requests WHERE message_id=?", [message.id]))[0].status, "queued");
    await Promise.all([migrate(db), migrate(db)]);
    assert.equal((await query(db, "SELECT name FROM schema_migrations WHERE name='017_child_agents.sql'")).length, 1);
  } finally {
    if (server) await new Promise((done) => server.close(done));
    await database.close();
  }
});

test("a duplicate column with a different definition remains an actionable migration failure", async () => {
  const database = await testDatabase();
  try {
    await query(database.db, "DELETE FROM schema_migrations WHERE name='017_child_agents.sql'");
    await query(database.db, "ALTER TABLE assistant_replies MODIFY COLUMN parent_message_id CHAR(12) NULL");
    await assert.rejects(migrate(database.db), {
      code: "ER_DUP_FIELDNAME", migrationName: "017_child_agents.sql", statementNumber: 1,
    });
    assert.equal((await query(database.db, "SELECT name FROM schema_migrations WHERE name='017_child_agents.sql'")).length, 0);
  } finally { await database.close(); }
});

test("file upload migration retries after hosted MySQL rejects a second TIMESTAMP default", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    await query(db, "DROP TABLE IF EXISTS file_upload_chunks, file_upload_sessions");
    await query(db, "DELETE FROM schema_migrations WHERE name='079_file_uploads.sql'");
    await query(db, "ALTER TABLE versions MODIFY content MEDIUMBLOB NOT NULL");
    await query(db, "SET SESSION sql_mode='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    try { await query(db, "SET SESSION explicit_defaults_for_timestamp=0"); }
    catch { /* 部分账号不允许改该开关；DATETIME 列在两种设置下都能建表 */ }
    await migrate(db);
    const tables = await query(db,
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME IN ('file_upload_sessions','file_upload_chunks')`);
    assert.equal(tables.length, 2);
    const [expires] = await query(db,
      `SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME='file_upload_sessions' AND COLUMN_NAME='expires_at'`);
    assert.equal(expires.DATA_TYPE, "datetime");
    const [content] = await query(db,
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME='versions' AND COLUMN_NAME='content'`);
    assert.equal(content.COLUMN_TYPE.toLowerCase(), "longblob");
  } finally { await database.close(); }
});

test("a fully migrated cold start needs one query and no migration lock", async () => {
  const database = await testDatabase();
  try {
    let queries = 0;
    await migrate({
      execute: async (...args) => { queries++; return database.db.execute(...args); },
      getConnection: () => assert.fail("Current schema must not wait on the migration lock"),
    });
    assert.equal(queries, 1);
  } finally { await database.close(); }
});
