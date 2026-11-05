/** 任务域：access。内部依赖具体领域模块，不依赖 task-pool 兼容入口。 */

import { query } from "./db.ts";
import { HttpError } from "./http-error.ts";

import { AGENT_MEMBER } from "../shared/agent-member.js";

import { isXiaoxiangOwnResponsibility } from "./task-pool-helpers.ts";

import { targetTypes, FOREIGN_TASK_AUTH } from "./task-policy.ts";
import type { Db } from "./types.ts";

/** 任务行里本文件会读的字段。 */
export type AccessTask = {
  id: string;
  execution_agent_type?: string | null;
  execution_agent_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  origin_thread_id?: string | null;
  project_id?: string | null;
  [column: string]: unknown;
};

/** 发起或操作任务的主体。 */
export type TaskActor = {
  type?: string | null;
  id?: string | null;
  authorizedByUserId?: string | null;
};

export function assertTarget(type: unknown, id: unknown): void {
  if (!targetTypes.has(type as string) || typeof id !== "string" || !id)
    throw new HttpError(400, "任务目标无效");
}

export function assertActorCanUpdateTask(
  task: AccessTask,
  actor: TaskActor | null | undefined,
): void {
  if (actor?.type === "child_agent") {
    if (task.execution_agent_type !== "child_agent" || task.execution_agent_id !== actor.id)
      throw new HttpError(403, "只有当前任务目标可以更新任务");
    return;
  }
  if (task.target_type !== actor?.type || task.target_id !== actor?.id)
    throw new HttpError(403, "只有当前任务目标可以更新任务");
}

export async function currentThreadXiaoxiangSession(
  conn: Db,
  threadId: string | null | undefined,
  projectId?: string | null,
): Promise<Record<string, unknown> | null> {
  if (!threadId) return null;
  const [row] = await query<Record<string, unknown>>(
    conn,
    `SELECT s.session_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
    WHERE t.id=? AND (? IS NULL OR t.project_id=?)`,
    [threadId, projectId || null, projectId || null],
  );
  return row || null;
}

export async function adoptCurrentIterationXiaoxiang<T extends AccessTask>(
  conn: Db,
  task: T | null | undefined,
  xiaoxiangSessionId: string,
): Promise<T | AccessTask | null | undefined> {
  if (!task || task.target_type !== "xiaoxiang") return task;
  if (task.target_id === xiaoxiangSessionId) return task;
  const [session] = await query<{ thread_id?: string | null }>(
    conn,
    "SELECT thread_id FROM agent_sessions WHERE session_id=?",
    [xiaoxiangSessionId],
  );
  if (!session || !task.origin_thread_id || task.origin_thread_id !== session.thread_id)
    throw new HttpError(404, "当前 小祥 没有这个可委派任务");
  await query(
    conn,
    "UPDATE agent_tasks SET target_id=?,claimed_by_type='xiaoxiang',claimed_by_id=? WHERE id=?",
    [xiaoxiangSessionId, xiaoxiangSessionId, task.id],
  );
  return {
    ...task,
    target_id: xiaoxiangSessionId,
    claimed_by_type: "xiaoxiang",
    claimed_by_id: xiaoxiangSessionId,
  };
}

export async function hasHumanMemberAuthorization(
  conn: Db,
  projectId: string,
  actor: TaskActor | null | undefined,
): Promise<boolean> {
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
  conn: Db,
  projectId: string,
  actor: TaskActor | null | undefined,
  message: string = FOREIGN_TASK_AUTH,
): Promise<void> {
  if (await hasHumanMemberAuthorization(conn, projectId, actor)) return;
  throw new HttpError(403, message);
}

export async function assertXiaoxiangCanOperateTask(
  conn: Db,
  actor: TaskActor | null | undefined,
  task: AccessTask,
): Promise<void> {
  if (actor?.type !== "xiaoxiang") throw new HttpError(403, "只有当前迭代的 小祥 可以跨任务安排");
  const [session] = await query<{ thread_id?: string | null; project_id?: string | null }>(
    conn,
    `SELECT s.thread_id, t.project_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
    WHERE s.session_id=?`,
    [actor.id],
  );
  if (!session) {
    if (task.origin_thread_id) {
      const current = await currentThreadXiaoxiangSession(
        conn,
        task.origin_thread_id,
        task.project_id,
      );
      if (current) throw new HttpError(409, "小祥 会话已轮换，请重试本轮调度");
    }
    throw new HttpError(403, "当前 小祥 不能操作其他项目的任务");
  }
  if (session.project_id !== task.project_id)
    throw new HttpError(403, "当前 小祥 不能操作其他项目的任务");
  if (!task.origin_thread_id || task.origin_thread_id !== session.thread_id)
    throw new HttpError(403, "当前 小祥 只能安排本迭代锁定的任务");
  if (!isXiaoxiangOwnResponsibility(task))
    await assertHumanMemberAuthorization(conn, task.project_id as string, actor);
}
