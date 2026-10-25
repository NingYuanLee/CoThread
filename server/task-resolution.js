/** 任务域：resolution。内部依赖具体领域模块，不依赖 task-pool 兼容入口。 */
import { lockTaskIteration } from "./iteration-state.js";

import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { publishWork } from "./work-events.js";

import { parseDocumentRefs, withChildDispatchGate } from "./task-pool-helpers.js";
import { recordTaskStatusChange } from "./task-pool-activity.js";

import {
  TASK_ENDED,
  MAX_TASK_RETRIES,
  MAX_EXECUTOR_ATTEMPTS,
  MAX_DISTINCT_EXECUTORS,
  arrangeableStatuses,
} from "./task-policy.js";
import { adoptCurrentIterationXiaoxiang, assertXiaoxiangCanOperateTask } from "./task-access.js";
import { getTask } from "./task-queries.js";
import { idleChildCount } from "./task-dispatch.js";
export async function rejectionReviewActor(db, taskId, conn = db) {
  const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=?", [taskId]);
  if (!task) throw new HttpError(404, "任务不存在");
  const events = await query(
    conn,
    `SELECT id,event_type,changed_by_type,changed_by_id FROM agent_task_assignment_events
    WHERE task_id=? ORDER BY id DESC`,
    [taskId],
  );
  const rejected = events.find((event) => event.event_type === "rejected");
  if (!rejected) return { task, rejected: null, reviewer: null, resolved: false };
  const resolved = events.some(
    (event) => event.id > rejected.id && ["acknowledged", "reopened"].includes(event.event_type),
  );
  const priorHuman = events.find(
    (event) => event.id < rejected.id && event.changed_by_type === "human_member",
  );
  const reviewer = priorHuman
    ? { type: "human_member", id: priorHuman.changed_by_id }
    : task.created_by_type === "human_member"
      ? { type: "human_member", id: task.created_by_id }
      : task.created_by_type === "xiaoxiang"
        ? { type: "xiaoxiang", id: task.created_by_id }
        : task.source_user_id
          ? { type: "human_member", id: task.source_user_id }
          : null;
  return { task, rejected, reviewer, resolved };
}

export async function taskRejectionReview(db, taskId) {
  const review = await rejectionReviewActor(db, taskId);
  return {
    rejected: !!review.rejected,
    resolved: review.resolved,
    reviewer_type: review.reviewer?.type || null,
    reviewer_id: review.reviewer?.id || null,
  };
}

export async function assertRejectionReviewer(review, actor, conn) {
  if (!review.rejected || review.task.status !== "rejected")
    throw new HttpError(409, "任务没有待处理的拒绝结果");
  if (review.resolved) throw new HttpError(409, "拒绝结果已经处理");
  if (actor.type === "xiaoxiang") {
    await assertXiaoxiangCanOperateTask(conn, actor, review.task);
    return;
  }
  if (!review.reviewer || review.reviewer.type !== actor.type || review.reviewer.id !== actor.id)
    throw new HttpError(403, "只有任务创建者或最近转发者可以处理拒绝结果");
}

export async function acknowledgeTaskRejection(db, taskId, actor) {
  return transaction(db, async (conn) => {
    await lockTaskIteration(conn, taskId);
    const review = await rejectionReviewActor(db, taskId, conn);
    await assertRejectionReviewer(review, actor, conn);
    await query(
      conn,
      `INSERT INTO agent_task_assignment_events
      (task_id,event_type,from_target_type,from_target_id,changed_by_type,changed_by_id,reason)
      VALUES(?,'acknowledged',?,?,?,?,?)`,
      [
        taskId,
        review.task.target_type,
        review.task.target_id,
        actor.type,
        actor.id,
        "已知晓任务被拒绝",
      ],
    );
    return getTask(conn, taskId);
  });
}

export async function reopenRejectedTask(db, taskId, actor, update = {}) {
  const result = await transaction(db, async (conn) => {
    await lockTaskIteration(conn, taskId);
    const [locked] = await query(conn, "SELECT id FROM agent_tasks WHERE id=? FOR UPDATE", [
      taskId,
    ]);
    if (!locked) throw new HttpError(404, "任务不存在");
    const review = await rejectionReviewActor(db, taskId, conn);
    await assertRejectionReviewer(review, actor, conn);
    const nextStatus =
      review.task.target_type === "human_member"
        ? "awaiting_acceptance"
        : (await idleChildCount(conn, review.task.target_id)) >= 1
          ? "running"
          : "pending_assignment";
    await query(
      conn,
      `UPDATE agent_tasks SET title=COALESCE(?,title),goal=COALESCE(?,goal),constraints=IF(?,?,constraints),
      status=?,claimed_by_type=IF(target_type='xiaoxiang','xiaoxiang',NULL),
      claimed_by_id=IF(target_type='xiaoxiang',target_id,NULL),accepted_by_type=NULL,accepted_by_id=NULL,accepted_at=NULL,
      execution_mode=NULL,execution_agent_type=NULL,execution_agent_id=NULL,progress=NULL,result_summary=NULL,artifact_refs=NULL,
      finished_at=NULL,revision=revision+1 WHERE id=?`,
      [
        update.title || null,
        update.goal || null,
        update.constraints !== undefined,
        update.constraints ?? null,
        nextStatus,
        taskId,
      ],
    );
    await query(
      conn,
      `UPDATE agent_task_execution_runs SET status='cancelled',error='任务被拒绝后重新发起',
      finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`,
      [taskId],
    );
    if (nextStatus === "running" && review.task.target_type === "xiaoxiang") {
      await query(
        conn,
        `UPDATE agent_tasks SET execution_mode='child_agent',execution_agent_type='child_agent' WHERE id=?`,
        [taskId],
      );
      await query(
        conn,
        `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
        SELECT UUID(),id,revision,'child_agent','queued' FROM agent_tasks WHERE id=?`,
        [taskId],
      );
    }
    await query(
      conn,
      `INSERT INTO agent_task_assignment_events
      (task_id,event_type,from_target_type,from_target_id,to_target_type,to_target_id,changed_by_type,changed_by_id,reason)
      VALUES(?,'reopened',?,?,?,?,?,?,?)`,
      [
        taskId,
        review.task.target_type,
        review.task.target_id,
        review.task.target_type,
        review.task.target_id,
        actor.type,
        actor.id,
        update.reason || "修改后重新发起",
      ],
    );
    await recordTaskStatusChange(
      conn,
      taskId,
      review.task.status,
      actor,
      update.reason || "修改后重新发起",
    );
    return getTask(conn, taskId);
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

export async function recoverAbnormalTask(db, taskId, actor, update = {}) {
  const action =
    update.action === "cancel"
      ? "cancel"
      : update.action === "clear_binding"
        ? "clear_binding"
        : "restart";
  const result = await transaction(db, async (conn) => {
    await lockTaskIteration(conn, taskId);
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    await assertXiaoxiangCanOperateTask(conn, actor, task);
    if (task.status === "superseded" || !arrangeableStatuses.has(task.status))
      throw new HttpError(409, "当前任务不能再安排");
    if (
      action === "cancel" &&
      ["cancelled", "completed", "rejected", "abandoned"].includes(task.status)
    )
      throw new HttpError(409, "已结束任务不能取消");
    const interruptedAgentId = task.execution_agent_id || null;
    const reason = update.reason || (action === "cancel" ? "小祥 取消任务" : "小祥 重新安排任务");
    const dispatchChild =
      task.target_type === "xiaoxiang" ||
      task.execution_agent_type === "child_agent" ||
      task.task_type === "assist";
    const environmentChanged = update.environmentChanged === true;
    if (action === "clear_binding") {
      if (!dispatchChild) throw new HttpError(409, "只有子 Agent 任务可以清理执行者绑定");
      if (
        !task.execution_agent_id &&
        ["running", "queued", "pending_assignment"].includes(task.status)
      ) {
        return withChildDispatchGate(await getTask(conn, taskId), {
          action,
          noop: true,
          interruptedAgentId: null,
          recovery: { strategy: "dispatch_new_executor", created_run_id: null },
        });
      }
    }
    // 阻塞的任务不再只能等人：执行失败型阻塞（有原因/签名）且自动重试预算未耗尽时，
    // 小祥可以先自己重新安排（补指令、换执行者），预算耗尽或同一平台错误重复才必须上报来源人。
    const retryableBlocked =
      task.status === "blocked" &&
      Boolean(task.blocked_reason || task.failure_signature) &&
      Number(task.retry_count || 0) < Number(task.max_retry_count || MAX_TASK_RETRIES) &&
      !(
        task.failure_class === "platform_blocked" &&
        task.failure_signature &&
        Number(task.failure_environment_revision || 0) === Number(task.environment_revision || 0)
      );
    if (
      action !== "cancel" &&
      action !== "clear_binding" &&
      task.status === "blocked" &&
      !environmentChanged &&
      !retryableBlocked
    ) {
      throw new HttpError(
        409,
        task.resume_condition || "任务已阻塞；请先改变外部条件并明确标记 environmentChanged=true",
      );
    }
    if (
      action !== "cancel" &&
      task.status === "failed" &&
      task.failure_class === "platform_blocked" &&
      task.failure_signature &&
      Number(task.failure_environment_revision || 0) === Number(task.environment_revision || 0) &&
      !environmentChanged
    ) {
      await query(
        conn,
        `UPDATE agent_tasks SET status='blocked',blocked_reason=?,resume_condition=?
        WHERE id=?`,
        [task.failure_signature, "外部条件恢复或人工确认后再重试", taskId],
      );
      await recordTaskStatusChange(
        conn,
        taskId,
        task.status,
        actor,
        `检测到相同平台错误，停止换执行者并阻塞：${task.failure_signature}`,
      );
      return withChildDispatchGate(await getTask(conn, taskId), {
        action: "blocked",
        interruptedAgentId,
      });
    }
    if (
      action !== "cancel" &&
      Number(task.retry_count || 0) >= Number(task.max_retry_count || MAX_TASK_RETRIES)
    ) {
      await query(
        conn,
        `UPDATE agent_tasks SET status='blocked',blocked_reason=?,resume_condition=?
        WHERE id=?`,
        ["已达到任务自动重试预算", "人工调整任务或明确增加重试预算后再重试", taskId],
      );
      await recordTaskStatusChange(
        conn,
        taskId,
        task.status,
        actor,
        "达到任务自动重试预算，停止自动调度",
      );
      return withChildDispatchGate(await getTask(conn, taskId), {
        action: "blocked",
        interruptedAgentId,
      });
    }
    await query(
      conn,
      `UPDATE agent_task_questions SET status='cancelled' WHERE task_id=? AND status='open'`,
      [taskId],
    );
    await query(
      conn,
      `UPDATE agent_task_execution_runs SET status='cancelled',error=?,
      finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`,
      [action === "cancel" ? "任务被 小祥 取消" : "任务由 小祥 重新安排", taskId],
    );
    if (action === "cancel") {
      await query(
        conn,
        `UPDATE agent_tasks SET status='cancelled',progress=?,result_summary=COALESCE(?,result_summary),
        execution_agent_id=NULL,finished_at=UTC_TIMESTAMP(3),revision=revision+1 WHERE id=?`,
        [reason, update.resultSummary || reason, taskId],
      );
    } else if (dispatchChild) {
      await adoptCurrentIterationXiaoxiang(conn, task, actor.id);
      const idle = await idleChildCount(conn, actor.id);
      if (action === "restart" && task.task_type === "assist" && idle < 1)
        throw new HttpError(409, "当前没有空闲子 Agent，不能重新安排辅助任务");
      const nextStatus =
        action === "clear_binding"
          ? "pending_assignment"
          : idle >= 1
            ? "running"
            : "pending_assignment";
      await query(
        conn,
        `UPDATE agent_tasks SET title=COALESCE(?,title),goal=COALESCE(?,goal),constraints=IF(?,?,constraints),
        status=?,progress=?,result_summary=NULL,blocked_reason=NULL,resume_condition=NULL,
        execution_mode=COALESCE(execution_mode,'child_agent'),execution_agent_type=COALESCE(execution_agent_type,'child_agent'),
        execution_agent_id=NULL,preferred_executor_id=COALESCE(preferred_executor_id,?),
        environment_revision=environment_revision+IF(?,1,0),finished_at=NULL,revision=revision+1 WHERE id=?`,
        [
          update.title || null,
          update.goal || null,
          update.constraints !== undefined,
          update.constraints ?? null,
          nextStatus,
          nextStatus === "running" ? "已指派，尚未绑定子 Agent" : "待指派空闲子 Agent",
          task.execution_agent_id || null,
          environmentChanged,
          taskId,
        ],
      );
      if (nextStatus === "running" || action === "clear_binding") {
        await query(
          conn,
          `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
          SELECT UUID(),id,revision,'child_agent','queued' FROM agent_tasks WHERE id=?`,
          [taskId],
        );
      }
    } else {
      await query(
        conn,
        `UPDATE agent_tasks SET title=COALESCE(?,title),goal=COALESCE(?,goal),constraints=IF(?,?,constraints),
        status='awaiting_acceptance',progress='小祥 已重新安排，等待目标成员确认',result_summary=NULL,blocked_reason=NULL,resume_condition=NULL,
        claimed_by_type=NULL,claimed_by_id=NULL,accepted_by_type=NULL,accepted_by_id=NULL,accepted_at=NULL,
        execution_mode=NULL,execution_agent_type=NULL,execution_agent_id=NULL,finished_at=NULL,revision=revision+1 WHERE id=?`,
        [
          update.title || null,
          update.goal || null,
          update.constraints !== undefined,
          update.constraints ?? null,
          taskId,
        ],
      );
    }
    await recordTaskStatusChange(conn, taskId, task.status, actor, reason);
    return withChildDispatchGate(await getTask(conn, taskId), {
      action,
      interruptedAgentId,
      recovery: interruptedAgentId
        ? {
            strategy:
              action === "clear_binding" ? "dispatch_new_executor" : "resume_same_executor_first",
            executorId: interruptedAgentId,
            fallback:
              action === "clear_binding"
                ? "dispatch_new_executor"
                : "replace_only_after_resume_failure",
            // Recovery queues work only. No run is bound to the old executor.
            created_run_id: null,
          }
        : { strategy: "dispatch_new_executor", created_run_id: null },
    });
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

export async function inspectIterationTask(db, taskId, actor) {
  const task = await getTask(db, taskId);
  if (!task) throw new HttpError(404, "任务不存在");
  await assertXiaoxiangCanOperateTask(db, actor, task);
  const [run] = await query(
    db,
    `SELECT id,status,progress,result_summary,error,executor_type,executor_id,
    created_at,task_revision,started_at,heartbeat_at,finished_at,TIMESTAMPDIFF(SECOND, started_at, UTC_TIMESTAMP(3)) elapsed_seconds,
    TIMESTAMPDIFF(SECOND, COALESCE(heartbeat_at, started_at), UTC_TIMESTAMP(3)) heartbeat_age_seconds
    FROM agent_task_execution_runs WHERE task_id=? ORDER BY created_at DESC LIMIT 1`,
    [taskId],
  );
  const events = run?.executor_id
    ? await query(
        db,
        `SELECT tool,status,LEFT(input,240) input,LEFT(output,240) output,created_at,finished_at
    FROM agent_events WHERE agent_session_id=? ORDER BY id DESC LIMIT 8`,
        [run.executor_id],
      )
    : [];
  const live = ["running", "waiting"].includes(run?.status);
  const stale = live && Number(run.heartbeat_age_seconds || 0) >= 180;
  const [bindingEvent] = await query(
    db,
    `SELECT status,output,created_at FROM agent_events
    WHERE agent_task_id=? AND tool IN ('bind_child_agent','child_agent') ORDER BY id DESC LIMIT 1`,
    [taskId],
  );
  const lastBindingError =
    bindingEvent?.status === "failed" && (!run || bindingEvent.created_at >= run.created_at)
      ? bindingEvent.output
      : null;
  const bound =
    live && run.executor_id === task.execution_agent_id && run.task_revision === task.revision;
  const bindingStatus = bound
    ? stale
      ? "stale"
      : "bound"
    : lastBindingError
      ? "rejected"
      : task.execution_agent_id && !TASK_ENDED.includes(task.status)
        ? "stale"
        : TASK_ENDED.includes(task.status)
          ? "ended"
          : "pending";
  let suggestedNext = "keep";
  if (task.status === "blocked") suggestedNext = "wait_for_condition";
  else if (task.status === "failed" || run?.status === "failed")
    suggestedNext =
      task.failure_class === "platform_blocked" ? "block_or_wait" : "retry_same_or_replace";
  else if (
    !run ||
    ["queued", "cancelled", "interrupted"].includes(run.status) ||
    task.status === "pending_assignment"
  )
    suggestedNext = "dispatch";
  else if (stale) suggestedNext = "ask_or_replace";
  else if (live) suggestedNext = "ask";
  return {
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      progress: task.progress,
      result_summary: task.result_summary,
      target_type: task.target_type,
      target_id: task.target_id,
      execution_agent_id: task.execution_agent_id,
      preferred_executor_id: task.preferred_executor_id,
      retry_count: Number(task.retry_count || 0),
      max_retry_count: Number(task.max_retry_count || MAX_TASK_RETRIES),
      executor_switch_count: Number(task.executor_switch_count || 0),
      failure_class: task.failure_class,
      failure_signature: task.failure_signature,
      blocked_reason: task.blocked_reason,
      resume_condition: task.resume_condition,
      document_refs: parseDocumentRefs(task.document_refs),
      folder_refs: parseDocumentRefs(task.folder_refs),
    },
    run: run || null,
    live,
    stale,
    binding_status: bindingStatus,
    binding_target_run_id: run?.id || null,
    last_binding_error: lastBindingError,
    lastEvents: events.reverse(),
    suggestedNext,
    askVia: live && run.executor_id ? { tool: "send_message", agentId: run.executor_id } : null,
    replaceVia: run?.executor_id
      ? { interruptAgentId: run.executor_id, recover: "restart" }
      : { recover: "restart" },
    retryPolicy: {
      sameExecutorAttempts: MAX_EXECUTOR_ATTEMPTS,
      maxTaskRetries: Number(task.max_retry_count || MAX_TASK_RETRIES),
      maxDistinctExecutors: MAX_DISTINCT_EXECUTORS,
      failureClass: task.failure_class || null,
      failureSignature: task.failure_signature || null,
    },
  };
}
