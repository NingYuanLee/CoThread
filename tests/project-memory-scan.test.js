import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.ts";
import { Service } from "../server/service.ts";
import { scanProjectMemorySignals } from "../server/project-memory-scan.ts";
import { createVersion, replaceVersionContent } from "../server/documents/versions.ts";

async function setup() {
  const database = await testDatabase();
  const db = database.db;
  const service = new Service(db);
  const owner = { id: randomUUID(), kind: "session" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    owner.id,
    owner.id + "@test.com",
    "负责人",
  ]);
  const project = await service.createProject(owner, { name: "扫描项目" });
  const thread = await service.createThread(owner, project.id, { title: "第一轮" });
  return { database, db, service, owner, project, thread };
}

const queueRows = (db, projectId) =>
  query(
    db,
    `SELECT source_kind sourceKind,source_id sourceId,hint,signal_revision signalRevision
     FROM agent_project_memory_queue WHERE project_id=? ORDER BY source_kind,source_id`,
    [projectId],
  );

/** 先消费掉建项目产生的首批信号，让后续断言只针对本用例制造的事实。 */
async function primeScan(db, projectId) {
  await scanProjectMemorySignals(db, projectId);
  await query(db, "DELETE FROM agent_project_memory_queue WHERE project_id=?", [projectId]);
}

async function insertFormalTask(db, { projectId, userId, threadId = null }) {
  const taskId = randomUUID();
  await query(
    db,
    `INSERT INTO agent_tasks(id,project_id,created_by_type,created_by_id,task_type,title,goal,status,execution_agent_type,retry_count,revision,origin_thread_id)
     VALUES(?,?,'human_member',?,'formal','正式任务','目标','completed','child_agent',0,1,?)`,
    [taskId, projectId, userId, threadId],
  );
  await query(
    db,
    `INSERT INTO agent_task_status_events(task_id,from_status,to_status,actor_type,actor_id)
     VALUES(?,NULL,'completed','system',?)`,
    [taskId, userId],
  );
  return taskId;
}

test("新建项目首批事实由首次扫描入队，建项目时不直接写队列", async () => {
  const { database, db, project } = await setup();
  try {
    assert.equal((await queueRows(db, project.id)).length, 0, "建项目不直接写队列");
    const scanned = await scanProjectMemorySignals(db, project.id);
    assert.equal(scanned.initialized, false);
    assert.equal(scanned.inserted, 1);
    const rows = await queueRows(db, project.id);
    assert.equal(rows[0].sourceKind, "milestone");
    assert.match(rows[0].hint, /created/);
    const again = await scanProjectMemorySignals(db, project.id);
    assert.equal(again.inserted, 0, "游标推进后不重复写");
  } finally {
    await database.close();
  }
});

test("项目变更、主要任务终态、迭代目标变更按游标生成信号且不重复", async () => {
  const { database, db, service, owner, project, thread } = await setup();
  try {
    await primeScan(db, project.id);
    await service.projectChange(db, project.id, owner.id, "profile_updated", { name: "改名" });
    await insertFormalTask(db, { projectId: project.id, userId: owner.id, threadId: thread.id });
    const changeId = randomUUID();
    await query(
      db,
      `INSERT INTO iteration_context_changes(id,thread_id,changed_by,source,reason,before_context,after_context)
       VALUES(?,?,?,'human','变更目标',?,?)`,
      [
        changeId,
        thread.id,
        owner.id,
        JSON.stringify({ goal: "旧" }),
        JSON.stringify({ goal: "新" }),
      ],
    );
    const scanned = await scanProjectMemorySignals(db, project.id);
    assert.equal(scanned.inserted, 3);
    const rows = await queueRows(db, project.id);
    assert.deepEqual(rows.map((row) => row.sourceKind).sort(), [
      "iteration_context",
      "milestone",
      "task",
    ]);
    assert.ok(rows.every((row) => row.hint));
    const again = await scanProjectMemorySignals(db, project.id);
    assert.equal(again.inserted, 0, "游标推进后不重复写");
    assert.equal((await queueRows(db, project.id)).length, 3);
  } finally {
    await database.close();
  }
});

test("正式文件新版本与内容替换不进入项目进程", async () => {
  const { database, db, owner, project } = await setup();
  try {
    await primeScan(db, project.id);
    const [folder] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
      [project.id],
    );
    assert.ok(folder, "项目创建时应已建正式文件根目录");
    const artifactId = randomUUID();
    await query(
      db,
      "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
      [artifactId, project.id, "需求说明", owner.id, folder.id],
    );
    const content = Buffer.from("第一版内容", "utf8");
    const versionId = await createVersion(db, {
      artifactId,
      version: 1,
      filename: "需求说明.md",
      mime: "text/markdown",
      content,
      sha256: createHash("sha256").update(content).digest("hex"),
      byteSize: content.length,
      note: "",
      createdBy: owner.id,
    });
    const replaced = Buffer.from("第二版内容", "utf8");
    await replaceVersionContent(db, {
      id: versionId,
      content: replaced,
      mime: "text/markdown",
      sha256: createHash("sha256").update(replaced).digest("hex"),
      byteSize: replaced.length,
      note: "替换正文",
      createdBy: owner.id,
    });
    const scanned = await scanProjectMemorySignals(db, project.id);
    assert.equal(scanned.inserted, 0, "文档变更不再扫描进项目进程");
    assert.equal((await queueRows(db, project.id)).length, 0);
    /* 即使有旧调用直接写信号，白名单也会忽略文档版本。 */
    const { noteProjectMemorySignal } = await import("../server/project-memory.js");
    await noteProjectMemorySignal(db, project.id, "document_version", versionId, "旧调用", {
      urgent: true,
    });
    assert.equal((await queueRows(db, project.id)).length, 0);
  } finally {
    await database.close();
  }
});

test("归档迭代只在主要迭代时生成信号", async () => {
  const { database, db, project, thread, owner } = await setup();
  try {
    await primeScan(db, project.id);
    await insertFormalTask(db, { projectId: project.id, userId: owner.id, threadId: thread.id });
    await query(
      db,
      "UPDATE threads SET status='archived',archived_at=UTC_TIMESTAMP(3) WHERE id=?",
      [thread.id],
    );
    const archiveId = randomUUID();
    await query(
      db,
      `INSERT INTO iteration_archive_workflows(id,thread_id,status,run_token,snapshot,plan,requested_by,finished_at)
       VALUES(?,?,'completed',?,?,?,?,UTC_TIMESTAMP(3))`,
      [
        archiveId,
        thread.id,
        randomUUID(),
        JSON.stringify({ conclusion: "这轮定了扫描方案" }),
        JSON.stringify({}),
        owner.id,
      ],
    );
    const scanned = await scanProjectMemorySignals(db, project.id);
    assert.equal(scanned.inserted, 2, "主要任务终态与归档各一条");
    const rows = await queueRows(db, project.id);
    const archive = rows.find((row) => row.sourceKind === "archive");
    assert.ok(archive, "归档信号已入队");
    assert.match(archive.hint, /归档迭代/);
    assert.equal(archive.sourceId, archiveId);
  } finally {
    await database.close();
  }
});
