import { query } from "./db.js";
import { MEMORY_JOBS, MEMORY_JOB_KEYS } from "../shared/memory-jobs.js";
import { HttpError } from "./service.js";
import { readFileIndexJobs } from "./file-index-jobs.js";

const TASKS_BY_JOB = {
  member_memory: ["member_memory"],
  document_memory: ["document_memory", "project_document_memory", "iteration_document_memory"],
  iteration_archive: ["iteration_archive", "thread_archive"],
  project_memory: ["project_memory"],
  task_memory: [],
  discussion_memory: ["member_memory"],
};

export async function listMemoryJobHistory(db, projectId, key, options = {}) {
  if (!MEMORY_JOB_KEYS.includes(key)) throw new HttpError(400, "没有这个记忆作业");
  const positiveInt = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 1 ? Math.trunc(number) : fallback;
  };
  const pageSize = Math.min(100, positiveInt(options.pageSize, 10));
  const requestedPage = Math.min(1000000, positiveInt(options.page, 1));
  const keyword = typeof options.keyword === "string" ? options.keyword.trim().slice(0, 200) : "";
  const tasks = TASKS_BY_JOB[key] || [];
  if (!tasks.length) return { rows: [], total: 0, page: 1, pageSize };
  const trigger = typeof options.trigger === "string" ? options.trigger : "";
  if (trigger && !["user", "schedule"].includes(trigger))
    throw new HttpError(400, "无效的触发类型");
  const where = `project_id=? AND task IN (${tasks.map(() => "?").join(",")})${trigger ? " AND trigger_source=?" : ""}`;
  const search = keyword
    ? ` AND LOCATE(LOWER(?), LOWER(CONCAT_WS(' ',
    COALESCE(error, ''), CAST(COALESCE(finished_at, started_at, created_at) AS CHAR),
    CASE WHEN trigger_source='user' THEN '手动 手动运行' ELSE '自动 自动运行 定时' END,
    CASE status WHEN 'failed' THEN '失败' WHEN 'running' THEN '进行中 整理中'
      WHEN 'queued' THEN '排队中 已排队' ELSE '已完成' END,
    CASE WHEN status IN ('queued','running') THEN '' WHEN agent_called THEN '是' ELSE '否' END,
    CASE WHEN status IN ('queued','running') THEN '' WHEN had_updates THEN CONCAT('有 ', COALESCE(item_count, 0), ' 项') ELSE '暂无' END
  ))) > 0`
    : "";
  const params = [
    projectId,
    ...tasks,
    ...(trigger ? [trigger] : []),
    ...(keyword ? [keyword] : []),
  ];
  const [count] = await query(
    db,
    `SELECT COUNT(*) AS total FROM agent_laoweng_runs WHERE ${where}${search}`,
    params,
  );
  const total = Number(count.total);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const rows = await query(
    db,
    `SELECT id, task, thread_id, trigger_source, status, agent_called,
    had_updates, item_count, error, created_at, started_at, finished_at
    FROM agent_laoweng_runs WHERE ${where}${search}
    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  if (["member_memory", "discussion_memory"].includes(key) && rows.length) {
    const ids = rows.map((row) => row.id);
    const marks = ids.map(() => "?").join(",");
    const ranges = await query(
      db,
      `SELECT rw.run_id runId,w.first_sequence firstSequence,
      w.last_sequence lastSequence,t.title threadTitle FROM conversation_run_windows rw
      JOIN conversation_memory_windows w ON w.id=rw.window_id JOIN threads t ON t.id=w.thread_id
      WHERE rw.run_id IN (${marks})`,
      ids,
    );
    const items = await query(
      db,
      `SELECT run_id runId,candidate_id id,kind,status,payload,page_id pageId,error
      FROM conversation_run_items WHERE run_id IN (${marks}) ORDER BY candidate_id`,
      ids,
    );
    for (const row of rows) {
      row.conversationRange = ranges.find((range) => range.runId === row.id) || null;
      row.conversationItems = items
        .filter((item) => item.runId === row.id)
        .map((item) => {
          let payload = item.payload;
          if (typeof payload === "string") {
            try {
              payload = JSON.parse(payload);
            } catch {
              payload = {};
            }
          }
          return {
            id: item.id,
            kind: item.kind,
            status: item.status,
            title: payload?.title || payload?.question || "未命名结果",
            action: payload?.pageId ? "update" : "create",
            pageId: item.pageId,
            error: item.error,
          };
        });
    }
  }
  if (key === "document_memory" && rows.length) {
    const ids = rows.map((row) => row.id);
    const items = await query(
      db,
      `SELECT run_id runId,version_id versionId,artifact_id artifactId,
      title,filename,version_number version,operation,trigger_origin triggerOrigin,status,error
      FROM file_index_run_items WHERE run_id IN (${ids.map(() => "?").join(",")})
      ORDER BY title,version_id`,
      ids,
    );
    for (const row of rows) row.documentItems = items.filter((item) => item.runId === row.id);
  }
  if (key === "project_memory" && rows.length) {
    const ids = rows.map((row) => row.id);
    const phases = await query(
      db,
      `SELECT run_id runId,phase,result FROM project_memory_run_phases
      WHERE run_id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    for (const row of rows)
      row.projectPhases = phases
        .filter((phase) => phase.runId === row.id)
        .map((phase) => {
          let result = phase.result;
          if (typeof result === "string") {
            try {
              result = JSON.parse(result);
            } catch {
              result = {};
            }
          }
          return {
            phase: phase.phase,
            changes: result?.changes || [],
            statusUpdated: Boolean(result?.statusUpdated),
          };
        });
  }
  return { rows, total, page, pageSize };
}

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

  const [conversationQueue] = await query(
    db,
    "SELECT COUNT(*) count FROM conversation_memory_queue WHERE project_id=?",
    [projectId],
  );
  const [conversationPending] = await query(
    db,
    `SELECT
    SUM(statement_status<>'completed') statements,SUM(discussion_status<>'completed') discussions
    FROM conversation_memory_windows WHERE project_id=? AND invalidated_at IS NULL`,
    [projectId],
  );
  const windows = await query(
    db,
    `SELECT w.id,w.thread_id threadId,t.title threadTitle,
    w.first_sequence firstSequence,w.last_sequence lastSequence,w.statement_status statementStatus,
    (SELECT MAX(previous.last_sequence) FROM conversation_memory_windows previous
      WHERE previous.thread_id=w.thread_id AND previous.invalidated_at IS NULL
      AND previous.last_sequence<w.first_sequence AND previous.statement_status='completed'
      AND previous.discussion_status='completed') previousCompletedSequence,
    w.discussion_status discussionStatus,w.response_saved responseSaved,w.invalidated_at invalidatedAt,w.predecessor_id predecessorId,w.attempts,w.last_attempt_at lastAttemptAt,w.error,w.created_at createdAt,
    (SELECT COUNT(*) FROM conversation_memory_candidates c WHERE c.window_id=w.id AND c.kind='statement' AND c.status='completed' AND c.page_id IS NOT NULL) statementCount,
    (SELECT COUNT(*) FROM conversation_memory_candidates c WHERE c.window_id=w.id AND c.kind='discussion' AND c.status='completed' AND c.page_id IS NOT NULL) discussionCount
    FROM conversation_memory_windows w JOIN threads t ON t.id=w.thread_id
    WHERE w.project_id=? ORDER BY w.invalidated_at IS NULL AND (w.statement_status<>'completed' OR w.discussion_status<>'completed') DESC,
      w.created_at DESC,w.id DESC LIMIT 10`,
    [projectId],
  );
  const windowCandidates = windows.length
    ? await query(
        db,
        `SELECT c.id,c.window_id windowId,c.kind,c.status,c.payload,c.page_id pageId,c.error
         FROM conversation_memory_candidates c WHERE c.window_id IN (${windows.map(() => "?").join(",")})
         ORDER BY c.window_id,c.kind,c.ordinal`,
        windows.map((window) => window.id),
      )
    : [];
  for (const window of windows) {
    window.results = windowCandidates
      .filter((candidate) => candidate.windowId === window.id)
      .map((candidate) => {
        let payload = candidate.payload;
        if (typeof payload === "string") {
          try {
            payload = JSON.parse(payload);
          } catch {
            payload = {};
          }
        }
        return {
          id: candidate.id,
          kind: candidate.kind,
          status: candidate.status,
          title: payload?.title || payload?.question || "未命名结果",
          action: payload?.pageId ? "update" : "create",
          pageId: candidate.pageId,
          error: candidate.error,
        };
      });
  }
  const observations = await query(
    db,
    `SELECT id,thread_id threadId,question,status,review_after reviewAfter,
    last_review_at lastReviewAt,review_attempts reviewAttempts,review_note reviewNote
    FROM conversation_memory_observations WHERE project_id=? AND status IN ('pending','promoting')
    ORDER BY review_after,id LIMIT 20`,
    [projectId],
  );
  const [projectQueue] = await query(
    db,
    "SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=? AND source_kind<>'message'",
    [projectId],
  );
  const projectCandidates = await query(
    db,
    `SELECT id,source_kind sourceKind,source_id sourceId,hint,retry_count retryCount,
      last_error lastError,last_attempt_at lastAttemptAt,available_at availableAt,created_at createdAt
     FROM agent_project_memory_queue WHERE project_id=? AND source_kind<>'message'
     ORDER BY (last_error IS NOT NULL) DESC,created_at LIMIT 20`,
    [projectId],
  );
  const fileJobs = await readFileIndexJobs(db, projectId);
  const [archivedThread] = await query(
    db,
    `SELECT id,title FROM threads WHERE project_id=? AND status='archived'
     ORDER BY archived_at DESC, id DESC LIMIT 1`,
    [projectId],
  );
  const backlog = {
    member_memory:
      Number(conversationQueue?.count || 0) + Number(conversationPending?.statements || 0),
    document_memory: fileJobs.coverage.pending,
    project_memory: Number(projectQueue?.count || 0),
    task_memory: null,
    discussion_memory:
      Number(conversationQueue?.count || 0) + Number(conversationPending?.discussions || 0),
  };
  return MEMORY_JOBS.map((job) => ({
    ...job,
    backlog: backlog[job.key] ?? null,
    backlogNote: backlog[job.key] === null ? "随项目记忆结算触发，无独立队列" : "",
    lastRun: lastByTask.get(job.key === "discussion_memory" ? "member_memory" : job.key) || null,
    recentRuns: runs
      .filter((run) => (TASKS_BY_JOB[job.key] || []).includes(run.task))
      .slice(0, 20)
      .map(toRunRow),
    archivedThread: job.key === "discussion_memory" ? archivedThread || null : null,
    conversationWindows: ["member_memory", "discussion_memory"].includes(job.key) ? windows : [],
    observations: job.key === "discussion_memory" ? observations : [],
    projectCandidates: job.key === "project_memory" ? projectCandidates : [],
    fileCoverage: job.key === "document_memory" ? fileJobs.coverage : null,
    fileIssues: job.key === "document_memory" ? fileJobs.issues : [],
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
