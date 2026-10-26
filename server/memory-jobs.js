import { query } from "./db.js";
import { MEMORY_JOBS, MEMORY_JOB_KEYS } from "../shared/memory-jobs.js";
import { HttpError } from "./service.js";

/**
 * 管理空间用的记忆作业视图：默认口径 + 最近一次运行 + 待处理积压。
 * 口径不可按项目调整。只读，不触发任何作业。
 */
export async function listMemoryJobs(db, projectId) {
  const runs = await query(
    db,
    `SELECT id,task,thread_id threadId,trigger_source triggerSource,status,
       agent_called agentCalled,had_updates hadUpdates,item_count itemCount,error,
       created_at createdAt,started_at startedAt,finished_at finishedAt
     FROM agent_laoweng_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 300`,
    [projectId],
  );
  const lastByTask = new Map();
  for (const run of runs) if (!lastByTask.has(run.task)) lastByTask.set(run.task, run);
  // 管理面板用的运行历史：与监控页同形的 snake_case 行，供轨迹/历史弹窗直接复用。
  const TASKS_BY_JOB = {
    member_memory: ["member_memory"],
    document_memory: ["document_memory", "project_document_memory", "iteration_document_memory"],
    iteration_archive: ["iteration_archive", "thread_archive"],
    project_memory: ["project_memory"],
    task_memory: [],
    discussion_memory: [],
  };
  const toRunRow = (run) => ({
    id: run.id,
    task: run.task,
    thread_id: run.threadId || null,
    trigger_source: run.triggerSource,
    status: run.status,
    agent_called: Boolean(run.agentCalled),
    had_updates: Boolean(run.hadUpdates),
    item_count: run.itemCount,
    error: run.error,
    created_at: run.createdAt,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
  });

  const [memberQueue] = await query(
    db,
    "SELECT COUNT(*) count FROM agent_member_memory_queue WHERE project_id=?",
    [projectId],
  );
  const [projectQueue] = await query(
    db,
    "SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=?",
    [projectId],
  );
  const [documentQueue] = await query(
    db,
    `SELECT COUNT(*) count FROM agent_document_memory_queue q
     JOIN versions v ON v.id=q.version_id JOIN artifacts a ON a.id=v.artifact_id
     WHERE a.project_id=?`,
    [projectId],
  );
  const [archivedThread] = await query(
    db,
    `SELECT id,title FROM threads WHERE project_id=? AND status='archived'
     ORDER BY archived_at DESC, id DESC LIMIT 1`,
    [projectId],
  );
  const backlog = {
    member_memory: Number(memberQueue?.count || 0),
    document_memory: Number(documentQueue?.count || 0),
    project_memory: Number(projectQueue?.count || 0),
    task_memory: null,
    discussion_memory: null,
  };
  return MEMORY_JOBS.map((job) => ({
    ...job,
    backlog: backlog[job.key] ?? null,
    backlogNote: backlog[job.key] === null ? "随项目记忆结算触发，无独立队列" : "",
    lastRun: lastByTask.get(job.key) || null,
    recentRuns: runs
      .filter((run) => (TASKS_BY_JOB[job.key] || []).includes(run.task))
      .slice(0, 20)
      .map(toRunRow),
    archivedThread: job.key === "discussion_memory" ? archivedThread || null : null,
  }));
}

function rejectJobAdjustment(key) {
  if (!MEMORY_JOB_KEYS.includes(key)) throw new HttpError(400, "没有这个记忆作业");
  throw new HttpError(409, "记忆作业口径使用默认，不能调整");
}

/** 口径固定为默认，不再接受项目级覆盖。 */
export async function updateMemoryJobSettings(_db, _projectId, key) {
  rejectJobAdjustment(key);
}

/** 没有可回滚的项目级口径。 */
export async function resetMemoryJobSettings(_db, _projectId, key) {
  rejectJobAdjustment(key);
}
