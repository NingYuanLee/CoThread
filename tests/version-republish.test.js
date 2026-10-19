import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";

test("republishing the same task bytes reuses the existing version", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "测试",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "重复发布" });
    const thread = await service.createThread(user, project.id, { title: "同一哈希" });
    const message = await service.postMessage(user, thread.id, { body: "@小祥 写文件" });
    const agent = { id: user.id, kind: "agent" };
    const input = {
      title: "笔记",
      filename: "note.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("同一份内容").toString("base64"),
    };
    const first = await service.submitVersion(agent, thread.id, input, null, message.id);
    const second = await service.submitVersion(agent, thread.id, input, null, message.id);
    assert.equal(second.reused, true);
    assert.equal(second.id, first.id);
    const [count] = await query(
      db,
      "SELECT COUNT(*) count FROM versions WHERE artifact_id=?",
      [first.artifactId],
    );
    assert.equal(Number(count.count), 1);
  } finally {
    await database.close();
  }
});
