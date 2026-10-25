import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query, transaction } from "../server/db.js";
import { Service } from "../server/service.js";
import { recordArchivePages, getWikiPage, listWikiPages } from "../server/wiki-pages.js";

test("archive pages stay readable with sources and rewrite neither chat nor the long-term summary", async () => {
  const database = await testDatabase();
  try {
    const db = database.db;
    const service = new Service(db);
    const owner = { id: randomUUID(), kind: "session" };
    const viewer = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      viewer.id,
      viewer.id + "@test.com",
      "只读",
    ]);
    const project = await service.createProject(owner, { name: "知识页项目" });
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'viewer')", [
      project.id,
      viewer.id,
    ]);
    const thread = await service.createThread(owner, project.id, { title: "第一轮" });
    await service.postMessage(owner, thread.id, { body: "群里的原话" });
    const workflowId = randomUUID();
    const taskId = randomUUID();
    await transaction(db, async (conn) => {
      await recordArchivePages(conn, {
        projectId: project.id,
        threadTitle: thread.title,
        workflowId,
        userId: owner.id,
        conclusion: "这轮决定先做知识页",
        notes: "不要改群聊",
        taskDecisions: [{ taskId, disposition: "retain", reason: "留在原迭代" }],
      });
      await recordArchivePages(conn, {
        projectId: project.id,
        threadTitle: thread.title,
        workflowId,
        userId: owner.id,
        conclusion: "重复确认不应再写一页",
        notes: "",
        taskDecisions: [],
      });
    });
    const listed = await listWikiPages(service, owner, project.id, "知识页");
    assert.equal(listed.canWrite, true);
    assert.equal(listed.pages.length, 2);
    const retro = listed.pages.find((page) => page.kind === "retro");
    const decision = listed.pages.find((page) => page.kind === "decision");
    assert.ok(retro.body.includes("这轮决定先做知识页"));
    assert.ok(decision.body.includes("留在原迭代"));
    // 正文只由归档生成，没有手写入口；读侧仍能看到出处。
    const detail = await getWikiPage(service, owner, project.id, retro.id);
    assert.ok(detail.page.body.includes("这轮决定先做知识页"));
    assert.ok(
      detail.sources.some(
        (source) => source.sourceKind === "archive" && source.sourceId === workflowId,
      ),
    );
    assert.ok(
      detail.sources.some((source) => source.sourceKind === "task" && source.sourceId === taskId),
    );
    const [message] = await query(db, "SELECT body FROM messages WHERE thread_id=?", [thread.id]);
    assert.equal(message.body, "群里的原话");
    const summaries = await query(
      db,
      "SELECT summary FROM agent_project_summaries WHERE project_id=?",
      [project.id],
    );
    assert.equal(summaries.length, 0);
    const readonly = await listWikiPages(service, viewer, project.id);
    assert.equal(readonly.canWrite, false);
    assert.equal(readonly.pages.length, 2);
  } finally {
    await database.close();
  }
});
