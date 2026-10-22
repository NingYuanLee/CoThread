/** 任务域：commands。内部依赖具体领域模块，不依赖 task-pool 兼容入口。 */
import {
  assertIterationWritable,
  lockTaskIteration,
  withTaskIterationWrite,
} from "./iteration-state.js";
import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { publishWork } from "./work-events.js";

import { withL3DispatchGate } from "./task-pool-helpers.js";
import { recordTaskStatusChange } from "./task-pool-activity.js";

import { closeEndedTaskRuns } from "./task-pool-recovery.js";
import { ASSIGN_HUMAN_AUTH, TASK_ENDED, TASK_UPDATE_STATUSES } from "./task-policy.js";
import {
  assertDocumentRefs,
  assertFolderRefs,
  stripDocumentRefsCoveredByFolders,
} from "./task-documents.js";
import {
  assertTarget,
  assertActorCanUpdateTask,
  currentThreadL2Session,
  assertHumanMemberAuthorization,
  assertL2CanOperateTask,
} from "./task-access.js";
import { getTask } from "./task-queries.js";
import { idleL3Count } from "./task-dispatch.js";
export async function createTask(db, input) {
  const id = input.id || randomUUID();
  if (!input.originThreadId) throw new HttpError(400, "任务必须属于一个迭代");
  if (!input.projectId || !input.title || !input.goal)
    throw new HttpError(400, "任务缺少项目、标题或目标");
  if (input.taskType === "assist_l2") {
    if (input.createdByType !== "l2_session" || input.targetType !== "l2_session")
      throw new HttpError(403, "辅助任务只能由小祥创建并交给子 Agent");
  } else if (input.taskType !== "formal") throw new HttpError(400, "任务类型无效");
  if (!new Set(["human_member", "l2_session", "task"]).has(input.sourceType))
    throw new HttpError(400, "任务来源无效");
  if (!new Set(["human_member", "l2_session", "system"]).has(input.createdByType))
    throw new HttpError(400, "任务创建者无效");
  if (
    input.createdByType === "human_member" &&
    input.targetType &&
    input.targetType !== "human_member"
  )
    throw new HttpError(400, "人类成员创建的任务只能指派给人类成员");
  if (input.targetType) assertTarget(input.targetType, input.targetId);
  if (input.createdByType === "l2_session" && input.targetType === "human_member")
    await assertHumanMemberAuthorization(db, input.projectId, input, ASSIGN_HUMAN_AUTH);
  await transaction(db, async (conn) => {
    await assertIterationWritable(conn, input.originThreadId, input.projectId);
    if (input.sourceUserId) {
      const [member] = await query(
        conn,
        "SELECT user_id FROM members WHERE project_id=? AND user_id=?",
        [input.projectId, input.sourceUserId],
      );
      if (!member) throw new HttpError(400, "任务来源人不是项目成员");
    }
    if (input.sourceMessageId) {
      const [message] = await query(
        conn,
        "SELECT m.id FROM messages m JOIN threads t ON t.id=m.thread_id WHERE m.id=? AND t.project_id=?",
        [input.sourceMessageId, input.projectId],
      );
      if (!message) throw new HttpError(400, "任务来源消息不属于当前项目");
    }
    if (input.sourceTaskId) {
      const [sourceTask] = await query(
        conn,
        "SELECT id FROM agent_tasks WHERE id=? AND project_id=?",
        [input.sourceTaskId, input.projectId],
      );
      if (!sourceTask) throw new HttpError(400, "任务来源任务不属于当前项目");
    }
    if (input.targetType === "human_member") {
      const [target] = await query(
        conn,
        "SELECT user_id FROM members WHERE project_id=? AND user_id=? AND role<>'viewer'",
        [input.projectId, input.targetId],
      );
      if (!target) throw new HttpError(400, "任务目标不是当前项目的可执行成员");
    }
    const folderRefs = await assertFolderRefs(conn, input.projectId, input.folderRefs);
    const documentRefs = await stripDocumentRefsCoveredByFolders(
      conn,
      input.projectId,
      await assertDocumentRefs(conn, input.projectId, input.documentRefs ?? input.refs),
      folderRefs,
    );
    let targetId = input.targetId || null;
    if (input.targetType === "l2_session") {
      if (input.originThreadId) {
        const current = await currentThreadL2Session(conn, input.originThreadId, input.projectId);
        if (!current) throw new HttpError(400, "任务目标不是当前项目迭代的 小祥");
        // Refuse to stamp tasks onto a rotated DB session while the live caller is still the old id.
        // That mismatch is what produces "已安排" + unbound 子 Agent ghosts.
        if (
          input.createdByType === "l2_session" &&
          input.createdById &&
          input.createdById !== current.session_id
        )
          throw new HttpError(409, "小祥 会话已轮换，请重试本轮调度");
        targetId = current.session_id;
      } else {
        const [target] = await query(
          conn,
          `SELECT s.session_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
          WHERE s.session_id=? AND t.project_id=?`,
          [input.targetId, input.projectId],
        );
        if (!target) throw new HttpError(400, "任务目标不是当前项目迭代的 小祥");
      }
    }
    const idle = input.targetType === "l2_session" ? await idleL3Count(conn, targetId) : 0;
    if (input.taskType === "assist_l2" && idle < 1)
      throw new HttpError(409, "当前没有空闲子 Agent，不能创建辅助任务，请自行处理");
    const startL3Now =
      input.targetType === "l2_session" &&
      idle >= 1 &&
      (input.taskType === "assist_l2" || input.taskType === "formal");
    let threadNumber = null;
    if (input.originThreadId) {
      await query(conn, "SELECT id FROM threads WHERE id=? FOR UPDATE", [input.originThreadId]);
      const [maxRow] = await query(
        conn,
        "SELECT COALESCE(MAX(thread_number), 0) AS max_num FROM agent_tasks WHERE origin_thread_id=?",
        [input.originThreadId],
      );
      const next = Number(maxRow?.max_num || 0) + 1;
      if (next > 9999) throw new HttpError(409, "本迭代任务编号已达上限");
      threadNumber = next;
    }
    const initialStatus =
      input.targetType === "human_member"
        ? "awaiting_acceptance"
        : startL3Now
          ? "running"
          : input.targetType === "l2_session"
            ? "pending_assignment"
            : "draft";
    await query(
      conn,
      `INSERT INTO agent_tasks
      (id,project_id,origin_thread_id,thread_number,source_type,source_user_id,source_agent_session_id,source_message_id,source_task_id,
       created_by_type,created_by_id,task_type,title,goal,constraints,document_refs,folder_refs,target_type,target_id,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.projectId,
        input.originThreadId || null,
        threadNumber,
        input.sourceType,
        input.sourceUserId || null,
        input.sourceAgentSessionId || null,
        input.sourceMessageId || null,
        input.sourceTaskId || null,
        input.createdByType,
        input.createdById,
        input.taskType,
        input.title,
        input.goal,
        input.constraints || null,
        JSON.stringify(documentRefs),
        JSON.stringify(folderRefs),
        input.targetType || null,
        targetId,
        initialStatus,
      ],
    );
    await query(conn, "UPDATE agent_tasks SET original_thread_id=? WHERE id=?", [
      input.originThreadId,
      id,
    ]);
    if (input.targetType === "l2_session") {
      await query(
        conn,
        "UPDATE agent_tasks SET claimed_by_type='l2_session',claimed_by_id=?,execution_mode='dsh_l3',execution_agent_type='dsh_l3' WHERE id=?",
        [targetId, id],
      );
      if (startL3Now) {
        await query(
          conn,
          `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
          SELECT UUID(),id,revision,'dsh_l3','queued' FROM agent_tasks WHERE id=?`,
          [id],
        );
      }
    }
    await query(
      conn,
      `INSERT INTO agent_task_assignment_events
      (task_id,to_target_type,to_target_id,changed_by_type,changed_by_id,reason,message_id)
      VALUES(?,?,?,?,?,?,?)`,
      [
        id,
        input.targetType || null,
        targetId,
        input.createdByType,
        input.createdById,
        input.reason || null,
        input.sourceMessageId || null,
      ],
    );
    await recordTaskStatusChange(
      conn,
      id,
      null,
      { type: input.createdByType, id: input.createdById },
      input.reason || "任务创建",
    );
  });
  if (input.originThreadId) publishWork(db, input.originThreadId);
  return withL3DispatchGate(await getTask(db, id));
}

export async function updateTask(db, taskId, actor, update) {
  const result = await transaction(db, async (conn) => {
    await lockTaskIteration(conn, taskId);
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    assertActorCanUpdateTask(task, actor);
    let nextStatus = update.status || task.status;
    if (!TASK_UPDATE_STATUSES.includes(nextStatus)) throw new HttpError(400, "任务状态无效");
    if (TASK_ENDED.includes(task.status)) throw new HttpError(409, "任务已经结束");
    if (
      actor?.type === "human_member" &&
      task.execution_agent_type === "human_self" &&
      update.status &&
      !["abandoned", "completed"].includes(update.status)
    )
      throw new HttpError(409, "由本人执行的任务只能放弃或完成");
    if (
      task.task_type === "assist_l2" &&
      ["completed", "failed"].includes(nextStatus) &&
      !task.execution_agent_id
    ) {
      nextStatus = "cancelled";
      if (!update.resultSummary)
        update = { ...update, resultSummary: "小祥自行处理，未调度子 Agent，已从任务池撤销。" };
    }
    const redispatchDsh =
      ["queued", "pending_assignment"].includes(nextStatus) &&
      task.target_type === "l2_session" &&
      (task.task_type === "assist_l2" || task.execution_agent_type === "dsh_l3");
    await query(
      conn,
      `UPDATE agent_tasks SET status=?,progress=COALESCE(?,progress),result_summary=COALESCE(?,result_summary),
      artifact_refs=COALESCE(?,artifact_refs),execution_agent_id=IF(?,NULL,execution_agent_id),
      finished_at=IF(? IN ('completed','failed','cancelled','rejected','abandoned'),UTC_TIMESTAMP(3),IF(?,NULL,finished_at)),revision=revision+1 WHERE id=?`,
      [
        nextStatus,
        update.progress || null,
        update.resultSummary || null,
        update.artifactRefs ? JSON.stringify(update.artifactRefs) : null,
        redispatchDsh,
        nextStatus,
        redispatchDsh,
        taskId,
      ],
    );
    if (redispatchDsh) {
      await query(
        conn,
        `UPDATE agent_task_execution_runs SET status='cancelled',error='任务 revision 已更新',
        finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`,
        [taskId],
      );
      if (nextStatus !== "pending_assignment") {
        await query(
          conn,
          `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
          SELECT UUID(),id,revision,'dsh_l3','queued' FROM agent_tasks WHERE id=?`,
          [taskId],
        );
      }
    } else if (["running", "waiting", "pending_start"].includes(nextStatus)) {
      await query(
        conn,
        `UPDATE agent_task_execution_runs SET status=?,
        progress=COALESCE(?,progress),result_summary=COALESCE(?,result_summary),
        started_at=COALESCE(started_at,UTC_TIMESTAMP(3))
        WHERE task_id=? AND executor_type<>'dsh_l3' AND status IN ('queued','running','waiting')`,
        [nextStatus, update.progress || null, update.resultSummary || null, taskId],
      );
    }
    if (TASK_ENDED.includes(nextStatus) || nextStatus === "blocked")
      await closeEndedTaskRuns(conn, taskId, nextStatus);
    if (update.body)
      await query(
        conn,
        "INSERT INTO agent_task_pool_updates(id,task_id,source_type,source_id,message_id,body,revision) SELECT UUID(),?,?,?,?,?,revision FROM agent_tasks WHERE id=?",
        [taskId, actor.type, actor.id, update.messageId || null, update.body, taskId],
      );
    await recordTaskStatusChange(
      conn,
      taskId,
      task.status,
      actor,
      nextStatus !== (update.status || task.status)
        ? update.resultSummary
        : update.progress || update.resultSummary || null,
    );
    return getTask(conn, taskId);
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

export async function appendTaskUpdate(db, taskId, actor, body, messageId = null) {
  if (typeof db.getConnection === "function")
    return withTaskIterationWrite(db, taskId, (conn) =>
      appendTaskUpdate(conn, taskId, actor, body, messageId),
    );
  await lockTaskIteration(db, taskId);
  const task = await getTask(db, taskId);
  if (!task) throw new HttpError(404, "任务不存在");
  if (task.target_type !== actor.type || task.target_id !== actor.id)
    throw new HttpError(403, "只有当前任务目标可以更新任务");
  await query(
    db,
    "INSERT INTO agent_task_pool_updates(id,task_id,source_type,source_id,message_id,body,revision) VALUES(UUID(),?,?,?,?,?,?)",
    [taskId, actor.type, actor.id, messageId, body, task.revision],
  );
  return getTask(db, taskId);
}

export async function askTaskQuestion(db, taskId, actor, question, sourceUserId, messageId = null) {
  if (typeof db.getConnection === "function")
    return withTaskIterationWrite(db, taskId, (conn) =>
      askTaskQuestion(conn, taskId, actor, question, sourceUserId, messageId),
    );
  await lockTaskIteration(db, taskId);
  const task = await getTask(db, taskId);
  if (!task) throw new HttpError(404, "任务不存在");
  await assertL2CanOperateTask(db, actor, task);
  const [open] = await query(
    db,
    "SELECT id FROM agent_task_questions WHERE task_id=? AND status='open' LIMIT 1",
    [taskId],
  );
  if (open) throw new HttpError(409, "该任务已有待回答问题");
  const [latestHumanSource] = await query(
    db,
    `SELECT changed_by_id FROM agent_task_assignment_events
    WHERE task_id=? AND changed_by_type='human_member' ORDER BY id DESC LIMIT 1`,
    [taskId],
  );
  sourceUserId = latestHumanSource?.changed_by_id || task.source_user_id || sourceUserId;
  if (!sourceUserId) throw new HttpError(409, "任务没有可回答问题的人类来源方");
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO agent_task_questions(id,task_id,revision,asked_by_type,asked_by_id,source_user_id,question,asked_message_id) VALUES(?,?,?,?,?,?,?,?)",
    [id, taskId, task.revision, actor.type, actor.id, sourceUserId, question, messageId],
  );
  await query(db, "UPDATE agent_tasks SET status='waiting',revision=revision+1 WHERE id=?", [
    taskId,
  ]);
  await recordTaskStatusChange(db, taskId, task.status, actor, "向来源成员提问，等待回答");
  return (await query(db, "SELECT * FROM agent_task_questions WHERE id=?", [id]))[0];
}

export async function answerTaskQuestion(db, questionId, actor, answer, messageId = null) {
  return transaction(db, async (conn) => {
    const [questionScope] = await query(
      conn,
      "SELECT task_id FROM agent_task_questions WHERE id=?",
      [questionId],
    );
    if (!questionScope) throw new HttpError(404, "问题不存在");
    await lockTaskIteration(conn, questionScope.task_id);
    const [question] = await query(
      conn,
      "SELECT q.*,t.project_id FROM agent_task_questions q JOIN agent_tasks t ON t.id=q.task_id WHERE q.id=? FOR UPDATE",
      [questionId],
    );
    if (!question) throw new HttpError(404, "任务问题不存在");
    if (question.status !== "open") throw new HttpError(409, "任务问题已经关闭");
    if (actor.type !== "human_member" || question.source_user_id !== actor.id)
      throw new HttpError(403, "只有任务最新来源人可以回答问题");
    await query(
      conn,
      "UPDATE agent_task_questions SET answer=?,status='answered',answered_message_id=?,answered_at=UTC_TIMESTAMP(3) WHERE id=?",
      [answer, messageId, questionId],
    );
    const [before] = await query(conn, "SELECT status FROM agent_tasks WHERE id=?", [
      question.task_id,
    ]);
    const [task] = await query(
      conn,
      "SELECT target_type,execution_agent_id FROM agent_tasks WHERE id=?",
      [question.task_id],
    );
    const resume =
      task?.target_type === "l2_session" && !task.execution_agent_id
        ? "pending_assignment"
        : "running";
    await query(
      conn,
      "UPDATE agent_tasks SET status=?,revision=revision+1 WHERE id=? AND status='waiting'",
      [resume, question.task_id],
    );
    await recordTaskStatusChange(
      conn,
      question.task_id,
      before?.status,
      actor,
      resume === "pending_assignment" ? "问题已回答，等待指派空闲子 Agent" : "问题已回答，继续执行",
    );
    const answered = (
      await query(
        conn,
        "SELECT q.*,t.origin_thread_id FROM agent_task_questions q JOIN agent_tasks t ON t.id=q.task_id WHERE q.id=?",
        [questionId],
      )
    )[0];
    if (answered?.origin_thread_id) publishWork(db, answered.origin_thread_id);
    return answered;
  });
}
