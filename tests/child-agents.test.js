import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { claimReply, MAX_THREAD_AGENTS } from "../server/reply-dispatch.js";
import { processNextReply } from "../server/replies.js";
import { runMakersThread } from "../server/makers-runner.js";
import { openAgentRuntime, stopAgent } from "../server/agent.js";
import { acquireSandbox, releaseSandbox } from "../server/agent-sandbox.js";
import { agentSession } from "../server/agent-session.js";
import { processNextL3ContextCompression, queueL3ContextCompression } from "../server/l3-context.js";
import { deliverTaskUpdates } from "../server/agent-updates.js";
import { pendingMessages } from "../shared/context.js";
import { processNextCoordinator } from "../server/coordinator.js";
import { subscribeWork } from "../server/work-events.js";

let database, db, service;
before(async () => { database = await testDatabase(); db = database.db; service = new Service(db); });
after(async () => { await database?.close(); });

async function fixture(count = 2) {
  const users = Array.from({ length: count }, () => ({ id: randomUUID(), kind: "session" }));
  for (const user of users) await query(db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [user.id, `${user.id}@test.com`, user.id, "unused"]);
  const project = await service.createProject(users[0], { name: "Concurrent Agents" });
  for (const user of users.slice(1)) await query(db,
    "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [project.id, user.id]);
  const thread = await service.createThread(users[0], project.id, { title: "Parallel requests" });
  return { users, project, thread, post: (index, body = "@小祥 请处理") => service.postMessage(users[index], thread.id, { body }) };
}

test("L3 DSH context is keyed by task while the sandbox stays per task", () => {
  const threadId = "thread-a";
  const l2 = agentSession({ thread_id: threadId });
  assert.equal(l2.kind, "l2");
  assert.equal(l2.id, threadId);
  const first = agentSession({
    thread_id: threadId, parent_message_id: "task-1", agent_slot: 3, message_id: "task-1",
  });
  const second = agentSession({
    thread_id: threadId, parent_message_id: "task-2", agent_slot: 3, message_id: "task-2",
  });
  assert.equal(first.kind, "l3");
  assert.equal(first.homeId, "task-1");
  assert.notEqual(first.homeId, second.homeId);
  assert.equal(first.workspaceId, "task-1");
  assert.equal(second.workspaceId, "task-2");
});

test("committed member messages wake workers while rolled-back submissions do not", async () => {
  const { users, thread, post } = await fixture();
  const events = [];
  const stop = subscribeWork(db, (id) => events.push(id));
  try {
    await post(0);
    assert.deepEqual(events, [thread.id]);
    await assert.rejects(service.postMessage(users[0], thread.id, { body: "invalid reference", refs: [randomUUID()] }));
    assert.deepEqual(events, [thread.id]);
  } finally { stop(); }
});

test("seven execution slots are atomic and same-member mentions update one task", async () => {
  const { users, thread, post } = await fixture(10);
  const first = await post(0);
  const addition = await post(0, "@小祥 改用方案 B");
  assert.equal(addition.updatedTaskId, first.id);
  const main = await claimReply(db, thread.id);
  assert.equal(main.parent_message_id, first.id);
  assert.equal(main.agent_slot, 1);
  const live = await post(0, "@小祥 再补充验收条件");
  assert.equal(live.updatedTaskId, main.message_id);
  assert.equal(await claimReply(db, thread.id), undefined);
  for (let index = 1; index < users.length; index++) await post(index);
  // Separate callers race on the same discussion, and losers can retry.
  const claimed = (await Promise.all(Array.from({ length: 12 }, () => claimReply(db, thread.id)))).filter(Boolean);
  let next;
  while ((next = await claimReply(db, thread.id))) claimed.push(next);
  assert.equal(claimed.length, MAX_THREAD_AGENTS - 1);
  assert.ok(claimed.every((job) => job.parent_message_id === job.message_id));
  assert.equal(new Set(claimed.map((job) => job.author_id)).size, MAX_THREAD_AGENTS - 1);
  assert.deepEqual([main, ...claimed].map((job) => job.agent_slot).sort(),
    Array.from({ length: MAX_THREAD_AGENTS }, (_, index) => index + 1));
  assert.equal(await claimReply(db, thread.id), undefined);
  const child = claimed[0];
  const childUpdate = await service.postMessage({ id: child.author_id, kind: "session" }, thread.id, { body: "@小祥 更新子任务" });
  assert.equal(childUpdate.updatedTaskId, child.message_id);
  await query(db, "UPDATE assistant_replies SET status='cancelled' WHERE message_id=?", [child.message_id]);
  assert.equal(await claimReply(db, thread.id), undefined, "shutdown still occupies its slot");
  await query(db, "UPDATE assistant_replies SET execution_active=FALSE WHERE message_id=?", [child.message_id]);
  assert.ok(await claimReply(db, thread.id));
  await assert.rejects(service.archive(users[0], thread.id, { conclusion: "still busy" }), { status: 409 });
});

test("project monitor reports knowledge, coordinators and isolated execution slots", async () => {
  const { users, project, thread, post } = await fixture();
  const task = await post(0, "@小祥 检查监控面板");
  const claimed = await claimReply(db, thread.id);
  assert.equal(claimed.message_id, task.id);

  const monitor = await service.agentMonitor(users[0], project.id);
  assert.ok(monitor.knowledge.memberPending >= 1);
  assert.ok(Array.isArray(monitor.knowledge.organizationJobs));
  assert.ok(Array.isArray(monitor.knowledge.archives));
  assert.equal(monitor.coordinators.find((item) => item.id === thread.id).active_executors, 1);
  assert.ok(monitor.coordinators.find((item) => item.id === thread.id).contextUsage);
  assert.equal(monitor.executors.find((item) => item.task_id === task.id).agent_slot, 1);
  assert.equal(monitor.executors.find((item) => item.task_id === task.id).execution_active, 1);

  const l2SessionId = randomUUID();
  const childSessionId = randomUUID();
  await query(db, "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?) ON DUPLICATE KEY UPDATE session_id=VALUES(session_id)", [thread.id, l2SessionId]);
  await query(db, `INSERT INTO agent_events(message_id,agent_session_id,tool,status,input,output,finished_at)
    VALUES(?,?,'list_agents','completed','{\"scope\":\"children\"}','private raw output',UTC_TIMESTAMP(3)),
      (?,?,'sandbox_command','failed','{\"command\":\"contains a secret\"}','secret output',UTC_TIMESTAMP(3))`,
  [task.id, l2SessionId, task.id, childSessionId]);
  const logged = await service.agentMonitor(users[0], project.id);
  const l2Log = logged.eventLog.find((event) => event.tool === "list_agents");
  const l3Log = logged.eventLog.find((event) => event.tool === "sandbox_command" && event.agent_session_id === childSessionId);
  assert.equal(l2Log.agent_type, "l2");
  assert.equal(l2Log.action, "查看 AgentTeam children");
  assert.equal(l3Log.agent_type, "dsh_l3");
  assert.equal(l3Log.status, "failed");
  assert.ok(l3Log.duration_ms >= 0);
  assert.equal("input" in l3Log, false);
  assert.equal("output" in l3Log, false);

  await assert.rejects(service.agentMonitor({ id: randomUUID(), kind: "session" }, project.id), { status: 403 });
});

test("a hosted owner picks up another member while the main request is still running", { timeout: 20000 }, async () => {
  const { users, thread, post } = await fixture();
  const first = await post(0);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), childDone = Promise.withResolvers();
  const operations = {
    reply: (id) => processNextReply(db, async (_context, { job }) => {
      if (job.message_id === first.id) { entered.resolve(); await release.promise; }
      else { assert.equal(job.parent_message_id, job.message_id); childDone.resolve(); }
      return "finished " + job.message_id;
    }, undefined, id), compress: async () => false, coordinate: async () => false,
  };
  const running = runMakersThread(db, users[0], thread.id, undefined, operations);
  void running.catch(entered.reject);
  await entered.promise;
  try {
    await post(1);
    assert.equal((await runMakersThread(db, users[1], thread.id, undefined, operations)).status, "running");
    await childDone.promise;
    assert.equal((await query(db, "SELECT status FROM assistant_replies WHERE message_id=?", [first.id]))[0].status, "running");
  } finally { release.resolve(); await running; }
  const context = await service.context(users[0], thread.id);
  assert.equal(context.replies.length, 2);
  assert.ok(context.replies.every((reply) => reply.status === "completed"));
  const childReply = context.replies.find((reply) => reply.message_id !== first.id);
  assert.ok(pendingMessages(context.messages, 0, context.replies).some((m) => m.id === childReply.reply_id));
});

test("late same-member corrections update the running task before one final reply is committed", async () => {
  const { users, thread, post } = await fixture();
  const first = await post(0);
  let invocations = 0;
  await processNextReply(db, async (context, { job }) => {
    invocations++;
    assert.equal(job.message_id, first.id);
    if (invocations === 1) {
      const update = await post(0, "@小祥 使用新要求");
      assert.equal(update.updatedTaskId, first.id);
      return "obsolete answer";
    }
    assert.equal(context.messages.at(-1).body, "@小祥 使用新要求");
    return "updated answer";
  }, undefined, thread.id);
  const context = await service.context(users[0], thread.id);
  assert.equal(invocations, 2);
  assert.equal(context.replies.length, 1);
  assert.deepEqual(context.messages.filter((m) => m.source === "assistant").map((m) => m.body), ["updated answer"]);
  assert.ok(context.updates[0].delivered_at);
  assert.equal((await post(0, "@小祥 一个新任务")).updatedTaskId, undefined);
});

test("runtime checkpoints, sandboxes, steering and stop stay scoped to the child task", async () => {
  const { users, thread, post } = await fixture();
  await post(0);
  const main = await claimReply(db, thread.id);
  // Force the first claimed job onto the L2 discussion session for this isolation check.
  main.parent_message_id = null;
  await post(1);
  const child = await claimReply(db, thread.id);
  const made = [], closed = [], killed = [];
  const createHarness = (options) => {
    made.push(options);
    return { start: async () => {}, close: async () => { closed.push(options.dshHome); },
      client: { request: async () => ({ used: 12, categories: {}, accepted: [] }) } };
  };
  const context = await service.context(users[0], thread.id);
  const rootRuntime = await openAgentRuntime(context, { db, job: main, user: users[0], createHarness });
  const childRuntime = await openAgentRuntime(context, { db, job: child, user: users[1], createHarness });
  let resumed;
  const provider = { create: async () => {
    const sandboxId = randomUUID();
    return { sandboxId, files: { makeDir: async () => {} }, setTimeout: async () => {}, kill: async () => { killed.push(sandboxId); } };
  } };
  try {
    assert.equal(child.agent_slot, 2);
    assert.equal(agentSession(child).homeId, child.message_id);
    assert.notEqual(made[0].dshHome, made[1].dshHome);
    assert.notEqual(rootRuntime.session.session_id, childRuntime.session.session_id);
    const rootSandbox = await acquireSandbox(db, main, async () => {}, provider);
    const childSandbox = await acquireSandbox(db, child, async () => {}, provider);
    assert.notEqual(rootSandbox.sandboxId, childSandbox.sandboxId);
    const update = await post(1, "@小祥 追加要求");
    await query(db, "UPDATE agent_task_updates SET approved=TRUE WHERE message_id=?", [update.id]);
    const calls = [];
    const receiver = { request: async (name, params) => { calls.push({ name, params }); return { accepted: params.messages.map((m) => m.id) }; } };
    assert.equal(await deliverTaskUpdates(db, main, receiver), 0);
    assert.equal(await deliverTaskUpdates(db, child, receiver), 1);
    assert.equal(calls[0].params.mode, "steer");
    assert.equal(calls[0].params.messages[0].id, update.id);
    assert.equal(await deliverTaskUpdates(db, child, receiver), 0);
    await stopAgent(db, thread.id, child.message_id);
    assert.deepEqual(killed, [childSandbox.sandboxId]);
    assert.ok(!closed.includes(made[0].dshHome));
    await childRuntime.close(true);
    const childRow = (await query(db, "SELECT checkpoint,sandbox_id FROM agent_child_sessions WHERE message_id=?", [child.message_id]))[0];
    assert.ok(childRow.checkpoint);
    assert.equal(childRow.sandbox_id, null);
    resumed = await openAgentRuntime(context, { db, job: child, user: users[1], createHarness });
    assert.equal(resumed.session.session_id, childRuntime.session.session_id);
    assert.equal(made[1].dshHome, made[2].dshHome);
    assert.equal(agentSession(main).id, thread.id);
  } finally {
    await resumed?.close(); await childRuntime.close(); await rootRuntime.close(); await releaseSandbox(db, main);
  }
});

test("L3 task context is reported on the monitor and accepts a manual compact", async () => {
  const { users, project, thread, post } = await fixture();
  await post(0);
  await claimReply(db, thread.id);
  await post(1);
  const child = await claimReply(db, thread.id);
  const compactCalls = [];
  const createHarness = () => ({
    start: async () => {},
    close: async () => {},
    client: {
      async request(method, params) {
        if (method === "cothread/history")
          return [{ role: "user", content: [{ type: "text", text: "isolated task" }] }];
        if (method === "cothread/context")
          return { used: 910000, estimated: false, categories: {}, measuredAt: new Date().toISOString() };
        if (method === "cothread/compact") {
          compactCalls.push(params);
          return { before: 910000, after: 12000, changed: true };
        }
        return {};
      },
    },
  });
  const context = await service.context(users[0], thread.id);
  const runtime = await openAgentRuntime(context, {
    db, job: child, user: users[1], createHarness, observe: false,
  });
  await runtime.sample();
  await runtime.close(true);
  await query(db, "UPDATE assistant_replies SET status='completed',execution_active=FALSE WHERE message_id=?",
    [child.message_id]);
  const monitor = await service.agentMonitor(users[0], project.id);
  const usage = monitor.executors.find((item) => item.task_id === child.message_id);
  assert.equal(usage.contextUsage.used, 910000);
  const queued = await queueL3ContextCompression(service, users[0], thread.id, child.message_id);
  assert.equal(queued.status, "queued");
  assert.equal(await processNextL3ContextCompression(db, { threadId: thread.id, createHarness }), true);
  assert.equal(compactCalls.at(-1).automatic, undefined);
  const [session] = await query(db, "SELECT compact_status FROM agent_child_sessions WHERE message_id=?",
    [child.message_id]);
  assert.equal(session.compact_status, "completed");
});

test("routing reconciles replies completed by an older worker without invoking a model again", async () => {
  const { thread, post } = await fixture();
  const message = await post(0);
  await query(db, "UPDATE assistant_replies SET status='completed' WHERE message_id=?", [message.id]);
  await processNextCoordinator(db, thread.id, () => { throw new Error("Completed work must not be routed again"); });
  assert.equal((await query(db, "SELECT status FROM agent_requests WHERE message_id=?", [message.id]))[0].status, "completed");
});
