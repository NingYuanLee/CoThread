const WORKFLOW_STATUS: Record<string, string> = {
  awaiting_acceptance: "待确认",
  assigned: "已指派",
  queued: "排队中",
  waiting: "等待中",
  blocked: "阻塞",
  running: "进行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
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
  l2_session: "二级小祥",
  dsh_l3: "DSH 三级",
  human_self: "成员本人",
  human_connector: "本地连接器",
};

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

export function labelActorType(value: string): string {
  return ACTOR_TYPE[value] ?? value;
}

export function labelExecutorType(value: string): string {
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
