import { query } from "./db.ts";
import type { Db } from "./types.ts";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending_assignment: "待指派",
  awaiting_acceptance: "待确认",
  pending_start: "待开始",
  assigned: "已指派",
  queued: "排队中",
  waiting: "等待中",
  blocked: "已阻塞",
  running: "执行中",
  completed: "待验收",
  accepted: "已结束",
  failed: "已失败",
  cancelled: "已取消",
  rejected: "已拒绝",
  abandoned: "已放弃",
  superseded: "已取代",
  paused: "已暂停",
  ignored: "已忽略",
};

/** 任务行里本文件会用到的字段。 */
type TaskRow = {
  source_user_id?: string | null;
  project_id?: string | null;
  origin_thread_id?: string | null;
  [column: string]: unknown;
};

/** 消息作者。 */
type MessageActor = { id: string; kind?: string | null; [field: string]: unknown };

/** 调用 `service.insertMessage` 所需的最小接口。 */
type MessageInserter = {
  insertMessage: (...args: unknown[]) => Promise<unknown>;
};

export function taskStatusLabel(status: unknown): string {
  return STATUS_LABEL[status as string] || (status as string) || "";
}

/** 任务来源人在群里的 @ 标记；重名时用邮箱，避免 @ 错人。 */
export async function taskSourceMentionToken(
  db: Db,
  task: TaskRow | null | undefined,
): Promise<string | null> {
  if (!task?.source_user_id) return null;
  const [user] = await query<{ name?: string | null; email?: string | null }>(
    db,
    "SELECT name, COALESCE(username, email) email FROM users WHERE id=?",
    [task.source_user_id],
  );
  if (!user?.name) return null;
  if (!task.project_id) return user.name;
  const [dup] = await query<{ n: number }>(
    db,
    `SELECT COUNT(*) n FROM members m JOIN users u ON u.id=m.user_id
    WHERE m.project_id=? AND u.name=?`,
    [task.project_id, user.name],
  );
  return Number(dup?.n) > 1 ? (user.email as string) : user.name;
}

/** 在正文最前面补上 @ 标记；已经有了就不重复。 */
export function withTaskSourceMention(token: string | null, body: unknown): string {
  const text = String(body || "").trim();
  if (!token || !text) return text;
  const tag = `@${token}`;
  if (text === tag || text.startsWith(`${tag} `) || text.startsWith(`${tag}\n`)) return text;
  return `${tag} ${text}`;
}

export async function mentionTaskSourceNotice(
  service: MessageInserter,
  db: Db,
  actor: MessageActor | null | undefined,
  task: TaskRow | null | undefined,
  body: unknown,
  options: { source?: string; refs?: unknown[]; inbox?: string } = {},
): Promise<unknown> {
  if (!task?.origin_thread_id || !actor?.id || !body) return null;
  const token = await taskSourceMentionToken(db, task);
  const text = withTaskSourceMention(token, body).slice(0, 20000);
  const source =
    options.source ||
    (actor.kind === "api" ? "local_ai" : actor.kind === "agent" ? "assistant" : "human");
  return service.insertMessage(
    db,
    actor,
    task.origin_thread_id,
    text,
    options.refs || [],
    source,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { inbox: options.inbox || "skip" },
  );
}
