import test from "node:test";
import assert from "node:assert/strict";
import { consumeFileIndexChange } from "../server/file-index-discovery.js";

function fakePool(change) {
  const calls = [];
  const conn = {
    async beginTransaction() {
      calls.push("begin");
    },
    async commit() {
      calls.push("commit");
    },
    async rollback() {
      calls.push("rollback");
    },
    release() {
      calls.push("release");
    },
    async execute(sql, params) {
      if (sql.includes("FROM document_change_logs")) {
        calls.push("select");
        return [[...(change ? [change] : [])]];
      }
      if (sql.includes("INSERT INTO file_index_log_receipts")) {
        calls.push(["receipt", ...params]);
        return [{ affectedRows: 1 }];
      }
      throw new Error("unexpected SQL");
    },
  };
  return {
    calls,
    conn,
    pool: {
      async getConnection() {
        return conn;
      },
    },
  };
}

test("文件变更处理成功后在同一事务写入消费凭据", async () => {
  const state = fakePool({ id: "log-1", artifactId: "file-1" });
  assert.equal(
    await consumeFileIndexChange(state.pool, async (conn, change) => {
      assert.equal(conn, state.conn);
      assert.equal(change.artifactId, "file-1");
      state.calls.push("handle");
    }),
    true,
  );
  assert.deepEqual(state.calls, [
    "begin",
    "select",
    "handle",
    ["receipt", "log-1"],
    "commit",
    "release",
  ]);
});

test("处理失败回滚且不记录消费凭据，无事件时不调用处理器", async () => {
  const failed = fakePool({ id: "log-2" });
  await assert.rejects(
    consumeFileIndexChange(failed.pool, async () => {
      throw new Error("failed");
    }),
    /failed/,
  );
  assert.deepEqual(failed.calls, ["begin", "select", "rollback", "release"]);
  const empty = fakePool(null);
  assert.equal(
    await consumeFileIndexChange(empty.pool, async () => assert.fail("unexpected")),
    false,
  );
  assert.deepEqual(empty.calls, ["begin", "select", "commit", "release"]);
});
import { decideFileIndexChange } from "../server/file-index-discovery.js";

test("发现按内容指纹和已有摘要区分新增、更新、元数据与删除", () => {
  const first = { available: true, versionId: "v1", sha256: "a", mime: "text/plain" };
  assert.equal(decideFileIndexChange(null, first, false), "create");
  assert.equal(decideFileIndexChange(first, { ...first, versionId: "v2" }, true), "metadata");
  assert.equal(decideFileIndexChange(first, first, false), "create");
  assert.equal(decideFileIndexChange(first, { ...first, sha256: "b" }, true), "update");
  assert.equal(decideFileIndexChange(first, { ...first, sha256: "b" }, false), "create");
  assert.equal(
    decideFileIndexChange(first, { ...first, mime: "application/json" }, true),
    "update",
  );
  assert.equal(decideFileIndexChange(first, null, true), "delete");
  assert.equal(decideFileIndexChange({ ...first, available: false }, first, true), "restore");
  assert.equal(decideFileIndexChange({ available: false }, first, true), "update");
  assert.equal(decideFileIndexChange(null, null, false), "none");
});

test("日志发现贯穿新增、同版本内容更新与删除，并保护旧摘要", async () => {
  const { randomUUID, createHash } = await import("node:crypto");
  const { testDatabase } = await import("./database.js");
  const { query } = await import("../server/db.ts");
  const { Service } = await import("../server/service.js");
  const { processNextProjectMemory } = await import("../server/project-memory.js");
  const { replaceVersionContent, recordDocumentChange } =
    await import("../server/documents/index.js");
  const { visibleFileIndexSql } = await import("../server/file-index-visibility.ts");
  const { listFileIndexIssues, listFileIndexDiscoveryHistory } =
    await import("../server/file-index-jobs.js");
  const { discoverNextFileIndexChange, reconcileNextFileIndexArtifact } =
    await import("../server/file-index-discovery.js");
  const database = await testDatabase();
  const db = database.db;
  async function drain() {
    for (let i = 0; i < 500; i++) {
      if (await discoverNextFileIndexChange(db)) continue;
      if (await reconcileNextFileIndexArtifact(db)) continue;
      return;
    }
    throw new Error("文件发现未能排空");
  }
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "扫描链路" });
    const thread = await service.createThread(user, project.id, { title: "文件" });
    const version = await service.submitVersion(
      user,
      thread.id,
      {
        title: "扫描样例",
        filename: "sample.txt",
        contentBase64: Buffer.from("首次内容").toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    const [file] = await query(db, "SELECT artifact_id artifactId FROM versions WHERE id=?", [
      version.id,
    ]);
    assert.equal(
      (
        await query(db, "SELECT version_id FROM agent_document_memory_queue WHERE version_id=?", [
          version.id,
        ])
      ).length,
      0,
      "文件写入不能直接触发识别队列",
    );
    await drain();
    assert.equal(
      (
        await query(db, "SELECT operation FROM agent_document_memory_queue WHERE version_id=?", [
          version.id,
        ])
      )[0].operation,
      "create",
    );
    await processNextProjectMemory(db, {
      task: "document_memory",
      projectId: project.id,
      summarizeDocument: async () => ({ summary: "初始摘要", topics: [] }),
    });
    const [index] = await query(
      db,
      "SELECT page_id pageId FROM file_index_entries WHERE artifact_id=?",
      [file.artifactId],
    );
    const bytes = Buffer.from("替换后的内容");
    await replaceVersionContent(db, {
      id: version.id,
      content: bytes,
      mime: "text/plain",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.length,
      note: "",
      createdBy: user.id,
    });
    assert.equal(
      (
        await query(
          db,
          `SELECT p.id FROM wiki_pages p WHERE p.id=? AND p.status='current' AND ${visibleFileIndexSql("p")}`,
          [index.pageId],
        )
      ).length,
      0,
      "扫描前旧摘要也不能作为现行显示",
    );
    assert.equal(
      (await listFileIndexIssues(db, project.id, { keyword: "扫描样例" })).rows[0].previousSummary,
      "初始摘要",
    );
    await drain();
    assert.equal(
      (
        await query(db, "SELECT operation FROM agent_document_memory_queue WHERE version_id=?", [
          version.id,
        ])
      )[0].operation,
      "update",
    );
    await processNextProjectMemory(db, {
      task: "document_memory",
      projectId: project.id,
      summarizeDocument: async () => ({ summary: "更新摘要", topics: [] }),
    });
    assert.equal(
      (
        await query(db, "SELECT summary FROM agent_document_summaries WHERE version_id=?", [
          version.id,
        ])
      )[0].summary,
      "更新摘要",
    );
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [
      file.artifactId,
    ]);
    await recordDocumentChange(db, {
      projectId: project.id,
      artifactId: file.artifactId,
      action: "document_deleted",
    });
    await drain();
    assert.equal(
      (await query(db, "SELECT status FROM wiki_pages WHERE id=?", [index.pageId]))[0].status,
      "superseded",
    );
    const history = await listFileIndexDiscoveryHistory(db, project.id, {
      operation: "delete",
      keyword: "扫描样例",
    });
    assert.equal(history.total, 1);
    assert.equal(history.rows[0].artifactId, file.artifactId);
    // Recover identical bytes without spending another model call.
    await query(db, "UPDATE artifacts SET deleted_at=NULL WHERE id=?", [file.artifactId]);
    await recordDocumentChange(db, {
      projectId: project.id,
      artifactId: file.artifactId,
      action: "document_restored",
    });
    await drain();
    assert.equal(
      (
        await query(
          db,
          "SELECT p.status FROM file_index_entries fi JOIN wiki_pages p ON p.id=fi.page_id WHERE fi.artifact_id=?",
          [file.artifactId],
        )
      )[0].status,
      "current",
    );
    assert.equal(
      (await query(db, "SELECT status FROM wiki_pages WHERE id=?", [index.pageId]))[0].status,
      "superseded",
      "恢复只恢复相同内容的最新索引，不重新启用更早内容的索引",
    );
    assert.equal((await query(db, "SELECT version_id FROM agent_document_memory_queue")).length, 0);
    // The latest observation can describe bytes that have never been summarized.
    const changed = Buffer.from("尚未识别的新内容");
    await replaceVersionContent(db, {
      id: version.id,
      content: changed,
      mime: "text/plain",
      sha256: createHash("sha256").update(changed).digest("hex"),
      byteSize: changed.length,
      note: "",
      createdBy: user.id,
    });
    await drain();
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [
      file.artifactId,
    ]);
    await recordDocumentChange(db, {
      projectId: project.id,
      artifactId: file.artifactId,
      action: "document_deleted",
    });
    await drain();
    await query(db, "UPDATE artifacts SET deleted_at=NULL WHERE id=?", [file.artifactId]);
    await recordDocumentChange(db, {
      projectId: project.id,
      artifactId: file.artifactId,
      action: "document_restored",
    });
    await drain();
    assert.equal(
      (
        await query(db, "SELECT operation FROM agent_document_memory_queue WHERE version_id=?", [
          version.id,
        ])
      )[0].operation,
      "update",
    );
    assert.equal(
      (
        await query(
          db,
          `SELECT p.id FROM wiki_pages p WHERE p.id=? AND p.status='current' AND ${visibleFileIndexSql("p")}`,
          [index.pageId],
        )
      ).length,
      0,
    );
    // Once archived, background reconciliation must not change the memory.
    await query(db, "UPDATE projects SET archived_at=UTC_TIMESTAMP(3) WHERE id=?", [project.id]);
    await recordDocumentChange(db, {
      projectId: project.id,
      artifactId: file.artifactId,
      action: "document_restored",
    });
    await drain();
    assert.equal(
      (await query(db, "SELECT status FROM wiki_pages WHERE id=?", [index.pageId]))[0].status,
      "superseded",
    );
    assert.equal(
      await processNextProjectMemory(db, {
        task: "document_memory",
        projectId: project.id,
        summarizeDocument: async () => {
          throw new Error("归档项目不得调用模型");
        },
      }),
      false,
    );
  } finally {
    await database.close();
  }
});

test("文件立即运行不执行发现任务", async () => {
  const { randomUUID } = await import("node:crypto");
  const { testDatabase } = await import("./database.js");
  const { query } = await import("../server/db.ts");
  const { Service } = await import("../server/service.js");
  const { runMemoryMaintenance } = await import("../server/memory-maintenance.js");
  const database = await testDatabase();
  try {
    const db = database.db;
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "独立扫描" });
    const thread = await service.createThread(user, project.id, { title: "文件" });
    const version = await service.submitVersion(
      user,
      thread.id,
      {
        title: "待发现",
        filename: "later.txt",
        contentBase64: Buffer.from("content").toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    await runMemoryMaintenance(db, {
      maxBatches: 1,
      projectId: project.id,
      task: "document_memory",
    });
    assert.equal(
      (
        await query(db, "SELECT version_id FROM agent_document_memory_queue WHERE version_id=?", [
          version.id,
        ])
      ).length,
      0,
    );
    assert.equal(
      Number((await query(db, "SELECT COUNT(*) n FROM file_index_log_receipts"))[0].n),
      0,
    );
  } finally {
    await database.close();
  }
});

test("中断的文件识别可恢复，仍持锁的任务不会被误重排", async () => {
  const { randomUUID } = await import("node:crypto");
  const { testDatabase } = await import("./database.js");
  const { query } = await import("../server/db.ts");
  const { Service } = await import("../server/service.js");
  const { acquireNamedLock } = await import("../server/named-lock.ts");
  const { processNextProjectMemory } = await import("../server/project-memory.js");
  const { discoverNextFileIndexChange, reconcileNextFileIndexArtifact } =
    await import("../server/file-index-discovery.js");
  const database = await testDatabase();
  try {
    const db = database.db;
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "识别恢复" });
    const thread = await service.createThread(user, project.id, { title: "文件" });
    const version = await service.submitVersion(
      user,
      thread.id,
      {
        title: "恢复",
        filename: "recover.txt",
        contentBase64: Buffer.from("正文").toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    while (await discoverNextFileIndexChange(db)) {}
    while (await reconcileNextFileIndexArtifact(db)) {}
    await query(
      db,
      `UPDATE agent_document_memory_queue SET processing_state='processing',claimed_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 20 MINUTE) WHERE version_id=?`,
      [version.id],
    );
    const lock = await acquireNamedLock(db, `cothread-document-memory:${version.id}`);
    assert.ok(lock);
    try {
      assert.equal(
        await processNextProjectMemory(db, {
          task: "document_memory",
          projectId: project.id,
          summarizeDocument: async () => "不应调用",
        }),
        false,
      );
      assert.equal(
        (
          await query(
            db,
            "SELECT processing_state state FROM agent_document_memory_queue WHERE version_id=?",
            [version.id],
          )
        )[0].state,
        "processing",
      );
    } finally {
      await lock.release();
    }
    assert.equal(
      await processNextProjectMemory(db, {
        task: "document_memory",
        projectId: project.id,
        summarizeDocument: async () => ({ summary: "恢复成功", topics: [] }),
      }),
      true,
    );
    assert.equal(
      (
        await query(db, "SELECT summary FROM agent_document_summaries WHERE version_id=?", [
          version.id,
        ])
      )[0].summary,
      "恢复成功",
    );
    assert.equal(
      (
        await query(db, "SELECT version_id FROM agent_document_memory_queue WHERE version_id=?", [
          version.id,
        ])
      ).length,
      0,
    );
  } finally {
    await database.close();
  }
});

test("定时维护驱动日志发现而无需常驻后台", async () => {
  const { randomUUID } = await import("node:crypto");
  const { testDatabase } = await import("./database.js");
  const { query } = await import("../server/db.ts");
  const { Service } = await import("../server/service.js");
  const { runMemoryMaintenance } = await import("../server/memory-maintenance.js");
  const database = await testDatabase();
  try {
    const db = database.db;
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "定时发现" });
    const thread = await service.createThread(user, project.id, { title: "文件" });
    await service.submitVersion(
      user,
      thread.id,
      {
        title: "待扫描",
        filename: "scan.txt",
        contentBase64: Buffer.from("content").toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    await query(
      db,
      "INSERT INTO project_memory_backfills(project_id,status,updated_at) VALUES(?,'completed',UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE status='completed'",
      [project.id],
    );
    const result = await runMemoryMaintenance(db, { maxBatches: 1 });
    assert.equal(result.processed, 1);
    assert.equal(
      Number((await query(db, "SELECT COUNT(*) n FROM file_index_log_receipts"))[0].n),
      1,
    );
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) n FROM file_index_reconcile_requests WHERE project_id=?",
            [project.id],
          )
        )[0].n,
      ),
      1,
    );
  } finally {
    await database.close();
  }
});

test("模型必须调用受当前版本约束的保存工具，提交后才发布摘要", async () => {
  const { randomUUID } = await import("node:crypto");
  const { testDatabase } = await import("./database.js");
  const { query } = await import("../server/db.ts");
  const { Service } = await import("../server/service.js");
  const { processNextProjectMemory } = await import("../server/project-memory.js");
  const { discoverNextFileIndexChange, reconcileNextFileIndexArtifact } =
    await import("../server/file-index-discovery.js");
  const database = await testDatabase();
  try {
    const db = database.db;
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "文件提交工具" });
    const thread = await service.createThread(user, project.id, { title: "文件" });
    const version = await service.submitVersion(
      user,
      thread.id,
      {
        title: "工具文件",
        filename: "tool.txt",
        contentBase64: Buffer.from("正文").toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    while (await discoverNextFileIndexChange(db)) {}
    while (await reconcileNextFileIndexArtifact(db)) {}
    let saved = false;
    const options = {
      model: {
        baseUrl: "http://127.0.0.1:1/v1",
        apiKey: "test",
        model: "test",
        reasoningEffort: "medium",
      },
      createHarness: ({ env }) => ({
        async start() {},
        async close() {},
        async run() {
          assert.deepEqual(JSON.parse(env.COTHREAD_ALLOWED_TOOLS), ["save_file_index_summary"]);
          const body = JSON.stringify({
            name: "save_file_index_summary",
            args: { summary: "工具提交摘要", topics: ["测试"], ocrText: "" },
          });
          const call = (token) =>
            fetch(env.COTHREAD_BRIDGE_URL + "/tool", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body,
            });
          assert.equal((await call("wrong")).status, 403);
          const response = await call(env.COTHREAD_BRIDGE_TOKEN);
          assert.equal(response.status, 200);
          assert.equal((await response.json()).saved, true);
          assert.equal((await call(env.COTHREAD_BRIDGE_TOKEN)).status, 200);
          const conflict = await fetch(env.COTHREAD_BRIDGE_URL + "/tool", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.COTHREAD_BRIDGE_TOKEN}`,
            },
            body: JSON.stringify({
              name: "save_file_index_summary",
              args: { summary: "改写摘要" },
            }),
          });
          assert.equal(conflict.status, 400);
          assert.equal(
            (
              await query(db, "SELECT summary FROM agent_document_summaries WHERE version_id=?", [
                version.id,
              ])
            ).length,
            0,
            "工具提交先暂存，不能提前发布",
          );
          saved = true;
          return { finalResponse: "已保存" };
        },
      }),
    };
    assert.equal(
      await processNextProjectMemory(db, {
        projectId: project.id,
        task: "document_memory",
        laowengOptions: options,
      }),
      true,
    );
    assert.equal(saved, true);
    assert.equal(
      (
        await query(db, "SELECT summary FROM agent_document_summaries WHERE version_id=?", [
          version.id,
        ])
      )[0].summary,
      "工具提交摘要",
    );
    assert.equal(
      (
        await query(db, "SELECT attempt_id FROM file_index_tool_submissions WHERE version_id=?", [
          version.id,
        ])
      ).length,
      1,
    );
  } finally {
    await database.close();
  }
});

test("模型未调用保存工具时不能发布摘要", async () => {
  const { randomUUID } = await import("node:crypto");
  const { testDatabase } = await import("./database.js");
  const { query } = await import("../server/db.ts");
  const { Service } = await import("../server/service.js");
  const { processNextProjectMemory } = await import("../server/project-memory.js");
  const { discoverNextFileIndexChange, reconcileNextFileIndexArtifact } =
    await import("../server/file-index-discovery.js");
  const database = await testDatabase();
  try {
    const db = database.db,
      user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db),
      project = await service.createProject(user, { name: "未提交" }),
      thread = await service.createThread(user, project.id, { title: "资料" });
    const version = await service.submitVersion(
      user,
      thread.id,
      { title: "未提交", filename: "x.txt", contentBase64: Buffer.from("正文").toString("base64") },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    while (await discoverNextFileIndexChange(db)) {}
    while (await reconcileNextFileIndexArtifact(db)) {}
    const model = {
      baseUrl: "http://127.0.0.1:1/v1",
      apiKey: "test",
      model: "test",
      reasoningEffort: "medium",
    };
    const createHarness = () => ({
      async start() {},
      async close() {},
      async run() {
        return { finalResponse: JSON.stringify({ summary: "未通过工具的内容" }) };
      },
    });
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "document_memory",
      laowengOptions: { model, createHarness },
    });
    assert.equal(
      (
        await query(db, "SELECT summary FROM agent_document_summaries WHERE version_id=?", [
          version.id,
        ])
      ).length,
      0,
    );
    const [queued] = await query(
      db,
      "SELECT processing_state state,last_error error FROM agent_document_memory_queue WHERE version_id=?",
      [version.id],
    );
    assert.equal(queued.state, "queued");
    assert.match(queued.error, /未调用保存文件摘要工具/);
  } finally {
    await database.close();
  }
});

for (const submittedFirst of [false, true])
  test(`文件内容在工具提交${submittedFirst ? "后" : "前"}变化，不能发布旧结果`, async () => {
    const { randomUUID, createHash } = await import("node:crypto");
    const { testDatabase } = await import("./database.js");
    const { query } = await import("../server/db.ts");
    const { Service } = await import("../server/service.js");
    const { processNextProjectMemory } = await import("../server/project-memory.js");
    const { replaceVersionContent } = await import("../server/documents/index.js");
    const { discoverNextFileIndexChange, reconcileNextFileIndexArtifact } =
      await import("../server/file-index-discovery.js");
    const database = await testDatabase();
    try {
      const db = database.db,
        user = { id: randomUUID(), kind: "session" };
      await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
        user.id,
        `${user.id}@test.com`,
        "成员",
      ]);
      const service = new Service(db),
        project = await service.createProject(user, { name: "版本竞态" }),
        thread = await service.createThread(user, project.id, { title: "文件" });
      const version = await service.submitVersion(
        user,
        thread.id,
        {
          title: "竞态",
          filename: "race.txt",
          contentBase64: Buffer.from("旧正文").toString("base64"),
        },
        undefined,
        undefined,
        false,
        { silent: true },
      );
      while (await discoverNextFileIndexChange(db)) {}
      while (await reconcileNextFileIndexArtifact(db)) {}
      const model = {
        baseUrl: "http://127.0.0.1:1/v1",
        apiKey: "test",
        model: "test",
        reasoningEffort: "medium",
      };
      let rejected = false;
      const createHarness = ({ env }) => ({
        async start() {},
        async close() {},
        async run() {
          const submit = () =>
            fetch(env.COTHREAD_BRIDGE_URL + "/tool", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.COTHREAD_BRIDGE_TOKEN}`,
              },
              body: JSON.stringify({
                name: "save_file_index_summary",
                args: { summary: "旧内容摘要" },
              }),
            });
          if (submittedFirst) assert.equal((await submit()).status, 200);
          const bytes = Buffer.from("新正文");
          await replaceVersionContent(db, {
            id: version.id,
            content: bytes,
            mime: "text/plain",
            sha256: createHash("sha256").update(bytes).digest("hex"),
            byteSize: bytes.length,
            note: "",
            createdBy: user.id,
          });
          const response = await submit();
          assert.equal(response.status, 400);
          assert.match((await response.json()).error, /已变化/);
          rejected = true;
          return { finalResponse: '{"saved":false}' };
        },
      });
      await processNextProjectMemory(db, {
        projectId: project.id,
        task: "document_memory",
        laowengOptions: { model, createHarness },
      });
      assert.equal(rejected, true);
      assert.equal(
        (
          await query(db, "SELECT summary FROM agent_document_summaries WHERE version_id=?", [
            version.id,
          ])
        ).length,
        0,
      );
      assert.equal(
        (
          await query(db, "SELECT attempt_id FROM file_index_tool_submissions WHERE version_id=?", [
            version.id,
          ])
        ).length,
        submittedFirst ? 1 : 0,
      );
    } finally {
      await database.close();
    }
  });
