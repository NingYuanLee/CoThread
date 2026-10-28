import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { testDatabase } from "./database.js";
import {
  composeOpportunisticParticipation,
  FULL_MODE_REMINDER,
  OPPORTUNISTIC_CONTEXT_CHAR_BUDGET,
} from "../server/agent-participation.js";

let database;
let db;
let service;

before(async () => {
  database = await testDatabase();
  db = database.db;
  service = new Service(db);
});

after(async () => {
  await database?.close();
});

async function person(name) {
  const user = { id: randomUUID(), kind: "session", name };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    user.id,
    `${user.id}@test.com`,
    name,
  ]);
  return user;
}

async function projectWith(owner, others = []) {
  const project = await service.createProject(owner, { name: `场景 ${randomUUID()}` });
  for (const other of others) {
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)", [
      project.id,
      other.id,
      "member",
    ]);
  }
  const thread = await service.createThread(owner, project.id, { title: "场景" });
  return { project, thread };
}

async function participationOf(messageId) {
  const [row] = await query(db, "SELECT participation FROM assistant_replies WHERE message_id=?", [
    messageId,
  ]);
  return row?.participation || null;
}

test("intake routes mention, vocative, chat, and solo member into full mode", async () => {
  const owner = await person("甲");
  const other = await person("乙");
  const cases = [
    ["今天先对一下进度", "pending"],
    ["@小祥 帮我写文档", "reply"],
    ["@乙 @小祥 一起看一下", "reply"],
    ["小祥，帮我写文档", "reply"],
    ["小祥", "pending"],
    ["我和乙一起改，不找助手", "pending"],
  ];
  for (const [body, expected] of cases) {
    const { thread } = await projectWith(owner, [other]);
    const message = await service.postMessage(owner, thread.id, { body });
    assert.equal(await participationOf(message.id), expected, body);
  }

  const chatRoom = await projectWith(owner, [other]);
  await assert.rejects(
    service.postMessage(owner, chatRoom.thread.id, {
      body: "随便聊聊",
      dialogueMode: "chat",
    }),
    (error) => error.status === 400,
  );

  const soloOwner = await person("丙");
  const solo = await projectWith(soloOwner);
  const hello = await service.postMessage(soloOwner, solo.thread.id, { body: "你好" });
  assert.equal(await participationOf(hello.id), "reply", "单人项目");
});

test("api messages enter only when 小祥 is addressed", async () => {
  const owner = await person("接口甲");
  const other = await person("接口乙");
  const { thread } = await projectWith(owner, [other]);
  const api = { ...owner, kind: "api" };

  const ignored = await service.postMessage(api, thread.id, { body: "接口随口一句" });
  assert.equal(await participationOf(ignored.id), null);

  const named = await service.postMessage(api, thread.id, { body: "小祥，看一下接口" });
  assert.equal(await participationOf(named.id), "reply");
});

test("a short follow-up after 小祥 stays light and is sent as written", async () => {
  const owner = await person("跟帖甲");
  const other = await person("跟帖乙");
  const { thread } = await projectWith(owner, [other]);
  await query(
    db,
    "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,'assistant',?,'[]','[]')",
    [randomUUID(), thread.id, owner.id, "我先记下了。"],
  );
  const follow = await service.postMessage(owner, thread.id, { body: "你这次反应挺快啊" });
  assert.equal(await participationOf(follow.id), "pending");
  let calls = 0;
  const result = await composeOpportunisticParticipation(db, {
    title: "场景",
    threadId: thread.id,
    messageId: follow.id,
    decide: async () => {
      calls += 1;
      return { respond: true, message: "哈哈，这次赶上了。" };
    },
    judgeReminder: async () => ({ remind: false }),
  });
  assert.equal(calls, 1);
  assert.equal(result.escalate, undefined);
  assert.equal(result.message, "哈哈，这次赶上了。");
});

test("a message that @s someone else is ignored without asking the model", async () => {
  const owner = await person("点名甲");
  const other = await person("点名乙");
  const { thread } = await projectWith(owner, [other]);
  const named = await service.postMessage(owner, thread.id, { body: "@点名乙 你怎么看这个方案" });
  assert.equal(await participationOf(named.id), "pending");
  const result = await composeOpportunisticParticipation(db, {
    title: "场景",
    threadId: thread.id,
    messageId: named.id,
    decide: async () => {
      throw new Error("明确艾特别人时不该斟酌是否参与");
    },
  });
  assert.equal(result.respond, false);
  assert.equal(result.deferred, "addressed_other");
  assert.deepEqual(result.burstIds, [named.id]);
});

test("an @ to someone else is ignored even when a later @小祥 is still in the open burst", async () => {
  const owner = await person("混段甲");
  const other = await person("混段乙");
  const { thread } = await projectWith(owner, [other]);
  const named = await service.postMessage(owner, thread.id, { body: "@混段乙 你看" });
  const xiaoxiangId = randomUUID();
  await query(
    db,
    "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,'human',?,'[]','[]')",
    [xiaoxiangId, thread.id, owner.id, "@小祥 在么"],
  );
  const result = await composeOpportunisticParticipation(db, {
    title: "场景",
    threadId: thread.id,
    messageId: named.id,
    decide: async () => {
      throw new Error("段里已有 @小祥 时，@别人仍不该进入斟酌");
    },
  });
  assert.equal(result.respond, false);
  assert.equal(result.deferred, "addressed_other");
  assert.equal(result.burstIds.includes(named.id), true);
  assert.equal(result.burstIds.includes(xiaoxiangId), false);
});

test("a bare acknowledgement after 小祥 stays silent", async () => {
  const owner = await person("确认甲");
  const other = await person("确认乙");
  const { thread } = await projectWith(owner, [other]);
  await query(
    db,
    "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,'assistant',?,'[]','[]')",
    [randomUUID(), thread.id, owner.id, "好。"],
  );
  const ack = await service.postMessage(owner, thread.id, { body: "收到" });
  const result = await composeOpportunisticParticipation(db, {
    title: "场景",
    threadId: thread.id,
    messageId: ack.id,
    decide: async () => {
      throw new Error("纯确认不该叫模型");
    },
  });
  assert.equal(result.respond, false);
});

test("a promised light reply is replaced by the fixed reminder and does not escalate", async () => {
  const owner = await person("实活甲");
  const other = await person("实活乙");
  const { thread } = await projectWith(owner, [other]);
  const ask = await service.postMessage(owner, thread.id, {
    body: "帮我总结最近20轮对话并生成分析文档",
  });
  assert.equal(await participationOf(ask.id), "pending");
  const result = await composeOpportunisticParticipation(db, {
    title: "场景",
    threadId: thread.id,
    messageId: ask.id,
    decide: async () => ({ respond: true, message: "我这就开始。" }),
  });
  assert.equal(result.escalate, undefined);
  assert.equal(result.message, FULL_MODE_REMINDER);
  assert.equal(result.message.includes("我这就开始"), false);
});

test("a latest message over the budget stays silent without a model call", async () => {
  const owner = await person("长文甲");
  const other = await person("长文乙");
  const { thread } = await projectWith(owner, [other]);
  const huge = await service.postMessage(owner, thread.id, {
    body: "长".repeat(OPPORTUNISTIC_CONTEXT_CHAR_BUDGET + 1),
  });
  let calls = 0;
  const result = await composeOpportunisticParticipation(db, {
    title: "场景",
    threadId: thread.id,
    messageId: huge.id,
    decide: async () => {
      calls += 1;
      return { respond: true, message: "看到了。" };
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.respond, false);
  assert.equal(result.deferred, "context_too_long");
});

test("an older oversized message is dropped and the newest short line is still judged", async () => {
  const owner = await person("减窗甲");
  const other = await person("减窗乙");
  const { thread } = await projectWith(owner, [other]);
  await service.postMessage(owner, thread.id, {
    body: "旧".repeat(OPPORTUNISTIC_CONTEXT_CHAR_BUDGET),
  });
  const latest = await service.postMessage(owner, thread.id, { body: "就看这句就行" });
  let seen = [];
  const result = await composeOpportunisticParticipation(db, {
    title: "场景",
    threadId: thread.id,
    messageId: latest.id,
    decide: async (context) => {
      seen = (context.messages || []).map((row) => row.body);
      return { respond: true, message: "就这句我接着听。" };
    },
    judgeReminder: async () => ({ remind: false }),
  });
  assert.equal(seen.includes("就看这句就行"), true);
  assert.equal(
    seen.some((body) => body.startsWith("旧旧")),
    false,
  );
  assert.equal(result.message, "就这句我接着听。");
  assert.equal(result.escalate, undefined);
});
