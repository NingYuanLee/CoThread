import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { joinThreadViewing } from "../server/thread-presence.js";

let database, service, author, reader, project, thread;

before(async () => {
  database = await testDatabase();
  service = new Service(database.db);
  author = { id: randomUUID(), kind: "session", name: "作者甲" };
  reader = { id: randomUUID(), kind: "session", name: "未读乙" };
  for (const user of [author, reader]) {
    await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [
      user.id,
      user.id + "@test.com",
      user.name,
      "unused",
    ]);
  }
  project = await service.createProject(author, { name: "未读实测" });
  thread = await service.createThread(author, project.id, { title: "已读游标" });
  await service.postMessage(author, thread.id, { body: "加入前的历史" });
  await service.addMember(author, project.id, { userId: reader.id, role: "member" });
});

after(async () => {
  await database?.close();
});

async function sequenceOf(messageId) {
  const [row] = await query(database.db, "SELECT sequence FROM messages WHERE id=?", [messageId]);
  return String(row.sequence);
}

test("new messages are unread, mentions are marked, and reading clears both", async () => {
  const before = await service.project(reader, project.id);
  const quiet = before.threads.find((item) => item.id === thread.id);
  assert.equal(quiet.unread_count, 0);
  assert.equal(quiet.unread_mention, false);

  const plain = await service.postMessage(author, thread.id, { body: "一条普通新消息" });
  const mentioned = await service.postMessage(author, thread.id, { body: "请 @未读乙 看一下" });
  const afterPost = await service.project(reader, project.id);
  const active = afterPost.threads.find((item) => item.id === thread.id);
  assert.equal(active.unread_count, 2);
  assert.equal(active.unread_mention, true);
  assert.equal(active.unread_mention_count, 1);

  const cursor = await service.listMessages(reader, thread.id, { afterMessageId: plain.id });
  assert.equal(cursor.changed, true);
  assert.deepEqual(
    cursor.messages.map((item) => item.id),
    [mentioned.id],
  );
  assert.equal(cursor.read.unreadMention, true);

  const idle = await service.listMessages(reader, thread.id, { afterMessageId: mentioned.id });
  assert.equal(idle.changed, false);
  assert.deepEqual(idle.messages, []);
  assert.equal(idle.page.latestMessageId, mentioned.id);

  await assert.rejects(
    service.listMessages(reader, thread.id, {
      beforeMessageId: plain.id,
      afterMessageId: mentioned.id,
    }),
    (error) => error.status === 400,
  );

  // 人不在该迭代时不能落已读（presence 门禁），否则退出页面后新消息会被误标已读。
  const ignored = await service.markThreadRead(reader, thread.id, {
    sequence: await sequenceOf(mentioned.id),
  });
  assert.equal(ignored.ignored, true);
  const stillUnread = await service.project(reader, project.id);
  assert.equal(stillUnread.threads.find((item) => item.id === thread.id).unread_count, 2);

  const leave = joinThreadViewing(reader.id, thread.id);
  try {
    await service.markThreadRead(reader, thread.id, { sequence: await sequenceOf(mentioned.id) });
  } finally {
    leave();
  }
  const cleared = await service.project(reader, project.id);
  const done = cleared.threads.find((item) => item.id === thread.id);
  assert.equal(done.unread_count, 0);
  assert.equal(done.unread_mention, false);
  assert.equal(done.unread_mention_count, 0);
  const [notice] = await query(
    database.db,
    "SELECT read_at FROM notifications WHERE user_id=? AND message_id=? AND kind='mention'",
    [reader.id, mentioned.id],
  );
  assert.ok(notice.read_at);
});
