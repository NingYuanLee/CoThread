import { query } from "./db.ts";
import { HttpError } from "./http-error.js";
import type { Db } from "./types.ts";

/** 任务条四个阶段：待接受、进行中、已阻塞、待验收。 */
const BUCKETS = {
  pending: ["pending_assignment", "awaiting_acceptance"],
  active: ["pending_start", "assigned", "queued", "running", "waiting"],
  blocked: ["blocked", "failed"],
  review: ["completed"],
} as const;

/** 阶段名，取自 BUCKETS 的键。 */
type Bucket = keyof typeof BUCKETS;

/** 每个阶段的计数。 */
type BucketCounts = Record<Bucket, number>;

/** 本迭代任务统计：来源、指派、全部，各自四阶段计数。 */
export type TaskStats = {
  source: BucketCounts;
  target: BucketCounts;
  all: BucketCounts;
};

function zeroCounts(): BucketCounts {
  return { pending: 0, active: 0, blocked: 0, review: 0 };
}

function bucketOf(status: string): Bucket | null {
  for (const [bucket, statuses] of Object.entries(BUCKETS) as [Bucket, readonly string[]][]) {
    if (statuses.includes(status)) return bucket;
  }
  return null;
}

/**
 * 本迭代任务统计：来源 / 指派，各取待接受、进行中、已阻塞、待验收。
 * 口径固定在本迭代（origin_thread_id），跨迭代的数字对当前对话没有意义。
 */
export async function threadTaskStats(
  db: Db,
  projectId: string,
  threadId: string,
  userId: string,
): Promise<TaskStats> {
  const [thread] = await query(db, "SELECT project_id FROM threads WHERE id=?", [threadId]);
  if (!thread || thread.project_id !== projectId) throw new HttpError(404, "迭代不存在");
  const tracked: readonly string[] = Object.values(BUCKETS).flat();
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
  const stats: TaskStats = { source: zeroCounts(), target: zeroCounts(), all: zeroCounts() };
  for (const row of rows) {
    const bucket = bucketOf(row.status);
    if (!bucket) continue;
    stats.source[bucket] += Number(row.source_count || 0);
    stats.target[bucket] += Number(row.target_count || 0);
    stats.all[bucket] += Number(row.all_count || 0);
  }
  return stats;
}
