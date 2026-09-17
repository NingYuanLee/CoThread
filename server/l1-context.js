import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import { publishWork } from "./work-events.js";
import { contextUsage } from "../shared/context.js";
import { L1_MAINTENANCE_TASKS, normalizeL1Task } from "../shared/agent-label.js";
import { nativeHistoryFromCheckpoint, nativeHistoryFromLiveHome } from "./l3-session.js";

export async function readL1TaskSession(service, user, projectId, task) {
  const scopedTask = normalizeL1Task(task);
  if (!L1_MAINTENANCE_TASKS.includes(scopedTask)) throw new HttpError(400, "请指定维护任务");
  await service.project(user, projectId);
  const [row] = await query(service.db,
    `SELECT status,last_error,checkpoint,context_stats,compact_status,compact_error,compact_result
     FROM agent_project_sessions WHERE project_id=? AND task=? AND scope_id=?`,
    [projectId, scopedTask, projectId]);
  let messages = nativeHistoryFromCheckpoint(row?.checkpoint);
  if (!messages.length) messages = await nativeHistoryFromLiveHome(`l1-${scopedTask}-${projectId}`);
  return {
    task: scopedTask,
    status: row?.status || "idle",
    progress: null,
    running: row?.status === "running",
    error: row?.last_error || null,
    contextUsage: contextUsage(row || null, [], []),
    messages,
    events: [],
    pending: [],
  };
}

export async function queueL1ContextCompression(service, user, projectId, task) {
  if (user.kind !== "session") throw new HttpError(403, "需要登录后操作");
  const scopedTask = normalizeL1Task(task);
  if (!L1_MAINTENANCE_TASKS.includes(scopedTask)) throw new HttpError(400, "请指定维护任务");
  await service.project(user, projectId);
  const result = await transaction(service.db, async (db) => {
    const [session] = await query(db,
      `SELECT id,compact_status FROM agent_project_sessions
       WHERE project_id=? AND task=? AND scope_id=? FOR UPDATE`,
      [projectId, scopedTask, projectId]);
    if (!session) throw new HttpError(404, "该维护 Agent 还没有上下文");
    if (["queued", "running"].includes(session.compact_status))
      return { status: session.compact_status };
    await query(db, `UPDATE agent_project_sessions SET compact_status='queued',compact_requested_by=?,
      compact_error=NULL,compact_result=NULL WHERE id=?`, [user.id, session.id]);
    return { status: "queued" };
  });
  publishWork(service.db);
  return result;
}

export async function processNextL1ContextCompression(db, options = {}) {
  const filters = ["compact_status='queued'"];
  const params = [];
  if (options.projectId) { filters.push("project_id=?"); params.push(options.projectId); }
  if (options.task) { filters.push("task=?"); params.push(normalizeL1Task(options.task)); }
  const [candidate] = await query(db,
    `SELECT id,project_id,task FROM agent_project_sessions WHERE ${filters.join(" AND ")}
     ORDER BY updated_at LIMIT 1`, params);
    if (!candidate) return false;
  const { compactL1Session, l1SessionScope } = await import("./l1-agent.js");
  const scope = l1SessionScope(candidate.task, { projectId: candidate.project_id });
  const connection = await db.getConnection();
  const lockName = `cothread-l1:${scope.task}:${scope.scopeId}`.slice(0, 64);
  let locked = false;
  try {
    const [lock] = await query(connection, "SELECT GET_LOCK(?,0) acquired", [lockName]);
    if (Number(lock.acquired) !== 1) return false;
    locked = true;
    const job = await transaction(db, async (conn) => {
      const [next] = await query(conn,
        `SELECT id,project_id,task FROM agent_project_sessions WHERE id=? AND compact_status='queued'
         FOR UPDATE SKIP LOCKED`, [candidate.id]);
      if (!next) return null;
      await query(conn, "UPDATE agent_project_sessions SET compact_status='running' WHERE id=?", [next.id]);
      return next;
    });
    if (!job) return false;
    try {
      const result = await compactL1Session(db, job.project_id, job.task, {
        ...options.l1Options,
        sessionLockHeld: true,
      });
      await query(db, `UPDATE agent_project_sessions SET compact_status='completed',compact_result=?,
        compact_error=NULL WHERE id=?`, [JSON.stringify(result), job.id]);
    } catch (error) {
      await query(db, `UPDATE agent_project_sessions SET compact_status='failed',compact_error=? WHERE id=?`,
        [
          /timeout|timed out|abort|cancel/i.test(`${error.name} ${error.message}`)
            ? "上下文压缩超时，已停止。维护记录仍保留，可以重试。"
            : "上下文压缩未完成，任务已退出。维护记录仍保留，可以重试。",
          job.id,
        ]);
      console.error("L1 context compression failed", { type: error.name });
    }
    return true;
  } finally {
    if (locked) await query(connection, "SELECT RELEASE_LOCK(?)", [lockName]);
    connection.release();
  }
}
