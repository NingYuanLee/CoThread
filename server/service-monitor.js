import { contextUsage } from "../shared/context.js";
import { modelConfig } from "./model-config.js";
import { z } from "zod/v3";
import { query } from "./db.js";
import { taskExecutionSnapshot } from "./task-pool-activity.js";
import {
  describeAgentAction,
  formatAgentAction,
  LAOWENG_MAINTENANCE_TASKS,
  laowengTaskLabel,
  normalizeLaowengTask,
} from "../shared/agent-label.js";
import { DOCUMENT_LIBRARY_FOLDER_SQL } from "./documents/index.js";
import { capabilityProfile, SYSTEM_PROMPTS } from "../dsh-layer/cothread-plugin-registry.mjs";
import { COTHREAD_SYSTEM_TEXT } from "../shared/prompt-blocks.js";
import { fail, id, preferredLocalExecutorJoin } from "./service-support.js";

export async function agentMonitorOperation(service, user, projectId) {
  await service.member(user, projectId);
  const modelSummary = (scope) => {
    const config = modelConfig(scope);
    return { model: config.model, reasoningEffort: config.reasoningEffort };
  };
  const [
    memberQueue,
    documentQueue,
    memberSummary,
    documentSummary,
    laowengSessions,
    coordinators,
    executors,
    taskExecutions,
    eventLog,
    organizationJobs,
    organizationLast,
    archives,
    archivePlans,
    archiveLast,
    laowengRuns,
    laowengRunLast,
    xiaoxiangSessions,
  ] = await Promise.all([
    query(
      service.db,
      `SELECT COUNT(*) pending,
          COALESCE(SUM(available_at<=UTC_TIMESTAMP(3)),0) ready,
          MIN(available_at) next_at FROM agent_member_memory_queue WHERE project_id=?`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT COUNT(*) pending,
          COALESCE(SUM(q.available_at<=UTC_TIMESTAMP(3)),0) ready,
          MIN(q.available_at) next_at FROM agent_document_memory_queue q
          JOIN versions v ON v.id=q.version_id JOIN artifacts a ON a.id=v.artifact_id
          LEFT JOIN document_folders f ON f.id=a.folder_id
          WHERE a.project_id=? ${DOCUMENT_LIBRARY_FOLDER_SQL}`,
      [projectId],
    ),
    query(
      service.db,
      "SELECT MAX(updated_at) updated_at FROM agent_member_summaries WHERE project_id=?",
      [projectId],
    ),
    query(
      service.db,
      `SELECT MAX(s.updated_at) updated_at FROM agent_document_summaries s
          JOIN versions v ON v.id=s.version_id JOIN artifacts a ON a.id=v.artifact_id
          LEFT JOIN document_folders f ON f.id=a.folder_id
          WHERE a.project_id=? ${DOCUMENT_LIBRARY_FOLDER_SQL}`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT s.id,s.session_id,s.task,s.thread_id,s.status,s.last_error,s.last_started_at,s.last_finished_at,
          s.updated_at,s.context_stats,s.compact_status,s.compact_error,s.compact_result,t.title thread_title
          FROM agent_project_sessions s LEFT JOIN threads t ON t.id=s.thread_id WHERE s.project_id=?`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT t.id,t.title,t.status,t.created_at,t.archived_at,
          COALESCE((SELECT s.convergence_state FROM agent_sessions s WHERE s.thread_id=t.id),'active') convergence_state,
          COALESCE((SELECT s.steering_epoch FROM agent_sessions s WHERE s.thread_id=t.id),0) steering_epoch,
          (SELECT s.wait_reason FROM agent_sessions s WHERE s.thread_id=t.id) wait_reason,
          (SELECT ar.progress FROM assistant_replies ar JOIN messages arm ON arm.id=ar.message_id
            WHERE arm.thread_id=t.id AND ar.status IN ('queued','running') ORDER BY arm.sequence DESC LIMIT 1) current_action,
          (SELECT ae.tool FROM agent_events ae JOIN messages aem ON aem.id=ae.message_id
            WHERE aem.thread_id=t.id ORDER BY ae.id DESC LIMIT 1) react_phase,
          (SELECT LEFT(rm.body,500) FROM messages rm WHERE rm.thread_id=t.id AND rm.source='assistant'
            ORDER BY rm.sequence DESC LIMIT 1) recent_message,
          COALESCE((SELECT COUNT(*) FROM agent_requests q JOIN messages m ON m.id=q.message_id
            WHERE m.thread_id=t.id AND q.status='queued'),0) queued_requests,
          COALESCE((SELECT COUNT(*) FROM agent_requests q JOIN messages m ON m.id=q.message_id
            WHERE m.thread_id=t.id AND q.status='running'),0) running_requests,
          ((SELECT COUNT(*) FROM agent_task_execution_runs er JOIN agent_tasks et ON et.id=er.task_id
            WHERE et.origin_thread_id=t.id AND er.executor_type='child_agent' AND er.status IN ('running','waiting'))
          +(SELECT COUNT(*) FROM assistant_replies ar JOIN messages am ON am.id=ar.message_id
            WHERE am.thread_id=t.id AND ar.execution_active=TRUE)) active_executors,
          COALESCE((SELECT MAX(COALESCE(q.first_response_at,m.created_at)) FROM messages m
            LEFT JOIN agent_requests q ON q.message_id=m.id WHERE m.thread_id=t.id),t.created_at) last_activity_at
          FROM threads t
          WHERE t.project_id=? AND t.status='active'
          ORDER BY last_activity_at DESC, t.id`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT r.message_id task_id,t.id thread_id,t.title thread_title,
          m.author_id,u.name requested_by,LEFT(m.body,280) goal,r.status,r.progress,
          r.agent_slot,r.execution_active,m.created_at started_at,r.finished_at,
          e.tool last_action,e.status last_action_status,e.created_at last_action_at,
          (SELECT COUNT(*) FROM agent_task_updates tu WHERE tu.task_message_id=r.message_id) update_count,
          cs.context_stats,cs.compact_status,cs.compact_error,cs.compact_result
          FROM assistant_replies r JOIN messages m ON m.id=r.message_id
          JOIN threads t ON t.id=m.thread_id JOIN users u ON u.id=m.author_id
          LEFT JOIN agent_events e ON e.id=(SELECT MAX(ae.id) FROM agent_events ae WHERE ae.message_id=r.message_id)
          LEFT JOIN agent_child_sessions cs ON cs.message_id=r.message_id
          WHERE t.project_id=? AND (r.agent_slot IS NOT NULL OR r.execution_active=TRUE)
          ORDER BY r.execution_active DESC,m.created_at DESC LIMIT 100`,
      [projectId],
    ),
    taskExecutionSnapshot(service.db, projectId),
    query(
      service.db,
      `SELECT e.id,e.message_id,e.agent_session_id,e.tool,e.status,e.created_at,e.finished_at,
          m.thread_id,t.title thread_title,s.session_id xiaoxiang_id,LEFT(e.input,16000) input
          FROM agent_events e JOIN messages m ON m.id=e.message_id
          JOIN threads t ON t.id=m.thread_id LEFT JOIN agent_sessions s ON s.thread_id=m.thread_id
          WHERE t.project_id=? ORDER BY e.id DESC LIMIT 300`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT j.id,j.thread_id,j.scope,j.status,j.error,j.created_at,j.started_at,j.finished_at,
          t.title thread_title, JSON_LENGTH(JSON_EXTRACT(j.result,'$.documents')) document_count
          FROM document_organization_jobs j LEFT JOIN threads t ON t.id=j.thread_id
          WHERE j.project_id=? ORDER BY j.created_at DESC LIMIT 20`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT MAX(finished_at) last_at FROM document_organization_jobs
          WHERE project_id=? AND status='completed'`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT id,title,archived_at,JSON_UNQUOTE(JSON_EXTRACT(archive_snapshot,'$.conclusion')) conclusion
          FROM threads WHERE project_id=? AND status='archived' ORDER BY archived_at DESC LIMIT 20`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT w.id,w.status,w.error,w.created_at,w.updated_at,w.finished_at,
          JSON_UNQUOTE(JSON_EXTRACT(w.plan,'$.conclusion')) conclusion,t.title
          FROM iteration_archive_workflows w JOIN threads t ON t.id=w.thread_id
          WHERE t.project_id=? ORDER BY w.created_at DESC LIMIT 40`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT MAX(archived_at) last_at FROM threads WHERE project_id=? AND status='archived'`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT id,task,thread_id,trigger_source,status,agent_called,had_updates,item_count,error,created_at,started_at,finished_at
          FROM agent_laoweng_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 80`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT task,MAX(finished_at) last_at FROM agent_laoweng_runs
          WHERE project_id=? AND status='completed' GROUP BY task`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT s.thread_id,s.context_stats,s.compact_status,s.compact_error,s.compact_result
          FROM agent_sessions s JOIN threads t ON t.id=s.thread_id WHERE t.project_id=?`,
      [projectId],
    ),
  ]);
  const humanAgents = await query(
    service.db,
    `SELECT u.id member_id,u.name,CASE WHEN c.id IS NULL THEN 0 ELSE 1 END local_executor_configured,CASE WHEN c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) THEN 1 ELSE 0 END local_executor_online,c.id local_executor_id FROM members m JOIN users u ON u.id=m.user_id ${preferredLocalExecutorJoin()} WHERE m.project_id=?`,
    [projectId, projectId],
  );
  const memberMemory = memberQueue[0] || {};
  const documentMemoryRow = documentQueue[0] || {};
  const documentSummaryRow = documentSummary[0] || {};
  const documentMemory = {
    pending: Number(documentMemoryRow.pending || 0),
    ready: Number(documentMemoryRow.ready || 0),
    next_at: documentMemoryRow.next_at || null,
  };
  const latest = (...values) =>
    values.filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
  const memberRunLast = laowengRunLast.find((row) => row.task === "member_memory")?.last_at || null;
  const documentRunLast = latest(
    ...laowengRunLast
      .filter((row) =>
        ["document_memory", "project_document_memory", "iteration_document_memory"].includes(
          row.task,
        ),
      )
      .map((row) => row.last_at),
  );
  const mapLaowengRun = (row) => ({
    id: row.id,
    task: row.task,
    thread_id: row.thread_id || null,
    trigger_source: row.trigger_source,
    status: row.status,
    agent_called: !!Number(row.agent_called),
    had_updates: !!Number(row.had_updates),
    item_count: row.item_count == null ? null : Number(row.item_count),
    error: row.error || null,
    created_at: row.created_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
  });
  const mapSession = (row) => ({
    id: row.id,
    task: row.task,
    threadId: row.thread_id || null,
    threadTitle: row.thread_title || null,
    sessionId: row.session_id || null,
    sessionStatus: row.status || "idle",
    lastError: row.last_error || null,
    lastStartedAt: row.last_started_at || null,
    lastFinishedAt: row.last_finished_at || null,
    contextUsage: contextUsage(row, [], []),
  });
  const headingSession = [...laowengSessions].sort((left, right) => {
    const running = (value) => (value.status === "running" ? 1 : 0);
    if (running(right) !== running(left)) return running(right) - running(left);
    return (
      new Date(right.last_finished_at || right.last_started_at || 0).getTime() -
      new Date(left.last_finished_at || left.last_started_at || 0).getTime()
    );
  })[0];
  const archiveRuns = laowengRuns.filter(
    (row) => row.task === "iteration_archive" || row.task === "thread_archive",
  );
  const archiveSession =
    laowengSessions.find((session) => session.task === "iteration_archive" && !session.thread_id) ||
    laowengSessions.find((session) => session.task === "iteration_archive") ||
    {};
  return {
    generatedAt: new Date().toISOString(),
    models: {
      knowledge: modelSummary("knowledge"),
      // Production inference has two routes: 老翁 knowledge and the shared
      // coordinator/子 Agent runtime. Keep the legacy coordinator/executor keys
      // for older clients, but expose the shared route explicitly.
      runtime: modelSummary("coordinator"),
      coordinator: modelSummary("coordinator"),
      executor: modelSummary("executor"),
    },
    knowledge: {
      sessionId: headingSession?.session_id || null,
      sessionStatus: headingSession?.status || "idle",
      lastTask: headingSession?.task || null,
      lastError: headingSession?.last_error || null,
      lastStartedAt: headingSession?.last_started_at || null,
      lastFinishedAt: headingSession?.last_finished_at || null,
      sessions: laowengSessions.map(mapSession),
      memberPending: Number(memberMemory.pending || 0),
      documentPending: Number(documentMemory.pending || 0),
      ready: Number(memberMemory.ready || 0) + Number(documentMemory.ready || 0),
      nextAt:
        [memberMemory.next_at, documentMemory.next_at]
          .filter(Boolean)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || null,
      lastUpdatedAt: latest(
        memberSummary[0]?.updated_at,
        documentSummaryRow.updated_at,
        memberRunLast,
        documentRunLast,
      ),
      memberLastAt: latest(memberSummary[0]?.updated_at, memberRunLast),
      memberNextAt: memberMemory.next_at || null,
      documentLastAt: latest(documentSummaryRow.updated_at, documentRunLast),
      documentNextAt: documentMemory.next_at || null,
      projectDocumentPending: Number(documentMemory.pending || 0),
      projectDocumentLastAt: latest(documentSummaryRow.updated_at, documentRunLast),
      projectDocumentNextAt: documentMemory.next_at || null,
      iterationDocumentPending: 0,
      iterationDocumentLastAt: null,
      iterationDocumentNextAt: null,
      memberRuns: laowengRuns.filter((row) => row.task === "member_memory").map(mapLaowengRun),
      projectDocumentRuns: [],
      iterationDocumentRuns: [],
      documentRuns: laowengRuns
        .filter(
          (row) =>
            row.task === "document_memory" ||
            row.task === "project_document_memory" ||
            row.task === "iteration_document_memory",
        )
        .map(mapLaowengRun),
      organizationLastAt: organizationLast[0]?.last_at || null,
      organizationJobs: organizationJobs.map((row) => ({
        id: row.id,
        thread_id: row.thread_id,
        thread_title: row.thread_title || null,
        scope: row.scope,
        status: row.status,
        error: row.error || null,
        document_count: row.document_count == null ? null : Number(row.document_count),
        created_at: row.created_at,
        started_at: row.started_at,
        finished_at: row.finished_at,
      })),
      archiveLastAt: latest(
        archiveLast[0]?.last_at,
        ...archiveRuns.map((row) => row.finished_at || row.started_at),
      ),
      archives: archives.map((row) => ({
        id: row.id,
        title: row.title,
        archived_at: row.archived_at,
        conclusion: row.conclusion || "",
        contextUsage: contextUsage(archiveSession, [], []),
        sessionStatus: archiveSession.status || "idle",
        runs: archiveRuns.filter((run) => run.thread_id === row.id).map(mapLaowengRun),
      })),
      archiveHistory: [
        ...archivePlans.map((row) => ({
          id: `plan:${row.id}`,
          kind: "plan",
          title: row.title,
          occurredAt: row.finished_at || row.updated_at || row.created_at,
          conclusion: row.conclusion || "",
          status: row.status,
          error: row.error || null,
        })),
        ...archives.map((row) => ({
          id: `record:${row.id}`,
          kind: "record",
          title: row.title,
          occurredAt: row.archived_at,
          conclusion: row.conclusion || "",
          status: "archived",
          error: null,
        })),
      ].sort((left, right) => new Date(right.occurredAt || 0) - new Date(left.occurredAt || 0)),
    },
    coordinators: coordinators.map((row) => {
      const session = xiaoxiangSessions.find((item) => item.thread_id === row.id) || {};
      return {
        ...row,
        queued_requests: Number(row.queued_requests),
        running_requests: Number(row.running_requests),
        active_executors: Number(row.active_executors),
        contextUsage: contextUsage(session, [], []),
      };
    }),
    humanAgents: humanAgents.map((row) => ({
      member_id: row.member_id,
      name: row.name,
      nodes: [
        { executor_type: "human_self", executor_id: row.member_id, online: true },
        {
          executor_type: "human_local_executor",
          executor_id: row.local_executor_id,
          online: !!Number(row.local_executor_online),
          configured: !!Number(row.local_executor_configured),
        },
      ],
    })),
    taskPool: taskExecutions,
    eventLog: eventLog.map((row) => {
      let args = {};
      try {
        args = typeof row.input === "string" ? JSON.parse(row.input) : row.input || {};
      } catch {}
      const action = ["thinking", "assistant_text", "assistant_final"].includes(row.tool)
        ? row.tool === "thinking"
          ? "思考"
          : "正文"
        : formatAgentAction(row.tool, args);
      return {
        id: String(row.id),
        message_id: row.message_id,
        thread_id: row.thread_id,
        thread_title: row.thread_title,
        agent_session_id: row.agent_session_id,
        agent_type:
          row.agent_session_id && row.agent_session_id !== row.xiaoxiang_id
            ? "child_agent"
            : "xiaoxiang",
        tool: row.tool,
        action,
        status: row.status,
        created_at: row.created_at,
        finished_at: row.finished_at,
        duration_ms: row.finished_at
          ? Math.max(0, new Date(row.finished_at).getTime() - new Date(row.created_at).getTime())
          : null,
      };
    }),
    executors: [
      ...executors.map((row) => ({
        ...row,
        executor_type: "child_agent",
        update_count: Number(row.update_count),
        contextUsage: contextUsage(row, [], []),
      })),
      ...taskExecutions.map((row) => ({
        task_id: row.task_id,
        thread_id: row.origin_thread_id || null,
        thread_title: null,
        requested_by: row.source_user_id,
        goal: row.goal,
        status: row.task_status,
        task_status: row.task_status,
        run_status: row.run_status,
        progress: row.progress,
        agent_slot: null,
        execution_active: !!row.executor_id && ["running", "waiting"].includes(row.run_status),
        started_at: row.started_at,
        finished_at: row.finished_at,
        last_action: null,
        last_action_status: null,
        last_action_at: null,
        update_count: 0,
        executor_type: row.executor_type,
        executor_id: row.executor_id,
        persona: row.persona || null,
        target_type: row.target_type,
        target_id: row.target_id,
        task_type: row.task_type,
        source_type: row.source_type,
        created_by_type: row.created_by_type,
        created_by_id: row.created_by_id,
        claimed_by_type: row.claimed_by_type,
        claimed_by_id: row.claimed_by_id,
        result_summary: row.result_summary,
        artifact_refs: row.artifact_refs,
      })),
    ],
  };
}

/**
 * 轨迹「系统」步骤要展示的提示词和可用工具，必须与运行时真正下发的那份同源，不能在接口里另写：
 * A 段提示词 = 共享底线（dsh-layer/cothread-system-prompt.mjs 的 cothread:system）
 * + 角色段（同插件的 cothread:agent-role，取值来自 SYSTEM_PROMPTS）；
 * 工具名单来自同一份能力配置的 allowedTools，execute 闸门就是按它校验的。
 * 取不到就省略字段，不凭印象补。
 */
/** context_notice 的 output 是 JSON：取出 kind 供轨迹行标来源。 */
/** 上下文行预览：有块名就列块名，没有就退回注入原文。 */
function contextPreview(input, output) {
  try {
    const meta = JSON.parse(output || "{}");
    const names = Array.isArray(meta?.blocks)
      ? meta.blocks.map((block) => String(block?.name || "")).filter(Boolean)
      : [];
    // 增量轮次只补变化的资料：行首标出来，免得和全量注入混淆。
    const prefix = meta?.delta ? "增量注入" : "";
    if (meta?.summary && names.length)
      return `${prefix ? prefix + " · " : ""}${meta.summary}：${names.join(" · ")}`;
  } catch {
    // output 不是 JSON 就按原文显示
  }
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim();
}

function noticeKindOf(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return typeof parsed.kind === "string" && parsed.kind ? parsed.kind : null;
  } catch {
    return null;
  }
}

function scopeAgentContext(level) {
  const rolePrompt = SYSTEM_PROMPTS[level]?.prompt;
  // 和 DSH 一样按「段」交代系统提示词是怎么拼起来的：名称、顺序、来源、正文。
  const systemSections = [
    {
      name: "cothread:system",
      order: 790,
      source: "dsh-layer/cothread-system-prompt.mjs",
      text: COTHREAD_SYSTEM_TEXT,
    },
    ...(rolePrompt
      ? [
          {
            name: "cothread:agent-role",
            order: 800,
            source: `SYSTEM_PROMPTS.${level}`,
            text: rolePrompt,
          },
        ]
      : []),
  ];
  return {
    ...(rolePrompt ? { systemPrompt: [COTHREAD_SYSTEM_TEXT, rolePrompt].join("\n\n") } : {}),
    systemSections,
    tools: capabilityProfile(level).allowedTools,
  };
}

/**
 * assistant_replies 只按「触发消息」保存整轮 usage_stats，没有逐事件用量。
 * 因此只把整轮用量挂到该轮收尾的 assistant_final 上，其余事件不挂：
 * 前端按事件累加 tokens，重复挂载会把同一轮算多次。关联不上就省略。
 */
function eventUsageFromReply(stats) {
  let value = stats;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const usage = {};
  for (const key of [
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "settingsVersion",
    "calls",
  ])
    if (Number.isSafeInteger(value[key]) && value[key] >= 0) usage[key] = value[key];
  if (typeof value.model === "string" && value.model) usage.model = value.model.slice(0, 60);
  if (typeof value.reasoningEffort === "string" && value.reasoningEffort)
    usage.reasoningEffort = value.reasoningEffort.slice(0, 20);
  // usage_stats 里没有 modelMs，宁缺勿造。
  return Object.keys(usage).length ? usage : null;
}

async function replyUsageByMessage(db, messageIds) {
  const ids = [...new Set(messageIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await query(
    db,
    `SELECT message_id,usage_stats FROM assistant_replies
      WHERE message_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  return new Map(
    rows.filter((row) => row.usage_stats).map((row) => [row.message_id, row.usage_stats]),
  );
}

export async function agentLogsOperation(
  service,
  user,
  scopeType,
  scopeId,
  { task, before = null, limit = 60 } = {},
) {
  // 轨迹分页：默认最近一页；before 是最老一条事件的 id，继续往前取历史。
  const pageSize = Math.min(Math.max(Number(limit) || 60, 10), 200);
  const cursor = before ? Number(before) : null;
  const hasCursor = Number.isSafeInteger(cursor) && cursor > 0;
  let hasMore = false;
  const duration = (row) =>
    row.finished_at
      ? Math.max(0, new Date(row.finished_at).getTime() - new Date(row.created_at).getTime())
      : null;
  // 任务类工具（派发子 Agent、追问进度、转交、重安排）入参只有任务 id；
  // 直接显示 UUID 看不懂，这里批量取任务标题，标签用标题代替 id。
  let taskTitles = new Map();
  const labelFor = (row) => {
    if (row.agent_type === "laoweng")
      return {
        action:
          {
            prepare_context: "准备项目上下文",
            start_harness: "启动 DSH 会话",
            compact_context: "压缩维护上下文",
            model_run: "执行维护任务",
            validate_result: "校验结构化结果",
            save_checkpoint: "保存会话检查点",
          }[row.tool] || row.tool,
        target: "",
      };
    let args = {};
    try {
      args = typeof row.input === "string" ? JSON.parse(row.input) : row.input || {};
    } catch {}
    // 子 Agent 的注入与系统提示词：和群聊同一种叫法，别落到「执行任务」。
    if (row.tool === "system_prompt") return { action: "系统提示词", target: "" };
    if (row.tool === "context_notice") return { action: "注入上下文", target: "" };
    if (["thinking", "assistant_text", "assistant_final"].includes(row.tool))
      return {
        action: row.tool === "thinking" ? "思考" : "正文",
        target: "",
      };
    const taskId = row.task_id || (typeof args.taskId === "string" ? args.taskId : "");
    const title = taskId ? taskTitles.get(String(taskId)) : "";
    // 有标题时把 id 从入参里摘掉，避免「启动子 Agent <uuid>」这种标签。
    const labeled = title
      ? describeAgentAction(row.tool, { ...args, taskId: undefined })
      : describeAgentAction(row.tool, args);
    return { action: labeled.action, target: title || labeled.target || "" };
  };
  const collectInputs = async (rows) => {
    const seen = new Set();
    const inputs = [];
    for (const row of [...rows].reverse()) {
      if (!row.message_id || !row.user_created_at || seen.has(row.message_id)) continue;
      seen.add(row.message_id);
      let refs = row.user_refs;
      if (typeof refs === "string") {
        try {
          refs = JSON.parse(refs);
        } catch {
          refs = [];
        }
      }
      inputs.push({
        id: `user:${row.message_id}`,
        messageId: row.message_id,
        createdAt: row.user_created_at,
        preview: String(row.user_preview || "")
          .replace(/\s+/g, " ")
          .trim(),
        body: String(row.user_body ?? ""),
        // 这一轮用哪种对话模式（default/chat/miniprogram/cloudbase）；没有 agent_requests 记录时为 null。
        dialogueMode: row.dialogue_mode || null,
        files: [],
        // 老翁维护任务的输入是调度给它的任务，不是用户提问；再区分定时自动与手动「立即整理」。
        ...(row.agent_type === "laoweng"
          ? { from: row.trigger_source === "user" ? "manual" : "scheduled" }
          : {}),
        refIds: Array.isArray(refs) ? refs.map(String) : [],
      });
    }
    // 附件是按版本 id 引用的，批量取回名字与类型，预览里才能列出文件。
    const refIds = [...new Set(inputs.flatMap((input) => input.refIds))];
    if (refIds.length) {
      const files = await query(
        service.db,
        `SELECT id, filename, mime, byte_size FROM versions WHERE id IN (${refIds.map(() => "?").join(",")})`,
        refIds,
      );
      const byId = new Map(
        files.map((file) => [
          String(file.id),
          {
            id: String(file.id),
            name: String(file.filename || ""),
            mime: file.mime ? String(file.mime) : null,
            size: file.byte_size == null ? null : Number(file.byte_size),
          },
        ]),
      );
      for (const input of inputs)
        input.files = input.refIds.map((id) => byId.get(id)).filter(Boolean);
    }
    for (const input of inputs) delete input.refIds;
    return inputs;
  };
  /**
   * 子 Agent 的输入是小祥写的任务书（TASK_ID + TaskBrief），不是群里的用户消息。
   * 派活时把任务书落成了 context_notice 事件，这里取最近一条作为「输入」行。
   */
  const collectTaskInputs = async (taskId) => {
    const candidates = await query(
      service.db,
      `SELECT id,message_id,input,output,created_at FROM agent_events
        WHERE agent_task_id=? AND tool='context_notice' ORDER BY id DESC LIMIT 5`,
      [taskId],
    );
    const trace = candidates.find((row) => {
      try {
        return JSON.parse(row.output || "{}")?.kind === "cothread-child-context";
      } catch {
        return false;
      }
    });
    if (!trace) return [];
    const body = String(trace.input || "");
    return [
      {
        id: `task:${taskId}`,
        messageId: trace.message_id,
        createdAt: trace.created_at,
        preview: body.split("\n")[0].slice(0, 200),
        body,
        dialogueMode: null,
        files: [],
        // 轨迹据此把这一行标成「小祥派活」而不是「用户」。
        from: "coordinator",
      },
    ];
  };
  const taskEventScope = `EXISTS (SELECT 1 FROM agent_task_execution_runs owner_run
          WHERE owner_run.task_id=? AND owner_run.executor_type='child_agent'
            AND owner_run.executor_id=e.agent_session_id)
          AND (e.agent_task_id=? OR (e.agent_task_id IS NULL AND EXISTS (
            SELECT 1 FROM agent_task_execution_runs timed_run WHERE timed_run.task_id=?
              AND timed_run.executor_type='child_agent' AND timed_run.executor_id=e.agent_session_id
              AND e.created_at>=COALESCE(timed_run.started_at,timed_run.created_at)
              AND e.created_at<=COALESCE(timed_run.finished_at,UTC_TIMESTAMP(3)))))`;
  let titleText;
  let rows;
  // 只有 thread 作用域能按触发消息关联到小祥那一轮的整轮用量。
  let replyUsage = new Map();
  if (scopeType === "project") {
    const project = await service.project(user, scopeId);
    const scopedTask = normalizeLaowengTask(task);
    if (!LAOWENG_MAINTENANCE_TASKS.includes(scopedTask)) fail(400, "请指定维护任务");
    titleText = `${project.name} · ${laowengTaskLabel(scopedTask)}`;
    rows = await query(
      service.db,
      `SELECT e.id,e.agent_session_id,e.task,e.thread_id,e.phase tool,e.status,e.summary,e.trigger_source,e.created_at,e.finished_at,e.error,
        a.id visual_artifact_id
        FROM agent_project_events e LEFT JOIN agent_visual_artifacts a ON a.agent_project_event_id=e.id
        WHERE e.project_id=? AND e.task=? ORDER BY e.id DESC LIMIT 300`,
      [scopeId, scopedTask],
    );
    const laowengRunOf = new Map();
    const laowengFirstIds = new Set();
    const laowengSeenRuns = new Set();
    let laowengRun = 0;
    for (const row of [...rows].sort((left, right) => Number(left.id) - Number(right.id))) {
      if (row.tool === "prepare_context") laowengRun += 1;
      const runId = String(Math.max(laowengRun, 1));
      laowengRunOf.set(String(row.id), runId);
      if (!laowengSeenRuns.has(runId)) {
        laowengSeenRuns.add(runId);
        laowengFirstIds.add(String(row.id));
      }
    }
    rows = rows.map((row) => {
      const messageId = `laoweng:${laowengRunOf.get(String(row.id))}`;
      return {
        ...row,
        agent_type: "laoweng",
        task_id: null,
        message_id: messageId,
        thread_id: null,
        user_preview: laowengTaskLabel(row.task),
        user_created_at: laowengFirstIds.has(String(row.id)) ? row.created_at : null,
      };
    });
  } else if (scopeType === "thread") {
    const thread = await service.thread(user, scopeId);
    titleText = `${thread.title} · 小祥轨迹`;
    // 轨迹按迭代聚合，不按会话过滤：小祥每次运行都会换一个 DSH session_id，
    // agent_sessions.session_id 只是当前那一个，拿它当条件会让轨迹恒为空。
    // 子 Agent 的事件也挂在同一条触发消息上（coordinator 写库时用 job.message_id），
    // 必须排除它们自己的会话，否则小祥轨迹里会混进 cloudbase_* / sandbox_* 等子 Agent 工具记录：
    // 子 Agent 会话登记在 agent_child_sessions，执行期还记录在 agent_task_execution_runs.executor_id。
    // 小祥自己 tool='child_agent' 的派发记录用的是小祥会话，不会被这两条排除掉。
    rows = await query(
      service.db,
      `SELECT e.id,e.agent_session_id,e.agent_task_id task_id,e.tool,e.status,
        e.created_at,e.finished_at,e.input,e.message_id,e.turn_id,m.thread_id,LEFT(m.body,240) user_preview,m.body user_body,m.refs user_refs,m.created_at user_created_at,
        q.dialogue_mode dialogue_mode,
        a.id visual_artifact_id,
        CASE WHEN e.tool IN ('assistant_text','assistant_final') THEN LEFT(e.output,240) END output_preview,
        CASE WHEN e.tool='context_notice' THEN LEFT(e.input,240) END notice_input,
        CASE WHEN e.tool='context_notice' THEN e.output END notice_output
        FROM agent_events e JOIN messages m ON m.id=e.message_id
        LEFT JOIN agent_requests q ON q.message_id=m.id
        LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id
        WHERE m.thread_id=?
          AND NOT EXISTS (SELECT 1 FROM agent_child_sessions child_session
            WHERE child_session.session_id=e.agent_session_id)
          AND NOT EXISTS (SELECT 1 FROM agent_task_execution_runs child_run
            WHERE child_run.executor_type='child_agent' AND child_run.executor_id=e.agent_session_id)
          ${hasCursor ? "AND e.id<?" : ""}
        ORDER BY e.id DESC LIMIT ${pageSize + 1}`,
      hasCursor ? [scopeId, cursor] : [scopeId],
    );
    hasMore = rows.length > pageSize;
    rows = rows.slice(0, pageSize);
    replyUsage = await replyUsageByMessage(
      service.db,
      rows.map((row) => row.message_id),
    );
    // 轮次 = 轮锚（turn_id，旧数据回落到触发消息）在迭代里的顺序：不受分页影响，翻页不会整体重编号。
    const anchorRows = await query(
      service.db,
      `SELECT COALESCE(e.turn_id,e.message_id) anchor, MIN(m.sequence) seq, MIN(e.created_at) at
        FROM agent_events e JOIN messages m ON m.id=e.message_id
        WHERE m.thread_id=?
          AND NOT EXISTS (SELECT 1 FROM agent_child_sessions child_session
            WHERE child_session.session_id=e.agent_session_id)
          AND NOT EXISTS (SELECT 1 FROM agent_task_execution_runs child_run
            WHERE child_run.executor_type='child_agent' AND child_run.executor_id=e.agent_session_id)
        GROUP BY anchor ORDER BY seq, at`,
      [scopeId],
    );
    const turnOfAnchor = new Map(anchorRows.map((row, index) => [String(row.anchor), index + 1]));
    rows = rows.map((row) => {
      const anchor = String(row.turn_id || row.message_id);
      return {
        ...row,
        agent_type: "xiaoxiang",
        turn_key: anchor,
        turn_no: turnOfAnchor.get(anchor) ?? null,
      };
    });
  } else if (scopeType === "task") {
    const [task] = await query(
      service.db,
      "SELECT id,project_id,title FROM agent_tasks WHERE id=?",
      [scopeId],
    );
    if (!task) fail(404, "任务不存在");
    await service.member(user, task.project_id);
    titleText = `${task.title} · 子 Agent 轨迹`;
    rows = await query(
      service.db,
      `SELECT DISTINCT e.id,e.agent_session_id,? task_id,e.tool,e.status,
        e.created_at,e.finished_at,e.input,e.message_id,m.thread_id,LEFT(m.body,240) user_preview,m.body user_body,m.refs user_refs,m.created_at user_created_at,
        a.id visual_artifact_id,
        CASE WHEN e.tool IN ('assistant_text','assistant_final') THEN LEFT(e.output,240) END output_preview,
        CASE WHEN e.tool='context_notice' THEN LEFT(e.input,240) END notice_input,
        CASE WHEN e.tool='context_notice' THEN e.output END notice_output
        FROM agent_events e JOIN messages m ON m.id=e.message_id
        LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id
        WHERE ${taskEventScope}${hasCursor ? " AND e.id<?" : ""}
        ORDER BY e.id DESC LIMIT ${pageSize + 1}`,
      hasCursor
        ? [scopeId, scopeId, scopeId, scopeId, cursor]
        : [scopeId, scopeId, scopeId, scopeId],
    );
    hasMore = rows.length > pageSize;
    rows = rows.slice(0, pageSize);
    rows = rows.map((row) => ({ ...row, agent_type: "child_agent" }));
  } else fail(400, "未知日志作用域");
  const taskIds = [
    ...new Set(
      rows
        .map((row) => {
          if (row.task_id) return String(row.task_id);
          try {
            const args = typeof row.input === "string" ? JSON.parse(row.input) : row.input || {};
            return typeof args.taskId === "string" ? args.taskId : "";
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    ),
  ];
  if (taskIds.length) {
    const tasks = await query(
      service.db,
      `SELECT id,title FROM agent_tasks WHERE id IN (${taskIds.map(() => "?").join(",")})`,
      taskIds,
    );
    taskTitles = new Map(tasks.map((item) => [String(item.id), String(item.title || "")]));
  }
  // 作用域决定层次：老翁维护任务、小祥、子 Agent 各自取自己那份提示词与工具名单。
  const agentLevel =
    scopeType === "project" ? "laoweng" : scopeType === "thread" ? "xiaoxiang" : "child_agent";
  return {
    scopeType,
    scopeId,
    title: titleText,
    page: { hasMore, before: rows[rows.length - 1]?.id || null },
    ...scopeAgentContext(agentLevel),
    inputs: scopeType === "task" ? await collectTaskInputs(scopeId) : await collectInputs(rows),
    events: rows.map((row) => {
      const label = labelFor(row);
      // 整轮用量只落在收尾的 assistant_final 上，其它事件没有可关联的用量。
      const usage =
        row.tool === "assistant_final" ? eventUsageFromReply(replyUsage.get(row.message_id)) : null;
      const preview =
        row.agent_type === "laoweng"
          ? String(row.summary || "")
              .replace(/\s+/g, " ")
              .trim()
          : ["assistant_text", "assistant_final"].includes(row.tool)
            ? String(row.output_preview || "")
                .replace(/\s+/g, " ")
                .trim()
            : row.tool === "context_notice"
              ? contextPreview(row.notice_input, row.notice_output)
              : "";
      return {
        id: String(row.id),
        agentType: row.agent_type,
        agentSessionId: row.agent_session_id,
        taskId: row.task_id || null,
        messageId: row.message_id || null,
        turnKey: row.turn_key || null,
        threadId: row.thread_id || null,
        tool: row.tool,
        action: label.action,
        target: label.target || undefined,
        status: row.status,
        createdAt: row.created_at,
        finishedAt: row.finished_at,
        durationMs: duration(row),
        ...(usage ? { usage } : {}),
        ...(preview ? { preview } : {}),
        ...(row.turn_no ? { turn: row.turn_no } : {}),
        ...(row.tool === "context_notice" ? { noticeKind: noticeKindOf(row.notice_output) } : {}),
        ...(row.visual_artifact_id
          ? { screenshotUrl: `/api/agent-visual-artifacts/${row.visual_artifact_id}` }
          : {}),
        ...(row.agent_type === "laoweng" && row.task ? { task: row.task } : {}),
        ...(row.agent_type === "laoweng" && row.error ? { error: row.error } : {}),
      };
    }),
  };
}

export async function agentLogEventOperation(service, user, scopeType, scopeId, eventId) {
  const id = z.string().regex(/^\d+$/).parse(String(eventId));
  if (scopeType === "project") {
    await service.project(user, scopeId);
    const [event] = await query(
      service.db,
      `SELECT e.id,e.phase tool,e.status,e.error,e.created_at,e.finished_at,a.id visual_artifact_id
         FROM agent_project_events e LEFT JOIN agent_visual_artifacts a ON a.agent_project_event_id=e.id
         WHERE e.id=? AND e.project_id=?`,
      [id, scopeId],
    );
    if (!event) fail(404, "执行记录不存在");
    return {
      ...event,
      ...(event.visual_artifact_id
        ? { screenshotUrl: `/api/agent-visual-artifacts/${event.visual_artifact_id}` }
        : {}),
    };
  }
  if (scopeType === "thread") {
    await service.thread(user, scopeId, false, service.db, { display: true });
    const [event] = await query(
      service.db,
      `SELECT e.*,a.id visual_artifact_id FROM agent_events e JOIN messages m ON m.id=e.message_id
         LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id WHERE e.id=? AND m.thread_id=?`,
      [id, scopeId],
    );
    if (!event) fail(404, "执行记录不存在");
    return {
      ...event,
      ...(event.visual_artifact_id
        ? { screenshotUrl: `/api/agent-visual-artifacts/${event.visual_artifact_id}` }
        : {}),
    };
  }
  if (scopeType === "task") {
    const [task] = await query(service.db, "SELECT id,project_id FROM agent_tasks WHERE id=?", [
      scopeId,
    ]);
    if (!task) fail(404, "任务不存在");
    await service.member(user, task.project_id);
    const [event] = await query(
      service.db,
      `SELECT e.*,a.id visual_artifact_id FROM agent_events e
        LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id WHERE e.id=? AND EXISTS (SELECT 1 FROM agent_task_execution_runs owner_run
          WHERE owner_run.task_id=? AND owner_run.executor_type='child_agent'
            AND owner_run.executor_id=e.agent_session_id)
          AND (e.agent_task_id=? OR (e.agent_task_id IS NULL AND EXISTS (
            SELECT 1 FROM agent_task_execution_runs timed_run WHERE timed_run.task_id=?
              AND timed_run.executor_type='child_agent' AND timed_run.executor_id=e.agent_session_id
              AND e.created_at>=COALESCE(timed_run.started_at,timed_run.created_at)
              AND e.created_at<=COALESCE(timed_run.finished_at,UTC_TIMESTAMP(3)))))`,
      [id, scopeId, scopeId, scopeId],
    );
    if (!event) fail(404, "执行记录不存在");
    return {
      ...event,
      ...(event.visual_artifact_id
        ? { screenshotUrl: `/api/agent-visual-artifacts/${event.visual_artifact_id}` }
        : {}),
    };
  }
  fail(400, "未知日志作用域");
}
