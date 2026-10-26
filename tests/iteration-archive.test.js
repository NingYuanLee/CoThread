import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createTask, acceptTask, updateTask, cancelTask } from "../server/task-pool.js";
import { processNextProjectMemory } from "../server/project-memory.js";
import { claimReply } from "../server/reply-dispatch.js";
import { lockIteration } from "../server/iteration-state.js";
import { createApp } from "../server/app.js";
import {
  archivePlanDraftSchema,
  reviseArchiveSummary,
  suggestArchiveContinuation,
  suggestArchivePriorities,
} from "../server/iteration-archive.js";
import { issueCredential } from "../server/auth.js";
import { createAgentTools } from "../server/agent-tools.js";

let database, db, service, leader, creator, admin, project, thread;
before(async () => {
  database = await testDatabase();
  db = database.db;
});
after(async () => {
  await database?.close();
});
afterEach(async () => {
  await database.reset();
});
beforeEach(async () => {
  service = new Service(db);
  [leader, creator, admin] = Array.from({ length: 3 }, () => ({
    id: randomUUID(),
    kind: "session",
  }));
  for (const actor of [leader, creator, admin])
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      actor.id,
      `${actor.id}@test.local`,
      "归档测试成员",
    ]);
  project = await service.createProject(leader, { name: "归档工作流" });
  await query(
    db,
    "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member'),(?,?,'project_admin')",
    [project.id, creator.id, project.id, admin.id],
  );
  thread = await service.createThread(creator, project.id, {
    title: "本轮",
    background: "已有背景",
    goal: "本轮目标",
  });
});
const actor = (person) => ({ type: "human_member", id: person.id });
const newTask = (title = "尚未安排的任务", threadId = thread.id) =>
  createTask(db, {
    projectId: project.id,
    originThreadId: threadId,
    sourceType: "human_member",
    sourceUserId: creator.id,
    createdByType: "human_member",
    createdById: creator.id,
    taskType: "formal",
    title,
    goal: "提交可验收结果",
    targetType: "human_member",
    targetId: creator.id,
  });
function draft(context, disposition = "retain") {
  return {
    conclusion: "本轮完成方案，开发尚未完成。",
    taskDecisions: (context.snapshot.tasks || [])
      .filter(
        (item) =>
          !["completed", "failed", "cancelled", "rejected", "abandoned", "superseded"].includes(
            item.status,
          ),
      )
      .map((item) => ({ taskId: item.id, disposition, reason: "由人类决定后续去向" })),
    notes: "尚未形成任务的验收事项",
    nextIteration: {
      title: "承接轮次",
      background: "沿用已确认方案，继续开发和验收。",
      goal: "完成开发与验收",
    },
  };
}
async function ready(disposition = "retain") {
  await service.archive(creator, thread.id);
  await processNextProjectMemory(db, {
    projectId: project.id,
    task: "iteration_archive",
    summarizeArchive: async (context) => draft(context, disposition),
  });
  return service.readArchiveWorkflow(creator, thread.id);
}
const confirmBody = (workflow, createNextIteration = false) => ({
  workflowId: workflow.id,
  conclusion: workflow.conclusion,
  taskDecisions: workflow.taskDecisions,
  notes: workflow.notes,
  nextIteration: workflow.nextIteration,
  createNextIteration,
});

test("only the iteration creator or current project leader may enter, withdraw and confirm archive", async () => {
  await assert.rejects(service.archive(admin, thread.id), { status: 403 });
  const begun = await service.archive(creator, thread.id);
  assert.equal(begun.status, "archiving");
  assert.equal((await service.readArchiveWorkflow(admin, thread.id)).canManage, false);
  await assert.rejects(service.cancelIterationArchive(admin, thread.id, { workflowId: begun.id }), {
    status: 403,
  });
  await query(db, "DELETE FROM members WHERE project_id=? AND user_id=?", [project.id, creator.id]);
  await assert.rejects(
    service.cancelIterationArchive(creator, thread.id, { workflowId: begun.id }),
    { status: 403 },
  );
  assert.equal(
    (await service.cancelIterationArchive(leader, thread.id, { workflowId: begun.id })).status,
    "active",
  );
});

test("running human work blocks archive and gives a concrete blocking task", async () => {
  const task = await newTask("正在进行的任务");
  await acceptTask(db, task.id, actor(creator), "human_direct");
  await assert.rejects(
    service.archive(creator, thread.id),
    (error) => error.status === 409 && error.message.includes("正在进行的任务"),
  );
  assert.equal((await service.thread(creator, thread.id)).status, "active");
  await updateTask(db, task.id, actor(creator), { status: "completed" });
  assert.equal((await service.archive(creator, thread.id)).status, "archiving");
});

test("archiving freezes raw messages, task writes, background and queued reply admission", async () => {
  const task = await newTask();
  await service.postMessage(creator, thread.id, { body: "请继续梳理" });
  const begun = await service.archive(creator, thread.id);
  for (const operation of [
    () => service.postMessage(creator, thread.id, { body: "不应写入" }),
    () => service.insertMessage(db, creator, thread.id, "迟到通知"),
    () => newTask("不应创建"),
    () => acceptTask(db, task.id, actor(creator), "human_direct"),
    () => cancelTask(db, task.id, actor(creator), "不应取消"),
    () => service.updateThread(creator, thread.id, { goal: "不应改变" }),
  ])
    await assert.rejects(operation(), { status: 409 });
  assert.equal(await claimReply(db, thread.id), undefined);
  assert.equal((await service.context(creator, thread.id)).messages.length, 1);
  await service.cancelIterationArchive(creator, thread.id, { workflowId: begun.id });
  await service.updateThread(creator, thread.id, { background: "撤回后可修改" });
  assert.equal((await service.context(creator, thread.id)).background, "撤回后可修改");
});

test("knowledge administrator prepares a draft, then confirmed handoff preserves task identity and updates memory afterwards", async () => {
  const task = await newTask();
  const workflow = await ready("handoff");
  assert.equal(workflow.status, "ready");
  assert.equal(
    (await query(db, "SELECT * FROM agent_project_summaries WHERE project_id=?", [project.id]))
      .length,
    0,
  );
  const body = confirmBody(workflow, true);
  const result = await service.confirmIterationArchive(leader, thread.id, body);
  const again = await service.confirmIterationArchive(leader, thread.id, body);
  assert.equal(again.nextThreadId, result.nextThreadId);
  const wikiPages = await query(
    db,
    "SELECT memory_subtype subtype FROM wiki_pages WHERE project_id=? ORDER BY memory_subtype",
    [project.id],
  );
  assert.deepEqual(
    wikiPages.map((page) => page.subtype),
    ["iteration_archived", "problem_review"],
  );
  const [moved] = await query(db, "SELECT * FROM agent_tasks WHERE id=?", [task.id]);
  assert.equal(moved.origin_thread_id, result.nextThreadId);
  assert.equal(moved.original_thread_id, thread.id);
  const next = await service.thread(leader, result.nextThreadId);
  assert.equal(next.created_by, leader.id);
  assert.equal(next.background, workflow.nextIteration.background);
  const [count] = await query(
    db,
    "SELECT COUNT(*) n FROM agent_task_iteration_moves WHERE task_id=?",
    [task.id],
  );
  assert.equal(Number(count.n), 1);
  const archived = await service.context(creator, thread.id);
  assert.equal(archived.archive_snapshot.tasks[0].id, task.id);
  assert.equal(archived.archive_snapshot.taskDecisions[0].disposition, "handoff");
  await processNextProjectMemory(db, {
    projectId: project.id,
    task: "iteration_archive",
    summarizeArchive: async (context) => {
      assert.equal(context.phase, "memory");
      assert.equal(context.snapshot.conclusion, body.conclusion);
      return "人工批准的长期结论";
    },
  });
  assert.equal(
    (
      await query(db, "SELECT summary FROM agent_project_summaries WHERE project_id=?", [
        project.id,
      ])
    )[0].summary,
    "人工批准的长期结论",
  );
});

test("retained tasks keep their real status and may not become detached by deleting their iteration", async () => {
  const task = await newTask();
  const workflow = await ready();
  await service.confirmIterationArchive(creator, thread.id, confirmBody(workflow));
  const [retained] = await query(db, "SELECT * FROM agent_tasks WHERE id=?", [task.id]);
  assert.equal(retained.origin_thread_id, thread.id);
  assert.equal(retained.status, "awaiting_acceptance");
  assert.ok(retained.retained_at);
  await assert.rejects(service.deleteArchivedThread(creator, thread.id), { status: 409 });
});

test("withdrawal invalidates a late knowledge administrator result", async () => {
  await newTask();
  const started = await service.archive(creator, thread.id);
  let release, entered;
  const gate = new Promise((done) => {
    release = done;
  });
  const waiting = new Promise((done) => {
    entered = done;
  });
  const worker = processNextProjectMemory(db, {
    projectId: project.id,
    task: "iteration_archive",
    summarizeArchive: async (context) => {
      entered();
      await gate;
      return draft(context);
    },
  });
  await waiting;
  await service.cancelIterationArchive(creator, thread.id, { workflowId: started.id });
  release();
  await worker;
  assert.equal((await service.thread(creator, thread.id)).status, "active");
  const workflow = await service.readArchiveWorkflow(creator, thread.id);
  assert.equal(workflow.status, "cancelled");
  assert.equal(workflow.conclusion, "");
  assert.equal((await query(db, "SELECT * FROM agent_project_summaries", [])).length, 0);
});

test("failed preparation stays frozen and retry uses a new generation", async () => {
  const started = await service.archive(creator, thread.id);
  await processNextProjectMemory(db, {
    projectId: project.id,
    task: "iteration_archive",
    summarizeArchive: async () => {
      throw new Error("测试模型失败");
    },
  });
  assert.equal((await service.readArchiveWorkflow(creator, thread.id)).status, "failed");
  assert.equal((await service.thread(creator, thread.id)).status, "archiving");
  await service.retryIterationArchive(leader, thread.id, { workflowId: started.id });
  await processNextProjectMemory(db, {
    projectId: project.id,
    task: "iteration_archive",
    summarizeArchive: async (context) => draft(context),
  });
  assert.equal((await service.readArchiveWorkflow(leader, thread.id)).status, "ready");
});

test("confirm requires complete task decisions and races atomically with withdrawal", async () => {
  await newTask();
  const workflow = await ready();
  await assert.rejects(
    service.confirmIterationArchive(creator, thread.id, {
      ...confirmBody(workflow),
      taskDecisions: [],
    }),
    { status: 400 },
  );
  const outcomes = await Promise.allSettled([
    service.confirmIterationArchive(creator, thread.id, confirmBody(workflow)),
    service.cancelIterationArchive(leader, thread.id, { workflowId: workflow.id }),
  ]);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
});

test("archive admission and task launch cannot both win a concurrent race", async () => {
  const task = await newTask();
  const blocker = await db.getConnection();
  await blocker.beginTransaction();
  await lockIteration(blocker, thread.id);
  const archive = service.archive(creator, thread.id);
  const launch = acceptTask(db, task.id, actor(creator), "human_direct");
  await blocker.commit();
  blocker.release();
  const result = await Promise.allSettled([archive, launch]);
  assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
});

test("archive HTTP endpoints expose the two-stage workflow and enforce the same permissions", async () => {
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  const credential = await issueCredential(db, creator.id, "session", "archive-http-test");
  const base = `http://127.0.0.1:${server.address().port}/api/threads/${thread.id}`;
  const request = (path, body, method) =>
    fetch(base + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: {
        Cookie: `cothread_session=${credential.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    assert.equal(
      (await request("", { background: "HTTP背景", goal: "HTTP目标" }, "PATCH")).status,
      200,
    );
    assert.equal((await request("/archive", {})).status, 200);
    const workflow = await (await request("/archive")).json();
    assert.equal(workflow.status, "preparing");
    assert.equal(workflow.canManage, true);
    assert.equal((await request("", { goal: "冻结修改" }, "PATCH")).status, 409);
    assert.equal((await request("/archive/cancel", { workflowId: workflow.id })).status, 200);
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("archive draft and final memory reuse the knowledge administrator's existing durable iteration_archive session", async () => {
  await service.archive(creator, thread.id);
  const sessions = [];
  const outputs = [
    JSON.stringify(draft({ snapshot: { tasks: [] } })),
    JSON.stringify({ summary: "最终确认后才更新知识库" }),
  ];
  const laowengOptions = {
    model: {
      baseUrl: "http://127.0.0.1:1/v1",
      apiKey: "test",
      model: "test",
      reasoningEffort: "low",
    },
    createHarness: () => ({
      async start() {},
      async run(_prompt, options) {
        sessions.push(options.sessionId);
        return { finalResponse: outputs.shift() };
      },
      async close() {},
    }),
  };
  await processNextProjectMemory(db, {
    projectId: project.id,
    task: "iteration_archive",
    laowengOptions,
  });
  const workflow = await service.readArchiveWorkflow(creator, thread.id);
  assert.equal(workflow.status, "ready");
  await service.confirmIterationArchive(creator, thread.id, confirmBody(workflow));
  await processNextProjectMemory(db, {
    projectId: project.id,
    task: "iteration_archive",
    laowengOptions,
  });
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0], sessions[1]);
  assert.equal(
    (
      await query(
        db,
        "SELECT * FROM agent_project_sessions WHERE project_id=? AND task='iteration_archive'",
        [project.id],
      )
    ).length,
    1,
  );
});

test("active context synchronization blocks archive even without a running task", async () => {
  const { acquireSessionLock } = await import("../server/session-lock.js");
  const lock = await acquireSessionLock(db, thread.id, 0);
  assert.ok(lock);
  try {
    await assert.rejects(
      service.archive(creator, thread.id),
      (error) => error.status === 409 && /上下文/.test(error.message),
    );
  } finally {
    await lock.release();
  }
  assert.equal((await service.thread(creator, thread.id)).status, "active");
});

test("context history paginates previous content and real reviewers without accepting forged audit fields", async () => {
  for (let i = 1; i <= 12; i++)
    await service.updateThread(creator, thread.id, {
      background: `背景 ${i}`,
      goal: `目标 ${i}`,
      reason: `调整备注 ${i}`,
      reviewed_by: leader.id,
    });
  const first = await service.listIterationContextChanges(creator, thread.id, {
    page: "1",
    pageSize: "10",
  });
  assert.equal(first.total, 12);
  assert.equal(first.items.length, 10);
  assert.equal(first.items[0].before.background, "背景 11");
  assert.equal(first.items[0].reason, "调整备注 12");
  assert.equal(first.items[0].reviewerName, null);
  assert.equal(first.items[0].initiatorName, "归档测试成员");
  const second = await service.listIterationContextChanges(admin, thread.id, {
    page: 2,
    pageSize: 10,
  });
  assert.equal(second.items.length, 2);
  assert.ok(second.items.every((item) => !first.items.some((other) => other.id === item.id)));
  await query(db, "UPDATE iteration_context_changes SET reviewed_by=? WHERE id=?", [
    leader.id,
    first.items[0].id,
  ]);
  assert.equal(
    (await service.listIterationContextChanges(creator, thread.id)).items[0].reviewerName,
    "归档测试成员",
  );
  await service.updateThread(creator, thread.id, { background: "背景 12", goal: "目标 12" });
  assert.equal((await service.listIterationContextChanges(creator, thread.id)).total, 12);
  const matched = await service.listIterationContextChanges(creator, thread.id, {
    q: "调整备注 3",
  });
  assert.equal(matched.total, 1);
  assert.equal(matched.items[0].reason, "调整备注 3");
  assert.equal(
    (await service.listIterationContextChanges(creator, thread.id, { review: "reviewed" })).total,
    1,
  );
  assert.equal(
    (await service.listIterationContextChanges(creator, thread.id, { review: "pending" })).total,
    11,
  );
  await assert.rejects(service.listIterationContextChanges(creator, thread.id, { review: "nope" }));
  await assert.rejects(service.listIterationContextChanges(creator, thread.id, { pageSize: 51 }));
  const outsider = { id: randomUUID(), kind: "session" };
  await assert.rejects(service.listIterationContextChanges(outsider, thread.id), { status: 403 });
  await service.archive(creator, thread.id);
  assert.equal((await service.listIterationContextChanges(creator, thread.id)).total, 12);
});

test("coordinator can maintain evolving background and goals with reasons while Chat stays read-only", async () => {
  const message = await service.postMessage(creator, thread.id, {
    body: "@小祥 把本轮目标调整为完成联调。",
    autoReply: true,
  });
  await query(db, "UPDATE assistant_replies SET status='running' WHERE message_id=?", [message.id]);
  const job = { thread_id: thread.id, message_id: message.id };
  const tools = createAgentTools(service, creator, job, { role: "coordinator" });
  const result = await tools("update_iteration_context", {
    goal: "完成联调",
    reason: "成员明确调整了本轮方向",
  });
  assert.equal(result.goal, "完成联调");
  const [change] = await query(db, "SELECT * FROM iteration_context_changes WHERE thread_id=?", [
    thread.id,
  ]);
  assert.equal(change.source, "agent");
  assert.equal(change.reason, "成员明确调整了本轮方向");
  const readOnly = createAgentTools(
    service,
    creator,
    { ...job, dialogue_mode: "chat" },
    { role: "coordinator" },
  );
  await assert.rejects(readOnly("update_iteration_context", { goal: "不应更新", reason: "只读" }), {
    status: 403,
  });
  assert.equal((await service.thread(creator, thread.id)).goal, "完成联调");
});

test("archive draft normalizes unfinished items", () => {
  const plan = archivePlanDraftSchema.parse({
    conclusion: "结论",
    taskDecisions: [],
    notes: "",
    nextIteration: {
      title: "下一轮",
      background: "背景",
      goal: "目标",
      items: ["确认定时触发器是否生效", { title: "回填历史数据", detail: "先出影响面方案" }],
    },
  });
  // 归一化契约：title 必填、detail 缺省为空串，并补出 suggestion（未指定时按归档处理）。
  // 对象形态还会带上 choice/priority 供归档流程使用，所以这里只断言归一化本身。
  assert.deepEqual(
    plan.nextIteration.items.map(({ title, detail, suggestion }) => ({
      title,
      detail,
      suggestion,
    })),
    [
      { title: "确认定时触发器是否生效", detail: "", suggestion: "archive" },
      { title: "回填历史数据", detail: "先出影响面方案", suggestion: "archive" },
    ],
  );
  const bare = archivePlanDraftSchema.parse({
    conclusion: "结论",
    taskDecisions: [],
    notes: "",
    nextIteration: { title: "t", background: "b", goal: "g" },
  });
  assert.deepEqual(bare.nextIteration.items, []);
});

test("a draft whose run died becomes retryable instead of staying in preparing", async () => {
  await service.archive(creator, thread.id);
  const workflow = await service.readArchiveWorkflow(creator, thread.id);
  await query(
    db,
    "UPDATE agent_laoweng_runs SET status='failed',error='服务重启，维护任务已中断。' WHERE archive_workflow_id=?",
    [workflow.id],
  );
  await query(
    db,
    "UPDATE iteration_archive_workflows SET updated_at=DATE_SUB(NOW(), INTERVAL 5 MINUTE) WHERE id=?",
    [workflow.id],
  );
  const stuck = await service.readArchiveWorkflow(creator, thread.id);
  assert.equal(stuck.status, "failed");
  assert.match(stuck.error || "", /重新梳理/);
  const retried = await service.retryIterationArchive(creator, thread.id, {
    workflowId: workflow.id,
  });
  assert.equal(retried.status, "preparing");
  assert.equal(
    (await query(db, "SELECT status FROM iteration_archive_workflows WHERE id=?", [workflow.id]))[0]
      .status,
    "preparing",
  );
});

test("a draft queued but never claimed becomes retryable", async () => {
  await service.archive(creator, thread.id);
  const workflow = await service.readArchiveWorkflow(creator, thread.id);
  await query(
    db,
    "UPDATE agent_laoweng_runs SET created_at=DATE_SUB(NOW(), INTERVAL 10 MINUTE) WHERE archive_workflow_id=?",
    [workflow.id],
  );
  await query(
    db,
    "UPDATE iteration_archive_workflows SET updated_at=DATE_SUB(NOW(), INTERVAL 10 MINUTE) WHERE id=?",
    [workflow.id],
  );
  const stuck = await service.readArchiveWorkflow(creator, thread.id);
  assert.equal(stuck.status, "failed");
  assert.match(stuck.error || "", /重新梳理/);
  const runs = await query(
    db,
    "SELECT status FROM agent_laoweng_runs WHERE archive_workflow_id=?",
    [workflow.id],
  );
  assert.deepEqual(
    runs.map((row) => row.status),
    ["queued"],
  );
});

test("checked unfinished items become tasks in the next iteration", async () => {
  await service.archive(creator, thread.id);
  await processNextProjectMemory(db, {
    projectId: project.id,
    task: "iteration_archive",
    summarizeArchive: async (context) => ({
      ...draft(context),
      nextIteration: {
        title: "承接轮次",
        background: "沿用已确认方案。",
        goal: "完成开发与验收",
        items: [
          { title: "确认定时触发器是否生效", detail: "timers 列表为空，需平台确认" },
          { title: "回填历史 29 条身份类型", detail: "先出影响面方案" },
        ],
      },
    }),
  });
  const workflow = await service.readArchiveWorkflow(creator, thread.id);
  assert.equal(workflow.status, "ready");
  assert.deepEqual(
    workflow.nextIteration.items.map((item) => item.title),
    ["确认定时触发器是否生效", "回填历史 29 条身份类型"],
  );
  await assert.rejects(
    service.confirmIterationArchive(creator, thread.id, {
      ...confirmBody(workflow, false),
      nextIteration: {
        ...workflow.nextIteration,
        items: [{ ...workflow.nextIteration.items[0], choice: "task" }],
      },
    }),
    { status: 400 },
  );
  const confirmed = await service.confirmIterationArchive(creator, thread.id, {
    ...confirmBody(workflow, true),
    nextIteration: {
      ...workflow.nextIteration,
      items: [
        { ...workflow.nextIteration.items[0], include: true },
        { ...workflow.nextIteration.items[1], include: false },
      ],
    },
  });
  assert.ok(confirmed.nextThreadId);
  const created = await query(
    db,
    `SELECT title,goal,status,target_type,target_id,thread_number FROM agent_tasks
    WHERE origin_thread_id=? ORDER BY thread_number`,
    [confirmed.nextThreadId],
  );
  assert.equal(created.length, 1);
  assert.equal(created[0].title, "确认定时触发器是否生效");
  assert.equal(created[0].goal, "timers 列表为空，需平台确认");
  assert.equal(created[0].status, "pending_assignment");
  assert.equal(created[0].target_type, "xiaoxiang");
  assert.equal(Number(created[0].thread_number), 1);
  const [session] = await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [
    confirmed.nextThreadId,
  ]);
  assert.equal(created[0].target_id, session.session_id);
  assert.equal(
    (
      await query(db, "SELECT task_id FROM agent_task_iteration_moves WHERE to_thread_id=?", [
        confirmed.nextThreadId,
      ])
    ).length,
    1,
  );
});

test("background choice is written into the next iteration and does not create a task", async () => {
  const task = await newTask("留在本轮的口径");
  await service.archive(creator, thread.id);
  await processNextProjectMemory(db, {
    projectId: project.id,
    task: "iteration_archive",
    summarizeArchive: async (context) => draft(context),
  });
  const workflow = await service.readArchiveWorkflow(creator, thread.id);
  const confirmed = await service.confirmIterationArchive(creator, thread.id, {
    ...confirmBody(workflow, true),
    taskDecisions: workflow.taskDecisions.map((item) =>
      item.taskId === task.id ? { ...item, disposition: "background", reason: "写进背景" } : item,
    ),
    nextIteration: {
      ...workflow.nextIteration,
      items: [
        { title: "写入背景的事项", detail: "作为背景", choice: "background" },
        { title: "变成任务的事项", detail: "作为任务", choice: "task" },
      ],
    },
  });
  const [next] = await query(db, "SELECT background FROM threads WHERE id=?", [
    confirmed.nextThreadId,
  ]);
  assert.match(next.background, /留在本轮的口径/);
  assert.match(next.background, /写入背景的事项/);
  assert.match(next.background, /作为背景/);
  const created = await query(
    db,
    "SELECT title FROM agent_tasks WHERE origin_thread_id=? ORDER BY thread_number",
    [confirmed.nextThreadId],
  );
  assert.deepEqual(
    created.map((row) => row.title),
    ["变成任务的事项"],
  );
  const [kept] = await query(
    db,
    "SELECT origin_thread_id, retained_at FROM agent_tasks WHERE id=?",
    [task.id],
  );
  assert.equal(kept.origin_thread_id, thread.id);
  assert.ok(kept.retained_at);
});

test("step-three suggestion follows the model and falls back when it fails", async () => {
  await newTask("留在本轮的口径");
  const workflow = await ready();
  const input = {
    conclusion: workflow.conclusion,
    notes: workflow.notes,
    nextIteration: workflow.nextIteration,
    decisions: [
      { title: "写入背景的事项", detail: "timers 为空", choice: "background" },
      { title: "变成任务的事项", detail: "先出方案", choice: "task" },
      { title: "不再继续", detail: "已放弃", choice: "archive" },
    ],
  };
  const suggested = await suggestArchiveContinuation(
    service,
    creator,
    thread.id,
    input,
    async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify({
          output_text: JSON.stringify({
            title: "承接触发器确认",
            background: "沿用方案，并记下 timers 为空。",
            goal: "完成变成任务的事项",
          }),
        }),
    }),
  );
  assert.equal(suggested.title, "承接触发器确认");
  assert.match(suggested.background, /timers 为空/);
  assert.match(suggested.goal, /变成任务的事项/);
  const fallback = await suggestArchiveContinuation(
    service,
    creator,
    thread.id,
    input,
    async () => {
      throw new Error("model down");
    },
  );
  assert.equal(fallback.title, workflow.nextIteration.title);
  assert.match(fallback.background, /写入背景的事项/);
  assert.doesNotMatch(fallback.background, /不再继续/);
});

test("priority suggestion ranks items and preselects a choice", async () => {
  await newTask("确认定时触发器");
  const workflow = await ready();
  const ranked = await suggestArchivePriorities(
    service,
    creator,
    thread.id,
    {
      conclusion: workflow.conclusion,
      decisions: [
        { key: "task:1", title: "确认定时触发器", detail: "阻塞上线", kind: "task" },
        { key: "item:1", title: "回填身份类型", detail: "只是口径", kind: "item" },
      ],
    },
    async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify({
          output_text: JSON.stringify({
            decisions: [
              { key: "task:1", priority: 1, suggestion: "task" },
              { key: "item:1", priority: 3, suggestion: "background" },
            ],
          }),
        }),
    }),
  );
  assert.deepEqual(ranked.decisions, [
    { key: "task:1", priority: 1, suggestion: "task" },
    { key: "item:1", priority: 3, suggestion: "background" },
  ]);
});

test("summary revise keeps the workflow ready and stores markdown", async () => {
  const workflow = await ready();
  const revised = await reviseArchiveSummary(
    service,
    creator,
    thread.id,
    {
      workflowId: workflow.id,
      comment: "补上未完成的触发器",
    },
    async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ output_text: "## 迭代总结\n触发器仍未确认。" }),
    }),
  );
  assert.match(revised.conclusion, /触发器仍未确认/);
  const again = await service.readArchiveWorkflow(creator, thread.id);
  assert.equal(again.status, "ready");
  assert.match(again.conclusion, /触发器仍未确认/);
});

test("archive draft accepts the model's decision key and defaults unknown dispositions", () => {
  const plan = archivePlanDraftSchema.parse({
    conclusion: "本轮未完成任务留档，另一条交接下一轮。",
    taskDecisions: [
      {
        taskId: randomUUID(),
        title: "任务 A",
        status: "blocked",
        decision: "handoff",
        reason: "交接",
      },
      { taskId: randomUUID(), disposition: "留档", reason: "" },
      { taskId: randomUUID(), reason: "模型漏给取值" },
    ],
    notes: ["未形成任务的事项"],
    nextIteration: { title: "下一轮", background: "", goal: "" },
  });
  assert.deepEqual(
    plan.taskDecisions.map((item) => item.disposition),
    ["handoff", "retain", "retain"],
  );
  assert.equal(typeof plan.notes, "string");
});
