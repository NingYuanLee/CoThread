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
/** L1 对内展示：老翁 / 项目知识库；聊天对外仍是小祥。 */
export const AGENT_L1_PROFILE = Object.freeze({
  nickname: "老翁",
  title: "项目知识库管理员",
  avatar: "/agent-avatars/grandpa.jpg",
});
/**
 * L2 是项目内同一角色（任务调度员），不是按迭代各算一名成员。
 * 各迭代只是该角色的独立 DSH 会话；L3 隶属于 L2，不单独列成员。
 */
export const AGENT_L2_MEMBER = Object.freeze({
  id: "agent-l2",
  user_number: 100001,
  name: "小祥",
  nickname: "任务调度员",
  avatar: "/agent-avatars/xiaojingang.jpg",
  motto: "项目内同一角色；各迭代使用独立会话",
  identity_tags: Object.freeze(["助理"]),
  email: "迭代调度与任务分派",
  role: "agent",
});
export const SUMMARY_REQUEST =
  "@小祥 请直接基于已有上下文梳理讨论，按已确认事项、待决策问题、下一步与负责人整理。不重新读取整个会话，不虚构共识。";
export function mentionsAgent(text) {
  return /(?:^|[^\p{L}\p{N}_@])@(?:小祥|Agent\s*助手)(?=$|[\s\p{P}\p{S}])/iu.test(
    text,
  );
}
