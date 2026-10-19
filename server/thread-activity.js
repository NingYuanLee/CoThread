import { query, transaction } from "./db.js";

/** 调用方须传入已有事务的连接。消息和排序时间在同一事务中提交。 */
export async function recordMessageActivity(conn, messageId) {
  return query(
    conn,
    "UPDATE threads t JOIN messages m ON m.id=? AND m.thread_id=t.id SET t.last_active_at=GREATEST(t.last_active_at,m.created_at)",
    [messageId],
  );
}

/** 一条语句提交事件结束状态与会话活跃时间，事务外调用也不会部分成功。 */
export function finishAgentEvent(
  db,
  eventId,
  { status, output, tool, bindTaskId, onlyStatuses } = {},
) {
  const sets = [
    "e.status=?",
    "e.finished_at=UTC_TIMESTAMP(3)",
    "t.last_active_at=GREATEST(t.last_active_at,UTC_TIMESTAMP(3))",
  ];
  const params = [status];
  if (output !== undefined) {
    sets.push("e.output=?");
    params.push(output);
  }
  if (tool !== undefined) {
    sets.push("e.tool=?");
    params.push(tool);
  }
  if (bindTaskId !== undefined) {
    sets.push("e.agent_task_id=COALESCE(e.agent_task_id,?)");
    params.push(bindTaskId);
  }
  params.push(eventId);
  let condition = "e.id=?";
  if (onlyStatuses?.length) {
    condition += ` AND e.status IN (${onlyStatuses.map(() => "?").join(",")})`;
    params.push(...onlyStatuses);
  }
  return query(
    db,
    `UPDATE agent_events e JOIN messages m ON m.id=e.message_id JOIN threads t ON t.id=m.thread_id SET ${sets.join(",")} WHERE ${condition}`,
    params,
  );
}

/** pool 自动建事务；连接参数必须来自调用方已有事务。 */
export function insertCompletedAgentEvent(
  db,
  { messageId, sessionId, tool, input, output, durationUs = 0 },
) {
  const insert = async (conn) => {
    const result = await query(
      conn,
      "INSERT INTO agent_events(message_id,agent_session_id,tool,status,input,output,created_at,finished_at) VALUES(?,?,?,'completed',?,?,DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MICROSECOND),UTC_TIMESTAMP(3))",
      [messageId, sessionId, tool, input, output, durationUs],
    );
    await query(
      conn,
      "UPDATE threads t JOIN messages m ON m.thread_id=t.id JOIN agent_events e ON e.message_id=m.id AND e.id=? SET t.last_active_at=GREATEST(t.last_active_at,e.finished_at)",
      [result.insertId],
    );
    return result;
  };
  return typeof db.getConnection === "function" ? transaction(db, insert) : insert(db);
}

/** 启动清理只更新本次结束的记录；同一语句的 UTC_TIMESTAMP 值一致，无时间窗扫表。 */
export function interruptRunningAgentEvents(db) {
  return query(
    db,
    "UPDATE agent_events e JOIN messages m ON m.id=e.message_id JOIN threads t ON t.id=m.thread_id SET e.status='failed',e.finished_at=UTC_TIMESTAMP(3),t.last_active_at=GREATEST(t.last_active_at,UTC_TIMESTAMP(3)) WHERE e.status='running'",
  );
}

export function finishSandboxRun(db, runId, { status, output, progress }) {
  return query(
    db,
    "UPDATE sandbox_runs r JOIN threads t ON t.id=r.thread_id SET r.status=?,r.output=?,r.progress=?,r.finished_at=UTC_TIMESTAMP(3),t.last_active_at=GREATEST(t.last_active_at,UTC_TIMESTAMP(3)) WHERE r.id=?",
    [status, output, progress, runId],
  );
}

export function interruptRunningSandboxRuns(db) {
  return query(
    db,
    "UPDATE sandbox_runs r JOIN threads t ON t.id=r.thread_id SET r.status='interrupted',r.output='服务重启，执行结果未确认；沙箱按超时回收。',r.finished_at=UTC_TIMESTAMP(3),t.last_active_at=GREATEST(t.last_active_at,UTC_TIMESTAMP(3)) WHERE r.status='running'",
  );
}
