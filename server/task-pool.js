/** 任务池兼容入口：实现分别归属政策、查询、命令、指派、决策与执行生命周期。 */

import {
  composeTaskInstruction,
  isXiaoxiangOwnResponsibility,
  parseDocumentRefs,
  withChildDispatchGate,
  withParsedTask,
} from "./task-pool-helpers.js";
import {
  listAssignmentEvents,
  listTaskExecutionRuns,
  listTaskStatusEvents,
  listTaskUpdates,
  CHILD_EXECUTOR_NAMES,
  mergeTaskActivity,
  recordTaskStatusChange,
  stickyChildExecutorIds,
  stickyChildLabel,
  taskExecutionSnapshot,
} from "./task-pool-activity.js";
import { classifyTaskFailure } from "./task-pool-failures.js";
import {
  closeEndedTaskRuns,
  reconcileEndedTaskRuns,
  repairMisclosedHumanExecutionRuns,
  voidSelfHandledAssistTasks,
} from "./task-pool-recovery.js";
export {
  composeTaskInstruction,
  isXiaoxiangOwnResponsibility,
  parseDocumentRefs,
  withChildDispatchGate,
  withParsedTask,
};
export {
  CHILD_EXECUTOR_NAMES,
  listAssignmentEvents,
  listTaskExecutionRuns,
  listTaskStatusEvents,
  listTaskUpdates,
  mergeTaskActivity,
  recordTaskStatusChange,
  stickyChildExecutorIds,
  stickyChildLabel,
  taskExecutionSnapshot,
};
export { classifyTaskFailure };
export {
  closeEndedTaskRuns,
  reconcileEndedTaskRuns,
  repairMisclosedHumanExecutionRuns,
  voidSelfHandledAssistTasks,
};
export {
  touchChildRunHeartbeat,
  touchChildInferenceHeartbeat,
  bindChildAgentExecution,
  ensureChildAgentCanUpdate,
  settleChildAgentExecution,
  recoverInterruptedChildAgentExecutions,
  recoverStaleChildAgentExecutions,
} from "./task-child-execution.js";
export {
  idleChildCount,
  tasksAwaitingChildLaunch,
  childLaunchPrompt,
  childTaskBrief,
  recordChildLaunchTrace,
  finishCoordinatorDispatch,
} from "./task-dispatch.js";
export {
  createTask,
  updateTask,
  appendTaskUpdate,
  askTaskQuestion,
  answerTaskQuestion,
} from "./task-commands.js";
export { getTask, listTasks, listTaskQuestions } from "./task-queries.js";
export {
  reassignTask,
  acceptTask,
  claimTask,
  rejectTask,
  cancelTask,
  ignoreTask,
  redirectBlockedTask,
  restoreIgnoredTask,
} from "./task-assignments.js";
export {
  taskRejectionReview,
  acknowledgeTaskRejection,
  reopenRejectedTask,
  recoverAbnormalTask,
  inspectIterationTask,
} from "./task-resolution.js";
export {
  MAX_Child,
  CHILD_LIVE_RUN,
  TASK_ENDED,
  MAX_TASK_RETRIES,
  MAX_EXECUTOR_ATTEMPTS,
  MAX_DISTINCT_EXECUTORS,
  CHILD_STALE_HEARTBEAT_SECONDS,
} from "./task-policy.js";
