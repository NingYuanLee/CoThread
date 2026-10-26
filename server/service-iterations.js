import {
  beginIterationArchive,
  readArchiveWorkflow,
  cancelIterationArchive,
  retryIterationArchive,
  confirmIterationArchive,
} from "./iteration-archive.js";
import { attachMessageQuotes } from "./message-quotes.js";
import { threadReadSummary } from "./thread-reads.js";
import { projectThreadSideState } from "./thread-side-state.js";
import { contextUsage } from "../shared/context.js";
import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { title, json, parseMessageRow } from "./service-support.js";

export function beginIterationArchiveOperation(service, user, threadId) {
  return beginIterationArchive(service, user, threadId);
}

export function readArchiveWorkflowOperation(service, user, threadId) {
  return readArchiveWorkflow(service, user, threadId);
}

export function cancelIterationArchiveOperation(service, user, threadId, input) {
  return cancelIterationArchive(service, user, threadId, input);
}

export function retryIterationArchiveOperation(service, user, threadId, input) {
  return retryIterationArchive(service, user, threadId, input);
}

export function confirmIterationArchiveOperation(service, user, threadId, input) {
  return confirmIterationArchive(service, user, threadId, input);
}

export async function listIterationContextChangesOperation(service, user, threadId, input = {}) {
  const { page, pageSize, q, review } = z
    .object({
      page: z.coerce.number().int().min(1).max(1000000).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(10),
      q: z.string().trim().max(200).optional().default(""),
      review: z.enum(["all", "reviewed", "pending"]).optional().default("all"),
    })
    .parse(input);
  await service.thread(user, threadId);
  const filters = ["c.thread_id=?"];
  const params = [threadId];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    filters.push(
      `(IFNULL(u.name,'') LIKE ? ESCAPE '\\\\' OR IFNULL(r.name,'') LIKE ? ESCAPE '\\\\' OR c.reason LIKE ? ESCAPE '\\\\' OR (c.source='agent' AND '迭代 Agent' LIKE ? ESCAPE '\\\\') OR (c.source<>'agent' AND u.id IS NULL AND '已离开成员' LIKE ? ESCAPE '\\\\') OR JSON_UNQUOTE(JSON_EXTRACT(c.before_context, '$.background')) LIKE ? ESCAPE '\\\\' OR JSON_UNQUOTE(JSON_EXTRACT(c.before_context, '$.goal')) LIKE ? ESCAPE '\\\\')`,
    );
    params.push(like, like, like, like, like, like, like);
  }
  if (review === "reviewed") filters.push("c.reviewed_by IS NOT NULL");
  if (review === "pending") filters.push("c.reviewed_by IS NULL");
  const where = `FROM iteration_context_changes c LEFT JOIN users u ON u.id=c.changed_by LEFT JOIN users r ON r.id=c.reviewed_by WHERE ${filters.join(" AND ")}`;
  const [count] = await query(service.db, `SELECT COUNT(*) total ${where}`, params);
  const rows = await query(
    service.db,
    `SELECT c.*,u.name initiator_name,r.name reviewer_name ${where} ORDER BY c.created_at DESC,c.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const context = (value) => (typeof value === "string" ? JSON.parse(value) : value);
  return {
    page,
    pageSize,
    total: Number(count.total),
    items: rows.map((row) => ({
      id: row.id,
      source: row.source,
      initiatorName: row.source === "agent" ? "迭代 Agent" : row.initiator_name || "已离开成员",
      reviewerName: row.reviewer_name || null,
      before: context(row.before_context),
      after: context(row.after_context),
      reason: row.reason,
      createdAt: row.created_at,
    })),
  };
}

export async function updateThreadOperation(
  service,
  user,
  threadId,
  input,
  { source = "human" } = {},
) {
  const data = z
    .object({
      background: z.string().max(20000).optional(),
      goal: z.string().max(20000).optional(),
      reason: z.string().max(2000).default(""),
    })
    .refine(
      (value) => value.background !== undefined || value.goal !== undefined,
      "请提供背景或目标",
    )
    .parse(input);
  return transaction(service.db, async (db) => {
    const before = await service.thread(user, threadId, true, db);
    await query(
      db,
      "UPDATE threads SET background=COALESCE(?,background),goal=COALESCE(?,goal) WHERE id=?",
      [data.background ?? null, data.goal ?? null, threadId],
    );
    const previous = { background: before.background || "", goal: before.goal || "" };
    const next = {
      background: data.background ?? previous.background,
      goal: data.goal ?? previous.goal,
    };
    if (previous.background !== next.background || previous.goal !== next.goal)
      await query(
        db,
        "INSERT INTO iteration_context_changes(id,thread_id,changed_by,source,reason,before_context,after_context) VALUES(?,?,?,?,?,?,?)",
        [
          randomUUID(),
          threadId,
          user.id,
          source,
          data.reason,
          JSON.stringify(previous),
          JSON.stringify(next),
        ],
      );
    if (previous.background !== next.background || previous.goal !== next.goal) {
      const { noteProjectMemorySignal } = await import("./project-memory.js");
      await noteProjectMemorySignal(
        db,
        before.project_id,
        "milestone",
        randomUUID(),
        `迭代「${before.title || threadId}」变更目标或背景`,
        { urgent: true },
      ).catch(() => {});
    }
    return service.thread(user, threadId, false, db);
  });
}

export async function createThreadOperation(service, user, projectId, input) {
  await service.member(user, projectId, true);
  const data = z
    .object({
      title,
      background: z.string().max(20000).default(""),
      goal: z.string().max(20000).default(""),
    })
    .parse(input);
  const threadId = randomUUID();
  await transaction(service.db, async (db) => {
    await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [projectId]);
    await service.assertDocumentScopeAvailable(db, projectId, null);
    await query(
      db,
      "INSERT INTO threads(id,project_id,title,created_by,background,goal) VALUES(?,?,?,?,?,?)",
      [threadId, projectId, data.title, user.id, data.background, data.goal],
    );
    await service.createIterationFolders(db, projectId, threadId, data.title);
    const { noteProjectMemorySignal } = await import("./project-memory.js");
    await noteProjectMemorySignal(
      db,
      projectId,
      "milestone",
      threadId,
      `新建迭代「${data.title}」；背景：${data.background.slice(0, 180)}；目标：${data.goal.slice(0, 180)}`,
      { urgent: true },
    ).catch(() => {});
  });
  return { id: threadId, project_id: projectId, ...data };
}

export async function contextOperation(
  service,
  user,
  threadId,
  db = service.db,
  {
    display = false,
    limit = 50,
    before,
    after,
    includeConnectorResults = true,
    includeRunResults = true,
    sideState,
    sideRevision,
  } = {},
) {
  const thread = await service.thread(user, threadId, false, db, { display });
  const pageSize = z.coerce.number().int().min(1).max(200).parse(limit);
  const cursor = before || after;
  if (cursor) z.string().regex(/^\d+$/).parse(cursor);
  // Never inline base64 avatars or full tool I/O here — a busy thread can exceed
  // 30 MiB and arrive as HTTP 200 with a truncated/non-JSON body through the proxy.
  // Avatars stay on /members/:id/avatar; event payloads stay on /events/:eventId.
  const messagesQuery = query(
    db,
    `SELECT m.id,m.sequence,m.body,m.refs,m.folder_refs,m.source,m.execution_target,m.agent_task_id,m.turn_id,m.turn_usage,m.created_at,u.name author,u.id author_id,CASE WHEN m.source='assistant' THEN NULL ELSE CONCAT('/api/projects/',?,'/members/',u.id,'/avatar?v=',LEFT(SHA2(u.avatar,256),16)) END author_avatar,
      JSON_UNQUOTE(JSON_EXTRACT(u.identity_tags, '$[0]')) author_role
      FROM messages m JOIN users u ON u.id=m.author_id WHERE m.thread_id=? AND NOT (m.source='human' AND m.agent_task_id IS NOT NULL)${display && cursor ? ` AND m.sequence${before ? "<" : ">"}?` : ""} ORDER BY m.sequence${display && !after ? " DESC" : ""}${display ? ` LIMIT ${pageSize + 1}` : ""}`,
    [thread.project_id, threadId, ...(display && cursor ? [cursor] : [])],
  );
  const page = display ? await messagesQuery : null;
  const hasMore = !!page && page.length > pageSize;
  const selected = page?.slice(0, pageSize);
  if (display && !after) selected.reverse();
  const eventFilter = display
    ? ` AND m.id IN (${selected.length ? selected.map(() => "?").join(",") : "NULL"})`
    : "";
  const revisionMatched =
    display &&
    sideRevision != null &&
    sideRevision !== "" &&
    String(thread.side_revision ?? 0) === String(sideRevision) &&
    typeof sideState === "string" &&
    sideState.startsWith("s1:");
  const reviewsQuery = revisionMatched
    ? Promise.resolve([])
    : query(
        db,
        `SELECT r.*,u.name reviewer FROM reviews r JOIN versions v ON v.id=r.version_id
      JOIN users u ON u.id=r.reviewer_id WHERE v.thread_id=? ORDER BY r.created_at,r.id`,
        [threadId],
      );
  // Chat uses progress and failure diagnostics; full readers retain every log.
  const runResults = includeRunResults
    ? "output"
    : "CASE WHEN status IN ('failed','interrupted') THEN output ELSE NULL END output";
  const runsQuery = revisionMatched
    ? Promise.resolve([])
    : query(
        db,
        `SELECT id,kind,status,${runResults},progress,created_at,finished_at FROM sandbox_runs WHERE thread_id=? ORDER BY created_at DESC LIMIT 20`,
        [threadId],
      );
  const repliesQuery = revisionMatched
    ? Promise.resolve([])
    : query(
        db,
        `SELECT r.message_id,m.author_id,m.created_at started_at,r.status,r.error,r.reply_id,r.progress,r.participation,r.parent_message_id,r.dispatch_ready,r.agent_slot,r.finished_at,r.first_response_at,r.usage_stats FROM assistant_replies r
      JOIN messages m ON m.id=r.message_id WHERE m.thread_id=? ORDER BY m.sequence`,
        [threadId],
      );
  const eventsQuery = query(
    db,
    `SELECT e.id,e.message_id,e.tool,e.status,e.created_at,e.finished_at,
       CASE WHEN JSON_VALID(e.input) THEN JSON_OBJECT('action',JSON_EXTRACT(e.input,'$.action'),'scope',JSON_EXTRACT(e.input,'$.scope'),'name',JSON_EXTRACT(e.input,'$.name'),'artifactId',JSON_EXTRACT(e.input,'$.artifactId'),'folderId',JSON_EXTRACT(e.input,'$.folderId'),'threadId',JSON_EXTRACT(e.input,'$.threadId'),'versionId',JSON_EXTRACT(e.input,'$.versionId'),
       'path',JSON_EXTRACT(e.input,'$.path'),'title',JSON_EXTRACT(e.input,'$.title'),'command',LEFT(JSON_UNQUOTE(JSON_EXTRACT(e.input,'$.command')),300)) ELSE '{}' END input,
       NULL output FROM agent_events e JOIN messages m ON m.id=e.message_id WHERE m.thread_id=?${eventFilter} ORDER BY e.id`,
    [threadId, ...(display ? selected.map((m) => m.id) : [])],
  );
  const agentContextQuery = query(
    db,
    "SELECT context_stats,seen_sequence,compact_status,compact_error,compact_result FROM agent_sessions WHERE thread_id=?",
    [threadId],
  );
  const updatesQuery = revisionMatched
    ? Promise.resolve([])
    : query(
        db,
        `SELECT u.message_id,u.task_message_id,u.delivered_at FROM agent_task_updates u
       JOIN messages m ON m.id=u.message_id WHERE m.thread_id=? ORDER BY m.sequence`,
        [threadId],
      );
  const requestsQuery = revisionMatched
    ? Promise.resolve([])
    : query(
        db,
        `SELECT q.message_id,q.status,q.response_id,q.error,q.first_response_at,q.usage_stats FROM agent_requests q JOIN messages m ON m.id=q.message_id
       WHERE m.thread_id=? ORDER BY m.sequence`,
        [threadId],
      );
  const localExecutorTaskResults = includeConnectorResults
    ? "t.output,t.diff"
    : "NULL output,NULL diff";
  const localExecutorTasksQuery = revisionMatched
    ? Promise.resolve([])
    : query(
        db,
        `SELECT t.id,t.message_id,t.requested_by,t.assigned_to,t.status,t.policy,t.allow_git_push allowGitPush,t.progress,t.agent_kind agentKind,t.error,${localExecutorTaskResults},
      CASE WHEN ? IN (t.requested_by,t.assigned_to) THEN t.instruction ELSE NULL END instruction,
      t.created_at,t.started_at,t.finished_at,c.id local_executor_id,c.name local_executor_name,u.name local_executor_owner_name
      FROM local_executor_tasks t JOIN local_executors c ON c.id=t.local_executor_id JOIN users u ON u.id=c.user_id
      WHERE t.thread_id=? ORDER BY t.created_at,t.id`,
        [user.id, threadId],
      );
  const pendingQuery = display
    ? query(
        db,
        // A constant cursor lets MySQL range-scan (thread_id,sequence), rather
        // than checking the session join after reading the entire history.
        `SELECT m.id,m.sequence,m.body,m.refs,m.folder_refs,m.source,u.name author,u.id author_id,JSON_UNQUOTE(JSON_EXTRACT(u.identity_tags, '$[0]')) author_role FROM messages m JOIN users u ON u.id=m.author_id WHERE m.thread_id=? AND m.sequence>COALESCE((SELECT seen_sequence FROM agent_sessions WHERE thread_id=?),0)`,
        [threadId, threadId],
      )
    : Promise.resolve(null);
  const toolDurationQuery = query(
    db,
    `SELECT COALESCE(SUM(GREATEST(TIMESTAMPDIFF(MICROSECOND, e.created_at, e.finished_at),0)),0) ms
     FROM agent_events e JOIN messages m ON m.id=e.message_id
     WHERE m.thread_id=? AND e.finished_at IS NOT NULL AND e.tool<>'thinking'
       AND NOT EXISTS (SELECT 1 FROM agent_child_sessions cs WHERE cs.session_id=e.agent_session_id)
       AND NOT EXISTS (SELECT 1 FROM agent_task_execution_runs cr
         WHERE cr.executor_type='child_agent' AND cr.executor_id=e.agent_session_id)`,
    [threadId],
  );
  // 轮次口径与轨迹一致：有事件（=小祥真的跑过）的触发消息数，排除子 Agent 会话。
  const trajectoryRoundsQuery = query(
    db,
    `SELECT COUNT(DISTINCT COALESCE(e.turn_id,e.message_id)) n
     FROM agent_events e JOIN messages m ON m.id=e.message_id
     WHERE m.thread_id=?
       AND NOT EXISTS (SELECT 1 FROM agent_child_sessions cs WHERE cs.session_id=e.agent_session_id)
       AND NOT EXISTS (SELECT 1 FROM agent_task_execution_runs cr
         WHERE cr.executor_type='child_agent' AND cr.executor_id=e.agent_session_id)`,
    [threadId],
  );
  // 每轮用量（含唤醒续报轮）：底部统计按轮汇总，没出现在 replies 里的轮也能算上。
  const turnUsageQuery = query(
    db,
    `SELECT COALESCE(m.turn_id,m.id) turn_id,m.turn_usage usage_stats,m.created_at finished_at
     FROM messages m WHERE m.thread_id=? AND m.turn_usage IS NOT NULL ORDER BY m.sequence`,
    [threadId],
  );
  const [
    messages,
    reviews,
    runs,
    replies,
    events,
    [agentContext],
    updates,
    requests,
    pending,
    localExecutorTasks,
    toolDurationRows,
    [trajectoryRoundsRow],
    turnUsageRows,
  ] = await Promise.all([
    display ? selected : messagesQuery,
    reviewsQuery,
    runsQuery,
    repliesQuery,
    eventsQuery,
    agentContextQuery,
    updatesQuery,
    requestsQuery,
    pendingQuery,
    localExecutorTasksQuery,
    toolDurationQuery,
    trajectoryRoundsQuery,
    turnUsageQuery,
  ]);
  const withQuotes = await attachMessageQuotes(db, [
    ...new Map([...(pending || []), ...messages].map((m) => [m.id, parseMessageRow(m)])).values(),
  ]);
  const quotedById = new Map(withQuotes.map((m) => [m.id, m]));
  const readState = await threadReadSummary(db, user.id, threadId);
  const context = {
    ...thread,
    last_read_sequence: readState.lastReadSequence,
    unread_count: readState.unreadCount,
    unread_mention: readState.unreadMention,
    contextUsage: contextUsage(
      agentContext,
      (pending || messages).map((m) => quotedById.get(m.id)),
      replies,
    ),
    archive_snapshot: thread.archive_snapshot ? json(thread.archive_snapshot) : null,
    ...(display
      ? {
          page: {
            hasMore,
            before: messages[0]?.sequence || null,
            after: messages.at(-1)?.sequence || after || null,
          },
        }
      : {}),
    messages: messages.map((m) => quotedById.get(m.id)),
    reviews,
    runs,
    replies,
    events: events.map((event) => ({
      ...event,
      input: typeof event.input === "string" ? event.input : JSON.stringify(event.input),
    })),
    updates,
    requests,
    localExecutorTasks,
    toolDurationMs: Number(toolDurationRows?.[0]?.ms || 0) / 1000,
    // 底部统计的「N 轮」「N 步」用它，和轨迹页同口径。
    trajectoryRounds: Number(trajectoryRoundsRow?.n || 0),
    turnUsage: turnUsageRows,
  };
  if (revisionMatched)
    return {
      ...context,
      reviews: [],
      runs: [],
      replies: [],
      updates: [],
      requests: [],
      localExecutorTasks: [],
      turnUsage: [],
      sideState: { mode: "unchanged", token: sideState },
    };
  return display
    ? projectThreadSideState(context, user, sideState, [includeConnectorResults, includeRunResults])
    : context;
}
