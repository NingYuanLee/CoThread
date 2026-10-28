import { query } from "./db.js";
import { HttpError } from "./http-error.js";

/** 任务条四个阶段：待接受、进行中、已阻塞、待验收。 */
const BUCKETS = {
  pending: ["pending_assignment", "awaiting_acceptance"],
  active: ["pending_start", "assigned", "queued", "running", "waiting"],
  blocked: ["blocked", "failed"],
  review: ["completed"],
};

function zeroCounts() {
  return { pending: 0, active: 0, blocked: 0, review: 0 };
}

function bucketOf(status) {
  return Object.entries(BUCKETS).find(([, statuses]) => statuses.includes(status))?.[0] || null;
}

/**
 * 本迭代任务统计：来源 / 指派，各取待接受、进行中、已阻塞、待验收。
 * 口径固定在本迭代（origin_thread_id），跨迭代的数字对当前对话没有意义。
 */
export async function threadTaskStats(db, projectId, threadId, userId) {
  const [thread] = await query(db, "SELECT project_id FROM threads WHERE id=?", [threadId]);
  if (!thread || thread.project_id !== projectId) throw new HttpError(404, "迭代不存在");
  const tracked = Object.values(BUCKETS).flat();
  const rows = await query(
    db,
    `SELECT status,
      SUM(CASE WHEN source_user_id=? OR (created_by_type='human_member' AND created_by_id=?) THEN 1 ELSE 0 END) source_count,
      SUM(CASE WHEN target_type='human_member' AND target_id=? THEN 1 ELSE 0 END) target_count,
      COUNT(*) all_count
    FROM agent_tasks
    WHERE project_id=? AND origin_thread_id=? AND status IN (${tracked.map(() => "?").join(",")})
    GROUP BY status`,
    [userId, userId, userId, projectId, threadId, ...tracked],
  );
  const stats = { source: zeroCounts(), target: zeroCounts(), all: zeroCounts() };
  for (const row of rows) {
    const bucket = bucketOf(row.status);
    if (!bucket) continue;
    stats.source[bucket] += Number(row.source_count || 0);
    stats.target[bucket] += Number(row.target_count || 0);
    stats.all[bucket] += Number(row.all_count || 0);
  }
  return stats;
}
