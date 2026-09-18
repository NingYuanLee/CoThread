import { query, transaction } from "./db.js";
import { Service } from "./service.js";
import { AGENT_MEMBER, mentionsAgent } from "../shared/agent-member.js";
import { formatAgentAction } from "../shared/agent-label.js";
import { loadProjectMembers } from "./project-memory.js";
import { modelConfig, redactSecrets } from "./model-config.js";
import { createUsageMeter, saveReplyUsage } from "./agent-usage.js";
import { acquireCoordinatorRuntime, discardCoordinatorRuntime, parkCoordinatorRuntime } from "./agent.js";
import { discussionText } from "../shared/context.js";
import { bindDshL3Execution, settleDshL3Execution } from "./task-pool.js";
import { persistL3RunCheckpoint } from "./l3-session.js";

const brief = (value, limit = 1200) =>
  typeof value === "string" ? value.slice(0, limit) : null;
const parseRefs = (value) => typeof value === "string" ? JSON.parse(value) : value || [];
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isMentioned = (body, value) => new RegExp(
  `(^|[^\\p{L}\\p{N}_@])@${escapePattern(value)}(?=$|[^\\p{L}\\p{N}_@])`, "u",
).test(body);

function messageRecord(message, members, versions, quoteIds) {
  const assistant = message.source === "assistant";
  const mentions = members.filter((member) =>
    member.aliases.some((alias) => isMentioned(message.body, alias)));
  return {
    messageId: message.id,
    sequence: String(message.sequence),
    author: assistant
      ? { id: AGENT_MEMBER.id, name: AGENT_MEMBER.name, role: AGENT_MEMBER.role }
      : { id: message.author_id, name: message.author, role: message.author_role },
    createdAt: message.created_at,
    source: message.source,
    executionTarget: message.execution_target || "cloud",
    content: message.body,
    mentions: mentions.map(({ id, name }) => ({ id, name })),
    quotedMessageIds: quoteIds.get(message.id) || [],
    files: parseRefs(message.refs).map((id) => versions.get(id) || { versionId: id }),
  };
}

// Build the coordinator's five-part projection without quoted-message bodies,
// document contents, tool transcripts, avatars or profile details.
export async function dispatchContext(db, thread, job) {
  const [messages, replies, updates, memberRows, versionRows, quoteRows, documentSummaries, projectSummaryRows] = await Promise.all([
    query(db, `SELECT m.id,m.sequence,m.body,m.refs,m.source,m.execution_target,m.created_at,u.name author,m.author_id,
      JSON_UNQUOTE(JSON_EXTRACT(u.identity_tags,'$[0]')) author_role
      FROM messages m JOIN users u ON u.id=m.author_id
      WHERE m.thread_id=? AND m.sequence<=? ORDER BY m.sequence`, [job.thread_id,job.sequence]),
    query(db, `SELECT r.message_id,r.status,r.progress,r.dispatch_ready,r.parent_message_id,m.author_id,
      m.body request_body,m.created_at,u.name author,e.tool last_tool,e.input last_tool_input,
      e.status last_tool_status,r.finished_at,r.error,result.body result_body
      FROM assistant_replies r JOIN messages m ON m.id=r.message_id
      JOIN users u ON u.id=m.author_id
      LEFT JOIN messages result ON result.id=r.reply_id
      LEFT JOIN agent_events e ON e.id=(SELECT MAX(ae.id) FROM agent_events ae
        WHERE ae.message_id=r.message_id AND ae.tool<>'thinking')
      WHERE m.thread_id=? AND (r.dispatch_ready=TRUE OR r.parent_message_id IS NOT NULL)
      ORDER BY m.sequence`, [job.thread_id]),
    query(db, `SELECT tu.task_message_id,m.id message_id,m.body,m.created_at,tu.approved
      FROM agent_task_updates tu JOIN messages m ON m.id=tu.message_id
      JOIN messages root ON root.id=tu.task_message_id
      WHERE root.thread_id=? AND m.sequence<=? ORDER BY m.sequence`, [job.thread_id,job.sequence]),
    loadProjectMembers(db, thread.project_id, job.sequence),
    query(db, `SELECT v.id version_id,v.version,v.filename,a.id artifact_id,a.title
      FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE a.project_id=?`, [thread.project_id]),
    query(db, `SELECT q.message_id,q.quoted_message_id FROM message_quotes q
      JOIN messages m ON m.id=q.message_id WHERE m.thread_id=? AND m.sequence<=?`, [job.thread_id,job.sequence]),
    query(db, `SELECT d.message_id,s.version_id,s.summary,s.updated_at,v.version,v.filename,a.id artifact_id,a.title
      FROM agent_task_documents d JOIN messages m ON m.id=d.message_id
      JOIN agent_document_summaries s ON s.version_id=d.version_id
      JOIN versions v ON v.id=s.version_id JOIN artifacts a ON a.id=v.artifact_id
      WHERE m.thread_id=? ORDER BY m.sequence,s.updated_at`, [job.thread_id]),
    query(db, "SELECT summary FROM agent_project_summaries WHERE project_id=?", [thread.project_id]),
  ]);
  const members = [
    ...memberRows.map((member) => ({ id: member.id, name: member.name,
      aliases: [...new Set([member.name, member.email].filter(Boolean))] })),
    { id: AGENT_MEMBER.id, name: AGENT_MEMBER.name, aliases: [AGENT_MEMBER.name, "Agent助手"] },
  ];
  const versions = new Map(versionRows.map((version) => [version.version_id, {
    versionId: version.version_id, artifactId: version.artifact_id, title: version.title,
    filename: version.filename, version: version.version,
  }]));
  const quoteIds = new Map();
  for (const row of quoteRows) quoteIds.set(row.message_id,
    [...(quoteIds.get(row.message_id) || []), row.quoted_message_id]);
  const routedMessages = messages.map((message) => ({ ...message, refs: parseRefs(message.refs),
    quotes: (quoteIds.get(message.id) || []).map((id) => ({ id })) }));
  const records = routedMessages.map((message) => messageRecord(message, members, versions, quoteIds));
  const memberContext = [
    ...memberRows.map((member) => ({ id: member.id, name: member.name,
        projectRole: member.project_role, identityTag: member.identity_tag,
        signature: member.motto || "", messageCount: Number(member.message_count),
        understanding: member.member_understanding || null,
        statementSummary: member.statement_summary || null,
        understandingThroughSequence: String(member.through_sequence || 0),
        understandingRefreshPending: BigInt(member.pending_through_sequence || 0)
          > BigInt(member.through_sequence || 0) })),
    { id: AGENT_MEMBER.id, name: AGENT_MEMBER.name,
      projectRole: AGENT_MEMBER.role, identityTag: AGENT_MEMBER.identity_tags[0],
      signature: "", messageCount: 0, understanding: null, statementSummary: null,
      understandingThroughSequence: "0", understandingRefreshPending: false },
  ];
  const updateGroups = new Map();
  for (const update of updates) updateGroups.set(update.task_message_id,
    [...(updateGroups.get(update.task_message_id) || []), {
      messageId: update.message_id, createdAt: update.created_at,
      summary: brief(update.body, 600), accepted: !!update.approved,
    }]);
  const documentVersionsByTask = new Map();
  const sharedSummaries = new Map();
  for (const summary of documentSummaries) {
    documentVersionsByTask.set(summary.message_id,
      [...(documentVersionsByTask.get(summary.message_id) || []), summary.version_id]);
    const existing = sharedSummaries.get(summary.version_id);
    sharedSummaries.set(summary.version_id, existing
      ? { ...existing, relatedTaskIds: [...existing.relatedTaskIds, summary.message_id] }
      : { versionId: summary.version_id, artifactId: summary.artifact_id, title: summary.title,
        filename: summary.filename, version: summary.version, summary: brief(summary.summary, 4000),
        updatedAt: summary.updated_at, relatedTaskIds: [summary.message_id] });
  }
  const closedStatuses = new Set(["completed", "failed", "cancelled"]);
  const tasks = replies.map((reply) => {
    let args = {};
    try { args = typeof reply.last_tool_input === "string" ? JSON.parse(reply.last_tool_input) : reply.last_tool_input || {}; }
    catch {}
    const goalUpdates = updateGroups.get(reply.message_id) || [];
    const documentVersionIds = documentVersionsByTask.get(reply.message_id) || [];
    if (closedStatuses.has(reply.status)) {
      return {
        taskId: reply.message_id,
        status: reply.status,
        closed: true,
        noBackfill: true,
        finishedAt: reply.finished_at,
        title: brief(reply.request_body, 80),
        goal: brief(reply.request_body, 80),
        documentVersionIds,
      };
    }
    return {
      taskId: reply.message_id,
      relatedMessageIds: [reply.message_id, ...goalUpdates.map((update) => update.messageId)],
      requestedBy: { id: reply.author_id, name: reply.author },
      createdAt: reply.created_at,
      status: reply.status,
      goal: brief(reply.request_body, 800),
      goalUpdates,
      documentVersionIds,
      progress: brief(reply.progress, 240),
      lastAction: reply.last_tool ? formatAgentAction(reply.last_tool, args) : null,
      lastActionStatus: reply.last_tool_status,
      resultSummary: brief(reply.result_body || reply.error, 1200),
      finishedAt: reply.finished_at,
    };
  });
  const openTaskIds = new Set(tasks.filter((task) => !task.closed).map((task) => task.taskId));
  const latestMessage = records.find((message) => message.messageId === job.message_id)
    || records.find((message) => message.sequence === String(job.sequence));
  const historyMessages = records.filter((message) => message.messageId !== latestMessage?.messageId);
  const omittedOldest = Math.max(0, historyMessages.length - 15);
  if (historyMessages.length > 15) historyMessages.splice(0, historyMessages.length - 15);
  const summaries = [...sharedSummaries.values()].map((item) => {
    const live = item.relatedTaskIds.some((id) => openTaskIds.has(id));
    return live ? item : {
      versionId: item.versionId, artifactId: item.artifactId, title: item.title,
      filename: item.filename, version: item.version, status: "indexed",
      relatedTaskIds: item.relatedTaskIds,
    };
  }).filter((item) => item.status !== "indexed" || item.relatedTaskIds.some((id) => openTaskIds.has(id)));
  const promptTasks = [
    ...tasks.filter((task) => task.closed).slice(-8),
    ...tasks.filter((task) => !task.closed),
  ];
  return {
    title: thread.title,
    messages: routedMessages,
    replies,
    promptContext: {
      event: job.kind === "child_result"
        ? { kind: "child_result", ...job.payload }
        : { kind: "member_message", messageId: job.message_id },
      projectSummary: projectSummaryRows[0]?.summary || null,
      history: { messages: historyMessages, omittedOldest },
      tasks: promptTasks,
      documentSummaries: summaries,
      latestMessage: latestMessage ? { ...latestMessage,
        directlyAddressed: mentionsAgent(job.body || "") || job.participation === "reply" } : null,
      members: memberContext,
    },
  };
}

export async function runCoordinatorAgent(context, { db, job, user }) {
  const runtime = await acquireCoordinatorRuntime(context, { db, job, user });
  let completed = false;
  try {
    const prompt = job.kind === "child_result"
      ? `当前项目：${context.project_id}；当前迭代：${job.thread_id}。
本次唤醒：下属交活。${JSON.stringify(job.payload || {})}
当前上下文：${JSON.stringify(context.promptContext || context)}
请根据结果向成员回报；也可 inspect_task 或 send_message 追问仍在跑的 L3，拿到回复后决定帮一把还是换人。不要推给平台，不要在沙箱写 SQL。先说话再行动。做完就停。`
      : `当前项目：${context.project_id}；当前迭代：${job.thread_id}；触发消息：${job.message_id}。
本次唤醒：成员消息。上下文：${JSON.stringify(context.promptContext || context)}
先用可见正文回应理解或答复；催进度时 inspect_task 或 send_message 问 L3，拿到回复再决定帮一把还是换人；需要干活再 create_task 并立刻 dsh_l3。create_task/recover_task 只是排队，见到 execution_agent_id 且 status=running 之前不要说已经派人。dsh_l3 失败就报绑定原因。不要自己做沙箱工作。没有要对成员说的话时返回 NO_VISIBLE_MESSAGE。做完就停。`;
    const steeredMessageIds = new Set();
    const mergedMessageIds = new Set();
    let steeringBusy = false;
    let lastSteeredSequence = BigInt(job.sequence);
    const epochStartedAt = Date.now();
    const maxReplans = 8;
    const maxEpochMs = 90000;
    const isMeaningfulUpdate = (row) => {
      const text = String(row.body || "").trim();
      if (!text || /^(收到|好的|好|了解|明白|谢谢|感谢|ok|okay)[。！!，, ]*$/i.test(text)) return false;
      return text.length > 12 || /[?？]|@|请|需要|改|换|补充|但是|优先|截止|目标|约束|事实|进度|完成|失败|阻塞/i.test(text);
    };
    const steerNewMessages = async () => {
      if (steeringBusy) return;
      const [sessionState] = await query(db, "SELECT replanning_count,convergence_until FROM agent_sessions WHERE thread_id=?", [job.thread_id]);
      if (Number(sessionState?.replanning_count || 0) >= maxReplans || Date.now() - epochStartedAt >= maxEpochMs) {
        await query(db, "UPDATE agent_sessions SET convergence_state='stable',wait_reason='本轮重规划预算已用完，等待新更新',convergence_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 SECOND) WHERE thread_id=?", [job.thread_id]);
        return;
      }
      steeringBusy = true;
      try {
        const rows = await query(db, "SELECT m.id,m.sequence,m.author_id,m.body,m.refs,m.source,u.name author FROM messages m JOIN users u ON u.id=m.author_id LEFT JOIN agent_requests q ON q.message_id=m.id WHERE m.thread_id=? AND m.source='human' AND m.sequence>? AND (q.status='queued' OR q.status IS NULL) ORDER BY m.sequence LIMIT 20", [job.thread_id, lastSteeredSequence.toString()]);
        if (!rows.length) return;
        const meaningful = rows.filter(isMeaningfulUpdate);
        if (!meaningful.length) {
          for (const row of rows) mergedMessageIds.add(row.id);
          lastSteeredSequence = BigInt(rows.at(-1).sequence);
          return;
        }
        const accepted = await runtime.request("updates", { mode: "steer", messages: meaningful.map((row) => ({ id: row.id, text: discussionText({ ...row, refs: typeof row.refs === "string" ? JSON.parse(row.refs) : row.refs }) })) });
        const acceptedIds = new Set(accepted.accepted || []);
        for (const row of rows) {
          if (meaningful.includes(row) && !acceptedIds.has(row.id)) break;
          mergedMessageIds.add(row.id);
          if (acceptedIds.has(row.id)) steeredMessageIds.add(row.id);
          lastSteeredSequence = BigInt(row.sequence);
        }
        if (acceptedIds.size) await query(db, "UPDATE agent_sessions SET last_processed_sequence=?,task_revision=task_revision+1,replanning_count=replanning_count+1,convergence_state='active',wait_reason=NULL WHERE thread_id=?", [lastSteeredSequence.toString(), job.thread_id]);
      } catch (error) { console.error("Coordinator steering failed", { type: error?.name || "Error", diagnostic: redactSecrets(error?.message || error).slice(-1000) }); }
      finally { steeringBusy = false; }
    };
    const steeringTimer = setInterval(() => void steerNewMessages(), 350);
    steeringTimer.unref?.();
    const toolTasks = new Map();
    const nativeToolEvents = new Map();
    const childRunEvents = new Map();
    const finishedChildren = new Map();
    const activeChildren = runtime.activeChildren;
    let lifecycle = Promise.resolve();
    let childSettled;
    const taskIdFromPrompt = (value) => String(value || "").match(
      /(?:TASK_ID\s*[:=]|任务ID\s*[:：]|\[task:)\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    )?.[1] || null;
    const attachChildTask = async (childId, taskId, parentEventId) => {
      const failBind = async (message) => {
        if (parentEventId) {
          await query(db, `UPDATE agent_events SET status='failed',output=?,finished_at=UTC_TIMESTAMP(3)
            WHERE id=? AND status IN ('running','completed')`, [String(message || "未能绑定 L3").slice(0, 1000), parentEventId]);
        }
        return null;
      };
      let bindId = taskId || null;
      if (!bindId) {
        const queued = await query(db, `SELECT t.id FROM agent_task_execution_runs r
          JOIN agent_tasks t ON t.id=r.task_id
          WHERE t.target_type='l2_session' AND t.target_id=? AND r.executor_type='dsh_l3'
            AND r.status='queued' AND r.executor_id IS NULL AND r.task_revision=t.revision
          ORDER BY r.created_at`, [runtime.session.session_id]);
        if (queued.length !== 1) {
          return failBind(queued.length
            ? "dsh_l3 prompt 缺少 TASK_ID，当前有多条排队任务，无法自动绑定"
            : "没有可绑定的排队任务。create_task/recover_task 之后必须带 TASK_ID 调用 dsh_l3。");
        }
        bindId = queued[0].id;
      }
      let task = null;
      try {
        task = await bindDshL3Execution(db, runtime.session.session_id, childId, bindId);
      } catch (error) {
        if (error?.status === 409 || error?.status === 404) return failBind(error.message);
        throw error;
      }
      if (!task) return failBind("排队任务未能绑定到本次 L3");
      if (parentEventId) {
        await query(db, `UPDATE agent_events SET agent_task_id=?
          WHERE agent_session_id=? AND agent_task_id IS NULL
            AND created_at>=(SELECT created_at FROM (SELECT created_at FROM agent_events WHERE id=?) parent_event)`,
        [task.id, childId, parentEventId]);
      } else {
        await query(db, "UPDATE agent_events SET agent_task_id=? WHERE agent_session_id=? AND agent_task_id IS NULL",
          [task.id, childId]);
      }
      const finished = finishedChildren.get(childId);
      if (finished) {
        finishedChildren.delete(childId);
        const settled = await settleDshL3Execution(db, runtime.session.session_id, childId, finished);
        await retainOrForgetChild(childId, settled);
      }
      return task;
    };
    const notificationText = (blocks = []) => blocks.filter((block) => block?.type === "text")
      .map((block) => block.text || "").join("\n");
    const retainOrForgetChild = async (childId, task) => {
      try {
        await persistL3RunCheckpoint(db, childId, await runtime.request("history", { sessionId: childId }));
      } catch (error) {
        console.error("L3 session snapshot skipped", {
          type: error?.name || "Error",
          diagnostic: redactSecrets(error?.message || error).slice(-1000),
        });
      }
      if (task?.task_type === "formal") {
        await runtime.request("compact", { sessionId: childId, automatic: false }).catch(() => {});
      } else {
        runtime.forgetSession(childId);
      }
    };
    const nativeTools = new Set(["dsh_l3", "send_message", "interrupt_agent", "list_agents"]);
    const nativeEventInput = (name, args) => name === "dsh_l3"
      ? { taskId: taskIdFromPrompt(args.prompt) }
      : name === "send_message"
        ? { agentId: args.agent_id || null, taskId: taskIdFromPrompt(args.message) }
        : name === "interrupt_agent"
          ? { agentId: args.agent_id || null }
          : { scope: args.scope || "children" };
    const usageMeter = createUsageMeter();
    let modelDurationMs = 0;
    const trackCoordinatorUsage = (notification) => {
      if (notification.method === "session.event" && notification.params?.sessionId === runtime.session.session_id)
        usageMeter.notify(notification.params.event);
      handleAgentTeamNotification(notification);
    };
    const runCoordinatorTurn = async (promptText) => {
      const started = performance.now();
      await runtime.progress("正在调用模型");
      try {
        return await runtime.harness.run(promptText, {
          sessionId: runtime.session.session_id,
          onNotification: trackCoordinatorUsage,
        });
      } finally {
        modelDurationMs += performance.now() - started;
      }
    };
    const persistCoordinatorUsage = async () => {
      if (!job.message_id) return;
      try {
        const usage = usageMeter.result() || {};
        const configuredModel = modelConfig("coordinator");
        await saveReplyUsage(db, job.message_id, {
          ...usage,
          model: configuredModel.model,
          reasoningEffort: configuredModel.reasoningEffort,
          executionDurationMs: Math.round(modelDurationMs),
        });
      } catch (error) {
        console.error("Usage persistence failed", { type: error?.name || "Error" });
      }
    };
    const handleAgentTeamNotification = (notification) => {
      runtime.thinking.notify(notification);
      lifecycle = lifecycle.then(async () => {
        if (notification.method === "session.event") {
          const callerSessionId = notification.params?.sessionId;
          const event = notification.params.event;
          if (event?.type === "tool/call" && nativeTools.has(event.data?.name)) {
            let args = {};
            try { args = JSON.parse(event.data.arguments || "{}"); } catch {}
            const details = nativeEventInput(event.data.name, args);
            let agentTaskId = details.taskId || null;
            if (!agentTaskId && callerSessionId && callerSessionId !== runtime.session.session_id) {
              const [activeRun] = await query(db, `SELECT task_id FROM agent_task_execution_runs
                WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting')
                ORDER BY created_at DESC LIMIT 1`, [callerSessionId]);
              agentTaskId = activeRun?.task_id || null;
            }
            const inserted = await query(db, `INSERT INTO agent_events(message_id,agent_session_id,agent_task_id,tool,status,input)
              VALUES(?,?,?,?,'running',?)`, [job.message_id, callerSessionId || runtime.session.session_id,
              agentTaskId, event.data.name, JSON.stringify(details)]);
            nativeToolEvents.set(event.data.callId, { id: inserted.insertId, name: event.data.name, args, callerSessionId });
            if (callerSessionId === runtime.session.session_id && ["dsh_l3", "send_message"].includes(event.data.name)) {
              toolTasks.set(event.data.callId, {
                taskId: taskIdFromPrompt(event.data.name === "dsh_l3" ? args.prompt : args.message),
                childId: event.data.name === "send_message" ? args.agent_id : null,
                parentEventId: inserted.insertId,
              });
            }
          }
          if (event?.type === "tool/result") {
            const callId = event.data?.message?.source?.callId;
            const nativeEvent = nativeToolEvents.get(callId);
            const output = notificationText(event.data.message?.content);
            if (nativeEvent) {
              const failed = !!(event.data?.isError || event.data?.message?.source?.isError);
              await query(db, `UPDATE agent_events SET status=?,output=?,finished_at=UTC_TIMESTAMP(3)
                WHERE id=? AND status='running'`,
                [failed ? "failed" : "completed", output.slice(0, 1000), nativeEvent.id]);
              nativeToolEvents.delete(callId);
            }
            if (!toolTasks.has(callId)) return;
            const pending = toolTasks.get(callId);
            const childId = pending.childId || output.match(/started subagent\s+([^\s]+)/i)?.[1];
            if (childId) await attachChildTask(childId, pending.taskId, pending.parentEventId);
            toolTasks.delete(callId);
          }
        } else if (notification.method === "subagent.started" && notification.params?.parentSessionId === runtime.session.session_id) {
          const childId = notification.params.childSessionId;
          activeChildren.add(childId);
          const inserted = await query(db, `INSERT INTO agent_events
            (message_id,agent_session_id,tool,status,input) VALUES(?,?,'agent_run','running','{}')`,
          [job.message_id, childId]);
          childRunEvents.set(childId, inserted.insertId);
          let pendingTask = null;
          for (const pending of toolTasks.values()) {
            if (!pending.childId) { pending.childId = childId; pendingTask = pending; break; }
          }
          await attachChildTask(childId, pendingTask?.taskId, pendingTask?.parentEventId);
        } else if (notification.method === "subagent.finished" && notification.params?.parentSessionId === runtime.session.session_id) {
          const childId = notification.params.childSessionId;
          const runEventId = childRunEvents.get(childId);
          if (runEventId) {
            const completed = notification.params.status === "ok" && notification.params.stopReason === "completed";
            await query(db, `UPDATE agent_events SET status=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
            [completed ? "completed" : "failed", runEventId]);
            childRunEvents.delete(childId);
          }
          const settled = await settleDshL3Execution(db, runtime.session.session_id, childId, notification.params);
          if (!settled) finishedChildren.set(childId, notification.params);
          else await retainOrForgetChild(childId, settled);
          activeChildren.delete(childId);
          childSettled?.();
          if (!activeChildren.size && job.message_id)
            await query(db, "UPDATE assistant_replies SET execution_active=FALSE WHERE message_id=? AND execution_active=TRUE",
              [job.message_id]);
        }
      }).catch((error) => console.error("AgentTeam task lifecycle sync failed", {
        type: error?.name || "Error", diagnostic: redactSecrets(error?.message || error).slice(-1000),
      }));
    };
    let result;
    try {
      result = await runCoordinatorTurn(prompt);
      await lifecycle;
      if (activeChildren.size) runtime.watchChildren?.(handleAgentTeamNotification, () => lifecycle);
      await lifecycle;
      await steerNewMessages();
      await persistCoordinatorUsage();
      completed = true;
      return { ...result, steeredMessageIds: [...steeredMessageIds], mergedMessageIds: [...mergedMessageIds],
        waiting: activeChildren.size > 0, runtime };
    } finally {
      clearInterval(steeringTimer);
      await steerNewMessages().catch(() => {});
    }
  } catch (error) {
    if (!completed) await discardCoordinatorRuntime(job.thread_id, runtime);
    throw error;
  } finally {
    if (completed) await parkCoordinatorRuntime(job.thread_id, runtime, true).catch((error) => {
      console.error("Coordinator runtime park failed", { type: error?.name || "Error" });
      return discardCoordinatorRuntime(job.thread_id, runtime);
    });
  }
}

export async function processNextCoordinator(db, threadId, runAgent = runCoordinatorAgent) {
  const candidates = threadId ? [{ thread_id: threadId }] : await query(db,
    `SELECT thread_id FROM (
       SELECT m.thread_id FROM agent_requests q JOIN messages m ON m.id=q.message_id WHERE q.status='queued'
       UNION
       SELECT thread_id FROM coordinator_events WHERE status='queued'
     ) queued`);
  let job;
  for (const candidate of candidates) {
    job = await transaction(db, async (conn) => {
      const [thread] = await query(conn, "SELECT id FROM threads WHERE id=? FOR UPDATE", [candidate.thread_id]);
      if (!thread) return;
      const [activeRequest] = await query(conn,
        `SELECT q.message_id FROM agent_requests q JOIN messages m ON m.id=q.message_id
         WHERE m.thread_id=? AND q.status='running' LIMIT 1`, [thread.id]);
      const [activeEvent] = await query(conn,
        "SELECT id FROM coordinator_events WHERE thread_id=? AND status='running' LIMIT 1", [thread.id]);
      if (activeRequest || activeEvent) return;
      const [nextMessage] = await query(conn,
         `SELECT q.message_id,m.thread_id,m.author_id,m.sequence,m.body,m.refs,m.execution_target,m.created_at,
          r.participation,r.status reply_status,r.reply_id FROM agent_requests q
          JOIN messages m ON m.id=q.message_id LEFT JOIN assistant_replies r ON r.message_id=m.id
          WHERE m.thread_id=? AND q.status='queued' ORDER BY m.sequence LIMIT 1`, [thread.id]);
      const [nextEvent] = await query(conn,
        `SELECT id,thread_id,kind,message_id,task_id,payload,created_at FROM coordinator_events
         WHERE thread_id=? AND status='queued' ORDER BY created_at LIMIT 1`, [thread.id]);
      const takeEvent = nextEvent && (!nextMessage || new Date(nextEvent.created_at) <= new Date(nextMessage.created_at));
      if (takeEvent) {
        await query(conn, "UPDATE coordinator_events SET status='running',claimed_at=UTC_TIMESTAMP(3) WHERE id=?", [nextEvent.id]);
        const payload = typeof nextEvent.payload === "string" ? JSON.parse(nextEvent.payload) : nextEvent.payload || {};
        const [latest] = await query(conn, "SELECT sequence FROM messages WHERE thread_id=? ORDER BY sequence DESC LIMIT 1", [thread.id]);
        return {
          kind: nextEvent.kind,
          event_id: nextEvent.id,
          thread_id: nextEvent.thread_id,
          message_id: nextEvent.message_id || payload.sourceMessageId || null,
          author_id: payload.sourceUserId || null,
          sequence: latest?.sequence || 0,
          body: "",
          payload,
          task_id: nextEvent.task_id,
        };
      }
      if (nextMessage?.reply_status && !["queued", "running"].includes(nextMessage.reply_status)) {
        await query(conn, "UPDATE agent_requests SET status='completed',response_id=? WHERE message_id=?", [nextMessage.reply_id, nextMessage.message_id]);
        return { alreadyHandled: true };
      }
      if (nextMessage) {
        await query(conn, "UPDATE agent_requests SET status='running' WHERE message_id=?", [nextMessage.message_id]);
        return { kind: "member_message", ...nextMessage };
      }
    });
    if (job) break;
  }
  if (!job) return false;
  if (job.alreadyHandled) return true;
  if (job.kind === "child_result" && !job.author_id) {
    const [member] = await query(db, `SELECT u.id FROM members m JOIN users u ON u.id=m.user_id
      JOIN threads t ON t.project_id=m.project_id WHERE t.id=? LIMIT 1`, [job.thread_id]);
    job.author_id = member?.id;
  }
  const service = new Service(db), user = { id: job.author_id, kind: "session" };
  try {
    const started = performance.now();
    const thread = await service.thread(user, job.thread_id, true);
    if (job.kind !== "child_result") {
      await query(db, "UPDATE assistant_replies SET status='running',progress=? WHERE message_id=? AND status='queued'",
        ["小祥正在理解请求", job.message_id]);
    }
    await query(db, "UPDATE agent_sessions SET steering_epoch=steering_epoch+1,task_revision=task_revision+1,last_processed_sequence=?,convergence_state='active',replanning_count=0,wait_reason=NULL,convergence_until=NULL WHERE thread_id=?", [job.sequence, job.thread_id]);
    const context = await dispatchContext(db, thread, job);
    const loaded = performance.now();
    const result = await runAgent(context, { db, job, user });
    console.log("Agent timing", { messageId: job.message_id, stage: job.kind === "child_result" ? "coordinator_child_result" : "coordinator_agent",
      contextMs: Math.round(loaded - started), modelMs: Math.round(performance.now() - loaded) });
    const visible = result?.finalResponse?.trim() && result.finalResponse.trim() !== "NO_VISIBLE_MESSAGE"
      ? result.finalResponse.trim().slice(0, 4000) : null;
    const posts = job.message_id
      ? await query(db, "SELECT id FROM messages WHERE agent_task_id=? ORDER BY sequence", [job.message_id])
      : [];
    const [liveChild] = await query(db, `SELECT r.id FROM agent_task_execution_runs r JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.origin_thread_id=? AND r.status IN ('queued','running','waiting') LIMIT 1`, [job.thread_id]);
    const waiting = !!(result?.waiting || liveChild);
    await query(db, "UPDATE agent_sessions SET convergence_state=?,wait_reason=?,updated_at=UTC_TIMESTAMP(3) WHERE thread_id=?",
      [waiting ? "waiting" : "stable", waiting ? "等待执行结果" : null, job.thread_id]);
    let responseId = posts[0]?.id || null;
    await transaction(db, async (conn) => {
      if (job.kind === "child_result") {
        if (!responseId && visible) {
          responseId = (await service.insertMessage(conn, user, job.thread_id, visible, [], "assistant", job.message_id)).id;
        }
        await query(conn, "UPDATE coordinator_events SET status='completed',finished_at=UTC_TIMESTAMP(3) WHERE id=?", [job.event_id]);
        return;
      }
      const [request] = await query(conn, "SELECT status FROM agent_requests WHERE message_id=? FOR UPDATE", [job.message_id]);
      if (request?.status !== "running") return;
      if (!responseId && visible) responseId = (await service.insertMessage(conn, user, job.thread_id, visible, [], "assistant", job.message_id)).id;
      await query(conn, `UPDATE assistant_replies SET status='completed',execution_active=?,participation=?,reply_id=?,progress=?,finished_at=UTC_TIMESTAMP(3) WHERE message_id=? AND status IN ('queued','running')`,
        [waiting, responseId ? "reply" : "silent", responseId, waiting ? "等待任务级 Agent" : "小祥已完成本轮处理", job.message_id]);
      await query(conn, "UPDATE agent_requests SET status='completed',response_id=?,error=NULL,first_response_at=COALESCE(first_response_at,UTC_TIMESTAMP(3)) WHERE message_id=?", [responseId, job.message_id]);
      for (const messageId of result?.mergedMessageIds || []) {
        await query(conn, "UPDATE assistant_replies SET status='completed',participation='reply',reply_id=?,progress='已并入当前 L2 处理周期',finished_at=UTC_TIMESTAMP(3) WHERE message_id=? AND status='queued'", [responseId, messageId]);
        await query(conn, "UPDATE agent_requests SET status='completed',response_id=?,error=NULL,first_response_at=COALESCE(first_response_at,UTC_TIMESTAMP(3)) WHERE message_id=? AND status='queued'", [responseId, messageId]);
      }
    });
  } catch (error) {
    await transaction(db, async (conn) => {
      if (job.kind === "child_result") {
        await query(conn, "UPDATE coordinator_events SET status='failed',error='小祥暂未响应，请重试。',finished_at=UTC_TIMESTAMP(3) WHERE id=?", [job.event_id]);
        return;
      }
      await query(conn, "UPDATE agent_requests SET status='failed',error='小祥暂未响应，请重试。' WHERE message_id=?", [job.message_id]);
      await query(conn, "UPDATE assistant_replies SET status='failed',error='小祥暂未响应，请重试。' WHERE message_id=? AND status IN ('queued','running')", [job.message_id]);
      await query(conn, "UPDATE agent_task_updates SET approved=TRUE WHERE message_id=?", [job.message_id]);
    });
    console.error("Coordinator request failed", {
      messageId: job.message_id,
      type: error?.name || "Error",
      diagnostic: redactSecrets(error?.stack || error?.message || error).slice(-2500),
    });
  }
  return true;
}

