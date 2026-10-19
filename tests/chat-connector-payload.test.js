import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createApp } from "../server/http-app.js";
import { issueCredential } from "../server/auth.js";
import { modelDiscussion } from "../server/model-context.js";

test("browser chat and startup omit connector result blobs while full context retains them", async () => {
  const database = await testDatabase(),
    db = database.db;
  let http;
  try {
    const actor = { id: randomUUID(), kind: "session" },
      outsider = { id: randomUUID(), kind: "session" };
    for (const user of [actor, outsider])
      await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
        user.id,
        `${user.id}@test.invalid`,
        "payload",
      ]);
    const service = new Service(db);
    const project = await service.createProject(actor, { name: "payload" });
    const thread = await service.createThread(actor, project.id, { title: "payload" });
    const messageId = randomUUID(),
      connectorId = randomUUID(),
      taskId = randomUUID();
    const output = "result ".repeat(100000),
      diff = "diff ".repeat(300000);
    await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,'human','short request',JSON_ARRAY(),JSON_ARRAY())",
      [messageId, thread.id, actor.id],
    );
    await query(
      db,
      "INSERT INTO connectors(id,user_id,name,platform,version,token_hash) VALUES(?,?,?,'windows','test',?)",
      [
        connectorId,
        actor.id,
        "payload connector",
        createHash("sha256").update(randomUUID()).digest("hex"),
      ],
    );
    await query(
      db,
      "INSERT INTO connector_tasks(id,connector_id,project_id,thread_id,message_id,requested_by,assigned_to,instruction,policy,status,progress,output,diff) VALUES(?,?,?,?,?,?,?,'keep instruction','unrestricted','completed','done',?,?)",
      [taskId, connectorId, project.id, thread.id, messageId, actor.id, actor.id, output, diff],
    );
    const full = await service.context(actor, thread.id);
    assert.ok(full.connectorTasks[0].output === output);
    assert.ok(full.connectorTasks[0].diff === diff);
    const mcp = modelDiscussion(await service.context(actor, thread.id, db, { display: true }));
    assert.ok(mcp.connectorTasks[0].output === output, "MCP default retains results");
    assert.ok(mcp.connectorTasks[0].diff === diff);
    const credential = await issueCredential(db, actor.id, "session", "payload-test");
    const otherCredential = await issueCredential(db, outsider.id, "session", "payload-outsider");
    http = createApp(db).listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      http.once("listening", resolve);
      http.once("error", reject);
    });
    const base = `http://127.0.0.1:${http.address().port}`;
    const get = (path, token = credential.token) =>
      fetch(base + path, { headers: { Cookie: `cothread_session=${token}` } });
    const response = await get(`/api/threads/${thread.id}?view=chat`);
    assert.equal(response.status, 200);
    const body = await response.text(),
      compact = JSON.parse(body);
    console.log("Connector chat payload bytes", {
      full: Buffer.byteLength(JSON.stringify(full)),
      browser: Buffer.byteLength(body),
    });
    assert.ok(compact.connectorTasks[0].output === null, "browser does not receive unused output");
    assert.ok(compact.connectorTasks[0].diff === null, "browser does not receive unused diff");
    assert.equal(compact.connectorTasks[0].id, taskId);
    assert.equal(compact.connectorTasks[0].status, "completed");
    assert.equal(compact.connectorTasks[0].progress, "done");
    assert.equal(compact.connectorTasks[0].instruction, "keep instruction");
    assert.ok(Buffer.byteLength(body) < 20000);
    const startup = await (
      await get(`/api/workspace?projectId=${project.id}&threadId=${thread.id}`)
    ).json();
    assert.ok(startup.thread.connectorTasks[0].output === null);
    assert.ok(startup.thread.connectorTasks[0].diff === null);
    const explicitFull = await (await get(`/api/threads/${thread.id}`)).json();
    assert.ok(explicitFull.connectorTasks[0].diff === diff);
    assert.equal(
      (await get(`/api/threads/${thread.id}?view=chat`, otherCredential.token)).status,
      403,
    );
    const [stored] = await query(db, "SELECT output,diff FROM connector_tasks WHERE id=?", [
      taskId,
    ]);
    assert.ok(
      stored.output === output && stored.diff === diff,
      "projection never changes stored results",
    );
  } finally {
    if (http) await new Promise((resolve) => http.close(resolve));
    await database.close();
  }
});
