/**
 * 消息所属的「轮」：一次协调者 run 一个 turn id。
 * - 人类发言触发的 run 用该发言 id（沿用原来的 agent_task_id 口径）；
 * - 子 Agent 完工 / idle 唤醒的 run 用事件 id，所以续报是新的一轮，
 *   不会把原轮的时间、用量和复制/引用入口挪走。
 */
export function messageTurnIdForJob(job) {
  if (!job) return null;
  const eventWake = job.kind === "child_result" || job.kind === "child_idle";
  return (eventWake ? job.event_id : job.message_id) || job.message_id || null;
}
