/** 任务域：policy。内部依赖具体领域模块，不依赖 task-pool 兼容入口。 */

export const targetTypes = new Set(["human_member", "xiaoxiang"]);

export const FOREIGN_TASK_AUTH = "非本 小祥 责任的任务需要人类成员账号明确授权";

export const ASSIGN_HUMAN_AUTH = "把任务指派给人类成员需要人类成员账号明确授权";

export const MAX_Child = 7;

export const CHILD_LIVE_RUN = ["queued", "running", "waiting"];

export const TASK_ENDED = [
  "completed",
  "failed",
  "cancelled",
  "rejected",
  "abandoned",
  "superseded",
  "ignored",
];

export const TASK_UPDATE_STATUSES = [
  "pending_assignment",
  "pending_start",
  "queued",
  "running",
  "waiting",
  "blocked",
  "completed",
  "failed",
  "cancelled",
  "abandoned",
];

export const MAX_TASK_RETRIES = 5;

export const MAX_EXECUTOR_ATTEMPTS = 2;

export const MAX_DISTINCT_EXECUTORS = 3;

export const CHILD_STALE_HEARTBEAT_SECONDS = 600;

export const arrangeableStatuses = new Set([
  "draft",
  "pending_assignment",
  "awaiting_acceptance",
  "pending_start",
  "assigned",
  "queued",
  "running",
  "waiting",
  "blocked",
  "failed",
  "cancelled",
  "rejected",
  "abandoned",
  "completed",
]);
