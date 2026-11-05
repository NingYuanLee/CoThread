import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { testDatabase } from "./database.js";
import { query } from "../server/db.ts";
import { migrate, migrationChecksum } from "../scripts/migrate.js";
import { Service } from "../server/service.ts";
import { hashPassword } from "../server/auth.ts";
import { createApp } from "../server/app.ts";
import { createArtifact } from "../server/documents/versions.ts";

test("正式文件关联迁移只修复唯一目标，多个目标保留审计缺口", async () => {
  const database = await testDatabase(),
    db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      user.id + "@test.com",
      "关联成员",
    ]);
    const project = await new Service(db).createProject(user, { name: "旧关联修复" });
    const [root] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL",
      [project.id],
    );
    const sources = [];
    for (const count of [1, 2]) {
      const sourceId = await createArtifact(db, {
        projectId: project.id,
        title: "原产物" + count,
        createdBy: user.id,
        folderId: root.id,
      });
      const officialIds = [];
      for (let n = 0; n < count; n++)
        officialIds.push(
          await createArtifact(db, {
            projectId: project.id,
            title: "正式副本" + count + n,
            createdBy: user.id,
            folderId: root.id,
            sourceType: "output_saved",
            sourceArtifactId: sourceId,
            savedOfficialArtifactId: sourceId,
          }),
        );
      sources.push({ sourceId, officialIds });
    }
    for (let replay = 0; replay < 2; replay++) {
      await query(
        db,
        "DELETE FROM schema_migrations WHERE name='217_repair_official_source_links.sql'",
      );
      await migrate(db);
      const [fixed] = await query(
        db,
        "SELECT saved_official_artifact_id target FROM artifacts WHERE id=?",
        [sources[0].sourceId],
      );
      assert.equal(fixed.target, sources[0].officialIds[0]);
      const [official] = await query(
        db,
        "SELECT saved_official_artifact_id target FROM artifacts WHERE id=?",
        [sources[0].officialIds[0]],
      );
      assert.equal(official.target, null);
      const [ambiguous] = await query(
        db,
        "SELECT saved_official_artifact_id target FROM artifacts WHERE id=?",
        [sources[1].sourceId],
      );
      assert.equal(ambiguous.target, null);
      const [audit] = await query(
        db,
        "SELECT candidate_count candidates,official_artifact_id target FROM document_official_link_migration_audit WHERE source_artifact_id=?",
        [sources[1].sourceId],
      );
      assert.equal(audit.candidates, 2);
      assert.equal(audit.target, null);
    }
  } finally {
    await database.close();
  }
});

test("记忆两态迁移保留旧内容和来源缺口，DDL回执丢失后可重跑", async () => {
  const database = await testDatabase(),
    db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      user.id + "@test.com",
      "迁移成员",
    ]);
    const service = new Service(db),
      project = await service.createProject(user, { name: "记忆存量迁移" });
    const threadId = randomUUID(),
      messageId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,'旧迭代',?)", [
      threadId,
      project.id,
      user.id,
    ]);
    await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','旧原话','[]')",
      [messageId, threadId, user.id],
    );
    await query(
      db,
      "ALTER TABLE wiki_pages MODIFY status ENUM('draft','current','superseded') NOT NULL",
    );
    const ids = [];
    for (const kinds of [["message"], ["thread"], ["message", "thread"]]) {
      const id = randomUUID();
      ids.push(id);
      await query(
        db,
        "INSERT INTO wiki_pages(id,project_id,subject_type,title,body,status,created_by,updated_by) VALUES(?,?,'project','旧草稿','原内容不得丢失','draft',?,?)",
        [id, project.id, user.id, user.id],
      );
      for (const kind of kinds)
        await query(
          db,
          "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,?,?,?)",
          [randomUUID(), id, kind, kind === "message" ? messageId : threadId, "真实来源"],
        );
    }
    const names = [
      "210_memory_source_lifecycle.sql",
      "211_memory_evidence_links.sql",
      "212_memory_revisions.sql",
      "213_memory_two_states.sql",
      "214_file_content_identity.sql",
      "215_project_activity_history.sql",
      "216_memory_decisions.sql",
      "217_repair_official_source_links.sql",
    ];
    for (const name of names) await query(db, "DELETE FROM schema_migrations WHERE name=?", [name]);
    await migrate(db);
    for (let i = 0; i < ids.length; i++) {
      const [page] = await query(
        db,
        "SELECT status,source_family family,body FROM wiki_pages WHERE id=?",
        [ids[i]],
      );
      assert.equal(page.status, "current");
      assert.equal(page.body, "原内容不得丢失");
      assert.equal(page.family, ["conversation", "project_activity", null][i]);
      const [audit] = await query(
        db,
        "SELECT prior_status priorStatus FROM memory_lifecycle_migration_audit WHERE page_id=?",
        [ids[i]],
      );
      assert.equal(audit.priorStatus, "draft");
    }
    for (const name of names) await query(db, "DELETE FROM schema_migrations WHERE name=?", [name]);
    await migrate(db);
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) n FROM memory_lifecycle_migration_audit WHERE page_id IN (?,?,?)",
            ids,
          )
        )[0].n,
      ),
      3,
    );
    await assert.rejects(query(db, "UPDATE wiki_pages SET status='draft' WHERE id=?", [ids[0]]));
  } finally {
    await database.close();
  }
});

test("项目进程迁移在 DDL 已执行但回执缺失时可安全重试", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "迁移测试",
    ]);
    const project = await new Service(db).createProject(user, { name: "迁移重试保留数据" });
    for (const name of [
      "190_project_status_node.sql",
      "191_milestone_sources.sql",
      "192_project_status_checks.sql",
      "194_project_memory_settlements.sql",
      "195_project_settlement_errors.sql",
      "196_project_settlement_candidates.sql",
      "197_project_memory_retries.sql",
      "198_project_status_source_snapshots.sql",
    ])
      await query(db, "DELETE FROM schema_migrations WHERE name=?", [name]);
    await migrate(db);
    const [row] = await query(db, "SELECT name FROM projects WHERE id=?", [project.id]);
    assert.equal(row.name, "迁移重试保留数据");
    const columns = await query(
      db,
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='agent_project_memory_queue'
      AND COLUMN_NAME IN ('signal_revision','retry_count','last_error','last_attempt_at')`,
    );
    assert.equal(columns.length, 4);
    const [kind] = await query(
      db,
      `SELECT COLUMN_TYPE columnType FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='agent_project_memory_queue' AND COLUMN_NAME='source_kind'`,
    );
    assert.match(kind.columnType, /memory_page/);
  } finally {
    await database.close();
  }
});

test("login recovers partial child migration on a database with a different default charset", async () => {
  const database = await testDatabase();
  const db = database.db;
  let server;
  try {
    const user = { id: randomUUID(), kind: "session" };
    const email = `${user.id}@test.com`,
      password = "migration-recovery-password";
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [
      user.id,
      email,
      "Migration test",
      await hashPassword(password),
    ]);
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
    await migrate(db);
    server = createApp(db).listen(0, "127.0.0.1");
    await new Promise((done) => server.once("listening", done));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200, await response.text());
    assert.ok(response.headers.get("set-cookie"));
    const tables = await query(
      db,
      `SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME IN ('agent_requests','agent_task_updates','agent_child_sessions')`,
    );
    assert.equal(tables.length, 3);
    assert.ok(tables.every((table) => table.TABLE_COLLATION === "utf8mb4_0900_ai_ci"));
    assert.equal(
      (await query(db, "SELECT body FROM messages WHERE id=?", [message.id]))[0].body,
      "@小祥 保留这条原始请求",
    );
    assert.equal(
      (await query(db, "SELECT status FROM agent_requests WHERE message_id=?", [message.id]))[0]
        .status,
      "queued",
    );
    await Promise.all([migrate(db), migrate(db)]);
    assert.equal(
      (await query(db, "SELECT name FROM schema_migrations WHERE name='017_child_agents.sql'"))
        .length,
      1,
    );
  } finally {
    if (server) await new Promise((done) => server.close(done));
    await database.close();
  }
});

test("a duplicate column with a different definition remains an actionable migration failure", async () => {
  const database = await testDatabase();
  try {
    await query(database.db, "DELETE FROM schema_migrations WHERE name='017_child_agents.sql'");
    await query(
      database.db,
      "ALTER TABLE assistant_replies MODIFY COLUMN parent_message_id CHAR(12) NULL",
    );
    await assert.rejects(migrate(database.db), {
      code: "ER_DUP_FIELDNAME",
      migrationName: "017_child_agents.sql",
      statementNumber: 1,
    });
    assert.equal(
      (
        await query(
          database.db,
          "SELECT name FROM schema_migrations WHERE name='017_child_agents.sql'",
        )
      ).length,
      0,
    );
  } finally {
    await database.close();
  }
});

test("a changed applied migration fails checksum validation", async () => {
  const database = await testDatabase();
  const db = database.db;
  const name = "017_child_agents.sql";
  const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8");
  const checksum = migrationChecksum(sql);
  try {
    await query(db, "UPDATE schema_migrations SET checksum=? WHERE name=?", ["0".repeat(64), name]);
    await assert.rejects(migrate(db), {
      code: "MIGRATION_CHECKSUM_MISMATCH",
      migrationName: name,
      actualChecksum: "0".repeat(64),
      expectedChecksum: checksum,
    });
  } finally {
    await query(db, "UPDATE schema_migrations SET checksum=? WHERE name=?", [checksum, name]);
    await database.close();
  }
});

test("file upload migration retries after hosted MySQL rejects a second TIMESTAMP default", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    await query(db, "DROP TABLE IF EXISTS file_upload_chunks, file_upload_sessions");
    await query(db, "DELETE FROM schema_migrations WHERE name='079_file_uploads.sql'");
    await query(db, "ALTER TABLE versions MODIFY content MEDIUMBLOB NOT NULL");
    await query(
      db,
      "SET SESSION sql_mode='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
    );
    try {
      await query(db, "SET SESSION explicit_defaults_for_timestamp=0");
    } catch {
      /* 部分账号不允许改该开关；DATETIME 列在两种设置下都能建表 */
    }
    await migrate(db);
    const tables = await query(
      db,
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME IN ('file_upload_sessions','file_upload_chunks')`,
    );
    assert.equal(tables.length, 2);
    const [expires] = await query(
      db,
      `SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME='file_upload_sessions' AND COLUMN_NAME='expires_at'`,
    );
    assert.equal(expires.DATA_TYPE, "datetime");
    const [content] = await query(
      db,
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME='versions' AND COLUMN_NAME='content'`,
    );
    assert.equal(content.COLUMN_TYPE.toLowerCase(), "longblob");
  } finally {
    await database.close();
  }
});

test("a fully migrated cold start needs one query and no migration lock", async () => {
  const database = await testDatabase();
  try {
    let queries = 0;
    await migrate({
      execute: async (...args) => {
        queries++;
        return database.db.execute(...args);
      },
      getConnection: () => assert.fail("Current schema must not wait on the migration lock"),
    });
    assert.equal(queries, 1);
  } finally {
    await database.close();
  }
});

test("文件索引迁移在 DDL 完成但回执丢失后可重跑且不改写已发布指纹", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      user.id + "@test.com",
      "迁移测试",
    ]);
    const service = new Service(db),
      project = await service.createProject(user, { name: "文件迁移恢复" });
    const thread = await service.createThread(user, project.id, { title: "资料" });
    const version = await service.submitVersion(
      user,
      thread.id,
      {
        title: "迁移文件",
        filename: "migration.txt",
        contentBase64: Buffer.from("原文").toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    const { discoverNextFileIndexChange, reconcileNextFileIndexArtifact } =
      await import("../server/file-index-discovery.js");
    const { processNextProjectMemory } = await import("../server/project-memory.js");
    while (await discoverNextFileIndexChange(db)) {}
    while (await reconcileNextFileIndexArtifact(db)) {}
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "document_memory",
      summarizeDocument: async () => ({ summary: "原文摘要" }),
    });
    const [original] = await query(
      db,
      "SELECT artifact_id artifactId,summary_sha256 sha256 FROM file_index_entries WHERE indexed_version_id=?",
      [version.id],
    );
    const { replaceVersionContent } = await import("../server/documents/index.ts");
    await replaceVersionContent(db, {
      id: version.id,
      content: Buffer.from("已更改"),
      mime: "text/plain",
      sha256: "f".repeat(64),
      byteSize: 9,
      note: "",
      createdBy: user.id,
    });
    // Keep data and DDL, remove only receipts to reproduce interrupted startup.
    await query(db, "DELETE FROM schema_migrations WHERE name >= '203_' AND name <= '209_zzzz'");
    await migrate(db);
    const [after] = await query(
      db,
      "SELECT summary_sha256 sha256 FROM file_index_entries WHERE artifact_id=?",
      [original.artifactId],
    );
    assert.equal(after.sha256, original.sha256);
    assert.equal(
      (
        await query(db, "SELECT summary FROM agent_document_summaries WHERE version_id=?", [
          version.id,
        ])
      )[0].summary,
      "原文摘要",
    );
    assert.equal(
      (
        await query(
          db,
          "SELECT name FROM schema_migrations WHERE name >= '203_' AND name <= '209_zzzz'",
        )
      ).length,
      7,
    );
  } finally {
    await database.close();
  }
});
