/**
 * 子 Agent 的 7 个固定人设。
 *
 * 会话不是持久身份：每次派发任务都会新建一个子会话（UUID），
 * 人设才是持久身份。任务通过 persona 归属到某个人设下，
 * 同一个人设可以并行多个会话（多个任务）。
 *
 * 目前只有名字与头像占位，不做任何功能性人设内容。
 */
export const AGENT_PERSONAS = [
  { key: "p1", name: "大娃", avatar: "dawa.png" },
  { key: "p2", name: "二娃", avatar: "erwa.png" },
  { key: "p3", name: "三娃", avatar: "sanwa.png" },
  { key: "p4", name: "四娃", avatar: "siwa.png" },
  { key: "p5", name: "五娃", avatar: "wuwa.png" },
  { key: "p6", name: "六娃", avatar: "liuwa.png" },
  { key: "p7", name: "七娃", avatar: "qiwa.png" },
];

export const DEFAULT_PERSONA_KEY = "p1";

export function personaByKey(key) {
  if (!key) return null;
  return AGENT_PERSONAS.find((persona) => persona.key === key) || null;
}

export function personaIndex(key) {
  return AGENT_PERSONAS.findIndex((persona) => persona.key === key);
}

/** 人设顺序固定：按数组下标取 key，旧数据回填槽位时用。 */
export function personaKeyForIndex(index) {
  const persona = AGENT_PERSONAS[index];
  return persona ? persona.key : null;
}

export function personaLabel(key) {
  return personaByKey(key)?.name || "子 Agent";
}

/** 注入到子会话系统提示的人设段落：只有名字，不做任何功能性人设内容。 */
export function personaPrompt(key) {
  const persona = personaByKey(key);
  if (!persona) return "";
  return `你的固定人设是「${persona.name}」。`;
}
