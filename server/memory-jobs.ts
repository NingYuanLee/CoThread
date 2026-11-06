import { query } from "./db.ts";
import { MEMORY_JOBS, MEMORY_JOB_KEYS } from "../shared/memory-jobs.js";
import { HttpError } from "./service.ts";
import { readFileIndexJobs } from "./file-index-jobs.ts";
import { PROJECT_MEMORY_SIGNAL_KINDS } from "./project-memory.ts";
import type { Db } from "./types.ts";

/** 记忆作业历史查询的筛选条件；值来自请求参数，逐个收口。 */
type MemoryJobHistoryOptions = {
  pageSize?: unknown;
  page?: unknown;
  status?: unknown;
  from?: unknown;
  to?: unknown;
  trigger?: unknown;
};

/** 消息记忆进度查询的筛选条件。 */
type ConversationProgressOptions = { pageSize?: unknown; page?: unknown; keyword?: unknown };

/** 记忆作业运行行（`agent_laoweng_runs` 的投影）。 */
type MemoryJobRunRow = {
  id: string;
  task: string;
  threadId?: string | null;
  triggerSource?: string | null;
  status?: string | null;
  agentCalled?: unknown;
  hadUpdates?: unknown;
  itemCount?: unknown;
  error?: string | null;
  createdAt?: unknown;
  startedAt?: unknown;
  finishedAt?: unknown;
};

/** 联合分析窗口行（历史视图里的窗口摘要）。 */
type ConversationWindowRow = {
  runId: string;
  windowId: string | null;
  firstSequence: number | null;
  lastSequence: number | null;
  threadTitle?: string | null;
};

/** `conversation_run_items` 的投影行；`payload` 可能是 JSON 字符串。 */
type RunItemRow = {
  runId: string;
  kind: string;
  payload: string | Record<string, unknown> | null;
  pageId?: string | null;
  windowId?: string | null;
};

const TASKS_BY_JOB: Record<string, string[]> = {
  member_memory: ["member_memory"],
  document_memory: ["document_memory", "project_document_memory", "iteration_document_memory"],
  iteration_archive: ["iteration_archive", "thread_archive"],
  project_memory: ["project_memory"],
  task_memory: [],
};

// 核心议题与关键发言已合并为一条作业；旧键继续接受，避免历史调用直接报错。
const LEGACY_JOB_KEYS: Record<string, string> = { discussion_memory: "member_memory" };
function normalizeMemoryJobKey(key: string): string {
  const normalized = LEGACY_JOB_KEYS[key] || key;
  if (!MEMORY_JOB_KEYS.includes(normalized)) throw new HttpError(400, "没有这个记忆作业");
  return normalized;
}

/** 读数据库里的 JSON 负载：字符串先解析，解析不出对象时按空对象处理。 */
function readPayloadObject(value: unknown): Record<string, unknown> {
  let parsed: unknown = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export async function listMemoryJobHistory(
  db: Db,
  projectId: string,
  key: string,
  options: MemoryJobHistoryOptions = {},
) {
  key = normalizeMemoryJobKey(key);
  const positiveInt = (value: unknown, fallback: number): number => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 1 ? Math.trunc(number) : fallback;
  };
  const pageSize = Math.min(100, positiveInt(options.pageSize, 10));
  const requestedPage = Math.min(1000000, positiveInt(options.page, 1));
  const status = typeof options.status === "string" ? options.status.trim() : "";
  if (status && !["queued", "running", "completed", "failed"].includes(status))
    throw new HttpError(400, "无效的运行状态");
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const from = typeof options.from === "string" ? options.from.trim() : "";
  const to = typeof options.to === "string" ? options.to.trim() : "";
  if ((from && !datePattern.test(from)) || (to && !datePattern.test(to)))
    throw new HttpError(400, "无效的时间范围");
  if (from && to && from > to) throw new HttpError(400, "开始日期不能晚于结束日期");
  const tasks = TASKS_BY_JOB[key] || [];
  if (!tasks.length) return { rows: [], total: 0, page: 1, pageSize };
  const trigger = typeof options.trigger === "string" ? options.trigger : "";
  if (trigger && !["user", "schedule"].includes(trigger))
    throw new HttpError(400, "无效的触发类型");
  const where = `project_id=? AND task IN (${tasks.map(() => "?").join(",")})${trigger ? " AND trigger_source=?" : ""}${status ? " AND status=?" : ""}${from ? " AND created_at>=?" : ""}${to ? " AND created_at<DATE_ADD(?,INTERVAL 1 DAY)" : ""}`;
  const params = [
    projectId,
    ...tasks,
    ...(trigger ? [trigger] : []),
    ...(status ? [status] : []),
    ...(from ? [from] : []),
    ...(to ? [to] : []),
  ];
  const [count] = await query(
    db,
    `SELECT COUNT(*) AS total FROM agent_laoweng_runs WHERE ${where}`,
    params,
  );
  const total = Number(count.total);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const rows = await query(
    db,
    `SELECT id, task, thread_id, trigger_source, status, agent_called,
    had_updates, item_count, error, created_at, started_at, finished_at
    FROM agent_laoweng_runs WHERE ${where}
    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  if (key === "member_memory" && rows.length) {
    const ids = rows.map((row) => row.id);
    const marks = ids.map(() => "?").join(",");
    const windows = await query<ConversationWindowRow>(
      db,
      `SELECT rw.run_id runId,w.id windowId,w.first_sequence firstSequence,
      w.last_sequence lastSequence,t.title threadTitle FROM conversation_run_windows rw
      JOIN conversation_memory_windows w ON w.id=rw.window_id JOIN threads t ON t.id=w.thread_id
      WHERE rw.run_id IN (${marks}) ORDER BY w.created_at,w.id`,
      ids,
    );
    const items = await query<RunItemRow>(
      db,
      `SELECT ri.run_id runId,ri.kind,ri.payload,ri.page_id pageId,c.window_id windowId
      FROM conversation_run_items ri
      LEFT JOIN conversation_memory_candidates c ON c.id=ri.candidate_id
      WHERE ri.run_id IN (${marks}) ORDER BY ri.candidate_id`,
      ids,
    );
    const countItems = (runItems: RunItemRow[]) => {
      const counts = { createdDiscussions: 0, updatedDiscussions: 0, statements: 0 };
      for (const item of runItems) {
        if (item.kind === "statement") counts.statements += 1;
        else if (item.kind === "discussion") {
          const payload = readPayloadObject(item.payload);
          if (payload.pageId) counts.updatedDiscussions += 1;
          else counts.createdDiscussions += 1;
        }
      }
      return counts;
    };
    for (const row of rows) {
      const runWindows = windows.filter((window) => window.runId === row.id);
      const runItems = items.filter((item) => item.runId === row.id);
      row.conversationWindows = runWindows.map((window) => ({
        windowId: window.windowId,
        threadTitle: window.threadTitle,
        firstSequence: window.firstSequence,
        lastSequence: window.lastSequence,
        ...countItems(runItems.filter((item) => item.windowId === window.windowId)),
      }));
      // 复核、清理等运行可能没有窗口记录，把未归属窗口的结果单独列出，避免丢失。
      const leftovers = runItems.filter(
        (item) => !runWindows.some((window) => window.windowId === item.windowId),
      );
      if (leftovers.length)
        row.conversationWindows.push({
          windowId: null,
          threadTitle: "未关联迭代",
          firstSequence: null,
          lastSequence: null,
          ...countItems(leftovers),
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
export async function listMemoryJobs(db: Db, projectId: string) {
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
  const toRunRow = (run: MemoryJobRunRow) => ({
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
    SUM(statement_status<>'completed') statements,SUM(discussion_status<>'completed') discussions,
    SUM(statement_status<>'completed' OR discussion_status<>'completed') windows
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
  // 只有项目级信号会真正排队并调用模型；旧版本留下的议题页/文件索引页行不计入积压。
  const projectSignalMarks = PROJECT_MEMORY_SIGNAL_KINDS.map(() => "?").join(",");
  const [projectQueue] = await query(
    db,
    `SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=? AND source_kind<>'message'
     AND source_kind IN (${projectSignalMarks})`,
    [projectId, ...PROJECT_MEMORY_SIGNAL_KINDS],
  );
  const projectCandidates = await query(
    db,
    `SELECT id,source_kind sourceKind,source_id sourceId,hint,retry_count retryCount,
      last_error lastError,last_attempt_at lastAttemptAt,available_at availableAt,created_at createdAt
     FROM agent_project_memory_queue WHERE project_id=? AND source_kind<>'message'
     AND source_kind IN (${projectSignalMarks})
     ORDER BY (last_error IS NOT NULL) DESC,created_at LIMIT 20`,
    [projectId, ...PROJECT_MEMORY_SIGNAL_KINDS],
  );
  const fileJobs = await readFileIndexJobs(db, projectId);
  const [archivedThread] = await query(
    db,
    `SELECT id,title FROM threads WHERE project_id=? AND status='archived'
     ORDER BY archived_at DESC, id DESC LIMIT 1`,
    [projectId],
  );
  const backlog: Record<string, number | null> = {
    member_memory:
      Number(conversationQueue?.count || 0) + Number(conversationPending?.windows || 0),
    document_memory: fileJobs.coverage.pending,
    project_memory: Number(projectQueue?.count || 0),
    task_memory: null,
  };
  const backlogDetail: Record<string, { statements: number; discussions: number; queued: number }> =
    {
      member_memory: {
        statements: Number(conversationPending?.statements || 0),
        discussions: Number(conversationPending?.discussions || 0),
        queued: Number(conversationQueue?.count || 0),
      },
    };
  return MEMORY_JOBS.map((job) => ({
    ...job,
    backlog: backlog[job.key] ?? null,
    backlogDetail: backlogDetail[job.key] ?? null,
    backlogNote: backlog[job.key] === null ? "随项目记忆结算触发，无独立队列" : "",
    lastRun: lastByTask.get(job.key) || null,
    recentRuns: runs
      .filter((run) => (TASKS_BY_JOB[job.key] || []).includes(run.task))
      .slice(0, 20)
      .map(toRunRow),
    archivedThread: job.key === "member_memory" ? archivedThread || null : null,
    conversationWindows: job.key === "member_memory" ? windows : [],
    observations: job.key === "member_memory" ? observations : [],
    projectCandidates: job.key === "project_memory" ? projectCandidates : [],
    fileCoverage: job.key === "document_memory" ? fileJobs.coverage : null,
    fileIssues: job.key === "document_memory" ? fileJobs.issues : [],
  }));
}

/** 消息记忆进度：按迭代汇总消息、记忆窗口和队列，说明记忆处理到哪一步。 */
export async function listConversationProgress(
  db: Db,
  projectId: string,
  options: ConversationProgressOptions = {},
) {
  const positiveInt = (value: unknown, fallback: number): number => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 1 ? Math.trunc(number) : fallback;
  };
  const pageSize = Math.min(100, positiveInt(options.pageSize, 10));
  const requestedPage = Math.min(1000000, positiveInt(options.page, 1));
  const keyword = typeof options.keyword === "string" ? options.keyword.trim().slice(0, 200) : "";
  const where = `t.project_id=? ${keyword ? "AND LOCATE(LOWER(?),LOWER(t.title))>0" : ""}`;
  const params = [projectId, ...(keyword ? [keyword] : [])];
  const [count] = await query(db, `SELECT COUNT(*) total FROM threads t WHERE ${where}`, params);
  const total = Number(count.total);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const rows = await query(
    db,
    `SELECT t.id,t.title,t.status,t.archived_at archivedAt,
    (SELECT COUNT(*) FROM messages m WHERE m.thread_id=t.id AND m.source<>'system' AND m.body<>'') messageCount,
    (SELECT MAX(m.sequence) FROM messages m WHERE m.thread_id=t.id AND m.source<>'system' AND m.body<>'') latestSequence,
    (SELECT MAX(m.created_at) FROM messages m WHERE m.thread_id=t.id AND m.source<>'system' AND m.body<>'') lastMessageAt,
    (SELECT MAX(w.last_sequence) FROM conversation_memory_windows w
      WHERE w.thread_id=t.id AND w.invalidated_at IS NULL
      AND w.statement_status='completed' AND w.discussion_status='completed') processedThrough,
    (SELECT MAX(w.last_sequence) FROM conversation_memory_windows w
      WHERE w.thread_id=t.id AND w.invalidated_at IS NULL
      AND (w.statement_status<>'completed' OR w.discussion_status<>'completed')) processingThrough,
    (SELECT COUNT(*) FROM conversation_memory_windows w
      WHERE w.thread_id=t.id AND w.invalidated_at IS NULL
      AND (w.statement_status<>'completed' OR w.discussion_status<>'completed')) pendingWindows,
    (SELECT SUM(w.available_at<=UTC_TIMESTAMP(3)) FROM conversation_memory_windows w
      WHERE w.thread_id=t.id AND w.invalidated_at IS NULL
      AND (w.statement_status<>'completed' OR w.discussion_status<>'completed')) readyWindows,
    (SELECT MAX(w.last_attempt_at) FROM conversation_memory_windows w
      WHERE w.thread_id=t.id AND w.invalidated_at IS NULL
      AND (w.statement_status<>'completed' OR w.discussion_status<>'completed')) lastAttemptAt,
    (SELECT w.error FROM conversation_memory_windows w
      WHERE w.thread_id=t.id AND w.invalidated_at IS NULL
      AND (w.statement_status<>'completed' OR w.discussion_status<>'completed')
      ORDER BY w.last_attempt_at DESC LIMIT 1) lastError,
    (SELECT COUNT(*) FROM conversation_memory_queue q WHERE q.thread_id=t.id) queued,
    (SELECT COUNT(*) FROM messages m WHERE m.thread_id=t.id AND m.source<>'system' AND m.body<>''
      AND NOT EXISTS (SELECT 1 FROM conversation_window_messages wm WHERE wm.message_id=m.id)
      AND NOT EXISTS (SELECT 1 FROM conversation_pending_messages p WHERE p.message_id=m.id)) unwindowedMessages
    FROM threads t WHERE ${where}
    ORDER BY t.archived_at IS NULL DESC,lastMessageAt DESC,t.id
    LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return {
    rows: rows.map((row) => {
      const latestSequence = row.latestSequence == null ? null : Number(row.latestSequence);
      const processedThrough = row.processedThrough == null ? null : Number(row.processedThrough);
      const processingThrough =
        row.processingThrough == null ? null : Number(row.processingThrough);
      const pendingWindows = Number(row.pendingWindows || 0);
      const readyWindows = Number(row.readyWindows || 0);
      const queued = Number(row.queued || 0);
      const unwindowedMessages = Number(row.unwindowedMessages || 0);
      let state = "done";
      if (pendingWindows > 0)
        state = row.lastError ? "failed" : readyWindows > 0 ? "processing" : "waiting";
      else if (queued > 0) state = "waiting";
      else if (latestSequence == null) state = "empty";
      else if (processedThrough == null || processedThrough < latestSequence)
        state = unwindowedMessages > 0 ? "unbackfilled" : "pending";
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        archivedAt: row.archivedAt || null,
        lastMessageAt: row.lastMessageAt || null,
        messageCount: Number(row.messageCount || 0),
        latestSequence,
        processedThrough,
        processingThrough,
        pendingWindows,
        queued,
        unwindowedMessages,
        lastAttemptAt: row.lastAttemptAt || null,
        lastError: row.lastError || null,
        state,
      };
    }),
    total,
    page,
    pageSize,
  };
}

function rejectJobAdjustment(key: string) {
  if (!MEMORY_JOB_KEYS.includes(key)) throw new HttpError(400, "没有这个记忆作业");
  throw new HttpError(409, "记忆作业口径使用默认，不能调整");
}

/** 口径固定为默认，不再接受项目级覆盖。 */
export async function updateMemoryJobSettings(_db: Db, _projectId: string, key: string) {
  rejectJobAdjustment(key);
}

/** 没有可回滚的项目级口径。 */
export async function resetMemoryJobSettings(_db: Db, _projectId: string, key: string) {
  rejectJobAdjustment(key);
}
