/**
 * 引用他人消息再发送时，正文开头补上 @该成员。
 * 称呼规则与右键「提及」一致：重名用邮箱，助理固定 @小祥，自己的消息不加。
 */
import { AGENT_MEMBER, AGENT_XIAOXIANG_MEMBER } from "../shared/agent-member.js";
import { mentionsUser } from "../shared/mentions.js";

export type QuoteMentionTarget = {
  source?: string;
  author_id?: string;
  author?: string;
};

export type QuoteMentionMember = {
  id: string;
  name: string;
  email?: string | null;
  kind?: string;
};

export function quoteMentionLabel(
  quote: QuoteMentionTarget,
  members: QuoteMentionMember[],
  currentUserId: string,
): string | null {
  const isAssistant =
    quote.source === "assistant" ||
    quote.author_id === AGENT_MEMBER.id ||
    quote.author_id === AGENT_XIAOXIANG_MEMBER.id;
  if (!isAssistant && quote.author_id === currentUserId) return null;
  if (isAssistant) return AGENT_MEMBER.name;
  const mentionMembers = members.filter(
    (member) => member.kind !== "laoweng" && member.id !== AGENT_MEMBER.id,
  );
  const selected = mentionMembers.find((member) => member.id === quote.author_id);
  if (selected?.id === currentUserId) return null;
  if (
    selected &&
    selected.id !== AGENT_XIAOXIANG_MEMBER.id &&
    selected.email &&
    mentionMembers.filter((member) => member.name === selected.name).length > 1
  ) {
    return selected.email;
  }
  if (selected?.name) return selected.name;
  const fallback = quote.author?.trim();
  return fallback || null;
}

export function withQuoteMentions(
  body: string,
  quotes: QuoteMentionTarget[],
  members: QuoteMentionMember[],
  currentUserId: string,
): string {
  const labels: string[] = [];
  for (const quote of quotes) {
    const label = quoteMentionLabel(quote, members, currentUserId);
    if (!label || labels.includes(label)) continue;
    if (mentionsUser(body, { name: label, email: null, username: null })) continue;
    labels.push(label);
  }
  if (!labels.length) return body;
  const prefix = labels.map((label) => "@" + label).join(" ");
  const text = body.replace(/^\s+/, "");
  return text ? prefix + " " + text : prefix;
}
