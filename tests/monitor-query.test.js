import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";

test("monitor preserves coordinator counts, activity semantics and project boundaries", async () => {
  const database = await testDatabase(),
    db = database.db;
  try {
    const actor = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      actor.id,
      `${actor.id}@test.invalid`,
      "monitor",
    ]);
    const service = new Service(db);
    const project = await service.createProject(actor, { name: "monitor" });
    const other = await service.createProject(actor, { name: "other" });
    const active = await service.createThread(actor, project.id, { title: "history" });
    const empty = await service.createThread(actor, project.id, { title: "empty" });
    const archived = await service.createThread(actor, project.id, { title: "archived" });
    await service.createThread(actor, other.id, { title: "foreign" });
    await query(db, "UPDATE threads SET created_at='2026-01-01 00:00:00' WHERE id=?", [active.id]);
    await query(db, "UPDATE threads SET created_at='2026-01-06 00:00:00' WHERE id=?", [empty.id]);
    await query(
      db,
      "UPDATE threads SET status='archived',archived_at=UTC_TIMESTAMP(3) WHERE id=?",
      [archived.id],
    );
    const rows = [
      {
        id: randomUUID(),
        at: "2026-01-02 00:00:00",
        status: "queued",
        response: "2026-01-01 00:00:00",
      },
      {
        id: randomUUID(),
        at: "2026-01-01 00:00:00",
        status: "running",
        response: "2026-01-04 00:00:00",
      },
      { id: randomUUID(), at: "2026-01-03 00:00:00", status: "completed", response: null },
      { id: randomUUID(), at: "2026-01-05 00:00:00", status: null },
    ];
    for (const [i, row] of rows.entries()) {
      await query(
        db,
        "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs,created_at) VALUES(?,?,?,'assistant',?,JSON_ARRAY(),JSON_ARRAY(),?)",
        [row.id, active.id, actor.id, `reply ${i}`, row.at],
      );
      if (row.status)
        await query(
          db,
          "INSERT INTO agent_requests(message_id,status,first_response_at) VALUES(?,?,?)",
          [row.id, row.status, row.response],
        );
    }
    await query(
      db,
      "INSERT INTO assistant_replies(message_id,status,progress,execution_active) VALUES(?,'running','current action',TRUE)",
      [rows[1].id],
    );
    await query(
      db,
      "INSERT INTO agent_sessions(thread_id,session_id,convergence_state,steering_epoch,wait_reason) VALUES(?,?,'waiting',7,'test wait')",
      [active.id, randomUUID()],
    );
    const monitor = await service.agentMonitor(actor, project.id);
    assert.deepEqual(
      monitor.coordinators.map((row) => row.id),
      [empty.id, active.id],
    );
    const result = monitor.coordinators[1];
    assert.equal(result.queued_requests, 1);
    assert.equal(result.running_requests, 1);
    assert.equal(result.active_executors, 1);
    assert.equal(result.current_action, "current action");
    assert.equal(result.recent_message, "reply 3");
    assert.equal(result.convergence_state, "waiting");
    assert.equal(Number(result.steering_epoch), 7);
    assert.equal(result.wait_reason, "test wait");
    assert.match(result.last_activity_at, /^2026-01-05 00:00:00/);
    assert.equal(monitor.coordinators[0].queued_requests, 0);
    assert.equal(monitor.coordinators[0].running_requests, 0);
    assert.match(monitor.coordinators[0].last_activity_at, /^2026-01-06 00:00:00/);
    // Earlier response timestamps deliberately replace message time in the old
    // contract. A rewrite using GREATEST(message, response) would change it.
    await query(
      db,
      "DELETE FROM messages WHERE id IN (?,?,?)",
      rows.slice(1).map((row) => row.id),
    );
    const next = (await service.agentMonitor(actor, project.id)).coordinators.find(
      (row) => row.id === active.id,
    );
    assert.match(next.last_activity_at, /^2026-01-01 00:00:00/);
  } finally {
    await database.close();
  }
});
