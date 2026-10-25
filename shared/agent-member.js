export const AGENT_MEMBER = Object.freeze({
  id: "agent-assistant",
  user_number: 100000,
  name: "小祥",
  avatar: "/agent-avatars/xiaojingang.jpg",
  motto: "单人项目直接回复，多人讨论按需参与",
  identity_tags: Object.freeze(["助理"]),
  email: "单人项目直接回复，多人讨论按需参与",
  role: "agent",
});
/** 老翁维护项目知识，与参与讨论的小祥是两名成员。 */
export const AGENT_LAOWENG_PROFILE = Object.freeze({
  nickname: "老翁",
  title: "项目知识库管理员",
  avatar: "/agent-avatars/grandpa.jpg",
});
/**
 * 小祥是项目内同一角色（任务调度员），不是按迭代各算一名成员。
 * 各迭代只是该角色的独立 DSH 会话；子 Agent 隶属于 小祥，不单独列成员。
 */
export const AGENT_XIAOXIANG_MEMBER = Object.freeze({
  id: "agent-xiaoxiang",
  user_number: 100001,
  name: "小祥",
  nickname: "任务调度员",
  avatar: "/agent-avatars/xiaojingang.jpg",
  motto: "项目内同一角色；各迭代使用独立会话",
  identity_tags: Object.freeze(["助理"]),
  email: "迭代调度与任务分派",
  role: "agent",
});
export const TASK_CREATE_REQUEST =
  "@小祥 请根据当前群聊上下文帮我创建合适的任务：先简要说明你的理解与拟创建的任务要点，再执行创建；信息不足时先向我确认，不要臆造需求。";
export function mentionsAgent(text) {
  const body = String(text || "").trim();
  if (!body) return false;
  if (/(?:^|[^\p{L}\p{N}_@])@(?:小祥|Agent\s*助手)(?=$|[\s\p{P}\p{S}])/iu.test(body)) {
    return true;
  }
  return /^(?:小祥)(?:\s*[，,：:]\s*|\s+)/u.test(body);
}
