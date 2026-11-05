/**
 * 记忆作业自动重试策略。
 *
 * 记忆作业分析的是已有内容：失败时内容并没有变化，继续高频重试只会重复消耗模型
 * token。因此同一份内容失败后按指数退避，最多自动重试 MEMORY_AUTO_RETRY_LIMIT 次；
 * 超过上限即停止自动重试（状态保持失败、错误里写明需要人工重试），不再调用 Agent。
 * 「记忆作业」面板的手动重试不受此限制。
 */
export const MEMORY_AUTO_RETRY_LIMIT = 5;

/** 默认退避：1 分钟 → 5 分钟 → 30 分钟 → 2 小时 → 6 小时。 */
export const MEMORY_RETRY_STEPS: readonly number[] = Object.freeze([60, 300, 1800, 7200, 21600]);

/** 待观察问题复核默认更慢：5 分钟 → 15 分钟 → 1 小时 → 6 小时 → 24 小时。 */
export const MEMORY_REVIEW_RETRY_STEPS: readonly number[] = Object.freeze([
  300, 900, 3600, 21600, 86400,
]);

/** 停止自动重试后把队列推远，避免同一份内容再次被调度到。 */
export const MEMORY_RETRY_STOPPED_SECONDS = 30 * 24 * 3600;

export const MEMORY_RETRY_STOPPED_NOTE = "已停止自动重试，需要人工重试";

/** 已分析窗口的自动重试预算用尽时的收口说明（保留失败记录，解除该迭代的后续阻塞）。 */
export const MEMORY_RETRY_EXHAUSTED_WINDOW_NOTE =
  "自动重试已达上限，已停止自动核验；失败记录保留，可在记忆作业里手动重试";

/** 失败对象的可读文案；允许传入字符串或任意错误值。 */
function errorText(error: unknown): string {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return String(message || error || "记忆作业失败");
}

/**
 * 第 attempt 次失败后应延后多少秒再自动重试；返回 null 表示已达上限、停止自动重试。
 * attempt 从 1 开始（第一次失败传 1）。
 */
export function memoryRetryDelaySeconds(
  attempt: unknown,
  steps: readonly number[] = MEMORY_RETRY_STEPS,
): number | null {
  const list = Array.isArray(steps) && steps.length ? steps : MEMORY_RETRY_STEPS;
  const index = Math.trunc(Number(attempt) || 0);
  if (index < 1) return list[0];
  if (index > list.length) return null;
  return list[index - 1];
}

/** 停止自动重试时的错误文案：提示放在最前面，避免被调用方的长度上限截断后丢失。 */
export function memoryRetryStoppedMessage(error: unknown, limit: number = 1000): string {
  const text = errorText(error);
  if (text.includes(MEMORY_RETRY_STOPPED_NOTE)) return text.slice(0, limit);
  const prefix = `${MEMORY_RETRY_STOPPED_NOTE}：`;
  return `${prefix}${text.slice(0, Math.max(0, limit - prefix.length))}`;
}

/** 一次自动重试的排期与文案。 */
export type MemoryRetryDecision = { delaySeconds: number; stopped: boolean; error: string };

/**
 * 解析一次自动重试：返回 { delaySeconds, stopped, error }，让调用方一次拿到排期与文案。
 * error 为写入数据库的失败原因（停止时带人工重试提示）。
 */
export function resolveMemoryRetry(
  attempt: unknown,
  error: unknown,
  { steps = MEMORY_RETRY_STEPS }: { steps?: readonly number[] } = {},
): MemoryRetryDecision {
  const delaySeconds = memoryRetryDelaySeconds(attempt, steps);
  const stopped = delaySeconds == null;
  return {
    delaySeconds: stopped ? MEMORY_RETRY_STOPPED_SECONDS : delaySeconds,
    stopped,
    error: stopped ? memoryRetryStoppedMessage(error) : errorText(error).slice(0, 1000),
  };
}
