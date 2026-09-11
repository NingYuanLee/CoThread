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
export const SUMMARY_REQUEST =
  "@小祥 请直接基于已有上下文梳理讨论，按已确认事项、待决策问题、下一步与负责人整理。不重新读取整个会话，不虚构共识。";
export const ORGANIZE_DOCUMENTS_REQUEST =
  "@小祥 请作为项目文档助手实际整理项目文档库。先完整分页检查目录，并结合已有摘要或必要的正文判断文档用途、主题、迭代与版本关系；按需新建清晰且不过深的文件夹，移动明显散落或归属错误的文档，优化含糊、重复或临时性的文档名称。不要删除任何文档或版本，不要移动仍由系统管理的临时文件；无法确定的项目保留原位。完成后汇报新建文件夹、移动和重命名清单，以及未处理的存疑项。";
export function mentionsAgent(text) {
  return /(?:^|[^\p{L}\p{N}_@])@(?:小祥|Agent\s*助手)(?=$|[\s\p{P}\p{S}])/iu.test(
    text,
  );
}
