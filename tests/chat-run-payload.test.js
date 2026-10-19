import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createApp } from "../server/http-app.js";
import { issueCredential } from "../server/auth.js";
import { modelDiscussion } from "../server/model-context.js";

test("chat run projection omits unused logs but retains failure details and full reads", async () => {
  const database = await testDatabase(),
    db = database.db;
  let server;
  try {
    const actor = { id: randomUUID(), kind: "session" };
    const outsider = { id: randomUUID(), kind: "session" };
    for (const user of [actor, outsider])
      await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
        user.id,
        `${user.id}@test.invalid`,
        "run payload",
      ]);
    const service = new Service(db);
    const project = await service.createProject(actor, { name: "run payload" });
    const thread = await service.createThread(actor, project.id, { title: "run payload" });
    const runs = [
      ...Array.from({ length: 17 }, () => ({
        id: randomUUID(),
        status: "succeeded",
        output: "success ".repeat(12500),
      })),
      { id: randomUUID(), status: "running", output: "partial output" },
      { id: randomUUID(), status: "failed", output: "失败诊断：保留全部细节" },
      { id: randomUUID(), status: "interrupted", output: "停止诊断：保留全部细节" },
    ];
    for (let i = 0; i < runs.length; i++)
      await query(
        db,
        "INSERT INTO sandbox_runs(id,thread_id,requested_by,kind,status,input,output,progress,created_at) VALUES(?,?,?,'command',?,'input',?,'keep progress',?)",
        [
          runs[i].id,
          thread.id,
          actor.id,
          runs[i].status,
          runs[i].output,
          `2026-01-01 00:00:${String(i).padStart(2, "0")}`,
        ],
      );
    const credential = await issueCredential(db, actor.id, "session", "run payload");
    const outside = await issueCredential(db, outsider.id, "session", "run payload outsider");
    server = createApp(db).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = (path, token = credential.token) =>
      fetch(base + path, { headers: { Cookie: `cothread_session=${token}` } });
    const response = await get(`/api/threads/${thread.id}?view=chat&after=0`);
    assert.equal(response.status, 200);
    const body = await response.text(),
      chat = JSON.parse(body);
    const fullResponse = await get(`/api/threads/${thread.id}?view=full`);
    const fullBody = await fullResponse.text(),
      full = JSON.parse(fullBody);
    const unprojectedChat = await service.context(actor, thread.id, db, {
      display: true,
      after: "0",
      includeConnectorResults: false,
      includeRunResults: true,
    });
    assert.deepEqual(
      { ...chat, runs: full.runs },
      unprojectedChat,
      "only run output projection differs from the same chat window",
    );
    console.log("Sandbox run payload bytes", {
      full: Buffer.byteLength(fullBody),
      unprojectedChat: Buffer.byteLength(JSON.stringify(unprojectedChat)),
      chat: Buffer.byteLength(body),
    });
    for (const run of runs) {
      const projected = chat.runs.find((row) => row.id === run.id);
      assert.equal(projected.status, run.status);
      assert.equal(projected.progress, "keep progress");
      assert.ok(
        projected.output === (["failed", "interrupted"].includes(run.status) ? run.output : null),
      );
      assert.ok(full.runs.find((row) => row.id === run.id).output === run.output);
    }
    assert.deepEqual(
      chat.runs.map((row) => ({
        ...row,
        output: full.runs.find((run) => run.id === row.id).output,
      })),
      full.runs,
      "all other run fields, row count and order stay identical",
    );
    assert.ok(Buffer.byteLength(body) < 20000);
    const startup = await (
      await get(`/api/workspace?projectId=${project.id}&threadId=${thread.id}`)
    ).json();
    assert.ok(startup.thread.runs.find((r) => r.id === runs[0].id).output === null);
    assert.equal(
      startup.thread.runs[0].output,
      runs.at(-1).output,
      "latest visible error is unchanged",
    );
    for (const context of [
      await service.context(actor, thread.id),
      await (await get(`/api/threads/${thread.id}`)).json(),
      modelDiscussion(await service.context(actor, thread.id, db, { display: true })),
    ]) {
      for (const run of runs)
        assert.ok(context.runs.find((row) => row.id === run.id).output === run.output);
    }
    await query(
      db,
      "UPDATE sandbox_runs SET status='failed',output='new failure detail' WHERE id=?",
      [runs[17].id],
    );
    const changed = await (await get(`/api/threads/${thread.id}?view=chat&after=0`)).json();
    assert.equal(changed.runs.find((row) => row.id === runs[17].id).output, "new failure detail");
    assert.equal((await get(`/api/threads/${thread.id}?view=chat`, outside.token)).status, 403);
    for (const run of runs.filter((row) => row.id !== runs[17].id)) {
      const [stored] = await query(db, "SELECT output FROM sandbox_runs WHERE id=?", [run.id]);
      assert.ok(stored.output === run.output, "projection never mutates stored output");
    }
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
});
