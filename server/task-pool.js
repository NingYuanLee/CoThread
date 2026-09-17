import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import { publishWork } from "./work-events.js";
import { enqueueCoordinatorEvent } from "./coordinator-events.js";
import { AGENT_MEMBER } from "../shared/agent-member.js";

const targetTypes = new Set(["human_member", "l2_session"]);
const FOREIGN_TASK_AUTH = "非本 L2 责任的任务需要人类成员账号明确授权";
const ASSIGN_HUMAN_AUTH = "把任务指派给人类成员需要人类成员账号明确授权";

function assertTarget(type, id) {
  if (!targetTypes.has(type) || typeof id !== "string" || !id) throw new HttpError(400, "任务目标无效");
}

function isL2OwnResponsibility(task) {
  return task.task_type === "assist_l2" || task.target_type === "l2_session" || task.execution_agent_type === "dsh_l3";
}

async function hasHumanMemberAuthorization(conn, projectId, actor) {
  const userId = actor?.authorizedByUserId;
  if (!userId || userId === AGENT_MEMBER.id) return false;
  const [member] = await query(conn, `SELECT user_id FROM members WHERE project_id=? AND user_id=? AND role<>'viewer'`,
    [projectId, userId]);
  return !!member;
}

async function assertHumanMemberAuthorization(conn, projectId, actor, message = FOREIGN_TASK_AUTH) {
  if (await hasHumanMemberAuthorization(conn, projectId, actor)) return;
  throw new HttpError(403, message);
}

async function assertL2CanOperateTask(conn, actor, task) {
  if (actor?.type !== "l2_session") throw new HttpError(403, "只有当前迭代的 L2 可以跨任务安排");
  const [session] = await query(conn, `SELECT s.thread_id, t.project_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
    WHERE s.session_id=?`, [actor.id]);
  if (!session || session.project_id !== task.project_id) throw new HttpError(403, "当前 L2 不能操作其他项目的任务");
  if (!task.origin_thread_id || task.origin_thread_id !== session.thread_id)
    throw new HttpError(403, "当前 L2 只能安排本迭代锁定的任务");
  if (!isL2OwnResponsibility(task)) await assertHumanMemberAuthorization(conn, task.project_id, actor);
}

// 状态变更记录：与写状态的语句放在同一事务里；status 未变化则不写。actor 为 { type, id }，type 取
// human_member / l2_session / dsh_l3 / connector / system。
export async function recordTaskStatusChange(conn, taskId, fromStatus, actor, reason = null) {
  const [row] = await query(conn, "SELECT status FROM agent_tasks WHERE id=?", [taskId]);
  if (!row || row.status === (fromStatus ?? null)) return null;
  await query(conn, `INSERT INTO agent_task_status_events(task_id,from_status,to_status,actor_type,actor_id,reason) VALUES(?,?,?,?,?,?)`,
    [taskId, fromStatus ?? null, row.status, actor?.type || "system", actor?.id || null, reason ? String(reason).slice(0, 500) : null]);
  return row.status;
}

export async function listTaskStatusEvents(db, taskId) {
  return query(db, "SELECT * FROM agent_task_status_events WHERE task_id=? ORDER BY id", [taskId]);
}

export async function createTask(db, input) {
  const id = input.id || randomUUID();
  if (!input.projectId || !input.title || !input.goal) throw new HttpError(400, "任务缺少项目、标题或目标");
  if (input.taskType === "assist_l2") {
    if (input.createdByType !== "l2_session" || input.targetType !== "l2_session")
      throw new HttpError(403, "L2 辅助任务只能由 L2 创建并交给 L2 子 Agent");
  } else if (input.taskType !== "formal") throw new HttpError(400, "任务类型无效");
  if (!new Set(["human_member","l2_session","task"]).has(input.sourceType)) throw new HttpError(400, "任务来源无效");
  if (!new Set(["human_member","l2_session","system"]).has(input.createdByType)) throw new HttpError(400, "任务创建者无效");
  if (input.targetType) assertTarget(input.targetType, input.targetId);
  if (input.createdByType === "l2_session" && input.targetType === "human_member")
    await assertHumanMemberAuthorization(db, input.projectId, input, ASSIGN_HUMAN_AUTH);
  const acceptance = input.taskType === "formal" && input.targetType === "human_member";
  await transaction(db, async (conn) => {
    if (input.sourceUserId) {
      const [member] = await query(conn, "SELECT user_id FROM members WHERE project_id=? AND user_id=?", [input.projectId, input.sourceUserId]);
      if (!member) throw new HttpError(400, "任务来源人不是项目成员");
    }
    if (input.sourceMessageId) {
      const [message] = await query(conn, "SELECT m.id FROM messages m JOIN threads t ON t.id=m.thread_id WHERE m.id=? AND t.project_id=?", [input.sourceMessageId, input.projectId]);
      if (!message) throw new HttpError(400, "任务来源消息不属于当前项目");
    }
    if (input.sourceTaskId) {
      const [sourceTask] = await query(conn, "SELECT id FROM agent_tasks WHERE id=? AND project_id=?", [input.sourceTaskId, input.projectId]);
      if (!sourceTask) throw new HttpError(400, "任务来源任务不属于当前项目");
    }
    if (input.targetType === "human_member") {
      const [target] = await query(conn, "SELECT user_id FROM members WHERE project_id=? AND user_id=? AND role<>'viewer'", [input.projectId, input.targetId]);
      if (!target) throw new HttpError(400, "任务目标不是当前项目的可执行成员");
    }
    if (input.targetType === "l2_session") {
      const [target] = await query(conn, `SELECT s.session_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
        WHERE s.session_id=? AND t.project_id=? AND (? IS NULL OR t.id=?)`,
      [input.targetId, input.projectId, input.originThreadId || null, input.originThreadId || null]);
      if (!target) throw new HttpError(400, "任务目标不是当前项目迭代的 L2");
    }
    await query(conn, `INSERT INTO agent_tasks
      (id,project_id,origin_thread_id,source_type,source_user_id,source_agent_session_id,source_message_id,source_task_id,
       created_by_type,created_by_id,task_type,title,goal,constraints,target_type,target_id,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      id, input.projectId, input.originThreadId || null, input.sourceType, input.sourceUserId || null,
      input.sourceAgentSessionId || null, input.sourceMessageId || null, input.sourceTaskId || null,
      input.createdByType, input.createdById, input.taskType, input.title, input.goal, input.constraints || null,
      input.targetType || null, input.targetId || null, acceptance ? "awaiting_acceptance" : input.targetType ? "queued" : "draft",
    ]);
    if (input.targetType === "l2_session") {
      await query(conn, "UPDATE agent_tasks SET claimed_by_type='l2_session',claimed_by_id=? WHERE id=?", [input.targetId,id]);
      if (input.taskType === "assist_l2") {
        await query(conn, "UPDATE agent_tasks SET execution_mode='dsh_l3',execution_agent_type='dsh_l3' WHERE id=?", [id]);
        await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
          SELECT UUID(),id,revision,'dsh_l3','queued' FROM agent_tasks WHERE id=?`, [id]);
      }
    }
    await query(conn, `INSERT INTO agent_task_assignment_events
      (task_id,to_target_type,to_target_id,changed_by_type,changed_by_id,reason,message_id)
      VALUES(?,?,?,?,?,?,?)`, [id, input.targetType || null, input.targetId || null, input.createdByType,
      input.createdById, input.reason || null, input.sourceMessageId || null]);
    await recordTaskStatusChange(conn, id, null, { type: input.createdByType, id: input.createdById }, input.reason || "任务创建");
  });
  if (input.originThreadId) publishWork(db, input.originThreadId);
  return getTask(db, id);
}

export async function getTask(db, id) {
  const [task] = await query(db, "SELECT * FROM agent_tasks WHERE id=?", [id]);
  return task || null;
}

export async function listTasks(db, projectId, { status, targetId, originThreadId, limit = 100 } = {}) {
  const values = [projectId];
  const filters = ["project_id=?"];
  if (status) { filters.push("status=?"); values.push(status); }
  if (targetId) { filters.push("target_id=?"); values.push(targetId); }
  if (originThreadId) { filters.push("origin_thread_id=?"); values.push(originThreadId); }
  values.push(Math.min(Math.max(Number(limit) || 100, 1), 200));
  return query(db, `SELECT t.*,
    r.status run_status, r.progress run_progress, r.executor_id, r.heartbeat_at, r.started_at run_started_at,
    TIMESTAMPDIFF(SECOND, r.started_at, UTC_TIMESTAMP(3)) run_elapsed_seconds,
    COALESCE(IF(t.task_type='formal',t.execution_agent_id,NULL),
    (SELECT previous.execution_agent_id FROM agent_tasks previous
      WHERE previous.id<>t.id AND previous.target_type='l2_session' AND previous.target_id=t.target_id
        AND previous.task_type='formal' AND previous.status='completed'
        AND previous.execution_agent_type='dsh_l3' AND previous.execution_agent_id IS NOT NULL
        AND ((t.source_user_id IS NOT NULL AND previous.source_user_id=t.source_user_id)
          OR (t.source_task_id IS NOT NULL AND previous.source_task_id=t.source_task_id))
      ORDER BY previous.finished_at DESC,previous.updated_at DESC LIMIT 1)) preferred_execution_agent_id
    FROM agent_tasks t
    LEFT JOIN agent_task_execution_runs r ON r.id=(
      SELECT r2.id FROM agent_task_execution_runs r2 WHERE r2.task_id=t.id ORDER BY r2.created_at DESC LIMIT 1)
    WHERE ${filters.map((filter) => `t.${filter}`).join(" AND ")} ORDER BY t.updated_at DESC LIMIT ?`, values);
}

export async function updateTask(db, taskId, actor, update) {
  const result = await transaction(db, async (conn) => {
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    if (task.target_type !== actor.type || task.target_id !== actor.id) throw new HttpError(403, "只有当前任务目标可以更新任务");
    let nextStatus = update.status || task.status;
    if (!["queued","running","waiting","blocked","completed","failed","cancelled"].includes(nextStatus)) throw new HttpError(400, "任务状态无效");
    if (["completed","failed","cancelled"].includes(task.status)) throw new HttpError(409, "任务已经结束");
    if (task.task_type === "assist_l2" && ["completed", "failed"].includes(nextStatus) && !task.execution_agent_id) {
      nextStatus = "cancelled";
      if (!update.resultSummary) update = { ...update, resultSummary: "小祥自行处理，未调度任务级 Agent，已从任务池撤销。" };
    }
    const redispatchDsh = nextStatus === "queued" && task.target_type === "l2_session"
      && (task.task_type === "assist_l2" || task.execution_agent_type === "dsh_l3");
    await query(conn, `UPDATE agent_tasks SET status=?,progress=COALESCE(?,progress),result_summary=COALESCE(?,result_summary),
      artifact_refs=COALESCE(?,artifact_refs),execution_agent_id=IF(?,NULL,execution_agent_id),
      finished_at=IF(? IN ('completed','failed','cancelled'),UTC_TIMESTAMP(3),IF(?,NULL,finished_at)),revision=revision+1 WHERE id=?`,
    [nextStatus,update.progress||null,update.resultSummary||null,update.artifactRefs?JSON.stringify(update.artifactRefs):null,
      redispatchDsh,nextStatus,redispatchDsh,taskId]);
    if (redispatchDsh) {
      await query(conn, `UPDATE agent_task_execution_runs SET status='cancelled',error='任务 revision 已更新',
        finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`, [taskId]);
      await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
        SELECT UUID(),id,revision,'dsh_l3','queued' FROM agent_tasks WHERE id=?`, [taskId]);
    }
    if (["completed", "failed", "cancelled"].includes(nextStatus)) await closeEndedTaskRuns(conn, taskId, nextStatus);
    if (update.body) await query(conn, "INSERT INTO agent_task_pool_updates(id,task_id,source_type,source_id,message_id,body,revision) SELECT UUID(),?,?,?,?,?,revision FROM agent_tasks WHERE id=?", [taskId,actor.type,actor.id,update.messageId||null,update.body,taskId]);
    await recordTaskStatusChange(conn, taskId, task.status, actor,
      nextStatus !== (update.status || task.status) ? update.resultSummary : (update.progress || update.resultSummary || null));
    return getTask(conn, taskId);
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

export async function appendTaskUpdate(db, taskId, actor, body, messageId=null) {
  const task=await getTask(db,taskId); if(!task) throw new HttpError(404,"任务不存在");
  if(task.target_type!==actor.type||task.target_id!==actor.id) throw new HttpError(403,"只有当前任务目标可以更新任务");
  await query(db,"INSERT INTO agent_task_pool_updates(id,task_id,source_type,source_id,message_id,body,revision) VALUES(UUID(),?,?,?,?,?,?)",[taskId,actor.type,actor.id,messageId,body,task.revision]);
  return getTask(db,taskId);
}

export async function askTaskQuestion(db, taskId, actor, question, sourceUserId, messageId=null) {
  const task=await getTask(db,taskId); if(!task) throw new HttpError(404,"任务不存在");
  await assertL2CanOperateTask(db, actor, task);
  const [open]=await query(db,"SELECT id FROM agent_task_questions WHERE task_id=? AND status='open' LIMIT 1",[taskId]); if(open) throw new HttpError(409,"该任务已有待回答问题");
  const [latestHumanSource] = await query(db, `SELECT changed_by_id FROM agent_task_assignment_events
    WHERE task_id=? AND changed_by_type='human_member' ORDER BY id DESC LIMIT 1`, [taskId]);
  sourceUserId = latestHumanSource?.changed_by_id || task.source_user_id || sourceUserId;
  if (!sourceUserId) throw new HttpError(409, "任务没有可回答问题的人类来源方");
  const id=randomUUID(); await query(db,"INSERT INTO agent_task_questions(id,task_id,revision,asked_by_type,asked_by_id,source_user_id,question,asked_message_id) VALUES(?,?,?,?,?,?,?,?)",[id,taskId,task.revision,actor.type,actor.id,sourceUserId,question,messageId]);
  await query(db,"UPDATE agent_tasks SET status='waiting',revision=revision+1 WHERE id=?",[taskId]);
  await recordTaskStatusChange(db, taskId, task.status, actor, "向来源成员提问，等待回答");
  return (await query(db,"SELECT * FROM agent_task_questions WHERE id=?",[id]))[0];
}

export async function answerTaskQuestion(db, questionId, actor, answer, messageId = null) {
  return transaction(db, async (conn) => {
    const [question] = await query(conn, "SELECT q.*,t.project_id FROM agent_task_questions q JOIN agent_tasks t ON t.id=q.task_id WHERE q.id=? FOR UPDATE", [questionId]);
    if (!question) throw new HttpError(404, "任务问题不存在");
    if (question.status !== "open") throw new HttpError(409, "任务问题已经关闭");
    if (actor.type !== "human_member" || question.source_user_id !== actor.id) throw new HttpError(403, "只有任务最新来源人可以回答问题");
    await query(conn, "UPDATE agent_task_questions SET answer=?,status='answered',answered_message_id=?,answered_at=UTC_TIMESTAMP(3) WHERE id=?", [answer,messageId,questionId]);
    const [before] = await query(conn, "SELECT status FROM agent_tasks WHERE id=?", [question.task_id]);
    await query(conn, "UPDATE agent_tasks SET status='queued',revision=revision+1 WHERE id=? AND status='waiting'", [question.task_id]);
    await recordTaskStatusChange(conn, question.task_id, before?.status, actor, "问题已回答，重新排队");
    const answered = (await query(conn, "SELECT q.*,t.origin_thread_id FROM agent_task_questions q JOIN agent_tasks t ON t.id=q.task_id WHERE q.id=?", [questionId]))[0];
    if (answered?.origin_thread_id) publishWork(db, answered.origin_thread_id);
    return answered;
  });
}

export async function listTaskQuestions(db, taskId) { return query(db,"SELECT * FROM agent_task_questions WHERE task_id=? ORDER BY created_at",[taskId]); }

export async function reassignTask(db, taskId, actor, target, reason, messageId) {
  assertTarget(target.type, target.id);
  const result = await transaction(db, async (conn) => {
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    const l2Operator = actor.type === "l2_session";
    if (l2Operator) await assertL2CanOperateTask(conn, actor, task);
    else if (task.target_type !== actor.type || task.target_id !== actor.id)
      throw new HttpError(403, "只有当前任务目标可以转交任务");
    if (task.task_type === "assist_l2" && target.type !== "l2_session")
      throw new HttpError(403, "L2 辅助任务不能转交给其他责任主体");
    if (l2Operator && target.type === "human_member")
      await assertHumanMemberAuthorization(conn, task.project_id, actor, ASSIGN_HUMAN_AUTH);
    const reassignable = new Set(["awaiting_acceptance", "assigned", "queued", "waiting", "blocked"]);
    if (l2Operator) ["running", "failed", "cancelled"].forEach((status) => reassignable.add(status));
    if (!reassignable.has(task.status)) throw new HttpError(409, "当前任务状态不能转交");
    if (l2Operator) {
      await query(conn, `UPDATE agent_task_questions SET status='cancelled' WHERE task_id=? AND status='open'`, [taskId]);
      await query(conn, `UPDATE agent_task_execution_runs SET status='cancelled',error='任务转交，结束当前执行',
        finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`, [taskId]);
    }
    if (target.type === "human_member") {
      const [member] = await query(conn, "SELECT user_id FROM members WHERE project_id=? AND user_id=? AND role<>'viewer'", [task.project_id, target.id]);
      if (!member) throw new HttpError(400, "任务目标不是当前项目的可执行成员");
    } else {
      const [session] = await query(conn, `SELECT s.session_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
        WHERE s.session_id=? AND t.project_id=? AND (? IS NULL OR t.id=?)`,
      [target.id, task.project_id, task.origin_thread_id, task.origin_thread_id]);
      if (!session) throw new HttpError(400, "任务目标不是当前项目迭代的 L2");
    }
    const status = target.type === "human_member" ? "awaiting_acceptance" : "queued";
    await query(conn, `UPDATE agent_tasks SET target_type=?,target_id=?,claimed_by_type=NULL,claimed_by_id=NULL,
      execution_agent_type=NULL,execution_agent_id=NULL,execution_mode=NULL,status=?,revision=revision+1 WHERE id=?`,
    [target.type, target.id, status, taskId]);
    await query(conn, `INSERT INTO agent_task_assignment_events
      (task_id,event_type,from_target_type,from_target_id,to_target_type,to_target_id,changed_by_type,changed_by_id,reason,message_id)
      VALUES(?,'transferred',?,?,?,?,?,?,?,?)`, [taskId, task.target_type, task.target_id, target.type, target.id,
      actor.type, actor.id, reason || null, messageId || null]);
    if (target.type === "l2_session") {
      await query(conn, "UPDATE agent_tasks SET claimed_by_type='l2_session',claimed_by_id=? WHERE id=?", [target.id, taskId]);
    }
    await recordTaskStatusChange(conn, taskId, task.status, actor, reason || "任务转交");
    return getTask(conn, taskId);
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

export async function acceptTask(db, taskId, actor, mode = "auto") {
  const result = await transaction(db, async (conn) => {
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    if (task.target_type !== actor.type || task.target_id !== actor.id)
      throw new HttpError(403, "只有当前任务目标可以确认任务");
    if (task.status !== "awaiting_acceptance") throw new HttpError(409, "任务不在待确认状态");
    if (actor.type === "human_member" && mode === "auto") {
      const [online] = await query(conn, "SELECT c.id FROM connectors c JOIN connector_projects cp ON cp.connector_id=c.id WHERE c.user_id=? AND cp.project_id=? AND c.revoked_at IS NULL AND c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) LIMIT 1", [actor.id, task.project_id]);
      mode = online ? "member_connector" : "human_direct";
    }
    if (actor.type === "human_member" && !["human_direct", "member_connector"].includes(mode))
      throw new HttpError(400, "人类执行方式无效");
    const [connector] = actor.type === "human_member" && mode === "member_connector" ? await query(conn, `SELECT c.id FROM connectors c
      JOIN connector_projects cp ON cp.connector_id=c.id AND cp.project_id=?
      WHERE c.user_id=? AND c.revoked_at IS NULL ORDER BY c.last_seen_at DESC LIMIT 1`, [task.project_id, actor.id]) : [];
    if (actor.type === "human_member" && mode === "member_connector" && !connector) {
      // 区分「没有连接器 / 连接器离线 / 在线但未绑定当前项目」，提示成员该去做什么。
      const [state] = await query(conn, `SELECT COUNT(*) total,
        SUM(c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND)) online
        FROM connectors c WHERE c.user_id=? AND c.revoked_at IS NULL`, [actor.id]);
      if (!Number(state?.total)) throw new HttpError(409, "你还没有已授权的本机连接器：请先运行连接器并在网页完成授权，或改为「由我直接完成」");
      if (!Number(state?.online)) throw new HttpError(409, "本机连接器当前离线：请确认连接器正在运行并已登录，或改为「由我直接完成」");
      throw new HttpError(409, "本机连接器在线，但尚未绑定当前项目：请在连接器的项目列表中为该项目选择 Git 根目录并绑定，再重新接受任务");
    }
    const executionType = actor.type === "human_member" ? (mode === "member_connector" ? "human_connector" : "human_self") : "dsh_l3";
    await query(conn, `UPDATE agent_tasks SET status='queued',claimed_by_type=?,claimed_by_id=?,accepted_by_type=?,accepted_by_id=?,accepted_at=UTC_TIMESTAMP(3),
      execution_mode=?,execution_agent_type=?,execution_agent_id=? WHERE id=?`,
    [actor.type, actor.id, actor.type, actor.id, mode, executionType, executionType === "human_connector" ? connector.id : actor.id, taskId]);
    await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,executor_id,status)
      SELECT UUID(),id,revision,?,?,'queued' FROM agent_tasks WHERE id=?`, [executionType,executionType === "human_connector" ? connector.id : actor.id,taskId]);
    if (executionType === "human_connector") {
      const [existingAdapter] = await query(conn, "SELECT id FROM connector_tasks WHERE agent_task_id=? FOR UPDATE", [taskId]);
      if (!existingAdapter) {
        const [binding] = await query(conn, `SELECT cp.policy,cp.allow_git_push FROM connector_projects cp
          WHERE cp.connector_id=? AND cp.project_id=?`, [connector.id, task.project_id]);
        if (!binding) throw new HttpError(409, "连接器未关联当前项目");
        await query(conn, `INSERT INTO connector_tasks
          (id,agent_task_id,connector_id,project_id,thread_id,message_id,requested_by,assigned_to,instruction,policy,allow_git_push,status,progress)
          VALUES(UUID(),?,?,?,?,?,?,?,?,?,?, 'queued','等待本机连接器领取')`, [taskId, connector.id, task.project_id,
          task.origin_thread_id, task.source_message_id, task.source_user_id || actor.id, actor.id, `${task.title}\n\n${task.goal}${task.constraints ? `\n\n约束：${task.constraints}` : ""}`,
          binding.policy, binding.allow_git_push]);
      }
    }
    await recordTaskStatusChange(conn, taskId, task.status, actor,
      executionType === "human_connector" ? "成员接受任务，交给本机连接器执行" : executionType === "human_self" ? "成员接受任务，由本人完成" : "接受任务");
    return getTask(conn, taskId);
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

export async function claimTask(db, taskId, actor) {
  return transaction(db, async (conn) => {
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    if (task.target_type !== actor.type || task.target_id !== actor.id) throw new HttpError(403, "只有当前目标可以认领任务");
    if (["completed","failed","cancelled","superseded"].includes(task.status)) throw new HttpError(409, "任务已经结束");
    await query(conn, "UPDATE agent_tasks SET claimed_by_type=?,claimed_by_id=?,status='running',revision=revision+1 WHERE id=?", [actor.type,actor.id,taskId]);
    await query(conn, "UPDATE agent_task_execution_runs SET status='running',started_at=COALESCE(started_at,UTC_TIMESTAMP(3)) WHERE task_id=? AND status='queued' ORDER BY created_at DESC LIMIT 1", [taskId]);
    await recordTaskStatusChange(conn, taskId, task.status, actor, "认领并开始执行");
    return getTask(conn,taskId);
  });
}

export async function rejectTask(db, taskId, actor, reason) {
  const result = await transaction(db, async (conn) => {
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? AND target_type=? AND target_id=? FOR UPDATE", [taskId, actor.type, actor.id]);
    if (!task) throw new HttpError(404, "任务不存在或不属于当前目标");
    if (task.status !== "awaiting_acceptance") throw new HttpError(409, "任务不在待确认状态");
    await query(conn, "UPDATE agent_tasks SET status='cancelled',progress=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?", [reason || "目标成员拒绝任务", taskId]);
    await query(conn, `INSERT INTO agent_task_assignment_events
      (task_id,event_type,from_target_type,from_target_id,changed_by_type,changed_by_id,reason)
      VALUES(?,'rejected',?,?,?,?,?)`, [taskId, task.target_type, task.target_id, actor.type, actor.id,
      reason || "目标成员拒绝任务"]);
    await recordTaskStatusChange(conn, taskId, task.status, actor, reason || "目标成员拒绝任务");
    return getTask(conn, taskId);
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

async function rejectionReviewActor(db, taskId, conn = db) {
  const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=?", [taskId]);
  if (!task) throw new HttpError(404, "任务不存在");
  const events = await query(conn, `SELECT id,event_type,changed_by_type,changed_by_id FROM agent_task_assignment_events
    WHERE task_id=? ORDER BY id DESC`, [taskId]);
  const rejected = events.find((event) => event.event_type === "rejected");
  if (!rejected) return { task, rejected: null, reviewer: null, resolved: false };
  const resolved = events.some((event) => event.id > rejected.id && ["acknowledged", "reopened"].includes(event.event_type));
  const priorHuman = events.find((event) => event.id < rejected.id && event.changed_by_type === "human_member");
  const reviewer = priorHuman
    ? { type: "human_member", id: priorHuman.changed_by_id }
    : task.created_by_type === "human_member"
      ? { type: "human_member", id: task.created_by_id }
      : task.created_by_type === "l2_session"
        ? { type: "l2_session", id: task.created_by_id }
        : task.source_user_id ? { type: "human_member", id: task.source_user_id } : null;
  return { task, rejected, reviewer, resolved };
}

export async function taskRejectionReview(db, taskId) {
  const review = await rejectionReviewActor(db, taskId);
  return { rejected: !!review.rejected, resolved: review.resolved,
    reviewer_type: review.reviewer?.type || null, reviewer_id: review.reviewer?.id || null };
}

async function assertRejectionReviewer(review, actor, conn) {
  if (!review.rejected || review.task.status !== "cancelled") throw new HttpError(409, "任务没有待处理的拒绝结果");
  if (review.resolved) throw new HttpError(409, "拒绝结果已经处理");
  if (actor.type === "l2_session") {
    await assertL2CanOperateTask(conn, actor, review.task);
    return;
  }
  if (!review.reviewer || review.reviewer.type !== actor.type || review.reviewer.id !== actor.id)
    throw new HttpError(403, "只有任务创建者或最近转发者可以处理拒绝结果");
}

export async function acknowledgeTaskRejection(db, taskId, actor) {
  return transaction(db, async (conn) => {
    const review = await rejectionReviewActor(db, taskId, conn);
    await assertRejectionReviewer(review, actor, conn);
    await query(conn, `INSERT INTO agent_task_assignment_events
      (task_id,event_type,from_target_type,from_target_id,changed_by_type,changed_by_id,reason)
      VALUES(?,'acknowledged',?,?,?,?,?)`, [taskId, review.task.target_type, review.task.target_id,
      actor.type, actor.id, "已知晓任务被拒绝"]);
    return getTask(conn, taskId);
  });
}

export async function reopenRejectedTask(db, taskId, actor, update = {}) {
  const result = await transaction(db, async (conn) => {
    const [locked] = await query(conn, "SELECT id FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!locked) throw new HttpError(404, "任务不存在");
    const review = await rejectionReviewActor(db, taskId, conn);
    await assertRejectionReviewer(review, actor, conn);
    const nextStatus = review.task.target_type === "human_member" ? "awaiting_acceptance" : "queued";
    await query(conn, `UPDATE agent_tasks SET title=COALESCE(?,title),goal=COALESCE(?,goal),constraints=IF(?,?,constraints),
      status=?,claimed_by_type=IF(target_type='l2_session','l2_session',NULL),
      claimed_by_id=IF(target_type='l2_session',target_id,NULL),accepted_by_type=NULL,accepted_by_id=NULL,accepted_at=NULL,
      execution_mode=NULL,execution_agent_type=NULL,execution_agent_id=NULL,progress=NULL,result_summary=NULL,artifact_refs=NULL,
      finished_at=NULL,revision=revision+1 WHERE id=?`, [update.title || null, update.goal || null,
      update.constraints !== undefined, update.constraints ?? null, nextStatus, taskId]);
    await query(conn, `UPDATE agent_task_execution_runs SET status='cancelled',error='任务被拒绝后重新发起',
      finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`, [taskId]);
    await query(conn, `INSERT INTO agent_task_assignment_events
      (task_id,event_type,from_target_type,from_target_id,to_target_type,to_target_id,changed_by_type,changed_by_id,reason)
      VALUES(?,'reopened',?,?,?,?,?,?,?)`, [taskId, review.task.target_type, review.task.target_id,
      review.task.target_type, review.task.target_id, actor.type, actor.id, update.reason || "修改后重新发起"]);
    await recordTaskStatusChange(conn, taskId, review.task.status, actor, update.reason || "修改后重新发起");
    return getTask(conn, taskId);
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

const arrangeableStatuses = new Set(["draft", "awaiting_acceptance", "assigned", "queued", "running", "waiting", "blocked", "failed", "cancelled", "completed"]);

export async function recoverAbnormalTask(db, taskId, actor, update = {}) {
  const action = update.action === "cancel" ? "cancel" : "restart";
  const result = await transaction(db, async (conn) => {
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    await assertL2CanOperateTask(conn, actor, task);
    if (task.status === "superseded" || !arrangeableStatuses.has(task.status))
      throw new HttpError(409, "当前任务不能再安排");
    if (action === "cancel" && ["cancelled", "completed"].includes(task.status))
      throw new HttpError(409, "已结束任务不能取消");
    const interruptedAgentId = task.execution_agent_id || null;
    const reason = update.reason || (action === "cancel" ? "L2 取消任务" : "L2 重新安排任务");
    const dispatchL3 = task.target_type === "l2_session" || task.execution_agent_type === "dsh_l3" || task.task_type === "assist_l2";
    await query(conn, `UPDATE agent_task_questions SET status='cancelled' WHERE task_id=? AND status='open'`, [taskId]);
    await query(conn, `UPDATE agent_task_execution_runs SET status='cancelled',error=?,
      finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`,
    [action === "cancel" ? "任务被 L2 取消" : "任务由 L2 重新安排", taskId]);
    if (action === "cancel") {
      await query(conn, `UPDATE agent_tasks SET status='cancelled',progress=?,result_summary=COALESCE(?,result_summary),
        execution_agent_id=NULL,finished_at=UTC_TIMESTAMP(3),revision=revision+1 WHERE id=?`,
      [reason, update.resultSummary || reason, taskId]);
    } else if (dispatchL3) {
      await query(conn, `UPDATE agent_tasks SET title=COALESCE(?,title),goal=COALESCE(?,goal),constraints=IF(?,?,constraints),
        status='queued',progress='L2 已重新安排，等待任务级 Agent',result_summary=NULL,
        execution_mode=COALESCE(execution_mode,'dsh_l3'),execution_agent_type=COALESCE(execution_agent_type,'dsh_l3'),
        execution_agent_id=NULL,finished_at=NULL,revision=revision+1 WHERE id=?`,
      [update.title || null, update.goal || null, update.constraints !== undefined, update.constraints ?? null, taskId]);
      await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
        SELECT UUID(),id,revision,'dsh_l3','queued' FROM agent_tasks WHERE id=?`, [taskId]);
    } else {
      await query(conn, `UPDATE agent_tasks SET title=COALESCE(?,title),goal=COALESCE(?,goal),constraints=IF(?,?,constraints),
        status='awaiting_acceptance',progress='L2 已重新安排，等待目标成员确认',result_summary=NULL,
        claimed_by_type=NULL,claimed_by_id=NULL,accepted_by_type=NULL,accepted_by_id=NULL,accepted_at=NULL,
        execution_mode=NULL,execution_agent_type=NULL,execution_agent_id=NULL,finished_at=NULL,revision=revision+1 WHERE id=?`,
      [update.title || null, update.goal || null, update.constraints !== undefined, update.constraints ?? null, taskId]);
    }
    await recordTaskStatusChange(conn, taskId, task.status, actor, reason);
    return { ...await getTask(conn, taskId), action, interruptedAgentId };
  });
  if (result.origin_thread_id) publishWork(db, result.origin_thread_id);
  return result;
}

export async function inspectIterationTask(db, taskId, actor) {
  const task = await getTask(db, taskId);
  if (!task) throw new HttpError(404, "任务不存在");
  await assertL2CanOperateTask(db, actor, task);
  const [run] = await query(db, `SELECT id,status,progress,result_summary,error,executor_type,executor_id,
    started_at,heartbeat_at,finished_at,TIMESTAMPDIFF(SECOND, started_at, UTC_TIMESTAMP(3)) elapsed_seconds,
    TIMESTAMPDIFF(SECOND, COALESCE(heartbeat_at, started_at), UTC_TIMESTAMP(3)) heartbeat_age_seconds
    FROM agent_task_execution_runs WHERE task_id=? ORDER BY created_at DESC LIMIT 1`, [taskId]);
  const events = run?.executor_id ? await query(db, `SELECT tool,status,LEFT(input,240) input,LEFT(output,240) output,created_at,finished_at
    FROM agent_events WHERE agent_session_id=? ORDER BY id DESC LIMIT 8`, [run.executor_id]) : [];
  const live = ["running", "waiting"].includes(run?.status);
  const stale = live && Number(run.heartbeat_age_seconds || 0) >= 180;
  let suggestedNext = "keep";
  if (task.status === "failed" || run?.status === "failed") suggestedNext = "replace";
  else if (!run || ["queued", "cancelled", "interrupted"].includes(run.status)) suggestedNext = "dispatch";
  else if (stale) suggestedNext = "ask_or_replace";
  else if (live) suggestedNext = "ask";
  return {
    task: {
      id: task.id, title: task.title, status: task.status, progress: task.progress,
      result_summary: task.result_summary, target_type: task.target_type, target_id: task.target_id,
      execution_agent_id: task.execution_agent_id,
    },
    run: run || null,
    live,
    stale,
    lastEvents: events.reverse(),
    suggestedNext,
    askVia: live && run.executor_id ? { tool: "send_message", agentId: run.executor_id } : null,
    replaceVia: run?.executor_id ? { interruptAgentId: run.executor_id, recover: "restart" } : { recover: "restart" },
  };
}

export async function taskExecutionSnapshot(db, projectId) {
  return query(db, `SELECT t.id task_id,t.origin_thread_id,t.title,t.goal,t.task_type,t.status task_status,t.source_type,t.source_user_id,
    t.created_by_type,t.created_by_id,t.target_type,t.target_id,t.claimed_by_type,t.claimed_by_id,t.execution_mode,t.execution_agent_type,
    t.result_summary,t.artifact_refs,r.id run_id,r.status run_status,r.executor_type,r.executor_id,r.progress,r.started_at,r.finished_at
    FROM agent_tasks t LEFT JOIN agent_task_execution_runs r ON r.id=(SELECT x.id FROM agent_task_execution_runs x WHERE x.task_id=t.id ORDER BY x.created_at DESC LIMIT 1)
    WHERE t.project_id=? ORDER BY t.updated_at DESC LIMIT 200`, [projectId]);
}

export async function listAssignmentEvents(db, taskId) {
  return query(db, "SELECT * FROM agent_task_assignment_events WHERE task_id=? ORDER BY id", [taskId]);
}

export async function listTaskExecutionRuns(db, taskId) {
  return query(db, "SELECT * FROM agent_task_execution_runs WHERE task_id=? ORDER BY created_at DESC", [taskId]);
}

export async function listTaskUpdates(db, taskId) {
  return query(db, "SELECT * FROM agent_task_pool_updates WHERE task_id=? ORDER BY created_at", [taskId]);
}

function assistantText(blocks = []) {
  return blocks.filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text).join("\n").trim();
}

export async function bindDshL3Execution(db, l2SessionId, childSessionId, taskId) {
  return transaction(db, async (conn) => {
    const [session] = await query(conn, "SELECT session_id FROM agent_sessions WHERE session_id=? FOR UPDATE", [l2SessionId]);
    if (!session) throw new HttpError(404, "L2 session 不存在");
    const [capacity] = await query(conn, `SELECT COUNT(*) active FROM agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.target_type='l2_session' AND t.target_id=? AND r.executor_type='dsh_l3'
        AND r.status IN ('running','waiting')`, [l2SessionId]);
    if (Number(capacity.active) >= 7) throw new HttpError(409, "当前 L2 已有 7 个运行中的 DSH L3");
    if (taskId) {
      const [task] = await query(conn, `SELECT * FROM agent_tasks WHERE id=? AND target_type='l2_session'
        AND target_id=? AND task_type IN ('assist_l2','formal') FOR UPDATE`, [taskId, l2SessionId]);
      if (!task) throw new HttpError(404, "当前 L2 没有这个可委派任务");
      if (task.status !== "queued") throw new HttpError(409, "任务当前不可启动 DSH L3");
      if (task.task_type === "formal") {
        await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
          SELECT UUID(),t.id,t.revision,'dsh_l3','queued' FROM agent_tasks t
          WHERE t.id=? AND NOT EXISTS (SELECT 1 FROM agent_task_execution_runs r
            WHERE r.task_id=t.id AND r.task_revision=t.revision AND r.status IN ('queued','running','waiting'))`, [taskId]);
      }
    }
    const values = [l2SessionId];
    let taskFilter = "";
    if (taskId) { taskFilter = "AND t.id=?"; values.push(taskId); }
    const [run] = await query(conn, `SELECT r.id run_id,t.* FROM agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.target_type='l2_session' AND t.target_id=? AND t.task_type IN ('assist_l2','formal')
        AND r.executor_type='dsh_l3' AND r.status='queued' AND r.executor_id IS NULL AND r.task_revision=t.revision ${taskFilter}
      ORDER BY r.created_at LIMIT 1 FOR UPDATE`, values);
    if (!run) return null;
    await query(conn, `UPDATE agent_task_execution_runs SET executor_id=?,status='running',
      started_at=COALESCE(started_at,UTC_TIMESTAMP(3)),heartbeat_at=UTC_TIMESTAMP(3) WHERE id=?`, [childSessionId, run.run_id]);
    await query(conn, `UPDATE agent_tasks SET status='running',execution_mode='dsh_l3',
      execution_agent_type='dsh_l3',execution_agent_id=?,progress='DSH L3 正在执行' WHERE id=?`,
    [childSessionId, run.id]);
    const l3Actor = { type: "dsh_l3", id: childSessionId };
    await recordTaskStatusChange(conn, run.id, run.status, l3Actor, "任务级 Agent 开始执行");
    if (run.source_task_id) {
      const [sourceBefore] = await query(conn, "SELECT status FROM agent_tasks WHERE id=?", [run.source_task_id]);
      await query(conn, `UPDATE agent_tasks SET execution_mode='dsh_l3',
        execution_agent_type='dsh_l3',execution_agent_id=?,status=IF(status='queued','running',status),revision=revision+1
        WHERE id=? AND status NOT IN ('completed','failed','cancelled','superseded')`, [childSessionId, run.source_task_id]);
      await recordTaskStatusChange(conn, run.source_task_id, sourceBefore?.status, l3Actor, "辅助任务的任务级 Agent 开始执行");
    }
    return getTask(conn, run.id);
  });
}

export async function ensureDshL3CanUpdate(db, l2SessionId, childSessionId, taskId) {
  const [assigned] = await query(db, `SELECT id FROM agent_tasks
    WHERE id=? AND target_type='l2_session' AND target_id=?
      AND execution_agent_type='dsh_l3' AND execution_agent_id=?`, [taskId, l2SessionId, childSessionId]);
  if (assigned) return;
  try {
    const bound = await bindDshL3Execution(db, l2SessionId, childSessionId, taskId);
    if (bound?.execution_agent_id === childSessionId) return;
  } catch (error) {
    if (error?.status !== 409 && error?.status !== 404) throw error;
  }
  throw new HttpError(403, "L3 只能更新分派给自己的任务");
}

export async function settleDshL3Execution(db, l2SessionId, childSessionId, notification) {
  const result = await transaction(db, async (conn) => {
    const [run] = await query(conn, `SELECT r.id run_id,r.status run_status,r.result_summary run_result,t.* FROM agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.target_type='l2_session' AND t.target_id=? AND r.executor_type='dsh_l3'
        AND r.executor_id=? AND r.status IN ('running','waiting','completed','failed','interrupted')
      ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE`, [l2SessionId, childSessionId]);
    if (!run) return null;
    const output = assistantText(notification.lastAssistantMessage);
    let reportedStatus = null;
    let reportedSummary = null;
    for (const event of await query(conn, `SELECT tool,input FROM agent_events
      WHERE agent_session_id=? AND status='completed' AND tool IN ('report_task','update_task')
      ORDER BY id DESC LIMIT 8`, [childSessionId])) {
      let args = {};
      try { args = typeof event.input === "string" ? JSON.parse(event.input) : event.input || {}; } catch {}
      const status = String(args.status || "");
      if (event.tool === "report_task" || ["completed", "failed", "blocked"].includes(status)) {
        reportedStatus = event.tool === "report_task" ? (status || "completed") : status;
        reportedSummary = args.summary || args.resultSummary || null;
        break;
      }
    }
    const taskAlreadyEnded = ["completed", "failed", "cancelled"].includes(run.status);
    const stoppedCleanly = notification.status === "ok" && notification.stopReason === "completed";
    let taskStatus;
    let runStatus;
    let error = null;
    let summary = reportedSummary || run.result_summary || output || null;
    if (taskAlreadyEnded) {
      taskStatus = run.status;
      runStatus = ["completed", "failed"].includes(run.run_status) ? run.run_status
        : taskStatus === "failed" ? "failed" : "completed";
    } else if (reportedStatus) {
      taskStatus = reportedStatus === "blocked" ? "blocked" : reportedStatus;
      runStatus = taskStatus === "blocked" ? "completed" : taskStatus;
    } else if (notification.stopReason === "aborted") {
      taskStatus = "queued";
      runStatus = "interrupted";
      error = "DSH L3 aborted";
      summary = output || summary;
    } else {
      taskStatus = "failed";
      runStatus = "failed";
      error = stoppedCleanly ? "未回报结果" : `DSH L3 ${notification.stopReason || "error"}`;
      summary = output || summary || "未回报结果";
    }
    if (["running", "waiting"].includes(run.run_status)) {
      await query(conn, `UPDATE agent_task_execution_runs SET status=?,result_summary=?,error=?,
        heartbeat_at=UTC_TIMESTAMP(3),finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
      [runStatus, summary, error, run.run_id]);
    }
    if (!taskAlreadyEnded) {
      await query(conn, `UPDATE agent_tasks SET status=?,progress=?,result_summary=COALESCE(?,result_summary),
        execution_agent_id=?,finished_at=IF(? IN ('completed','failed'),UTC_TIMESTAMP(3),NULL),revision=revision+1 WHERE id=?`,
      [taskStatus, taskStatus === "completed" ? "DSH L3 已交活" : error || "DSH L3 已返回",
        summary, childSessionId, taskStatus, run.id]);
      await recordTaskStatusChange(conn, run.id, run.status, { type: "dsh_l3", id: childSessionId },
        taskStatus === "completed" ? "任务级 Agent 已交活"
          : runStatus === "interrupted" ? "任务级 Agent 被中止，重新排队"
          : `任务级 Agent 失败：${error}`);
    }
    if (run.source_task_id && !taskAlreadyEnded) {
      await query(conn, `INSERT INTO agent_task_pool_updates(id,task_id,source_type,source_id,body,revision)
        SELECT UUID(),?,'l2_session',?,CONCAT('辅助任务「',?, '」',?,IF(?='', '', CONCAT('\n',?))),revision
        FROM agent_tasks WHERE id=?`, [run.source_task_id, l2SessionId, run.title,
        taskStatus === "completed" ? "已完成。" : "未完成。", summary, summary, run.source_task_id]);
      await query(conn, `UPDATE agent_tasks SET progress=?,revision=revision+1 WHERE id=?
        AND status NOT IN ('completed','failed','cancelled','superseded')`,
      [taskStatus === "completed" ? "辅助 L3 已返回结果，等待 L2 汇总" : "辅助 L3 执行失败，等待 L2 处理", run.source_task_id]);
    }
    return { ...await getTask(conn, run.id), run_id: run.run_id };
  });
  if (result?.origin_thread_id) {
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
        failureReason: result.status === "completed" ? null : (result.progress || result.result_summary || "未回报结果"),
        sourceMessageId: result.source_message_id || null,
        sourceUserId: result.source_user_id || null,
      },
    });
    publishWork(db, result.origin_thread_id);
  }
  return result;
}

function closeEndedTaskRuns(conn, taskId, taskStatus) {
  const activeStatus = taskStatus === "completed" ? "completed" : taskStatus === "failed" ? "failed" : "interrupted";
  return query(conn, `UPDATE agent_task_execution_runs SET
    error=IF(status='queued',COALESCE(error,'任务已结束，L3 未启动'),error),
    status=IF(status='queued','cancelled',?),
    finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3))
    WHERE task_id=? AND status IN ('queued','running','waiting')`, [activeStatus, taskId]);
}

export async function reconcileEndedTaskRuns(db) {
  const rows = await query(db, `SELECT r.id,t.id task_id,t.status FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE r.status IN ('queued','running','waiting') AND t.status IN ('completed','failed','cancelled','superseded')`);
  if (!rows.length) return 0;
  await transaction(db, async (conn) => {
    for (const row of [...new Map(rows.map((item) => [item.task_id, item])).values()])
      await closeEndedTaskRuns(conn, row.task_id, row.status);
  });
  return rows.length;
}

export async function voidSelfHandledAssistTasks(db) {
  const tasks = await query(db, `SELECT id FROM agent_tasks
    WHERE task_type='assist_l2' AND status IN ('completed','failed')
      AND (execution_agent_id IS NULL OR execution_agent_id='')`);
  if (!tasks.length) return 0;
  await transaction(db, async (conn) => {
    await query(conn, `INSERT INTO agent_task_status_events(task_id,from_status,to_status,actor_type,reason)
      SELECT id,status,'cancelled','system','小祥自行处理，未调度任务级 Agent，已从任务池撤销' FROM agent_tasks
      WHERE task_type='assist_l2' AND status IN ('completed','failed') AND (execution_agent_id IS NULL OR execution_agent_id='')`);
    await query(conn, `UPDATE agent_tasks SET status='cancelled',
      result_summary=TRIM(BOTH CHAR(10) FROM CONCAT(IFNULL(result_summary,''), IF(IFNULL(result_summary,'')='','',CHAR(10)),
        '小祥自行处理，未调度任务级 Agent，已从任务池撤销。')),
      finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3)), revision=revision+1
      WHERE task_type='assist_l2' AND status IN ('completed','failed')
        AND (execution_agent_id IS NULL OR execution_agent_id='')`);
    for (const task of tasks) await closeEndedTaskRuns(conn, task.id, "cancelled");
  });
  return tasks.length;
}

export async function recoverInterruptedDshL3Executions(db) {
  await voidSelfHandledAssistTasks(db);
  await reconcileEndedTaskRuns(db);
  const runs = await query(db, `SELECT r.id,r.task_id,t.origin_thread_id,t.source_message_id,t.source_user_id,t.title
    FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id WHERE r.executor_type='dsh_l3' AND r.status IN ('running','waiting')`);
  if (!runs.length) return 0;
  await transaction(db, async (conn) => {
    await query(conn, `UPDATE agent_task_execution_runs SET status='interrupted',error='服务重启，等待 L2 重新评估',
      finished_at=UTC_TIMESTAMP(3) WHERE executor_type='dsh_l3' AND status IN ('running','waiting')`);
    await query(conn, `INSERT INTO agent_task_status_events(task_id,from_status,to_status,actor_type,reason)
      SELECT t.id,t.status,'queued','system','服务重启，任务级 Agent 中断，等待 L2 重新评估' FROM agent_tasks t
      WHERE t.task_type IN ('assist_l2','formal') AND t.status='running'
        AND EXISTS (SELECT 1 FROM agent_task_execution_runs r WHERE r.task_id=t.id AND r.status='interrupted')`);
    await query(conn, `UPDATE agent_tasks t SET t.status='queued',t.execution_agent_id=IF(t.task_type='assist_l2',NULL,t.execution_agent_id),
      t.progress='服务重启，等待 L2 重新评估',t.finished_at=NULL,t.revision=t.revision+1
      WHERE t.task_type IN ('assist_l2','formal') AND t.status='running'
        AND EXISTS (SELECT 1 FROM agent_task_execution_runs r WHERE r.task_id=t.id AND r.status='interrupted')`);
    await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
      SELECT UUID(),t.id,t.revision,'dsh_l3','queued' FROM agent_tasks t
      WHERE t.task_type IN ('assist_l2','formal') AND t.status='queued'
        AND EXISTS (SELECT 1 FROM agent_task_execution_runs old WHERE old.task_id=t.id AND old.status='interrupted')
        AND NOT EXISTS (SELECT 1 FROM agent_task_execution_runs active WHERE active.task_id=t.id AND active.status IN ('queued','running','waiting'))`);
  });
  for (const threadId of new Set(runs.map((row) => row.origin_thread_id).filter(Boolean))) publishWork(db, threadId);
  for (const run of runs) {
    if (!run.origin_thread_id) continue;
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
        failureReason: "服务重启，任务级 Agent 中断，等待 L2 重新评估",
        sourceMessageId: run.source_message_id || null,
        sourceUserId: run.source_user_id || null,
      },
    });
  }
  return runs.length;
}
