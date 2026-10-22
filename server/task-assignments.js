/** 任务域：assignments。内部依赖具体领域模块，不依赖 task-pool 兼容入口。 */
import { lockTaskIteration } from "./iteration-state.js";

import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { publishWork } from "./work-events.js";

import { composeTaskInstruction } from "./task-pool-helpers.js";
import { recordTaskStatusChange } from "./task-pool-activity.js";

import { ASSIGN_HUMAN_AUTH, TASK_ENDED } from "./task-policy.js";
import { documentsForTaskInstruction } from "./task-documents.js";
import {
  assertTarget,
  currentThreadL2Session,
  assertHumanMemberAuthorization,
  assertL2CanOperateTask,
} from "./task-access.js";
import { getTask } from "./task-queries.js";
import { idleL3Count } from "./task-dispatch.js";
export async function reassignTask(db, taskId, actor, target, reason, messageId) {
  assertTarget(target.type, target.id);
  const result = await transaction(db, async (conn) => {
    await lockTaskIteration(conn, taskId);
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    const l2Operator = actor.type === "l2_session";
    if (l2Operator) await assertL2CanOperateTask(conn, actor, task);
    else if (task.target_type !== actor.type || task.target_id !== actor.id)
      throw new HttpError(403, "只有当前任务目标可以转交任务");
    if (task.task_type === "assist_l2" && target.type !== "l2_session")
      throw new HttpError(403, "小祥 辅助任务不能转交给其他责任主体");
    if (l2Operator && target.type === "human_member")
      await assertHumanMemberAuthorization(conn, task.project_id, actor, ASSIGN_HUMAN_AUTH);
    const reassignable = new Set([
      "pending_assignment",
      "awaiting_acceptance",
      "pending_start",
      "assigned",
      "queued",
      "waiting",
      "blocked",
    ]);
    if (l2Operator)
      ["running", "failed", "cancelled", "abandoned", "rejected"].forEach((status) =>
        reassignable.add(status),
      );
    if (!reassignable.has(task.status)) throw new HttpError(409, "当前任务状态不能转交");
    if (l2Operator) {
      await query(
        conn,
        `UPDATE agent_task_questions SET status='cancelled' WHERE task_id=? AND status='open'`,
        [taskId],
      );
      await query(
        conn,
        `UPDATE agent_task_execution_runs SET status='cancelled',error='任务转交，结束当前执行',
        finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`,
        [taskId],
      );
    }
    if (target.type === "human_member") {
      const [member] = await query(
        conn,
        "SELECT user_id FROM members WHERE project_id=? AND user_id=? AND role<>'viewer'",
        [task.project_id, target.id],
      );
      if (!member) throw new HttpError(400, "任务目标不是当前项目的可执行成员");
    } else if (task.origin_thread_id) {
      const current = await currentThreadL2Session(conn, task.origin_thread_id, task.project_id);
      if (!current) throw new HttpError(400, "任务目标不是当前项目迭代的 小祥");
      target = { ...target, id: current.session_id };
    } else {
      const [session] = await query(
        conn,
        `SELECT s.session_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
        WHERE s.session_id=? AND t.project_id=?`,
        [target.id, task.project_id],
      );
      if (!session) throw new HttpError(400, "任务目标不是当前项目迭代的 小祥");
    }
    const status =
      target.type === "human_member"
        ? "awaiting_acceptance"
        : (await idleL3Count(conn, target.id)) >= 1
          ? "running"
          : "pending_assignment";
    await query(
      conn,
      `UPDATE agent_tasks SET target_type=?,target_id=?,claimed_by_type=NULL,claimed_by_id=NULL,
      execution_agent_type=NULL,execution_agent_id=NULL,execution_mode=NULL,status=?,revision=revision+1 WHERE id=?`,
      [target.type, target.id, status, taskId],
    );
    await query(
      conn,
      `INSERT INTO agent_task_assignment_events
      (task_id,event_type,from_target_type,from_target_id,to_target_type,to_target_id,changed_by_type,changed_by_id,reason,message_id)
      VALUES(?,'transferred',?,?,?,?,?,?,?,?)`,
      [
        taskId,
        task.target_type,
        task.target_id,
        target.type,
        target.id,
        actor.type,
        actor.id,
        reason || null,
        messageId || null,
      ],
    );
    if (target.type === "l2_session") {
      await query(
        conn,
        "UPDATE agent_tasks SET claimed_by_type='l2_session',claimed_by_id=?,execution_mode='dsh_l3',execution_agent_type='dsh_l3' WHERE id=?",
        [target.id, taskId],
      );
      if (status === "running") {
        await query(
          conn,
          `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
          SELECT UUID(),id,revision,'dsh_l3','queued' FROM agent_tasks WHERE id=?`,
          [taskId],
        );
      }
    }
    await recordTaskStatusChange(conn, taskId, task.status, actor, reason || "任务转交");
    return getTask(conn, taskId);
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

export async function acceptTask(db, taskId, actor, mode = "auto") {
  const result = await transaction(db, async (conn) => {
    await lockTaskIteration(conn, taskId);
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    if (task.target_type !== actor.type || task.target_id !== actor.id)
      throw new HttpError(403, "只有当前任务目标可以确认任务");
    if (task.status !== "awaiting_acceptance") throw new HttpError(409, "任务不在待确认状态");
    if (actor.type === "human_member" && mode === "auto") {
      const [bound] = await query(
        conn,
        `SELECT c.id FROM local_executors c JOIN local_executor_projects cp ON cp.local_executor_id=c.id
        WHERE c.user_id=? AND cp.project_id=? AND c.revoked_at IS NULL LIMIT 1`,
        [actor.id, task.project_id],
      );
      mode = bound ? "member_local_executor" : "human_direct";
    }
    if (actor.type === "human_member" && !["human_direct", "member_local_executor"].includes(mode))
      throw new HttpError(400, "人类执行方式无效");
    const [connector] =
      actor.type === "human_member" && mode === "member_local_executor"
        ? await query(
            conn,
            `SELECT c.id FROM local_executors c
      JOIN local_executor_projects cp ON cp.local_executor_id=c.id AND cp.project_id=?
      WHERE c.user_id=? AND c.revoked_at IS NULL ORDER BY c.last_seen_at DESC LIMIT 1`,
            [task.project_id, actor.id],
          )
        : [];
    if (actor.type === "human_member" && mode === "member_local_executor" && !connector) {
      // 区分「没有本地执行器 / 本地执行器离线 / 在线但未绑定当前项目」，提示成员该去做什么。
      const [state] = await query(
        conn,
        `SELECT COUNT(*) total,
        SUM(c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND)) online
        FROM local_executors c WHERE c.user_id=? AND c.revoked_at IS NULL`,
        [actor.id],
      );
      if (!Number(state?.total))
        throw new HttpError(
          409,
          "你还没有已授权的本地执行器：请先运行本地执行器并在网页完成授权，或改为「由我直接完成」",
        );
      if (!Number(state?.online))
        throw new HttpError(
          409,
          "本地执行器当前离线：请确认本地执行器正在运行并已登录，或改为「由我直接完成」",
        );
      throw new HttpError(
        409,
        "本地执行器在线，但尚未绑定当前项目：请在本地执行器的项目列表中为该项目选择 Git 根目录并绑定，再重新接受任务",
      );
    }
    const executionType =
      actor.type === "human_member"
        ? mode === "member_local_executor"
          ? "human_local_executor"
          : "human_self"
        : "dsh_l3";
    const nextStatus =
      executionType === "human_self"
        ? "running"
        : executionType === "human_local_executor"
          ? "pending_start"
          : "running";
    const runStatus = executionType === "human_self" ? "running" : "queued";
    await query(
      conn,
      `UPDATE agent_tasks SET status=?,claimed_by_type=?,claimed_by_id=?,accepted_by_type=?,accepted_by_id=?,accepted_at=UTC_TIMESTAMP(3),
      execution_mode=?,execution_agent_type=?,execution_agent_id=? WHERE id=?`,
      [
        nextStatus,
        actor.type,
        actor.id,
        actor.type,
        actor.id,
        mode,
        executionType,
        executionType === "human_local_executor" ? connector.id : actor.id,
        taskId,
      ],
    );
    await query(
      conn,
      `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,executor_id,executor_member_id,local_executor_id,status,started_at)
      SELECT UUID(),id,revision,?,?,?,?,?,IF(?='running',UTC_TIMESTAMP(3),NULL) FROM agent_tasks WHERE id=?`,
      [
        executionType,
        executionType === "human_local_executor" ? connector.id : actor.id,
        executionType === "human_local_executor" ? actor.id : null,
        executionType === "human_local_executor" ? connector.id : null,
        runStatus,
        runStatus,
        taskId,
      ],
    );
    if (executionType === "human_local_executor") {
      const [existingAdapter] = await query(
        conn,
        "SELECT id FROM local_executor_tasks WHERE agent_task_id=? FOR UPDATE",
        [taskId],
      );
      if (!existingAdapter) {
        const [binding] = await query(
          conn,
          `SELECT cp.policy,cp.allow_git_push FROM local_executor_projects cp
          WHERE cp.local_executor_id=? AND cp.project_id=?`,
          [connector.id, task.project_id],
        );
        if (!binding) throw new HttpError(409, "本地执行器未关联当前项目");
        const instructionRefs = await documentsForTaskInstruction(
          conn,
          task.project_id,
          task.document_refs,
          task.folder_refs,
        );
        await query(
          conn,
          `INSERT INTO local_executor_tasks
          (id,agent_task_id,local_executor_id,project_id,thread_id,message_id,requested_by,assigned_to,member_id_snapshot,instruction,policy,allow_git_push,status,progress)
          VALUES(UUID(),?,?,?,?,?,?,?,?,?,?,?, 'queued','等待本地执行器领取')`,
          [
            taskId,
            connector.id,
            task.project_id,
            task.origin_thread_id,
            task.source_message_id,
            task.source_user_id || actor.id,
            actor.id,
            actor.id,
            composeTaskInstruction(task, instructionRefs.documents, instructionRefs.folders),
            binding.policy,
            binding.allow_git_push,
          ],
        );
      }
    }
    await recordTaskStatusChange(
      conn,
      taskId,
      task.status,
      actor,
      executionType === "human_local_executor"
        ? "成员接受任务，交给本地执行器执行"
        : executionType === "human_self"
          ? "成员接受任务，由本人完成"
          : "接受任务",
    );
    return getTask(conn, taskId);
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

export async function claimTask(db, taskId, actor) {
  return transaction(db, async (conn) => {
    await lockTaskIteration(conn, taskId);
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    if (task.target_type !== actor.type || task.target_id !== actor.id)
      throw new HttpError(403, "只有当前目标可以认领任务");
    if (TASK_ENDED.includes(task.status)) throw new HttpError(409, "任务已经结束");
    await query(
      conn,
      "UPDATE agent_tasks SET claimed_by_type=?,claimed_by_id=?,status='running',revision=revision+1 WHERE id=?",
      [actor.type, actor.id, taskId],
    );
    await query(
      conn,
      "UPDATE agent_task_execution_runs SET status='running',started_at=COALESCE(started_at,UTC_TIMESTAMP(3)) WHERE task_id=? AND status='queued' ORDER BY created_at DESC LIMIT 1",
      [taskId],
    );
    await recordTaskStatusChange(conn, taskId, task.status, actor, "认领并开始执行");
    return getTask(conn, taskId);
  });
}

export async function rejectTask(db, taskId, actor, reason) {
  const result = await transaction(db, async (conn) => {
    await lockTaskIteration(conn, taskId);
    const [task] = await query(
      conn,
      "SELECT * FROM agent_tasks WHERE id=? AND target_type=? AND target_id=? FOR UPDATE",
      [taskId, actor.type, actor.id],
    );
    if (!task) throw new HttpError(404, "任务不存在或不属于当前目标");
    if (task.status !== "awaiting_acceptance") throw new HttpError(409, "任务不在待确认状态");
    await query(
      conn,
      "UPDATE agent_tasks SET status='rejected',progress=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
      [reason || "目标成员拒绝任务", taskId],
    );
    await query(
      conn,
      `INSERT INTO agent_task_assignment_events
      (task_id,event_type,from_target_type,from_target_id,changed_by_type,changed_by_id,reason)
      VALUES(?,'rejected',?,?,?,?,?)`,
      [
        taskId,
        task.target_type,
        task.target_id,
        actor.type,
        actor.id,
        reason || "目标成员拒绝任务",
      ],
    );
    await recordTaskStatusChange(conn, taskId, task.status, actor, reason || "目标成员拒绝任务");
    return getTask(conn, taskId);
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

export async function cancelTask(db, taskId, actor, reason) {
  const result = await transaction(db, async (conn) => {
    await lockTaskIteration(conn, taskId);
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    if (task.status !== "awaiting_acceptance")
      throw new HttpError(409, "只有待确认任务可以由来源人取消");
    const source =
      actor.type === "human_member" &&
      (task.source_user_id === actor.id ||
        (task.created_by_type === "human_member" && task.created_by_id === actor.id));
    if (!source) throw new HttpError(403, "只有任务来源人可以取消待确认任务");
    await query(
      conn,
      "UPDATE agent_tasks SET status='cancelled',progress=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
      [reason || "任务来源人取消任务", taskId],
    );
    await recordTaskStatusChange(conn, taskId, task.status, actor, reason || "任务来源人取消任务");
    return getTask(conn, taskId);
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}
