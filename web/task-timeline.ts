/**
 * 任务详情时间线：把指派历史、状态流转与执行轮次合并成一条倒序时间线。
 */
import { labelWorkflowStatus } from "./ui-labels";
import type { AgentTaskDetail, TaskTimelineItem } from "./workspace-types";

export type TaskTimelineHelpers = {
  memberName: (id: string | null | undefined) => string;
};

export function taskDetailTimeline(
  task: AgentTaskDetail,
  helpers: TaskTimelineHelpers,
): TaskTimelineItem[] {
  const { memberName } = helpers;
  const actionLabels: Record<string, string> = {
    assigned: "创建并指派",
    transferred: "转交",
    rejected: "拒绝",
    acknowledged: "已知晓",
    reopened: "重新发起",
  };
  const targetLabel = (type: string | null, id: string | null) =>
    type === "xiaoxiang" ? "小祥" : type === "human_member" ? memberName(id) || "成员" : "";
  const items: (TaskTimelineItem & { transition?: string })[] = task.assignmentHistory
    .filter(
      (event) =>
        !(
          event.event_type === "transferred" &&
          event.from_target_type === "xiaoxiang" &&
          event.to_target_type === "xiaoxiang" &&
          /(?:小祥|小祥) 会话已更新/.test(event.reason || "")
        ),
    )
    .map((event) => ({
      key: `assignment-${event.id}`,
      kind: "assignment",
      at: event.created_at,
      actorType: event.changed_by_type,
      actorId: event.changed_by_id,
      actorName: event.actor_name,
      title: `${actionLabels[event.event_type] || event.event_type}${["assigned", "transferred"].includes(event.event_type) && event.to_target_type ? ` → ${targetLabel(event.to_target_type, event.to_target_id)}` : ""}`,
      body: event.reason,
    }));
  for (const event of task.statusHistory || []) {
    const transition = `${event.from_status ? `${labelWorkflowStatus(event.from_status)} → ` : ""}${labelWorkflowStatus(event.to_status)}`;
    const twin = items.find(
      (item) =>
        !item.transition &&
        item.actorType === event.actor_type &&
        item.actorId === event.actor_id &&
        Math.abs(Date.parse(item.at) - Date.parse(event.created_at)) < 2000,
    );
    if (twin) {
      twin.transition = transition;
      twin.body = [twin.body, `当时任务状态：${transition}`, event.reason]
        .filter(Boolean)
        .join("\n");
    } else
      items.push({
        key: `status-${event.id}`,
        kind: "status_change",
        at: event.created_at,
        actorType: event.actor_type,
        actorId: event.actor_id,
        actorName: event.actor_name || event.actor_name_snapshot,
        title: transition,
        body: event.reason,
      });
  }
  const updates: TaskTimelineItem[] = task.updates.map((item) => ({
    key: `update-${item.id}`,
    kind: "member_update",
    at: item.created_at,
    actorType: item.source_type,
    actorId: item.source_id,
    title: "成员动态",
    body: item.body,
  }));
  const executions: TaskTimelineItem[] = task.executionRuns.map((run) => ({
    key: `execution-${run.id}`,
    kind: "execution",
    at: run.created_at,
    actorType: run.executor_type,
    actorId: run.executor_id,
    actorName: run.executor_label,
    title: "执行轮次",
    body: [labelWorkflowStatus(run.status), run.progress || run.result_summary || run.error]
      .filter(Boolean)
      .join("："),
  }));
  return [...items, ...updates, ...executions].sort(
    (left, right) => Date.parse(right.at) - Date.parse(left.at),
  );
}
