import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";

// Call inside the same transaction as the write/start it protects.
export async function lockIteration(conn, threadId, projectId) {
  if (!threadId) throw new HttpError(400, "任务必须属于一个迭代");
  const [thread] = await query(conn, "SELECT * FROM threads WHERE id=? FOR UPDATE", [threadId]);
  if (!thread) throw new HttpError(404, "迭代不存在");
  if (projectId && thread.project_id !== projectId) throw new HttpError(403, "迭代不属于当前项目");
  return thread;
}

export async function assertIterationWritable(conn, threadId, projectId) {
  const thread = await lockIteration(conn, threadId, projectId);
  if (thread.status !== "active")
    throw new HttpError(
      409,
      thread.status === "archiving"
        ? "此迭代正在归档，消息、任务及背景目标已冻结，请先撤回归档"
        : "此迭代已归档，无法修改",
    );
  return thread;
}

export async function lockTaskIteration(conn, taskId) {
  const [before] = await query(
    conn,
    "SELECT origin_thread_id,project_id FROM agent_tasks WHERE id=?",
    [taskId],
  );
  if (!before) throw new HttpError(404, "任务不存在");
  // Existing unscoped legacy tasks remain readable/manageable, but new ones are forbidden.
  if (!before.origin_thread_id) return null;
  const thread = await assertIterationWritable(conn, before.origin_thread_id, before.project_id);
  const [after] = await query(
    conn,
    "SELECT origin_thread_id FROM agent_tasks WHERE id=? FOR UPDATE",
    [taskId],
  );
  if (!after || after.origin_thread_id !== before.origin_thread_id)
    throw new HttpError(409, "任务所属迭代已变化，请刷新后重试");
  return thread;
}

export async function withIterationWrite(db, threadId, operation, projectId) {
  const run = async (conn) => {
    await assertIterationWritable(conn, threadId, projectId);
    return operation(conn);
  };
  return typeof db.getConnection === "function" ? transaction(db, run) : run(db);
}

export async function withTaskIterationWrite(db, taskId, operation) {
  const run = async (conn) => {
    await lockTaskIteration(conn, taskId);
    return operation(conn);
  };
  return typeof db.getConnection === "function" ? transaction(db, run) : run(db);
}
