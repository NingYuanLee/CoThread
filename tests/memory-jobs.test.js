import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.ts";
import { Service } from "../server/service.ts";
import { MEMORY_JOBS, MEMORY_JOB_KEYS } from "../shared/memory-jobs.js";
import {
  listConversationProgress,
  listMemoryJobHistory,
  listMemoryJobs,
  resetMemoryJobSettings,
  updateMemoryJobSettings,
} from "../server/memory-jobs.ts";
import {
  maybeQueueProjectMemoryRun,
  queueProjectMemoryRun,
  retryMemoryJob,
} from "../server/project-memory.ts";
import { LAOWENG_MAINTENANCE_TASKS } from "../shared/agent-label.js";

test("消息记忆进度按迭代返回最新序列、已处理与正在处理序列", async () => {
  const db = {
    execute: async (sql) => {
      if (sql.includes("COUNT(*) total")) return [[{ total: 3 }]];
      if (sql.includes("FROM conversation_memory_windows"))
        return [
          [
            {
              id: "thread-1",
              title: "迭代 A",
              status: "active",
              archivedAt: null,
              lastMessageAt: "2026-11-03 10:00:00",
              messageCount: "12",
              latestSequence: "12",
              processedThrough: "8",
              processingThrough: "10",
              pendingWindows: "1",
              readyWindows: "1",
              lastAttemptAt: "2026-11-03 10:00:00",
              lastError: null,
              queued: "0",
            },
            {
              id: "thread-2",
              title: "迭代 B",
              status: "archived",
              archivedAt: "2026-11-02 10:00:00",
              lastMessageAt: "2026-11-01 10:00:00",
              messageCount: "5",
              latestSequence: "5",
              processedThrough: "5",
              processingThrough: null,
              pendingWindows: "0",
              readyWindows: "0",
              lastAttemptAt: null,
              lastError: null,
              queued: "0",
              unwindowedMessages: "0",
            },
            {
              id: "thread-3",
              title: "迭代 C",
              status: "active",
              archivedAt: null,
              lastMessageAt: "2026-11-03 11:00:00",
              messageCount: "10",
              latestSequence: "10",
              processedThrough: null,
              processingThrough: null,
              pendingWindows: "0",
              readyWindows: "0",
              lastAttemptAt: null,
              lastError: null,
              queued: "0",
              unwindowedMessages: "10",
            },
          ],
        ];
      throw new Error("unexpected query");
    },
  };
  const result = await listConversationProgress(db, "project-1", {});
  assert.equal(result.total, 3);
  assert.equal(result.rows[0].state, "processing");
  assert.equal(result.rows[0].messageCount, 12);
  assert.equal(result.rows[0].latestSequence, 12);
  assert.equal(result.rows[0].processedThrough, 8);
  assert.equal(result.rows[0].processingThrough, 10);
  assert.equal(result.rows[1].state, "done");
  assert.equal(result.rows[1].processingThrough, null);
  assert.equal(result.rows[2].state, "unbackfilled");
  assert.equal(result.rows[2].unwindowedMessages, 10);
});

test("记忆作业历史按项目和作业筛选并在服务端分页", async () => {
  const calls = [];
  const db = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return [calls.length === 1 ? [{ total: 23 }] : [{ id: "run-3" }]];
    },
  };
  const result = await listMemoryJobHistory(db, "project-1", "document_memory", {
    status: "failed",
    from: "2026-11-01",
    to: "2026-11-03",
    page: 99,
    pageSize: 10,
  });
  assert.deepEqual(result, {
    rows: [{ id: "run-3", documentItems: [] }],
    total: 23,
    page: 3,
    pageSize: 10,
  });
  assert.deepEqual(calls[0].params.slice(0, 4), [
    "project-1",
    "document_memory",
    "project_document_memory",
    "iteration_document_memory",
  ]);
  assert.ok(calls[0].params.includes("failed"));
  assert.ok(calls[0].params.includes("2026-11-01"));
  assert.ok(calls[0].params.includes("2026-11-03"));
  assert.match(calls[0].sql, /status=\?/);
  assert.match(calls[0].sql, /created_at>=/);
  assert.match(calls[0].sql, /DATE_ADD/);
  assert.deepEqual(calls[1].params.slice(-2), [10, 20]);
  assert.match(calls[1].sql, /LIMIT \? OFFSET \?/);
  assert.deepEqual(await listMemoryJobHistory(db, "project-1", "task_memory"), {
    rows: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  const discussionCalls = [];
  const discussionDb = {
    execute: async (sql, params) => {
      discussionCalls.push({ sql, params });
      return [discussionCalls.length === 1 ? [{ total: 1 }] : [{ id: "shared-run" }]];
    },
  };
  const discussion = await listMemoryJobHistory(discussionDb, "project-1", "discussion_memory");
  assert.equal(discussion.rows[0].id, "shared-run");
  assert.equal(discussionCalls[0].params[1], "member_memory");
  await assert.rejects(listMemoryJobHistory(db, "project-1", "invalid"), /没有这个记忆作业/);
});

test("四类记忆作业口径完整，有队列的键已注册为维护任务", () => {
  assert.equal(MEMORY_JOBS.length, 4);
  assert.deepEqual([...MEMORY_JOB_KEYS].sort(), [
    "document_memory",
    "member_memory",
    "project_memory",
    "task_memory",
  ]);
  for (const job of MEMORY_JOBS) {
    assert.ok(typeof job.subject === "string" && job.subject.length > 0, job.key + " 缺少 subject");
    assert.ok(typeof job.label === "string" && job.label.length > 1, job.key + " 缺少 label");
    for (const field of ["trigger", "prompt", "completion", "failure"])
      assert.ok(
        typeof job[field] === "string" && job[field].length > 10,
        job.key + " 缺少 " + field,
      );
    assert.ok(Array.isArray(job.tools) && job.tools.length > 0, job.key + " 缺少工具");
    if (job.queue)
      assert.ok(LAOWENG_MAINTENANCE_TASKS.includes(job.key), job.key + " 未注册维护任务");
    if (!job.queue) assert.match(job.trigger, /结算|候选|归档/, job.key + " 应说明承接方式");
  }
});

test("管理视图返回最近运行与积压，且只读", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const service = new Service(db);
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await service.createProject(owner, { name: "记忆作业项目" });
    const threadId = randomUUID();
    await query(
      db,
      "INSERT INTO threads(id,project_id,title,created_by,status,archived_at) VALUES(?,?,?,?,'archived',UTC_TIMESTAMP(3))",
      [threadId, project.id, "已归档迭代", owner.id],
    );
    const runId = randomUUID();
    await query(
      db,
      "INSERT INTO agent_laoweng_runs(id,project_id,task,status,trigger_source) VALUES(?,?,'member_memory','completed','user')",
      [runId, project.id],
    );
    const jobs = await listMemoryJobs(db, project.id);
    assert.equal(jobs.length, 4);
    const member = jobs.find((job) => job.key === "member_memory");
    assert.equal(member.archivedThread?.id, threadId);
    assert.equal(jobs.find((job) => job.key === "task_memory").archivedThread, null);
    assert.equal(member.backlog, 0);
    assert.equal(member.lastRun.id, runId);
    assert.ok(
      member.recentRuns.some((run) => run.id === runId),
      "记忆作业应带运行历史",
    );
    assert.equal(typeof member.recentRuns[0].agent_called, "boolean");
    assert.ok(Array.isArray(jobs.find((job) => job.key === "task_memory").recentRuns));
    const task = jobs.find((job) => job.key === "task_memory");
    assert.equal(task.backlog, null);
    assert.match(task.backlogNote, /结算/);
    assert.ok(jobs.every((job) => typeof job.trigger === "string" && job.tools.length > 0));
  } finally {
    await database.close();
  }
});

test("记忆作业口径固定为默认，不能调整", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const service = new Service(db);
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await service.createProject(owner, { name: "口径固定项目" });
    const defaults = MEMORY_JOBS.find((job) => job.key === "project_memory");
    await assert.rejects(
      updateMemoryJobSettings(
        db,
        project.id,
        "project_memory",
        { enabled: false, triggerThreshold: 25, prompt: "先看决策，再看任务" },
        owner.id,
      ),
      /不能调整/,
    );
    await assert.rejects(
      updateMemoryJobSettings(db, project.id, "not_a_job", {}, owner.id),
      /没有这个记忆作业/,
    );
    await assert.rejects(resetMemoryJobSettings(db, project.id, "project_memory"), /不能调整/);
    const jobs = await listMemoryJobs(db, project.id);
    const projectJob = jobs.find((job) => job.key === "project_memory");
    assert.equal(projectJob.prompt, defaults.prompt);
    assert.equal(projectJob.trigger, defaults.trigger);
    assert.equal(projectJob.promptOverridden, undefined);
    assert.equal(projectJob.enabled, undefined);
  } finally {
    await database.close();
  }
});

test("库里残留的项目级口径不再改变触发", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const service = new Service(db);
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await service.createProject(owner, { name: "口径不生效项目" });
    for (let index = 0; index < 2; index += 1)
      await query(
        db,
        "INSERT INTO agent_project_memory_queue(id,project_id,source_kind,source_id,hint) VALUES(?,?,'manual',?,'')",
        [randomUUID(), project.id, randomUUID()],
      );
    await query(
      db,
      "INSERT INTO memory_job_settings(project_id,job_key,enabled,trigger_threshold,updated_by) VALUES(?,?,?,?,?)",
      [project.id, "project_memory", 0, 2, owner.id],
    );
    assert.equal(await maybeQueueProjectMemoryRun(db, project.id, false), false);
    const queued = await queueProjectMemoryRun(service, owner, project.id);
    assert.ok(queued);
  } finally {
    await database.close();
  }
});

test("讨论和发言重试分派到联合维护任务", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const service = new Service(db);
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await service.createProject(owner, { name: "重试项目" });
    const taskRun = await retryMemoryJob(service, owner, project.id, "task_memory");
    assert.ok(taskRun?.distributionId);
    const discussionRun = await retryMemoryJob(service, owner, project.id, "discussion_memory");
    assert.equal(discussionRun.task, "member_memory");
    await assert.rejects(
      retryMemoryJob(service, owner, project.id, "not_a_job"),
      /没有这个记忆作业/,
    );
    const run = await retryMemoryJob(service, owner, project.id, "member_memory");
    assert.equal(run.task, "member_memory");
    // 重试会内联跑一批维护任务，返回的 run 可能已结束（无模型环境下为 failed）。
    assert.ok(["queued", "running", "completed", "failed"].includes(run.status));
  } finally {
    await database.close();
  }
});

test("处理记录返回独立结果与此前完成范围", async () => {
  const db = {
    execute: async (sql) => {
      if (sql.includes("FROM conversation_memory_windows w JOIN threads"))
        return [
          [
            {
              id: "window-1",
              previousCompletedSequence: "10",
              firstSequence: "11",
              lastSequence: "20",
            },
          ],
        ];
      if (sql.includes("FROM conversation_memory_candidates c WHERE c.window_id IN"))
        return [
          [
            {
              id: "a",
              windowId: "window-1",
              kind: "discussion",
              status: "completed",
              payload: JSON.stringify({ title: "旧议题", pageId: "old" }),
              pageId: "old",
            },
            {
              id: "b",
              windowId: "window-1",
              kind: "discussion",
              status: "failed",
              payload: { title: "新议题" },
              error: "保存失败",
            },
            {
              id: "c",
              windowId: "window-1",
              kind: "statement",
              status: "completed",
              payload: { title: "发言" },
              pageId: "new",
            },
          ],
        ];
      if (sql.includes("COUNT(*) total") && sql.includes("FROM artifacts"))
        return [[{ total: 0, pending: 0 }]];
      if (sql.includes("COUNT(*) count")) return [[{ count: 0 }]];
      if (sql.includes("SUM(statement_status")) return [[{ statements: 0, discussions: 0 }]];
      return [[]];
    },
  };
  const jobs = await listMemoryJobs(db, "project-1");
  const record = jobs.find((job) => job.key === "member_memory").conversationWindows[0];
  assert.equal(record.previousCompletedSequence, "10");
  assert.deepEqual(
    record.results.map(({ action, status }) => [action, status]),
    [
      ["update", "completed"],
      ["create", "failed"],
      ["create", "completed"],
    ],
  );
  assert.equal(record.results[1].error, "保存失败");
});

test("运行历史按运行 ID 返回处理范围和当次结果快照", async () => {
  const db = {
    execute: async (sql) => {
      if (sql.includes("COUNT(*) AS total")) return [[{ total: 1 }]];
      if (sql.includes("FROM agent_laoweng_runs WHERE")) return [[{ id: "run-1" }]];
      if (sql.includes("FROM conversation_run_windows"))
        return [[{ runId: "run-1", threadTitle: "讨论", firstSequence: "11", lastSequence: "20" }]];
      if (sql.includes("FROM conversation_run_items"))
        return [
          [
            {
              runId: "run-1",
              id: "item-1",
              kind: "discussion",
              status: "failed",
              payload: JSON.stringify({ title: "议题", pageId: "old" }),
              error: "保存失败",
            },
          ],
        ];
      throw new Error("unexpected query");
    },
  };
  const history = await listMemoryJobHistory(db, "project-1", "member_memory");
  const window = history.rows[0].conversationWindows[0];
  assert.equal(window.firstSequence, "11");
  assert.equal(window.lastSequence, "20");
  assert.equal(window.updatedDiscussions, 1);
  assert.equal(window.createdDiscussions, 0);
  assert.equal(window.statements, 0);
});

test("项目记忆运行历史返回提交阶段的结果快照", async () => {
  const db = {
    execute: async (sql) => {
      if (sql.includes("COUNT(*) AS total")) return [[{ total: 1 }]];
      if (sql.includes("FROM agent_laoweng_runs WHERE")) return [[{ id: "run-1" }]];
      if (sql.includes("FROM project_memory_run_phases"))
        return [
          [
            {
              runId: "run-1",
              phase: "milestones",
              result: JSON.stringify({
                changes: [{ id: "p", action: "create", subject: "task", title: "任务" }],
                statusUpdated: false,
              }),
            },
          ],
        ];
      throw new Error("unexpected query");
    },
  };
  const history = await listMemoryJobHistory(db, "project-1", "project_memory");
  assert.equal(history.rows[0].projectPhases[0].changes[0].subject, "task");
  assert.equal(history.rows[0].projectPhases[0].changes[0].action, "create");
});

test("记忆运行历史按触发类型在服务端筛选", async () => {
  const calls = [];
  const db = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return [calls.length === 1 ? [{ total: 0 }] : []];
    },
  };
  await listMemoryJobHistory(db, "project-1", "document_memory", { trigger: "user" });
  assert.match(calls[0].sql, /trigger_source=\?/);
  assert.ok(calls[0].params.includes("user"));
  await assert.rejects(
    listMemoryJobHistory(db, "project-1", "document_memory", { trigger: "archive" }),
    /无效的触发类型/,
  );
  await assert.rejects(
    listMemoryJobHistory(db, "project-1", "document_memory", { status: "unknown" }),
    /无效的运行状态/,
  );
  await assert.rejects(
    listMemoryJobHistory(db, "project-1", "document_memory", { from: "2026/11/01" }),
    /无效的时间范围/,
  );
  await assert.rejects(
    listMemoryJobHistory(db, "project-1", "document_memory", {
      from: "2026-11-05",
      to: "2026-11-01",
    }),
    /开始日期不能晚于结束日期/,
  );
});
