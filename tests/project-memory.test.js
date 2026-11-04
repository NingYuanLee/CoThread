import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query, transaction } from "../server/db.js";
import { Service } from "../server/service.js";
import { createApp } from "../server/app.js";
import { issueCredential } from "../server/auth.js";
import {
  noteProjectMemorySignal,
  processNextProjectMemory,
  resetProjectMemoryRetryBudget,
} from "../server/project-memory.js";
import { isImportantIteration, isImportantTask } from "../server/memory-signal-filter.js";
import { scanProjectMemorySignals } from "../server/project-memory-scan.js";
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
  { title = "条目", body = "正文", status = "current" } = {},
) {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO wiki_pages(id,project_id,title,body,status,created_by,updated_by) VALUES(?,?,?,?,?,?,?)",
    [id, projectId, title, body, status, userId, userId],
  );
  return id;
}

test("daily signals queue, then settle into current entries with sources", async () => {
  const { database, db, service, owner, project, thread } = await setup();
  try {
    await service.postMessage(owner, thread.id, { body: "我们决定先做项目记忆，不再人手维护" });
    // 信号不再由事件写入：先建水位，再制造一次项目级变更，由扫描生成待结算信号。
    await scanProjectMemorySignals(db, project.id);
    await service.projectChange(db, project.id, owner.id, "profile_updated", { name: "记忆项目" });
    await scanProjectMemorySignals(db, project.id);
    const queued = await query(
      db,
      "SELECT id,source_kind sourceKind FROM agent_project_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.ok(queued.some((entry) => entry.sourceKind === "milestone"));
    assert.ok(queued.every((entry) => entry.sourceKind !== "message"));

    // 事件型信号立即排 run
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
      verifyMemorySupport: async () => ({ supported: true }),
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
          statusMarkdown: "## 当前状态\n\n- 先做项目记忆",
        };
      },
    });
    assert.equal(worked, true);
    assert.ok(captured.candidates.some((candidate) => candidate.sourceKind === "milestone"));

    const pages = await query(
      db,
      "SELECT id,status,subject_type subjectType,memory_subtype subtype FROM wiki_pages WHERE project_id=? AND title=?",
      [project.id, "当前状态"],
    );
    assert.equal(pages.length, 1);
    assert.equal(pages[0].status, "current");
    assert.equal(pages[0].subjectType, "project");
    assert.equal(pages[0].subtype, "phase_change");
    const [statusRow] = await query(db, "SELECT body FROM project_status WHERE project_id=?", [
      project.id,
    ]);
    assert.match(statusRow.body, /先做项目记忆/);
    const sources = await query(
      db,
      "SELECT source_kind sourceKind,source_id sourceId FROM wiki_page_sources WHERE page_id=?",
      [pages[0].id],
    );
    assert.ok(sources.some((source) => source.sourceKind === "milestone"));

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
    assert.equal(Number(finished.item_count), 2, "一条项目进程条目 + 一次现状覆盖");
  } finally {
    await database.close();
  }
});

test("失败次数不跨内容变化与人工重试继承", async () => {
  const { database, db, project } = await setup();
  try {
    const sourceId = randomUUID();
    await query(
      db,
      `INSERT INTO agent_project_memory_queue(id,project_id,source_kind,source_id,hint,retry_count,available_at,last_error)
       VALUES(?,?,'task',?,'旧提示',5,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 DAY),'已停止自动重试：旧错误')`,
      [randomUUID(), project.id, sourceId],
    );
    const readQueueRow = async () => {
      const [row] = await query(
        db,
        `SELECT retry_count retryCount,last_error lastError,available_at availableAt
         FROM agent_project_memory_queue WHERE project_id=? AND source_kind='task' AND source_id=?`,
        [project.id, sourceId],
      );
      return row;
    };
    // 同一来源产出新内容：内容变了就应重新获得自动重试预算。
    await noteProjectMemorySignal(db, project.id, "task", sourceId, "新提示");
    const changed = await readQueueRow();
    assert.equal(Number(changed.retryCount), 0);
    assert.equal(changed.lastError, null);
    // 内容没变、只是重复通知时保留原有预算。
    await query(
      db,
      "UPDATE agent_project_memory_queue SET retry_count=3 WHERE project_id=? AND source_kind='task' AND source_id=?",
      [project.id, sourceId],
    );
    await noteProjectMemorySignal(db, project.id, "task", sourceId, "新提示");
    assert.equal(Number((await readQueueRow()).retryCount), 3);
    // 人工重试重置预算并把排队行拉回当前，否则历史失败会让下一次失败直接又判成停止。
    await query(
      db,
      `UPDATE agent_project_memory_queue SET retry_count=5,last_error='已停止自动重试：旧错误',
       available_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 DAY)
       WHERE project_id=? AND source_kind='task' AND source_id=?`,
      [project.id, sourceId],
    );
    await resetProjectMemoryRetryBudget(db, project.id);
    const reset = await readQueueRow();
    assert.equal(Number(reset.retryCount), 0);
    assert.equal(reset.lastError, null);
    const [now] = await query(db, "SELECT UTC_TIMESTAMP(3) now");
    assert.ok(
      new Date(reset.availableAt).getTime() <= new Date(now.now).getTime(),
      "排队行应重新到点",
    );
  } finally {
    await database.close();
  }
});

test("confirmation is retired and feedback does not edit memory", async () => {
  const { database, db, service, owner, viewer, project } = await setup();
  try {
    const entryId = await insertEntry(db, project.id, owner.id, { title: "当前状态" });
    await assert.rejects(
      confirmMemoryEntry(service, owner, project.id, entryId),
      (error) => error.status === 410,
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
    assert.equal(counts.drafts, undefined);
    assert.equal(counts.disputes, 1);
    assert.equal(counts.updatedSinceEntry, 2);

    const memory = await readProjectMemory(service, owner, project.id);
    assert.equal(memory.canWrite, true);
    assert.ok(memory.entries.some((entry) => entry.id === entryId));
    assert.ok(memory.entries.some((entry) => entry.id === draftId));
    assert.ok(memory.entries.some((entry) => entry.disputed === true));

    const viewerMemory = await readProjectMemory(service, viewer, project.id);
    assert.equal(viewerMemory.canWrite, false);
    // 只读成员从未进入过项目：updatedSinceEntry 取现行条目数。
    const viewerCounts = await readProjectMemoryCounts(service, viewer, project.id);
    assert.equal(
      viewerCounts.updatedSinceEntry,
      memory.entries.filter((entry) => entry.status === "current").length,
    );
  } finally {
    await database.close();
  }
});

test("iteration settlement only reports counts and is stable on replay", async () => {
  const { database, db, owner, project, thread } = await setup();
  try {
    const workflowId = randomUUID();
    for (let i = 0; i < 2; i++) {
      const id = await insertEntry(db, project.id, owner.id);
      await query(
        db,
        "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,'archive',?,'归档')",
        [randomUUID(), id, workflowId],
      );
    }
    const input = { projectId: project.id, threadId: thread.id, userId: owner.id, workflowId };
    const first = await transaction(db, (conn) => settleIterationMemory(conn, input));
    assert.equal(first.current, 2);
    assert.equal(first.superseded, 0);
    assert.deepEqual(await transaction(db, (conn) => settleIterationMemory(conn, input)), first);
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) n FROM project_change_logs WHERE project_id=? AND action='memory_entry_confirmed'",
            [project.id],
          )
        )[0].n,
      ),
      0,
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
    const draftId = await insertEntry(db, project.id, owner.id, { title: "草稿条目" });
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
    assert.ok(memory.entries.some((entry) => entry.id === draftId));

    const viewerMemory = await request("/memory", { token: viewerToken });
    assert.equal(viewerMemory.status, 200);
    assert.equal((await viewerMemory.json()).canWrite, false);
    assert.equal((await request("/memory", { token: outsiderToken })).status, 403);
    assert.equal((await request("/memory/counts", { token: outsiderToken })).status, 403);

    const entryId = draftId;
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
    assert.equal(confirmed.status, 410);
    // Avoid invoking a real model in this route test; an existing active run is reusable.
    await query(
      db,
      "UPDATE agent_laoweng_runs SET status='running',started_at=UTC_TIMESTAMP(3) WHERE project_id=? AND task='project_memory' AND status='queued'",
      [project.id],
    );
    const refreshed = await request("/memory/refresh", { token: ownerToken, body: {} });
    assert.equal(refreshed.status, 202);
  } finally {
    if (server) await new Promise((done) => server.close(done));
    await database.close();
  }
});

test("project archive freezes memory and archive no longer asks to confirm memory", async () => {
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
    assert.equal(drafts.length, 0);

    const workflow = await readArchiveWorkflow(service, owner, thread.id);
    assert.equal(workflow.id, workflowId);
    assert.equal(workflow.memoryDrafts, undefined);

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

test("主要任务与主要迭代过滤：普通任务和空迭代不进入记忆判断", async () => {
  const { database, db, service, owner, project, thread } = await setup();
  try {
    const taskId = randomUUID();
    await query(
      db,
      `INSERT INTO agent_tasks(id,project_id,created_by_type,created_by_id,task_type,title,goal,status,execution_agent_type,retry_count,revision)
       VALUES(?,?,'human_member',?,'assist','普通任务','普通目标','completed','child_agent',0,1)`,
      [taskId, project.id, owner.id],
    );
    assert.equal(await isImportantTask(db, project.id, taskId), false);
    await query(db, "UPDATE agent_tasks SET task_type='formal' WHERE id=?", [taskId]);
    assert.equal(await isImportantTask(db, project.id, taskId), true);

    const empty = await service.createThread(owner, project.id, { title: "空迭代" });
    assert.equal(await isImportantIteration(db, empty.id), false);
    await query(db, "UPDATE agent_tasks SET origin_thread_id=? WHERE id=?", [empty.id, taskId]);
    assert.equal(await isImportantIteration(db, empty.id), true);
    assert.equal(await isImportantIteration(db, thread.id), false);
  } finally {
    await database.close();
  }
});
