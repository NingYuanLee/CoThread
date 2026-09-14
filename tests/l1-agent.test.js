import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { runL1Task } from "../server/l1-agent.js";

test("L1 reuses one durable DSH session per project and validates structured output", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const project = await new Service(database.db).createProject(user, { name: "L1 DSH" });
    const sessionIds = [];
    const outputs = [JSON.stringify({ summary: "第一次" }), "```json\n{\"summary\":\"第二次\"}\n```"];
    const options = {
      model: { baseUrl: "http://127.0.0.1:1/v1", apiKey: "test",
        model: "test", reasoningEffort: "medium" },
      createHarness: () => ({
        async start() {},
        async run(_prompt, runOptions) {
          sessionIds.push(runOptions.sessionId);
          return { finalResponse: outputs.shift() };
        },
        async close() {},
      }),
    };
    const schema = z.object({ summary: z.string() });
    assert.equal((await runL1Task(database.db, project.id, "document_memory", {}, schema, options)).summary, "第一次");
    assert.equal((await runL1Task(database.db, project.id, "member_memory", {}, schema, options)).summary, "第二次");
    assert.equal(sessionIds.length, 2);
    assert.equal(sessionIds[0], sessionIds[1]);
    const [stored] = await query(database.db,
      "SELECT status,last_task,last_error,checkpoint IS NOT NULL has_checkpoint FROM agent_project_sessions WHERE project_id=?",
      [project.id]);
    assert.deepEqual({ status: stored.status, lastTask: stored.last_task,
      lastError: stored.last_error, hasCheckpoint: Number(stored.has_checkpoint) },
    { status: "idle", lastTask: "member_memory", lastError: null, hasCheckpoint: 1 });
    const monitor = await new Service(database.db).agentMonitor(user, project.id);
    assert.equal("provider" in monitor.models.knowledge, false);
    assert.equal("provider" in monitor.models.coordinator, false);
    assert.equal("provider" in monitor.models.executor, false);
    assert.equal(monitor.knowledge.sessionId, sessionIds[0]);
    assert.equal(monitor.knowledge.sessionStatus, "idle");
    assert.equal(monitor.knowledge.lastTask, "member_memory");
    const logs = await new Service(database.db).agentLogs(user, "project", project.id);
    assert.ok(logs.events.some((event) => event.tool === "model_run" && event.status === "completed"));
    assert.ok(logs.events.some((event) => event.tool === "save_checkpoint" && event.status === "completed"));
    assert.ok(logs.events.every((event) => !("input" in event) && !("output" in event)));
  } finally {
    await database.close();
  }
});
