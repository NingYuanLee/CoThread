import { query, transaction } from "./db.js";
import { Service } from "./service.js";
import { AGENT_L2_MEMBER, mentionsAgent } from "../shared/agent-member.js";
import { formatAgentAction } from "../shared/agent-label.js";
import { loadProjectMembers } from "./project-memory.js";
import { modelConfig, redactSecrets } from "./model-config.js";
import { createUsageMeter, saveReplyUsage } from "./agent-usage.js";
import { acquireCoordinatorRuntime, discardCoordinatorRuntime, parkCoordinatorRuntime } from "./agent.js";
import { discussionText } from "../shared/context.js";
import { bindDshL3Execution, finishCoordinatorDispatch, l3LaunchPrompt, settleDshL3Execution, tasksAwaitingL3Launch } from "./task-pool.js";
import { trackThinking } from "./agent-thinking.js";
import { insertUniqueAssistantMessage } from "./assistant-post.js";
import { persistL3ContextStats, persistL3RunCheckpoint } from "./l3-session.js";
import {
  composeOpportunisticParticipation,
  absorbOpportunisticBurst,
  silenceOpportunisticBurst,
  logParticipationDecision,
  persistOpportunisticParticipationArtifacts,
} from "./agent-participation.js";
import { logAgentTiming } from "./agent-timing-log.js";

const brief = (value, limit = 1200) =>
  typeof value === "string" ? value.slice(0, limit) : null;
const parseRefs = (value) => typeof value === "string" ? JSON.parse(value) : value || [];
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isMentioned = (body, value) => new RegExp(
  `(^|[^\\p{L}\\p{N}_@])@${escapePattern(value)}(?=$|[^\\p{L}\\p{N}_@])`, "u",
).test(body);

function messageRecord(message, members, versions, quoteIds, folders) {
  const assistant = message.source === "assistant";
  const mentions = members.filter((member) =>
    member.aliases.some((alias) => isMentioned(message.body, alias)));
  // Keep folderRefs as folders only. Expanding them into files made L2 re-attach
  // every document under the folder when creating tasks.
  const seen = new Set();
  const files = [];
  for (const id of parseRefs(message.refs)) {
    if (seen.has(id)) continue;
    seen.add(id);
    files.push(versions.get(id) || { versionId: id });
  }
  return {
    messageId: message.id,
    sequence: String(message.sequence),
    author: assistant
      ? { id: AGENT_L2_MEMBER.id, name: AGENT_L2_MEMBER.name, role: AGENT_L2_MEMBER.role }
      : { id: message.author_id, name: message.author, role: message.author_role },
    createdAt: message.created_at,
    source: message.source,
    executionTarget: message.execution_target || "cloud",
    content: message.body,
    mentions: mentions.map(({ id, name }) => ({ id, name })),
    quotedMessageIds: quoteIds.get(message.id) || [],
    folders: parseRefs(message.folder_refs).map((id) => folders.get(id) || { folderId: id }),
    files,
  };
}

// Build the coordinator's five-part projection without quoted-message bodies,
// document contents, tool transcripts, avatars or profile details.
export async function dispatchContext(db, thread, job) {
  const [messages, replies, updates, memberRows, versionRows, quoteRows, documentSummaries, projectSummaryRows] = await Promise.all([
    query(db, `SELECT m.id,m.sequence,m.body,m.refs,m.folder_refs,m.source,m.execution_target,m.created_at,u.name author,m.author_id,
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
    { id: AGENT_L2_MEMBER.id, name: AGENT_L2_MEMBER.name, aliases: [AGENT_L2_MEMBER.name, "Agent助手"] },
  ];
  const versions = new Map(versionRows.map((version) => [version.version_id, {
    versionId: version.version_id, artifactId: version.artifact_id, title: version.title,
    filename: version.filename, version: version.version,
  }]));
  const quoteIds = new Map();
  for (const row of quoteRows) quoteIds.set(row.message_id,
    [...(quoteIds.get(row.message_id) || []), row.quoted_message_id]);
  const routedMessages = messages.map((message) => ({
    ...message,
    refs: parseRefs(message.refs),
    folder_refs: parseRefs(message.folder_refs),
    quotes: (quoteIds.get(message.id) || []).map((id) => ({ id })),
  }));
  const folderIds = [...new Set(routedMessages.flatMap((message) => message.folder_refs))];
  const folderRows = folderIds.length
    ? await query(db, `SELECT id,name FROM document_folders WHERE project_id=? AND id IN (${folderIds.map(() => "?").join(",")})`,
      [thread.project_id, ...folderIds])
    : [];
  const folders = new Map(folderRows.map((folder) => [folder.id, { folderId: folder.id, name: folder.name }]));
  const records = routedMessages.map((message) => messageRecord(
    message,
    members,
    versions,
    quoteIds,
    folders,
  ));
  const memberContext = [
    ...memberRows.map((member) => ({ id: member.id, name: member.name,
        projectRole: member.project_role, identityTag: member.identity_tag,
        signature: member.motto || "", messageCount: Number(member.message_count),
        understanding: member.member_understanding || null,
        statementSummary: member.statement_summary || null,
        understandingThroughSequence: String(member.through_sequence || 0),
        understandingRefreshPending: BigInt(member.pending_through_sequence || 0)
          > BigInt(member.through_sequence || 0) })),
    { id: AGENT_L2_MEMBER.id, name: AGENT_L2_MEMBER.name,
      projectRole: AGENT_L2_MEMBER.role, identityTag: AGENT_L2_MEMBER.identity_tags[0],
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
    project_id: thread.project_id,
    title: thread.title,
    messages: routedMessages,
    replies,
    promptContext: {
      event: job.kind === "child_result" || job.kind === "l3_idle"
        ? { kind: job.kind, ...job.payload }
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
    const launched = [];
    const launchFailed = [];
    let inflightLaunch = null;
    const launchAwaitingL3 = async () => {
      const waiting = await tasksAwaitingL3Launch(db, runtime.session.session_id);
      for (const row of waiting) {
        const launch = await l3LaunchPrompt(db, row.id);
        if (!launch) continue;
        inflightLaunch = { taskId: row.id };
        try {
          const started = await runtime.request("dispatch-l3", { label: launch.label, prompt: launch.prompt });
          const bound = await bindDshL3Execution(db, runtime.session.session_id, started.childId, row.id);
          if (!bound?.execution_agent_id) {
            try { await runtime.request("interrupt", { sessionId: started.childId }); } catch {}
            throw new Error("排队任务未能绑定到本次 L3");
          }
          launched.push({ taskId: row.id, childId: started.childId });
        } catch (error) {
          launchFailed.push(row.id);
          const diagnostic = redactSecrets(error?.message || error).slice(0, 500);
          console.error("L3 launch failed", {
            taskId: row.id,
            type: error?.name || "Error",
            diagnostic: diagnostic.slice(-1000),
          });
          // Surface the real failure on the task so acceptance can read it via inspect_task.
          await query(db,
            `UPDATE agent_tasks SET progress=? WHERE id=? AND (execution_agent_id IS NULL OR execution_agent_id='')`,
            [`L3 自动启动失败: ${diagnostic}`, row.id]).catch(() => {});
        } finally {
          inflightLaunch = null;
        }
      }
    };
    if (job.kind === "child_result" || job.kind === "l3_idle" || job.kind === "member_message") {
      await launchAwaitingL3();
    }
    const startedNote = launched.length
      ? `系统已启动这些任务的 L3：${launched.map((item) => item.taskId).join("，")}。不要再为它们调用 dsh_l3。`
      : "";
    const failedNote = launchFailed.length
      ? `这些任务系统没能启动，请立刻 dsh_l3，prompt 第一行写 TASK_ID：${launchFailed.join("，")}。`
      : "";
    const dispatchInstruction = failedNote
      || "payload 里的 pendingTasks 由系统按任务 id 启动 L3，不要为了绑定再调用 dsh_l3。需要换人或恢复原会话时才用 dsh_l3 或 send_message，prompt 第一行写 TASK_ID。";
    const prompt = job.kind === "l3_idle"
      ? `当前项目：${context.project_id}；当前迭代：${job.thread_id}。
本次唤醒：上一轮没有把待指派任务派出去。${JSON.stringify(job.payload || {})}
${startedNote}${dispatchInstruction}没有待指派任务就停。不要自己做沙箱工作。没有要对成员说的话时返回 NO_VISIBLE_MESSAGE。`
      : job.kind === "child_result"
      ? `当前项目：${context.project_id}；当前迭代：${job.thread_id}。
本次唤醒：下属交活。${JSON.stringify(job.payload || {})}
当前上下文：${JSON.stringify(context.promptContext || context)}
请根据结果向成员回报；也可 inspect_task 或 send_message 追问仍在跑的 L3，拿到回复后决定帮一把还是换人。${startedNote}${dispatchInstruction}不要推给平台，不要在沙箱写 SQL。先说话再行动。做完就停。`
      : `当前项目：${context.project_id}；当前迭代：${job.thread_id}；触发消息：${job.message_id}。
本次唤醒：成员消息。上下文：${JSON.stringify(context.promptContext || context)}
先用可见正文回应理解或答复；催进度时 inspect_task 或 send_message 问 L3，拿到回复再决定帮一把还是换人。Ask 辅助任务没有空闲 L3 就不要 create_task，自己处理。沙箱 formal 无空闲 L3 可先建成 pending_assignment；有空闲则创建为执行中，create_task 会尽量在同一次调用内启动并绑定 L3。若 create_task 仍返回 needsDispatch=true 且无 execution_agent_id，请在同一轮立刻 dsh_l3，prompt 第一行写 TASK_ID。见到 execution_agent_id 之前不要说已经派人。不要自己做沙箱工作。没有要对成员说的话时返回 NO_VISIBLE_MESSAGE。做完就停。`;
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
        const rows = await query(db, "SELECT m.id,m.sequence,m.author_id,m.body,m.refs,m.folder_refs,m.source,u.name author FROM messages m JOIN users u ON u.id=m.author_id LEFT JOIN agent_requests q ON q.message_id=m.id WHERE m.thread_id=? AND m.source='human' AND m.sequence>? AND (q.status='queued' OR q.status IS NULL) ORDER BY m.sequence LIMIT 20", [job.thread_id, lastSteeredSequence.toString()]);
        if (!rows.length) return;
        const meaningful = rows.filter(isMeaningfulUpdate);
        if (!meaningful.length) {
          for (const row of rows) mergedMessageIds.add(row.id);
          lastSteeredSequence = BigInt(rows.at(-1).sequence);
          return;
        }
        const accepted = await runtime.request("updates", { mode: "steer", messages: meaningful.map((row) => ({ id: row.id, text: discussionText({ ...row, refs: typeof row.refs === "string" ? JSON.parse(row.refs) : row.refs, folder_refs: typeof row.folder_refs === "string" ? JSON.parse(row.folder_refs) : row.folder_refs }) })) });
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
    const childThinking = new Map();
    const finishedChildren = new Map();
    const activeChildren = runtime.activeChildren;
    let lifecycle = Promise.resolve();
    let childSettled;
    const ensureChildThinking = (childId, taskId = null, messageId = job.message_id) => {
      if (!childId || childThinking.has(childId) || !messageId) return childThinking.get(childId);
      const tracker = trackThinking(db, messageId, childId, {
        updateReplyProgress: false,
        agentTaskId: taskId || null,
      });
      childThinking.set(childId, tracker);
      return tracker;
    };
    const closeChildThinking = async (childId) => {
      const tracker = childThinking.get(childId);
      if (!tracker) return;
      childThinking.delete(childId);
      await tracker.close("completed").catch(() => {});
    };
    const taskIdFromPrompt = (value) => String(value || "").match(
      /(?:TASK_ID\s*[:=]|任务ID\s*[:：]|\[task:)\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    )?.[1] || null;
    const attachChildTask = async (childId, taskId, parentEventId) => {
      const abandonOrphan = async () => {
        activeChildren.delete(childId);
        runtime.forgetSession?.(childId);
        const runEventId = childRunEvents.get(childId);
        if (runEventId) {
          await query(db, `UPDATE agent_events SET status='failed',finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running'`,
            [runEventId]);
          childRunEvents.delete(childId);
        }
        // Best-effort stop: an unbound L3 must not keep burning tools against a ghost task.
        try { await runtime.request("interrupt", { sessionId: childId }); } catch {}
      };
      const failBind = async (message) => {
        if (parentEventId) {
          await query(db, `UPDATE agent_events SET status='failed',output=?,finished_at=UTC_TIMESTAMP(3)
            WHERE id=? AND status IN ('running','completed')`, [String(message || "未能绑定 L3").slice(0, 1000), parentEventId]);
        }
        await abandonOrphan();
        return null;
      };
      let bindId = taskId || null;
      if (!bindId) {
        const queued = await query(db, `SELECT t.id FROM agent_task_execution_runs r
          JOIN agent_tasks t ON t.id=r.task_id
          WHERE t.target_type='l2_session' AND t.target_id=? AND r.executor_type='dsh_l3'
            AND r.status='queued' AND r.executor_id IS NULL AND r.task_revision=t.revision
          ORDER BY r.created_at`, [runtime.session.session_id]);
        const pending = queued.length ? queued : await query(db, `SELECT t.id FROM agent_tasks t
          WHERE t.target_type='l2_session' AND t.target_id=? AND t.status='pending_assignment'
          ORDER BY t.created_at`, [runtime.session.session_id]);
        if (pending.length !== 1) {
          return failBind(pending.length
            ? "dsh_l3 prompt 缺少 TASK_ID，当前有多条待指派任务，无法自动绑定"
            : "没有可绑定的任务。有空闲 L3 时 create_task 后必须带 TASK_ID 调用 dsh_l3；待指派任务也要带 TASK_ID。");
        }
        bindId = pending[0].id;
      }
      let task = null;
      try {
        task = await bindDshL3Execution(db, runtime.session.session_id, childId, bindId);
      } catch (error) {
        if (error?.status === 409 || error?.status === 404) return failBind(error.message);
        throw error;
      }
      if (!task) return failBind("排队任务未能绑定到本次 L3");
      ensureChildThinking(childId, task.id, job.message_id || task.source_message_id);
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
      // Sample while the live child is still reachable. Measuring after teardown
      // can create an empty session and persist used:0 over a good mid-run sample.
      try {
        await persistL3ContextStats(db, childId, await runtime.request("context", { sessionId: childId }));
      } catch (error) {
        console.error("L3 context sample skipped", {
          type: error?.name || "Error",
          diagnostic: redactSecrets(error?.message || error).slice(-1000),
        });
      }
      try {
        await persistL3RunCheckpoint(db, childId, await runtime.request("history", { sessionId: childId }));
      } catch (error) {
        console.error("L3 session snapshot skipped", {
          type: error?.name || "Error",
          diagnostic: redactSecrets(error?.message || error).slice(-1000),
        });
      }
      // Keep task children in the durable session tree so a later
      // send_message can cold-resume the same continuable child.
      await runtime.request("compact", { sessionId: childId, automatic: false }).catch(() => {});
      try {
        await persistL3ContextStats(db, childId, await runtime.request("context", { sessionId: childId }));
      } catch (error) {
        console.error("L3 context sample skipped", {
          type: error?.name || "Error",
          diagnostic: redactSecrets(error?.message || error).slice(-1000),
        });
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
      const callerSessionId = notification.method === "session.event"
        ? notification.params?.sessionId : null;
      if (callerSessionId && callerSessionId !== runtime.session.session_id)
        ensureChildThinking(callerSessionId)?.notify(notification);
      else runtime.thinking.notify(notification);
      lifecycle = lifecycle.then(async () => {
        if (notification.method === "session.event") {
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
            if (toolTasks.has(callId)) {
              const pending = toolTasks.get(callId);
              const childId = pending.childId || output.match(/started subagent\s+([^\s]+)/i)?.[1];
              if (childId) await attachChildTask(childId, pending.taskId, pending.parentEventId);
              toolTasks.delete(callId);
            }
            // create_task queues an unbound run; launch L3 in the same turn instead of
            // waiting for finishCoordinatorDispatch → l3_idle → another wake.
            // Host-bridge tool results sometimes omit sessionId; treat missing as parent.
            if (!callerSessionId || callerSessionId === runtime.session.session_id) {
              await launchAwaitingL3();
            }
          }
        } else if (notification.method === "subagent.started" && notification.params?.parentSessionId === runtime.session.session_id) {
          const childId = notification.params.childSessionId;
          activeChildren.add(childId);
          ensureChildThinking(childId);
          if (!childRunEvents.has(childId)) {
            const inserted = await query(db, `INSERT INTO agent_events
              (message_id,agent_session_id,tool,status,input) VALUES(?,?,'agent_run','running','{}')`,
            [job.message_id, childId]);
            childRunEvents.set(childId, inserted.insertId);
          }
          const [alreadyBound] = await query(db, `SELECT task_id FROM agent_task_execution_runs
            WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting') LIMIT 1`, [childId]);
          if (alreadyBound) {
            ensureChildThinking(childId, alreadyBound.task_id);
            return;
          }
          let pendingTask = null;
          for (const pending of toolTasks.values()) {
            if (!pending.childId) { pending.childId = childId; pendingTask = pending; break; }
          }
          await attachChildTask(childId, pendingTask?.taskId || inflightLaunch?.taskId, pendingTask?.parentEventId);
        } else if (notification.method === "subagent.finished" && notification.params?.parentSessionId === runtime.session.session_id) {
          const childId = notification.params.childSessionId;
          await closeChildThinking(childId);
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
      for (const item of launched) {
        activeChildren.add(item.childId);
        ensureChildThinking(item.childId, item.taskId);
      }
      if (job.kind === "l3_idle" && launched.length && !launchFailed.length) {
        if (activeChildren.size) runtime.watchChildren?.(handleAgentTeamNotification, () => lifecycle);
        completed = true;
        return { finalResponse: "NO_VISIBLE_MESSAGE", steeredMessageIds: [], mergedMessageIds: [],
          waiting: activeChildren.size > 0, runtime };
      }
      result = await runCoordinatorTurn(prompt);
      await lifecycle;
      // RPC to dispatch-l3 is serialized behind harness.run, so this is where
      // create_task-era launches actually execute (parent idle + runMaintenance).
      await launchAwaitingL3();
      for (const item of launched) {
        activeChildren.add(item.childId);
        ensureChildThinking(item.childId, item.taskId);
      }
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
         `SELECT q.message_id,q.interaction_source,m.thread_id,m.author_id,m.sequence,m.body,m.refs,m.execution_target,m.created_at,
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
  if ((job.kind === "child_result" || job.kind === "l3_idle") && !job.author_id) {
    const [member] = await query(db, `SELECT u.id FROM members m JOIN users u ON u.id=m.user_id
      JOIN threads t ON t.project_id=m.project_id WHERE t.id=? LIMIT 1`, [job.thread_id]);
    job.author_id = member?.id;
  }
  const service = new Service(db), user = { id: job.author_id, kind: "session" };
  let parkRuntime = null;
  try {
    const started = performance.now();
    const thread = await service.thread(user, job.thread_id, true);
    // Unmentioned multi-member turns: compose a draft, revise if new messages arrive, then send or discard.
    if (job.kind === "member_message" && job.participation === "pending") {
      await query(db, "UPDATE assistant_replies SET status='running',progress=? WHERE message_id=? AND status='queued'",
        ["正在斟酌是否参与", job.message_id]);
      let decision;
      try {
        decision = await composeOpportunisticParticipation(db, {
          title: thread.title,
          threadId: job.thread_id,
          messageId: job.message_id,
        });
      } catch (error) {
        console.error("Opportunistic participation crashed", {
          messageId: job.message_id,
          type: error?.name || "Error",
          diagnostic: redactSecrets(error?.stack || error?.message || error).slice(-2000),
        });
        decision = { respond: false, deferred: "judge_failed", burstIds: [job.message_id], revisions: 0 };
      }
      await transaction(db, async (conn) => {
        await service.thread(user, job.thread_id, true, conn);
        const [current] = await query(conn,
          "SELECT status FROM assistant_replies WHERE message_id=? FOR UPDATE", [job.message_id]);
        if (!current || !["queued", "running", "failed"].includes(current.status)) return;
        const burstIds = decision.burstIds?.length ? decision.burstIds : [job.message_id];
        if (!decision.respond) {
          await silenceOpportunisticBurst(conn, burstIds, decision.deferred);
          return;
        }
        const reply = await service.insertMessage(
          conn, user, job.thread_id, decision.message, [], "assistant", job.message_id);
        await absorbOpportunisticBurst(conn, burstIds, reply.id, job.message_id);
      });
      const wallDurationMs = performance.now() - started;
      await persistOpportunisticParticipationArtifacts(db, {
        messageId: job.message_id,
        threadId: job.thread_id,
        decision,
        wallDurationMs,
      });
      logParticipationDecision({
        messageId: job.message_id,
        threadId: job.thread_id,
        decision,
        durationMs: wallDurationMs,
      });
      return true;
    }
    if (job.kind !== "child_result" && job.kind !== "l3_idle") {
      await query(db, "UPDATE assistant_replies SET status='running',progress=? WHERE message_id=? AND status='queued'",
        ["小祥正在理解请求", job.message_id]);
    }
    await query(db, "UPDATE agent_sessions SET steering_epoch=steering_epoch+1,task_revision=task_revision+1,last_processed_sequence=?,convergence_state='active',replanning_count=0,wait_reason=NULL,convergence_until=NULL WHERE thread_id=?", [job.sequence, job.thread_id]);
    const context = job.kind === "l3_idle"
      ? { project_id: thread.project_id, title: thread.title }
      : await dispatchContext(db, thread, job);
    const loaded = performance.now();
    const result = await runAgent(context, { db, job, user });
    parkRuntime = result?.runtime || null;
    logAgentTiming({ messageId: job.message_id, kind: job.kind,
      stage: job.kind === "member_message" ? "coordinator_agent" : `coordinator_${job.kind}`,
      contextMs: Math.round(loaded - started), modelMs: Math.round(performance.now() - loaded) });
    const visible = result?.finalResponse?.trim() && result.finalResponse.trim() !== "NO_VISIBLE_MESSAGE"
      ? result.finalResponse.trim().slice(0, 4000) : null;
    // Flush streamed visible posts before deciding whether to append a final reply.
    if (result?.runtime?.thinking) await result.runtime.thinking.flush().catch(() => {});
    const posts = job.message_id
      ? await query(db, "SELECT id,body FROM messages WHERE agent_task_id=? AND source='assistant' ORDER BY sequence", [job.message_id])
      : [];
    const [liveChild] = await query(db, `SELECT r.id FROM agent_task_execution_runs r JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.origin_thread_id=? AND r.status IN ('queued','running','waiting') LIMIT 1`, [job.thread_id]);
    const waiting = !!(result?.waiting || liveChild);
    await query(db, "UPDATE agent_sessions SET convergence_state=?,wait_reason=?,updated_at=UTC_TIMESTAMP(3) WHERE thread_id=?",
      [waiting ? "waiting" : "stable", waiting ? "等待执行结果" : null, job.thread_id]);
    let responseId = posts[0]?.id || null;
    await transaction(db, async (conn) => {
      if (job.kind === "child_result" || job.kind === "l3_idle") {
        // Append a follow-up when L2 has something new to say. Identical bodies from
        // onVisibleText must not create a second chat bubble.
        if (visible) {
          const posted = await insertUniqueAssistantMessage(
            service, conn, user, job.thread_id, visible, job.message_id);
          if (posted) responseId = posted.id;
        }
        await query(conn, "UPDATE coordinator_events SET status='completed',finished_at=UTC_TIMESTAMP(3) WHERE id=?", [job.event_id]);
        return;
      }
      const [request] = await query(conn, "SELECT status FROM agent_requests WHERE message_id=? FOR UPDATE", [job.message_id]);
      if (request?.status !== "running") return;
      if (visible) {
        const posted = await insertUniqueAssistantMessage(
          service, conn, user, job.thread_id, visible, job.message_id);
        if (posted) responseId = responseId || posted.id;
      }
      await query(conn, `UPDATE assistant_replies SET status='completed',execution_active=?,participation=?,reply_id=?,progress=?,finished_at=UTC_TIMESTAMP(3) WHERE message_id=? AND status IN ('queued','running')`,
        [waiting, responseId ? "reply" : "silent", responseId, waiting ? "等待任务级 Agent" : "小祥已完成本轮处理", job.message_id]);
      await query(conn, "UPDATE agent_requests SET status='completed',response_id=?,error=NULL,first_response_at=COALESCE(first_response_at,UTC_TIMESTAMP(3)) WHERE message_id=?", [responseId, job.message_id]);
      for (const messageId of result?.mergedMessageIds || []) {
        await query(conn, "UPDATE assistant_replies SET status='completed',participation='reply',reply_id=?,progress='已并入当前 L2 处理周期',finished_at=UTC_TIMESTAMP(3) WHERE message_id=? AND status='queued'", [responseId, messageId]);
        await query(conn, "UPDATE agent_requests SET status='completed',response_id=?,error=NULL,first_response_at=COALESCE(first_response_at,UTC_TIMESTAMP(3)) WHERE message_id=? AND status='queued'", [responseId, messageId]);
      }
    });
  } catch (error) {
    const retryableBusy = error?.code === "L2_SESSION_BUSY"
      || error?.code === "L3_SESSION_BUSY"
      || /session is busy/i.test(String(error?.message || ""));
    await transaction(db, async (conn) => {
      if (job.kind === "child_result" || job.kind === "l3_idle") {
        if (retryableBusy) {
          await query(conn, `UPDATE coordinator_events SET status='queued',error=NULL,claimed_at=NULL,finished_at=NULL
            WHERE id=? AND status='running'`, [job.event_id]);
          return;
        }
        await query(conn, "UPDATE coordinator_events SET status='failed',error='小祥暂未响应，请重试。',finished_at=UTC_TIMESTAMP(3) WHERE id=?", [job.event_id]);
        return;
      }
      if (retryableBusy) {
        // Keep the member message queued so a later wake can answer once the lock frees.
        await query(conn, `UPDATE agent_requests SET status='queued',error=NULL,response_id=NULL
          WHERE message_id=? AND status='running'`, [job.message_id]);
        await query(conn, `UPDATE assistant_replies SET status='queued',error=NULL,progress='等待处理',finished_at=NULL
          WHERE message_id=? AND status IN ('queued','running')`, [job.message_id]);
        return;
      }
      await query(conn, "UPDATE agent_requests SET status='failed',error='小祥暂未响应，请重试。' WHERE message_id=?", [job.message_id]);
      await query(conn, "UPDATE assistant_replies SET status='failed',error='小祥暂未响应，请重试。' WHERE message_id=? AND status IN ('queued','running')", [job.message_id]);
      await query(conn, "UPDATE agent_task_updates SET approved=TRUE WHERE message_id=?", [job.message_id]);
    });
    console.error("Coordinator request failed", {
      messageId: job.message_id,
      type: error?.name || "Error",
      code: error?.code || null,
      retryableBusy,
      diagnostic: redactSecrets(error?.stack || error?.message || error).slice(-2500),
    });
  } finally {
    // Finish the request/event first (above), then park. Parking must not keep
    // agent_requests='running' while live L3 still occupies the harness RPC.
    if (parkRuntime) {
      try {
        await parkCoordinatorRuntime(job.thread_id, parkRuntime, true);
      } catch (error) {
        console.error("Coordinator runtime park failed", { type: error?.name || "Error" });
        await discardCoordinatorRuntime(job.thread_id, parkRuntime).catch(() => {});
      }
    }
    try {
      await finishCoordinatorDispatch(db, job.thread_id, { enqueueIdle: job.kind !== "l3_idle" });
    } catch (error) {
      console.error("Coordinator dispatch follow-up failed", {
        type: error?.name || "Error",
        diagnostic: redactSecrets(error?.message || error).slice(-1000),
      });
    }
  }
  return true;
}
