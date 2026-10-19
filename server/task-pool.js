/** 任务池兼容入口：实现分别归属政策、查询、命令、指派、决策与执行生命周期。 */

import {
  composeTaskInstruction,
  isL2OwnResponsibility,
  parseDocumentRefs,
  withL3DispatchGate,
  withParsedTask,
} from "./task-pool-helpers.js";
import {
  listAssignmentEvents,
  listTaskExecutionRuns,
  listTaskStatusEvents,
  listTaskUpdates,
  L3_EXECUTOR_NAMES,
  mergeTaskActivity,
  recordTaskStatusChange,
  stickyL3ExecutorIds,
  stickyL3Label,
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
  isL2OwnResponsibility,
  parseDocumentRefs,
  withL3DispatchGate,
  withParsedTask,
};
export {
  L3_EXECUTOR_NAMES,
  listAssignmentEvents,
  listTaskExecutionRuns,
  listTaskStatusEvents,
  listTaskUpdates,
  mergeTaskActivity,
  recordTaskStatusChange,
  stickyL3ExecutorIds,
  stickyL3Label,
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
  touchL3RunHeartbeat,
  touchL3InferenceHeartbeat,
  bindDshL3Execution,
  ensureDshL3CanUpdate,
  settleDshL3Execution,
  recoverInterruptedDshL3Executions,
  recoverStaleDshL3Executions,
} from "./task-l3-execution.js";
export {
  idleL3Count,
  tasksAwaitingL3Launch,
  l3LaunchPrompt,
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
export { reassignTask, acceptTask, claimTask, rejectTask, cancelTask } from "./task-assignments.js";
export {
  taskRejectionReview,
  acknowledgeTaskRejection,
  reopenRejectedTask,
  recoverAbnormalTask,
  inspectIterationTask,
} from "./task-resolution.js";
export {
  MAX_L3,
  L3_LIVE_RUN,
  TASK_ENDED,
  MAX_TASK_RETRIES,
  MAX_EXECUTOR_ATTEMPTS,
  MAX_DISTINCT_EXECUTORS,
  L3_STALE_HEARTBEAT_SECONDS,
} from "./task-policy.js";
