import { query } from "./db.js";
import { HttpError } from "./http-error.js";

/** 任务条只看这两个状态：待确认（黄）与已阻塞（红）。 */
const TRACKED = ["awaiting_acceptance", "blocked"];

function zeroCounts() {
  return { awaiting_acceptance: 0, blocked: 0 };
}

/**
 * 本迭代任务统计：来源是我 / 指派给我 / 全部任务，各取待确认与已阻塞。
 * 口径固定在本迭代（origin_thread_id），跨迭代的数字对当前对话没有意义。
 */
export async function threadTaskStats(db, projectId, threadId, userId) {
  const [thread] = await query(db, "SELECT project_id FROM threads WHERE id=?", [threadId]);
  if (!thread || thread.project_id !== projectId) throw new HttpError(404, "迭代不存在");
  const rows = await query(
    db,
    `SELECT status,
      SUM(CASE WHEN source_user_id=? OR (created_by_type='human_member' AND created_by_id=?) THEN 1 ELSE 0 END) source_count,
      SUM(CASE WHEN target_type='human_member' AND target_id=? THEN 1 ELSE 0 END) target_count,
      COUNT(*) all_count
    FROM agent_tasks
    WHERE project_id=? AND origin_thread_id=? AND status IN ('awaiting_acceptance','blocked')
    GROUP BY status`,
    [userId, userId, userId, projectId, threadId],
  );
  const stats = { source: zeroCounts(), target: zeroCounts(), all: zeroCounts() };
  for (const row of rows) {
    if (!TRACKED.includes(row.status)) continue;
    stats.source[row.status] = Number(row.source_count || 0);
    stats.target[row.status] = Number(row.target_count || 0);
    stats.all[row.status] = Number(row.all_count || 0);
  }
  return stats;
}
