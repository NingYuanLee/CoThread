/** 任务域：access。内部依赖具体领域模块，不依赖 task-pool 兼容入口。 */

import { query } from "./db.js";
import { HttpError } from "./http-error.js";

import { AGENT_MEMBER } from "../shared/agent-member.js";

import { isL2OwnResponsibility } from "./task-pool-helpers.js";

import { targetTypes, FOREIGN_TASK_AUTH } from "./task-policy.js";
export function assertTarget(type, id) {
  if (!targetTypes.has(type) || typeof id !== "string" || !id)
    throw new HttpError(400, "任务目标无效");
}

export function assertActorCanUpdateTask(task, actor) {
  if (actor?.type === "dsh_l3") {
    if (task.execution_agent_type !== "dsh_l3" || task.execution_agent_id !== actor.id)
      throw new HttpError(403, "只有当前任务目标可以更新任务");
    return;
  }
  if (task.target_type !== actor.type || task.target_id !== actor.id)
    throw new HttpError(403, "只有当前任务目标可以更新任务");
}

export async function currentThreadL2Session(conn, threadId, projectId) {
  if (!threadId) return null;
  const [row] = await query(
    conn,
    `SELECT s.session_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
    WHERE t.id=? AND (? IS NULL OR t.project_id=?)`,
    [threadId, projectId || null, projectId || null],
  );
  return row || null;
}

export async function adoptCurrentIterationL2(conn, task, l2SessionId) {
  if (!task || task.target_type !== "l2_session") return task;
  if (task.target_id === l2SessionId) return task;
  const [session] = await query(conn, "SELECT thread_id FROM agent_sessions WHERE session_id=?", [
    l2SessionId,
  ]);
  if (!session || !task.origin_thread_id || task.origin_thread_id !== session.thread_id)
    throw new HttpError(404, "当前 L2 没有这个可委派任务");
  await query(
    conn,
    "UPDATE agent_tasks SET target_id=?,claimed_by_type='l2_session',claimed_by_id=? WHERE id=?",
    [l2SessionId, l2SessionId, task.id],
  );
  return {
    ...task,
    target_id: l2SessionId,
    claimed_by_type: "l2_session",
    claimed_by_id: l2SessionId,
  };
}

export async function hasHumanMemberAuthorization(conn, projectId, actor) {
  const userId = actor?.authorizedByUserId;
  if (!userId || userId === AGENT_MEMBER.id) return false;
  const [member] = await query(
    conn,
    `SELECT user_id FROM members WHERE project_id=? AND user_id=? AND role<>'viewer'`,
    [projectId, userId],
  );
  return !!member;
}

export async function assertHumanMemberAuthorization(
  conn,
  projectId,
  actor,
  message = FOREIGN_TASK_AUTH,
) {
  if (await hasHumanMemberAuthorization(conn, projectId, actor)) return;
  throw new HttpError(403, message);
}

export async function assertL2CanOperateTask(conn, actor, task) {
  if (actor?.type !== "l2_session") throw new HttpError(403, "只有当前迭代的 L2 可以跨任务安排");
  const [session] = await query(
    conn,
    `SELECT s.thread_id, t.project_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
    WHERE s.session_id=?`,
    [actor.id],
  );
  if (!session) {
    if (task.origin_thread_id) {
      const current = await currentThreadL2Session(conn, task.origin_thread_id, task.project_id);
      if (current) throw new HttpError(409, "L2 会话已轮换，请重试本轮调度");
    }
    throw new HttpError(403, "当前 L2 不能操作其他项目的任务");
  }
  if (session.project_id !== task.project_id)
    throw new HttpError(403, "当前 L2 不能操作其他项目的任务");
  if (!task.origin_thread_id || task.origin_thread_id !== session.thread_id)
    throw new HttpError(403, "当前 L2 只能安排本迭代锁定的任务");
  if (!isL2OwnResponsibility(task))
    await assertHumanMemberAuthorization(conn, task.project_id, actor);
}
