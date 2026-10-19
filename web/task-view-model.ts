import {
  AGENT_LEVEL_LABELS,
  labelWorkflowStatus,
  labelExecutorType,
  l3ExecutorName,
  stickyActorIds,
  uniqueActorIds,
} from "./ui-labels";
import { taskDetailTimeline as buildTaskDetailTimeline } from "./task-timeline";
import { taskThreadNumberSearchMatch } from "../shared/task-thread-number.js";
import type { AgentTask, AgentTaskDetail, Detail } from "./workspace-types";
import type { PersonalProfile } from "./ProfileFields";
export function taskViewModel(
  taskPool: AgentTask[],
  detail: Detail | null,
  user: PersonalProfile | null,
  threadId: string,
  taskMine = true,
  taskListSearch = "",
) {
  const endedTask = (status: string) =>
    ["completed", "failed", "cancelled", "rejected", "abandoned", "superseded"].includes(status);
  const isMyTask = (task: AgentTask) =>
    task.source_user_id === user?.id ||
    task.created_by_id === user?.id ||
    task.target_id === user?.id ||
    task.claimed_by_id === user?.id ||
    task.execution_agent_id === user?.id;
  const isTrackedTask = (task: AgentTask) =>
    task.task_type !== "assist_l2" || !!task.execution_agent_id || !endedTask(task.status);
  const myTasks = taskPool.filter((task) => isMyTask(task) && isTrackedTask(task));
  const currentMyTasks = myTasks.filter((task) => task.origin_thread_id === threadId);
  const latestMyTask =
    [...currentMyTasks].sort(
      (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
    )[0] || null;
  const scopedTasks = taskPool.filter(
    (task) =>
      task.origin_thread_id === threadId && isTrackedTask(task) && (!taskMine || isMyTask(task)),
  );
  const threadExecutorIds = stickyActorIds(
    taskPool
      .filter((task) => task.origin_thread_id === threadId && task.execution_agent_id)
      .map((task) => ({ id: task.execution_agent_id, at: task.created_at })),
  );
  const memberName = (id: string | null | undefined) =>
    detail?.members.find((member) => member.id === id)?.name ||
    (id && id === user?.id ? user.name : "");
  const taskDetailTimeline = (task: AgentTaskDetail) =>
    buildTaskDetailTimeline(task, { memberName });
  const taskSourceLabel = (task: AgentTask) =>
    memberName(task.source_user_id) ||
    (task.source_type === "l2_session" ? "小祥" : labelExecutorType(task.source_type));
  const taskTargetLabel = (task: AgentTask) =>
    memberName(task.target_id) || (task.target_type === "l2_session" ? "小祥" : "未指派");
  const taskExecutorLabel = (task: AgentTask) => {
    if (
      task.execution_agent_id &&
      (!task.execution_agent_type || task.execution_agent_type === "dsh_l3")
    ) {
      return l3ExecutorName(task.execution_agent_id, threadExecutorIds) || AGENT_LEVEL_LABELS.l3;
    }
    if (task.execution_agent_type === "human_self")
      return memberName(task.claimed_by_id || task.target_id) || "成员本人";
    if (task.execution_agent_type === "human_connector") return "本地执行器";
    if (task.target_type === "human_member") {
      if (task.status === "awaiting_acceptance") return "待责任成员确认";
      if (task.status === "pending_start") return "待本地执行器启动";
      if (endedTask(task.status) && !task.execution_agent_type) return "责任成员未执行";
      return "待成员执行";
    }
    if (task.target_type === "l2_session") {
      return endedTask(task.status) ? "小祥（未交给子 Agent）" : "待子 Agent 接单";
    }
    return "待选择";
  };
  const matchesTaskListQuery = (task: AgentTask) => {
    const raw = taskListSearch.trim().toLowerCase();
    if (!raw) return true;
    if (taskThreadNumberSearchMatch(task, taskListSearch)) return true;
    const needle = raw.startsWith("#") ? raw.slice(1) : raw;
    return [
      taskSourceLabel(task),
      taskTargetLabel(task),
      taskExecutorLabel(task),
      labelWorkflowStatus(task.status),
    ]
      .join("\n")
      .toLowerCase()
      .includes(needle);
  };
  const visibleTasks = scopedTasks.filter(matchesTaskListQuery);
  const executionRunLabel = (
    run: AgentTaskDetail["executionRuns"][number],
    task: AgentTaskDetail,
  ) => {
    if (run.executor_type === "dsh_l3") {
      if (!run.executor_id) return run.status === "queued" ? "待分配" : "未绑定";
      if (run.executor_label) return run.executor_label;
      // Execution-run labels must be scoped to this task. Mixing IDs from the
      // task pool makes a historical run's name depend on unrelated tasks.
      const runExecutorIds = uniqueActorIds(
        [...task.executionRuns]
          .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
          .map((item) => item.executor_id),
      );
      return (
        l3ExecutorName(run.executor_id, runExecutorIds) || `子 Agent-${run.executor_id.slice(0, 8)}`
      );
    }
    if (run.executor_type === "human_self") return memberName(run.executor_id) || "成员本人";
    if (run.executor_type === "human_connector") {
      const ownerName =
        run.executor_member_name || run.executor_owner_name || memberName(task.target_id);
      return ownerName ? `${ownerName}（本地执行器）` : "本地执行器成员";
    }
    return labelExecutorType(run.executor_type);
  };
  const statusActorLabel = (
    event: {
      actor_type: string;
      actor_id: string | null;
      actor_name?: string | null;
      actor_name_snapshot?: string | null;
    },
    task?: AgentTaskDetail,
  ) => {
    if (event.actor_type === "human_member")
      return event.actor_name || memberName(event.actor_id) || "成员";
    if (event.actor_type === "human_member_mcp")
      return `${memberName(event.actor_id) || "成员"}（MCP）`;
    if (
      event.actor_type === "human_member_connector_mcp" ||
      event.actor_type === "human_member_connector"
    )
      return `${event.actor_name || memberName(event.actor_id) || memberName(task?.target_id) || "成员"}（本地执行器）`;
    if (event.actor_type === "l2_session") return "L2-小祥";
    if (event.actor_type === "dsh_l3") {
      // Timeline items pack the label into actor_name; status history also has actor_name_snapshot.
      if (event.actor_name_snapshot || event.actor_name)
        return event.actor_name_snapshot || event.actor_name!;
      if (event.actor_id && task) {
        const runExecutorIds = uniqueActorIds(
          [...task.executionRuns]
            .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
            .map((item) => item.executor_id),
        );
        return (
          l3ExecutorName(event.actor_id, runExecutorIds) || `子 Agent-${event.actor_id.slice(0, 8)}`
        );
      }
      return "子 Agent";
    }
    if (event.actor_type === "connector")
      return `${event.actor_name || memberName(task?.target_id) || "成员"}（本地执行器）`;
    return "系统";
  };
  return {
    latestMyTask,
    scopedTasks,
    visibleTasks,
    taskDetailTimeline,
    taskSourceLabel,
    taskTargetLabel,
    taskExecutorLabel,
    executionRunLabel,
    statusActorLabel,
    endedTask,
  };
}
