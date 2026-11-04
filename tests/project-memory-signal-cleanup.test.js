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
  noteProjectMemorySignal,
} from "../server/project-memory.js";
import { scanProjectMemorySignals } from "../server/project-memory-scan.js";

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

/** 模拟上线前的历史遗留：文档版本信号行已经存在队列里。 */
async function insertLegacySignal(db, projectId, versionId) {
  await query(
    db,
    "INSERT INTO agent_project_memory_queue(id,project_id,source_kind,source_id,hint) VALUES(?,?,?,?,?)",
    [randomUUID(), projectId, "document_version", versionId, "历史遗留信号"],
  );
}

async function documentSignals(db, projectId, versionId) {
  return query(
    db,
    "SELECT id,available_at availableAt,retry_count retryCount FROM agent_project_memory_queue WHERE project_id=? AND source_kind='document_version' AND source_id=?",
    [projectId, versionId],
  );
}

test("删除整份正式文档时清掉历史遗留的文档信号", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const { artifactId, versionId } = await createOfficialDoc(db, project, owner);
    await insertLegacySignal(db, project.id, versionId);
    assert.equal((await documentSignals(db, project.id, versionId)).length, 1);

    await libraryChange(service, owner, project.id, "artifact", artifactId, { deleted: true });

    assert.equal((await documentSignals(db, project.id, versionId)).length, 0);
  } finally {
    await database.close();
  }
});

test("同名合并软删除与清空回收站时清掉历史遗留信号", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const merged = await createOfficialDoc(db, project, owner, {
      title: "同名",
      filename: "a.txt",
    });
    await insertLegacySignal(db, project.id, merged.versionId);
    await setArtifactFolder(db, merged.artifactId, await officialRootId(db, project.id), {
      softDeleteOnConflict: true,
    });
    assert.equal((await documentSignals(db, project.id, merged.versionId)).length, 0);

    const purged = await createOfficialDoc(db, project, owner, {
      title: "待清空",
      filename: "b.txt",
    });
    await libraryChange(service, owner, project.id, "artifact", purged.artifactId, {
      deleted: true,
    });
    await insertLegacySignal(db, project.id, purged.versionId);
    await emptyLibraryRecycle(service, owner, project.id);
    assert.equal((await documentSignals(db, project.id, purged.versionId)).length, 0);
  } finally {
    await database.close();
  }
});

test("维护扫描清理已推到远期的历史死信号", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const { artifactId, versionId } = await createOfficialDoc(db, project, owner);
    await insertLegacySignal(db, project.id, versionId);
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

test("文档新版本与恢复不再生成项目进程信号", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const { artifactId, versionId } = await createOfficialDoc(db, project, owner);
    await scanProjectMemorySignals(db, project.id);
    assert.equal((await documentSignals(db, project.id, versionId)).length, 0, "新版本不入队");

    await libraryChange(service, owner, project.id, "artifact", artifactId, { deleted: true });
    await libraryChange(service, owner, project.id, "artifact", artifactId, { deleted: false });
    await scanProjectMemorySignals(db, project.id);
    assert.equal((await documentSignals(db, project.id, versionId)).length, 0, "恢复也不入队");

    await noteProjectMemorySignal(db, project.id, "document_version", versionId, "旧调用", {
      urgent: true,
    });
    assert.equal(
      (await documentSignals(db, project.id, versionId)).length,
      0,
      "文档版本已不在项目进程白名单里",
    );
  } finally {
    await database.close();
  }
});
