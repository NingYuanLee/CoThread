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
  return { users, thread, post: (index, body = "@小祥 请处理") => service.postMessage(users[index], thread.id, { body }) };
}

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

test("three child slots are atomic, same-member mentions update one task, and release admits waiting members", async () => {
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
  assert.deepEqual([main, ...claimed].map((job) => job.agent_slot).sort(), [1, 2, 3]);
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

test("a hosted owner picks up another member while the main request is still running", { timeout: 20000 }, async () => {
  const { users, thread, post } = await fixture();
  const first = await post(0);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), childDone = Promise.withResolvers();
  const operations = {
    reply: (id) => processNextReply(db, async (_context, { job }) => {
      if (job.message_id === first.id) { entered.resolve(); await release.promise; }
      else { assert.equal(job.parent_message_id, job.message_id); childDone.resolve(); }
      return "finished " + job.message_id;
    }, undefined, id), compress: async () => false,
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
  // Legacy discussion sessions remain isolated from temporary execution sessions.
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
  const provider = { create: async () => {
    const sandboxId = randomUUID();
    return { sandboxId, files: { makeDir: async () => {} }, setTimeout: async () => {}, kill: async () => { killed.push(sandboxId); } };
  } };
  try {
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
    assert.equal((await query(db, "SELECT checkpoint,sandbox_id FROM agent_child_sessions WHERE message_id=?", [child.message_id]))[0].checkpoint, null);
    assert.equal(agentSession(main).id, thread.id);
  } finally {
    await childRuntime.close(); await rootRuntime.close(); await releaseSandbox(db, main);
  }
});

test("the coordinator answers progress at full capacity and only forwards actual work updates", async () => {
  const { users, thread, post } = await fixture(4);
  const decide = async (context, job) => job.body.includes("进度")
    ? { action: "reply", reply: `当前有 ${context.replies.filter((r) => r.status === "running").length} 个子 Agent 执行中。` }
    : { action: "execute", reply: "交给子 Agent" };
  const jobs = [];
  for (let index = 0; index < 3; index++) {
    await post(index);
    assert.equal(await claimReply(db, thread.id, { allowUnrouted: false }), undefined);
    await processNextCoordinator(db, thread.id, decide);
    jobs.push(await claimReply(db, thread.id, { allowUnrouted: false }));
  }
  assert.deepEqual(jobs.map((job) => job.agent_slot), [1, 2, 3]);
  const question = await post(0, "@小祥 当前进度怎样？");
  await processNextCoordinator(db, thread.id, decide);
  let context = await service.context(users[0], thread.id);
  assert.equal(context.replies.filter((r) => r.status === "running").length, 3);
  assert.ok(!context.updates.some((update) => update.message_id === question.id));
  const request = context.requests.find((r) => r.message_id === question.id);
  assert.equal(context.messages.find((m) => m.id === request.response_id).body, "当前有 3 个子 Agent 执行中。");
  const update = await post(0, "@小祥 改成新的实现要求");
  await processNextCoordinator(db, thread.id, decide);
  assert.equal((await query(db, "SELECT approved,task_message_id FROM agent_task_updates WHERE message_id=?", [update.id]))[0].task_message_id, jobs[0].message_id);
  assert.equal((await query(db, "SELECT approved FROM agent_task_updates WHERE message_id=?", [update.id]))[0].approved, 1);
  const natural = await post(0, "另外，把输出改为表格");
  await processNextCoordinator(db, thread.id, decide);
  assert.equal((await query(db, "SELECT task_message_id FROM agent_task_updates WHERE message_id=? AND approved=TRUE", [natural.id]))[0].task_message_id, jobs[0].message_id);
  assert.equal((await query(db, "SELECT status,dispatch_ready FROM assistant_replies WHERE message_id=?", [natural.id]))[0].status, "completed");
  assert.equal(await claimReply(db, thread.id, { allowUnrouted: false }), undefined);
  const naturalQuestion = await post(0, "现在进度如何？");
  await processNextCoordinator(db, thread.id, decide);
  assert.equal((await query(db, "SELECT message_id FROM agent_task_updates WHERE message_id=?", [naturalQuestion.id])).length, 0);
  const fourth = await post(3);
  await processNextCoordinator(db, thread.id, decide);
  assert.equal(await claimReply(db, thread.id, { allowUnrouted: false }), undefined);
  await query(db, "UPDATE assistant_replies SET status='completed',execution_active=FALSE WHERE message_id=?", [jobs[1].message_id]);
  const replacement = await claimReply(db, thread.id, { allowUnrouted: false });
  assert.equal(replacement.message_id, fourth.id);
  assert.equal(replacement.agent_slot, 2);
});

test("routing reconciles replies completed by an older worker without invoking a model again", async () => {
  const { thread, post } = await fixture();
  const message = await post(0);
  await query(db, "UPDATE assistant_replies SET status='completed' WHERE message_id=?", [message.id]);
  await processNextCoordinator(db, thread.id, () => { throw new Error("Completed work must not be routed again"); });
  assert.equal((await query(db, "SELECT status FROM agent_requests WHERE message_id=?", [message.id]))[0].status, "completed");
});
