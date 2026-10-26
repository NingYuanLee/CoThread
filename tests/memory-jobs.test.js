import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { MEMORY_JOBS, MEMORY_JOB_KEYS } from "../shared/memory-jobs.js";
import {
  listMemoryJobs,
  resetMemoryJobSettings,
  updateMemoryJobSettings,
} from "../server/memory-jobs.js";
import {
  maybeQueueProjectMemoryRun,
  queueProjectMemoryRun,
  retryMemoryJob,
} from "../server/project-memory.js";
import { LAOWENG_MAINTENANCE_TASKS } from "../shared/agent-label.js";

test("五类记忆作业口径完整，有队列的键已注册为维护任务", () => {
  assert.equal(MEMORY_JOBS.length, 5);
  assert.deepEqual([...MEMORY_JOB_KEYS].sort(), [
    "discussion_memory",
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
    assert.equal(jobs.length, 5);
    const discussion = jobs.find((job) => job.key === "discussion_memory");
    assert.equal(discussion.archivedThread?.id, threadId);
    assert.equal(jobs.find((job) => job.key === "task_memory").archivedThread, null);
    const member = jobs.find((job) => job.key === "member_memory");
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

test("重试按作业分派，无独立队列的作业拒绝", async () => {
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
    await assert.rejects(
      retryMemoryJob(service, owner, project.id, "discussion_memory"),
      /还没有已归档的迭代/,
    );
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
