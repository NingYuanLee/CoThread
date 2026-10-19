import {
  formatActorRef,
  l3ExecutorName,
  AGENT_LEVEL_LABELS,
  L3_EXECUTOR_NAMES,
  labelExecutorType,
  labelWorkflowStatus,
  stickyActorIds,
} from "./ui-labels";

import type {
  L1Run,
  HistoryColumn,
  HistoryRow,
  MonitorData,
  WorkflowTone,
  L3Detail,
} from "./agent-monitor-types";
export function date(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
}
export function time(value: string | null | undefined) {
  const parsed = date(value);
  return (
    parsed?.toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) || "暂无"
  );
}
export function nextTime(value: string | null | undefined, pending: number) {
  if (!pending) return "无待处理";
  const parsed = date(value);
  if (!parsed || parsed.getTime() <= Date.now()) return "现在可处理";
  return time(value);
}
export function pendingLine(kind: "member" | "document", pending: number) {
  if (!pending) return kind === "member" ? "新发言：暂无" : "新文档：暂无";
  return kind === "member"
    ? `新发言：有（${pending} 人待整理）`
    : `新文档：有（${pending} 份待整理）`;
}
export function runTone(status: string): "idle" | "running" | "waiting" | "failed" {
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  if (status === "queued") return "waiting";
  return "idle";
}
export function runStatusLabel(status: string) {
  if (status === "failed") return "失败";
  if (status === "running") return "进行中";
  if (status === "queued") return "排队中";
  return "已完成";
}
export function archiveHistoryStatus(status: string) {
  if (status === "preparing") return "梳理中";
  if (status === "ready") return "待确认";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已撤回";
  if (status === "completed") return "已确认";
  if (status === "archived") return "已归档";
  return status;
}
export function archiveHistoryTone(status: string): "idle" | "running" | "waiting" | "failed" {
  if (status === "failed") return "failed";
  if (status === "preparing") return "running";
  if (status === "ready") return "waiting";
  return "idle";
}
export function l1RunRows(runs: L1Run[] | undefined, unit: string): HistoryRow[] {
  return (runs || []).map((run) => {
    const pending = run.status === "queued" || run.status === "running";
    return {
      id: run.id,
      tone: runTone(run.status),
      cells: {
        time: time(run.finished_at || run.started_at || run.created_at),
        trigger: run.trigger_source === "user" ? "手动" : "定时",
        updates: pending
          ? "—"
          : run.had_updates
            ? run.item_count
              ? `有（${run.item_count}${unit}）`
              : "有"
            : "暂无",
        agent: pending ? "—" : run.agent_called ? "是" : "否",
        status: runStatusLabel(run.status),
        note:
          run.error ||
          (run.status === "queued" ? "已排队" : run.status === "running" ? "整理中" : ""),
      },
    };
  });
}
export function artifactCount(value: unknown[] | string | null | undefined) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}
export function workflowTone(status: string, live = false): WorkflowTone {
  if (status === "failed") return "failed";
  if (status === "blocked") return "blocked";
  if (live || status === "running") return "running";
  if (["queued", "pending_assignment", "pending_start", "waiting"].includes(status))
    return "waiting";
  return "idle";
}
export function taskWorkflowStatus(
  pool?: { task_status?: string | null; run_status?: string | null },
  task?: { status?: string | null },
) {
  return pool?.task_status || task?.status || "";
}
export function claimedWorkflow(
  task: MonitorData["executors"][number],
  pool?: MonitorData["taskPool"][number],
) {
  const status = taskWorkflowStatus(pool, task);
  return {
    label: labelWorkflowStatus(status),
    tone: workflowTone(status, liveExecutor(task)),
  };
}
export function poolTone(task: MonitorData["taskPool"][number]) {
  return workflowTone(task.task_status, task.task_status === "running" && !!task.executor_id);
}
export function memberDisplayName(
  id: string | null | undefined,
  people: { member_id: string; name: string }[],
) {
  if (!id) return "";
  return people.find((item) => item.member_id === id)?.name || "";
}
export function taskSourceName(
  task: { source_user_id?: string | null; source_type?: string; requested_by?: string },
  people: { member_id: string; name: string }[],
) {
  const userId = task.source_user_id || task.requested_by || "";
  return (
    memberDisplayName(userId, people) ||
    (task.source_type === "l2_session" ? "小祥" : labelExecutorType(task.source_type))
  );
}
export function taskExecutorName(
  task: {
    executor_id?: string | null;
    executor_type?: string | null;
    created_by_type?: string;
    target_type?: string | null;
    task_status?: string;
    run_status?: string | null;
    status?: string;
  },
  l3Ids: string[],
) {
  if (task.executor_id && (!task.executor_type || task.executor_type === "dsh_l3")) {
    return l3ExecutorName(task.executor_id, l3Ids) || AGENT_LEVEL_LABELS.l3;
  }
  if (task.executor_type === "human_self") return "成员本人";
  if (task.executor_type === "human_connector") return "本地执行器";
  if (task.target_type === "human_member") {
    const status = task.task_status || task.status || "";
    if (status === "awaiting_acceptance") return "待责任成员确认";
    if (status === "pending_start") return "待本地执行器启动";
    if (ENDED.has(status) && !task.executor_id) return "责任成员未执行";
    return "待成员执行";
  }
  if (task.target_type === "l2_session") {
    const status = task.task_status || task.status || "";
    if (ENDED.has(status)) return "小祥（未交给子 Agent）";
    return "待子 Agent 接单";
  }
  return "未选择";
}
export function pendingDetail(
  task: MonitorData["taskPool"][number],
  people: { member_id: string; name: string }[],
  l3Ids: string[],
): L3Detail {
  return {
    id: task.task_id,
    title: task.title,
    typeLabel: task.task_type === "assist_l2" ? "辅助 L2" : "正式任务",
    statusLabel: labelWorkflowStatus(task.task_status),
    tone: poolTone(task),
    goal: task.goal,
    progress: task.progress,
    result: task.result_summary,
    artifacts: artifactCount(task.artifact_refs),
    source: taskSourceName(task, people),
    target:
      task.target_type === "l2_session" ? "小祥" : formatActorRef(task.target_type, task.target_id),
    executor: taskExecutorName(task, l3Ids),
    time: time(task.started_at),
  };
}
export function claimedDetail(
  task: MonitorData["executors"][number],
  pool: MonitorData["taskPool"][number] | undefined,
  people: { member_id: string; name: string }[],
  l3Ids: string[],
): L3Detail {
  const state = claimedWorkflow(task, pool);
  const active = liveExecutor(task);
  return {
    id: task.task_id,
    title:
      pool?.title || task.progress || (task.task_type === "assist_l2" ? "辅助任务" : "执行任务"),
    typeLabel: active ? "正在执行" : "已接过",
    statusLabel: state.label,
    tone: state.tone,
    goal: task.goal,
    progress: task.progress,
    result: task.result_summary || null,
    artifacts: artifactCount(task.artifact_refs),
    source: taskSourceName({ ...task, source_user_id: task.requested_by }, people),
    target:
      task.target_type === "l2_session" ? "小祥" : formatActorRef(task.target_type, task.target_id),
    executor: taskExecutorName(
      { ...task, ...pool, executor_id: task.executor_id, executor_type: task.executor_type },
      l3Ids,
    ),
    time: time(task.last_action_at || task.finished_at || task.started_at),
  };
}
export const EXECUTOR_STYLES = [
  { avatar: "dawa.png", color: "#b83f3a", tint: "#f8e8e6" },
  { avatar: "erwa.png", color: "#d97828", tint: "#fbefe2" },
  { avatar: "sanwa.png", color: "#b88a18", tint: "#faf4dc" },
  { avatar: "siwa.png", color: "#39804a", tint: "#e7f3e9" },
  { avatar: "wuwa.png", color: "#278b94", tint: "#e3f3f4" },
  { avatar: "liuwa.png", color: "#4168ad", tint: "#e8edf7" },
  { avatar: "qiwa.png", color: "#7652a0", tint: "#eee8f5" },
];
export const EXECUTORS = L3_EXECUTOR_NAMES.map((name, index) => ({
  name,
  ...EXECUTOR_STYLES[index],
}));
export const L1_RUN_COLUMNS: HistoryColumn[] = [
  { key: "time", label: "时间" },
  { key: "trigger", label: "触发" },
  { key: "updates", label: "新内容" },
  { key: "agent", label: "调用Agent" },
  { key: "status", label: "状态" },
  { key: "note", label: "说明" },
];
export const ENDED = new Set([
  "completed",
  "failed",
  "cancelled",
  "rejected",
  "abandoned",
  "superseded",
]);
export const liveExecutor = (task: {
  execution_active?: number | boolean | null;
  status?: string | null;
  executor_id?: string | null;
  agent_slot?: number | null;
}) =>
  (!!task.executor_id &&
    (!!task.execution_active || task.status === "running" || task.status === "waiting")) ||
  (!!task.agent_slot && (!!task.execution_active || task.status === "running"));
export const agentState = (task: MonitorData["executors"][number] | null) => {
  if (task && liveExecutor(task)) return { label: "执行中", tone: "running" as const };
  return { label: "空闲", tone: "idle" as const };
};
export function selectMonitorWork(
  data: MonitorData | null,
  selectedThreadId: string,
  selectedSlot: number,
) {
  const activeCoordinators = (() =>
    (data?.coordinators || []).filter((item) => item.status !== "archived"))();
  const selectedCoordinator = activeCoordinators.find((item) => item.id === selectedThreadId);
  const people = data?.humanAgents || [];
  const threadPool = (() =>
    (data?.taskPool || []).filter(
      (task) =>
        task.origin_thread_id === selectedThreadId &&
        (task.target_type === "l2_session" || task.executor_type === "dsh_l3"),
    ))();
  const selectedTasks = (() =>
    data?.executors.filter(
      (task) =>
        task.thread_id === selectedThreadId &&
        task.executor_type === "dsh_l3" &&
        (liveExecutor(task) || !!task.executor_id),
    ) || [])();
  const l3Ids = (() =>
    stickyActorIds([
      ...selectedTasks.map((task) => ({
        id: task.executor_id,
        at: task.started_at || task.finished_at,
      })),
      ...threadPool.map((task) => ({
        id: task.executor_id,
        at: task.started_at || task.created_at || task.updated_at,
      })),
    ]))();
  const slots = (() => {
    const byExecutor = new Map<string, MonitorData["executors"][number]>();
    for (const item of selectedTasks) {
      if (!item.executor_id || byExecutor.has(item.executor_id)) continue;
      byExecutor.set(item.executor_id, item);
    }
    return Array.from({ length: 7 }, (_, index) => {
      const slot = index + 1;
      const stickyId = l3Ids[index] || null;
      const stickyTask = stickyId ? byExecutor.get(stickyId) || null : null;
      const explicit = selectedTasks.find((item) => item.agent_slot === slot);
      return { slot, agent: EXECUTORS[index], task: explicit || stickyTask || null };
    });
  })();
  const selectedAgent = slots.find((item) => item.slot === selectedSlot) || slots[0];
  const selectedAgentState = agentState(selectedAgent?.task || null);
  const pendingTasks = (() =>
    threadPool.filter((task) => !task.executor_id && !ENDED.has(task.task_status)))();
  const claimedTasks = (() => {
    const current = selectedAgent?.task || null;
    const listed = selectedTasks.filter(
      (task) => task.agent_slot === selectedSlot || (current && task.task_id === current.task_id),
    );
    const unique: MonitorData["executors"] = [];
    const seen = new Set<string>();
    for (const task of [current, ...listed]) {
      if (!task || seen.has(task.task_id)) continue;
      seen.add(task.task_id);
      unique.push(task);
    }
    for (const task of threadPool) {
      if (!task.executor_id || seen.has(task.task_id)) continue;
      if (task.executor_id !== current?.executor_id && current?.task_id !== task.task_id) continue;
      seen.add(task.task_id);
      unique.push({
        task_id: task.task_id,
        thread_id: selectedThreadId,
        thread_title: selectedCoordinator?.title || "",
        requested_by: task.source_user_id || "",
        goal: task.goal,
        status: task.task_status,
        progress: task.progress,
        agent_slot: selectedSlot,
        execution_active:
          task.executor_id && ["running", "waiting"].includes(task.run_status || "") ? 1 : 0,
        started_at: task.started_at || "",
        finished_at: task.finished_at || null,
        last_action: null,
        last_action_status: null,
        last_action_at: null,
        update_count: 0,
        executor_type: "dsh_l3",
        executor_id: task.executor_id,
        target_type: task.target_type,
        target_id: task.target_id,
        task_type: task.task_type,
        source_type: task.source_type,
        created_by_type: task.created_by_type,
        created_by_id: task.created_by_id,
        claimed_by_type: task.claimed_by_type,
        claimed_by_id: task.claimed_by_id,
        result_summary: task.result_summary,
        artifact_refs: task.artifact_refs,
      });
    }
    return unique;
  })();

  return {
    activeCoordinators,
    selectedCoordinator,
    people,
    threadPool,
    selectedTasks,
    l3Ids,
    slots,
    selectedAgent,
    selectedAgentState,
    pendingTasks,
    claimedTasks,
  };
}
