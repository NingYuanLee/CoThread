import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  createVersion as createVersionRaw,
  replaceVersionContent as replaceVersionContentRaw,
} from "../server/documents/versions.js";
import { searchProjectMemory } from "../server/memory-search.js";
import { getWikiPage, listWikiPages } from "../server/wiki-pages.js";
import { readProjectMemory } from "../server/memory-timeline.js";
import { loadProjectWikiIndexes, loadProjectMemoryEntryIndex } from "../server/project-memory.js";
import { libraryChange as libraryChangeRaw } from "../server/documents/library.js";
import {
  saveFileIndexGroup,
  dismissFileIndexGroup,
  discoverReferencedFileGroups,
  listFileIndexGroupsNeedingRepair,
} from "../server/file-index-groups.js";
import JSZip from "jszip";
import sharp from "sharp";
import {
  describeContent,
  documentKindOf,
  documentKindLabel,
  documentMemoryMarkdown,
  syncDocumentMemory,
} from "../server/document-memory.js";

// These tests exercise the settled result after the independent discovery lane.
async function discoverChanges(db) {
  const {
    discoverNextFileIndexChange,
    expandFileIndexProjectReconciliation,
    reconcileNextFileIndexArtifact,
  } = await import("../server/file-index-discovery.js");
  for (let count = 0; count < 1000; count++) {
    if (await discoverNextFileIndexChange(db)) continue;
    if (await expandFileIndexProjectReconciliation(db)) continue;
    if (await reconcileNextFileIndexArtifact(db)) continue;
    return;
  }
  throw new Error("文件发现未能排空");
}
async function createVersion(db, data) {
  const result = await createVersionRaw(db, data);
  await discoverChanges(db);
  return result;
}
async function replaceVersionContent(db, data) {
  const result = await replaceVersionContentRaw(db, data);
  await discoverChanges(db);
  return result;
}
async function libraryChange(service, ...args) {
  const result = await libraryChangeRaw(service, ...args);
  await discoverChanges(service.db);
  return result;
}

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
  const project = await service.createProject(owner, { name: "文档记忆项目" });
  return { database, db, owner, project };
}

async function seedOfficialArtifact(
  db,
  projectId,
  userId,
  { folderName = "正式文件", title = "代码包" } = {},
) {
  const folderId = randomUUID();
  await query(
    db,
    "INSERT INTO document_folders(id,project_id,name,folder_kind) VALUES(?,?,?,'project_official')",
    [folderId, projectId, folderName],
  );
  const artifactId = randomUUID();
  await query(
    db,
    "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
    [artifactId, projectId, title, userId, folderId],
  );
  return { folderId, artifactId };
}

async function insertThread(db, projectId, userId) {
  const id = randomUUID();
  await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
    id,
    projectId,
    "文档迭代",
    userId,
  ]);
  return id;
}

test("文档种类与正文骨架", () => {
  assert.equal(documentKindOf("application/zip", "code.zip"), "archive");
  assert.equal(documentKindOf("image/png", "shot.png"), "image");
  assert.equal(documentKindOf("text/x-typescript", "index.ts"), "code");
  assert.equal(documentKindOf("text/markdown", "readme.md"), "text");
  assert.equal(documentKindOf("application/octet-stream", "blob.bin"), "other");
  assert.equal(documentKindLabel("archive"), "压缩包");
  const body = documentMemoryMarkdown({
    title: "代码包",
    kind: "archive",
    filename: "code.zip",
    version: 2,
    sha256: "abcdef123456",
    byteSize: 2048,
    note: "首次交付",
  });
  assert.match(body, /压缩包文件《code\.zip》/);
  assert.match(body, /## 关键版本/);
  assert.match(body, /v2 · sha256 abcdef123456/);
  assert.match(body, /首次交付/);
  assert.match(body, /先看清单与入口文件/);
});

test("正式文件子目录中的新版本也触发里程碑判断", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const [root] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
      [project.id],
    );
    const folderId = randomUUID(),
      artifactId = randomUUID(),
      versionId = randomUUID();
    await query(
      db,
      "INSERT INTO document_folders(id,project_id,parent_id,name) VALUES(?,?,?,'子目录')",
      [folderId, project.id, root.id],
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
      threadId: null,
      filename: "plan.txt",
      mime: "text/plain",
      content: Buffer.from("方案"),
      sha256: "b".repeat(64),
      byteSize: 6,
      note: "",
      createdBy: owner.id,
    });
    const [signal] = await query(
      db,
      "SELECT source_id sourceId FROM agent_project_memory_queue WHERE project_id=? AND source_kind='document_version' AND source_id=?",
      [project.id, versionId],
    );
    assert.equal(signal?.sourceId, versionId);
  } finally {
    await database.close();
  }
});

test("扫描正式文件后写单文件基础索引，不因同目录而创建关联组", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const { artifactId, folderId } = await seedOfficialArtifact(db, project.id, owner.id);
    const thread = await insertThread(db, project.id, owner.id);
    const versionId = randomUUID();
    await createVersion(db, {
      id: versionId,
      artifactId,
      version: 1,
      threadId: thread,
      filename: "code.zip",
      mime: "application/zip",
      content: Buffer.from("PK"),
      sha256: "a".repeat(64),
      byteSize: 2048,
      note: "压缩包交付",
      createdBy: owner.id,
    });
    const [doc] = await query(
      db,
      "SELECT id,title,body,subject_type subjectType FROM wiki_pages WHERE project_id=? AND subject_type='document' AND title=?",
      [project.id, "代码包"],
    );
    assert.ok(doc, "应写单文档记忆");
    assert.match(doc.body, /压缩包/);
    const sources = await query(
      db,
      "SELECT source_id sourceId FROM wiki_page_sources WHERE page_id=?",
      [doc.id],
    );
    assert.equal(sources.length, 1);
    assert.equal(sources[0].sourceId, versionId);
    const [group] = await query(
      db,
      "SELECT id,title,body FROM wiki_pages WHERE project_id=? AND subject_type='document' AND title LIKE '文档组：%'",
      [project.id],
    );
    assert.equal(group, undefined, "同目录不足以证明文件有关联");
    assert.ok(folderId);
    const again = await syncDocumentMemory(db, {
      projectId: project.id,
      artifactId,
      versionId,
      createdBy: owner.id,
    });
    assert.equal(again.pageId, doc.id, "同一文档不重复建条");
    const pages = await query(
      db,
      "SELECT id FROM wiki_pages WHERE project_id=? AND subject_type='document' AND title=?",
      [project.id, "代码包"],
    );
    assert.equal(pages.length, 1);
  } finally {
    await database.close();
  }
});

test("同名文件按身份分别索引，改名后继续更新原索引", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const first = await seedOfficialArtifact(db, project.id, owner.id, { title: "同名" });
    const second = await seedOfficialArtifact(db, project.id, owner.id, { title: "同名" });
    const ids = [randomUUID(), randomUUID()];
    for (const [index, artifact] of [first, second].entries()) {
      await createVersion(db, {
        id: ids[index],
        artifactId: artifact.artifactId,
        version: 1,
        filename: `file${index}.txt`,
        mime: "text/plain",
        content: Buffer.from("内容"),
        sha256: String(index).repeat(64),
        byteSize: 6,
        note: `说明${index}`,
        createdBy: owner.id,
      });
    }
    const pages = await query(
      db,
      "SELECT id,body FROM wiki_pages WHERE project_id=? AND title='同名' AND subject_type='document'",
      [project.id],
    );
    assert.equal(pages.length, 2);
    assert.ok(pages.some((page) => page.body.includes("说明0")));
    assert.ok(pages.some((page) => page.body.includes("说明1")));
    await query(db, "UPDATE artifacts SET title='改名后' WHERE id=?", [first.artifactId]);
    await syncDocumentMemory(db, {
      projectId: project.id,
      artifactId: first.artifactId,
      versionId: ids[0],
      createdBy: owner.id,
    });
    const renamed = await query(
      db,
      "SELECT id FROM wiki_pages WHERE project_id=? AND title='改名后'",
      [project.id],
    );
    assert.equal(renamed.length, 1);
    assert.ok(pages.some((page) => page.id === renamed[0].id));
    const latest = randomUUID();
    await createVersion(db, {
      id: latest,
      artifactId: first.artifactId,
      version: 2,
      filename: "new.txt",
      mime: "text/plain",
      content: Buffer.from("新版"),
      sha256: "f".repeat(64),
      byteSize: 6,
      note: "新版说明",
      createdBy: owner.id,
    });
    assert.equal(
      await syncDocumentMemory(db, {
        projectId: project.id,
        artifactId: first.artifactId,
        versionId: ids[0],
        createdBy: owner.id,
      }),
      null,
      "旧版本不能覆盖现行索引",
    );
    assert.equal(
      await syncDocumentMemory(db, {
        projectId: project.id,
        artifactId: first.artifactId,
        versionId: ids[1],
        createdBy: owner.id,
      }),
      null,
      "不能引用另一个文件的版本",
    );
    const [current] = await query(
      db,
      "SELECT p.id,p.body FROM file_index_entries fi JOIN wiki_pages p ON p.id=fi.page_id WHERE fi.project_id=? AND fi.artifact_id=?",
      [project.id, first.artifactId],
    );
    assert.notEqual(current.id, renamed[0].id, "内容新版本形成新的索引身份");
    assert.equal(
      (await query(db, "SELECT status FROM wiki_pages WHERE id=?", [renamed[0].id]))[0].status,
      "superseded",
    );
    assert.match(current.body, /新版说明/);
  } finally {
    await database.close();
  }
});

test("四类文档区域的新文件建立基础索引并进入内容处理队列", async () => {
  const { database, db, owner, project } = await setup();
  try {
    for (const kind of [
      "project_official",
      "project_cache",
      "project_outputs",
      "project_miniprogram",
    ]) {
      const folderId = randomUUID();
      const artifactId = randomUUID();
      const versionId = randomUUID();
      await query(
        db,
        "INSERT INTO document_folders(id,project_id,name,folder_kind) VALUES(?,?,?,?)",
        [folderId, project.id, kind, kind],
      );
      await query(
        db,
        "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
        [artifactId, project.id, kind, owner.id, folderId],
      );
      await createVersion(db, {
        id: versionId,
        artifactId,
        version: 1,
        filename: `${kind}.bin`,
        mime: "application/octet-stream",
        content: Buffer.from("data"),
        sha256: "a".repeat(64),
        byteSize: 4,
        note: "",
        createdBy: owner.id,
      });
      const [page] = await query(
        db,
        `SELECT p.body FROM wiki_pages p JOIN wiki_page_sources s ON s.page_id=p.id
        WHERE p.project_id=? AND s.source_kind='document_version' AND s.source_id=?`,
        [project.id, versionId],
      );
      assert.match(page.body, /未识别/);
      const [pending] = await query(
        db,
        "SELECT version_id FROM agent_document_memory_queue WHERE version_id=?",
        [versionId],
      );
      assert.ok(pending, `${kind} 应等待内容处理`);
    }
  } finally {
    await database.close();
  }
});

test("根索引按主题动态列出可访问文件，回收后不留下旧标题", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const { artifactId, folderId } = await seedOfficialArtifact(db, project.id, owner.id, {
      title: "注册流程设计",
    });
    const versionId = randomUUID();
    await createVersion(db, {
      id: versionId,
      artifactId,
      version: 1,
      filename: "design.png",
      mime: "image/png",
      content: Buffer.from("image"),
      sha256: "a".repeat(64),
      byteSize: 5,
      note: "",
      createdBy: owner.id,
    });
    await query(db, "UPDATE file_index_entries SET topics=? WHERE artifact_id=?", [
      JSON.stringify(["用户注册", "隐私合规专项"]),
      artifactId,
    ]);
    const roots = await query(
      db,
      "SELECT page_id pageId,root_kind rootKind FROM file_index_roots WHERE project_id=?",
      [project.id],
    );
    assert.equal(roots.length, 4);
    const rootId = roots.find((r) => r.rootKind === "project_official").pageId;
    const service = new Service(db);
    const [fileEntry] = await query(
      db,
      "SELECT page_id pageId FROM file_index_entries WHERE artifact_id=?",
      [artifactId],
    );
    assert.match(
      (await getWikiPage(service, owner, project.id, fileEntry.pageId)).page.body,
      /位置：正式文件/,
    );
    await query(db, "UPDATE document_folders SET name=? WHERE id=?", ["新资料目录", folderId]);
    assert.match(
      (await getWikiPage(service, owner, project.id, fileEntry.pageId)).page.body,
      /位置：新资料目录/,
    );
    const byRenamedFolder = await searchProjectMemory(db, project.id, {
      query: "新资料目录",
      depth: 0,
    });
    assert.ok(byRenamedFolder.entries.some((entry) => entry.pageId === fileEntry.pageId));
    let page = (await getWikiPage(service, owner, project.id, rootId)).page;
    assert.match(page.body, /### 用户注册/);
    assert.match(page.body, /注册流程设计/);
    const byTopic = await searchProjectMemory(db, project.id, { query: "隐私合规专项", depth: 0 });
    assert.ok(byTopic.entries.some((entry) => entry.title === "注册流程设计"));
    const byRoot = await searchProjectMemory(db, project.id, { query: "正式文件索引", depth: 0 });
    assert.ok(
      byRoot.entries.some(
        (entry) => entry.pageId === rootId && entry.navigation.includes("注册流程设计"),
      ),
    );
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [artifactId]);
    page = (await getWikiPage(service, owner, project.id, rootId)).page;
    assert.doesNotMatch(page.body, /注册流程设计/);
    assert.match(page.body, /没有可访问/);
  } finally {
    await database.close();
  }
});

test("明确的另存关系形成关联索引，人工修正不被自动发现覆盖", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const source = await seedOfficialArtifact(db, project.id, owner.id, { title: "来源" });
    const copied = await seedOfficialArtifact(db, project.id, owner.id, { title: "正式副本" });
    await query(db, "UPDATE artifacts SET source_artifact_id=? WHERE id=?", [
      source.artifactId,
      copied.artifactId,
    ]);
    for (const artifact of [source, copied])
      await createVersion(db, {
        id: randomUUID(),
        artifactId: artifact.artifactId,
        version: 1,
        filename: "test.txt",
        mime: "text/plain",
        content: Buffer.from("text"),
        sha256: "a".repeat(64),
        byteSize: 4,
        note: "",
        createdBy: owner.id,
      });
    const [group] = await query(
      db,
      "SELECT id,page_id pageId,origin FROM file_index_groups WHERE project_id=?",
      [project.id],
    );
    assert.equal(group.origin, "automatic");
    const [milestoneSignal] = await query(
      db,
      "SELECT source_id sourceId FROM agent_project_memory_queue WHERE project_id=? AND source_kind='memory_page' AND source_id=?",
      [project.id, group.pageId],
    );
    assert.equal(milestoneSignal?.sourceId, group.pageId);
    const service = new Service(db);
    let page = (await getWikiPage(service, owner, project.id, group.pageId)).page;
    assert.match(page.body, /来源文件/);
    assert.match(page.body, /正式副本/);
    const memory = await readProjectMemory(service, owner, project.id);
    assert.equal(memory.entries.find((entry) => entry.id === group.pageId).fileGroup.id, group.id);
    assert.equal(
      memory.entries.find((entry) => entry.id === group.pageId).fileGroup.members.length,
      2,
    );
    assert.ok(memory.entries.some((entry) => entry.fileArtifactId === source.artifactId));
    await saveFileIndexGroup(db, {
      projectId: project.id,
      createdBy: owner.id,
      groupId: group.id,
      title: "人工修正",
      evidence: "确认这是同一交付的来源与正式副本。",
      members: [
        { artifactId: source.artifactId, description: "原始材料" },
        { artifactId: copied.artifactId, description: "正式稿" },
      ],
    });
    const [version] = await query(db, "SELECT id FROM versions WHERE artifact_id=?", [
      copied.artifactId,
    ]);
    await syncDocumentMemory(db, {
      projectId: project.id,
      artifactId: copied.artifactId,
      versionId: version.id,
      createdBy: owner.id,
    });
    page = (await getWikiPage(service, owner, project.id, group.pageId)).page;
    assert.equal(page.title, "人工修正");
    assert.match(page.body, /正式稿/);
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [
      source.artifactId,
    ]);
    await assert.rejects(getWikiPage(service, owner, project.id, group.pageId), /不存在/);
    const repairs = await listFileIndexGroupsNeedingRepair(db, project.id);
    assert.equal(repairs.length, 1);
    assert.equal(repairs[0].fileGroup.evidence, "");
    assert.deepEqual(
      repairs[0].fileGroup.members.map((item) => item.artifactId),
      [copied.artifactId],
    );
    await query(db, "UPDATE artifacts SET deleted_at=NULL WHERE id=?", [source.artifactId]);
    assert.equal((await listFileIndexGroupsNeedingRepair(db, project.id)).length, 0);
    await dismissFileIndexGroup(db, { projectId: project.id, groupId: group.id, userId: owner.id });
    await syncDocumentMemory(db, {
      projectId: project.id,
      artifactId: copied.artifactId,
      versionId: version.id,
      createdBy: owner.id,
    });
    const [after] = await query(db, "SELECT status FROM wiki_pages WHERE id=?", [group.pageId]);
    assert.equal(after.status, "current", "人工移除关联展示不作废文件记忆");
    await assert.rejects(getWikiPage(service, owner, project.id, group.pageId), /不存在/);
  } finally {
    await database.close();
  }
});

test("正文明确引用文件时建立可追溯组合，目标版本变化后重新核对", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const source = await seedOfficialArtifact(db, project.id, owner.id, { title: "设计说明" });
    const target = await seedOfficialArtifact(db, project.id, owner.id, { title: "验收规范" });
    const sourceVersion = randomUUID();
    for (const [artifactId, versionId, filename] of [
      [source.artifactId, sourceVersion, "design.txt"],
      [target.artifactId, randomUUID(), "acceptance-plan.txt"],
    ]) {
      const content = Buffer.from(
        artifactId === source.artifactId ? "验收条件详见 acceptance-plan.txt。" : "内容",
      );
      await createVersion(db, {
        id: versionId,
        artifactId,
        version: 1,
        filename,
        mime: "text/plain",
        content,
        sha256: "a".repeat(64),
        byteSize: content.length,
        note: "",
        createdBy: owner.id,
      });
    }
    const input = {
      projectId: project.id,
      artifactId: source.artifactId,
      versionId: sourceVersion,
      createdBy: owner.id,
      content: "验收条件详见 acceptance-plan.txt。",
    };
    await discoverReferencedFileGroups(db, input);
    const [group] = await query(
      db,
      "SELECT id,page_id pageId,evidence_kind evidenceKind FROM file_index_groups WHERE project_id=?",
      [project.id],
    );
    assert.equal(group.evidenceKind, "reference");
    const service = new Service(db);
    assert.match(
      (await getWikiPage(service, owner, project.id, group.pageId)).page.body,
      /acceptance-plan\.txt/,
    );
    const duplicate = await seedOfficialArtifact(db, project.id, owner.id, {
      title: "另一份验收资料",
    });
    await createVersion(db, {
      id: randomUUID(),
      artifactId: duplicate.artifactId,
      version: 1,
      filename: "acceptance-plan.txt",
      mime: "text/plain",
      content: Buffer.from("资料"),
      sha256: "d".repeat(64),
      byteSize: 6,
      note: "",
      createdBy: owner.id,
    });
    await assert.rejects(getWikiPage(service, owner, project.id, group.pageId), /不存在/);
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [
      duplicate.artifactId,
    ]);
    assert.equal(
      (await getWikiPage(service, owner, project.id, group.pageId)).page.id,
      group.pageId,
    );
    await createVersion(db, {
      id: randomUUID(),
      artifactId: target.artifactId,
      version: 2,
      filename: "acceptance-plan.txt",
      mime: "text/plain",
      content: Buffer.from("新版"),
      sha256: "b".repeat(64),
      byteSize: 6,
      note: "",
      createdBy: owner.id,
    });
    assert.equal(
      (await getWikiPage(service, owner, project.id, group.pageId)).page.id,
      group.pageId,
    );
    await createVersion(db, {
      id: randomUUID(),
      artifactId: target.artifactId,
      version: 3,
      filename: "new-acceptance.txt",
      mime: "text/plain",
      content: Buffer.from("第三版"),
      sha256: "c".repeat(64),
      byteSize: 9,
      note: "",
      createdBy: owner.id,
    });
    await assert.rejects(getWikiPage(service, owner, project.id, group.pageId), /不存在/);
  } finally {
    await database.close();
  }
});

test("引用方先处理、目标文件后上传时仍能发现关联", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const source = await seedOfficialArtifact(db, project.id, owner.id, { title: "设计说明" });
    const sourceVersion = randomUUID();
    const text = "交互流程详见layout-diagram.png。";
    const bytes = Buffer.from(text);
    await createVersion(db, {
      id: sourceVersion,
      artifactId: source.artifactId,
      version: 1,
      filename: "design-notes.txt",
      mime: "text/plain",
      content: bytes,
      sha256: "a".repeat(64),
      byteSize: bytes.length,
      note: "",
      createdBy: owner.id,
    });
    await discoverReferencedFileGroups(db, {
      projectId: project.id,
      artifactId: source.artifactId,
      versionId: sourceVersion,
      createdBy: owner.id,
      content: text,
    });
    assert.equal(
      Number(
        (
          await query(db, "SELECT COUNT(*) count FROM file_index_groups WHERE project_id=?", [
            project.id,
          ])
        )[0].count,
      ),
      0,
    );
    const target = await seedOfficialArtifact(db, project.id, owner.id, { title: "交互图" });
    await createVersion(db, {
      id: randomUUID(),
      artifactId: target.artifactId,
      version: 1,
      filename: "layout-diagram.png",
      mime: "image/png",
      content: Buffer.from("image"),
      sha256: "b".repeat(64),
      byteSize: 5,
      note: "",
      createdBy: owner.id,
    });
    const groups = await query(
      db,
      "SELECT id,evidence_kind evidenceKind FROM file_index_groups WHERE project_id=?",
      [project.id],
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0].evidenceKind, "reference");
  } finally {
    await database.close();
  }
});

test("引用方在同一版本上替换内容后，旧关联依据不能继续使用", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const source = await seedOfficialArtifact(db, project.id, owner.id, { title: "说明" });
    const target = await seedOfficialArtifact(db, project.id, owner.id, { title: "设计图" });
    const sourceVersion = randomUUID();
    const original = Buffer.from("参见 component-map.png。");
    for (const [artifactId, versionId, filename, bytes] of [
      [source.artifactId, sourceVersion, "notes.txt", original],
      [target.artifactId, randomUUID(), "component-map.png", Buffer.from("image")],
    ])
      await createVersion(db, {
        id: versionId,
        artifactId,
        version: 1,
        filename,
        mime: "text/plain",
        content: bytes,
        sha256: "a".repeat(64),
        byteSize: bytes.length,
        note: "",
        createdBy: owner.id,
      });
    await discoverReferencedFileGroups(db, {
      projectId: project.id,
      artifactId: source.artifactId,
      versionId: sourceVersion,
      createdBy: owner.id,
      content: original.toString(),
    });
    const [group] = await query(
      db,
      "SELECT page_id pageId FROM file_index_groups WHERE project_id=?",
      [project.id],
    );
    const service = new Service(db);
    assert.ok(await getWikiPage(service, owner, project.id, group.pageId));
    const replacement = Buffer.from("已移除原有引用。");
    await replaceVersionContent(db, {
      id: sourceVersion,
      content: replacement,
      mime: "text/plain",
      sha256: "b".repeat(64),
      byteSize: replacement.length,
      note: "修订",
      createdBy: owner.id,
    });
    await assert.rejects(getWikiPage(service, owner, project.id, group.pageId), /不存在/);
    assert.equal(
      (
        await query(db, "SELECT * FROM file_index_reference_mentions WHERE source_version_id=?", [
          sourceVersion,
        ])
      ).length,
      0,
    );
  } finally {
    await database.close();
  }
});

test("回收或清除文件后不可通过搜索和页面读取索引，恢复后重新可见", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const { artifactId } = await seedOfficialArtifact(db, project.id, owner.id, {
      title: "生命周期索引",
    });
    const versionId = randomUUID();
    await createVersion(db, {
      id: versionId,
      artifactId,
      version: 1,
      filename: "lifecycle.txt",
      mime: "text/plain",
      content: Buffer.from("内容"),
      sha256: "a".repeat(64),
      byteSize: 6,
      note: "",
      createdBy: owner.id,
    });
    const [index] = await query(
      db,
      "SELECT page_id pageId FROM file_index_entries WHERE artifact_id=?",
      [artifactId],
    );
    const service = new Service(db);
    const visible = async () =>
      (await searchProjectMemory(db, project.id, { depth: 0 })).entries.some(
        (e) => e.pageId === index.pageId,
      );
    assert.equal(await visible(), true);
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [artifactId]);
    assert.equal(await visible(), false);
    assert.equal(
      (await listWikiPages(service, owner, project.id)).pages.some((p) => p.id === index.pageId),
      false,
    );
    await assert.rejects(getWikiPage(service, owner, project.id, index.pageId), /不存在/);
    await query(db, "UPDATE artifacts SET deleted_at=NULL WHERE id=?", [artifactId]);
    assert.equal(await visible(), true);
    await query(db, "INSERT INTO version_recycle(version_id) VALUES(?)", [versionId]);
    assert.equal(await visible(), false);
    await query(db, "DELETE FROM version_recycle WHERE version_id=?", [versionId]);
    assert.equal(await visible(), true);
    await query(db, "UPDATE artifacts SET purged_at=UTC_TIMESTAMP(3) WHERE id=?", [artifactId]);
    assert.equal(await visible(), false);
  } finally {
    await database.close();
  }
});

test("协调器不读取回收文件摘要，也不会将同名文件的摘要串用", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const first = await seedOfficialArtifact(db, project.id, owner.id, { title: "同名资料" });
    const second = await seedOfficialArtifact(db, project.id, owner.id, { title: "同名资料" });
    const versions = [randomUUID(), randomUUID()];
    for (const [index, artifact] of [first, second].entries()) {
      await createVersion(db, {
        id: versions[index],
        artifactId: artifact.artifactId,
        version: 1,
        filename: `same${index}.txt`,
        mime: "text/plain",
        content: Buffer.from("文本"),
        sha256: "a".repeat(64),
        byteSize: 6,
        note: "",
        createdBy: owner.id,
      });
    }
    await query(db, "INSERT INTO agent_document_summaries(version_id,summary) VALUES(?,?)", [
      versions[0],
      "仅属于第一份资料",
    ]);
    await syncDocumentMemory(db, {
      projectId: project.id,
      artifactId: first.artifactId,
      versionId: versions[0],
      createdBy: owner.id,
    });
    let context = await loadProjectWikiIndexes(db, project.id);
    assert.ok(
      context.documentSummaries.some(
        (item) => item.versionId === versions[0] && item.summary.includes("仅属于第一份资料"),
      ),
    );
    assert.ok(
      !context.documentSummaries.some(
        (item) => item.versionId === versions[1] && item.summary.includes("仅属于第一份资料"),
      ),
    );
    const [page] = await query(
      db,
      "SELECT page_id pageId FROM file_index_entries WHERE artifact_id=?",
      [first.artifactId],
    );
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [
      first.artifactId,
    ]);
    context = await loadProjectWikiIndexes(db, project.id);
    assert.ok(!context.documentSummaries.some((item) => item.versionId === versions[0]));
    assert.ok(!context.pendingDocumentVersionIds.includes(versions[0]));
    assert.ok(
      !(await loadProjectMemoryEntryIndex(db, project.id)).some((item) => item.id === page.pageId),
    );
  } finally {
    await database.close();
  }
});

test("同一文件并发补建索引只创建一条页面和出处", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const artifactId = randomUUID();
    const versionId = randomUUID();
    await query(db, "INSERT INTO artifacts(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      artifactId,
      project.id,
      "并发",
      owner.id,
    ]);
    await createVersion(db, {
      id: versionId,
      artifactId,
      version: 1,
      filename: "test.txt",
      mime: "text/plain",
      content: Buffer.from("text"),
      sha256: "a".repeat(64),
      byteSize: 4,
      note: "",
      createdBy: owner.id,
    });
    const result = await Promise.all(
      Array.from({ length: 4 }, () =>
        syncDocumentMemory(db, {
          projectId: project.id,
          artifactId,
          versionId,
          createdBy: owner.id,
        }),
      ),
    );
    assert.equal(new Set(result.map((row) => row.pageId)).size, 1);
    const [count] = await query(
      db,
      "SELECT COUNT(*) count FROM wiki_page_sources WHERE source_kind='document_version' AND source_id=?",
      [versionId],
    );
    assert.equal(Number(count.count), 1);
  } finally {
    await database.close();
  }
});

test("回收和恢复当前版本时索引切换到实际可用版本", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const folderId = randomUUID(),
      artifactId = randomUUID(),
      first = randomUUID(),
      second = randomUUID();
    await query(
      db,
      "INSERT INTO document_folders(id,project_id,name,folder_kind) VALUES(?,?,?,'project_outputs')",
      [folderId, project.id, "产物"],
    );
    await query(
      db,
      "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
      [artifactId, project.id, "可回收版本", owner.id, folderId],
    );
    for (const [version, versionId] of [
      [1, first],
      [2, second],
    ]) {
      await createVersion(db, {
        id: versionId,
        artifactId,
        version,
        filename: `v${version}.txt`,
        mime: "text/plain",
        content: Buffer.from("text"),
        sha256: "a".repeat(64),
        byteSize: 4,
        note: `版本${version}`,
        createdBy: owner.id,
      });
    }
    const service = new Service(db);
    const current = async () =>
      (
        await query(
          db,
          "SELECT indexed_version_id versionId FROM file_index_entries WHERE artifact_id=?",
          [artifactId],
        )
      )[0].versionId;
    assert.equal(await current(), second);
    await libraryChange(service, owner, project.id, "version", second, { deleted: true });
    assert.equal(await current(), first);
    const [page] = await query(
      db,
      "SELECT p.body FROM file_index_entries fi JOIN wiki_pages p ON p.id=fi.page_id WHERE fi.artifact_id=?",
      [artifactId],
    );
    assert.match(page.body, /版本1/);
    await libraryChange(service, owner, project.id, "version", second, { deleted: false });
    assert.equal(await current(), second);
  } finally {
    await database.close();
  }
});

test("压缩包与图片直接生成清单，不用等模型", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const thread = await insertThread(db, project.id, owner.id);
    const zip = new JSZip();
    zip.file("src/index.ts", "export const a = 1;");
    zip.file("package.json", "{}");
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const listed = await describeContent({
      mime: "application/zip",
      filename: "code.zip",
      content: zipBuffer,
    });
    assert.equal(listed.type, "zip");
    assert.equal(listed.count, 2);
    assert.ok(listed.top.includes("src"));
    assert.ok(listed.top.includes("package.json"));

    const archive = await seedOfficialArtifact(db, project.id, owner.id, { title: "代码包" });
    await createVersion(db, {
      id: randomUUID(),
      artifactId: archive.artifactId,
      version: 1,
      threadId: thread,
      filename: "code.zip",
      mime: "application/zip",
      content: zipBuffer,
      sha256: "b".repeat(64),
      byteSize: zipBuffer.length,
      note: "代码压缩包",
      createdBy: owner.id,
    });
    const [archivePage] = await query(
      db,
      "SELECT body FROM wiki_pages WHERE project_id=? AND title='代码包' AND subject_type='document'",
      [project.id],
    );
    assert.match(archivePage.body, /## 清单/);
    assert.match(archivePage.body, /共 2 个文件/);
    assert.match(archivePage.body, /package\.json/);

    const image = await seedOfficialArtifact(db, project.id, owner.id, { title: "界面截图" });
    const imageBuffer = await sharp({
      create: { width: 4, height: 3, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    await createVersion(db, {
      id: randomUUID(),
      artifactId: image.artifactId,
      version: 1,
      threadId: thread,
      filename: "shot.png",
      mime: "image/png",
      content: imageBuffer,
      sha256: "c".repeat(64),
      byteSize: imageBuffer.length,
      note: "界面截图",
      createdBy: owner.id,
    });
    const [imagePage] = await query(
      db,
      "SELECT body FROM wiki_pages WHERE project_id=? AND title='界面截图' AND subject_type='document'",
      [project.id],
    );
    assert.match(imagePage.body, /尺寸：4×3/);
  } finally {
    await database.close();
  }
});
