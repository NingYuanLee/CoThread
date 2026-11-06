import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { testDatabase } from "./database.js";
import { query } from "../server/db.ts";
import { Service } from "../server/service.ts";
import { createAgentTools } from "../server/agent-tools.ts";
import { dispatchContext } from "../server/coordinator.ts";
import { processNextProjectMemory, queueDocumentMemory } from "../server/project-memory.ts";
import { replaceVersionContent } from "../server/documents/versions.ts";

async function discoverDocumentChanges(db) {
  const { discoverNextFileIndexChange, reconcileNextFileIndexArtifact } =
    await import("../server/file-index-discovery.ts");
  while (await discoverNextFileIndexChange(db)) {}
  while (await reconcileNextFileIndexArtifact(db)) {}
}

test("tasks reuse one version-bound summary across the project and coordinator context", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const project = await new Service(db).createProject(user, { name: "文档摘要" });
    const service = new Service(db);
    const created = await service.createThread(user, project.id, { title: "读取资料" });
    const thread = await service.thread(user, created.id);
    const version = await service.submitVersion(
      user,
      thread.id,
      {
        title: "需求",
        filename: "requirements.md",
        contentBase64: Buffer.from("完整正文").toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    const firstTask = await service.postMessage(user, thread.id, { body: "@小祥 阅读需求并整理" });
    await query(
      db,
      "UPDATE assistant_replies SET status='running',parent_message_id=? WHERE message_id=?",
      [firstTask.id, firstTask.id],
    );
    const firstExecute = createAgentTools(
      service,
      { ...user, scope: project.id },
      { thread_id: thread.id, message_id: firstTask.id, parent_message_id: firstTask.id },
    );
    await assert.rejects(
      firstExecute("record_document_summary", {
        versionId: version.id,
        summary: "需求要求输出验收清单。",
      }),
      /请先读取该文档版本/,
    );
    await query(
      db,
      `INSERT INTO agent_events(message_id,tool,status,input,output,finished_at)
      VALUES(?,'read_document','completed',?,'{}',UTC_TIMESTAMP(3))`,
      [firstTask.id, JSON.stringify({ versionId: version.id })],
    );
    const queued = await firstExecute("record_document_summary", {
      versionId: version.id,
      summary: "需求要求输出验收清单。",
    });
    assert.equal(queued.queued, true);
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) count FROM agent_document_summaries WHERE version_id=?",
            [version.id],
          )
        )[0].count,
      ),
      0,
    );
    await query(
      db,
      "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id=?",
      [version.id],
    );
    assert.equal(
      await processNextProjectMemory(db, {
        projectId: project.id,
        task: "document_memory",
        summarizeDocument: async (input) => input.candidateSummary,
      }),
      true,
    );
    await query(
      db,
      "UPDATE assistant_replies SET status='completed',execution_active=FALSE,finished_at=UTC_TIMESTAMP(3) WHERE message_id=?",
      [firstTask.id],
    );
    const secondTask = await service.postMessage(user, thread.id, { body: "@小祥 再核对一次需求" });
    await query(
      db,
      "UPDATE assistant_replies SET status='running',parent_message_id=? WHERE message_id=?",
      [secondTask.id, secondTask.id],
    );
    const secondExecute = createAgentTools(
      service,
      { ...user, scope: project.id },
      { thread_id: thread.id, message_id: secondTask.id, parent_message_id: secondTask.id },
    );
    await query(
      db,
      `INSERT INTO agent_member_summaries(project_id,user_id,summary,through_sequence)
      VALUES(?,?,?,?)`,
      [project.id, user.id, "该成员偏好清晰的验收清单。", secondTask.sequence],
    );
    const projectContext = await secondExecute("project_context", {});
    assert.equal(projectContext.documentSummaries[0].summary, "需求要求输出验收清单。");
    assert.equal(
      projectContext.memberUnderstandings.find((member) => member.id === user.id).understanding,
      "该成员偏好清晰的验收清单。",
    );
    assert.equal(
      (await secondExecute("read_member", { memberId: user.id })).understanding,
      "该成员偏好清晰的验收清单。",
    );
    const reused = await secondExecute("record_document_summary", {
      versionId: version.id,
      summary: "另一份不应覆盖首份摘要。",
    });
    assert.equal(reused.reused, true);
    assert.equal(reused.summary, "需求要求输出验收清单。");
    const context = await dispatchContext(db, thread, {
      thread_id: thread.id,
      message_id: secondTask.id,
      sequence: secondTask.sequence,
      body: secondTask.body,
      participation: "reply",
    });
    assert.deepEqual(
      context.promptContext.documentSummaries.map((item) => ({
        versionId: item.versionId,
        artifactId: item.artifactId,
        title: item.title,
        filename: item.filename,
        version: item.version,
        summary: item.summary,
        relatedTaskIds: item.relatedTaskIds,
      })),
      [
        {
          versionId: version.id,
          artifactId: version.artifactId,
          title: "需求",
          filename: "requirements.md",
          version: 1,
          summary: "需求要求输出验收清单。",
          relatedTaskIds: [firstTask.id, secondTask.id],
        },
      ],
    );
    assert.deepEqual(
      context.promptContext.tasks.map((task) => task.documentVersionIds),
      [[version.id], [version.id]],
    );
    assert.equal(context.promptContext.tasks[0].closed, true);
    assert.equal(context.promptContext.tasks[0].noBackfill, true);
    assert.equal("resultSummary" in context.promptContext.tasks[0], false);
    assert.equal("closed" in context.promptContext.tasks[1], false);
    const [count] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_document_summaries WHERE version_id=?",
      [version.id],
    );
    assert.equal(Number(count.count), 1);
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) count FROM agent_document_memory_queue WHERE version_id=?",
            [version.id],
          )
        )[0].count,
      ),
      0,
    );
    assert.equal(JSON.stringify(context.promptContext).includes("完整正文"), false);
  } finally {
    await database.close();
  }
});

test("scheduled document memory merges a project's ready documents into one run", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "批量文档摘要" });
    const created = await service.createThread(user, project.id, { title: "资料" });
    const thread = await service.thread(user, created.id);
    const versionIds = [];
    for (const filename of ["a.md", "b.md", "c.md"]) {
      const version = await service.submitVersion(
        user,
        thread.id,
        {
          title: filename,
          filename,
          contentBase64: Buffer.from(`${filename} 正文`).toString("base64"),
        },
        undefined,
        undefined,
        false,
        { silent: true },
      );
      versionIds.push(version.id);
      await queueDocumentMemory(db, version.id);
    }
    // User-created subfolders have no folder_kind; their root determines scope.
    const [official] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL",
      [project.id],
    );
    const folderId = randomUUID();
    await query(db, "INSERT INTO document_folders(id,project_id,parent_id,name) VALUES(?,?,?,?)", [
      folderId,
      project.id,
      official.id,
      "自建目录",
    ]);
    await query(
      db,
      "UPDATE artifacts a JOIN versions v ON v.artifact_id=a.id SET a.folder_id=? WHERE v.id=?",
      [folderId, versionIds[0]],
    );
    await query(
      db,
      "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id IN (?,?,?)",
      versionIds,
    );
    const summarizeDocument = async (input) => `摘要：${input.filename}`;
    // 定时排空路径（不带 projectId）：一批新文档只应产生一条维护 run。
    assert.equal(
      await processNextProjectMemory(db, { task: "document_memory", summarizeDocument }),
      true,
    );
    assert.equal(
      await processNextProjectMemory(db, { task: "document_memory", summarizeDocument }),
      false,
    );
    const runs = await query(
      db,
      "SELECT item_count,agent_called,had_updates,status,result FROM agent_laoweng_runs WHERE project_id=? AND task='document_memory'",
      [project.id],
    );
    assert.equal(runs.length, 1);
    assert.equal(Number(runs[0].item_count), 3);
    assert.equal(Number(runs[0].agent_called), 1);
    assert.equal(runs[0].status, "completed");
    const result = typeof runs[0].result === "string" ? JSON.parse(runs[0].result) : runs[0].result;
    assert.equal(result.summarized, 3);
    assert.equal(result.postponed, 0);
    const summaries = await query(
      db,
      "SELECT version_id,summary FROM agent_document_summaries WHERE version_id IN (?,?,?)",
      versionIds,
    );
    assert.equal(summaries.length, 3);
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) count FROM agent_document_memory_queue WHERE version_id IN (?,?,?)",
            versionIds,
          )
        )[0].count,
      ),
      0,
    );
  } finally {
    await database.close();
  }
});

test("non-text documents without a candidate summary are parked instead of retried daily", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "图文文档摘要" });
    const created = await service.createThread(user, project.id, { title: "截图" });
    const thread = await service.thread(user, created.id);
    const version = await service.submitVersion(
      user,
      thread.id,
      {
        title: "二进制附件",
        filename: "bundle.zip",
        contentBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    await queueDocumentMemory(db, version.id);
    await query(
      db,
      "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id=?",
      [version.id],
    );
    let summarizeCalls = 0;
    const summarizeDocument = async () => {
      summarizeCalls += 1;
      return "非文本文档不应走到摘要模型";
    };
    assert.equal(
      await processNextProjectMemory(db, { task: "document_memory", summarizeDocument }),
      true,
    );
    assert.equal(summarizeCalls, 0);
    const queued = await query(
      db,
      `SELECT (available_at>DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 20 DAY)) parked
      FROM agent_document_memory_queue WHERE version_id=?`,
      [version.id],
    );
    assert.equal(queued.length, 1);
    assert.equal(Number(queued[0].parked), 1);
    const runs = await query(
      db,
      "SELECT item_count,agent_called,had_updates,result FROM agent_laoweng_runs WHERE project_id=? AND task='document_memory'",
      [project.id],
    );
    assert.equal(runs.length, 1);
    assert.equal(Number(runs[0].item_count), 1);
    assert.equal(Number(runs[0].agent_called), 0);
    assert.equal(Number(runs[0].had_updates), 0);
    const result = typeof runs[0].result === "string" ? JSON.parse(runs[0].result) : runs[0].result;
    assert.equal(result.postponed, 1);
    // 未到期就不应再产生维护 run
    assert.equal(
      await processNextProjectMemory(db, { task: "document_memory", summarizeDocument }),
      false,
    );
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) count FROM agent_laoweng_runs WHERE project_id=? AND task='document_memory'",
            [project.id],
          )
        )[0].count,
      ),
      1,
    );
  } finally {
    await database.close();
  }
});

test("image documents are summarized from their bytes instead of being parked or dropped", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "图片文档摘要" });
    const created = await service.createThread(user, project.id, { title: "截图" });
    const thread = await service.thread(user, created.id);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const version = await service.submitVersion(
      user,
      thread.id,
      {
        title: "Admin 预览截图",
        filename: "admin-index-full.png",
        contentBase64: png.toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    await queueDocumentMemory(db, version.id);
    await query(
      db,
      "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id=?",
      [version.id],
    );
    let seen = null;
    assert.equal(
      await processNextProjectMemory(db, {
        task: "document_memory",
        summarizeDocument: async (input) => {
          seen = input;
          return { summary: "截图里是管理页", topics: ["后台管理"], ocrText: "用户管理" };
        },
      }),
      true,
    );
    assert.equal(seen?.image?.mimeType, "image/png");
    assert.equal(seen.image.data, png.toString("base64"));
    const [indexed] = await query(
      db,
      "SELECT topics FROM file_index_entries WHERE indexed_version_id=?",
      [version.id],
    );
    assert.deepEqual(
      typeof indexed.topics === "string" ? JSON.parse(indexed.topics) : indexed.topics,
      ["后台管理"],
    );
    const [indexPage] = await query(
      db,
      `SELECT p.body,fi.recognition_status status FROM file_index_entries fi
      JOIN wiki_pages p ON p.id=fi.page_id WHERE fi.indexed_version_id=?`,
      [version.id],
    );
    assert.equal(indexPage.status, "partial");
    assert.match(indexPage.body, /识别文字（需核对原文件）/);
    assert.match(indexPage.body, /用户管理/);
    // A later enqueue for a version already summarized must not leave a row
    // that the worker will never claim.
    await queueDocumentMemory(db, version.id);
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) count FROM agent_document_memory_queue WHERE version_id=?",
            [version.id],
          )
        )[0].count,
      ),
      0,
    );
    await query(
      db,
      "INSERT INTO agent_document_memory_queue(version_id, available_at) VALUES (?,UTC_TIMESTAMP(3))",
      [version.id],
    );
    const cleanup = await readFile(
      new URL("../migrations/152_cleanup_summarized_document_queue.sql", import.meta.url),
      "utf8",
    );
    await query(db, cleanup);
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) count FROM agent_document_memory_queue WHERE version_id=?",
            [version.id],
          )
        )[0].count,
      ),
      0,
    );
    const runs = await query(
      db,
      "SELECT agent_called,result FROM agent_laoweng_runs WHERE project_id=? AND task='document_memory'",
      [project.id],
    );
    assert.equal(runs.length, 1);
    assert.equal(Number(runs[0].agent_called), 1);
    const result = typeof runs[0].result === "string" ? JSON.parse(runs[0].result) : runs[0].result;
    assert.equal(result.summarized, 1);
    assert.equal(result.postponed || 0, 0);
    assert.equal(result.drained || 0, 0);
  } finally {
    await database.close();
  }
});

test("ZIP 使用可验证的目录清单进入内容分析", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "压缩包索引" });
    const created = await service.createThread(user, project.id, { title: "附件" });
    const zip = new JSZip();
    zip.file("src/index.js", "export default 1");
    zip.file("README.md", "说明");
    const content = await zip.generateAsync({ type: "nodebuffer" });
    const version = await service.submitVersion(
      user,
      created.id,
      { title: "代码包", filename: "bundle.zip", contentBase64: content.toString("base64") },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    await discoverDocumentChanges(db);
    await query(
      db,
      "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id=?",
      [version.id],
    );
    let seen;
    assert.equal(
      await processNextProjectMemory(db, {
        task: "document_memory",
        summarizeDocument: async (context) => {
          seen = context.candidateSummary;
          return { summary: "压缩包包含代码和说明文件。", topics: ["代码资料"] };
        },
      }),
      true,
    );
    assert.match(seen, /src\/index\.js/);
    assert.match(seen, /尚未读取包内文件/);
    const [entry] = await query(
      db,
      "SELECT topics FROM file_index_entries WHERE indexed_version_id=?",
      [version.id],
    );
    assert.deepEqual(typeof entry.topics === "string" ? JSON.parse(entry.topics) : entry.topics, [
      "代码资料",
    ]);
  } finally {
    await database.close();
  }
});

test("Word 正文进入分析并将提取范围写入文件索引", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "Word 索引" });
    const thread = await service.createThread(user, project.id, { title: "文档" });
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      "<w:document><w:p><w:r><w:t>验收需要签字</w:t></w:r></w:p></w:document>",
    );
    const bytes = await zip.generateAsync({ type: "nodebuffer" });
    const version = await service.submitVersion(
      user,
      thread.id,
      { title: "验收", filename: "验收.docx", contentBase64: bytes.toString("base64") },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    await discoverDocumentChanges(db);
    await query(
      db,
      "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id=?",
      [version.id],
    );
    let seen;
    await processNextProjectMemory(db, {
      task: "document_memory",
      summarizeDocument: async (input) => {
        seen = input;
        return { summary: "验收需要签字。", topics: ["验收"] };
      },
    });
    assert.match(seen.content, /验收需要签字/);
    const [row] = await query(
      db,
      `SELECT fi.recognition_status status,p.body FROM file_index_entries fi
      JOIN wiki_pages p ON p.id=fi.page_id WHERE fi.indexed_version_id=?`,
      [version.id],
    );
    assert.equal(row.status, "partial");
    assert.match(row.body, /图片、批注等未覆盖/);
  } finally {
    await database.close();
  }
});

test("同一版本内容替换时，正在运行的旧摘要不能覆盖新内容", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "文件替换" });
    const thread = await service.createThread(user, project.id, { title: "资料" });
    const version = await service.submitVersion(
      user,
      thread.id,
      {
        title: "方案",
        filename: "plan.txt",
        contentBase64: Buffer.from("旧内容").toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    await discoverDocumentChanges(db);
    await query(
      db,
      "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id=?",
      [version.id],
    );
    let release;
    let notify;
    const entered = new Promise((resolve) => {
      notify = resolve;
    });
    const paused = new Promise((resolve) => {
      release = resolve;
    });
    const running = processNextProjectMemory(db, {
      task: "document_memory",
      projectId: project.id,
      summarizeDocument: async () => {
        notify();
        await paused;
        return { summary: "旧摘要", topics: ["旧主题"] };
      },
    });
    await entered;
    const next = Buffer.from("更新后的内容");
    await replaceVersionContent(db, {
      id: version.id,
      content: next,
      mime: "text/plain",
      sha256: "f".repeat(64),
      byteSize: next.length,
      note: "更新",
      createdBy: user.id,
    });
    await discoverDocumentChanges(db);
    release();
    await running;
    assert.equal(
      (
        await query(db, "SELECT version_id FROM agent_document_summaries WHERE version_id=?", [
          version.id,
        ])
      ).length,
      0,
    );
    assert.equal(
      (
        await query(db, "SELECT version_id FROM agent_document_memory_queue WHERE version_id=?", [
          version.id,
        ])
      ).length,
      1,
    );
    const [pending] = await query(
      db,
      `SELECT p.body,fi.recognition_status status FROM file_index_entries fi
      JOIN wiki_pages p ON p.id=fi.page_id WHERE fi.indexed_version_id=?`,
      [version.id],
    );
    assert.equal(pending.status, "unrecognized");
    assert.doesNotMatch(pending.body, /旧摘要/);
    await query(
      db,
      "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id=?",
      [version.id],
    );
    await processNextProjectMemory(db, {
      task: "document_memory",
      projectId: project.id,
      summarizeDocument: async (input) => ({
        summary: `已整理：${input.content}`,
        topics: ["新主题"],
      }),
    });
    const [updated] = await query(
      db,
      "SELECT summary FROM agent_document_summaries WHERE version_id=?",
      [version.id],
    );
    assert.match(updated.summary, /更新后的内容/);
  } finally {
    await database.close();
  }
});

test("人工重新识别保留旧摘要，失败后重排，成功才替换", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "重新识别" });
    const thread = await service.createThread(user, project.id, { title: "资料" });
    const version = await service.submitVersion(
      user,
      thread.id,
      {
        title: "正文",
        filename: "body.txt",
        contentBase64: Buffer.from("原始内容").toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    await discoverDocumentChanges(db);
    await query(
      db,
      "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id=?",
      [version.id],
    );
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "document_memory",
      summarizeDocument: async () => ({ summary: "旧摘要", topics: [] }),
    });
    const [file] = await query(db, "SELECT artifact_id artifactId FROM versions WHERE id=?", [
      version.id,
    ]);
    const { retryFileIndexJob } = await import("../server/file-index-jobs.ts");
    await retryFileIndexJob(service, user, project.id, file.artifactId);
    assert.equal(
      (
        await query(db, "SELECT summary FROM agent_document_summaries WHERE version_id=?", [
          version.id,
        ])
      )[0].summary,
      "旧摘要",
    );
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "document_memory",
      summarizeDocument: async () => {
        throw new Error("模型失败");
      },
    });
    assert.equal(
      (
        await query(db, "SELECT summary FROM agent_document_summaries WHERE version_id=?", [
          version.id,
        ])
      )[0].summary,
      "旧摘要",
    );
    const [failed] = await query(
      db,
      "SELECT processing_state state,last_error error FROM agent_document_memory_queue WHERE version_id=?",
      [version.id],
    );
    assert.equal(failed.state, "queued");
    assert.match(failed.error, /模型失败/);
    await query(
      db,
      "UPDATE agent_document_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE version_id=?",
      [version.id],
    );
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "document_memory",
      summarizeDocument: async () => ({ summary: "新摘要", topics: [] }),
    });
    assert.equal(
      (
        await query(db, "SELECT summary FROM agent_document_summaries WHERE version_id=?", [
          version.id,
        ])
      )[0].summary,
      "新摘要",
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

test("文件批次保留逐文件结果且单项失败不阻断后续文件", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "文件批次结果" });
    const thread = await service.createThread(user, project.id, { title: "资料" });
    const ids = [];
    for (const name of ["first.txt", "second.txt"]) {
      const v = await service.submitVersion(
        user,
        thread.id,
        { title: name, filename: name, contentBase64: Buffer.from(name).toString("base64") },
        undefined,
        undefined,
        false,
        { silent: true },
      );
      ids.push(v.id);
    }
    await discoverDocumentChanges(db);
    await query(
      db,
      "UPDATE agent_document_memory_queue SET queued_at=IF(version_id=?,DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE),UTC_TIMESTAMP(3)),available_at=UTC_TIMESTAMP(3) WHERE version_id IN (?,?)",
      [ids[0], ...ids],
    );
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "document_memory",
      summarizeDocument: async (input) => {
        if (input.versionId === ids[0]) throw new Error("预期失败");
        return { summary: "成功", topics: [] };
      },
    });
    const { listMemoryJobHistory } = await import("../server/memory-jobs.ts");
    const history = await listMemoryJobHistory(db, project.id, "document_memory");
    const run = history.rows[0];
    assert.equal(run.status, "failed");
    assert.equal(run.documentItems.length, 2);
    assert.equal(run.documentItems.find((item) => item.versionId === ids[0]).status, "failed");
    assert.match(run.documentItems.find((item) => item.versionId === ids[0]).error, /预期失败/);
    assert.equal(run.documentItems.find((item) => item.versionId === ids[1]).status, "recognized");
    assert.equal(
      (
        await query(db, "SELECT summary FROM agent_document_summaries WHERE version_id=?", [ids[1]])
      )[0].summary,
      "成功",
    );
  } finally {
    await database.close();
  }
});
