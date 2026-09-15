import { gzipSync } from "node:zlib";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { runL1Task } from "../server/l1-agent.js";
import { processNextProjectMemory, queueL1MemoryRun } from "../server/project-memory.js";
import { processNextL1ContextCompression, queueL1ContextCompression, readL1TaskSession } from "../server/l1-context.js";

test("L1 keeps a durable DSH session per maintenance agent and validates structured output", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const project = await new Service(database.db).createProject(user, { name: "L1 DSH" });
    const sessionIds = [];
    const outputs = [
      JSON.stringify({ summary: "第一次" }),
      JSON.stringify({ summary: "第二次" }),
      JSON.stringify({ summary: "第三次" }),
    ];
    const options = {
      model: { baseUrl: "http://127.0.0.1:1/v1", apiKey: "test",
        model: "test", reasoningEffort: "medium" },
      createHarness: () => ({
        async start() {},
        async run(_prompt, runOptions) {
          sessionIds.push(runOptions.sessionId);
          return { finalResponse: outputs.shift() };
        },
        async close() {},
      }),
    };
    const schema = z.object({ summary: z.string() });
    assert.equal((await runL1Task(database.db, project.id, "document_memory", {}, schema, options)).summary, "第一次");
    assert.equal((await runL1Task(database.db, project.id, "member_memory", {}, schema, options)).summary, "第二次");
    assert.equal((await runL1Task(database.db, project.id, "document_memory", {}, schema, options)).summary, "第三次");
    assert.equal(sessionIds.length, 3);
    assert.notEqual(sessionIds[0], sessionIds[1]);
    assert.equal(sessionIds[0], sessionIds[2]);
    const sessions = await query(database.db,
      "SELECT task,status,last_error,checkpoint IS NOT NULL has_checkpoint FROM agent_project_sessions WHERE project_id=? ORDER BY task",
      [project.id]);
    assert.deepEqual(sessions.map((row) => ({ task: row.task, status: row.status,
      lastError: row.last_error, hasCheckpoint: Number(row.has_checkpoint) })), [
      { task: "document_memory", status: "idle", lastError: null, hasCheckpoint: 1 },
      { task: "member_memory", status: "idle", lastError: null, hasCheckpoint: 1 },
    ]);
    const monitor = await new Service(database.db).agentMonitor(user, project.id);
    assert.equal("provider" in monitor.models.knowledge, false);
    assert.equal(monitor.knowledge.sessions.length, 2);
    assert.equal(monitor.knowledge.sessions.find((item) => item.task === "document_memory").sessionId, sessionIds[0]);
    assert.equal(monitor.knowledge.sessions.find((item) => item.task === "member_memory").sessionId, sessionIds[1]);
    const logs = await new Service(database.db).agentLogs(user, "project", project.id, { task: "document_memory" });
    assert.ok(logs.events.every((event) => event.task === "document_memory"));
    assert.ok(logs.events.some((event) => event.tool === "model_run" && event.status === "completed"));
    assert.ok(logs.events.some((event) => event.tool === "save_checkpoint" && event.status === "completed"));
    assert.ok(logs.events.every((event) => !("input" in event) && !("output" in event)));
    const memberLogs = await new Service(database.db).agentLogs(user, "project", project.id, { task: "member_memory" });
    assert.ok(memberLogs.events.every((event) => event.task === "member_memory"));
    assert.notEqual(memberLogs.events[0].id, logs.events[0].id);
  } finally {
    await database.close();
  }
});

test("L1 session view projects native DSH history and stays empty without a checkpoint", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "L1 会话" });
    const empty = await readL1TaskSession(service, user, project.id, "member_memory");
    assert.equal(empty.messages.length, 0);
    assert.equal(empty.error, null);
    const checkpoint = gzipSync(JSON.stringify({
      "_cothread_context.json": Buffer.from(JSON.stringify([
        { role: "user", content: [{ type: "text", text: "整理成员发言" }] },
        { role: "assistant", content: [{ type: "text", text: "已更新认识" }] },
      ])).toString("base64"),
    }));
    await query(database.db, `INSERT INTO agent_project_sessions
      (id,project_id,task,thread_id,scope_id,session_id,checkpoint) VALUES(?,?,?,?,?,?,?)`,
      [randomUUID(), project.id, "member_memory", null, project.id, randomUUID(), checkpoint]);
    const view = await readL1TaskSession(service, user, project.id, "member_memory");
    assert.deepEqual(view.messages.map((row) => row.text), ["整理成员发言", "已更新认识"]);
    assert.equal(view.running, false);
  } finally {
    await database.close();
  }
});

test("iteration archive reuses one L1 session per project and updates project long-term memory", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "长期记忆" });
    const first = await service.createThread(user, project.id, { title: "第一轮" });
    const second = await service.createThread(user, project.id, { title: "第二轮" });
    await service.archive(user, first.id, { conclusion: "确定采用方案 A" });
    await service.archive(user, second.id, { conclusion: "方案 A 已上线，下一步做推广" });
    const sessionIds = [];
    const outputs = [
      JSON.stringify({ summary: "项目总结：确定采用方案 A" }),
      JSON.stringify({ summary: "项目总结：方案 A 已上线，下一步做推广" }),
      JSON.stringify({ summary: "第一轮补充总结" }),
    ];
    const l1Options = {
      model: { baseUrl: "http://127.0.0.1:1/v1", apiKey: "test", model: "test", reasoningEffort: "medium" },
      createHarness: () => ({
        async start() {},
        async run(_prompt, runOptions) {
          sessionIds.push(runOptions.sessionId);
          return { finalResponse: outputs.shift() };
        },
        async close() {},
      }),
    };
    assert.equal(await processNextProjectMemory(database.db, { projectId: project.id, task: "iteration_archive", l1Options }), true);
    assert.equal(await processNextProjectMemory(database.db, { projectId: project.id, task: "iteration_archive", l1Options }), true);
    const stored = await service.project(user, project.id);
    assert.equal(stored.longTermSummary.summary, "项目总结：方案 A 已上线，下一步做推广");
    assert.equal(stored.longTermSummary.lastThreadTitle, "第二轮");
    await queueL1MemoryRun(service, user, { projectId: project.id, task: "iteration_archive", threadId: first.id });
    assert.equal(await processNextProjectMemory(database.db, { projectId: project.id, task: "iteration_archive", l1Options }), true);
    assert.equal(sessionIds.length, 3);
    assert.equal(sessionIds[0], sessionIds[1]);
    assert.equal(sessionIds[2], sessionIds[0]);
    const sessions = await query(database.db,
      "SELECT task,thread_id,session_id FROM agent_project_sessions WHERE project_id=? AND task='iteration_archive'",
      [project.id]);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].thread_id, null);
    const logs = await service.agentLogs(user, "project", project.id, { task: "iteration_archive" });
    assert.ok(logs.title.includes("迭代归档"));
    assert.ok(logs.events.every((event) => event.task === "iteration_archive"));
    assert.ok(logs.events.filter((event) => event.tool === "prepare_context").length >= 3);
    const monitor = await service.agentMonitor(user, project.id);
    assert.equal(monitor.knowledge.archives.length, 2);
    assert.ok(monitor.knowledge.archives.every((item) => item.contextUsage));
  } finally {
    await database.close();
  }
});

test("L1 auto-compacts resident context at 900K and accepts a manual compact", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "L1 压缩" });
    const compactCalls = [];
    const l1Options = {
      model: { baseUrl: "http://127.0.0.1:1/v1", apiKey: "test", model: "test", reasoningEffort: "medium" },
      createHarness: () => ({
        client: {
          async request(method, params) {
            if (method === "cothread/context")
              return { used: 910000, estimated: false, categories: {}, measuredAt: new Date().toISOString() };
            if (method === "cothread/compact") {
              compactCalls.push(params);
              return { before: 910000, after: 12000, changed: true };
            }
            return {};
          },
        },
        async start() {},
        async run() { return { finalResponse: JSON.stringify({ summary: "整理" }) }; },
        async close() {},
      }),
    };
    const schema = z.object({ summary: z.string() });
    await runL1Task(database.db, project.id, "member_memory", {}, schema, l1Options);
    assert.equal(compactCalls.length, 1);
    assert.equal(compactCalls[0].automatic, true);
    const queued = await queueL1ContextCompression(service, user, project.id, "member_memory");
    assert.equal(queued.status, "queued");
    assert.equal(await processNextL1ContextCompression(database.db, {
      projectId: project.id, l1Options,
    }), true);
    assert.equal(compactCalls.at(-1).automatic, false);
    const [session] = await query(database.db,
      "SELECT compact_status FROM agent_project_sessions WHERE project_id=? AND task='member_memory'",
      [project.id]);
    assert.equal(session.compact_status, "completed");
    const monitor = await service.agentMonitor(user, project.id);
    assert.equal(monitor.knowledge.sessions.find((item) => item.task === "member_memory").contextUsage.compactStatus, "completed");
  } finally {
    await database.close();
  }
});
