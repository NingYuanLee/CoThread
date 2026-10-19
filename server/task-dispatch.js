/** 任务域：dispatch。内部依赖具体领域模块，不依赖 task-pool 兼容入口。 */
import { assertIterationWritable } from "./iteration-state.js";

import { query, transaction } from "./db.js";

import { enqueueCoordinatorEvent } from "./coordinator-events.js";

import { composeTaskInstruction } from "./task-pool-helpers.js";
import { recordTaskStatusChange } from "./task-pool-activity.js";

import { MAX_L3 } from "./task-policy.js";
import { documentsForTaskInstruction } from "./task-documents.js";
import { getTask } from "./task-queries.js";
export async function busyL3Count(conn, l2SessionId) {
  const [row] = await query(
    conn,
    `SELECT COUNT(DISTINCT t.id) active FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE t.target_type='l2_session' AND t.target_id=? AND r.executor_type='dsh_l3'
      AND (
        r.status IN ('running','waiting')
        OR (r.status='queued' AND r.executor_id IS NULL AND r.task_revision=t.revision)
      )`,
    [l2SessionId],
  );
  return Number(row?.active || 0);
}

export async function idleL3Count(conn, l2SessionId) {
  if (!l2SessionId) return 0;
  return Math.max(0, MAX_L3 - (await busyL3Count(conn, l2SessionId)));
}

export async function liveL3Count(conn, l2SessionId) {
  const [row] = await query(
    conn,
    `SELECT COUNT(DISTINCT t.id) active FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE t.target_type='l2_session' AND t.target_id=? AND r.executor_type='dsh_l3'
      AND r.status IN ('running','waiting')`,
    [l2SessionId],
  );
  return Number(row?.active || 0);
}

export async function tasksAwaitingL3Launch(db, l2SessionId) {
  if (!l2SessionId) return [];
  const room = MAX_L3 - (await liveL3Count(db, l2SessionId));
  if (room <= 0) return [];
  return query(
    db,
    `SELECT id FROM agent_tasks t
    WHERE t.target_type='l2_session' AND t.target_id=?
      AND t.task_type IN ('assist_l2','formal')
      AND t.status IN ('pending_assignment','running','queued')
      AND (t.execution_agent_id IS NULL OR t.execution_agent_id='')
      AND NOT EXISTS (
        SELECT 1 FROM agent_task_execution_runs r
        WHERE r.task_id=t.id AND r.executor_type='dsh_l3' AND r.executor_id IS NOT NULL
          AND r.status IN ('running','waiting')
      )
    ORDER BY t.status='pending_assignment', t.created_at
    LIMIT ${room}`,
    [l2SessionId],
  );
}

export async function l3LaunchPrompt(db, taskId) {
  const task = await getTask(db, taskId);
  if (!task || task.execution_agent_id) return null;
  const { documents, folders } = await documentsForTaskInstruction(
    db,
    task.project_id,
    task.document_refs,
    task.folder_refs,
  );
  return {
    task,
    label: String(task.title || "任务").slice(0, 80),
    prompt: `TASK_ID: ${task.id}\n${composeTaskInstruction(task, documents, folders)}`,
  };
}

export async function l3DispatchSnapshot(conn, l2SessionId) {
  const idleL3CountValue = await idleL3Count(conn, l2SessionId);
  const pending = await query(
    conn,
    `SELECT id,title FROM agent_tasks
    WHERE target_type='l2_session' AND target_id=? AND status='pending_assignment'
    ORDER BY created_at`,
    [l2SessionId],
  );
  return {
    idleL3Count: idleL3CountValue,
    pendingAssignment: pending.length,
    pendingTasks: pending.slice(0, idleL3CountValue).map((task) => ({
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
      WHERE t.origin_thread_id=? AND t.target_type='l2_session' AND t.target_id=?
        AND t.task_type IN ('assist_l2','formal') AND t.status='running'
        AND r.executor_type='dsh_l3' AND r.status='queued' AND r.executor_id IS NULL
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
  const snapshot = await l3DispatchSnapshot(db, session.session_id);
  if (!snapshot.pendingAssignment || snapshot.idleL3Count < 1) return { released, enqueued: false };
  const [existing] = await query(
    db,
    `SELECT id FROM coordinator_events
    WHERE thread_id=? AND kind='l3_idle' AND status IN ('queued','running') LIMIT 1`,
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
    kind: "l3_idle",
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
