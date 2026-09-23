import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { processNextCoordinator, dispatchContext } from "../server/coordinator.js";
import { createTask } from "../server/task-pool.js";

test("coordinator waits for a concurrent claim instead of declaring a queued discussion idle", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  const blocker = await db.getConnection();
  let routing;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "并发接待" });
    const created = await service.createThread(user, project.id, { title: "等待短事务" });
    const thread = await service.thread(user, created.id);
    const message = await service.postMessage(user, thread.id, { body: "@小祥 你在么？" });
    assert.ok(message.sequence);
    assert.equal(message.request_status,'queued');
    assert.equal(message.participation,'reply');
    const later=await service.postMessage(user,thread.id,{body:'这条在触发消息之后',quoteIds:[message.id]});
    const context=await dispatchContext(db,thread,{thread_id:thread.id,sequence:message.sequence});
    assert.deepEqual(context.messages.map(m=>m.id),[message.id]);
    assert.equal('author_avatar' in context.messages[0],false);
    const withQuote=await dispatchContext(db,thread,{thread_id:thread.id,sequence:later.sequence});
    assert.equal(withQuote.messages.at(-1).quotes[0].id,message.id);
    assert.deepEqual(withQuote.promptContext.latestMessage.quotedMessageIds,[message.id]);
    assert.equal('content' in withQuote.messages.at(-1).quotes[0],false);
    assert.equal(withQuote.promptContext.latestMessage.mentions.length,0);
    assert.deepEqual(withQuote.promptContext.history.messages[0].mentions,
      [{id:'agent-l2',name:'小祥'}]);
    assert.deepEqual(withQuote.promptContext.members.map(member=>member.name),['成员','小祥']);
    await query(db, "UPDATE assistant_replies SET status='running',parent_message_id=?,progress='正在验证结果' WHERE message_id=?", [message.id,message.id]);
    await query(db, "INSERT INTO agent_events(message_id,tool,status,input) VALUES(?,'sandbox_command','running',?)",
      [message.id,JSON.stringify({command:'npm test'})]);
    const active=await dispatchContext(db,thread,{thread_id:thread.id,sequence:later.sequence});
    assert.equal(active.replies[0].request_body,"@小祥 你在么？");
    assert.equal(active.replies[0].progress,"正在验证结果");
    assert.equal(active.replies[0].last_tool,"sandbox_command");
    assert.equal(active.promptContext.tasks[0].goal,"@小祥 你在么？");
    assert.equal(active.promptContext.tasks[0].lastAction,"运行命令 npm test");
    assert.deepEqual(active.promptContext.tasks[0].relatedMessageIds,[message.id]);
    await blocker.beginTransaction();
    await query(blocker, "SELECT id FROM threads WHERE id=? FOR UPDATE", [thread.id]);
    routing = processNextCoordinator(db, thread.id, async () => ({ finalResponse: "我在。", mergedMessageIds: [] }));
    assert.equal(await Promise.race([routing.then(() => "finished"), delay(100, "waiting")]), "waiting");
    await blocker.commit();
    assert.equal(await routing, true);
    const [receipt] = await query(db, "SELECT status FROM agent_requests WHERE message_id=?", [message.id]);
    assert.equal(receipt.status, "completed");
  } finally {
    await blocker.rollback();
    blocker.release();
    await routing;
    await database.close();
  }
});

test("child_result events wake L2 and post the visible follow-up", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "交活唤醒" });
    const created = await service.createThread(user, project.id, { title: "任务" });
    const thread = await service.thread(user, created.id);
    const trigger = await service.postMessage(user, thread.id, { body: "@小祥 做个文件" });
    await query(db, "UPDATE agent_requests SET status='completed' WHERE message_id=?", [trigger.id]);
    await query(db, "UPDATE assistant_replies SET status='completed',participation='reply' WHERE message_id=?", [trigger.id]);
    await query(db, `INSERT INTO coordinator_events(id,thread_id,kind,status,message_id,task_id,payload)
      VALUES(UUID(),?,'child_result','queued',?,?,?)`,
      [thread.id, trigger.id, randomUUID(), JSON.stringify({
        status: "failed", title: "制作测试文档.md", resultSummary: "任务未完成",
        failureReason: "任务已停止或迭代已归档", sourceMessageId: trigger.id, sourceUserId: user.id,
      })]);
    let seen;
    assert.equal(await processNextCoordinator(db, thread.id, async (context, { job }) => {
      seen = { kind: job.kind, title: context.promptContext.event.title };
      return { finalResponse: "文档没做成，沙箱在交活前被停了。要不要我再派一次？", mergedMessageIds: [] };
    }), true);
    assert.equal(seen.kind, "child_result");
    assert.equal(seen.title, "制作测试文档.md");
    const posts = await query(db, "SELECT body FROM messages WHERE agent_task_id=? AND source='assistant' ORDER BY sequence", [trigger.id]);
    assert.equal(posts.at(-1).body, "文档没做成，沙箱在交活前被停了。要不要我再派一次？");
    const [event] = await query(db, "SELECT status FROM coordinator_events WHERE thread_id=? AND kind='child_result'", [thread.id]);
    assert.equal(event.status, "completed");
  } finally {
    await database.close();
  }
});

test("child_result still posts when the source message already has earlier L2 replies", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "交活补帖" });
    const created = await service.createThread(user, project.id, { title: "任务" });
    const thread = await service.thread(user, created.id);
    const trigger = await service.postMessage(user, thread.id, { body: "@小祥 验证 L3" });
    await query(db, "UPDATE agent_requests SET status='completed' WHERE message_id=?", [trigger.id]);
    await query(db, "UPDATE assistant_replies SET status='completed',participation='reply' WHERE message_id=?", [trigger.id]);
    // Prior turn already posted ack / "已派人" under the same source message.
    await service.insertMessage(db, user, thread.id, "已安排验证，系统即将启动 L3。", [], "assistant", trigger.id);
    await service.insertMessage(db, user, thread.id, "L3 已启动执行。", [], "assistant", trigger.id);
    await query(db, `INSERT INTO coordinator_events(id,thread_id,kind,status,message_id,task_id,payload)
      VALUES(UUID(),?,'child_result','queued',?,?,?)`,
      [thread.id, trigger.id, randomUUID(), JSON.stringify({
        status: "completed", title: "验证 L3", resultSummary: "L3_PROBE_OK",
        sourceMessageId: trigger.id, sourceUserId: user.id,
      })]);
    assert.equal(await processNextCoordinator(db, thread.id, async () => ({
      finalResponse: "大娃已跑完：L3_PROBE_OK，退出码 0。", mergedMessageIds: [],
    })), true);
    const posts = await query(db, "SELECT body FROM messages WHERE agent_task_id=? AND source='assistant' ORDER BY sequence", [trigger.id]);
    assert.equal(posts.length, 3);
    assert.equal(posts.at(-1).body, "大娃已跑完：L3_PROBE_OK，退出码 0。");
  } finally {
    await database.close();
  }
});

test("a coordinator turn that leaves pending work enqueues one idle dispatch", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "补派" });
    const created = await service.createThread(user, project.id, { title: "待指派" });
    const sessionId = randomUUID();
    await query(db, "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?)", [created.id, sessionId]);
    const task = await createTask(db, {
      projectId: project.id, originThreadId: created.id, sourceType: "human_member", sourceUserId: user.id,
      createdByType: "l2_session", createdById: sessionId, taskType: "formal", title: "还没派出去",
      goal: "回合结束应退回待指派", targetType: "l2_session", targetId: sessionId,
    });
    assert.equal(task.status, "running");
    await query(db, `INSERT INTO coordinator_events(id,thread_id,kind,status,payload)
      VALUES(UUID(),?,'child_result','queued',?)`, [created.id, JSON.stringify({ status: "completed", title: "上一件", pendingTasks: [] })]);
    assert.equal(await processNextCoordinator(db, created.id, async () => ({ finalResponse: "NO_VISIBLE_MESSAGE", mergedMessageIds: [] })), true);
    const [released] = await query(db, "SELECT status FROM agent_tasks WHERE id=?", [task.id]);
    assert.equal(released.status, "pending_assignment");
    const idle = await query(db, "SELECT payload FROM coordinator_events WHERE thread_id=? AND kind='l3_idle'", [created.id]);
    assert.equal(idle.length, 1);
    const payload = typeof idle[0].payload === "string" ? JSON.parse(idle[0].payload) : idle[0].payload;
    assert.equal(payload.pendingTasks[0].id, task.id);
    assert.equal(await processNextCoordinator(db, created.id, async () => ({ finalResponse: "NO_VISIBLE_MESSAGE", mergedMessageIds: [] })), true);
    const still = await query(db, "SELECT id FROM coordinator_events WHERE thread_id=? AND kind='l3_idle'", [created.id]);
    assert.equal(still.length, 1);
  } finally {
    await database.close();
  }
});

test("a new member message is claimed while a prior L2 turn still waits on L3", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "L3 执行中接待" });
    const created = await service.createThread(user, project.id, { title: "并发" });
    const thread = await service.thread(user, created.id);
    const first = await service.postMessage(user, thread.id, { body: "@小祥 先派一个 L3" });
    await query(db, "UPDATE agent_requests SET status='completed' WHERE message_id=?", [first.id]);
    await query(db, `UPDATE assistant_replies SET status='completed',participation='reply',
      execution_active=TRUE,progress='等待任务级 Agent',finished_at=UTC_TIMESTAMP(3) WHERE message_id=?`, [first.id]);
    await query(db, "UPDATE agent_sessions SET convergence_state='waiting',wait_reason='等待执行结果' WHERE thread_id=?", [thread.id]);
    const second = await service.postMessage(user, thread.id, { body: "@小祥 顺便再问一句" });
    assert.equal(second.request_status, "queued");
    let seen;
    assert.equal(await processNextCoordinator(db, thread.id, async (context, { job }) => {
      seen = { kind: job.kind, messageId: job.message_id, body: job.body };
      return { finalResponse: "收到，我先答这句。", mergedMessageIds: [], waiting: true };
    }), true);
    assert.equal(seen.kind, "member_message");
    assert.equal(seen.messageId, second.id);
    const [receipt] = await query(db, "SELECT status FROM agent_requests WHERE message_id=?", [second.id]);
    assert.equal(receipt.status, "completed");
    const [reply] = await query(db, "SELECT status,progress FROM assistant_replies WHERE message_id=?", [second.id]);
    assert.equal(reply.status, "completed");
    assert.notEqual(reply.progress, "等待处理");
  } finally {
    await database.close();
  }
});

test("identical visible text is posted only once for child_result", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "去重投递" });
    const created = await service.createThread(user, project.id, { title: "任务" });
    const thread = await service.thread(user, created.id);
    const trigger = await service.postMessage(user, thread.id, { body: "@小祥 查一下" });
    await query(db, "UPDATE agent_requests SET status='completed' WHERE message_id=?", [trigger.id]);
    await query(db, "UPDATE assistant_replies SET status='completed',participation='reply' WHERE message_id=?", [trigger.id]);
    const body = "负责人，复现成功——两条独立证据。";
    await service.insertMessage(db, user, thread.id, body, [], "assistant", trigger.id);
    await query(db, `INSERT INTO coordinator_events(id,thread_id,kind,status,message_id,task_id,payload)
      VALUES(UUID(),?,'child_result','queued',?,?,?)`,
      [thread.id, trigger.id, randomUUID(), JSON.stringify({
        status: "completed", title: "核查", resultSummary: "ok",
        sourceMessageId: trigger.id, sourceUserId: user.id,
      })]);
    assert.equal(await processNextCoordinator(db, thread.id, async () => ({
      finalResponse: body, mergedMessageIds: [],
    })), true);
    const posts = await query(db, "SELECT body FROM messages WHERE agent_task_id=? AND source='assistant' ORDER BY sequence", [trigger.id]);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].body, body);
  } finally {
    await database.close();
  }
});

test("L2 session busy requeues the member message instead of failing", async () => {
  const database = await testDatabase(), db = database.db, service = new Service(db);
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [user.id, `${user.id}@test.com`, "成员"]);
    const project = await service.createProject(user, { name: "忙时重试" });
    const created = await service.createThread(user, project.id, { title: "锁冲突" });
    const thread = await service.thread(user, created.id);
    const message = await service.postMessage(user, thread.id, { body: "@小祥 还在吗" });
    const busy = new Error("L2 session is busy");
    busy.code = "L2_SESSION_BUSY";
    assert.equal(await processNextCoordinator(db, thread.id, async () => { throw busy; }), true);
    const [request] = await query(db, "SELECT status,error FROM agent_requests WHERE message_id=?", [message.id]);
    assert.equal(request.status, "queued");
    assert.equal(request.error, null);
    const [reply] = await query(db, "SELECT status,error,progress FROM assistant_replies WHERE message_id=?", [message.id]);
    assert.equal(reply.status, "queued");
    assert.equal(reply.error, null);
    assert.equal(reply.progress, "等待处理");
  } finally {
    await database.close();
  }
});

