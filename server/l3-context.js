import { query, transaction } from "./db.js";
import { HttpError, Service } from "./service.js";
import { publishWork } from "./work-events.js";
import { sessionLockName } from "./session-lock.js";

export async function queueL3ContextCompression(service, user, threadId, messageId) {
  if (user.kind !== "session") throw new HttpError(403, "需要登录后操作");
  if (!messageId) throw new HttpError(400, "请指定执行任务");
  await service.thread(user, threadId, true);
  const result = await transaction(service.db, async (db) => {
    const [reply] = await query(db,
      `SELECT r.message_id,r.parent_message_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id
       WHERE r.message_id=? AND m.thread_id=? FOR UPDATE`, [messageId, threadId]);
    if (!reply?.parent_message_id) throw new HttpError(404, "该执行任务还没有上下文");
    await query(db, "INSERT IGNORE INTO agent_child_sessions(message_id,session_id) VALUES(?,UUID())", [messageId]);
    const [session] = await query(db,
      "SELECT compact_status FROM agent_child_sessions WHERE message_id=? FOR UPDATE", [messageId]);
    if (!session) throw new HttpError(404, "该执行任务还没有上下文");
    if (["queued", "running"].includes(session.compact_status))
      return { status: session.compact_status };
    await query(db, `UPDATE agent_child_sessions SET compact_status='queued',compact_requested_by=?,
      compact_error=NULL,compact_result=NULL WHERE message_id=?`, [user.id, messageId]);
    return { status: "queued" };
  });
  publishWork(service.db, threadId);
  return result;
}

export async function processNextL3ContextCompression(db, options = {}) {
  const filters = ["s.compact_status='queued'"];
  const params = [];
  if (options.threadId) { filters.push("m.thread_id=?"); params.push(options.threadId); }
  if (options.messageId) { filters.push("s.message_id=?"); params.push(options.messageId); }
  const [candidate] = await query(db,
    `SELECT s.message_id,s.compact_requested_by,m.thread_id,r.parent_message_id,r.agent_slot
     FROM agent_child_sessions s JOIN messages m ON m.id=s.message_id
     JOIN assistant_replies r ON r.message_id=s.message_id
     WHERE ${filters.join(" AND ")} ORDER BY s.updated_at LIMIT 1`, params);
  if (!candidate) return false;
  const lockName = sessionLockName(candidate.message_id);
  const connection = await db.getConnection();
  let locked = false;
  try {
    const [lock] = await query(connection, "SELECT GET_LOCK(?,0) acquired", [lockName]);
    if (Number(lock.acquired) !== 1) return false;
    locked = true;
    const job = await transaction(db, async (conn) => {
      const [next] = await query(conn,
        `SELECT s.message_id,s.compact_requested_by,m.thread_id,r.parent_message_id,r.agent_slot,r.status,r.execution_active
         FROM agent_child_sessions s JOIN messages m ON m.id=s.message_id
         JOIN assistant_replies r ON r.message_id=s.message_id
         WHERE s.message_id=? AND s.compact_status='queued' FOR UPDATE SKIP LOCKED`, [candidate.message_id]);
      if (!next) return null;
      if (next.status === "running" || next.execution_active) return null;
      await query(conn, "UPDATE agent_child_sessions SET compact_status='running' WHERE message_id=?", [next.message_id]);
      return next;
    });
    if (!job) return false;
    let runtime;
    try {
      const service = new Service(db);
      const user = { id: job.compact_requested_by, kind: "session" };
      const context = await service.context(user, job.thread_id);
      const open = options.openRuntime || (await import("./agent.js")).openAgentRuntime;
      runtime = await open(context, {
        db, user,
        job: {
          thread_id: job.thread_id,
          message_id: job.message_id,
          parent_message_id: job.parent_message_id,
          agent_slot: job.agent_slot,
        },
        observe: false, autoCompact: false, sessionLockHeld: true, role: "executor",
        createHarness: options.createHarness,
      });
      const result = await runtime.request("compact");
      await runtime.close(true);
      runtime = undefined;
      await query(db, `UPDATE agent_child_sessions SET compact_status='completed',compact_result=?,
        compact_error=NULL WHERE message_id=?`, [JSON.stringify(result), job.message_id]);
    } catch (error) {
      if (runtime) await runtime.close().catch(() => {});
      await query(db, `UPDATE agent_child_sessions SET compact_status='failed',compact_error=? WHERE message_id=?`,
        [
          /timeout|timed out|abort|cancel/i.test(`${error.name} ${error.message}`)
            ? "上下文压缩超时，已停止。任务记录仍保留，可以重试。"
            : "上下文压缩未完成，任务已退出。任务记录仍保留，可以重试。",
          job.message_id,
        ]);
      console.error("L3 context compression failed", { type: error.name });
    }
    return true;
  } finally {
    if (locked) await query(connection, "SELECT RELEASE_LOCK(?)", [lockName]);
    connection.release();
  }
}
