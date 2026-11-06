import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { testDatabase } from "./database.js";
import { migrate } from "../scripts/migrate.js";
import { query } from "../server/db.ts";
import { Service } from "../server/service.ts";
import {
  queueConversationMessage,
  createConversationWindow,
} from "../server/conversation-memory-store.ts";
import { processConversationWindow } from "../server/conversation-memory-runner.ts";
import { loadConversationContext } from "../server/conversation-memory-context.ts";
import { startConversationToolBridge } from "../server/conversation-memory-tools.ts";
import { createVersion } from "../server/documents/versions.ts";
import {
  listFileIndexIssues,
  readFileIndexJobs,
  retryFileIndexJob,
} from "../server/file-index-jobs.ts";
import { listMemoryJobs } from "../server/memory-jobs.ts";
import { processNextProjectMemory } from "../server/project-memory.ts";

async function setup() {
  const database = await testDatabase(),
    db = database.db;
  const owner = { id: randomUUID(), kind: "session" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    owner.id,
    owner.id + "@test.com",
    "负责人",
  ]);
  const service = new Service(db);
  const project = await service.createProject(owner, { name: "记忆改造回归" });
  const threadId = randomUUID();
  await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
    threadId,
    project.id,
    "讨论",
    owner.id,
  ]);
  const message = async (body) => {
    const id = randomUUID();
    const row = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
      [id, threadId, owner.id, body],
    );
    await queueConversationMessage(db, project.id, threadId, row.insertId);
    return id;
  };
  return { database, db, owner, service, project, threadId, message };
}

test("来源编辑后替代窗口只重分析失败项，成功页不重复，后续消息继续推进", async () => {
  const { database, db, owner, project, message } = await setup();
  try {
    const sourceId = await message("优先处理这个问题？");
    const window = await createConversationWindow(db, { projectId: project.id, force: true });
    const statement = {
      memberId: owner.id,
      subtype: "key_judgment",
      title: "优先处理",
      body: "提出优先处理",
      sourceIds: [sourceId],
    };
    const discussion = {
      subtype: "requirements",
      title: "处理顺序",
      body: "讨论处理顺序",
      stage: "pending",
      sourceIds: [sourceId],
    };
    const first = await processConversationWindow(db, window.id, {
      analyze: async () => ({ statements: [statement], discussions: ["格式不合格的旧候选"] }),
      verifySupport: async ({ kind }) => kind === "statement",
    });
    assert.equal(first.applied, 1);
    await query(db, "UPDATE messages SET body='优先处理修复问题？' WHERE id=?", [sourceId]);
    const nextSourceId = await message("后续新消息");
    const invalid = await processConversationWindow(db, window.id);
    assert.equal(invalid.invalidated, true);
    assert.ok(invalid.replacementId);
    assert.equal((await processConversationWindow(db, window.id)).skipped, true);
    await assert.rejects(loadConversationContext(db, window.id), /修改或删除/);
    let repairs = 0;
    const recovered = await processConversationWindow(db, invalid.replacementId, {
      analyze: async () => {
        throw new Error("不能重生成成功项");
      },
      repairCandidate: async ({ context }) => {
        repairs++;
        assert.match(context.messages[0].body, /修复/);
        return { ...discussion, body: "重新核验处理修复问题" };
      },
      verifySupport: async () => true,
    });
    assert.equal(recovered.failed, 0);
    assert.equal(repairs, 1);
    const [count] = await query(
      db,
      "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=? AND subject_type IN ('utterance','discussion')",
      [project.id],
    );
    assert.equal(Number(count.count), 2);
    const next = await createConversationWindow(db, { projectId: project.id, force: true });
    assert.ok(next);
    assert.equal((await loadConversationContext(db, next.id)).messages.length, 1);
    await processConversationWindow(db, next.id, {
      analyze: async () => ({
        statements: [{ ...statement, title: "后续发言", sourceIds: [nextSourceId] }],
        discussions: [{ ...discussion, title: "后续议题", sourceIds: [nextSourceId] }],
      }),
      verifySupport: async ({ kind }) => kind === "statement",
    });
    await query(db, "UPDATE messages SET body='问题已撤回，没有需要长期保留的议题' WHERE id=?", [
      nextSourceId,
    ]);
    const withdrawn = await processConversationWindow(db, next.id);
    const recovery = {
      repairCandidate: async () => ({ discardReason: "问题已撤回且没有应保留的议题" }),
      verifySupport: async () => false,
    };
    assert.equal(
      (await processConversationWindow(db, withdrawn.replacementId, recovery)).failed,
      1,
      "零产出也要独立核验",
    );
    const ended = await processConversationWindow(db, withdrawn.replacementId, {
      ...recovery,
      verifySupport: async () => true,
    });
    assert.equal(ended.failed, 0);
    assert.equal(ended.discarded, 1);
    const jobs = await listMemoryJobs(db, project.id);
    const resumed = jobs
      .find((job) => job.key === "member_memory")
      .conversationWindows.find((window) => window.id === withdrawn.replacementId);
    assert.equal(Number(resumed.discussionCount), 0, "结束候选不能计为新增记忆");
    await message("撤回后的讨论仍继续");
    assert.ok(await createConversationWindow(db, { projectId: project.id, force: true }));
  } finally {
    await database.close();
  }
});

test("文件工具桥动态导航与回收边界，文件覆盖及重试绑定当前文件", async () => {
  const { database, db, owner, service, project } = await setup();
  let bridge;
  try {
    const folderId = randomUUID(),
      artifactId = randomUUID(),
      versionId = randomUUID();
    await query(
      db,
      "INSERT INTO document_folders(id,project_id,name,folder_kind) VALUES(?,?,?,'project_official')",
      [folderId, project.id, "正式材料"],
    );
    await query(
      db,
      "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
      [artifactId, project.id, "方案", owner.id, folderId],
    );
    await createVersion(db, {
      id: versionId,
      artifactId,
      version: 1,
      filename: "plan.txt",
      mime: "text/plain",
      content: Buffer.from("方案正文"),
      sha256: "a".repeat(64),
      byteSize: 12,
      note: "",
      createdBy: owner.id,
    });
    const { discoverNextFileIndexChange, reconcileNextFileIndexArtifact } =
      await import("../server/file-index-discovery.ts");
    while (await discoverNextFileIndexChange(db)) {}
    while (await reconcileNextFileIndexArtifact(db)) {}
    const [file] = await query(
      db,
      "SELECT page_id pageId FROM file_index_entries WHERE artifact_id=?",
      [artifactId],
    );
    const [root] = await query(
      db,
      "SELECT page_id pageId FROM file_index_roots WHERE project_id=? LIMIT 1",
      [project.id],
    );
    bridge = await startConversationToolBridge(db, {
      window: { projectId: project.id, projectOwner: owner.id },
      pages: [],
    });
    const read = async (pageId) => {
      const response = await fetch(bridge.env.COTHREAD_BRIDGE_URL + "/tool", {
        method: "POST",
        headers: { Authorization: "Bearer " + bridge.env.COTHREAD_BRIDGE_TOKEN },
        body: JSON.stringify({ name: "read_memory", args: { pageId } }),
      });
      return { status: response.status, body: await response.json() };
    };
    const navigation = await read(root.pageId);
    assert.match(JSON.parse(navigation.body).text, /主题导航/);
    const [raw] = await query(db, "SELECT body FROM wiki_pages WHERE id=?", [root.pageId]);
    assert.equal(bridge.snapshots().find((page) => page.id === root.pageId).body, raw.body);
    await query(db, "UPDATE document_folders SET name='移动后目录' WHERE id=?", [folderId]);
    assert.match(JSON.parse((await read(file.pageId)).body).text, /移动后目录/);
    await query(
      db,
      "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id=?",
      [versionId],
    );
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "document_memory",
      summarizeDocument: async () => {
        throw new Error("模型识别失败");
      },
    });
    let jobs = await readFileIndexJobs(db, project.id);
    assert.equal(jobs.coverage.total, 1);
    assert.equal(jobs.coverage.pending, 1);
    assert.equal(jobs.issues[0].processingState, "failed");
    assert.match(jobs.issues[0].recognitionNote, /模型识别失败/);
    assert.equal(
      (await retryFileIndexJob(service, owner, project.id, artifactId)).versionId,
      versionId,
    );
    const retriedFiles = await listFileIndexIssues(db, project.id, {
      keyword: "plan.txt",
      status: "pending",
      queue: "pending",
      pageSize: 1,
    });
    assert.equal(retriedFiles.total, 1);
    assert.equal(retriedFiles.rows[0].artifactId, artifactId);
    const retriedCoverage = (await readFileIndexJobs(db, project.id)).coverage;
    assert.equal(retriedCoverage.pending, 1);
    assert.equal(retriedFiles.rows[0].processingState, "pending");
    assert.equal((await listFileIndexIssues(db, project.id, { queue: "success" })).total, 0);
    await query(db, "DELETE FROM agent_document_memory_queue WHERE version_id=?", [versionId]);
    await query(
      db,
      "UPDATE file_index_entries SET recognition_status='recognized' WHERE artifact_id=?",
      [artifactId],
    );
    const recognizedFiles = await listFileIndexIssues(db, project.id, {
      status: "recognized",
      queue: "success",
    });
    assert.equal(recognizedFiles.total, 1);
    assert.equal(recognizedFiles.rows[0].artifactId, artifactId);
    assert.equal(recognizedFiles.rows[0].processingState, "success");
    assert.equal((await readFileIndexJobs(db, project.id)).coverage.recognized, 1);
    await assert.rejects(retryFileIndexJob(service, owner, project.id, randomUUID()), /不存在/);
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [artifactId]);
    assert.equal((await read(file.pageId)).status, 400);
    jobs = await readFileIndexJobs(db, project.id);
    assert.equal(jobs.coverage.total, 0);
    assert.equal(jobs.coverage.pending, 0);
    await assert.rejects(retryFileIndexJob(service, owner, project.id, artifactId), /回收/);
    await query(db, "UPDATE artifacts SET deleted_at=NULL WHERE id=?", [artifactId]);
    assert.equal((await read(file.pageId)).status, 200);
    await query(db, "INSERT INTO version_recycle(version_id) VALUES(?)", [versionId]);
    assert.equal((await read(file.pageId)).status, 400);
    assert.equal((await readFileIndexJobs(db, project.id)).coverage.total, 0);
    await query(db, "DELETE FROM version_recycle WHERE version_id=?", [versionId]);
    await query(db, "UPDATE artifacts SET purged_at=UTC_TIMESTAMP(3) WHERE id=?", [artifactId]);
    assert.equal((await read(file.pageId)).status, 400);
    await query(db, "UPDATE artifacts SET purged_at=NULL WHERE id=?", [artifactId]);
    const other = await service.createProject(owner, { name: "另一个项目" });
    const otherPage = randomUUID();
    await query(
      db,
      "INSERT INTO wiki_pages(id,project_id,title,body,status,created_by,updated_by) VALUES(?,?,'跨项目页','其他项目正文','current',?,?)",
      [otherPage, other.id, owner.id, owner.id],
    );
    assert.equal((await read(otherPage)).status, 400);
  } finally {
    await bridge?.close();
    await database.close();
  }
});

test("旧成员队列先保存审计，缺失来源标记待核对，重试不重复", async () => {
  const { database, db, owner, project, message } = await setup();
  try {
    await message("待迁移的消息");
    const [last] = await query(db, "SELECT MAX(sequence) sequence FROM messages");
    const missing = randomUUID();
    const processed = randomUUID();
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      missing,
      missing + "@test.com",
      "无来源成员",
    ]);
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      processed,
      processed + "@test.com",
      "已处理成员",
    ]);
    await query(
      db,
      "INSERT INTO agent_member_summaries(project_id,user_id,summary,through_sequence) VALUES(?,?,'已处理',?)",
      [project.id, processed, last.sequence],
    );
    for (const id of [owner.id, missing, processed])
      await query(
        db,
        "INSERT INTO agent_member_memory_queue(project_id,user_id,pending_through_sequence,available_at) VALUES(?,?,?,UTC_TIMESTAMP(3))",
        [project.id, id, last.sequence],
      );
    const run = async (name) => {
      const sql = await readFile(new URL("../migrations/" + name, import.meta.url), "utf8");
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await query(db, statement);
    };
    await run("155_legacy_member_queue_audit.sql");
    await run("155_legacy_member_queue_audit.sql");
    const rows = await query(
      db,
      "SELECT user_id userId,classification FROM legacy_member_queue_audit WHERE project_id=?",
      [project.id],
    );
    assert.equal(rows.length, 3);
    assert.equal(rows.find((row) => row.userId === owner.id).classification, "migratable");
    assert.equal(rows.find((row) => row.userId === missing).classification, "needs_review");
    assert.equal(rows.find((row) => row.userId === processed).classification, "already_processed");
    await run("156_conversation_memory_cutover.sql");
    await run("155_legacy_member_queue_audit.sql");
    const [audit] = await query(
      db,
      "SELECT COUNT(*) count FROM legacy_member_queue_audit WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(audit.count), 3);
    await query(
      db,
      "DELETE FROM schema_migrations WHERE name='161_conversation_window_recovery.sql'",
    );
    await migrate(db);
    await migrate(db);
    const [receipt] = await query(
      db,
      "SELECT COUNT(*) count FROM schema_migrations WHERE name='161_conversation_window_recovery.sql'",
    );
    assert.equal(Number(receipt.count), 1, "窗口恢复迁移丢失回执后可安全重试");
  } finally {
    await database.close();
  }
});
