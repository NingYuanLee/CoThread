import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { processNextCoordinator, dispatchContext } from "../server/coordinator.js";

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
      [{id:'agent-assistant',name:'小祥'}]);
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
    routing = processNextCoordinator(db, thread.id, async () => ({ action: "reply", reply: "我在。" }));
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
