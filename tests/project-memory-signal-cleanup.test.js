import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createVersion, setArtifactFolder } from "../server/documents/versions.js";
import { emptyLibraryRecycle, libraryChange } from "../server/documents/library.js";
import {
  dropUnavailableDocumentVersionSignals,
  processNextProjectMemory,
} from "../server/project-memory.js";

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
  const project = await service.createProject(owner, { name: "信号清理项目" });
  return { database, db, service, owner, project };
}

async function officialRootId(db, projectId) {
  const [root] = await query(
    db,
    "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
    [projectId],
  );
  return root.id;
}

async function createOfficialDoc(
  db,
  project,
  owner,
  { title = "方案", filename = "plan.txt" } = {},
) {
  const rootId = await officialRootId(db, project.id);
  const artifactId = randomUUID();
  const versionId = randomUUID();
  await query(
    db,
    "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
    [artifactId, project.id, title, owner.id, rootId],
  );
  await createVersion(db, {
    id: versionId,
    artifactId,
    version: 1,
    threadId: null,
    filename,
    mime: "text/plain",
    content: Buffer.from("正文"),
    sha256: "c".repeat(64),
    byteSize: 6,
    note: "",
    createdBy: owner.id,
  });
  return { artifactId, versionId, rootId };
}

async function documentSignals(db, projectId, versionId) {
  return query(
    db,
    "SELECT id,available_at availableAt,retry_count retryCount FROM agent_project_memory_queue WHERE project_id=? AND source_kind='document_version' AND source_id=?",
    [projectId, versionId],
  );
}

test("删除整份正式文档时清掉它的项目进程信号", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const { artifactId, versionId } = await createOfficialDoc(db, project, owner);
    assert.equal((await documentSignals(db, project.id, versionId)).length, 1);

    await libraryChange(service, owner, project.id, "artifact", artifactId, { deleted: true });

    assert.equal(
      (await documentSignals(db, project.id, versionId)).length,
      0,
      "来源已删除的信号不应继续排队，否则结算只会反复失败",
    );
  } finally {
    await database.close();
  }
});

test("从回收站恢复正式文档后重新排队文档信号", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const { artifactId, versionId } = await createOfficialDoc(db, project, owner);
    await libraryChange(service, owner, project.id, "artifact", artifactId, { deleted: true });
    assert.equal((await documentSignals(db, project.id, versionId)).length, 0);

    await libraryChange(service, owner, project.id, "artifact", artifactId, { deleted: false });

    const restored = await documentSignals(db, project.id, versionId);
    assert.equal(restored.length, 1, "恢复后的文档应重新进入项目记忆结算");
  } finally {
    await database.close();
  }
});

test("清空回收站时清掉被永久清除/删除版本的信号", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const { artifactId, versionId } = await createOfficialDoc(db, project, owner);
    await libraryChange(service, owner, project.id, "artifact", artifactId, { deleted: true });
    // 模拟历史数据：删除动作发生在清理逻辑上线之前，信号还留在队列里。
    await query(
      db,
      "INSERT INTO agent_project_memory_queue(id,project_id,source_kind,source_id,hint) VALUES(?,?,?,?,?)",
      [randomUUID(), project.id, "document_version", versionId, "历史遗留信号"],
    );

    await emptyLibraryRecycle(service, owner, project.id);

    assert.equal(
      (await documentSignals(db, project.id, versionId)).length,
      0,
      "永久清除后信号不可核验，应被清掉",
    );
    const [artifact] = await query(db, "SELECT purged_at purgedAt FROM artifacts WHERE id=?", [
      artifactId,
    ]);
    assert.ok(!artifact || artifact.purgedAt, "回收站文档应被永久清除或物理删除");
  } finally {
    await database.close();
  }
});

test("同名合并软删除文档时清掉它的项目进程信号", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const { artifactId, versionId } = await createOfficialDoc(db, project, owner);
    assert.equal((await documentSignals(db, project.id, versionId)).length, 1);

    await setArtifactFolder(db, artifactId, await officialRootId(db, project.id), {
      softDeleteOnConflict: true,
    });

    assert.equal((await documentSignals(db, project.id, versionId)).length, 0);
  } finally {
    await database.close();
  }
});

test("维护扫描清理已到远期排期的历史死信号", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const { artifactId, versionId } = await createOfficialDoc(db, project, owner);
    // 模拟上线前的历史状态：文档被直接删掉，信号没清，且已停止自动重试、推到 30 天后。
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [artifactId]);
    await query(
      db,
      "UPDATE agent_project_memory_queue SET available_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 DAY) WHERE project_id=? AND source_kind='document_version' AND source_id=?",
      [project.id, versionId],
    );

    const removed = await dropUnavailableDocumentVersionSignals(db, { projectId: project.id });

    assert.equal(removed, 1);
    assert.equal((await documentSignals(db, project.id, versionId)).length, 0);
  } finally {
    await database.close();
  }
});

test("结算只剩已删除来源的信号时收口为完成，不再报失败也不调模型", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const { artifactId, versionId } = await createOfficialDoc(db, project, owner);
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [artifactId]);
    // 项目创建等动作会留下其它有效信号；这里只保留待核验的文档信号，模拟「只剩死信号」。
    await query(
      db,
      "DELETE FROM agent_project_memory_queue WHERE project_id=? AND source_kind<>'document_version'",
      [project.id],
    );
    await query(
      db,
      "DELETE FROM agent_laoweng_runs WHERE project_id=? AND task='project_memory' AND status='queued'",
      [project.id],
    );
    await query(
      db,
      "INSERT INTO agent_laoweng_runs(id,project_id,task,trigger_source) VALUES(?,?,?,'schedule')",
      [randomUUID(), project.id, "project_memory"],
    );
    let modelCalls = 0;
    const worked = await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      summarizeMemory: async () => {
        modelCalls += 1;
        return { entries: [], summary: "" };
      },
      verifyMemorySupport: async () => ({ supported: true }),
    });

    assert.equal(worked, true);
    assert.equal(modelCalls, 0, "没有可用候选时不应调用模型");
    assert.equal(
      (await documentSignals(db, project.id, versionId)).length,
      0,
      "失效信号应在结算时被丢弃",
    );
    const [run] = await query(
      db,
      "SELECT status,agent_called agentCalled,error,result FROM agent_laoweng_runs WHERE project_id=? AND task='project_memory' ORDER BY created_at DESC LIMIT 1",
      [project.id],
    );
    assert.equal(run.status, "completed");
    assert.equal(Number(run.agentCalled), 0);
    assert.equal(run.error, null);
    const outcome = typeof run.result === "string" ? JSON.parse(run.result) : run.result;
    assert.match(String(outcome?.reason || ""), /已清理无效信号/);
  } finally {
    await database.close();
  }
});
