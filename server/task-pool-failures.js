import { query } from "./db.js";

const PLATFORM_FAILURE =
  /任务已停止|迭代已归档|权限不足|没有权限|限流|too many requests|rate limit|service unavailable|temporarily unavailable|timeout|timed out|\b5\d\d\b|econnreset|econnrefused|网络错误|网络中断|服务不可用/i;

export function failureSignature(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<id>")
    .replace(/\b\d{2,}\b/g, "<n>")
    .replace(/\s+/g, " ")
    .slice(0, 255);
}

export function classifyTaskFailure({ status, error, summary, stopReason, toolError } = {}) {
  if (status === "blocked") return "blocked";
  if (stopReason === "aborted") return "interrupted";
  const text = [error, summary, toolError].filter(Boolean).join(" ");
  if (PLATFORM_FAILURE.test(text)) return "platform_blocked";
  if (/未回报结果|没有结果|未完成|无法继续|失败/i.test(text)) return "agent_error";
  if (/timeout|timed out|暂时|重试|retry|429|408/i.test(text)) return "transient";
  return "agent_error";
}

export function failureText({ error, summary, toolError, stopReason } = {}) {
  return error || toolError || summary || stopReason || null;
}

export async function latestToolFailure(conn, childSessionId) {
  if (!childSessionId) return null;
  const [row] = await query(
    conn,
    `SELECT tool,output FROM agent_events
    WHERE agent_session_id=? AND status='failed' ORDER BY id DESC LIMIT 1`,
    [childSessionId],
  );
  return row ? `${row.tool || "tool"}: ${row.output || "工具失败"}` : null;
}

export async function taskRetryStats(conn, taskId, signature, executorId) {
  const [same] = await query(
    conn,
    `SELECT COUNT(*) count FROM agent_task_execution_runs
    WHERE task_id=? AND failure_signature=?`,
    [taskId, signature],
  );
  const [executor] = await query(
    conn,
    `SELECT COUNT(*) count FROM agent_task_execution_runs
    WHERE task_id=? AND executor_id=? AND status IN ('failed','interrupted','completed')`,
    [taskId, executorId],
  );
  const [distinct] = await query(
    conn,
    `SELECT COUNT(DISTINCT executor_id) count FROM agent_task_execution_runs
    WHERE task_id=? AND executor_type='dsh_l3' AND executor_id IS NOT NULL`,
    [taskId],
  );
  return {
    sameSignature: Number(same?.count || 0),
    executorAttempts: Number(executor?.count || 0),
    distinctExecutors: Number(distinct?.count || 0),
  };
}
