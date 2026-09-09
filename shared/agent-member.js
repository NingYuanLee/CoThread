export const AGENT_MEMBER = Object.freeze({
  id: "agent-assistant",
  name: "小祥",
  avatar: "/cothread-logo.svg",
  identity_tags: Object.freeze(["助理"]),
  email: "单人项目直接回复，多人讨论按需参与",
  role: "agent",
});
export const SUMMARY_REQUEST =
  "@小祥 请直接基于已有上下文梳理讨论，按已确认事项、待决策问题、下一步与负责人整理。不重新读取整个会话，不虚构共识。";
export function mentionsAgent(text) {
  return /(?:^|[^\p{L}\p{N}_@])@(?:小祥|Agent\s*助手)(?=$|[\s\p{P}\p{S}])/iu.test(
    text,
  );
}
