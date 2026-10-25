import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  distributionStats,
  formatDuration,
  importantTasks,
  loadTaskMemoryStats,
  taskDistributionMarkdown,
  syncTaskMemory,
  taskMemoryMarkdown,
} from "../server/task-memory.js";

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
  const project = await service.createProject(owner, { name: "任务记忆项目" });
  return { database, db, owner, project };
}

async function insertTask(db, projectId, userId, overrides = {}) {
  const id = overrides.id || randomUUID();
  const task = {
    title: "任务",
    goal: "目标",
    status: "completed",
    taskType: "formal",
    executionAgentType: "child_agent",
    retryCount: 0,
    revision: 1,
    createdAt: "2026-10-25 01:00:00.000",
    finishedAt: "2026-10-25 01:10:00.000",
    ...overrides,
  };
  await query(
    db,
    "INSERT INTO agent_tasks(id,project_id,created_by_type,created_by_id,task_type,title,goal,status,execution_agent_type,retry_count,revision,created_at,finished_at) VALUES(?,?,'human_member',?,?,?,?,?,?,?,?,?,?)",
    [
      id,
      projectId,
      userId,
      task.taskType,
      task.title,
      task.goal,
      task.status,
      task.executionAgentType,
      task.retryCount,
      task.revision,
      task.createdAt,
      task.finishedAt,
    ],
  );
  return id;
}

async function insertRun(
  db,
  taskId,
  { status = "completed", error = null, startedAt, finishedAt, executorType = "child_agent" } = {},
) {
  await query(
    db,
    "INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status,error,started_at,finished_at) VALUES(?,?,1,?,?,?,?,?)",
    [randomUUID(), taskId, executorType, status, error, startedAt, finishedAt],
  );
}

test("聚合耗时、重试与返工", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const hard = await insertTask(db, project.id, owner.id, {
      title: "很硬的任务",
      status: "failed",
      retryCount: 2,
      revision: 3,
      createdAt: "2026-10-25 01:00:00.000",
      finishedAt: "2026-10-25 03:00:00.000",
    });
    await insertRun(db, hard, {
      status: "failed",
      error: "  sandbox timeout  ",
      startedAt: "2026-10-25 01:00:00.000",
      finishedAt: "2026-10-25 02:00:00.000",
    });
    await insertRun(db, hard, {
      status: "completed",
      startedAt: "2026-10-25 02:00:00.000",
      finishedAt: "2026-10-25 03:00:00.000",
    });
    const easy = await insertTask(db, project.id, owner.id, {
      title: "顺利的任务",
      taskType: "assist",
    });

    const stats = await loadTaskMemoryStats(db, project.id);
    assert.equal(stats.length, 2);
    const hardStat = stats.find((item) => item.id === hard);
    assert.equal(hardStat.runCount, 2);
    assert.equal(hardStat.failedRuns, 1);
    assert.equal(hardStat.reworked, true);
    assert.equal(hardStat.durationMs, 2 * 60 * 60 * 1000);
    assert.deepEqual(hardStat.errors, ["sandbox timeout"]);
    assert.equal(formatDuration(hardStat.durationMs), "2 小时 0 分钟");
    assert.equal(hardStat.executorLabel, "子 Agent");

    const easyStat = stats.find((item) => item.id === easy);
    assert.equal(easyStat.reworked, false);

    const important = importantTasks(stats);
    assert.deepEqual(
      important.map((item) => item.id),
      [hard],
    );

    const dist = distributionStats(stats);
    assert.equal(dist.total, 2);
    assert.equal(dist.byStatus.completed, 1);
    assert.equal(dist.byStatus.failed, 1);
    assert.equal(dist.byExecutor.child_agent, 2);

    const markdown = taskMemoryMarkdown(hardStat);
    for (const section of [
      "## 目标与约束",
      "## 决策",
      "## 结果",
      "## 失败与重试",
      "## 坑与成本",
      "## 返工",
    ])
      assert.ok(markdown.includes(section), section);
    assert.ok(markdown.includes("sandbox timeout"));
    assert.ok(taskDistributionMarkdown(stats).includes("## 总量与分布"));
  } finally {
    await database.close();
  }
});

test("人类任务与子 Agent 任务分开计数", async () => {
  const { database, db, owner, project } = await setup();
  try {
    await insertTask(db, project.id, owner.id, {
      title: "人类任务",
      executionAgentType: "human_self",
      taskType: "formal",
    });
    const stats = await loadTaskMemoryStats(db, project.id);
    const dist = distributionStats(stats);
    assert.equal(dist.byExecutor.human, 1);
    assert.equal(dist.byExecutor.child_agent, 0);
  } finally {
    await database.close();
  }
});

test("确定性写入：任务分布与重要任务成条，重复调用不重复建条", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const hard = await insertTask(db, project.id, owner.id, {
      title: "很硬的任务",
      status: "failed",
      retryCount: 2,
      revision: 3,
      createdAt: "2026-10-25 01:00:00.000",
      finishedAt: "2026-10-25 02:00:00.000",
    });
    const easy = await insertTask(db, project.id, owner.id, {
      title: "普通任务",
      status: "completed",
      taskType: "assist",
      createdAt: "2026-10-25 01:00:00.000",
      finishedAt: "2026-10-25 01:01:00.000",
    });
    const result = await syncTaskMemory(db, { projectId: project.id, createdBy: owner.id });
    assert.ok(result.distributionId);
    assert.equal(result.taskCount, 1);
    const pages = await query(
      db,
      "SELECT id,title,subject_type subjectType FROM wiki_pages WHERE project_id=?",
      [project.id],
    );
    assert.ok(pages.some((page) => page.title === "任务分布" && page.subjectType === "task"));
    assert.ok(
      pages.some((page) => page.title === "任务：很硬的任务" && page.subjectType === "task"),
    );
    assert.ok(!pages.some((page) => page.title === "任务：普通任务"), "普通任务并入分布，不单列");
    const [hardPage] = await query(db, "SELECT id FROM wiki_pages WHERE project_id=? AND title=?", [
      project.id,
      "任务：很硬的任务",
    ]);
    const sources = await query(
      db,
      "SELECT source_kind sourceKind,source_id sourceId FROM wiki_page_sources WHERE page_id=?",
      [hardPage.id],
    );
    assert.equal(sources.length, 1);
    assert.equal(sources[0].sourceKind, "task");
    assert.equal(sources[0].sourceId, hard);
    await syncTaskMemory(db, { projectId: project.id, createdBy: owner.id });
    const [again] = await query(
      db,
      "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=? AND title='任务分布'",
      [project.id],
    );
    assert.equal(Number(again.count), 1);
    assert.ok(easy);
  } finally {
    await database.close();
  }
});
