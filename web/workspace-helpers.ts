/**
 * 工作台里的纯函数与小常量：未读提及判定、选区文本、迭代选中规则。
 * 不含状态与副作用，便于单独复用与测试。
 */
import { mentionsUser } from "../shared/mentions.js";
import type { Detail, Thread } from "./workspace-types";

export type ThreadMessage = Thread["messages"][number];
export function unreadMention(
  message: ThreadMessage,
  lastRead: string | undefined,
  person: { id: string; name: string; email: string | null; username: string },
) {
  if (!lastRead || message.author_id === person.id || !mentionsUser(message.body, person))
    return false;
  try {
    return BigInt(message.sequence) > BigInt(lastRead);
  } catch {
    return false;
  }
}
export const EMPTY_FOLDERS: Detail["folders"] = [];
export const EMPTY_VERSIONS: Detail["versions"] = [];
export const EMPTY_JOBS: Detail["documentOrganizationJobs"] = [];

export function selectionTextInside(root: Element | null): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !root) return "";
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus) return "";
  if (!root.contains(anchor) || !root.contains(focus)) return "";
  return selection.toString();
}

/** Keep the current iteration when it still exists; otherwise prefer an active one. */
export function resolveProjectThreadId(
  threads: Array<{ id: string; status: string }>,
  current: string,
): string {
  if (current && threads.some((thread) => thread.id === current)) return current;
  return threads.find((thread) => thread.status === "active")?.id || threads[0]?.id || "";
}
