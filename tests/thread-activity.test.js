import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query, transaction } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  finishAgentEvent,
  finishSandboxRun,
  insertCompletedAgentEvent,
  interruptRunningAgentEvents,
  interruptRunningSandboxRuns,
} from "../server/thread-activity.js";
let database, db, service;
before(async () => {
  database = await testDatabase();
  db = database.db;
  service = new Service(db);
});
after(async () => {
  await database?.close();
});
afterEach(async () => {
  await db.query("DROP TRIGGER IF EXISTS qa_block_activity");
  await database.reset();
});
async function fixture() {
  const user = { id: randomUUID(), kind: "session" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    user.id,
    `${user.id}@test.com`,
    "活跃时间测试",
  ]);
  const project = await service.createProject(user, { name: "活跃时间" });
  const thread = await service.createThread(user, project.id, { title: "一致性" });
  const message = await service.postMessage(user, thread.id, { body: "初始消息" });
  return { user, project, thread, message };
}
async function event(messageId, status = "running") {
  return (
    await query(
      db,
      "INSERT INTO agent_events(message_id,tool,status,input) VALUES(?,'qa',?,'{}')",
      [messageId, status],
    )
  ).insertId;
}
async function run({ user, thread }, status = "running") {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO sandbox_runs(id,thread_id,requested_by,kind,status,input) VALUES(?,?,?,'command',?,'{}')",
    [id, thread.id, user.id, status],
  );
  return id;
}
async function blockActivity() {
  await db.query(
    "CREATE TRIGGER qa_block_activity BEFORE UPDATE ON threads FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='activity blocked'",
  );
}

test("an activity failure rolls back event and sandbox completion atomically", async () => {
  const f = await fixture(),
    eventId = await event(f.message.id),
    runId = await run(f);
  const [revision] = await query(db, "SELECT side_revision FROM threads WHERE id=?", [f.thread.id]);
  await blockActivity();
  await assert.rejects(
    () => finishAgentEvent(db, eventId, { status: "completed", output: "done" }),
    /activity blocked/,
  );
  await assert.rejects(
    () => finishSandboxRun(db, runId, { status: "succeeded", output: "done", progress: "完成" }),
    /activity blocked/,
  );
  const [e] = await query(db, "SELECT status,finished_at,output FROM agent_events WHERE id=?", [
    eventId,
  ]);
  const [r] = await query(db, "SELECT status,finished_at,output FROM sandbox_runs WHERE id=?", [
    runId,
  ]);
  assert.deepEqual(e, { status: "running", finished_at: null, output: null });
  assert.equal(r.status, "running");
  assert.equal(r.finished_at, null);
  assert.equal(r.output, null);
  assert.equal(
    String(
      (await query(db, "SELECT side_revision FROM threads WHERE id=?", [f.thread.id]))[0]
        .side_revision,
    ),
    String(revision.side_revision),
  );
});

test("message and completed-event inserts roll back if their activity update fails", async () => {
  const f = await fixture();
  await blockActivity();
  await assert.rejects(
    () => service.postMessage(f.user, f.thread.id, { body: "不可部分提交" }),
    /activity blocked/,
  );
  await assert.rejects(
    () =>
      insertCompletedAgentEvent(db, {
        messageId: f.message.id,
        sessionId: null,
        tool: "qa",
        input: "{}",
        output: "不可部分提交",
      }),
    /activity blocked/,
  );
  assert.equal(
    Number((await query(db, "SELECT COUNT(*) n FROM messages WHERE body='不可部分提交'"))[0].n),
    0,
  );
  assert.equal(
    Number(
      (await query(db, "SELECT COUNT(*) n FROM agent_events WHERE message_id=?", [f.message.id]))[0]
        .n,
    ),
    0,
  );
});

test("sandbox completion reuses its caller's transaction and bumps side revision once", async () => {
  const f = await fixture();
  const runId = await run(f);
  const [before] = await query(db, "SELECT side_revision,last_active_at FROM threads WHERE id=?", [
    f.thread.id,
  ]);
  await assert.rejects(
    () =>
      transaction(db, async (conn) => {
        await finishSandboxRun(conn, runId, {
          status: "succeeded",
          output: "done",
          progress: "完成",
        });
        const [runRow] = await query(
          conn,
          "SELECT status,finished_at FROM sandbox_runs WHERE id=?",
          [runId],
        );
        const [thread] = await query(
          conn,
          "SELECT side_revision,last_active_at FROM threads WHERE id=?",
          [f.thread.id],
        );
        assert.equal(runRow.status, "succeeded");
        assert.equal(String(thread.last_active_at), String(runRow.finished_at));
        assert.equal(Number(thread.side_revision), Number(before.side_revision) + 1);
        throw new Error("rollback caller");
      }),
    /rollback caller/,
  );
  const [runRow] = await query(
    db,
    "SELECT status,finished_at,output FROM sandbox_runs WHERE id=?",
    [runId],
  );
  const [after] = await query(db, "SELECT side_revision,last_active_at FROM threads WHERE id=?", [
    f.thread.id,
  ]);
  assert.equal(runRow.status, "running");
  assert.equal(runRow.finished_at, null);
  assert.equal(runRow.output, null);
  assert.equal(String(after.side_revision), String(before.side_revision));
  assert.equal(String(after.last_active_at), String(before.last_active_at));
});

test("completed-event insertion reuses its caller's transaction", async () => {
  const f = await fixture();
  await assert.rejects(
    () =>
      transaction(db, async (conn) => {
        await insertCompletedAgentEvent(conn, {
          messageId: f.message.id,
          sessionId: null,
          tool: "qa",
          input: "{}",
          output: "事务内",
        });
        throw new Error("rollback caller");
      }),
    /rollback caller/,
  );
  assert.equal(
    Number(
      (await query(db, "SELECT COUNT(*) n FROM agent_events WHERE message_id=?", [f.message.id]))[0]
        .n,
    ),
    0,
  );
});

test("a rejected sandbox activity update can be caught without committing partial completion", async () => {
  const f = await fixture();
  const runId = await run(f);
  await query(db, "UPDATE threads SET last_active_at='2000-01-01' WHERE id=?", [f.thread.id]);
  const [before] = await query(db, "SELECT side_revision FROM threads WHERE id=?", [f.thread.id]);
  await db.query(
    "CREATE TRIGGER qa_block_activity BEFORE UPDATE ON threads FOR EACH ROW BEGIN IF NOT (NEW.last_active_at <=> OLD.last_active_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='activity blocked'; END IF; END",
  );
  await transaction(db, async (conn) => {
    await assert.rejects(
      () =>
        finishSandboxRun(conn, runId, { status: "succeeded", output: "done", progress: "完成" }),
      /activity blocked/,
    );
    await query(conn, "UPDATE users SET name='事务仍可提交' WHERE id=?", [f.user.id]);
  });
  const [row] = await query(db, "SELECT status,finished_at,output FROM sandbox_runs WHERE id=?", [
    runId,
  ]);
  assert.deepEqual(row, { status: "running", finished_at: null, output: null });
  const [thread] = await query(db, "SELECT side_revision,last_active_at FROM threads WHERE id=?", [
    f.thread.id,
  ]);
  assert.equal(String(thread.side_revision), String(before.side_revision));
  assert.match(String(thread.last_active_at), /^2000-01-01/);
  assert.equal(
    (await query(db, "SELECT name FROM users WHERE id=?", [f.user.id]))[0].name,
    "事务仍可提交",
  );
});

test("startup cleanup advances only affected threads and preserves a later activity time", async () => {
  const f = await fixture();
  const other = await service.createThread(f.user, f.project.id, { title: "已完成记录" });
  const otherMessage = await service.postMessage(f.user, other.id, { body: "不用更新" });
  const future = await service.createThread(f.user, f.project.id, { title: "活跃时间不可倒退" });
  const futureMessage = await service.postMessage(f.user, future.id, { body: "未来活跃时间" });
  await event(f.message.id);
  await event(f.message.id);
  await event(otherMessage.id, "completed");
  await event(futureMessage.id);
  const runId = await run(f);
  await run({ ...f, thread: other }, "succeeded");
  await run({ ...f, thread: future });
  await query(db, "UPDATE threads SET last_active_at='2000-01-01' WHERE id IN (?,?)", [
    f.thread.id,
    other.id,
  ]);
  await query(db, "UPDATE threads SET last_active_at='2099-01-01' WHERE id=?", [future.id]);
  const revisions = Object.fromEntries(
    (
      await query(db, "SELECT id,side_revision FROM threads WHERE id IN (?,?,?)", [
        f.thread.id,
        other.id,
        future.id,
      ])
    ).map((row) => [row.id, row.side_revision]),
  );
  await interruptRunningAgentEvents(db);
  const [e] = await query(
    db,
    "SELECT MAX(finished_at) latest FROM agent_events WHERE message_id=?",
    [f.message.id],
  );
  const [t] = await query(db, "SELECT last_active_at FROM threads WHERE id=?", [f.thread.id]);
  assert.equal(String(t.last_active_at), String(e.latest));
  await interruptRunningSandboxRuns(db);
  const [r] = await query(db, "SELECT status,finished_at FROM sandbox_runs WHERE id=?", [runId]);
  assert.equal(r.status, "interrupted");
  const [updated] = await query(db, "SELECT last_active_at,side_revision FROM threads WHERE id=?", [
    f.thread.id,
  ]);
  assert.equal(String(updated.last_active_at), String(r.finished_at));
  const [idle] = await query(db, "SELECT last_active_at FROM threads WHERE id=?", [other.id]);
  assert.match(String(idle.last_active_at), /^2000-01-01/);
  const [later] = await query(db, "SELECT last_active_at,side_revision FROM threads WHERE id=?", [
    future.id,
  ]);
  assert.match(String(later.last_active_at), /^2099-01-01/);
  assert.equal(Number(updated.side_revision), Number(revisions[f.thread.id]) + 1);
  assert.equal(
    String(
      (await query(db, "SELECT side_revision FROM threads WHERE id=?", [other.id]))[0]
        .side_revision,
    ),
    String(revisions[other.id]),
  );
  assert.equal(Number(later.side_revision), Number(revisions[future.id]) + 1);
});

test("conditional event completion does not change a terminal event or its thread", async () => {
  const f = await fixture(),
    eventId = await event(f.message.id, "completed");
  await query(db, "UPDATE threads SET last_active_at='2000-01-01' WHERE id=?", [f.thread.id]);
  await finishAgentEvent(db, eventId, { status: "failed", onlyStatuses: ["running"] });
  assert.equal(
    (await query(db, "SELECT status FROM agent_events WHERE id=?", [eventId]))[0].status,
    "completed",
  );
  assert.match(
    String(
      (await query(db, "SELECT last_active_at FROM threads WHERE id=?", [f.thread.id]))[0]
        .last_active_at,
    ),
    /^2000-01-01/,
  );
});
