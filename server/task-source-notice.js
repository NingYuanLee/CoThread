import { query } from "./db.js";

const STATUS_LABEL = {
  pending_assignment: "待指派",
  awaiting_acceptance: "待确认",
  pending_start: "待开始",
  assigned: "已指派",
  queued: "待指派",
  waiting: "等待中",
  blocked: "阻塞暂停",
  running: "执行中",
  completed: "已完成",
  failed: "已失败",
  cancelled: "已取消",
  rejected: "已拒绝",
  abandoned: "已放弃",
  superseded: "已取代",
  paused: "已暂停",
};

export function taskStatusLabel(status) {
  return STATUS_LABEL[status] || status || "";
}

export async function taskSourceMentionToken(db, task) {
  if (!task?.source_user_id) return null;
  const [user] = await query(db, "SELECT name, COALESCE(username, email) email FROM users WHERE id=?",
    [task.source_user_id]);
  if (!user?.name) return null;
  if (!task.project_id) return user.name;
  const [dup] = await query(db, `SELECT COUNT(*) n FROM members m JOIN users u ON u.id=m.user_id
    WHERE m.project_id=? AND u.name=?`, [task.project_id, user.name]);
  return Number(dup?.n) > 1 ? user.email : user.name;
}

export function withTaskSourceMention(token, body) {
  const text = String(body || "").trim();
  if (!token || !text) return text;
  const tag = `@${token}`;
  if (text === tag || text.startsWith(`${tag} `) || text.startsWith(`${tag}\n`)) return text;
  return `${tag} ${text}`;
}

export async function mentionTaskSourceNotice(service, db, actor, task, body, options = {}) {
  if (!task?.origin_thread_id || !actor?.id || !body) return null;
  const token = await taskSourceMentionToken(db, task);
  const text = withTaskSourceMention(token, body).slice(0, 20000);
  const source = options.source
    || (actor.kind === "api" ? "local_ai" : actor.kind === "agent" ? "assistant" : "human");
  return service.insertMessage(db, actor, task.origin_thread_id, text, options.refs || [], source);
}
