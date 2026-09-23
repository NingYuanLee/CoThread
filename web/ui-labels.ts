const WORKFLOW_STATUS: Record<string, string> = {
  pending_assignment: "待指派",
  awaiting_acceptance: "待确认",
  pending_start: "待开始",
  assigned: "已指派",
  queued: "待指派",
  waiting: "等待中",
  blocked: "阻塞暂停",
  running: "执行中",
  completed: "已完成",
  failed: "已失败",
  cancelled: "已取消",
  rejected: "已拒绝",
  abandoned: "已放弃",
  superseded: "已取代",
  awaiting_approval: "待批准",
  paused: "已暂停",
  stopped_pending_approval: "已停止，待确认",
  completed_pending_notification: "已完成，待通知",
  failed_pending_notification: "失败，待通知",
  interrupted: "已中断",
};

const REASONING_EFFORT: Record<string, string> = {
  off: "关闭",
  none: "无",
  minimal: "极低",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "极高",
  max: "最大",
  ultra: "超高",
};

const ACTOR_TYPE: Record<string, string> = {
  human_member: "人类成员",
  l2_session: "迭代级Agent（L2）",
  dsh_l3: "任务级Agent（L3）",
  human_self: "成员本人",
  human_connector: "本地执行器",
};

export const AGENT_LEVEL_LABELS = {
  l1: "项目级Agent（L1）",
  l2: "迭代级Agent（L2）",
  l3: "任务级Agent（L3）",
} as const;

const AGENT_EVENT_STATUS: Record<string, string> = {
  running: "进行中",
  completed: "已完成",
  failed: "失败",
};

export function labelWorkflowStatus(status: string): string {
  return WORKFLOW_STATUS[status] ?? status;
}

export function labelReasoningEffort(value?: string | null): string {
  if (!value) return "中";
  return REASONING_EFFORT[value] ?? value;
}

export function labelActorType(value?: string | null): string {
  if (!value) return "-";
  return ACTOR_TYPE[value] ?? value;
}

export function labelExecutorType(value?: string | null): string {
  return labelActorType(value);
}

export function labelAgentEventStatus(status: string): string {
  return AGENT_EVENT_STATUS[status] ?? status;
}

export function formatDurationMs(ms: number): string {
  return ms < 1000 ? `${ms} 毫秒` : `${(ms / 1000).toFixed(1)} 秒`;
}

export function formatActorRef(type: string | null | undefined, id: string | null | undefined, empty = "-"): string {
  if (!type) return empty;
  const label = labelActorType(type);
  return id ? `${label}：${id}` : label;
}

export const L3_EXECUTOR_NAMES = ["大娃", "二娃", "三娃", "四娃", "五娃", "六娃", "七娃"] as const;

export function uniqueActorIds(values: Array<string | null | undefined>): string[] {
  const ids: string[] = [];
  for (const value of values) {
    if (value && !ids.includes(value)) ids.push(value);
  }
  return ids;
}

/** Prefer first-seen order so 大娃/二娃 stay sticky when newer tasks appear. */
export function stickyActorIds(
  items: Array<{ id?: string | null; at?: string | number | Date | null }>,
): string[] {
  return uniqueActorIds(
    [...items]
      .sort((left, right) => {
        const leftAt = left.at == null ? 0 : Date.parse(String(left.at));
        const rightAt = right.at == null ? 0 : Date.parse(String(right.at));
        return leftAt - rightAt;
      })
      .map((item) => item.id),
  );
}

export function l3ExecutorName(executorId: string | null | undefined, knownIds: Array<string | null | undefined>): string | null {
  if (!executorId) return null;
  const index = uniqueActorIds(knownIds).indexOf(executorId);
  if (index >= 0 && index < L3_EXECUTOR_NAMES.length) return L3_EXECUTOR_NAMES[index];
  return "任务级Agent（L3）";
}
