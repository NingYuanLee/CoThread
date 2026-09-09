import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.js";
import { Service, HttpError } from "./service.js";

export { queueContextCompression } from "./queue-context.js";

export async function processNextContextCompression(db, openRuntime, threadId) {
  const [candidate] = await query(db, `SELECT thread_id FROM agent_sessions WHERE compact_status='queued' ${threadId ? "AND thread_id=?" : ""} ORDER BY updated_at LIMIT 1`, threadId ? [threadId] : []);
  if (!candidate) return false;
  const connection = await db.getConnection(), key = `cothread-context:${candidate.thread_id}`;
  let locked = false;
  try {
    const [lock] = await query(connection, "SELECT GET_LOCK(?,0) acquired", [key]);
    if (Number(lock.acquired) !== 1) return false;
    locked = true;
    return await compressClaimedDiscussion(db, openRuntime, candidate.thread_id);
  } finally {
    if (locked) await query(connection, "SELECT RELEASE_LOCK(?)", [key]);
    connection.release();
  }
}

async function compressClaimedDiscussion(db, openRuntime, threadId) {
  const job = await transaction(db, async (conn) => {
    const [next] = await query(
      conn,
      `SELECT thread_id,compact_requested_by FROM agent_sessions WHERE compact_status='queued' ${threadId ? "AND thread_id=?" : ""} ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      threadId ? [threadId] : [],
    );
    if (next) {
      const [thread] = await query(conn,
        "SELECT id FROM threads WHERE id=? FOR UPDATE SKIP LOCKED", [next.thread_id]);
      if (!thread) return;
      const [active] = await query(conn,
        `SELECT r.message_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id
         WHERE m.thread_id=? AND r.parent_message_id IS NULL AND (r.status='running' OR r.execution_active=TRUE) LIMIT 1`, [next.thread_id]);
      if (active) return;
      await query(
        conn,
        "UPDATE agent_sessions SET compact_status='running' WHERE thread_id=?",
        [next.thread_id],
      );
    }
    return next;
  });
  if (!job) return false;
  let runtime;
  try {
    const service = new Service(db);
    const user = { id: job.compact_requested_by, kind: "session" };
    await service.thread(user, job.thread_id, true);
    const context = await service.context(user, job.thread_id);
    const open = openRuntime || (await import("./agent.js")).openAgentRuntime;
    runtime = await open(context, {
      db,
      user,
      job: { thread_id: job.thread_id },
      autoCompact: false,
    });
    const result = await runtime.request("compact");
    await runtime.close(true);
    runtime = undefined;
    await query(
      db,
      "UPDATE agent_sessions SET compact_status='completed',compact_result=?,compact_error=NULL WHERE thread_id=?",
      [JSON.stringify(result), job.thread_id],
    );
  } catch (error) {
    if (runtime) await runtime.close().catch(() => {});
    await query(
      db,
      "UPDATE agent_sessions SET compact_status='failed',compact_error=? WHERE thread_id=?",
      [
        error instanceof HttpError
          ? error.message
          : /timeout|timed out|abort|cancel/i.test(`${error.name} ${error.message}`)
            ? "上下文压缩超时，已停止。聊天记录和文件仍保留，可以重试。"
            : "上下文压缩未完成，任务已退出。聊天记录和文件仍保留，可以重试。",
        job.thread_id,
      ],
    );
    console.error("Context compression failed", { type: error.name });
  }
  return true;
}

// Upgrade existing sessions without a model request or admitting newer messages.
export async function refreshNextContextStats(db) {
  const [stored] = await query(
    db,
    `SELECT s.thread_id,t.created_by FROM agent_sessions s
    JOIN threads t ON t.id=s.thread_id WHERE s.context_stats IS NULL AND s.checkpoint IS NOT NULL
    AND s.compact_status<>'failed' ORDER BY s.updated_at LIMIT 1`,
  );
  if (!stored) return false;
  const connection = await db.getConnection(), key = `cothread-context:${stored.thread_id}`;
  const [lock] = await query(connection, "SELECT GET_LOCK(?,0) acquired", [key]);
  if (Number(lock.acquired) !== 1) { connection.release(); return false; }
  let runtime;
  try {
    const user = { id: stored.created_by, kind: "session" };
    const context = await new Service(db).context(user, stored.thread_id);
    runtime = await (
      await import("./agent.js")
    ).openAgentRuntime(context, {
      db,
      user,
      job: { thread_id: stored.thread_id },
      observe: false,
      autoCompact: false,
    });
    await runtime.close(true);
  } catch (error) {
    if (runtime) await runtime.close().catch(() => {});
    await query(
      db,
      "UPDATE agent_sessions SET compact_status='failed',compact_error='历史上下文计量暂不可用，下次回复时将重新读取。' WHERE thread_id=?",
      [stored.thread_id],
    );
    console.error("Context measurement failed", { type: error.name });
  } finally {
    await query(connection, "SELECT RELEASE_LOCK(?)", [key]);
    connection.release();
  }
  return true;
}
