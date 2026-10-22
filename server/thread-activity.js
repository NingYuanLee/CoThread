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

const INTERRUPTED_SANDBOX_OUTPUT = "服务重启，执行结果未确认；沙箱按超时回收。";

// runs_side_* 已在 sandbox_runs 变更时写 threads。同一条语句再写 threads 会得到
// ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG。结束状态与活跃时间放在同一事务里，
// 活跃时间取本次 finished_at；失败则回到保存点，不留下已结束但未推进排序的记录。
// 不改归档确认那条 UPDATE：冻结仍由 status、快照、archived_at、last_active_at 一次写入。
async function sandboxActivity(db, fn) {
  const run = async (conn) => {
    await conn.query("SAVEPOINT sandbox_activity");
    try {
      const result = await fn(conn);
      await conn.query("RELEASE SAVEPOINT sandbox_activity");
      return result;
    } catch (error) {
      try {
        await conn.query("ROLLBACK TO SAVEPOINT sandbox_activity");
        await conn.query("RELEASE SAVEPOINT sandbox_activity");
      } catch (rollbackError) {
        const code = rollbackError?.code;
        console.error("Sandbox activity savepoint rollback failed", {
          code: typeof code === "string" ? code : undefined,
        });
      }
      throw error;
    }
  };
  return typeof db.getConnection === "function" ? transaction(db, run) : run(db);
}

export function finishSandboxRun(db, runId, { status, output, progress }) {
  return sandboxActivity(db, async (conn) => {
    const result = await query(
      conn,
      "UPDATE sandbox_runs SET status=?,output=?,progress=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
      [status, output, progress, runId],
    );
    await query(
      conn,
      "UPDATE threads t JOIN sandbox_runs r ON r.id=? AND r.thread_id=t.id AND r.finished_at IS NOT NULL SET t.last_active_at=GREATEST(t.last_active_at,r.finished_at)",
      [runId],
    );
    return result;
  });
}

export function interruptRunningSandboxRuns(db) {
  return sandboxActivity(db, async (conn) => {
    const running = await query(
      conn,
      "SELECT id FROM sandbox_runs WHERE status='running' FOR UPDATE",
    );
    if (!running.length) return { affectedRows: 0 };
    const ids = running.map((row) => row.id);
    const marks = ids.map(() => "?").join(",");
    const result = await query(
      conn,
      `UPDATE sandbox_runs SET status='interrupted',output=?,finished_at=UTC_TIMESTAMP(3) WHERE status='running' AND id IN (${marks})`,
      [INTERRUPTED_SANDBOX_OUTPUT, ...ids],
    );
    await query(
      conn,
      `UPDATE threads t JOIN (SELECT thread_id, MAX(finished_at) finished_at FROM sandbox_runs WHERE id IN (${marks}) AND finished_at IS NOT NULL GROUP BY thread_id) r ON r.thread_id=t.id SET t.last_active_at=GREATEST(t.last_active_at,r.finished_at)`,
      ids,
    );
    return result;
  });
}
