/**
 * 长会话侧表容量曲线。只测量，不改接口。
 * 用法：node --env-file-if-exists=.env scripts/measure-chat-side-state.mjs
 * 必须指向测试库。会清空该库后重放迁移。
 */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { testDatabase } from "../tests/database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";

const sizes = [100, 1000, 4000, 12000];
const repeats = 5;

function percentile(samples, p) {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function insertMessages(db, threadId, authorId, count) {
  const ids = [];
  const batch = 200;
  for (let offset = 0; offset < count; offset += batch) {
    const take = Math.min(batch, count - offset);
    const values = [];
    const params = [];
    for (let i = 0; i < take; i += 1) {
      const id = randomUUID();
      ids.push(id);
      values.push("(?,?,?,?,?,?)");
      params.push(id, threadId, authorId, "human", "msg " + (offset + i), "[]");
    }
    await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES " + values.join(","),
      params,
    );
  }
  return ids;
}

async function insertSideRows(db, spec) {
  const { threadId, projectId, authorId, messageIds } = spec;
  const batch = 200;
  for (let offset = 0; offset < messageIds.length; offset += batch) {
    const slice = messageIds.slice(offset, offset + batch);
    await query(
      db,
      "INSERT INTO assistant_replies(message_id,status,participation) VALUES " +
        slice.map(() => "(?,'completed','reply')").join(","),
      slice,
    );
    await query(
      db,
      "INSERT INTO agent_requests(message_id,status) VALUES " +
        slice.map(() => "(?,'completed')").join(","),
      slice,
    );
    await query(
      db,
      "INSERT INTO agent_task_updates(message_id,task_message_id) VALUES " +
        slice.map(() => "(?,?)").join(","),
      slice.flatMap((id) => [id, id]),
    );
  }
  const artifactId = randomUUID();
  const versionId = randomUUID();
  await query(db, "INSERT INTO artifacts(id,project_id,title,created_by) VALUES(?,?,?,?)", [
    artifactId,
    projectId,
    "measure",
    authorId,
  ]);
  await query(
    db,
    "INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by) VALUES(?,?,?,1,'m.txt','text/plain',?,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,'',?)",
    [versionId, artifactId, threadId, Buffer.from("x"), authorId],
  );
  for (let offset = 0; offset < messageIds.length; offset += batch) {
    const slice = messageIds.slice(offset, offset + batch);
    await query(
      db,
      "INSERT INTO reviews(id,version_id,reviewer_id,decision,comment) VALUES " +
        slice.map(() => "(?,?,?,'approved','ok')").join(","),
      slice.flatMap(() => [randomUUID(), versionId, authorId]),
    );
  }
  const connectorId = randomUUID();
  const token = (randomUUID() + randomUUID()).replaceAll("-", "");
  await query(
    db,
    "INSERT INTO local_executors(id,user_id,name,platform,version,token_hash) VALUES(?,?,?,?,?,?)",
    [connectorId, authorId, "measure", "win", "0", token],
  );
  for (let offset = 0; offset < messageIds.length; offset += batch) {
    const slice = messageIds.slice(offset, offset + batch);
    await query(
      db,
      "INSERT INTO local_executor_tasks(id,local_executor_id,project_id,thread_id,message_id,requested_by,assigned_to,instruction,policy,status) VALUES " +
        slice.map(() => "(?,?,?,?,?,?,?,'measure','unrestricted','completed')").join(","),
      slice.flatMap((id) => [
        randomUUID(),
        connectorId,
        projectId,
        threadId,
        id,
        authorId,
        authorId,
      ]),
    );
  }
}

async function timeChat(service, user, threadId) {
  const samples = [];
  let bytes = 0;
  let counts = {};
  for (let i = 0; i < repeats; i += 1) {
    const started = performance.now();
    const payload = await service.context(user, threadId, service.db, {
      display: true,
      includeConnectorResults: false,
      includeRunResults: false,
      limit: 50,
      sideState: "initial",
    });
    samples.push(performance.now() - started);
    bytes = Buffer.byteLength(JSON.stringify(payload));
    counts = {
      messages: payload.messages?.length || 0,
      reviews: payload.reviews?.length || 0,
      runs: payload.runs?.length || 0,
      replies: payload.replies?.length || 0,
      updates: payload.updates?.length || 0,
      requests: payload.requests?.length || 0,
      localExecutorTasks: payload.localExecutorTasks?.length || 0,
    };
  }
  return {
    p50Ms: Number(percentile(samples, 50).toFixed(1)),
    p95Ms: Number(percentile(samples, 95).toFixed(1)),
    samplesMs: samples.map((value) => Number(value.toFixed(1))),
    responseBytes: bytes,
    rssMb: Number((process.memoryUsage().rss / 1048576).toFixed(1)),
    counts,
  };
}

const database = await testDatabase();
const db = database.db;
const report = [];
try {
  const user = { id: randomUUID(), kind: "session" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    user.id,
    user.id + "@test.com",
    "测量",
  ]);
  const service = new Service(db);
  const project = await service.createProject(user, { name: "侧表容量" });
  for (const size of sizes) {
    const thread = await service.createThread(user, project.id, { title: "历史 " + size });
    const ids = await insertMessages(db, thread.id, user.id, size);
    await insertSideRows(db, {
      threadId: thread.id,
      projectId: project.id,
      authorId: user.id,
      messageIds: ids,
    });
    const row = { history: size, ...(await timeChat(service, user, thread.id)) };
    report.push(row);
    console.log(JSON.stringify(row));
  }
  await writeFile("tmp/chat-side-capacity.json", JSON.stringify(report, null, 2));
  console.log("wrote tmp/chat-side-capacity.json");
} finally {
  await database.close();
}
