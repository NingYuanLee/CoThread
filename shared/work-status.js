/** 管理空间里的任务状态。底层枚举不改，筛选和列表按这 6 个阶段归并。 */
export const TASK_STATUS_GROUPS = [
  { id: "draft", label: "草稿", statuses: ["draft"] },
  { id: "pending", label: "待接手", statuses: ["pending_assignment", "awaiting_acceptance"] },
  {
    id: "active",
    label: "进行中",
    statuses: ["pending_start", "assigned", "queued", "running", "waiting"],
  },
  { id: "blocked", label: "已阻塞", statuses: ["blocked", "failed"] },
  { id: "completed", label: "待验收", statuses: ["completed"] },
  {
    id: "closed",
    label: "已结束",
    statuses: ["accepted", "ignored", "cancelled", "rejected", "abandoned", "superseded"],
  },
];

export function taskStatusGroup(status) {
  return TASK_STATUS_GROUPS.find((group) => group.statuses.includes(status)) || null;
}

export function taskStatusFilter(column, value) {
  const group = TASK_STATUS_GROUPS.find((item) => item.id === value);
  if (!group) return { sql: `${column}=?`, params: [value] };
  return {
    sql: `${column} IN (${group.statuses.map(() => "?").join(",")})`,
    params: [...group.statuses],
  };
}
