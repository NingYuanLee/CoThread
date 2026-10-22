/** 任务域：l3-execution。内部依赖具体领域模块，不依赖 task-pool 兼容入口。 */
import { assertIterationWritable } from "./iteration-state.js";

import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { publishWork } from "./work-events.js";
import { enqueueCoordinatorEvent } from "./coordinator-events.js";

import {
  recordTaskStatusChange,
  stickyL3ExecutorIds,
  stickyL3Label,
} from "./task-pool-activity.js";
import {
  classifyTaskFailure,
  failureSignature,
  failureText,
  latestToolFailure,
  taskRetryStats,
} from "./task-pool-failures.js";
import { reconcileEndedTaskRuns, voidSelfHandledAssistTasks } from "./task-pool-recovery.js";
import {
  TASK_ENDED,
  MAX_TASK_RETRIES,
  MAX_EXECUTOR_ATTEMPTS,
  MAX_DISTINCT_EXECUTORS,
  L3_STALE_HEARTBEAT_SECONDS,
} from "./task-policy.js";
import { adoptCurrentIterationL2 } from "./task-access.js";
import { getTask } from "./task-queries.js";
import { l3DispatchSnapshot } from "./task-dispatch.js";
export async function touchL3RunHeartbeat(db, executorId, { progress } = {}) {
  if (!executorId) return false;
  const result =
    progress != null
      ? await query(
          db,
          `UPDATE agent_task_execution_runs
        SET heartbeat_at=UTC_TIMESTAMP(3), progress=?
        WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')`,
          [String(progress).slice(0, 500), executorId],
        )
      : await query(
          db,
          `UPDATE agent_task_execution_runs
        SET heartbeat_at=UTC_TIMESTAMP(3)
        WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')`,
          [executorId],
        );
  return (result.affectedRows || 0) > 0;
}

export async function touchL3InferenceHeartbeat(db, executorId) {
  if (!executorId) return false;
  const [run] = await query(
    db,
    `SELECT progress FROM agent_task_execution_runs
    WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')
    ORDER BY created_at DESC LIMIT 1`,
    [executorId],
  );
  if (!run) return false;
  const toolDone = typeof run.progress === "string" && /已完成(?:$| ·)/.test(run.progress);
  return touchL3RunHeartbeat(db, executorId, toolDone ? { progress: "正在调用模型" } : {});
}

export async function enqueueInterruptedL3Recovery(db, runs, failureReason) {
  for (const threadId of new Set(runs.map((row) => row.origin_thread_id).filter(Boolean)))
    publishWork(db, threadId);
  const dispatchByThread = new Map();
  for (const run of runs) {
    if (!run.origin_thread_id) continue;
    if (!dispatchByThread.has(run.origin_thread_id)) {
      const [session] = await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [
        run.origin_thread_id,
      ]);
      dispatchByThread.set(
        run.origin_thread_id,
        session
          ? await l3DispatchSnapshot(db, session.session_id)
          : { idleL3Count: 0, pendingAssignment: 0, pendingTasks: [] },
      );
    }
    const dispatch = dispatchByThread.get(run.origin_thread_id);
    await enqueueCoordinatorEvent(db, {
      threadId: run.origin_thread_id,
      kind: "child_result",
      messageId: run.source_message_id || null,
      taskId: run.task_id,
      payload: {
        runId: run.id,
        taskId: run.task_id,
        title: run.title,
        status: "interrupted",
        failureReason,
        sourceMessageId: run.source_message_id || null,
        sourceUserId: run.source_user_id || null,
        idleL3Count: dispatch.idleL3Count,
        pendingAssignment: dispatch.pendingAssignment,
        pendingTasks: dispatch.pendingTasks,
      },
    });
  }
}

export function assistantText(blocks = []) {
  return blocks
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export async function bindDshL3Execution(db, l2SessionId, childSessionId, taskId) {
  return transaction(db, async (conn) => {
    const [scope] = await query(conn, "SELECT thread_id FROM agent_sessions WHERE session_id=?", [
      l2SessionId,
    ]);
    if (!scope) throw new HttpError(404, "迭代调度会话不存在");
    await assertIterationWritable(conn, scope.thread_id);
    const [session] = await query(
      conn,
      "SELECT session_id FROM agent_sessions WHERE session_id=? FOR UPDATE",
      [l2SessionId],
    );
    if (!session) throw new HttpError(404, "小祥 session 不存在");
    // subagent.started and tool/result both call bind; the second pass must not look like failure.
    const [already] = await query(
      conn,
      `SELECT t.* FROM agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      WHERE r.executor_type='dsh_l3' AND r.executor_id=? AND r.status IN ('running','waiting')
        AND t.target_type='l2_session' AND t.target_id=? AND t.execution_agent_id=r.executor_id
        AND r.task_revision=t.revision
      ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE`,
      [childSessionId, l2SessionId],
    );
    if (already) {
      if (taskId && already.id !== taskId) throw new HttpError(409, "该子 Agent 已绑定其他任务");
      return getTask(conn, already.id);
    }
    const [capacity] = await query(
      conn,
      `SELECT COUNT(*) active FROM agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.target_type='l2_session' AND t.target_id=? AND r.executor_type='dsh_l3'
        AND r.status IN ('running','waiting')`,
      [l2SessionId],
    );
    if (Number(capacity.active) >= 7)
      throw new HttpError(409, "当前 小祥 已有 7 个运行中的子 Agent");
    if (taskId) {
      const [task] = await query(
        conn,
        `SELECT * FROM agent_tasks WHERE id=? AND target_type='l2_session'
        AND task_type IN ('assist_l2','formal') FOR UPDATE`,
        [taskId],
      );
      if (!task) throw new HttpError(404, "当前 小祥 没有这个可委派任务");
      await adoptCurrentIterationL2(conn, task, l2SessionId);
      if (!["pending_assignment", "queued", "running"].includes(task.status))
        throw new HttpError(409, "任务当前不可启动子 Agent");
      if (task.execution_agent_id && task.execution_agent_id !== childSessionId)
        throw new HttpError(
          409,
          `L3_BINDING_OCCUPIED: 任务 ${task.id} 已绑定执行者 ${task.execution_agent_id}；请先 inspect_task，必要时 recover_task clear_binding`,
        );
      if (task.status === "pending_assignment" || task.task_type === "formal") {
        await query(
          conn,
          `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
          SELECT UUID(),t.id,t.revision,'dsh_l3','queued' FROM agent_tasks t
          WHERE t.id=? AND NOT EXISTS (SELECT 1 FROM agent_task_execution_runs r
            WHERE r.task_id=t.id AND r.task_revision=t.revision AND r.status IN ('queued','running','waiting'))`,
          [taskId],
        );
      }
    }
    const values = [l2SessionId];
    let taskFilter = "";
    if (taskId) {
      taskFilter = "AND t.id=?";
      values.push(taskId);
    }
    const [run] = await query(
      conn,
      `SELECT r.id run_id,t.* FROM agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.target_type='l2_session' AND t.target_id=? AND t.task_type IN ('assist_l2','formal')
        AND r.executor_type='dsh_l3' AND r.status='queued' AND r.executor_id IS NULL AND r.task_revision=t.revision ${taskFilter}
      ORDER BY r.created_at LIMIT 1 FOR UPDATE`,
      values,
    );
    if (!run) {
      if (taskId)
        throw new HttpError(
          409,
          `L3_BINDING_NOT_QUEUED: 任务 ${taskId} 没有当前版本的未绑定排队 run`,
        );
      return null;
    }
    const known = await stickyL3ExecutorIds(conn, run.origin_thread_id);
    if (childSessionId && !known.includes(childSessionId)) known.push(childSessionId);
    const executorLabel = stickyL3Label(childSessionId, known);
    await query(
      conn,
      `UPDATE agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      LEFT JOIN agent_requests q ON q.message_id=t.source_message_id
      SET r.executor_id=?,r.status='running',r.executor_label=?,
      r.started_at=COALESCE(r.started_at,UTC_TIMESTAMP(3)),r.heartbeat_at=UTC_TIMESTAMP(3),
      r.source_message_id=t.source_message_id,r.dialogue_mode=q.dialogue_mode
      WHERE r.id=?`,
      [childSessionId, executorLabel, run.run_id],
    );
    await query(
      conn,
      `UPDATE agent_tasks SET status='running',execution_mode='dsh_l3',
      execution_agent_type='dsh_l3',execution_agent_id=?,
      executor_switch_count=executor_switch_count+IF(preferred_executor_id IS NOT NULL AND preferred_executor_id<>?,1,0),
      preferred_executor_id=NULL,progress=IF(preferred_executor_id IS NULL,'子 Agent 正在执行','子 Agent 正在执行（原执行者不可恢复，已接续）') WHERE id=?`,
      [childSessionId, childSessionId, run.id],
    );
    const l3Actor = { type: "dsh_l3", id: childSessionId };
    await recordTaskStatusChange(conn, run.id, run.status, l3Actor, "子 Agent 开始执行");
    if (run.source_task_id) {
      const [sourceBefore] = await query(conn, "SELECT status FROM agent_tasks WHERE id=?", [
        run.source_task_id,
      ]);
      await query(
        conn,
        `UPDATE agent_tasks SET execution_mode='dsh_l3',
        execution_agent_type='dsh_l3',execution_agent_id=?,status=IF(status IN ('queued','pending_assignment'),'running',status),revision=revision+1
        WHERE id=? AND status NOT IN ('completed','failed','cancelled','rejected','abandoned','superseded')`,
        [childSessionId, run.source_task_id],
      );
      await recordTaskStatusChange(
        conn,
        run.source_task_id,
        sourceBefore?.status,
        l3Actor,
        "辅助任务的子 Agent 开始执行",
      );
    }
    return getTask(conn, run.id);
  });
}

export async function ensureDshL3CanUpdate(db, l2SessionId, childSessionId, taskId) {
  const [assigned] = await query(
    db,
    `SELECT id FROM agent_tasks
    WHERE id=? AND target_type='l2_session' AND target_id=?
      AND execution_agent_type='dsh_l3' AND execution_agent_id=?`,
    [taskId, l2SessionId, childSessionId],
  );
  if (assigned) return;
  try {
    const bound = await bindDshL3Execution(db, l2SessionId, childSessionId, taskId);
    if (bound?.execution_agent_id === childSessionId) return;
  } catch (error) {
    if (error?.status !== 409 && error?.status !== 404) throw error;
  }
  throw new HttpError(403, "子 Agent 只能更新分派给自己的任务");
}

export async function settleDshL3Execution(db, l2SessionId, childSessionId, notification) {
  const result = await transaction(db, async (conn) => {
    const [scope] = await query(conn, "SELECT thread_id FROM agent_sessions WHERE session_id=?", [
      l2SessionId,
    ]);
    if (!scope) throw new HttpError(404, "迭代调度会话不存在");
    await assertIterationWritable(conn, scope.thread_id);
    const [run] = await query(
      conn,
      `SELECT r.id run_id,r.status run_status,r.result_summary run_result,t.* FROM agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.target_type='l2_session' AND t.target_id=? AND r.executor_type='dsh_l3'
        AND r.executor_id=? AND r.status IN ('running','waiting','completed','failed','interrupted')
        AND t.execution_agent_id=r.executor_id
      ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE`,
      [l2SessionId, childSessionId],
    );
    if (!run) return null;
    const output = assistantText(notification.lastAssistantMessage);
    const toolError = await latestToolFailure(conn, childSessionId);
    let reportedStatus = null;
    let reportedSummary = null;
    for (const event of await query(
      conn,
      `SELECT tool,input FROM agent_events
      WHERE agent_session_id=? AND status='completed' AND tool IN ('report_task','update_task')
      ORDER BY id DESC LIMIT 8`,
      [childSessionId],
    )) {
      let args = {};
      try {
        args = typeof event.input === "string" ? JSON.parse(event.input) : event.input || {};
      } catch {}
      const status = String(args.status || "");
      if (event.tool === "report_task" || ["completed", "failed", "blocked"].includes(status)) {
        reportedStatus = event.tool === "report_task" ? status || "completed" : status;
        reportedSummary = args.summary || args.resultSummary || null;
        break;
      }
    }
    const taskAlreadyEnded = TASK_ENDED.includes(run.status);
    const stoppedCleanly = notification.status === "ok" && notification.stopReason === "completed";
    let taskStatus;
    let runStatus;
    let error = null;
    let summary = reportedSummary || run.result_summary || output || null;
    let failureClass = null;
    let signature = null;
    if (taskAlreadyEnded) {
      taskStatus = run.status;
      runStatus = ["completed", "failed"].includes(run.run_status)
        ? run.run_status
        : taskStatus === "failed"
          ? "failed"
          : "completed";
    } else if (reportedStatus) {
      taskStatus = reportedStatus === "blocked" ? "blocked" : reportedStatus;
      runStatus = taskStatus === "blocked" ? "completed" : taskStatus;
    } else if (notification.stopReason === "aborted") {
      taskStatus = "pending_assignment";
      runStatus = "interrupted";
      error = "子 Agent 已中止";
      summary = output || summary;
    } else {
      taskStatus = "failed";
      runStatus = "failed";
      error = stoppedCleanly ? "未回报结果" : `子 Agent ${notification.stopReason || "error"}`;
      summary = output || summary || "未回报结果";
    }
    if (taskStatus === "failed" || taskStatus === "blocked") {
      failureClass = classifyTaskFailure({
        status: taskStatus,
        error,
        summary,
        stopReason: notification.stopReason,
        toolError,
      });
      signature = failureSignature(
        failureText({ error, summary, toolError, stopReason: notification.stopReason }),
      );
      const stats = await taskRetryStats(conn, run.id, signature, childSessionId);
      const repeatedPlatformFailure =
        failureClass === "platform_blocked" &&
        run.failure_signature === signature &&
        Number(run.failure_environment_revision || 0) === Number(run.environment_revision || 0);
      const exhausted =
        Number(run.retry_count || 0) + 1 >= Number(run.max_retry_count || MAX_TASK_RETRIES) ||
        stats.executorAttempts >= MAX_EXECUTOR_ATTEMPTS ||
        stats.distinctExecutors >= MAX_DISTINCT_EXECUTORS;
      if (taskStatus === "failed" && (repeatedPlatformFailure || exhausted)) {
        taskStatus = "blocked";
        runStatus = "completed";
        error = repeatedPlatformFailure
          ? `同一平台错误重复出现：${signature}`
          : "任务达到自动重试预算，等待人工处理";
      }
    }
    if (["running", "waiting"].includes(run.run_status)) {
      await query(
        conn,
        `UPDATE agent_task_execution_runs SET status=?,result_summary=?,error=?,failure_class=?,failure_signature=?,
        heartbeat_at=UTC_TIMESTAMP(3),finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
        [runStatus, summary, error, failureClass, signature, run.run_id],
      );
    }
    if (!taskAlreadyEnded) {
      await query(
        conn,
        `UPDATE agent_tasks SET status=?,progress=?,result_summary=COALESCE(?,result_summary),
        retry_count=retry_count+IF(? IN ('failed','blocked'),1,0),failure_class=?,failure_signature=?,
        failure_environment_revision=IF(? IN ('failed','blocked'),environment_revision,NULL),
        blocked_reason=IF(?='blocked',COALESCE(?,failure_signature),NULL),
        resume_condition=IF(?='blocked',COALESCE(resume_condition,'外部条件恢复或人工确认后再重试'),NULL),
        preferred_executor_id=IF(?='pending_assignment',COALESCE(preferred_executor_id,execution_agent_id),preferred_executor_id),
        execution_agent_id=IF(?='pending_assignment',NULL,?),finished_at=IF(? IN ('completed','failed','cancelled','rejected','abandoned'),UTC_TIMESTAMP(3),NULL),revision=revision+1 WHERE id=?`,
        [
          taskStatus,
          taskStatus === "completed"
            ? "子 Agent 已交活"
            : taskStatus === "blocked"
              ? run.progress || "子 Agent 已阻塞"
              : error || "子 Agent 已返回",
          summary,
          taskStatus,
          failureClass,
          signature,
          taskStatus,
          taskStatus,
          error,
          taskStatus,
          taskStatus,
          taskStatus,
          childSessionId,
          taskStatus,
          run.id,
        ],
      );
      await recordTaskStatusChange(
        conn,
        run.id,
        run.status,
        { type: "dsh_l3", id: childSessionId },
        taskStatus === "completed"
          ? "子 Agent 已交活"
          : taskStatus === "blocked"
            ? "子 Agent 阻塞暂停"
            : runStatus === "interrupted"
              ? "子 Agent 被中止，重新排队"
              : `子 Agent 失败：${error}`,
      );
    }
    if (run.source_task_id && !taskAlreadyEnded) {
      await query(
        conn,
        `INSERT INTO agent_task_pool_updates(id,task_id,source_type,source_id,body,revision)
        SELECT UUID(),?,'l2_session',?,CONCAT('辅助任务「',?, '」',?,IF(?='', '', CONCAT('\n',?))),revision
        FROM agent_tasks WHERE id=?`,
        [
          run.source_task_id,
          l2SessionId,
          run.title,
          taskStatus === "completed"
            ? "已完成。"
            : taskStatus === "blocked"
              ? "阻塞暂停。"
              : "未完成。",
          summary,
          summary,
          run.source_task_id,
        ],
      );
      await query(
        conn,
        `UPDATE agent_tasks SET progress=?,revision=revision+1 WHERE id=?
        AND status NOT IN ('completed','failed','cancelled','rejected','abandoned','superseded')`,
        [
          taskStatus === "completed"
            ? "辅助子 Agent 已返回结果，等待 小祥 汇总"
            : taskStatus === "blocked"
              ? "辅助子 Agent 阻塞暂停，等待处理"
              : "辅助子 Agent 执行失败，等待 小祥 处理",
          run.source_task_id,
        ],
      );
    }
    return { ...(await getTask(conn, run.id)), run_id: run.run_id };
  });
  if (result?.origin_thread_id) {
    const dispatch =
      result.target_type === "l2_session"
        ? await l3DispatchSnapshot(db, result.target_id)
        : { idleL3Count: 0, pendingAssignment: 0, pendingTasks: [] };
    await enqueueCoordinatorEvent(db, {
      threadId: result.origin_thread_id,
      kind: "child_result",
      messageId: result.source_message_id || null,
      taskId: result.id,
      payload: {
        runId: result.run_id,
        taskId: result.id,
        title: result.title,
        status: result.status,
        resultSummary: result.result_summary,
        artifactRefs: result.artifact_refs || null,
        failureReason:
          result.status === "completed"
            ? null
            : result.progress || result.result_summary || "未回报结果",
        sourceMessageId: result.source_message_id || null,
        sourceUserId: result.source_user_id || null,
        idleL3Count: dispatch.idleL3Count,
        pendingAssignment: dispatch.pendingAssignment,
        pendingTasks: dispatch.pendingTasks,
      },
    });
    publishWork(db, result.origin_thread_id);
  }
  return result;
}

export async function interruptDshL3Candidates(db, candidates, { age = null, reason, progress }) {
  const recovered = [];
  for (const candidate of candidates) {
    const changed = await transaction(db, async (conn) => {
      const [scope] = await query(conn, "SELECT origin_thread_id FROM agent_tasks WHERE id=?", [
        candidate.task_id,
      ]);
      if (!scope) return false;
      if (scope.origin_thread_id) {
        const [thread] = await query(conn, "SELECT status FROM threads WHERE id=? FOR UPDATE", [
          scope.origin_thread_id,
        ]);
        if (thread?.status !== "active") return false;
      }
      const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [
        candidate.task_id,
      ]);
      const [run] = await query(
        conn,
        `SELECT *,
        TIMESTAMPDIFF(SECOND,COALESCE(heartbeat_at,started_at,created_at),UTC_TIMESTAMP(3)) heartbeat_age_seconds
        FROM agent_task_execution_runs WHERE id=? FOR UPDATE`,
        [candidate.id],
      );
      if (!run || !["running", "waiting"].includes(run.status)) return false;
      if (age != null && Number(run.heartbeat_age_seconds) < age) return false;
      await query(
        conn,
        `UPDATE agent_task_execution_runs SET status='interrupted',error=?,
        finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
        [reason, run.id],
      );
      if (
        task &&
        task.execution_agent_id === run.executor_id &&
        task.revision === run.task_revision &&
        ["running", "waiting"].includes(task.status)
      ) {
        await query(
          conn,
          `UPDATE agent_tasks SET status='pending_assignment',
          preferred_executor_id=COALESCE(preferred_executor_id,execution_agent_id),execution_agent_id=NULL,
          progress=?,finished_at=NULL,revision=revision+1 WHERE id=?`,
          [progress, task.id],
        );
        await recordTaskStatusChange(conn, task.id, task.status, { type: "system" }, reason);
        await query(
          conn,
          `UPDATE agent_tasks t JOIN agent_sessions s ON s.thread_id=t.origin_thread_id
          SET t.target_id=s.session_id,t.claimed_by_type='l2_session',t.claimed_by_id=s.session_id
          WHERE t.id=? AND t.target_type='l2_session' AND t.target_id<>s.session_id`,
          [task.id],
        );
        return true;
      }
      return false;
    });
    if (changed) recovered.push(candidate);
  }
  if (recovered.length) await enqueueInterruptedL3Recovery(db, recovered, reason);
  return recovered.length;
}

export async function recoverInterruptedDshL3Executions(db) {
  await voidSelfHandledAssistTasks(db);
  await reconcileEndedTaskRuns(db);
  const runs = await query(
    db,
    `SELECT r.id,r.task_id,t.origin_thread_id,t.source_message_id,t.source_user_id,t.title
    FROM agent_task_execution_runs r JOIN agent_tasks t ON t.id=r.task_id
    WHERE r.executor_type='dsh_l3' AND r.status IN ('running','waiting')`,
  );
  return interruptDshL3Candidates(db, runs, {
    reason: "服务重启，子 Agent 中断，等待 小祥 重新评估",
    progress: "服务重启，等待 小祥 重新指派",
  });
}

export async function recoverStaleDshL3Executions(
  db,
  { staleAfterSeconds = L3_STALE_HEARTBEAT_SECONDS } = {},
) {
  const age = Math.max(180, Number(staleAfterSeconds) || L3_STALE_HEARTBEAT_SECONDS);
  const runs = await query(
    db,
    `SELECT r.id,r.task_id,t.origin_thread_id,t.source_message_id,t.source_user_id,t.title
    FROM agent_task_execution_runs r JOIN agent_tasks t ON t.id=r.task_id
    WHERE r.executor_type='dsh_l3' AND r.status IN ('running','waiting') AND t.status IN ('running','waiting')
      AND TIMESTAMPDIFF(SECOND,COALESCE(r.heartbeat_at,r.started_at,r.created_at),UTC_TIMESTAMP(3)) >= ?`,
    [age],
  );
  return interruptDshL3Candidates(db, runs, {
    age,
    reason: `子 Agent 心跳超时（≥${age}s），等待 小祥 重新评估`,
    progress: "心跳超时，等待 小祥 重新指派",
  });
}
