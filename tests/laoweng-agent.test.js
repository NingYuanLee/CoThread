import { gzipSync } from "node:zlib";
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod/v3";
import { testDatabase } from "./database.js";

let database;
before(async () => {
  database = await testDatabase();
});
after(async () => {
  await database?.close();
});
afterEach(async () => {
  await database?.reset();
});
import { query } from "../server/db.ts";
import { Service } from "../server/service.ts";
import { runLaowengTask } from "../server/laoweng-agent.ts";
import { processNextProjectMemory } from "../server/project-memory.ts";
import {
  processNextLaowengContextCompression,
  queueLaowengContextCompression,
  readLaowengTaskSession,
} from "../server/laoweng-context.ts";

test("老翁 keeps a durable DSH session per maintenance agent and validates structured output", async () => {
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"],
    );
    const project = await new Service(database.db).createProject(user, { name: "老翁 DSH" });
    const sessionIds = [];
    const resumeSessions = [];
    const outputs = [
      JSON.stringify({ summary: "第一次" }),
      JSON.stringify({ summary: "第二次" }),
      JSON.stringify({ summary: "第三次" }),
    ];
    const options = {
      model: {
        baseUrl: "http://127.0.0.1:1/v1",
        apiKey: "test",
        model: "test",
        reasoningEffort: "medium",
      },
      createHarness: (harnessOptions) => ({
        async start() {},
        async run(_prompt, runOptions) {
          resumeSessions.push(harnessOptions.env.COTHREAD_RESUME_SESSION);
          sessionIds.push(runOptions.sessionId);
          runOptions.onNotification({
            method: "session.event",
            params: {
              sessionId: runOptions.sessionId,
              event: {
                type: "assistant/message",
                data: {
                  turn: 1,
                  step: 1,
                  usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 2 },
                },
              },
            },
          });
          return { finalResponse: outputs.shift() };
        },
        async close() {},
      }),
    };
    const schema = z.object({ summary: z.string() });
    assert.equal(
      (await runLaowengTask(database.db, project.id, "document_memory", {}, schema, options))
        .summary,
      "第一次",
    );
    assert.equal(
      (await runLaowengTask(database.db, project.id, "member_memory", {}, schema, options)).summary,
      "第二次",
    );
    assert.equal(
      (await runLaowengTask(database.db, project.id, "document_memory", {}, schema, options))
        .summary,
      "第三次",
    );
    assert.equal(sessionIds.length, 3);
    assert.notEqual(sessionIds[0], sessionIds[1]);
    assert.equal(sessionIds[0], sessionIds[2]);
    assert.deepEqual(resumeSessions, ["", "", sessionIds[0]]);
    const recorded = await query(
      database.db,
      "SELECT input_text,output_text,usage_stats,started_at,finished_at FROM agent_laoweng_session_turns WHERE project_id=? AND task='document_memory' ORDER BY started_at,id",
      [project.id],
    );
    assert.equal(recorded.length, 2);
    assert.ok(
      recorded.every(
        (turn) => turn.input_text && turn.output_text && turn.started_at && turn.finished_at,
      ),
    );
    const usage =
      typeof recorded[0].usage_stats === "string"
        ? JSON.parse(recorded[0].usage_stats)
        : recorded[0].usage_stats;
    assert.equal(usage.totalTokens, 16);
    assert.ok(usage.executionDurationMs >= 0);
    const savedView = await readLaowengTaskSession(
      new Service(database.db),
      user,
      project.id,
      "document_memory",
    );
    assert.equal(savedView.messages.filter((message) => message.role === "assistant").length, 2);
    assert.equal(savedView.messages.at(-1).usage.totalTokens, 16);
    const sessions = await query(
      database.db,
      "SELECT task,status,last_error,checkpoint IS NOT NULL has_checkpoint FROM agent_project_sessions WHERE project_id=? ORDER BY task",
      [project.id],
    );
    assert.deepEqual(
      sessions.map((row) => ({
        task: row.task,
        status: row.status,
        lastError: row.last_error,
        hasCheckpoint: Number(row.has_checkpoint),
      })),
      [
        { task: "document_memory", status: "idle", lastError: null, hasCheckpoint: 1 },
        { task: "member_memory", status: "idle", lastError: null, hasCheckpoint: 1 },
      ],
    );
    const monitor = await new Service(database.db).agentMonitor(user, project.id);
    assert.equal("provider" in monitor.models.knowledge, false);
    assert.equal(monitor.knowledge.sessions.length, 2);
    assert.equal(
      monitor.knowledge.sessions.find((item) => item.task === "document_memory").sessionId,
      sessionIds[0],
    );
    assert.equal(
      monitor.knowledge.sessions.find((item) => item.task === "member_memory").sessionId,
      sessionIds[1],
    );
    const logs = await new Service(database.db).agentLogs(user, "project", project.id, {
      task: "document_memory",
    });
    assert.ok(logs.events.every((event) => event.task === "document_memory"));
    assert.ok(
      logs.events.some((event) => event.tool === "model_run" && event.status === "completed"),
    );
    assert.ok(
      logs.events.some((event) => event.tool === "save_checkpoint" && event.status === "completed"),
    );
    assert.ok(logs.events.every((event) => !("input" in event) && !("output" in event)));
    // 每个阶段都带摘要：轨迹里能看出准备范围、会话、结论、校验、检查点各做了什么。
    assert.ok(logs.events.every((event) => String(event.preview || "").trim().length > 0));
    assert.match(
      logs.events.find((event) => event.tool === "prepare_context").preview,
      /范围：项目 · 任务：文档摘要/,
    );
    assert.match(
      logs.events.find((event) => event.tool === "start_harness").preview,
      /上下文 \d+ 词元/,
    );
    assert.match(
      logs.events.find((event) => event.tool === "model_run").preview,
      /结论：\{"summary"/,
    );
    assert.match(
      logs.events.find((event) => event.tool === "validate_result").preview,
      /校验通过 · summary/,
    );
    assert.match(
      logs.events.find((event) => event.tool === "save_checkpoint").preview,
      /检查点已保存 · 上下文 \d+ 词元/,
    );
    const memberLogs = await new Service(database.db).agentLogs(user, "project", project.id, {
      task: "member_memory",
    });
    assert.ok(memberLogs.events.every((event) => event.task === "member_memory"));
    assert.notEqual(memberLogs.events[0].id, logs.events[0].id);
  } finally {
  }
});

test("会话快照超过上限时重置维护会话，本次结果照常返回", async () => {
  const agentsRoot = await mkdtemp(join(tmpdir(), "laoweng-oversize-"));
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"],
    );
    const project = await new Service(database.db).createProject(user, { name: "快照上限" });
    const sessionIds = [];
    const options = {
      agentsRoot,
      checkpointLimitBytes: 1,
      model: {
        baseUrl: "http://127.0.0.1:1/v1",
        apiKey: "test",
        model: "test",
        reasoningEffort: "medium",
      },
      createHarness: () => ({
        async start() {},
        async run(_prompt, runOptions) {
          sessionIds.push(runOptions.sessionId);
          return { finalResponse: JSON.stringify({ summary: "已校验" }) };
        },
        async close() {},
      }),
    };
    const schema = z.object({ summary: z.string() });
    const first = await runLaowengTask(
      database.db,
      project.id,
      "project_memory",
      {},
      schema,
      options,
    );
    assert.equal(first.summary, "已校验", "快照存不下时本次已校验的结果仍应返回");
    const readSession = async () => {
      const [row] = await query(
        database.db,
        `SELECT session_id sessionId,checkpoint,status,context_stats contextStats
         FROM agent_project_sessions WHERE project_id=? AND task='project_memory'`,
        [project.id],
      );
      return row;
    };
    const rotated = await readSession();
    assert.notEqual(rotated.sessionId, sessionIds[0], "应换成新的维护会话");
    assert.equal(rotated.checkpoint, null);
    assert.equal(rotated.status, "idle");
    assert.equal(rotated.contextStats, null);
    const events = await query(
      database.db,
      `SELECT phase,summary FROM agent_project_events
       WHERE project_id=? AND task='project_memory' ORDER BY id`,
      [project.id],
    );
    assert.ok(
      events.some((event) => /已重置维护会话/.test(String(event.summary))),
      "轨迹里应说明会话已被重置",
    );
    // 下一次运行使用新会话，不再复用已经过大的那个。
    await runLaowengTask(database.db, project.id, "project_memory", {}, schema, options);
    assert.equal(sessionIds[1], rotated.sessionId);
  } finally {
    await rm(agentsRoot, { recursive: true, force: true });
  }
});

test("老翁 session view projects native DSH history and stays empty without a checkpoint", async () => {
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"],
    );
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "老翁 会话" });
    const empty = await readLaowengTaskSession(service, user, project.id, "member_memory");
    assert.equal(empty.messages.length, 0);
    assert.equal(empty.error, null);
    const checkpoint = gzipSync(
      JSON.stringify({
        "_cothread_context.json": Buffer.from(
          JSON.stringify([
            { role: "user", content: [{ type: "text", text: "整理成员发言" }] },
            { role: "assistant", content: [{ type: "text", text: "已更新认识" }] },
          ]),
        ).toString("base64"),
      }),
    );
    await query(
      database.db,
      `INSERT INTO agent_project_sessions
      (id,project_id,task,thread_id,scope_id,session_id,checkpoint) VALUES(?,?,?,?,?,?,?)`,
      [randomUUID(), project.id, "member_memory", null, project.id, randomUUID(), checkpoint],
    );
    const view = await readLaowengTaskSession(service, user, project.id, "member_memory");
    assert.deepEqual(
      view.messages.map((row) => row.text),
      ["整理成员发言", "已更新认识"],
    );
    assert.equal(view.running, false);
    const jsonlId = randomUUID();
    const jsonl = [
      JSON.stringify({
        type: "session",
        version: 0,
        id: jsonlId,
        createdAt: 1,
        cwd: "/tmp",
        delegationDepth: 0,
      }),
      JSON.stringify({
        type: "user/message",
        seq: 0,
        data: { role: "user", content: [{ type: "text", text: "文档摘要任务" }] },
      }),
      JSON.stringify({
        type: "assistant/message",
        seq: 1,
        data: { message: { content: [{ type: "text", text: "已生成摘要" }] } },
      }),
    ].join("\n");
    await query(
      database.db,
      `INSERT INTO agent_project_sessions
      (id,project_id,task,thread_id,scope_id,session_id,checkpoint) VALUES(?,?,?,?,?,?,?)`,
      [
        randomUUID(),
        project.id,
        "document_memory",
        null,
        project.id,
        jsonlId,
        gzipSync(
          JSON.stringify({
            [`--tmp--/${jsonlId}/session.jsonl`]: Buffer.from(jsonl).toString("base64"),
          }),
        ),
      ],
    );
    const fromLog = await readLaowengTaskSession(service, user, project.id, "document_memory");
    assert.deepEqual(
      fromLog.messages.map((row) => row.text),
      ["文档摘要任务", "已生成摘要"],
    );
  } finally {
  }
});

test("归档后的旧记忆作业退出，项目现状由项目进程作业维护", async () => {
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"],
    );
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "长期记忆" });
    const first = await service.createThread(user, project.id, { title: "第一轮" });
    const second = await service.createThread(user, project.id, { title: "第二轮" });
    await service.archive(user, first.id, { conclusion: "确定采用方案 A" });
    await service.archive(user, second.id, { conclusion: "方案 A 已上线，下一步做推广" });
    for (const target of [first, second]) {
      await processNextProjectMemory(database.db, {
        projectId: project.id,
        task: "iteration_archive",
        summarizeArchive: async (context) => ({
          conclusion:
            context.thread.id === first.id ? "确定采用方案 A" : "方案 A 已上线，下一步做推广",
          taskDecisions: [],
          notes: "",
          nextIteration: { title: "", background: "", goal: "" },
        }),
      });
      const workflow = await service.readArchiveWorkflow(user, target.id);
      await service.confirmIterationArchive(user, target.id, {
        ...workflow,
        workflowId: workflow.id,
        createNextIteration: false,
      });
    }
    const sessionIds = [];
    const outputs = [
      JSON.stringify({ summary: "项目总结：确定采用方案 A" }),
      JSON.stringify({ summary: "项目总结：方案 A 已上线，下一步做推广" }),
      JSON.stringify({ summary: "第一轮补充总结" }),
    ];
    const laowengOptions = {
      model: {
        baseUrl: "http://127.0.0.1:1/v1",
        apiKey: "test",
        model: "test",
        reasoningEffort: "medium",
      },
      createHarness: () => ({
        async start() {},
        async run(_prompt, runOptions) {
          sessionIds.push(runOptions.sessionId);
          return { finalResponse: outputs.shift() };
        },
        async close() {},
      }),
    };
    assert.equal(
      await processNextProjectMemory(database.db, {
        projectId: project.id,
        task: "iteration_archive",
        laowengOptions,
      }),
      true,
    );
    assert.equal(
      await processNextProjectMemory(database.db, {
        projectId: project.id,
        task: "iteration_archive",
        laowengOptions,
      }),
      true,
    );
    const stored = await service.project(user, project.id);
    // 占位节点不将归档内容当作已核实的项目现状，也不写旧缓存。
    assert.equal(stored.longTermSummary, null);
    const summaries = await query(
      database.db,
      "SELECT summary FROM agent_project_summaries WHERE project_id=?",
      [project.id],
    );
    assert.equal(summaries.length, 0);
    // 直接排队，避免 queueLaowengMemoryRun 同步 kick 真实维护把 mock harness 绕开。
    await query(
      database.db,
      `INSERT INTO agent_laoweng_runs(id,project_id,thread_id,task,trigger_source,requested_by,status)
      VALUES(?,?,?,'iteration_archive','user',?,'queued')`,
      [randomUUID(), project.id, first.id, user.id],
    );
    assert.equal(
      await processNextProjectMemory(database.db, {
        projectId: project.id,
        task: "iteration_archive",
        laowengOptions,
      }),
      true,
    );
    assert.equal(sessionIds.length, 0, "归档后不再调用旧总结模型");
    const runs = await query(
      database.db,
      "SELECT result FROM agent_laoweng_runs WHERE project_id=? AND task='iteration_archive' AND (archive_phase IS NULL OR archive_phase='memory') AND status='completed'",
      [project.id],
    );
    assert.ok(runs.length >= 3);
    assert.ok(
      runs.every((run) => {
        const result = typeof run.result === "string" ? JSON.parse(run.result) : run.result;
        return result?.discarded && result.reason === "归档后的现状由项目进程作业维护";
      }),
    );
    const monitor = await service.agentMonitor(user, project.id);
    assert.equal(monitor.knowledge.archives.length, 2);
  } finally {
  }
});

test("老翁 auto-compacts resident context at 900K and accepts a manual compact", async () => {
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"],
    );
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "老翁 压缩" });
    const compactCalls = [];
    const laowengOptions = {
      model: {
        baseUrl: "http://127.0.0.1:1/v1",
        apiKey: "test",
        model: "test",
        reasoningEffort: "medium",
      },
      createHarness: () => ({
        client: {
          async request(method, params) {
            if (method === "cothread/context")
              return {
                used: 910000,
                estimated: false,
                categories: {},
                measuredAt: new Date().toISOString(),
              };
            if (method === "cothread/compact") {
              compactCalls.push(params);
              return { before: 910000, after: 12000, changed: true };
            }
            return {};
          },
        },
        async start() {},
        async run() {
          return { finalResponse: JSON.stringify({ summary: "整理" }) };
        },
        async close() {},
      }),
    };
    const schema = z.object({ summary: z.string() });
    await runLaowengTask(database.db, project.id, "member_memory", {}, schema, laowengOptions);
    assert.equal(compactCalls.length, 1);
    assert.equal(compactCalls[0].automatic, true);
    const queued = await queueLaowengContextCompression(service, user, project.id, "member_memory");
    assert.equal(queued.status, "queued");
    assert.equal(
      await processNextLaowengContextCompression(database.db, {
        projectId: project.id,
        laowengOptions,
      }),
      true,
    );
    assert.equal(compactCalls.at(-1).automatic, false);
    const [session] = await query(
      database.db,
      "SELECT compact_status FROM agent_project_sessions WHERE project_id=? AND task='member_memory'",
      [project.id],
    );
    assert.equal(session.compact_status, "completed");
    const monitor = await service.agentMonitor(user, project.id);
    assert.equal(
      monitor.knowledge.sessions.find((item) => item.task === "member_memory").contextUsage
        .compactStatus,
      "completed",
    );
  } finally {
  }
});

test("老翁 resumes the on-disk session log when the checkpoint was never saved", async () => {
  const user = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [user.id, `${user.id}@test.com`, "负责人"],
  );
  const project = await new Service(database.db).createProject(user, { name: "老翁 会话恢复" });
  const sessionIds = [];
  const resumeSessions = [];
  const options = {
    model: {
      baseUrl: "http://127.0.0.1:1/v1",
      apiKey: "test",
      model: "test",
      reasoningEffort: "medium",
    },
    createHarness: (harnessOptions) => ({
      async start() {},
      async run(_prompt, runOptions) {
        resumeSessions.push(harnessOptions.env.COTHREAD_RESUME_SESSION);
        sessionIds.push(runOptions.sessionId);
        return { finalResponse: JSON.stringify({ summary: "ok" }) };
      },
      async close() {},
    }),
  };
  const schema = z.object({ summary: z.string() });
  const home = resolve(".local/agents", `laoweng-document_memory-${project.id}`);
  try {
    await runLaowengTask(database.db, project.id, "document_memory", {}, schema, options);
    // 运行留下了会话日志，但快照没落库：磁盘上仍占着这个 id，
    // 下一次若按“无快照就新建”处理就会一直报 session already exists。
    const logDir = join(home, "sessions", "resume-home", sessionIds[0]);
    await mkdir(logDir, { recursive: true });
    await writeFile(join(logDir, "session.v4.jsonl"), "{}\n");
    await query(
      database.db,
      "UPDATE agent_project_sessions SET checkpoint=NULL WHERE project_id=? AND task='document_memory'",
      [project.id],
    );
    await runLaowengTask(database.db, project.id, "document_memory", {}, schema, options);
    assert.equal(sessionIds[0], sessionIds[1]);
    assert.deepEqual(resumeSessions, ["", sessionIds[0]]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("老翁 repairs a stray closing brace instead of failing the whole run", async () => {
  const user = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [user.id, `${user.id}@test.com`, "负责人"],
  );
  const project = await new Service(database.db).createProject(user, { name: "老翁 JSON 修复" });
  const options = {
    model: {
      baseUrl: "http://127.0.0.1:1/v1",
      apiKey: "test",
      model: "test",
      reasoningEffort: "medium",
    },
    createHarness: () => ({
      async start() {},
      async run() {
        // 线上样本：模型在首字段后多写了一个 }，然后继续写其余字段。
        return { finalResponse: '{"summary":"修好了"},"extra":"多余内容"}' };
      },
      async close() {},
    }),
  };
  const schema = z.object({ summary: z.string() });
  const result = await runLaowengTask(
    database.db,
    project.id,
    "document_memory",
    {},
    schema,
    options,
  );
  assert.equal(result.summary, "修好了");
});
