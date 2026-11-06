import { query } from "./db.ts";
import { upsertMemoryPage } from "./memory-pages.ts";
import type { Db } from "./types.ts";

const DONE = new Set(["completed", "failed", "cancelled", "superseded"]);
const HUMAN_EXECUTORS = new Set(["human_self", "human_local_executor"]);

const EXECUTOR_LABELS = {
  child_agent: "子 Agent",
  human_self: "人类（本人）",
  human_local_executor: "人类（本地执行器）",
  dsh_l3: "子 Agent",
};

/** `agent_tasks` 的投影行（`loadTaskMemoryStats` 的查询列）。 */
type TaskMemoryRow = {
  id: string;
  title: string | null;
  goal: string | null;
  constraints: string | null;
  status: string;
  taskType: string | null;
  sourceType: string | null;
  executionAgentType: string | null;
  retryCount: number | string | null;
  revision: number | string | null;
  resultSummary: string | null;
  progress: string | null;
  finishedAt: string | null;
  createdAt: string | null;
  threadId: string | null;
  createdByType: string | null;
  createdById: string | null;
  reopenCount: number | string;
};

/** `agent_task_execution_runs` 的投影行。 */
type TaskRunRow = {
  taskId: string;
  executorType: string | null;
  status: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

/** 任务行 + 派生统计，任务记忆的输入。 */
export type TaskMemoryStats = TaskMemoryRow & {
  runCount: number;
  failedRuns: number;
  executorLabel: string;
  human: boolean;
  durationMs: number;
  reworked: boolean;
  errors: string[];
  done: boolean;
};

/** 只用到执行者与来源两个字段的判定入参。 */
type TaskIdentity = { executionAgentType?: string | null; sourceType?: string | null };

/** 只用到起止时间的耗时计算入参。 */
type TaskTiming = { createdAt?: string | null; finishedAt?: string | null };

export function executorLabel(type: string | null | undefined): string {
  return (type && (EXECUTOR_LABELS as Record<string, string>)[type]) || "未指派";
}

export function isHumanTask(task: TaskIdentity): boolean {
  // 按执行者判定：人类发起但由子 Agent 执行的任务仍算子 Agent 任务。
  if (task.executionAgentType) return HUMAN_EXECUTORS.has(task.executionAgentType);
  return task.sourceType === "human_member";
}

export function formatDuration(ms: unknown): string {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "未记录";
  const minutes = Math.round(value / 60000);
  if (minutes < 1) return "<1 分钟";
  if (minutes < 60) return minutes + " 分钟";
  const hours = Math.floor(minutes / 60);
  return hours + " 小时 " + (minutes % 60) + " 分钟";
}

function durationOf(task: TaskTiming): number {
  const start = task.createdAt ? new Date(task.createdAt).getTime() : NaN;
  const end = task.finishedAt ? new Date(task.finishedAt).getTime() : NaN;
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : 0;
}

function uniqueErrors(runs: TaskRunRow[], limit = 3): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const run of runs) {
    const text = String(run.error || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    list.push(text.slice(0, 200));
    if (list.length >= limit) break;
  }
  return list;
}

/** 读取任务与执行记录，算出耗时、重试、返工和坑，供任务记忆使用。 */
export async function loadTaskMemoryStats(
  db: Db,
  projectId: string,
  {
    threadId = null,
    limit = null,
  }: { threadId?: string | null; limit?: number | string | null } = {},
): Promise<TaskMemoryStats[]> {
  const cap = limit == null ? null : Math.min(Math.max(Number(limit) || 200, 1), 500);
  const params: unknown[] = [projectId];
  let where = "t.project_id=?";
  if (threadId) {
    where += " AND t.origin_thread_id=?";
    params.push(threadId);
  }
  const tasks = await query<TaskMemoryRow>(
    db,
    `SELECT t.id,t.title,t.goal,t.constraints,t.status,t.task_type taskType,t.source_type sourceType,
       t.execution_agent_type executionAgentType,t.retry_count retryCount,t.revision,
       t.result_summary resultSummary,t.progress,t.finished_at finishedAt,t.created_at createdAt,
       t.origin_thread_id threadId,t.created_by_type createdByType,t.created_by_id createdById,
       (SELECT COUNT(*) FROM agent_task_status_events e WHERE e.task_id=t.id AND e.from_status='completed' AND e.to_status NOT IN ('completed','cancelled','superseded')) reopenCount
     FROM agent_tasks t WHERE ${where} ORDER BY t.created_at DESC,t.id ${cap == null ? "" : "LIMIT ?"}`,
    cap == null ? params : [...params, cap],
  );
  const ids = tasks.map((task) => task.id);
  const runs: TaskRunRow[] = ids.length
    ? await query<TaskRunRow>(
        db,
        `SELECT task_id taskId,executor_type executorType,status,error,started_at startedAt,finished_at finishedAt
         FROM agent_task_execution_runs WHERE task_id IN (${ids.map(() => "?").join(",")})
         ORDER BY created_at`,
        ids,
      )
    : [];
  const byTask = new Map<string, TaskRunRow[]>();
  for (const run of runs) {
    const list = byTask.get(run.taskId) || [];
    list.push(run);
    byTask.set(run.taskId, list);
  }
  return tasks.map((task): TaskMemoryStats => {
    const taskRuns = byTask.get(task.id) || [];
    const failedRuns = taskRuns.filter(
      (run) => run.status === "failed" || run.status === "interrupted",
    ).length;
    const runDuration = taskRuns.reduce((sum, run) => {
      const start = run.startedAt ? new Date(run.startedAt).getTime() : NaN;
      const end = run.finishedAt ? new Date(run.finishedAt).getTime() : NaN;
      return Number.isFinite(start) && Number.isFinite(end) && end >= start
        ? sum + (end - start)
        : sum;
    }, 0);
    return {
      ...task,
      runCount: taskRuns.length,
      failedRuns,
      executorLabel: executorLabel(task.executionAgentType),
      human: isHumanTask(task),
      durationMs: durationOf(task) || runDuration,
      reworked: Number(task.reopenCount) > 0,
      errors: uniqueErrors(taskRuns),
      done: DONE.has(task.status),
    };
  });
}

/** 主要任务：失败过、重试过、返工过、正式任务，或耗时明显偏长的少数。 */
export function importantTasks(stats: TaskMemoryStats[], limit = 20): TaskMemoryStats[] {
  const sorted = [...stats].sort((a, b) => b.durationMs - a.durationMs);
  const slow = new Set(
    sorted.slice(0, Math.max(1, Math.round(sorted.length * 0.2))).map((task) => task.id),
  );
  return sorted
    .filter(
      (task) =>
        task.failedRuns > 0 ||
        Number(task.retryCount) > 0 ||
        task.reworked ||
        task.taskType === "formal" ||
        slow.has(task.id),
    )
    .slice(0, limit);
}

export function distributionStats(stats: TaskMemoryStats[]) {
  const byStatus: Record<string, number> = {};
  const byExecutor = { human: 0, child_agent: 0, other: 0 };
  let atWork = 0;
  for (const task of stats) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    if (task.human) byExecutor.human += 1;
    else if (task.executionAgentType === "child_agent" || task.executionAgentType === "dsh_l3")
      byExecutor.child_agent += 1;
    else byExecutor.other += 1;
    if (!task.done) atWork += 1;
  }
  return { total: stats.length, atWork, byStatus, byExecutor };
}

function bullets(items: string[], empty = "- 暂无记录") {
  return items.length ? items.map((item) => "- " + item).join("\n") : empty;
}

/** 单条主要任务的记忆正文：目标、决策、结果、失败与重试、坑与成本、返工。 */
export function taskMemoryMarkdown(task: TaskMemoryStats) {
  const lines: string[] = [];
  lines.push("## 目标与约束", task.goal ? String(task.goal).trim() : "- 未记录目标");
  if (task.constraints) lines.push("", String(task.constraints).trim());
  lines.push(
    "",
    "## 决策",
    task.resultSummary
      ? "结果摘要：" + String(task.resultSummary).slice(0, 600)
      : "- 未见明确决策记录",
  );
  lines.push("", "## 结果", "- 状态：" + task.status + "，执行者：" + task.executorLabel);
  lines.push("", "## 失败与重试");
  lines.push(
    "- 执行 " +
      task.runCount +
      " 次，失败 " +
      task.failedRuns +
      " 次，重试 " +
      Number(task.retryCount || 0) +
      " 次",
  );
  lines.push("", "## 坑与成本");
  lines.push("- 耗时：" + formatDuration(task.durationMs));
  if (task.errors.length) lines.push(bullets(task.errors.map((error) => "坑：" + error)));
  lines.push("", "## 返工");
  lines.push(
    task.reworked
      ? "- 有返工：版本 " +
          Number(task.revision || 1) +
          "，执行记录 " +
          task.runCount +
          " 条" +
          (task.failedRuns ? "，含失败轮次" : "")
      : "- 未见返工",
  );
  return lines.join("\n");
}

/** 迭代 / 项目的任务分布记忆：总量、状态与执行者分布、耗时与失败 Top、坑。 */
export function taskDistributionMarkdown(
  stats: TaskMemoryStats[],
  { title = "任务分布" }: { title?: string } = {},
) {
  const dist = distributionStats(stats);
  const slow = [...stats].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
  const flaky = [...stats]
    .filter((task) => task.failedRuns > 0 || Number(task.retryCount) > 0)
    .slice(0, 5);
  const statusText = Object.entries(dist.byStatus)
    .map(([status, count]) => status + " " + count)
    .join("，");
  return [
    "## 总量与分布",
    "- 共 " + dist.total + " 个任务，进行中 " + dist.atWork + " 个",
    "- 状态：" + (statusText || "无"),
    "- 执行者：人类 " +
      dist.byExecutor.human +
      "，子 Agent " +
      dist.byExecutor.child_agent +
      "，未指派 " +
      dist.byExecutor.other,
    "",
    "## 耗时 Top",
    bullets(
      slow.map(
        (task) => task.title + "（" + task.status + "，" + formatDuration(task.durationMs) + "）",
      ),
    ),
    "",
    "## 失败与重试 Top",
    bullets(
      flaky.map(
        (task) =>
          task.title +
          "（失败 " +
          task.failedRuns +
          " 次，重试 " +
          Number(task.retryCount || 0) +
          " 次）",
      ),
    ),
    "",
    "## 坑",
    bullets(stats.flatMap((task) => task.errors.slice(0, 1)).slice(0, 5)),
  ].join("\n");
}

export function taskMemoryTitle(task: Pick<TaskMemoryRow, "title">) {
  return String(task.title || "任务").slice(0, 160);
}

/**
 * 任务记忆的确定性写入：不依赖模型也会落下基础条目。
 * 「任务分布」一条覆盖全部任务；主要任务（失败/重试/返工/正式/偏慢）各单列一条。
 */
export async function syncTaskMemory(
  db: Db,
  { projectId, createdBy }: { projectId?: string | null; createdBy?: string | null } = {},
) {
  if (!projectId) return null;
  const stats = await loadTaskMemoryStats(db, projectId);
  const distributionId = await upsertMemoryPage(db, projectId, {
    subject: "task",
    sourceFamily: "project_activity",
    title: "任务分布",
    body: taskDistributionMarkdown(stats),
    createdBy,
  });
  const important = importantTasks(stats, 20);
  const taskPageIds: string[] = [];
  for (const task of important) {
    const pageId = await upsertMemoryPage(db, projectId, {
      subject: "task",
      title: "任务：" + taskMemoryTitle(task),
      body: taskMemoryMarkdown(task),
      createdBy,
      sources: [{ kind: "task", id: task.id, label: task.title }],
    });
    if (pageId) taskPageIds.push(pageId);
  }
  return { distributionId, taskPageIds, taskCount: taskPageIds.length, total: stats.length };
}
