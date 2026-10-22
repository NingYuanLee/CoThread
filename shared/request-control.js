import { DIALOGUE_MODES } from "./dialogue-mode.js";

/** 不能确定来源时的模式。不得当成 default。 */
export const UNKNOWN_MODE = "unknown";

/**
 * 一次请求的不可变控制信息。dialogueMode 只接受已保存的四种模式；
 * 缺失、空串或无法识别都是 unknown，不会静默回退到 default。
 */
export function captureRequestControl({
  sourceRequestId = null,
  dialogueMode = null,
  wakeKind = "member_message",
} = {}) {
  const mode = DIALOGUE_MODES.includes(dialogueMode) ? dialogueMode : UNKNOWN_MODE;
  return Object.freeze({
    sourceRequestId: sourceRequestId || null,
    dialogueMode: mode,
    wakeKind: String(wakeKind || "member_message"),
  });
}

export function writeDeniedReason(dialogueMode) {
  if (dialogueMode === "chat") return "当前为 Chat 只读对话模式，不能执行写入或任务类操作";
  if (dialogueMode === UNKNOWN_MODE) return "无法确定来源请求的对话模式，已阻止写入";
  return null;
}

/** 父回合未带模式时不猜测。显式 unknown 与 chat 禁止写入。 */
export function parentDialogueMode(job) {
  const mode = job?.dialogue_mode;
  if (mode == null || mode === "") return null;
  if (DIALOGUE_MODES.includes(mode)) return mode;
  return UNKNOWN_MODE;
}

/**
 * 子 Agent 只读执行记录上钉住的模式，不读可变的 job。
 * 没有执行记录，或有来源消息但没有模式：unknown，禁止写入。
 * 任务本身没有来源消息：不受对话模式约束。
 */
export function controlFromExecutionRun(run) {
  if (!run) return captureRequestControl({ wakeKind: "executor" });
  const sourceRequestId = run.source_message_id || run.task_source_message_id || null;
  const dialogueMode = run.dialogue_mode || run.request_dialogue_mode || null;
  if (!sourceRequestId && !dialogueMode) {
    return Object.freeze({
      sourceRequestId: null,
      dialogueMode: null,
      wakeKind: "executor",
    });
  }
  return captureRequestControl({
    sourceRequestId,
    dialogueMode,
    wakeKind: "executor",
  });
}

/** 来源请求和模式都相同才可以并进同一次唤醒。未知来源不能并。 */
export function controlsMergeable(left, right) {
  if (!left?.sourceRequestId || !right?.sourceRequestId) return false;
  if (left.dialogueMode === UNKNOWN_MODE || right.dialogueMode === UNKNOWN_MODE) return false;
  return left.sourceRequestId === right.sourceRequestId && left.dialogueMode === right.dialogueMode;
}
