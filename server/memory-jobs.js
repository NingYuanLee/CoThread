import { query } from "./db.js";
import { MEMORY_JOBS, MEMORY_JOB_KEYS } from "../shared/memory-jobs.js";
import { HttpError } from "./service.js";

export async function loadMemoryJobSetting(db, projectId, key) {
  const [row] = await query(
    db,
    `SELECT job_key jobKey,enabled,trigger_threshold triggerThreshold,prompt
     FROM memory_job_settings WHERE project_id=? AND job_key=?`,
    [projectId, key],
  );
  return row || null;
}

async function loadSettingRows(db, projectId) {
  const rows = await query(
    db,
    `SELECT job_key jobKey,enabled,trigger_threshold triggerThreshold,prompt,updated_at updatedAt
     FROM memory_job_settings WHERE project_id=?`,
    [projectId],
  );
  return new Map(rows.map((row) => [row.jobKey, row]));
}

function withSetting(job, setting) {
  const prompt = String(setting?.prompt || "").trim();
  return {
    ...job,
    enabled: setting ? Boolean(setting.enabled) : true,
    triggerThreshold: setting?.triggerThreshold ?? job.batch ?? null,
    prompt: prompt || job.prompt,
    promptOverridden: Boolean(prompt),
    settingsUpdatedAt: setting?.updatedAt || null,
  };
}

/**
 * 管理空间用的记忆作业视图：默认口径 + 项目级覆盖 + 最近一次运行 + 待处理积压。
 * 只读，不触发任何作业。
 */
export async function listMemoryJobs(db, projectId) {
  const settings = await loadSettingRows(db, projectId);
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
    ...withSetting(job, settings.get(job.key)),
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

function parseThreshold(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 1000)
    throw new HttpError(400, "触发阈值应为 0 到 1000 的整数");
  return number;
}

/** 改项目级口径：只允许该项目的写成员，字段缺省表示保持原值。 */
export async function updateMemoryJobSettings(db, projectId, key, patch = {}, userId = null) {
  if (!MEMORY_JOB_KEYS.includes(key)) throw new HttpError(400, "没有这个记忆作业");
  const [existing] = await query(
    db,
    "SELECT enabled,trigger_threshold triggerThreshold,prompt FROM memory_job_settings WHERE project_id=? AND job_key=?",
    [projectId, key],
  );
  const patchThreshold = parseThreshold(patch.triggerThreshold);
  const enabled =
    patch.enabled === undefined
      ? existing
        ? Boolean(existing.enabled)
        : true
      : Boolean(patch.enabled);
  const threshold =
    patch.triggerThreshold === undefined ? (existing?.triggerThreshold ?? null) : patchThreshold;
  let prompt = existing?.prompt ?? null;
  if (patch.prompt !== undefined) {
    const text = String(patch.prompt ?? "").trim();
    prompt = text ? text.slice(0, 2000) : null;
  }
  await query(
    db,
    `INSERT INTO memory_job_settings(project_id,job_key,enabled,trigger_threshold,prompt,updated_by)
     VALUES(?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),trigger_threshold=VALUES(trigger_threshold),
       prompt=VALUES(prompt),updated_by=VALUES(updated_by)`,
    [projectId, key, enabled, threshold, prompt, userId],
  );
  const jobs = await listMemoryJobs(db, projectId);
  return jobs.find((job) => job.key === key);
}

/** 回滚到默认口径。 */
export async function resetMemoryJobSettings(db, projectId, key) {
  if (!MEMORY_JOB_KEYS.includes(key)) throw new HttpError(400, "没有这个记忆作业");
  await query(db, "DELETE FROM memory_job_settings WHERE project_id=? AND job_key=?", [
    projectId,
    key,
  ]);
  const jobs = await listMemoryJobs(db, projectId);
  return jobs.find((job) => job.key === key);
}
