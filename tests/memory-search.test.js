import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { searchProjectMemory } from "../server/memory-search.js";
import { createMemoryRelation } from "../server/memory-graph.js";
import { MCP_TOOL_NAMES } from "../shared/mcp-capabilities.js";
import { callMcpTool } from "../server/mcp.js";

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
  const project = await service.createProject(owner, { name: "记忆检索项目" });
  return { database, db, owner, project };
}

async function insertPage(
  db,
  projectId,
  userId,
  { subject = null, aboutUserId = null, kind = "status", title = "条目", body = "## 议题" } = {},
) {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO wiki_pages(id,project_id,subject_type,about_user_id,kind,title,body,status,created_by,updated_by) VALUES(?,?,?,?,?,?,?,'current',?,?)",
    [id, projectId, subject, aboutUserId, kind, title, body, userId, userId],
  );
  return id;
}

test("按对象类型和成员收窄", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const speaker = randomUUID();
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      speaker,
      speaker + "@test.com",
      "发言人",
    ]);
    await insertPage(db, project.id, owner.id, { subject: "discussion", title: "讨论一" });
    await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      aboutUserId: speaker,
      title: "发言一",
    });
    await insertPage(db, project.id, owner.id, { subject: "task", title: "任务一" });

    const speech = await searchProjectMemory(db, project.id, { subjects: ["utterance"] });
    assert.equal(speech.total, 1);
    assert.equal(speech.entries[0].subjectLabel, "发言记忆");
    assert.equal(speech.entries[0].aboutUserId, speaker);

    const byMember = await searchProjectMemory(db, project.id, { aboutUserId: speaker });
    assert.equal(byMember.total, 1);
    assert.equal(byMember.entries[0].title, "发言一");

    const discussion = await searchProjectMemory(db, project.id, { subjects: ["discussion"] });
    assert.equal(discussion.total, 1);
    assert.equal(discussion.entries[0].title, "讨论一");
  } finally {
    await database.close();
  }
});

test("关键词命中，返回出处并累计召回", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const pageId = await insertPage(db, project.id, owner.id, {
      subject: "project",
      title: "记忆检索约定",
      body: "## 是什么\n先做记忆检索，再做召回。",
    });
    const messageId = randomUUID();
    await query(
      db,
      "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,'message',?,'群聊消息')",
      [randomUUID(), pageId, messageId],
    );
    const found = await searchProjectMemory(db, project.id, { query: "记忆检索" });
    assert.equal(found.total, 1);
    assert.equal(found.entries[0].pageId, pageId);
    assert.equal(found.entries[0].sources[0].kind, "message");
    assert.equal(found.entries[0].sources[0].id, messageId);
    const [row] = await query(db, "SELECT recall_count recallCount FROM wiki_pages WHERE id=?", [
      pageId,
    ]);
    assert.equal(Number(row.recallCount), 1);
  } finally {
    await database.close();
  }
});

test("检索结果按关系展开一跳，depth=0 不展开", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const discussion = await insertPage(db, project.id, owner.id, {
      subject: "discussion",
      title: "讨论二",
    });
    const overall = await insertPage(db, project.id, owner.id, {
      subject: "project",
      title: "整体二",
    });
    await createMemoryRelation(db, {
      projectId: project.id,
      fromPageId: discussion,
      toPageId: overall,
      relation: "derives",
      createdBy: owner.id,
    });
    const oneHop = await searchProjectMemory(db, project.id, { subjects: ["discussion"] });
    assert.equal(oneHop.total, 1);
    assert.equal(oneHop.related.length, 1);
    assert.equal(oneHop.related[0].pageId, overall);
    assert.equal(oneHop.related[0].relation, "derives");

    const noHop = await searchProjectMemory(db, project.id, {
      subjects: ["discussion"],
      depth: 0,
    });
    assert.equal(noHop.related.length, 0);
  } finally {
    await database.close();
  }
});

test("检索能力已声明为只读 MCP 工具", () => {
  assert.ok(MCP_TOOL_NAMES.includes("search_memory"));
});

test("MCP 检索按项目权限控制", async () => {
  const { database, db, owner, project } = await setup();
  try {
    await insertPage(db, project.id, owner.id, { subject: "project", title: "整体三" });
    const outsider = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      outsider.id,
      outsider.id + "@test.com",
      "外部人",
    ]);
    const service = new Service(db);
    const result = await callMcpTool(service, owner, "search_memory", { projectId: project.id });
    assert.equal(result.total, 1);
    await assert.rejects(
      callMcpTool(service, outsider, "search_memory", { projectId: project.id }),
    );
  } finally {
    await database.close();
  }
});
