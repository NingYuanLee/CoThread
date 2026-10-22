import { contextUsage } from "../shared/context.js";
import { modelConfig } from "./model-config.js";
import { z } from "zod/v3";
import { query } from "./db.js";
import { taskExecutionSnapshot } from "./task-pool-activity.js";
import {
  describeAgentAction,
  formatAgentAction,
  L1_MAINTENANCE_TASKS,
  l1TaskLabel,
  normalizeL1Task,
} from "../shared/agent-label.js";
import { DOCUMENT_LIBRARY_FOLDER_SQL } from "./documents/index.js";
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
    l1Sessions,
    coordinators,
    executors,
    taskExecutions,
    eventLog,
    organizationJobs,
    organizationLast,
    archives,
    archivePlans,
    archiveLast,
    l1Runs,
    l1RunLast,
    l2Sessions,
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
            WHERE et.origin_thread_id=t.id AND er.executor_type='dsh_l3' AND er.status IN ('running','waiting'))
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
          m.thread_id,t.title thread_title,s.session_id l2_session_id,LEFT(e.input,16000) input
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
          FROM agent_l1_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 80`,
      [projectId],
    ),
    query(
      service.db,
      `SELECT task,MAX(finished_at) last_at FROM agent_l1_runs
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
  const memberRunLast = l1RunLast.find((row) => row.task === "member_memory")?.last_at || null;
  const documentRunLast = latest(
    ...l1RunLast
      .filter((row) =>
        ["document_memory", "project_document_memory", "iteration_document_memory"].includes(
          row.task,
        ),
      )
      .map((row) => row.last_at),
  );
  const mapL1Run = (row) => ({
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
  const headingSession = [...l1Sessions].sort((left, right) => {
    const running = (value) => (value.status === "running" ? 1 : 0);
    if (running(right) !== running(left)) return running(right) - running(left);
    return (
      new Date(right.last_finished_at || right.last_started_at || 0).getTime() -
      new Date(left.last_finished_at || left.last_started_at || 0).getTime()
    );
  })[0];
  const archiveRuns = l1Runs.filter(
    (row) => row.task === "iteration_archive" || row.task === "thread_archive",
  );
  const archiveSession =
    l1Sessions.find((session) => session.task === "iteration_archive" && !session.thread_id) ||
    l1Sessions.find((session) => session.task === "iteration_archive") ||
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
      sessions: l1Sessions.map(mapSession),
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
      memberRuns: l1Runs.filter((row) => row.task === "member_memory").map(mapL1Run),
      projectDocumentRuns: [],
      iterationDocumentRuns: [],
      documentRuns: l1Runs
        .filter(
          (row) =>
            row.task === "document_memory" ||
            row.task === "project_document_memory" ||
            row.task === "iteration_document_memory",
        )
        .map(mapL1Run),
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
        runs: archiveRuns.filter((run) => run.thread_id === row.id).map(mapL1Run),
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
      const session = l2Sessions.find((item) => item.thread_id === row.id) || {};
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
          row.agent_session_id && row.agent_session_id !== row.l2_session_id ? "dsh_l3" : "l2",
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
        executor_type: "dsh_l3",
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

export async function agentLogsOperation(service, user, scopeType, scopeId, { task } = {}) {
  const duration = (row) =>
    row.finished_at
      ? Math.max(0, new Date(row.finished_at).getTime() - new Date(row.created_at).getTime())
      : null;
  const labelFor = (row) => {
    if (row.agent_type === "l1")
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
    if (["thinking", "assistant_text", "assistant_final"].includes(row.tool))
      return {
        action: row.tool === "thinking" ? "思考" : "正文",
        target: "",
      };
    const label = describeAgentAction(row.tool, args);
    return { action: formatAgentAction(row.tool, args), target: label.target || "" };
  };
  const collectInputs = (rows) => {
    const seen = new Set();
    const inputs = [];
    for (const row of [...rows].reverse()) {
      if (!row.message_id || !row.user_created_at || seen.has(row.message_id)) continue;
      seen.add(row.message_id);
      inputs.push({
        id: `user:${row.message_id}`,
        messageId: row.message_id,
        createdAt: row.user_created_at,
        preview: String(row.user_preview || "")
          .replace(/\s+/g, " ")
          .trim(),
      });
    }
    return inputs;
  };
  const taskEventScope = `EXISTS (SELECT 1 FROM agent_task_execution_runs owner_run
          WHERE owner_run.task_id=? AND owner_run.executor_type='dsh_l3'
            AND owner_run.executor_id=e.agent_session_id)
          AND (e.agent_task_id=? OR (e.agent_task_id IS NULL AND EXISTS (
            SELECT 1 FROM agent_task_execution_runs timed_run WHERE timed_run.task_id=?
              AND timed_run.executor_type='dsh_l3' AND timed_run.executor_id=e.agent_session_id
              AND e.created_at>=COALESCE(timed_run.started_at,timed_run.created_at)
              AND e.created_at<=COALESCE(timed_run.finished_at,UTC_TIMESTAMP(3)))))`;
  let titleText;
  let rows;
  if (scopeType === "project") {
    const project = await service.project(user, scopeId);
    const scopedTask = normalizeL1Task(task);
    if (!L1_MAINTENANCE_TASKS.includes(scopedTask)) fail(400, "请指定维护任务");
    titleText = `${project.name} · ${l1TaskLabel(scopedTask)}`;
    rows = await query(
      service.db,
      `SELECT e.id,e.agent_session_id,e.task,e.thread_id,e.phase tool,e.status,e.created_at,e.finished_at,e.error,
        a.id visual_artifact_id
        FROM agent_project_events e LEFT JOIN agent_visual_artifacts a ON a.agent_project_event_id=e.id
        WHERE e.project_id=? AND e.task=? ORDER BY e.id DESC LIMIT 300`,
      [scopeId, scopedTask],
    );
    const l1RunOf = new Map();
    const l1FirstIds = new Set();
    const l1SeenRuns = new Set();
    let l1Run = 0;
    for (const row of [...rows].sort((left, right) => Number(left.id) - Number(right.id))) {
      if (row.tool === "prepare_context") l1Run += 1;
      const runId = String(Math.max(l1Run, 1));
      l1RunOf.set(String(row.id), runId);
      if (!l1SeenRuns.has(runId)) {
        l1SeenRuns.add(runId);
        l1FirstIds.add(String(row.id));
      }
    }
    rows = rows.map((row) => {
      const messageId = `l1:${l1RunOf.get(String(row.id))}`;
      return {
        ...row,
        agent_type: "l1",
        task_id: null,
        message_id: messageId,
        thread_id: null,
        user_preview: l1TaskLabel(row.task),
        user_created_at: l1FirstIds.has(String(row.id)) ? row.created_at : null,
      };
    });
  } else if (scopeType === "thread") {
    const thread = await service.thread(user, scopeId);
    const [session] = await query(
      service.db,
      "SELECT session_id FROM agent_sessions WHERE thread_id=?",
      [scopeId],
    );
    titleText = `${thread.title} · 小祥轨迹`;
    rows = session
      ? await query(
          service.db,
          `SELECT e.id,e.agent_session_id,e.agent_task_id task_id,e.tool,e.status,
        e.created_at,e.finished_at,e.input,e.message_id,m.thread_id,LEFT(m.body,240) user_preview,m.created_at user_created_at,
        a.id visual_artifact_id,
        CASE WHEN e.tool IN ('assistant_text','assistant_final') THEN LEFT(e.output,240) END output_preview
        FROM agent_events e JOIN messages m ON m.id=e.message_id
        LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id
        WHERE m.thread_id=? AND e.agent_session_id=? ORDER BY e.id DESC LIMIT 300`,
          [scopeId, session.session_id],
        )
      : [];
    rows = rows.map((row) => ({ ...row, agent_type: "l2" }));
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
        e.created_at,e.finished_at,e.input,e.message_id,m.thread_id,LEFT(m.body,240) user_preview,m.created_at user_created_at,
        a.id visual_artifact_id,
        CASE WHEN e.tool IN ('assistant_text','assistant_final') THEN LEFT(e.output,240) END output_preview
        FROM agent_events e JOIN messages m ON m.id=e.message_id
        LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id
        WHERE ${taskEventScope}
        ORDER BY e.id DESC LIMIT 300`,
      [scopeId, scopeId, scopeId, scopeId],
    );
    rows = rows.map((row) => ({ ...row, agent_type: "dsh_l3" }));
  } else fail(400, "未知日志作用域");
  return {
    scopeType,
    scopeId,
    title: titleText,
    inputs: collectInputs(rows),
    events: rows.map((row) => {
      const label = labelFor(row);
      const preview = ["assistant_text", "assistant_final"].includes(row.tool)
        ? String(row.output_preview || "")
            .replace(/\s+/g, " ")
            .trim()
        : "";
      return {
        id: String(row.id),
        agentType: row.agent_type,
        agentSessionId: row.agent_session_id,
        taskId: row.task_id || null,
        messageId: row.message_id || null,
        threadId: row.thread_id || null,
        tool: row.tool,
        action: label.action,
        target: label.target || undefined,
        status: row.status,
        createdAt: row.created_at,
        finishedAt: row.finished_at,
        durationMs: duration(row),
        ...(preview ? { preview } : {}),
        ...(row.visual_artifact_id
          ? { screenshotUrl: `/api/agent-visual-artifacts/${row.visual_artifact_id}` }
          : {}),
        ...(row.agent_type === "l1" && row.task ? { task: row.task } : {}),
        ...(row.agent_type === "l1" && row.error ? { error: row.error } : {}),
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
          WHERE owner_run.task_id=? AND owner_run.executor_type='dsh_l3'
            AND owner_run.executor_id=e.agent_session_id)
          AND (e.agent_task_id=? OR (e.agent_task_id IS NULL AND EXISTS (
            SELECT 1 FROM agent_task_execution_runs timed_run WHERE timed_run.task_id=?
              AND timed_run.executor_type='dsh_l3' AND timed_run.executor_id=e.agent_session_id
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
