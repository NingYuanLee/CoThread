import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import { publishWork } from "./work-events.js";
import { enqueueCoordinatorEvent } from "./coordinator-events.js";
import { AGENT_MEMBER } from "../shared/agent-member.js";
import { folderRootKind, latestVersionsByFolderRoots } from "./project-library.js";

const targetTypes = new Set(["human_member", "l2_session"]);
const FOREIGN_TASK_AUTH = "非本 L2 责任的任务需要人类成员账号明确授权";
const ASSIGN_HUMAN_AUTH = "把任务指派给人类成员需要人类成员账号明确授权";
export const MAX_L3 = 7;
export const L3_LIVE_RUN = ["queued", "running", "waiting"];
export const TASK_ENDED = ["completed", "failed", "cancelled", "rejected", "abandoned", "superseded"];
const L3_NAMES = ["大娃", "二娃", "三娃", "四娃", "五娃", "六娃", "七娃"];
export { L3_NAMES as L3_EXECUTOR_NAMES };

/** Sticky L3 nickname index: first appearance on the thread keeps 大娃/二娃/… forever. */
export async function stickyL3ExecutorIds(conn, originThreadId) {
  if (!originThreadId) return [];
  const rows = await query(conn, `SELECT r.executor_id FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE t.origin_thread_id=? AND r.executor_type='dsh_l3' AND r.executor_id IS NOT NULL
    GROUP BY r.executor_id
    ORDER BY MIN(r.created_at), MIN(r.id)`, [originThreadId]);
  return rows.map((row) => row.executor_id);
}

export function stickyL3Label(executorId, knownIds) {
  if (!executorId) return null;
  const index = knownIds.indexOf(executorId);
  if (index >= 0 && index < L3_NAMES.length) return `L3-${L3_NAMES[index]}`;
  return `L3-${String(executorId).slice(0, 8)}`;
}
const TASK_UPDATE_STATUSES = ["pending_assignment", "pending_start", "queued", "running", "waiting", "blocked",
  "completed", "failed", "cancelled", "abandoned"];
const L3_DISPATCH_STATUSES = ["pending_assignment", "queued", "running", "waiting"];
export const MAX_TASK_RETRIES = 5;
export const MAX_EXECUTOR_ATTEMPTS = 2;
export const MAX_DISTINCT_EXECUTORS = 3;
/** Auto-recover L3 runs whose heartbeat is older than this (seconds). Inspect uses 180s as "ask". */
export const L3_STALE_HEARTBEAT_SECONDS = 600;

/** Refresh L3 run liveness; optionally rewrite progress (e.g. inference phase). */
export async function touchL3RunHeartbeat(db, executorId, { progress } = {}) {
  if (!executorId) return false;
  const result = progress != null
    ? await query(db, `UPDATE agent_task_execution_runs
        SET heartbeat_at=UTC_TIMESTAMP(3), progress=?
        WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')`,
      [String(progress).slice(0, 500), executorId])
    : await query(db, `UPDATE agent_task_execution_runs
        SET heartbeat_at=UTC_TIMESTAMP(3)
        WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')`,
      [executorId]);
  return (result.affectedRows || 0) > 0;
}

/**
 * Keep L3 alive while the model thinks after a tool completes.
 * If progress still ends with「已完成」, rewrite it to「正在调用模型」so the UI
 * does not look stuck on the last tool.
 */
export async function touchL3InferenceHeartbeat(db, executorId) {
  if (!executorId) return false;
  const [run] = await query(db, `SELECT progress FROM agent_task_execution_runs
    WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')
    ORDER BY created_at DESC LIMIT 1`, [executorId]);
  if (!run) return false;
  const toolDone = typeof run.progress === "string" && /已完成(?:$| ·)/.test(run.progress);
  return touchL3RunHeartbeat(db, executorId, toolDone ? { progress: "正在调用模型" } : {});
}

async function enqueueInterruptedL3Recovery(db, runs, failureReason) {
  for (const threadId of new Set(runs.map((row) => row.origin_thread_id).filter(Boolean))) publishWork(db, threadId);
  const dispatchByThread = new Map();
  for (const run of runs) {
    if (!run.origin_thread_id) continue;
    if (!dispatchByThread.has(run.origin_thread_id)) {
      const [session] = await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [run.origin_thread_id]);
      dispatchByThread.set(run.origin_thread_id, session
        ? await l3DispatchSnapshot(db, session.session_id)
        : { idleL3Count: 0, pendingAssignment: 0, pendingTasks: [] });
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

const FAILURE_CLASSES = new Set(["interrupted", "transient", "agent_error", "platform_blocked", "external_unknown", "blocked"]);
const PLATFORM_FAILURE = /任务已停止|迭代已归档|权限不足|没有权限|限流|too many requests|rate limit|service unavailable|temporarily unavailable|timeout|timed out|\b5\d\d\b|econnreset|econnrefused|网络错误|网络中断|服务不可用/i;

function failureSignature(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<id>")
    .replace(/\b\d{2,}\b/g, "<n>").replace(/\s+/g, " ").slice(0, 255);
}

export function classifyTaskFailure({ status, error, summary, stopReason, toolError } = {}) {
  if (status === "blocked") return "blocked";
  if (stopReason === "aborted") return "interrupted";
  const text = [error, summary, toolError].filter(Boolean).join(" ");
  if (PLATFORM_FAILURE.test(text)) return "platform_blocked";
  if (/未回报结果|没有结果|未完成|无法继续|失败/i.test(text)) return "agent_error";
  if (/timeout|timed out|暂时|重试|retry|429|408/i.test(text)) return "transient";
  return "agent_error";
}

function failureText({ error, summary, toolError, stopReason } = {}) {
  return error || toolError || summary || stopReason || null;
}

async function latestToolFailure(conn, childSessionId) {
  if (!childSessionId) return null;
  const [row] = await query(conn, `SELECT tool,output FROM agent_events
    WHERE agent_session_id=? AND status='failed' ORDER BY id DESC LIMIT 1`, [childSessionId]);
  return row ? `${row.tool || "tool"}: ${row.output || "工具失败"}` : null;
}

async function taskRetryStats(conn, taskId, signature, executorId) {
  const [same] = await query(conn, `SELECT COUNT(*) count FROM agent_task_execution_runs
    WHERE task_id=? AND failure_signature=?`, [taskId, signature]);
  const [executor] = await query(conn, `SELECT COUNT(*) count FROM agent_task_execution_runs
    WHERE task_id=? AND executor_id=? AND status IN ('failed','interrupted','completed')`, [taskId, executorId]);
  const [distinct] = await query(conn, `SELECT COUNT(DISTINCT executor_id) count FROM agent_task_execution_runs
    WHERE task_id=? AND executor_type='dsh_l3' AND executor_id IS NOT NULL`, [taskId]);
  return { sameSignature: Number(same?.count || 0), executorAttempts: Number(executor?.count || 0), distinctExecutors: Number(distinct?.count || 0) };
}

async function busyL3Count(conn, l2SessionId) {
  const [row] = await query(conn, `SELECT COUNT(DISTINCT t.id) active FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE t.target_type='l2_session' AND t.target_id=? AND r.executor_type='dsh_l3'
      AND (
        r.status IN ('running','waiting')
        OR (r.status='queued' AND r.executor_id IS NULL AND r.task_revision=t.revision)
      )`, [l2SessionId]);
  return Number(row?.active || 0);
}

export async function idleL3Count(conn, l2SessionId) {
  if (!l2SessionId) return 0;
  return Math.max(0, MAX_L3 - await busyL3Count(conn, l2SessionId));
}

async function liveL3Count(conn, l2SessionId) {
  const [row] = await query(conn, `SELECT COUNT(DISTINCT t.id) active FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE t.target_type='l2_session' AND t.target_id=? AND r.executor_type='dsh_l3'
      AND r.status IN ('running','waiting')`, [l2SessionId]);
  return Number(row?.active || 0);
}

export async function tasksAwaitingL3Launch(db, l2SessionId) {
  if (!l2SessionId) return [];
  const room = MAX_L3 - await liveL3Count(db, l2SessionId);
  if (room <= 0) return [];
  return query(db, `SELECT id FROM agent_tasks t
    WHERE t.target_type='l2_session' AND t.target_id=?
      AND t.task_type IN ('assist_l2','formal')
      AND t.status IN ('pending_assignment','running','queued')
      AND (t.execution_agent_id IS NULL OR t.execution_agent_id='')
      AND NOT EXISTS (
        SELECT 1 FROM agent_task_execution_runs r
        WHERE r.task_id=t.id AND r.executor_type='dsh_l3' AND r.executor_id IS NOT NULL
          AND r.status IN ('running','waiting')
      )
    ORDER BY t.status='pending_assignment', t.created_at
    LIMIT ${room}`, [l2SessionId]);
}

export async function l3LaunchPrompt(db, taskId) {
  const task = await getTask(db, taskId);
  if (!task || task.execution_agent_id) return null;
  const { documents, folders } = await documentsForTaskInstruction(
    db, task.project_id, task.document_refs, task.folder_refs,
  );
  return {
    task,
    label: String(task.title || "任务").slice(0, 80),
    prompt: `TASK_ID: ${task.id}\n${composeTaskInstruction(task, documents, folders)}`,
  };
}

async function l3DispatchSnapshot(conn, l2SessionId) {
  const idleL3CountValue = await idleL3Count(conn, l2SessionId);
  const pending = await query(conn, `SELECT id,title FROM agent_tasks
    WHERE target_type='l2_session' AND target_id=? AND status='pending_assignment'
    ORDER BY created_at`, [l2SessionId]);
  return {
    idleL3Count: idleL3CountValue,
    pendingAssignment: pending.length,
    pendingTasks: pending.slice(0, idleL3CountValue).map((task) => ({
      id: task.id,
      title: String(task.title || "").slice(0, 80),
    })),
  };
}

export async function finishCoordinatorDispatch(db, threadId, { enqueueIdle = true } = {}) {
  if (!threadId) return { released: 0, enqueued: false };
  const released = await transaction(db, async (conn) => {
    const [session] = await query(conn, "SELECT session_id FROM agent_sessions WHERE thread_id=? FOR UPDATE", [threadId]);
    if (!session) return 0;
    const rows = await query(conn, `SELECT t.id,t.status,r.id run_id FROM agent_tasks t
      JOIN agent_task_execution_runs r ON r.task_id=t.id AND r.task_revision=t.revision
      WHERE t.origin_thread_id=? AND t.target_type='l2_session' AND t.target_id=?
        AND t.task_type IN ('assist_l2','formal') AND t.status='running'
        AND r.executor_type='dsh_l3' AND r.status='queued' AND r.executor_id IS NULL
      FOR UPDATE`, [threadId, session.session_id]);
    for (const row of rows) {
      await query(conn, `UPDATE agent_task_execution_runs SET status='cancelled',error='本轮未绑定 L3，退回待指派',
        finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='queued'`, [row.run_id]);
      await query(conn, `UPDATE agent_tasks SET status='pending_assignment',execution_agent_id=NULL,
        progress='本轮未绑定 L3，退回待指派',finished_at=NULL,revision=revision+1
        WHERE id=? AND status='running'`, [row.id]);
      await recordTaskStatusChange(conn, row.id, row.status, { type: "system" }, "本轮未绑定 L3，退回待指派");
    }
    return rows.length;
  });
  if (!enqueueIdle) return { released, enqueued: false };
  const [session] = await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [threadId]);
  if (!session) return { released, enqueued: false };
  const snapshot = await l3DispatchSnapshot(db, session.session_id);
  if (!snapshot.pendingAssignment || snapshot.idleL3Count < 1) return { released, enqueued: false };
  const [existing] = await query(db, `SELECT id FROM coordinator_events
    WHERE thread_id=? AND kind='l3_idle' AND status IN ('queued','running') LIMIT 1`, [threadId]);
  if (existing) return { released, enqueued: false };
  const [source] = await query(db, `SELECT id,title,source_message_id,source_user_id FROM agent_tasks
    WHERE id=?`, [snapshot.pendingTasks[0].id]);
  await enqueueCoordinatorEvent(db, {
    threadId,
    kind: "l3_idle",
    messageId: source?.source_message_id || null,
    taskId: source?.id || null,
    payload: {
      ...snapshot,
      title: source?.title || null,
      sourceMessageId: source?.source_message_id || null,
      sourceUserId: source?.source_user_id || null,
    },
  });
  return { released, enqueued: true };
}

function assertTarget(type, id) {
  if (!targetTypes.has(type) || typeof id !== "string" || !id) throw new HttpError(400, "任务目标无效");
}

export function parseDocumentRefs(value) {
  if (value == null || value === "") return [];
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(parsed) ? [...new Set(parsed.filter((id) => typeof id === "string" && id))] : [];
}

async function assertDocumentRefs(conn, projectId, refs) {
  const ids = parseDocumentRefs(refs);
  if (ids.length > 30) throw new HttpError(400, "任务最多引用 30 个文档版本");
  for (const ref of ids) {
    const [version] = await query(conn, `SELECT v.id,a.folder_id FROM versions v JOIN artifacts a ON a.id=v.artifact_id
         LEFT JOIN version_recycle vr ON vr.version_id=v.id
         WHERE v.id=? AND a.project_id=? AND a.deleted_at IS NULL AND vr.version_id IS NULL`, [ref, projectId]);
    if (!version || (await folderRootKind(conn, version.folder_id)) !== "project_official")
      throw new HttpError(400, "任务只能引用本项目正式文件中的有效文档版本");
  }
  return ids;
}

async function assertFolderRefs(conn, projectId, refs) {
  const ids = parseDocumentRefs(refs);
  if (ids.length > 30) throw new HttpError(400, "任务最多引用 30 个文件夹");
  for (const ref of ids) {
    const [folder] = await query(conn, "SELECT id FROM document_folders WHERE id=? AND project_id=?", [ref, projectId]);
    if (!folder || (await folderRootKind(conn, ref)) !== "project_official")
      throw new HttpError(400, "任务只能引用本项目正式文件中的文件夹");
  }
  return ids;
}

async function stripDocumentRefsCoveredByFolders(conn, projectId, documentRefs, folderRefs) {
  if (!documentRefs.length || !folderRefs.length) return documentRefs;
  const versionsByFolder = await latestVersionsByFolderRoots(conn, projectId, folderRefs);
  const covered = new Set();
  for (const rows of versionsByFolder.values()) {
    for (const row of rows) covered.add(row.version_id);
  }
  return documentRefs.filter((id) => !covered.has(id));
}

async function documentRefLabels(conn, refs) {
  const ids = parseDocumentRefs(refs);
  if (!ids.length) return [];
  const rows = await query(conn, `SELECT v.id,a.title,v.version,v.filename FROM versions v
    JOIN artifacts a ON a.id=v.artifact_id WHERE v.id IN (${ids.map(() => "?").join(",")})`, ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id) || { id, title: id });
}

async function folderRefLabels(conn, projectId, refs) {
  const ids = parseDocumentRefs(refs);
  if (!ids.length) return [];
  const folders = await query(conn, "SELECT id,parent_id,name,folder_kind FROM document_folders WHERE project_id=?", [projectId]);
  const byId = new Map(folders.map((row) => [row.id, row]));
  const pathOf = (id) => {
    const names = [];
    let current = byId.get(id);
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(!current.parent_id && current.folder_kind === "project_official" ? "正式文件" : current.name || current.id);
      current = current.parent_id ? byId.get(current.parent_id) : null;
    }
    return names.join(" / ");
  };
  return ids.map((id) => ({ id, title: byId.has(id) ? pathOf(id) : id }));
}

async function documentsForTaskInstruction(conn, projectId, documentRefs, folderRefs) {
  return {
    documents: await documentRefLabels(conn, documentRefs),
    folders: await folderRefLabels(conn, projectId, folderRefs),
  };
}

export function composeTaskInstruction(task, documents = [], folders = []) {
  const parts = [task.title, "", task.goal];
  if (task.constraints) parts.push("", `约束：${task.constraints}`);
  if (folders.length) {
    parts.push("", "引用文件夹：");
    for (const folder of folders) parts.push(`- ${folder.title || folder.name || folder.id}`);
    parts.push("这些是文件夹。读取时请列出其下全部子目录和文件，不要把文件夹展开成有限个文件引用。");
  }
  if (documents.length) {
    parts.push("", "引用文档：");
    for (const doc of documents) {
      const name = doc.title || doc.filename || doc.id;
      parts.push(`- ${name}${doc.version ? ` · v${doc.version}` : ""}`);
    }
  }
  return parts.join("\n");
}

function withParsedTask(task) {
  if (!task) return task;
  return {
    ...task,
    document_refs: parseDocumentRefs(task.document_refs),
    folder_refs: parseDocumentRefs(task.folder_refs),
  };
}

function assertActorCanUpdateTask(task, actor) {
  if (actor?.type === "dsh_l3") {
    if (task.execution_agent_type !== "dsh_l3" || task.execution_agent_id !== actor.id)
      throw new HttpError(403, "只有当前任务目标可以更新任务");
    return;
  }
  if (task.target_type !== actor.type || task.target_id !== actor.id)
    throw new HttpError(403, "只有当前任务目标可以更新任务");
}

function isL2OwnResponsibility(task) {
  return task.task_type === "assist_l2" || task.target_type === "l2_session" || task.execution_agent_type === "dsh_l3";
}

const L3_DISPATCH_HINT = "任务已定，create_task 会尽量在同一次调用内启动并绑定 L3。见到 execution_agent_id 之前不要对成员说已经派人干活。";

export function withL3DispatchGate(task, extra = {}) {
  if (!task) return extra;
  const needsDispatch = L3_DISPATCH_STATUSES.includes(task.status)
    && isL2OwnResponsibility(task)
    && !task.execution_agent_id;
  return needsDispatch
    ? { ...task, ...extra, needsDispatch: true, started: false, dispatchHint: L3_DISPATCH_HINT }
    : { ...task, ...extra };
}

async function currentThreadL2Session(conn, threadId, projectId) {
  if (!threadId) return null;
  const [row] = await query(conn, `SELECT s.session_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
    WHERE t.id=? AND (? IS NULL OR t.project_id=?)`, [threadId, projectId || null, projectId || null]);
  return row || null;
}

async function adoptCurrentIterationL2(conn, task, l2SessionId) {
  if (!task || task.target_type !== "l2_session") return task;
  if (task.target_id === l2SessionId) return task;
  const [session] = await query(conn, "SELECT thread_id FROM agent_sessions WHERE session_id=?", [l2SessionId]);
  if (!session || !task.origin_thread_id || task.origin_thread_id !== session.thread_id)
    throw new HttpError(404, "当前 L2 没有这个可委派任务");
  await query(conn, "UPDATE agent_tasks SET target_id=?,claimed_by_type='l2_session',claimed_by_id=? WHERE id=?",
    [l2SessionId, l2SessionId, task.id]);
  return { ...task, target_id: l2SessionId, claimed_by_type: "l2_session", claimed_by_id: l2SessionId };
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
  if (!session) {
    if (task.origin_thread_id) {
      const current = await currentThreadL2Session(conn, task.origin_thread_id, task.project_id);
      if (current) throw new HttpError(409, "L2 会话已轮换，请重试本轮调度");
    }
    throw new HttpError(403, "当前 L2 不能操作其他项目的任务");
  }
  if (session.project_id !== task.project_id) throw new HttpError(403, "当前 L2 不能操作其他项目的任务");
  if (!task.origin_thread_id || task.origin_thread_id !== session.thread_id)
    throw new HttpError(403, "当前 L2 只能安排本迭代锁定的任务");
  if (!isL2OwnResponsibility(task)) await assertHumanMemberAuthorization(conn, task.project_id, actor);
}

// 状态变更记录：与写状态的语句放在同一事务里；status 未变化则不写。actor 为 { type, id }，type 取
// human_member / l2_session / dsh_l3 / connector / system。
export async function recordTaskStatusChange(conn, taskId, fromStatus, actor, reason = null) {
  const [row] = await query(conn, "SELECT status FROM agent_tasks WHERE id=?", [taskId]);
  if (!row || row.status === (fromStatus ?? null)) return null;
  const actorType = actor?.statusActorType || actor?.type || "system";
  const actorId = actor?.statusActorId || actor?.id || null;
  if (actorType !== "system" && !actorId) throw new Error(`任务状态变更缺少操作者 ID：${actorType}`);
  const connectorId = actor?.connectorId || actor?.statusConnectorId || null;
  let actorName = null;
  if (["human_member_connector", "human_member", "human_member_mcp", "human_member_connector_mcp"].includes(actorType)) {
    const [user] = await query(conn, "SELECT name FROM users WHERE id=?", [actorId]);
    actorName = user?.name || null;
  }
  if (actorType === "dsh_l3") {
    const [task] = await query(conn, "SELECT origin_thread_id FROM agent_tasks WHERE id=?", [taskId]);
    const known = await stickyL3ExecutorIds(conn, task?.origin_thread_id);
    if (actorId && !known.includes(actorId)) known.push(actorId);
    actorName = stickyL3Label(actorId, known);
  }
  await query(conn, `INSERT INTO agent_task_status_events(task_id,from_status,to_status,actor_type,actor_id,actor_connector_id,actor_name_snapshot,reason)
    VALUES(?,?,?,?,?,?,?,?)`,
    [taskId, fromStatus ?? null, row.status, actorType, actorId, connectorId, actorName, reason ? String(reason).slice(0, 500) : null]);
  return row.status;
}

export async function listTaskStatusEvents(db, taskId) {
  const rows = await query(db, `SELECT e.*,COALESCE(e.actor_name_snapshot,member_user.name,connector_user.name) actor_name
    FROM agent_task_status_events e
    LEFT JOIN users member_user ON e.actor_type IN ('human_member','human_member_connector','human_member_mcp','human_member_connector_mcp') AND member_user.id=e.actor_id
    LEFT JOIN connectors connector ON connector.id=COALESCE(e.actor_connector_id,IF(e.actor_type='connector',e.actor_id,NULL))
    LEFT JOIN users connector_user ON connector_user.id=connector.user_id
    WHERE e.task_id=? ORDER BY e.id`, [taskId]);
  const [task] = await query(db, "SELECT origin_thread_id FROM agent_tasks WHERE id=?", [taskId]);
  const l3Ids = await stickyL3ExecutorIds(db, task?.origin_thread_id);
  return rows.map((row) => ({ ...row,
    actor_name_snapshot: row.actor_name_snapshot || (row.actor_type === "dsh_l3" && row.actor_id
      ? stickyL3Label(row.actor_id, l3Ids) : null),
  }));
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
  if (input.createdByType === "human_member" && input.targetType && input.targetType !== "human_member")
    throw new HttpError(400, "人类成员创建的任务只能指派给人类成员");
  if (input.targetType) assertTarget(input.targetType, input.targetId);
  if (input.createdByType === "l2_session" && input.targetType === "human_member")
    await assertHumanMemberAuthorization(db, input.projectId, input, ASSIGN_HUMAN_AUTH);
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
        if (!current) throw new HttpError(400, "任务目标不是当前项目迭代的 L2");
        // Refuse to stamp tasks onto a rotated DB session while the live caller is still the old id.
        // That mismatch is what produces "已安排" + unbound L3 ghosts.
        if (input.createdByType === "l2_session" && input.createdById && input.createdById !== current.session_id)
          throw new HttpError(409, "L2 会话已轮换，请重试本轮调度");
        targetId = current.session_id;
      } else {
        const [target] = await query(conn, `SELECT s.session_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
          WHERE s.session_id=? AND t.project_id=?`, [input.targetId, input.projectId]);
        if (!target) throw new HttpError(400, "任务目标不是当前项目迭代的 L2");
      }
    }
    const idle = input.targetType === "l2_session" ? await idleL3Count(conn, targetId) : 0;
    if (input.taskType === "assist_l2" && idle < 1)
      throw new HttpError(409, "当前没有空闲 L3，不能创建辅助任务，请自行处理");
    const startL3Now = input.targetType === "l2_session" && idle >= 1
      && (input.taskType === "assist_l2" || input.taskType === "formal");
    const initialStatus = input.targetType === "human_member" ? "awaiting_acceptance"
      : startL3Now ? "running"
      : input.targetType === "l2_session" ? "pending_assignment"
      : "draft";
    await query(conn, `INSERT INTO agent_tasks
      (id,project_id,origin_thread_id,source_type,source_user_id,source_agent_session_id,source_message_id,source_task_id,
       created_by_type,created_by_id,task_type,title,goal,constraints,document_refs,folder_refs,target_type,target_id,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      id, input.projectId, input.originThreadId || null, input.sourceType, input.sourceUserId || null,
      input.sourceAgentSessionId || null, input.sourceMessageId || null, input.sourceTaskId || null,
      input.createdByType, input.createdById, input.taskType, input.title, input.goal, input.constraints || null,
      JSON.stringify(documentRefs), JSON.stringify(folderRefs), input.targetType || null, targetId, initialStatus,
    ]);
    if (input.targetType === "l2_session") {
      await query(conn, "UPDATE agent_tasks SET claimed_by_type='l2_session',claimed_by_id=?,execution_mode='dsh_l3',execution_agent_type='dsh_l3' WHERE id=?",
        [targetId, id]);
      if (startL3Now) {
        await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
          SELECT UUID(),id,revision,'dsh_l3','queued' FROM agent_tasks WHERE id=?`, [id]);
      }
    }
    await query(conn, `INSERT INTO agent_task_assignment_events
      (task_id,to_target_type,to_target_id,changed_by_type,changed_by_id,reason,message_id)
      VALUES(?,?,?,?,?,?,?)`, [id, input.targetType || null, targetId, input.createdByType,
      input.createdById, input.reason || null, input.sourceMessageId || null]);
    await recordTaskStatusChange(conn, id, null, { type: input.createdByType, id: input.createdById }, input.reason || "任务创建");
  });
  if (input.originThreadId) publishWork(db, input.originThreadId);
  return withL3DispatchGate(await getTask(db, id));
}

export async function getTask(db, id) {
  const [task] = await query(db, "SELECT * FROM agent_tasks WHERE id=?", [id]);
  return task ? withParsedTask(task) : null;
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
    assertActorCanUpdateTask(task, actor);
    let nextStatus = update.status || task.status;
    if (!TASK_UPDATE_STATUSES.includes(nextStatus)) throw new HttpError(400, "任务状态无效");
    if (TASK_ENDED.includes(task.status)) throw new HttpError(409, "任务已经结束");
    if (actor?.type === "human_member" && task.execution_agent_type === "human_self"
      && update.status && !["abandoned", "completed"].includes(update.status))
      throw new HttpError(409, "由本人执行的任务只能放弃或完成");
    if (task.task_type === "assist_l2" && ["completed", "failed"].includes(nextStatus) && !task.execution_agent_id) {
      nextStatus = "cancelled";
      if (!update.resultSummary) update = { ...update, resultSummary: "小祥自行处理，未调度任务级 Agent，已从任务池撤销。" };
    }
    const redispatchDsh = ["queued", "pending_assignment"].includes(nextStatus) && task.target_type === "l2_session"
      && (task.task_type === "assist_l2" || task.execution_agent_type === "dsh_l3");
    await query(conn, `UPDATE agent_tasks SET status=?,progress=COALESCE(?,progress),result_summary=COALESCE(?,result_summary),
      artifact_refs=COALESCE(?,artifact_refs),execution_agent_id=IF(?,NULL,execution_agent_id),
      finished_at=IF(? IN ('completed','failed','cancelled','rejected','abandoned'),UTC_TIMESTAMP(3),IF(?,NULL,finished_at)),revision=revision+1 WHERE id=?`,
    [nextStatus,update.progress||null,update.resultSummary||null,update.artifactRefs?JSON.stringify(update.artifactRefs):null,
      redispatchDsh,nextStatus,redispatchDsh,taskId]);
    if (redispatchDsh) {
      await query(conn, `UPDATE agent_task_execution_runs SET status='cancelled',error='任务 revision 已更新',
        finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`, [taskId]);
      if (nextStatus !== "pending_assignment") {
        await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
          SELECT UUID(),id,revision,'dsh_l3','queued' FROM agent_tasks WHERE id=?`, [taskId]);
      }
    } else if (["running", "waiting", "pending_start"].includes(nextStatus)) {
      await query(conn, `UPDATE agent_task_execution_runs SET status=?,
        progress=COALESCE(?,progress),result_summary=COALESCE(?,result_summary),
        started_at=COALESCE(started_at,UTC_TIMESTAMP(3))
        WHERE task_id=? AND executor_type<>'dsh_l3' AND status IN ('queued','running','waiting')`,
      [nextStatus, update.progress || null, update.resultSummary || null, taskId]);
    }
    if (TASK_ENDED.includes(nextStatus) || nextStatus === "blocked") await closeEndedTaskRuns(conn, taskId, nextStatus);
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
    const [task] = await query(conn, "SELECT target_type,execution_agent_id FROM agent_tasks WHERE id=?", [question.task_id]);
    const resume = task?.target_type === "l2_session" && !task.execution_agent_id ? "pending_assignment" : "running";
    await query(conn, "UPDATE agent_tasks SET status=?,revision=revision+1 WHERE id=? AND status='waiting'", [resume, question.task_id]);
    await recordTaskStatusChange(conn, question.task_id, before?.status, actor, resume === "pending_assignment" ? "问题已回答，等待指派空闲 L3" : "问题已回答，继续执行");
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
    const reassignable = new Set(["pending_assignment", "awaiting_acceptance", "pending_start", "assigned", "queued", "waiting", "blocked"]);
    if (l2Operator) ["running", "failed", "cancelled", "abandoned", "rejected"].forEach((status) => reassignable.add(status));
    if (!reassignable.has(task.status)) throw new HttpError(409, "当前任务状态不能转交");
    if (l2Operator) {
      await query(conn, `UPDATE agent_task_questions SET status='cancelled' WHERE task_id=? AND status='open'`, [taskId]);
      await query(conn, `UPDATE agent_task_execution_runs SET status='cancelled',error='任务转交，结束当前执行',
        finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`, [taskId]);
    }
    if (target.type === "human_member") {
      const [member] = await query(conn, "SELECT user_id FROM members WHERE project_id=? AND user_id=? AND role<>'viewer'", [task.project_id, target.id]);
      if (!member) throw new HttpError(400, "任务目标不是当前项目的可执行成员");
    } else if (task.origin_thread_id) {
      const current = await currentThreadL2Session(conn, task.origin_thread_id, task.project_id);
      if (!current) throw new HttpError(400, "任务目标不是当前项目迭代的 L2");
      target = { ...target, id: current.session_id };
    } else {
      const [session] = await query(conn, `SELECT s.session_id FROM agent_sessions s JOIN threads t ON t.id=s.thread_id
        WHERE s.session_id=? AND t.project_id=?`, [target.id, task.project_id]);
      if (!session) throw new HttpError(400, "任务目标不是当前项目迭代的 L2");
    }
    const status = target.type === "human_member" ? "awaiting_acceptance"
      : await idleL3Count(conn, target.id) >= 1 ? "running" : "pending_assignment";
    await query(conn, `UPDATE agent_tasks SET target_type=?,target_id=?,claimed_by_type=NULL,claimed_by_id=NULL,
      execution_agent_type=NULL,execution_agent_id=NULL,execution_mode=NULL,status=?,revision=revision+1 WHERE id=?`,
    [target.type, target.id, status, taskId]);
    await query(conn, `INSERT INTO agent_task_assignment_events
      (task_id,event_type,from_target_type,from_target_id,to_target_type,to_target_id,changed_by_type,changed_by_id,reason,message_id)
      VALUES(?,'transferred',?,?,?,?,?,?,?,?)`, [taskId, task.target_type, task.target_id, target.type, target.id,
      actor.type, actor.id, reason || null, messageId || null]);
    if (target.type === "l2_session") {
      await query(conn, "UPDATE agent_tasks SET claimed_by_type='l2_session',claimed_by_id=?,execution_mode='dsh_l3',execution_agent_type='dsh_l3' WHERE id=?",
        [target.id, taskId]);
      if (status === "running") {
        await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
          SELECT UUID(),id,revision,'dsh_l3','queued' FROM agent_tasks WHERE id=?`, [taskId]);
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
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    if (task.target_type !== actor.type || task.target_id !== actor.id)
      throw new HttpError(403, "只有当前任务目标可以确认任务");
    if (task.status !== "awaiting_acceptance") throw new HttpError(409, "任务不在待确认状态");
    if (actor.type === "human_member" && mode === "auto") {
      const [bound] = await query(conn, `SELECT c.id FROM connectors c JOIN connector_projects cp ON cp.connector_id=c.id
        WHERE c.user_id=? AND cp.project_id=? AND c.revoked_at IS NULL LIMIT 1`, [actor.id, task.project_id]);
      mode = bound ? "member_connector" : "human_direct";
    }
    if (actor.type === "human_member" && !["human_direct", "member_connector"].includes(mode))
      throw new HttpError(400, "人类执行方式无效");
    const [connector] = actor.type === "human_member" && mode === "member_connector" ? await query(conn, `SELECT c.id FROM connectors c
      JOIN connector_projects cp ON cp.connector_id=c.id AND cp.project_id=?
      WHERE c.user_id=? AND c.revoked_at IS NULL ORDER BY c.last_seen_at DESC LIMIT 1`, [task.project_id, actor.id]) : [];
    if (actor.type === "human_member" && mode === "member_connector" && !connector) {
      // 区分「没有本地执行器 / 本地执行器离线 / 在线但未绑定当前项目」，提示成员该去做什么。
      const [state] = await query(conn, `SELECT COUNT(*) total,
        SUM(c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND)) online
        FROM connectors c WHERE c.user_id=? AND c.revoked_at IS NULL`, [actor.id]);
      if (!Number(state?.total)) throw new HttpError(409, "你还没有已授权的本地执行器：请先运行本地执行器并在网页完成授权，或改为「由我直接完成」");
      if (!Number(state?.online)) throw new HttpError(409, "本地执行器当前离线：请确认本地执行器正在运行并已登录，或改为「由我直接完成」");
      throw new HttpError(409, "本地执行器在线，但尚未绑定当前项目：请在本地执行器的项目列表中为该项目选择 Git 根目录并绑定，再重新接受任务");
    }
    const executionType = actor.type === "human_member" ? (mode === "member_connector" ? "human_connector" : "human_self") : "dsh_l3";
    const nextStatus = executionType === "human_self" ? "running" : executionType === "human_connector" ? "pending_start" : "running";
    const runStatus = executionType === "human_self" ? "running" : "queued";
    await query(conn, `UPDATE agent_tasks SET status=?,claimed_by_type=?,claimed_by_id=?,accepted_by_type=?,accepted_by_id=?,accepted_at=UTC_TIMESTAMP(3),
      execution_mode=?,execution_agent_type=?,execution_agent_id=? WHERE id=?`,
    [nextStatus, actor.type, actor.id, actor.type, actor.id, mode, executionType, executionType === "human_connector" ? connector.id : actor.id, taskId]);
    await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,executor_id,executor_member_id,connector_id,status,started_at)
      SELECT UUID(),id,revision,?,?,?,?,?,IF(?='running',UTC_TIMESTAMP(3),NULL) FROM agent_tasks WHERE id=?`,
    [executionType, executionType === "human_connector" ? connector.id : actor.id,
      executionType === "human_connector" ? actor.id : null,
      executionType === "human_connector" ? connector.id : null, runStatus, runStatus, taskId]);
    if (executionType === "human_connector") {
      const [existingAdapter] = await query(conn, "SELECT id FROM connector_tasks WHERE agent_task_id=? FOR UPDATE", [taskId]);
      if (!existingAdapter) {
        const [binding] = await query(conn, `SELECT cp.policy,cp.allow_git_push FROM connector_projects cp
          WHERE cp.connector_id=? AND cp.project_id=?`, [connector.id, task.project_id]);
        if (!binding) throw new HttpError(409, "本地执行器未关联当前项目");
        const instructionRefs = await documentsForTaskInstruction(conn, task.project_id, task.document_refs, task.folder_refs);
        await query(conn, `INSERT INTO connector_tasks
          (id,agent_task_id,connector_id,project_id,thread_id,message_id,requested_by,assigned_to,member_id_snapshot,instruction,policy,allow_git_push,status,progress)
          VALUES(UUID(),?,?,?,?,?,?,?,?,?,?,?, 'queued','等待本地执行器领取')`, [taskId, connector.id, task.project_id,
          task.origin_thread_id, task.source_message_id, task.source_user_id || actor.id, actor.id, actor.id,
          composeTaskInstruction(task, instructionRefs.documents, instructionRefs.folders), binding.policy, binding.allow_git_push]);
      }
    }
    await recordTaskStatusChange(conn, taskId, task.status, actor,
      executionType === "human_connector" ? "成员接受任务，交给本地执行器执行" : executionType === "human_self" ? "成员接受任务，由本人完成" : "接受任务");
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
    if (TASK_ENDED.includes(task.status)) throw new HttpError(409, "任务已经结束");
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
    await query(conn, "UPDATE agent_tasks SET status='rejected',progress=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?", [reason || "目标成员拒绝任务", taskId]);
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

export async function cancelTask(db, taskId, actor, reason) {
  const result = await transaction(db, async (conn) => {
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    if (task.status !== "awaiting_acceptance") throw new HttpError(409, "只有待确认任务可以由来源人取消");
    const source = actor.type === "human_member" && (task.source_user_id === actor.id
      || (task.created_by_type === "human_member" && task.created_by_id === actor.id));
    if (!source) throw new HttpError(403, "只有任务来源人可以取消待确认任务");
    await query(conn, "UPDATE agent_tasks SET status='cancelled',progress=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
      [reason || "任务来源人取消任务", taskId]);
    await recordTaskStatusChange(conn, taskId, task.status, actor, reason || "任务来源人取消任务");
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
  if (!review.rejected || review.task.status !== "rejected") throw new HttpError(409, "任务没有待处理的拒绝结果");
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
    const nextStatus = review.task.target_type === "human_member" ? "awaiting_acceptance"
      : await idleL3Count(conn, review.task.target_id) >= 1 ? "running" : "pending_assignment";
    await query(conn, `UPDATE agent_tasks SET title=COALESCE(?,title),goal=COALESCE(?,goal),constraints=IF(?,?,constraints),
      status=?,claimed_by_type=IF(target_type='l2_session','l2_session',NULL),
      claimed_by_id=IF(target_type='l2_session',target_id,NULL),accepted_by_type=NULL,accepted_by_id=NULL,accepted_at=NULL,
      execution_mode=NULL,execution_agent_type=NULL,execution_agent_id=NULL,progress=NULL,result_summary=NULL,artifact_refs=NULL,
      finished_at=NULL,revision=revision+1 WHERE id=?`, [update.title || null, update.goal || null,
      update.constraints !== undefined, update.constraints ?? null, nextStatus, taskId]);
    await query(conn, `UPDATE agent_task_execution_runs SET status='cancelled',error='任务被拒绝后重新发起',
      finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`, [taskId]);
    if (nextStatus === "running" && review.task.target_type === "l2_session") {
      await query(conn, `UPDATE agent_tasks SET execution_mode='dsh_l3',execution_agent_type='dsh_l3' WHERE id=?`, [taskId]);
      await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
        SELECT UUID(),id,revision,'dsh_l3','queued' FROM agent_tasks WHERE id=?`, [taskId]);
    }
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

const arrangeableStatuses = new Set(["draft", "pending_assignment", "awaiting_acceptance", "pending_start", "assigned", "queued", "running", "waiting", "blocked", "failed", "cancelled", "rejected", "abandoned", "completed"]);

export async function recoverAbnormalTask(db, taskId, actor, update = {}) {
  const action = update.action === "cancel" ? "cancel" : "restart";
  const result = await transaction(db, async (conn) => {
    const [task] = await query(conn, "SELECT * FROM agent_tasks WHERE id=? FOR UPDATE", [taskId]);
    if (!task) throw new HttpError(404, "任务不存在");
    await assertL2CanOperateTask(conn, actor, task);
    if (task.status === "superseded" || !arrangeableStatuses.has(task.status))
      throw new HttpError(409, "当前任务不能再安排");
    if (action === "cancel" && ["cancelled", "completed", "rejected", "abandoned"].includes(task.status))
      throw new HttpError(409, "已结束任务不能取消");
    const interruptedAgentId = task.execution_agent_id || null;
    const reason = update.reason || (action === "cancel" ? "L2 取消任务" : "L2 重新安排任务");
    const dispatchL3 = task.target_type === "l2_session" || task.execution_agent_type === "dsh_l3" || task.task_type === "assist_l2";
    const environmentChanged = update.environmentChanged === true;
    if (action === "restart" && task.status === "blocked" && !environmentChanged) {
      throw new HttpError(409, task.resume_condition || "任务已阻塞；请先改变外部条件并明确标记 environmentChanged=true");
    }
    if (action === "restart" && task.status === "failed"
      && task.failure_class === "platform_blocked" && task.failure_signature
      && Number(task.failure_environment_revision || 0) === Number(task.environment_revision || 0)
      && !environmentChanged) {
      await query(conn, `UPDATE agent_tasks SET status='blocked',blocked_reason=?,resume_condition=?
        WHERE id=?`, [task.failure_signature, "外部条件恢复或人工确认后再重试", taskId]);
      await recordTaskStatusChange(conn, taskId, task.status, actor,
        `检测到相同平台错误，停止换执行者并阻塞：${task.failure_signature}`);
      return withL3DispatchGate(await getTask(conn, taskId), { action: "blocked", interruptedAgentId });
    }
    if (action === "restart" && Number(task.retry_count || 0) >= Number(task.max_retry_count || MAX_TASK_RETRIES)) {
      await query(conn, `UPDATE agent_tasks SET status='blocked',blocked_reason=?,resume_condition=?
        WHERE id=?`, ["已达到任务自动重试预算", "人工调整任务或明确增加重试预算后再重试", taskId]);
      await recordTaskStatusChange(conn, taskId, task.status, actor, "达到任务自动重试预算，停止自动调度");
      return withL3DispatchGate(await getTask(conn, taskId), { action: "blocked", interruptedAgentId });
    }
    await query(conn, `UPDATE agent_task_questions SET status='cancelled' WHERE task_id=? AND status='open'`, [taskId]);
    await query(conn, `UPDATE agent_task_execution_runs SET status='cancelled',error=?,
      finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','running','waiting')`,
    [action === "cancel" ? "任务被 L2 取消" : "任务由 L2 重新安排", taskId]);
    if (action === "cancel") {
      await query(conn, `UPDATE agent_tasks SET status='cancelled',progress=?,result_summary=COALESCE(?,result_summary),
        execution_agent_id=NULL,finished_at=UTC_TIMESTAMP(3),revision=revision+1 WHERE id=?`,
      [reason, update.resultSummary || reason, taskId]);
    } else if (dispatchL3) {
      await adoptCurrentIterationL2(conn, task, actor.id);
      const idle = await idleL3Count(conn, actor.id);
      if (task.task_type === "assist_l2" && idle < 1)
        throw new HttpError(409, "当前没有空闲 L3，不能重新安排辅助任务");
      const nextStatus = idle >= 1 ? "running" : "pending_assignment";
      await query(conn, `UPDATE agent_tasks SET title=COALESCE(?,title),goal=COALESCE(?,goal),constraints=IF(?,?,constraints),
        status=?,progress=?,result_summary=NULL,
        execution_mode=COALESCE(execution_mode,'dsh_l3'),execution_agent_type=COALESCE(execution_agent_type,'dsh_l3'),
        execution_agent_id=NULL,preferred_executor_id=COALESCE(preferred_executor_id,?),
        environment_revision=environment_revision+IF(?,1,0),finished_at=NULL,revision=revision+1 WHERE id=?`,
      [update.title || null, update.goal || null, update.constraints !== undefined, update.constraints ?? null,
        nextStatus, nextStatus === "running" ? "已指派，尚未绑定 L3" : "待指派空闲 L3",
        task.execution_agent_id || null, environmentChanged, taskId]);
      if (nextStatus === "running") {
        await query(conn, `INSERT INTO agent_task_execution_runs(id,task_id,task_revision,executor_type,status)
          SELECT UUID(),id,revision,'dsh_l3','queued' FROM agent_tasks WHERE id=?`, [taskId]);
      }
    } else {
      await query(conn, `UPDATE agent_tasks SET title=COALESCE(?,title),goal=COALESCE(?,goal),constraints=IF(?,?,constraints),
        status='awaiting_acceptance',progress='L2 已重新安排，等待目标成员确认',result_summary=NULL,
        claimed_by_type=NULL,claimed_by_id=NULL,accepted_by_type=NULL,accepted_by_id=NULL,accepted_at=NULL,
        execution_mode=NULL,execution_agent_type=NULL,execution_agent_id=NULL,finished_at=NULL,revision=revision+1 WHERE id=?`,
      [update.title || null, update.goal || null, update.constraints !== undefined, update.constraints ?? null, taskId]);
    }
    await recordTaskStatusChange(conn, taskId, task.status, actor, reason);
    return withL3DispatchGate(await getTask(conn, taskId), {
      action,
      interruptedAgentId,
      recovery: interruptedAgentId
        ? { strategy: "resume_same_executor_first", executorId: interruptedAgentId,
            fallback: "replace_only_after_resume_failure" }
        : { strategy: "dispatch_new_executor" },
    });
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
  if (task.status === "blocked") suggestedNext = "wait_for_condition";
  else if (task.status === "failed" || run?.status === "failed") suggestedNext = task.failure_class === "platform_blocked" ? "block_or_wait" : "retry_same_or_replace";
  else if (!run || ["queued", "cancelled", "interrupted"].includes(run.status) || task.status === "pending_assignment") suggestedNext = "dispatch";
  else if (stale) suggestedNext = "ask_or_replace";
  else if (live) suggestedNext = "ask";
  return {
    task: {
      id: task.id, title: task.title, status: task.status, progress: task.progress,
      result_summary: task.result_summary, target_type: task.target_type, target_id: task.target_id,
      execution_agent_id: task.execution_agent_id, preferred_executor_id: task.preferred_executor_id,
      retry_count: Number(task.retry_count || 0), max_retry_count: Number(task.max_retry_count || MAX_TASK_RETRIES),
      executor_switch_count: Number(task.executor_switch_count || 0), failure_class: task.failure_class,
      failure_signature: task.failure_signature, blocked_reason: task.blocked_reason,
      resume_condition: task.resume_condition, document_refs: parseDocumentRefs(task.document_refs),
      folder_refs: parseDocumentRefs(task.folder_refs),
    },
    run: run || null,
    live,
    stale,
    lastEvents: events.reverse(),
    suggestedNext,
    askVia: live && run.executor_id ? { tool: "send_message", agentId: run.executor_id } : null,
    replaceVia: run?.executor_id ? { interruptAgentId: run.executor_id, recover: "restart" } : { recover: "restart" },
    retryPolicy: {
      sameExecutorAttempts: MAX_EXECUTOR_ATTEMPTS,
      maxTaskRetries: Number(task.max_retry_count || MAX_TASK_RETRIES),
      maxDistinctExecutors: MAX_DISTINCT_EXECUTORS,
      failureClass: task.failure_class || null,
      failureSignature: task.failure_signature || null,
    },
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
  return query(db, `SELECT e.*,COALESCE(member_user.name,connector_user.name) actor_name
    FROM agent_task_assignment_events e
    LEFT JOIN users member_user ON e.changed_by_type='human_member' AND member_user.id=e.changed_by_id
    LEFT JOIN connectors connector ON e.changed_by_type='connector' AND connector.id=e.changed_by_id
    LEFT JOIN users connector_user ON connector_user.id=connector.user_id
    WHERE e.task_id=? ORDER BY e.id`, [taskId]);
}

export async function listTaskExecutionRuns(db, taskId) {
  const rows = await query(db, `SELECT r.*,owner.name executor_owner_name,member.name executor_member_name
    FROM agent_task_execution_runs r
    LEFT JOIN connectors connector ON r.executor_type='human_connector' AND connector.id=r.executor_id
    LEFT JOIN users owner ON owner.id=COALESCE(r.executor_member_id,connector.user_id)
    LEFT JOIN users member ON member.id=r.executor_member_id
    WHERE r.task_id=? ORDER BY r.created_at DESC`, [taskId]);
  const [task] = await query(db, "SELECT origin_thread_id FROM agent_tasks WHERE id=?", [taskId]);
  const ids = await stickyL3ExecutorIds(db, task?.origin_thread_id);
  return rows.map((row) => ({ ...row,
    executor_label: row.executor_label || (row.executor_type === "dsh_l3" && row.executor_id
      ? stickyL3Label(row.executor_id, ids) : null),
  }));
}

export async function listTaskUpdates(db, taskId) {
  return query(db, "SELECT * FROM agent_task_pool_updates WHERE task_id=? ORDER BY created_at", [taskId]);
}

export function mergeTaskActivity({ updates = [], statusHistory = [], executionRuns = [] } = {}) {
  return [
    ...updates.map((item) => ({ ...item, kind: "member_update", at: item.created_at })),
    ...statusHistory.map((item) => ({ ...item, kind: "status_change", at: item.created_at })),
    ...executionRuns.map((item) => ({ ...item, kind: "l3_execution", at: item.created_at })),
  ].sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));
}

function assistantText(blocks = []) {
  return blocks.filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text).join("\n").trim();
}

export async function bindDshL3Execution(db, l2SessionId, childSessionId, taskId) {
  return transaction(db, async (conn) => {
    const [session] = await query(conn, "SELECT session_id FROM agent_sessions WHERE session_id=? FOR UPDATE", [l2SessionId]);
    if (!session) throw new HttpError(404, "L2 session 不存在");
    // subagent.started and tool/result both call bind; the second pass must not look like failure.
    const [already] = await query(conn, `SELECT t.* FROM agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      WHERE r.executor_type='dsh_l3' AND r.executor_id=? AND r.status IN ('running','waiting')
      ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE`, [childSessionId]);
    if (already) {
      if (taskId && already.id !== taskId) throw new HttpError(409, "该 L3 已绑定其他任务");
      return getTask(conn, already.id);
    }
    const [capacity] = await query(conn, `SELECT COUNT(*) active FROM agent_task_execution_runs r
      JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.target_type='l2_session' AND t.target_id=? AND r.executor_type='dsh_l3'
        AND r.status IN ('running','waiting')`, [l2SessionId]);
    if (Number(capacity.active) >= 7) throw new HttpError(409, "当前 L2 已有 7 个运行中的 DSH L3");
    if (taskId) {
      const [task] = await query(conn, `SELECT * FROM agent_tasks WHERE id=? AND target_type='l2_session'
        AND task_type IN ('assist_l2','formal') FOR UPDATE`, [taskId]);
      if (!task) throw new HttpError(404, "当前 L2 没有这个可委派任务");
      await adoptCurrentIterationL2(conn, task, l2SessionId);
      if (!["pending_assignment", "queued", "running"].includes(task.status))
        throw new HttpError(409, "任务当前不可启动 DSH L3");
      if (task.status === "pending_assignment" || task.task_type === "formal") {
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
    const known = await stickyL3ExecutorIds(conn, run.origin_thread_id);
    if (childSessionId && !known.includes(childSessionId)) known.push(childSessionId);
    const executorLabel = stickyL3Label(childSessionId, known);
    await query(conn, `UPDATE agent_task_execution_runs SET executor_id=?,status='running',
      executor_label=?,started_at=COALESCE(started_at,UTC_TIMESTAMP(3)),heartbeat_at=UTC_TIMESTAMP(3) WHERE id=?`, [childSessionId, executorLabel, run.run_id]);
    await query(conn, `UPDATE agent_tasks SET status='running',execution_mode='dsh_l3',
      execution_agent_type='dsh_l3',execution_agent_id=?,
      executor_switch_count=executor_switch_count+IF(preferred_executor_id IS NOT NULL AND preferred_executor_id<>?,1,0),
      preferred_executor_id=NULL,progress=IF(preferred_executor_id IS NULL,'DSH L3 正在执行','DSH L3 正在执行（原执行者不可恢复，已接续）') WHERE id=?`,
    [childSessionId, childSessionId, run.id]);
    const l3Actor = { type: "dsh_l3", id: childSessionId };
    await recordTaskStatusChange(conn, run.id, run.status, l3Actor, "任务级 Agent 开始执行");
    if (run.source_task_id) {
      const [sourceBefore] = await query(conn, "SELECT status FROM agent_tasks WHERE id=?", [run.source_task_id]);
      await query(conn, `UPDATE agent_tasks SET execution_mode='dsh_l3',
        execution_agent_type='dsh_l3',execution_agent_id=?,status=IF(status IN ('queued','pending_assignment'),'running',status),revision=revision+1
        WHERE id=? AND status NOT IN ('completed','failed','cancelled','rejected','abandoned','superseded')`, [childSessionId, run.source_task_id]);
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
    const toolError = await latestToolFailure(conn, childSessionId);
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
      runStatus = ["completed", "failed"].includes(run.run_status) ? run.run_status
        : taskStatus === "failed" ? "failed" : "completed";
    } else if (reportedStatus) {
      taskStatus = reportedStatus === "blocked" ? "blocked" : reportedStatus;
      runStatus = taskStatus === "blocked" ? "completed" : taskStatus;
    } else if (notification.stopReason === "aborted") {
      taskStatus = "pending_assignment";
      runStatus = "interrupted";
      error = "DSH L3 aborted";
      summary = output || summary;
    } else {
      taskStatus = "failed";
      runStatus = "failed";
      error = stoppedCleanly ? "未回报结果" : `DSH L3 ${notification.stopReason || "error"}`;
      summary = output || summary || "未回报结果";
    }
    if (taskStatus === "failed" || taskStatus === "blocked") {
      failureClass = classifyTaskFailure({ status: taskStatus, error, summary, stopReason: notification.stopReason, toolError });
      signature = failureSignature(failureText({ error, summary, toolError, stopReason: notification.stopReason }));
      const stats = await taskRetryStats(conn, run.id, signature, childSessionId);
      const repeatedPlatformFailure = failureClass === "platform_blocked"
        && run.failure_signature === signature
        && Number(run.failure_environment_revision || 0) === Number(run.environment_revision || 0);
      const exhausted = Number(run.retry_count || 0) + 1 >= Number(run.max_retry_count || MAX_TASK_RETRIES)
        || stats.executorAttempts >= MAX_EXECUTOR_ATTEMPTS
        || stats.distinctExecutors >= MAX_DISTINCT_EXECUTORS;
      if (taskStatus === "failed" && (repeatedPlatformFailure || exhausted)) {
        taskStatus = "blocked";
        runStatus = "completed";
        error = repeatedPlatformFailure
          ? `同一平台错误重复出现：${signature}`
          : "任务达到自动重试预算，等待人工处理";
      }
    }
    if (["running", "waiting"].includes(run.run_status)) {
      await query(conn, `UPDATE agent_task_execution_runs SET status=?,result_summary=?,error=?,failure_class=?,failure_signature=?,
        heartbeat_at=UTC_TIMESTAMP(3),finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
      [runStatus, summary, error, failureClass, signature, run.run_id]);
    }
    if (!taskAlreadyEnded) {
      await query(conn, `UPDATE agent_tasks SET status=?,progress=?,result_summary=COALESCE(?,result_summary),
        retry_count=retry_count+IF(? IN ('failed','blocked'),1,0),failure_class=?,failure_signature=?,
        failure_environment_revision=IF(? IN ('failed','blocked'),environment_revision,NULL),
        blocked_reason=IF(?='blocked',COALESCE(?,failure_signature),NULL),
        resume_condition=IF(?='blocked',COALESCE(resume_condition,'外部条件恢复或人工确认后再重试'),NULL),
        execution_agent_id=?,finished_at=IF(? IN ('completed','failed','cancelled','rejected','abandoned'),UTC_TIMESTAMP(3),NULL),revision=revision+1 WHERE id=?`,
      [taskStatus, taskStatus === "completed" ? "DSH L3 已交活"
        : taskStatus === "blocked" ? (run.progress || "DSH L3 已阻塞")
        : error || "DSH L3 已返回",
        summary, taskStatus, failureClass, signature, taskStatus, taskStatus, error, taskStatus, childSessionId, taskStatus, run.id]);
      await recordTaskStatusChange(conn, run.id, run.status, { type: "dsh_l3", id: childSessionId },
        taskStatus === "completed" ? "任务级 Agent 已交活"
          : taskStatus === "blocked" ? "任务级 Agent 阻塞暂停"
          : runStatus === "interrupted" ? "任务级 Agent 被中止，重新排队"
          : `任务级 Agent 失败：${error}`);
    }
    if (run.source_task_id && !taskAlreadyEnded) {
      await query(conn, `INSERT INTO agent_task_pool_updates(id,task_id,source_type,source_id,body,revision)
        SELECT UUID(),?,'l2_session',?,CONCAT('辅助任务「',?, '」',?,IF(?='', '', CONCAT('\n',?))),revision
        FROM agent_tasks WHERE id=?`, [run.source_task_id, l2SessionId, run.title,
        taskStatus === "completed" ? "已完成。" : taskStatus === "blocked" ? "阻塞暂停。" : "未完成。", summary, summary, run.source_task_id]);
      await query(conn, `UPDATE agent_tasks SET progress=?,revision=revision+1 WHERE id=?
        AND status NOT IN ('completed','failed','cancelled','rejected','abandoned','superseded')`,
      [taskStatus === "completed" ? "辅助 L3 已返回结果，等待 L2 汇总"
        : taskStatus === "blocked" ? "辅助 L3 阻塞暂停，等待处理"
        : "辅助 L3 执行失败，等待 L2 处理", run.source_task_id]);
    }
    return { ...await getTask(conn, run.id), run_id: run.run_id };
  });
  if (result?.origin_thread_id) {
    const dispatch = result.target_type === "l2_session"
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
        failureReason: result.status === "completed" ? null : (result.progress || result.result_summary || "未回报结果"),
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

function closeEndedTaskRuns(conn, taskId, taskStatus) {
  const endedRunStatus = taskStatus === "completed" || taskStatus === "blocked" ? "completed"
    : taskStatus === "failed" ? "failed"
    : taskStatus === "abandoned" ? "cancelled" : "cancelled";
  return query(conn, `UPDATE agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    SET r.error=IF(r.executor_type='dsh_l3' AND r.status='queued',COALESCE(r.error,'任务已结束，L3 未启动'),r.error),
        r.status=IF(r.executor_type='dsh_l3' AND r.status='queued','cancelled',IF(r.executor_type='dsh_l3' AND ?='cancelled','interrupted',?)),
        r.progress=COALESCE(r.progress,t.progress),
        r.result_summary=COALESCE(r.result_summary,t.result_summary),
        r.started_at=IF(r.started_at IS NOT NULL OR (r.executor_type='dsh_l3' AND r.status='queued'),r.started_at,UTC_TIMESTAMP(3)),
        r.finished_at=COALESCE(r.finished_at,UTC_TIMESTAMP(3))
    WHERE r.task_id=? AND r.status IN ('queued','running','waiting')`, [endedRunStatus, endedRunStatus, taskId]);
}

export async function repairMisclosedHumanExecutionRuns(conn) {
  const completed = await query(conn, `UPDATE agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    SET r.status=IF(t.status='failed','failed','completed'), r.error=NULL,
        r.progress=COALESCE(r.progress,t.progress),
        r.result_summary=COALESCE(r.result_summary,t.result_summary),
        r.finished_at=COALESCE(r.finished_at,t.finished_at,UTC_TIMESTAMP(3))
    WHERE r.executor_type IN ('human_self','human_connector') AND r.status='cancelled'
      AND r.error='任务已结束，L3 未启动' AND t.status IN ('completed','failed')`);
  const cancelled = await query(conn, `UPDATE agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    SET r.error=NULL
    WHERE r.executor_type IN ('human_self','human_connector')
      AND r.error='任务已结束，L3 未启动' AND t.status IN ('cancelled','rejected','abandoned','superseded')`);
  return (completed.affectedRows || 0) + (cancelled.affectedRows || 0);
}

export async function reconcileEndedTaskRuns(db) {
  const rows = await query(db, `SELECT r.id,t.id task_id,t.status FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE r.status IN ('queued','running','waiting') AND t.status IN ('completed','failed','cancelled','rejected','abandoned','superseded')`);
  const misclosed = await query(db, `SELECT r.id FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE r.executor_type IN ('human_self','human_connector')
      AND r.error='任务已结束，L3 未启动'
      AND ((r.status='cancelled' AND t.status IN ('completed','failed'))
        OR t.status IN ('cancelled','rejected','abandoned','superseded'))`);
  if (!rows.length && !misclosed.length) return 0;
  await transaction(db, async (conn) => {
    for (const row of [...new Map(rows.map((item) => [item.task_id, item])).values()])
      await closeEndedTaskRuns(conn, row.task_id, row.status);
    if (misclosed.length) await repairMisclosedHumanExecutionRuns(conn);
  });
  return rows.length + misclosed.length;
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
      SELECT t.id,t.status,'pending_assignment','system','服务重启，任务级 Agent 中断，等待 L2 重新指派' FROM agent_tasks t
      WHERE t.task_type IN ('assist_l2','formal') AND t.status='running'
        AND EXISTS (SELECT 1 FROM agent_task_execution_runs r WHERE r.task_id=t.id AND r.status='interrupted')`);
    await query(conn, `UPDATE agent_tasks t SET t.status='pending_assignment',t.execution_agent_id=IF(t.task_type='assist_l2',NULL,t.execution_agent_id),
      t.progress='服务重启，等待 L2 重新指派',t.finished_at=NULL,t.revision=t.revision+1
      WHERE t.task_type IN ('assist_l2','formal') AND t.status='running'
        AND EXISTS (SELECT 1 FROM agent_task_execution_runs r WHERE r.task_id=t.id AND r.status='interrupted')`);
    await query(conn, `UPDATE agent_tasks t JOIN agent_sessions s ON s.thread_id=t.origin_thread_id
      SET t.target_id=s.session_id,t.claimed_by_type='l2_session',t.claimed_by_id=s.session_id
      WHERE t.target_type='l2_session' AND t.task_type IN ('assist_l2','formal') AND t.status='pending_assignment'
        AND t.origin_thread_id IS NOT NULL AND t.target_id<>s.session_id
        AND EXISTS (SELECT 1 FROM agent_task_execution_runs r WHERE r.task_id=t.id AND r.status='interrupted')`);
  });
  await enqueueInterruptedL3Recovery(db, runs, "服务重启，任务级 Agent 中断，等待 L2 重新评估");
  return runs.length;
}

/**
 * Recover L3 runs that look alive in DB but stopped heartbeating (zombie after tool
 * completion / hung model / dead harness). Does not touch fresh runs.
 */
export async function recoverStaleDshL3Executions(db, { staleAfterSeconds = L3_STALE_HEARTBEAT_SECONDS } = {}) {
  const age = Math.max(180, Number(staleAfterSeconds) || L3_STALE_HEARTBEAT_SECONDS);
  const runs = await query(db, `SELECT r.id,r.task_id,t.origin_thread_id,t.source_message_id,t.source_user_id,t.title
    FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE r.executor_type='dsh_l3' AND r.status IN ('running','waiting')
      AND t.status='running'
      AND TIMESTAMPDIFF(SECOND, COALESCE(r.heartbeat_at, r.started_at, r.created_at), UTC_TIMESTAMP(3)) >= ?`,
  [age]);
  if (!runs.length) return 0;
  const ids = runs.map((row) => row.id);
  const taskIds = [...new Set(runs.map((row) => row.task_id))];
  const idPlaceholders = ids.map(() => "?").join(",");
  const taskPlaceholders = taskIds.map(() => "?").join(",");
  const reason = `L3 心跳超时（≥${age}s），等待 L2 重新评估`;
  const progress = "心跳超时，等待 L2 重新指派";
  await transaction(db, async (conn) => {
    await query(conn, `UPDATE agent_task_execution_runs SET status='interrupted',error=?,
      finished_at=UTC_TIMESTAMP(3) WHERE id IN (${idPlaceholders}) AND status IN ('running','waiting')`,
    [reason, ...ids]);
    await query(conn, `INSERT INTO agent_task_status_events(task_id,from_status,to_status,actor_type,reason)
      SELECT t.id,t.status,'pending_assignment','system',? FROM agent_tasks t
      WHERE t.id IN (${taskPlaceholders}) AND t.status='running'`, [progress, ...taskIds]);
    await query(conn, `UPDATE agent_tasks t SET t.status='pending_assignment',
      t.execution_agent_id=IF(t.task_type='assist_l2',NULL,t.execution_agent_id),
      t.progress=?,t.finished_at=NULL,t.revision=t.revision+1
      WHERE t.id IN (${taskPlaceholders}) AND t.status='running'`, [progress, ...taskIds]);
    await query(conn, `UPDATE agent_tasks t JOIN agent_sessions s ON s.thread_id=t.origin_thread_id
      SET t.target_id=s.session_id,t.claimed_by_type='l2_session',t.claimed_by_id=s.session_id
      WHERE t.id IN (${taskPlaceholders}) AND t.target_type='l2_session' AND t.status='pending_assignment'
        AND t.origin_thread_id IS NOT NULL AND t.target_id<>s.session_id`, taskIds);
  });
  await enqueueInterruptedL3Recovery(db, runs, reason);
  return runs.length;
}
