import { query } from "./db.ts";
import { notify } from "./service-notifications.ts";
import type { Db } from "./types.ts";

/** 任务行里本文件会读的列。 */
export type InboxTaskRow = {
  id: string;
  title?: string | null;
  project_id?: string | null;
  origin_thread_id?: string | null;
  source_user_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
};

async function taskRow(db: Db, taskId: string): Promise<InboxTaskRow | null> {
  const [task] = await query<InboxTaskRow>(
    db,
    "SELECT id,title,project_id,origin_thread_id,source_user_id,target_type,target_id FROM agent_tasks WHERE id=?",
    [taskId],
  );
  if (!task?.project_id || !task.origin_thread_id) return null;
  return task;
}

export async function notifyTaskTransition(
  db: Db,
  taskId: string,
  fromStatus: string | null | undefined,
  toStatus: string | null | undefined,
  inboxKind: string | null = null,
): Promise<void> {
  if (!toStatus || toStatus === fromStatus) return;
  const task = await taskRow(db, taskId);
  if (!task) return;
  const title = task.title || "未命名任务";
  if (inboxKind === "task_failed" && task.source_user_id) {
    await notify(
      db,
      task.source_user_id,
      task.project_id as string,
      "task_failed",
      `你发起的任务「${title}」已失败。`,
      task.origin_thread_id,
    );
    return;
  }
  if (toStatus === "blocked" && fromStatus !== "blocked" && task.source_user_id) {
    const same = task.target_type === "human_member" && task.target_id === task.source_user_id;
    await notify(
      db,
      task.source_user_id,
      task.project_id as string,
      "task_blocked",
      same ? `你发起的任务「${title}」已阻塞，需要你处理。` : `你发起的任务「${title}」已阻塞。`,
      task.origin_thread_id,
    );
    if (!same && task.target_type === "human_member" && task.target_id)
      await notify(
        db,
        task.target_id,
        task.project_id as string,
        "task_decision",
        `任务「${title}」堵住了，需要你处理。`,
        task.origin_thread_id,
      );
  }
  if (toStatus === "completed" && fromStatus !== "completed" && task.source_user_id)
    await notify(
      db,
      task.source_user_id,
      task.project_id as string,
      "task_completed",
      `你发起的任务「${title}」已完成。`,
      task.origin_thread_id,
    );
}

export async function notifyTaskAssigned(
  db: Db,
  task: InboxTaskRow | null | undefined,
  previousTargetId: string | null | undefined,
): Promise<void> {
  if (!task?.origin_thread_id || !task.project_id) return;
  if (task.target_type !== "human_member" || !task.target_id) return;
  if (task.target_id === previousTargetId) return;
  await notify(
    db,
    task.target_id,
    task.project_id,
    "task_assigned",
    `任务「${task.title || "未命名任务"}」已转交给你。`,
    task.origin_thread_id,
  );
}
