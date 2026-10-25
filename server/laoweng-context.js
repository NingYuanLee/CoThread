import { query, transaction } from "./db.js";
import { acquireNamedLock } from "./named-lock.js";
import { HttpError } from "./service.js";
import { publishWork } from "./work-events.js";
import { contextUsage } from "../shared/context.js";
import { LAOWENG_MAINTENANCE_TASKS, normalizeLaowengTask } from "../shared/agent-label.js";
import { nativeHistoryFromCheckpoint, nativeHistoryFromLiveHome } from "./child-agent-session.js";

export async function readLaowengTaskSession(service, user, projectId, task) {
  const scopedTask = normalizeLaowengTask(task);
  if (!LAOWENG_MAINTENANCE_TASKS.includes(scopedTask)) throw new HttpError(400, "请指定维护任务");
  await service.project(user, projectId);
  const [row] = await query(
    service.db,
    `SELECT status,last_error,checkpoint,context_stats,compact_status,compact_error,compact_result
     FROM agent_project_sessions WHERE project_id=? AND task=? AND scope_id=?`,
    [projectId, scopedTask, projectId],
  );
  let messages = nativeHistoryFromCheckpoint(row?.checkpoint);
  if (!messages.length)
    messages = await nativeHistoryFromLiveHome(`laoweng-${scopedTask}-${projectId}`);
  const events = await query(
    service.db,
    `SELECT e.id,e.phase tool,e.status,e.created_at,e.finished_at,a.id visual_artifact_id
    FROM agent_project_events e LEFT JOIN agent_visual_artifacts a ON a.agent_project_event_id=e.id
    WHERE e.project_id=? AND e.task=? ORDER BY e.id LIMIT 300`,
    [projectId, scopedTask],
  );
  return {
    task: scopedTask,
    status: row?.status || "idle",
    progress: null,
    running: row?.status === "running",
    error: row?.last_error || null,
    contextUsage: contextUsage(row || null, [], []),
    messages,
    events: events.map((event) => ({
      id: String(event.id),
      tool: event.tool,
      status: event.status,
      created_at: event.created_at,
      finished_at: event.finished_at,
      screenshotUrl: event.visual_artifact_id
        ? `/api/agent-visual-artifacts/${event.visual_artifact_id}`
        : null,
    })),
    pending: [],
  };
}

export async function queueLaowengContextCompression(service, user, projectId, task) {
  if (user.kind !== "session") throw new HttpError(403, "需要登录后操作");
  const scopedTask = normalizeLaowengTask(task);
  if (!LAOWENG_MAINTENANCE_TASKS.includes(scopedTask)) throw new HttpError(400, "请指定维护任务");
  await service.project(user, projectId);
  const result = await transaction(service.db, async (db) => {
    const [session] = await query(
      db,
      `SELECT id,compact_status FROM agent_project_sessions
       WHERE project_id=? AND task=? AND scope_id=? FOR UPDATE`,
      [projectId, scopedTask, projectId],
    );
    if (!session) throw new HttpError(404, "该维护 Agent 还没有上下文");
    if (["queued", "running"].includes(session.compact_status))
      return { status: session.compact_status };
    await query(
      db,
      `UPDATE agent_project_sessions SET compact_status='queued',compact_requested_by=?,
      compact_error=NULL,compact_result=NULL WHERE id=?`,
      [user.id, session.id],
    );
    return { status: "queued" };
  });
  publishWork(service.db);
  return result;
}

export async function processNextLaowengContextCompression(db, options = {}) {
  const filters = ["compact_status='queued'"];
  const params = [];
  if (options.projectId) {
    filters.push("project_id=?");
    params.push(options.projectId);
  }
  if (options.task) {
    filters.push("task=?");
    params.push(normalizeLaowengTask(options.task));
  }
  const [candidate] = await query(
    db,
    `SELECT id,project_id,task FROM agent_project_sessions WHERE ${filters.join(" AND ")}
     ORDER BY updated_at LIMIT 1`,
    params,
  );
  if (!candidate) return false;
  const { compactLaowengSession, laowengSessionScope } = await import("./laoweng-agent.js");
  const scope = laowengSessionScope(candidate.task, { projectId: candidate.project_id });
  const lockName = `cothread-laoweng:${scope.task}:${scope.scopeId}`.slice(0, 64);
  const lock = await acquireNamedLock(db, lockName);
  if (!lock) return false;
  try {
    const job = await transaction(db, async (conn) => {
      const [next] = await query(
        conn,
        `SELECT id,project_id,task FROM agent_project_sessions WHERE id=? AND compact_status='queued'
         FOR UPDATE SKIP LOCKED`,
        [candidate.id],
      );
      if (!next) return null;
      await query(conn, "UPDATE agent_project_sessions SET compact_status='running' WHERE id=?", [
        next.id,
      ]);
      return next;
    });
    if (!job) return false;
    try {
      const result = await compactLaowengSession(db, job.project_id, job.task, {
        ...options.laowengOptions,
        sessionLockHeld: true,
      });
      await query(
        db,
        `UPDATE agent_project_sessions SET compact_status='completed',compact_result=?,
        compact_error=NULL WHERE id=?`,
        [JSON.stringify(result), job.id],
      );
    } catch (error) {
      await query(
        db,
        `UPDATE agent_project_sessions SET compact_status='failed',compact_error=? WHERE id=?`,
        [
          /timeout|timed out|abort|cancel/i.test(`${error.name} ${error.message}`)
            ? "上下文压缩超时，已停止。维护记录仍保留，可以重试。"
            : "上下文压缩未完成，任务已退出。维护记录仍保留，可以重试。",
          job.id,
        ],
      );
      console.error("老翁 context compression failed", { type: error.name });
    }
    return true;
  } finally {
    await lock.release();
  }
}
