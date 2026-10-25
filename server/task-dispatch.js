/** 任务域：dispatch。内部依赖具体领域模块，不依赖 task-pool 兼容入口。 */
import { assertIterationWritable } from "./iteration-state.js";

import { query, transaction } from "./db.js";

import { enqueueCoordinatorEvent } from "./coordinator-events.js";

import { composeTaskInstruction } from "./task-pool-helpers.js";
import { recordTaskStatusChange } from "./task-pool-activity.js";

import { MAX_Child } from "./task-policy.js";
import { documentsForTaskInstruction } from "./task-documents.js";
import { getTask } from "./task-queries.js";
import { buildChildTaskBrief } from "../shared/prompt-blocks.js";
import { DEFAULT_PERSONA_KEY, personaByKey, personaPrompt } from "../shared/agent-personas.js";
import { SYSTEM_PROMPTS } from "../dsh-layer/cothread-plugin-registry.mjs";
export async function busyChildCount(conn, xiaoxiangSessionId) {
  const [row] = await query(
    conn,
    `SELECT COUNT(DISTINCT t.id) active FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE t.target_type='xiaoxiang' AND t.target_id=? AND r.executor_type='child_agent'
      AND (
        r.status IN ('running','waiting')
        OR (r.status='queued' AND r.executor_id IS NULL AND r.task_revision=t.revision)
      )`,
    [xiaoxiangSessionId],
  );
  return Number(row?.active || 0);
}

export async function idleChildCount(conn, xiaoxiangSessionId) {
  if (!xiaoxiangSessionId) return 0;
  return Math.max(0, MAX_Child - (await busyChildCount(conn, xiaoxiangSessionId)));
}

export async function liveChildCount(conn, xiaoxiangSessionId) {
  const [row] = await query(
    conn,
    `SELECT COUNT(DISTINCT t.id) active FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE t.target_type='xiaoxiang' AND t.target_id=? AND r.executor_type='child_agent'
      AND r.status IN ('running','waiting')`,
    [xiaoxiangSessionId],
  );
  return Number(row?.active || 0);
}

export async function tasksAwaitingChildLaunch(db, xiaoxiangSessionId) {
  if (!xiaoxiangSessionId) return [];
  const room = MAX_Child - (await liveChildCount(db, xiaoxiangSessionId));
  if (room <= 0) return [];
  return query(
    db,
    `SELECT id FROM agent_tasks t
    WHERE t.target_type='xiaoxiang' AND t.target_id=?
      AND t.task_type IN ('assist','formal')
      AND t.status IN ('pending_assignment','running','queued')
      AND (t.execution_agent_id IS NULL OR t.execution_agent_id='')
      AND NOT EXISTS (
        SELECT 1 FROM agent_task_execution_runs r
        WHERE r.task_id=t.id AND r.executor_type='child_agent' AND r.executor_id IS NOT NULL
          AND r.status IN ('running','waiting')
      )
    ORDER BY t.status='pending_assignment', t.created_at
    LIMIT ${room}`,
    [xiaoxiangSessionId],
  );
}

/**
 * 重建子 Agent 的任务书（不看是否已绑定执行者）。
 * 派发时用来生成 prompt，补轨迹时用同一份逻辑重建，两处口径一致。
 */
export async function childTaskBrief(db, taskId) {
  const task = await getTask(db, taskId);
  if (!task) return null;
  const personaKey = personaByKey(task.persona)?.key || DEFAULT_PERSONA_KEY;
  const personaText = personaPrompt(personaKey);
  const { documents, folders } = await documentsForTaskInstruction(
    db,
    task.project_id,
    task.document_refs,
    task.folder_refs,
  );
  let dialogueMode = null;
  if (task.source_message_id) {
    const [request] = await query(
      db,
      "SELECT dialogue_mode FROM agent_requests WHERE message_id=?",
      [task.source_message_id],
    );
    dialogueMode = request?.dialogue_mode || null;
  }
  const brief = buildChildTaskBrief({
    taskId: task.id,
    dialogueMode,
    sourceRequestId: task.source_message_id || null,
    instruction: composeTaskInstruction(task, documents, folders),
    persona: { key: personaKey, text: personaText },
  });
  return {
    task,
    label: String(task.title || "任务").slice(0, 80),
    prompt: brief.prompt,
    blocks: brief.blocks,
    systemPrompt: SYSTEM_PROMPTS.child_agent.prompt,
    persona: personaKey,
    personaPrompt: personaText,
  };
}

export async function childLaunchPrompt(db, taskId) {
  const brief = await childTaskBrief(db, taskId);
  if (!brief || brief.task.execution_agent_id) return null;
  return brief;
}

/**
 * 子 Agent 的轨迹注入：派活时把「任务书 + 对话模式」与它的系统提示词落库，
 * 轨迹里就能像小祥一样看到上下文和系统提示词，而不是只有工具调用。
 */
export async function recordChildLaunchTrace(db, { taskId, messageId, childSessionId, brief }) {
  if (!taskId || !messageId || !childSessionId || !brief) return;
  // 自动派发和手动 bind 都会走到这里：同一个子会话只记一次，避免轨迹里出现两份注入。
  const write = async (tool, input, output) => {
    const [exists] = await query(
      db,
      "SELECT id FROM agent_events WHERE agent_task_id=? AND agent_session_id=? AND tool=? LIMIT 1",
      [taskId, childSessionId, tool],
    ).catch(() => []);
    if (exists) return;
    await query(
      db,
      `INSERT INTO agent_events(message_id,agent_session_id,agent_task_id,tool,status,input,output,created_at,finished_at)
       VALUES(?,?,?,?,'completed',?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
      [messageId, childSessionId, taskId, tool, input.slice(0, 4000), output.slice(0, 4000)],
    ).catch((error) =>
      console.error("Child launch trace persistence failed", {
        taskId,
        type: error?.name || "Error",
      }),
    );
  };
  const blocks = (brief.blocks || []).map((block) => ({
    name: block.name,
    trust: block.trust,
    version: block.version,
    chars: block.text.length,
  }));
  await write(
    "context_notice",
    brief.prompt,
    JSON.stringify({
      kind: "cothread-child-context",
      form: "notice",
      summary: "任务书 / 对话模式",
      promptChars: brief.prompt.length,
      blocks,
    }),
  );
  await write(
    "system_prompt",
    brief.systemPrompt,
    JSON.stringify({
      kind: "cothread-system-prompt",
      form: "system",
      summary: "子 Agent 系统提示词",
    }),
  );
}

export async function childDispatchSnapshot(conn, xiaoxiangSessionId) {
  const idleChildCountValue = await idleChildCount(conn, xiaoxiangSessionId);
  const pending = await query(
    conn,
    `SELECT id,title FROM agent_tasks
    WHERE target_type='xiaoxiang' AND target_id=? AND status='pending_assignment'
    ORDER BY created_at`,
    [xiaoxiangSessionId],
  );
  return {
    idleChildCount: idleChildCountValue,
    pendingAssignment: pending.length,
    pendingTasks: pending.slice(0, idleChildCountValue).map((task) => ({
      id: task.id,
      title: String(task.title || "").slice(0, 80),
    })),
  };
}

export async function finishCoordinatorDispatch(db, threadId, { enqueueIdle = true } = {}) {
  if (!threadId) return { released: 0, enqueued: false };
  const released = await transaction(db, async (conn) => {
    await assertIterationWritable(conn, threadId);
    const [session] = await query(
      conn,
      "SELECT session_id FROM agent_sessions WHERE thread_id=? FOR UPDATE",
      [threadId],
    );
    if (!session) return 0;
    const rows = await query(
      conn,
      `SELECT t.id,t.status,r.id run_id FROM agent_tasks t
      JOIN agent_task_execution_runs r ON r.task_id=t.id AND r.task_revision=t.revision
      WHERE t.origin_thread_id=? AND t.target_type='xiaoxiang' AND t.target_id=?
        AND t.task_type IN ('assist','formal') AND t.status='running'
        AND r.executor_type='child_agent' AND r.status='queued' AND r.executor_id IS NULL
      FOR UPDATE`,
      [threadId, session.session_id],
    );
    for (const row of rows) {
      await query(
        conn,
        `UPDATE agent_task_execution_runs SET status='cancelled',error='本轮未绑定子 Agent，退回待指派',
        finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='queued'`,
        [row.run_id],
      );
      await query(
        conn,
        `UPDATE agent_tasks SET status='pending_assignment',execution_agent_id=NULL,
        progress='本轮未绑定子 Agent，退回待指派',finished_at=NULL,revision=revision+1
        WHERE id=? AND status='running'`,
        [row.id],
      );
      await recordTaskStatusChange(
        conn,
        row.id,
        row.status,
        { type: "system" },
        "本轮未绑定子 Agent，退回待指派",
      );
    }
    return rows.length;
  });
  if (!enqueueIdle) return { released, enqueued: false };
  const [session] = await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [
    threadId,
  ]);
  if (!session) return { released, enqueued: false };
  const snapshot = await childDispatchSnapshot(db, session.session_id);
  if (!snapshot.pendingAssignment || snapshot.idleChildCount < 1)
    return { released, enqueued: false };
  const [existing] = await query(
    db,
    `SELECT id FROM coordinator_events
    WHERE thread_id=? AND kind='child_idle' AND status IN ('queued','running') LIMIT 1`,
    [threadId],
  );
  if (existing) return { released, enqueued: false };
  const [source] = await query(
    db,
    `SELECT id,title,source_message_id,source_user_id FROM agent_tasks
    WHERE id=?`,
    [snapshot.pendingTasks[0].id],
  );
  await enqueueCoordinatorEvent(db, {
    threadId,
    kind: "child_idle",
    messageId: source?.source_message_id || null,
    taskId: source?.id || null,
    payload: {
      ...snapshot,
      title: source?.title || null,
      sourceMessageId: source?.source_message_id || null,
      sourceUserId: source?.source_user_id || null,
    },
  });
  return { released, enqueued: true };
}
