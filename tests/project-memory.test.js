import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query, transaction } from "../server/db.js";
import { Service } from "../server/service.js";
import { createApp } from "../server/app.js";
import { issueCredential } from "../server/auth.js";
import { noteProjectMemorySignal, processNextProjectMemory } from "../server/project-memory.js";
import {
  confirmMemoryEntry,
  flagMemoryEntry,
  listIterationMemoryDrafts,
  readProjectMemory,
  readProjectMemoryCounts,
  settleIterationMemory,
} from "../server/memory-timeline.js";
import { readArchiveWorkflow } from "../server/iteration-archive.js";

async function setup() {
  const database = await testDatabase();
  const db = database.db;
  const service = new Service(db);
  const owner = { id: randomUUID(), kind: "session" };
  const viewer = { id: randomUUID(), kind: "session" };
  for (const user of [owner, viewer])
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      user.id + "@test.com",
      user === owner ? "负责人" : "只读",
    ]);
  const project = await service.createProject(owner, { name: "记忆项目" });
  await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'viewer')", [
    project.id,
    viewer.id,
  ]);
  const thread = await service.createThread(owner, project.id, { title: "第一轮" });
  return { database, db, service, owner, viewer, project, thread };
}

async function insertEntry(
  db,
  projectId,
  userId,
  { title = "条目", body = "正文", status = "draft" } = {},
) {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO wiki_pages(id,project_id,title,body,status,created_by,updated_by) VALUES(?,?,?,?,?,?,?)",
    [id, projectId, title, body, status, userId, userId],
  );
  return id;
}

test("daily signals queue, then settle into draft entries with sources", async () => {
  const { database, db, service, owner, project, thread } = await setup();
  try {
    await service.postMessage(owner, thread.id, { body: "我们决定先做项目记忆，不再人手维护" });
    const [message] = await query(db, "SELECT id FROM messages WHERE thread_id=?", [thread.id]);
    const queued = await query(
      db,
      "SELECT id,source_kind sourceKind FROM agent_project_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.equal(queued.length, 1);
    assert.equal(queued[0].sourceKind, "message");
    assert.equal(queued[0].id.length, 36);

    // 事件型信号立即排 run
    await noteProjectMemorySignal(db, project.id, "task", randomUUID(), "任务完成", {
      urgent: true,
    });
    const [run] = await query(
      db,
      "SELECT id,status FROM agent_laoweng_runs WHERE project_id=? AND task='project_memory' ORDER BY created_at LIMIT 1",
      [project.id],
    );
    assert.ok(run);
    assert.equal(run.status, "queued");

    let captured = null;
    const worked = await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      summarizeMemory: async (context) => {
        captured = context;
        return {
          entries: [
            {
              op: "create",
              subject: "project",
              subtype: "phase_change",
              title: "当前状态",
              body: "## 现在\n\n先做项目记忆",
              sourceIds: context.candidates.map((candidate) => candidate.queueId),
            },
          ],
          summary: "已整理",
        };
      },
    });
    assert.equal(worked, true);
    assert.ok(captured.candidates.some((candidate) => candidate.sourceKind === "message"));
    assert.ok(captured.candidates.some((candidate) => candidate.text.includes("项目记忆")));

    const pages = await query(
      db,
      "SELECT id,status,subject_type subjectType,memory_subtype subtype FROM wiki_pages WHERE project_id=? AND title=?",
      [project.id, "当前状态"],
    );
    assert.equal(pages.length, 1);
    assert.equal(pages[0].status, "draft");
    assert.equal(pages[0].subjectType, "project");
    assert.equal(pages[0].subtype, "phase_change");
    const [overallPage] = await query(
      db,
      "SELECT id FROM wiki_pages WHERE project_id=? AND subject_type='project'",
      [project.id],
    );
    assert.ok(overallPage, "结算应保证项目整体页存在");
    const sources = await query(
      db,
      "SELECT source_kind sourceKind,source_id sourceId FROM wiki_page_sources WHERE page_id=?",
      [pages[0].id],
    );
    assert.ok(
      sources.some((source) => source.sourceKind === "message" && source.sourceId === message.id),
    );

    const left = await query(db, "SELECT id FROM agent_project_memory_queue WHERE project_id=?", [
      project.id,
    ]);
    assert.equal(left.length, 0);
    const [finished] = await query(
      db,
      "SELECT status,had_updates,item_count FROM agent_laoweng_runs WHERE id=?",
      [run.id],
    );
    assert.equal(finished.status, "completed");
    assert.equal(Number(finished.had_updates), 1);
    assert.equal(Number(finished.item_count), 1);
  } finally {
    await database.close();
  }
});

test("confirm promotes a draft once, flag records a dispute without editing", async () => {
  const { database, db, service, owner, viewer, project } = await setup();
  try {
    const entryId = await insertEntry(db, project.id, owner.id, { title: "当前状态" });
    const confirmed = await confirmMemoryEntry(service, owner, project.id, entryId);
    assert.equal(confirmed.status, "current");
    await assert.rejects(
      confirmMemoryEntry(service, owner, project.id, entryId),
      (error) => error.status === 409,
    );
    await assert.rejects(
      confirmMemoryEntry(service, viewer, project.id, entryId),
      (error) => error.status === 403,
    );

    const draftId = await insertEntry(db, project.id, owner.id, {
      title: "决策",
      body: "原来如此",
    });
    const flagged = await flagMemoryEntry(service, owner, project.id, draftId, {
      note: "这条结论不准确",
    });
    assert.equal(flagged.disputed, true);
    assert.equal(flagged.body, "原来如此");
    // HTTP 层会把 ZodError 映射成 400；这里直接调用服务函数，两种情况都算参数被拒。
    await assert.rejects(
      flagMemoryEntry(service, owner, project.id, draftId, { note: "" }),
      (error) => error.status === 400 || error.name === "ZodError",
    );

    const counts = await readProjectMemoryCounts(service, owner, project.id);
    assert.equal(counts.drafts, 1);
    assert.equal(counts.disputes, 1);
    assert.equal(counts.updatedSinceEntry, 1);

    const memory = await readProjectMemory(service, owner, project.id);
    assert.equal(memory.canWrite, true);
    assert.equal(memory.entries.length, 2);
    assert.ok(memory.entries.some((entry) => entry.disputed === true));

    const viewerMemory = await readProjectMemory(service, viewer, project.id);
    assert.equal(viewerMemory.canWrite, false);
    // 只读成员从未进入过项目：updatedSinceEntry 取现行条目数。
    const viewerCounts = await readProjectMemoryCounts(service, viewer, project.id);
    assert.equal(viewerCounts.updatedSinceEntry, 1);
  } finally {
    await database.close();
  }
});

test("iteration settlement promotes only confirmed drafts and stays stable on replay", async () => {
  const { database, db, service, owner, project, thread } = await setup();
  try {
    const workflowId = randomUUID();
    const confirmedDraft = await insertEntry(db, project.id, owner.id, { title: "A" });
    const keptDraft = await insertEntry(db, project.id, owner.id, { title: "B" });
    for (const pageId of [confirmedDraft, keptDraft])
      await query(
        db,
        "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,'archive',?,'归档确认')",
        [randomUUID(), pageId, workflowId],
      );
    const first = await transaction(db, (conn) =>
      settleIterationMemory(conn, {
        projectId: project.id,
        threadId: thread.id,
        userId: owner.id,
        workflowId,
        confirmedEntryIds: [confirmedDraft],
      }),
    );
    assert.equal(first.promoted, 1);
    assert.equal(first.keptDraft, 1);
    assert.equal(first.confirmed, 1);
    assert.equal(first.superseded, 0);
    const [promoted] = await query(db, "SELECT status FROM wiki_pages WHERE id=?", [
      confirmedDraft,
    ]);
    assert.equal(promoted.status, "current");

    const replay = await transaction(db, (conn) =>
      settleIterationMemory(conn, {
        projectId: project.id,
        threadId: thread.id,
        userId: owner.id,
        workflowId,
        apply: false,
      }),
    );
    assert.equal(replay.promoted, 0);
    assert.equal(replay.confirmed, 1);
    assert.equal(replay.keptDraft, 1);

    await assert.rejects(
      transaction(db, (conn) =>
        settleIterationMemory(conn, {
          projectId: project.id,
          threadId: thread.id,
          userId: owner.id,
          workflowId,
          confirmedEntryIds: [randomUUID()],
        }),
      ),
      (error) => error.status === 400,
    );
  } finally {
    await database.close();
  }
});

test("memory HTTP endpoints expose reads, permissions and refresh", async () => {
  const { database, db, service, owner, viewer, project, thread } = await setup();
  let server;
  try {
    await query(
      db,
      "UPDATE threads SET status='archived',archived_at=UTC_TIMESTAMP(3),archive_snapshot=? WHERE id=?",
      [
        JSON.stringify({ conclusion: "这轮定了项目记忆", taskDecisions: [], versions: [] }),
        thread.id,
      ],
    );
    await insertEntry(db, project.id, owner.id, { title: "草稿条目" });
    const outsider = { id: randomUUID() };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      outsider.id,
      outsider.id + "@test.com",
      "项目外成员",
    ]);
    server = createApp(db).listen(0, "127.0.0.1");
    await new Promise((done) => server.once("listening", done));
    const base = "http://127.0.0.1:" + server.address().port + "/api/projects/" + project.id;
    const tokenOf = async (userId, label) =>
      (await issueCredential(db, userId, "session", label)).token;
    const ownerToken = await tokenOf(owner.id, "memory-http-owner");
    const viewerToken = await tokenOf(viewer.id, "memory-http-viewer");
    const outsiderToken = await tokenOf(outsider.id, "memory-http-outsider");
    const request = (path, { body, method, token } = {}) =>
      fetch(base + path, {
        method: method || (body === undefined ? "GET" : "POST"),
        headers: { Cookie: "cothread_session=" + token, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    const memory = await (await request("/memory", { token: ownerToken })).json();
    assert.equal(memory.canWrite, true);
    assert.equal(memory.timeline.length, 1);
    assert.equal(memory.timeline[0].conclusion, "这轮定了项目记忆");
    assert.equal(memory.entries.length, 1);

    const viewerMemory = await request("/memory", { token: viewerToken });
    assert.equal(viewerMemory.status, 200);
    assert.equal((await viewerMemory.json()).canWrite, false);
    assert.equal((await request("/memory", { token: outsiderToken })).status, 403);
    assert.equal((await request("/memory/counts", { token: outsiderToken })).status, 403);

    const entryId = memory.entries[0].id;
    // 人手写入口已下线：知识页只能读，改记忆走确认与纠错。
    const createAttempt = await request("/wiki-pages", {
      token: ownerToken,
      body: { kind: "guide", title: "手写一页", body: "不该成功" },
    });
    assert.equal(createAttempt.status, 409);
    const patchAttempt = await request("/wiki-pages/" + entryId, {
      token: ownerToken,
      method: "PATCH",
      body: { body: "改正文" },
    });
    assert.equal(patchAttempt.status, 409);
    const forbidden = await request("/memory/entries/" + entryId + "/confirm", {
      token: viewerToken,
      body: {},
    });
    assert.equal(forbidden.status, 403);
    const confirmed = await request("/memory/entries/" + entryId + "/confirm", {
      token: ownerToken,
      body: {},
    });
    assert.equal(confirmed.status, 200);
    assert.equal((await confirmed.json()).status, "current");
    const refreshed = await request("/memory/refresh", { token: ownerToken, body: {} });
    assert.equal(refreshed.status, 202);
  } finally {
    if (server) await new Promise((done) => server.close(done));
    await database.close();
  }
});

test("project archive freezes the memory and archive detail lists calibratable drafts", async () => {
  const { database, db, service, owner, project, thread } = await setup();
  try {
    const workflowId = randomUUID();
    const draftId = await insertEntry(db, project.id, owner.id, { title: "本轮草稿" });
    await query(
      db,
      "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,'archive',?,'归档确认')",
      [randomUUID(), draftId, workflowId],
    );
    await query(
      db,
      "INSERT INTO iteration_archive_workflows(id,thread_id,run_token,snapshot,requested_by) VALUES(?,?,?,?,?)",
      [workflowId, thread.id, randomUUID(), JSON.stringify({ tasks: [] }), owner.id],
    );

    const drafts = await listIterationMemoryDrafts(db, {
      projectId: project.id,
      threadId: thread.id,
      workflowId,
    });
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].id, draftId);
    assert.equal(drafts[0].title, "本轮草稿");

    const workflow = await readArchiveWorkflow(service, owner, thread.id);
    assert.equal(workflow.id, workflowId);
    assert.equal(workflow.memoryDrafts.length, 1);
    assert.equal(workflow.memoryDrafts[0].id, draftId);

    const before = await readProjectMemory(service, owner, project.id);
    assert.equal(before.frozen, false);
    assert.equal(before.canWrite, true);

    // 项目归档后成员失去项目访问权：项目记忆随项目一起封存，读写都不可达。
    await query(db, "UPDATE projects SET archived_at=UTC_TIMESTAMP(3) WHERE id=?", [project.id]);
    await assert.rejects(
      readProjectMemory(service, owner, project.id),
      (error) => error.status === 403,
    );
    await assert.rejects(
      confirmMemoryEntry(service, owner, project.id, draftId),
      (error) => error.status === 403,
    );
    await assert.rejects(
      flagMemoryEntry(service, owner, project.id, draftId, { note: "已经归档了" }),
      (error) => error.status === 403,
    );
  } finally {
    await database.close();
  }
});
