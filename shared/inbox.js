/** 站内信三类。聊天和任务必须有项目和迭代；项目类只有项目。 */

export const INBOX_KINDS = {
  chat: ["mention"],
  task: ["task_assigned", "task_decision", "task_blocked", "task_completed", "task_failed"],
  project: [
    "member_added",
    "member_removed",
    "leader_gained",
    "leader_lost",
    "admin_granted",
    "admin_revoked",
    "role_changed",
    "project_archived",
    "project_restored",
  ],
};

export const ALL_INBOX_KINDS = Object.values(INBOX_KINDS).flat();

export function inboxCategory(kind) {
  for (const [category, kinds] of Object.entries(INBOX_KINDS)) {
    if (kinds.includes(kind)) return category;
  }
  return null;
}

export function inboxNeedsThread(kind) {
  const category = inboxCategory(kind);
  return category === "chat" || category === "task";
}
