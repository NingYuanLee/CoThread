import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.js";
import { Service, HttpError } from "./service.js";

export async function queueContextCompression(service, user, threadId) {
  if (user.kind !== "session") throw new HttpError(403, "需要登录后操作");
  return transaction(service.db, async (db) => {
    await service.thread(user, threadId, true, db);
    await query(
      db,
      "INSERT IGNORE INTO agent_sessions(thread_id,session_id) VALUES(?,?)",
      [threadId, randomUUID()],
    );
    const [session] = await query(
      db,
      "SELECT compact_status FROM agent_sessions WHERE thread_id=? FOR UPDATE",
      [threadId],
    );
    if (["queued", "running"].includes(session.compact_status))
      return { status: session.compact_status };
    await query(
      db,
      "UPDATE agent_sessions SET compact_status='queued',compact_requested_by=?,compact_error=NULL,compact_result=NULL WHERE thread_id=?",
      [user.id, threadId],
    );
    return { status: "queued" };
  });
}

export async function processNextContextCompression(db, openRuntime) {
  const job = await transaction(db, async (conn) => {
    const [next] = await query(
      conn,
      "SELECT thread_id,compact_requested_by FROM agent_sessions WHERE compact_status='queued' ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED",
    );
    if (next)
      await query(
        conn,
        "UPDATE agent_sessions SET compact_status='running' WHERE thread_id=?",
        [next.thread_id],
      );
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
          : "上下文压缩未完成，请稍后重试。",
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
  }
  return true;
}
