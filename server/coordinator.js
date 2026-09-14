import { query, transaction } from "./db.js";
import { Service } from "./service.js";
import { AGENT_MEMBER, mentionsAgent } from "../shared/agent-member.js";
import { formatAgentAction } from "../shared/agent-label.js";
import { loadProjectMembers } from "./project-memory.js";
import { redactSecrets } from "./model-config.js";
import { openAgentRuntime } from "./agent.js";
import { discussionText } from "../shared/context.js";
import { bindDshL3Execution, settleDshL3Execution } from "./task-pool.js";

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
  const [messages, replies, updates, memberRows, versionRows, quoteRows, documentSummaries] = await Promise.all([
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
        understandingThroughSequence: String(member.through_sequence || 0),
        understandingRefreshPending: BigInt(member.pending_through_sequence || 0)
          > BigInt(member.through_sequence || 0) })),
    { id: AGENT_MEMBER.id, name: AGENT_MEMBER.name,
      projectRole: AGENT_MEMBER.role, identityTag: AGENT_MEMBER.identity_tags[0],
      signature: "", messageCount: 0, understanding: null,
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
  const tasks = replies.map((reply) => {
    let args = {};
    try { args = typeof reply.last_tool_input === "string" ? JSON.parse(reply.last_tool_input) : reply.last_tool_input || {}; }
    catch {}
    const goalUpdates = updateGroups.get(reply.message_id) || [];
    return {
      taskId: reply.message_id,
      relatedMessageIds: [reply.message_id, ...goalUpdates.map((update) => update.messageId)],
      requestedBy: { id: reply.author_id, name: reply.author },
      createdAt: reply.created_at,
      status: reply.status,
      goal: brief(reply.request_body, 800),
      goalUpdates,
      documentVersionIds: documentVersionsByTask.get(reply.message_id) || [],
      progress: brief(reply.progress, 240),
      lastAction: reply.last_tool ? formatAgentAction(reply.last_tool, args) : null,
      lastActionStatus: reply.last_tool_status,
      resultSummary: brief(reply.result_body || reply.error, 1200),
      finishedAt: reply.finished_at,
    };
  });
  const latestMessage = records.find((message) => message.messageId === job.message_id)
    || records.find((message) => message.sequence === String(job.sequence));
  const historyMessages = records.filter((message) => message.messageId !== latestMessage?.messageId);
  let omittedOldest = 0;
  const summaries = [...sharedSummaries.values()];
  while (historyMessages.length && JSON.stringify({ historyMessages, tasks, summaries, latestMessage, memberContext }).length > 700000) {
    historyMessages.shift();
    omittedOldest++;
  }
  return {
    title: thread.title,
    messages: routedMessages,
    replies,
    promptContext: {
      history: { messages: historyMessages, omittedOldest },
      tasks,
      documentSummaries: summaries,
      latestMessage: { ...latestMessage,
        directlyAddressed: mentionsAgent(job.body) || job.participation === "reply" },
      members: memberContext,
    },
  };
}

export async function runCoordinatorAgent(context, { db, job, user }) {
  const runtime = await openAgentRuntime(context, { db, job, user, role: "coordinator" });
  let completed = false;
  try {
    const prompt = `当前项目：${context.project_id}；当前迭代：${job.thread_id}；触发消息：${job.message_id}。
本次触发消息及其上下文如下：${JSON.stringify(context.promptContext || context)}
请先理解并按需调用工具。你每次模型回复里的可见正文会进入群聊给成员看，不要把思考、工具过程或内部确认写进正文。没有要对成员说的话时返回 NO_VISIBLE_MESSAGE。post_message 只用于额外插入一条与当前模型回复不同的独立消息。结束前必须根据状态调用 finish_turn 或 wait_for_updates。`;
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
    const activeChildren = new Set();
    let lifecycle = Promise.resolve();
    let childSettled;
    const taskIdFromPrompt = (value) => String(value || "").match(/(?:TASK_ID\s*[:=]|\[task:)\s*([0-9a-f]{8}-[0-9a-f-]{27,36})/i)?.[1] || null;
    const notificationText = (blocks = []) => blocks.filter((block) => block?.type === "text")
      .map((block) => block.text || "").join("\n");
    const retainOrForgetChild = async (childId, task) => {
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
              await query(db, "UPDATE agent_events SET status=?,output=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
                [failed ? "failed" : "completed", output.slice(0, 1000), nativeEvent.id]);
              nativeToolEvents.delete(callId);
            }
            if (!toolTasks.has(callId)) return;
            const pending = toolTasks.get(callId);
            const childId = pending.childId || output.match(/started subagent\s+([^\s]+)/i)?.[1];
            if (childId && pending.taskId) {
              const task = await bindDshL3Execution(db, runtime.session.session_id, childId, pending.taskId);
              if (task) await query(db, `UPDATE agent_events SET agent_task_id=?
                WHERE agent_session_id=? AND agent_task_id IS NULL
                  AND created_at>=(SELECT created_at FROM (SELECT created_at FROM agent_events WHERE id=?) parent_event)`,
              [task.id, childId, pending.parentEventId]);
              const finished = finishedChildren.get(childId);
              if (task && finished) {
                finishedChildren.delete(childId);
                const settled = await settleDshL3Execution(db, runtime.session.session_id, childId, finished);
                await retainOrForgetChild(childId, settled);
              }
            }
            toolTasks.delete(callId);
          }
        } else if (notification.method === "subagent.started" && notification.params?.parentSessionId === runtime.session.session_id) {
          const childId = notification.params.childSessionId;
          activeChildren.add(childId);
          const inserted = await query(db, `INSERT INTO agent_events
            (message_id,agent_session_id,tool,status,input) VALUES(?,?,'agent_run','running','{}')`,
          [job.message_id, childId]);
          childRunEvents.set(childId, inserted.insertId);
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
        }
      }).catch((error) => console.error("AgentTeam task lifecycle sync failed", {
        type: error?.name || "Error", diagnostic: redactSecrets(error?.message || error).slice(-1000),
      }));
    };
    let result;
    try {
      result = await runtime.harness.run(prompt, {
        sessionId: runtime.session.session_id,
        onNotification: handleAgentTeamNotification,
      });
      await lifecycle;
      let followups = 0;
      const childWaitDeadline = Date.now() + 9 * 60 * 1000;
      while (activeChildren.size && followups < 7 && Date.now() < childWaitDeadline) {
        let childReturned = false;
        await Promise.race([
          new Promise((resolve) => { childSettled = () => { childReturned = true; resolve(); }; }),
          new Promise((resolve) => setTimeout(resolve, Math.max(1, childWaitDeadline - Date.now()))),
        ]);
        childSettled = undefined;
        await lifecycle;
        if (!childReturned) break;
        result = await runtime.harness.run(`至少一个 DSH L3 已返回，当前仍有 ${activeChildren.size} 个 L3 在运行。请立即读取任务池中的新结果并继续当前 ReAct 循环；可以发言、调整其他任务或继续等待，不必等全部 L3 完成。收敛后调用 finish_turn 或 wait_for_updates。`, {
          sessionId: runtime.session.session_id,
          onNotification: handleAgentTeamNotification,
        });
        followups++;
      }
      await lifecycle;
      await steerNewMessages();
      completed = true;
      return { ...result, steeredMessageIds: [...steeredMessageIds], mergedMessageIds: [...mergedMessageIds], runtime };
    } finally {
      clearInterval(steeringTimer);
      await steerNewMessages().catch(() => {});
    }
  } finally {
    await runtime.close(completed);
  }
}

export async function processNextCoordinator(db, threadId, runAgent = runCoordinatorAgent) {
  const candidates = threadId ? [{ thread_id: threadId }] : await query(db,
    `SELECT m.thread_id FROM agent_requests q JOIN messages m ON m.id=q.message_id
     WHERE q.status='queued' GROUP BY m.thread_id ORDER BY MIN(m.sequence)`);
  let job;
  for (const candidate of candidates) {
    job = await transaction(db, async (conn) => {
      // A concurrent child claim holds this row briefly. Skipping it would
      // report "idle" even with queued requests and let the hosted runner exit.
      const [thread] = await query(conn, "SELECT id FROM threads WHERE id=? FOR UPDATE", [candidate.thread_id]);
      if (!thread) return;
      const [active] = await query(conn,
        `SELECT q.message_id FROM agent_requests q JOIN messages m ON m.id=q.message_id
         WHERE m.thread_id=? AND q.status='running' LIMIT 1`, [thread.id]);
      if (active) return;
      const [next] = await query(conn,
         `SELECT q.message_id,m.thread_id,m.author_id,m.sequence,m.body,m.execution_target,r.participation,r.status reply_status,r.reply_id FROM agent_requests q
         JOIN messages m ON m.id=q.message_id LEFT JOIN assistant_replies r ON r.message_id=m.id
         WHERE m.thread_id=? AND q.status='queued' ORDER BY m.sequence LIMIT 1`, [thread.id]);
      if (next?.reply_status && !["queued", "running"].includes(next.reply_status)) {
        // Older workers may have finished the reply without consuming routing.
        // Reconcile the receipt without calling a model or repeating the work.
        await query(conn, "UPDATE agent_requests SET status='completed',response_id=? WHERE message_id=?", [next.reply_id, next.message_id]);
        return { alreadyHandled: true };
      }
      if (next) await query(conn, "UPDATE agent_requests SET status='running' WHERE message_id=?", [next.message_id]);
      return next;
    });
    if (job) break;
  }
  if (!job) return false;
  if (job.alreadyHandled) return true;
  const service = new Service(db), user = { id: job.author_id, kind: "session" };
  try {
    const started = performance.now();
    const thread = await service.thread(user, job.thread_id, true);
    const context = await dispatchContext(db, thread, job);
    const loaded = performance.now();
    await query(db, "UPDATE assistant_replies SET status='running',progress='小祥正在持续分析' WHERE message_id=? AND status='queued'", [job.message_id]);
    await query(db, "UPDATE agent_sessions SET steering_epoch=steering_epoch+1,task_revision=task_revision+1,last_processed_sequence=?,convergence_state='active',replanning_count=0,wait_reason=NULL,convergence_until=NULL WHERE thread_id=?", [job.sequence, job.thread_id]);
    const result = await runAgent(context, { db, job, user });
    const visible = result?.finalResponse?.trim() && result.finalResponse.trim() !== "NO_VISIBLE_MESSAGE"
      ? result.finalResponse.trim().slice(0, 4000) : null;
    const [posted] = await query(db, "SELECT id FROM messages WHERE agent_task_id=? ORDER BY sequence DESC LIMIT 1", [job.message_id]);
    let responseId = posted?.id || null;
    await transaction(db, async (conn) => {
      const [request] = await query(conn, "SELECT status FROM agent_requests WHERE message_id=? FOR UPDATE", [job.message_id]);
      if (request?.status !== "running") return;
      if (!responseId && visible) responseId = (await service.insertMessage(conn, user, job.thread_id, visible, [], "assistant", job.message_id)).id;
      await query(conn, `UPDATE assistant_replies SET status='completed',participation=?,reply_id=?,progress='小祥已完成本轮处理',finished_at=UTC_TIMESTAMP(3) WHERE message_id=? AND status IN ('queued','running')`, [responseId ? "reply" : "silent", responseId, job.message_id]);
      await query(conn, "UPDATE agent_requests SET status='completed',response_id=?,error=NULL,first_response_at=COALESCE(first_response_at,UTC_TIMESTAMP(3)) WHERE message_id=?", [responseId, job.message_id]);
      for (const messageId of result?.mergedMessageIds || []) {
        await query(conn, "UPDATE assistant_replies SET status='completed',participation='reply',reply_id=?,progress='已并入当前 L2 处理周期',finished_at=UTC_TIMESTAMP(3) WHERE message_id=? AND status='queued'", [responseId, messageId]);
        await query(conn, "UPDATE agent_requests SET status='completed',response_id=?,error=NULL,first_response_at=COALESCE(first_response_at,UTC_TIMESTAMP(3)) WHERE message_id=? AND status='queued'", [responseId, messageId]);
      }
    });
    console.log("Agent timing", { messageId: job.message_id, stage: "coordinator_agent", contextMs: Math.round(loaded - started), modelMs: Math.round(performance.now() - loaded) });
  } catch (error) {
    await transaction(db, async (conn) => {
      await query(conn, "UPDATE agent_requests SET status='failed',error='小祥暂未响应，请重试。' WHERE message_id=?", [job.message_id]);
      await query(conn, "UPDATE assistant_replies SET status='failed',error='小祥暂未响应，请重试。' WHERE message_id=? AND status IN ('queued','running')", [job.message_id]);
      // A correction must not leave its running task stuck behind a failed
      // routing request. The original child can interpret the member's text.
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
