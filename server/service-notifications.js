import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { ALL_INBOX_KINDS, INBOX_KINDS, inboxCategory, inboxNeedsThread } from "../shared/inbox.js";
import { query } from "./db.js";
import { projectImageUrlSql } from "./project-image.js";

const TASK_AND_CHAT = [...INBOX_KINDS.chat, ...INBOX_KINDS.task];

function titleFor(row) {
  const project = row.project_name || "项目";
  const thread = row.thread_title || project;
  const titles = {
    mention: `在「${thread}」中提到了你`,
    member_added: `你已加入「${project}」`,
    member_removed: `你已被移出「${project}」`,
    leader_gained: `你已成为「${project}」的负责人`,
    leader_lost: `你不再是「${project}」的负责人`,
    admin_granted: `你已成为「${project}」的项目管理员`,
    admin_revoked: `你在「${project}」的项目管理员身份已撤销`,
    role_changed: `你在「${project}」的角色已变更`,
    project_archived: `「${project}」已归档`,
    project_restored: `「${project}」已恢复`,
    task_assigned: "任务已转交给你",
    task_decision: "有任务需要你处理",
    task_blocked: "你发起的任务已阻塞",
    task_completed: "你发起的任务已完成",
    task_failed: "你发起的任务已失败",
  };
  return titles[row.kind] || "站内信";
}

function categoriesFrom(counts) {
  return Object.fromEntries(
    Object.entries(INBOX_KINDS).map(([category, kinds]) => [
      category,
      kinds.reduce(
        (sum, kind) => ({
          total: sum.total + (counts[kind]?.total || 0),
          unread: sum.unread + (counts[kind]?.unread || 0),
        }),
        { total: 0, unread: 0 },
      ),
    ]),
  );
}

export async function notify(
  db,
  userId,
  projectId,
  kind,
  text,
  threadId = null,
  messageId = null,
  senderName = "系统通知",
) {
  if (!inboxCategory(kind)) throw new Error(`未知站内信类型：${kind}`);
  if (inboxNeedsThread(kind)) {
    if (!threadId) throw new Error("聊天和任务站内信必须挂迭代");
  } else if (threadId) throw new Error("项目站内信不能挂迭代");
  await query(
    db,
    "INSERT INTO notifications(id,user_id,project_id,kind,body,thread_id,message_id,sender_name) VALUES(?,?,?,?,?,?,?,?)",
    [randomUUID(), userId, projectId, kind, text, threadId, messageId, senderName],
  );
}

export async function listNotifications(service, user, before, input, { id, fail }) {
  if (user.kind !== "session") fail(403, "站内信需要人工登录");
  if (before) id.parse(before);
  const parsed = z
    .object({
      category: z.enum(["all", "chat", "task", "project"]).default("all"),
      kind: z.enum(ALL_INBOX_KINDS).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(50),
      page: z.coerce.number().int().min(1).max(100000).default(1),
    })
    .parse(input);
  const { category, kind, limit, page } = parsed;
  const params = [user.id];
  let kindSql = "";
  if (kind) {
    kindSql = "AND n.kind=?";
    params.push(kind);
  } else if (category !== "all") {
    const kinds = INBOX_KINDS[category];
    kindSql = `AND n.kind IN (${kinds.map(() => "?").join(",")})`;
    params.push(...kinds);
  }
  if (before) params.push(before, user.id);
  const itemsQuery =
    input.summary === "1"
      ? Promise.resolve([])
      : query(
          service.db,
          `SELECT n.*,p.name project_name,t.title thread_title,${projectImageUrlSql("p.id")} project_image,
      (m.user_id IS NOT NULL AND n.kind NOT IN ('member_removed','project_archived')) can_open
      FROM notifications n JOIN projects p ON p.id=n.project_id
      LEFT JOIN threads t ON t.id=n.thread_id
      LEFT JOIN members m ON m.project_id=n.project_id AND m.user_id=n.user_id
      WHERE n.user_id=? ${kindSql} ${before ? "AND (n.created_at,n.id)<(SELECT created_at,id FROM notifications WHERE id=? AND user_id=?)" : ""}
      ORDER BY n.created_at DESC,n.id DESC LIMIT ${limit + 1} OFFSET ${(page - 1) * limit}`,
          params,
        );
  const countsQuery = query(
    service.db,
    "SELECT kind,COUNT(*) total,SUM(read_at IS NULL) unread FROM notifications WHERE user_id=? GROUP BY kind",
    [user.id],
  );
  const placementQuery =
    input.summary === "1"
      ? query(
          service.db,
          `SELECT project_id,thread_id,kind,COUNT(*) unread FROM notifications
      WHERE user_id=? AND read_at IS NULL AND thread_id IS NOT NULL AND kind IN (${TASK_AND_CHAT.map(() => "?").join(",")})
      GROUP BY project_id,thread_id,kind`,
          [user.id, ...TASK_AND_CHAT],
        )
      : Promise.resolve([]);
  const [items, counts, placements] = await Promise.all([itemsQuery, countsQuery, placementQuery]);
  const countMap = Object.fromEntries(
    counts.map((row) => [row.kind, { total: Number(row.total), unread: Number(row.unread) }]),
  );
  const projects = new Map();
  const threads = new Map();
  for (const row of placements) {
    const bucket = inboxCategory(row.kind);
    if (bucket !== "chat" && bucket !== "task") continue;
    const project = projects.get(row.project_id) || { id: row.project_id, chat: 0, task: 0 };
    const thread = threads.get(row.thread_id) || {
      id: row.thread_id,
      projectId: row.project_id,
      chat: 0,
      task: 0,
    };
    project[bucket] += Number(row.unread);
    thread[bucket] += Number(row.unread);
    projects.set(row.project_id, project);
    threads.set(row.thread_id, thread);
  }
  return {
    items: items.slice(0, limit).map((row) => ({
      ...row,
      title: titleFor(row),
      category: inboxCategory(row.kind),
      can_open: Boolean(Number(row.can_open)),
    })),
    unread: counts.reduce((sum, row) => sum + Number(row.unread), 0),
    counts: countMap,
    categories: categoriesFrom(countMap),
    projects: [...projects.values()],
    threads: [...threads.values()],
    next: items.length > limit ? items[limit - 1].id : null,
  };
}

export async function readNotification(service, user, notificationId, { id, fail }) {
  if (user.kind !== "session") fail(403, "站内信需要人工登录");
  if (notificationId) id.parse(notificationId);
  await query(
    service.db,
    `UPDATE notifications SET read_at=UTC_TIMESTAMP(3) WHERE user_id=? AND read_at IS NULL${notificationId ? " AND id=?" : ""}`,
    notificationId ? [user.id, notificationId] : [user.id],
  );
  return { ok: true };
}

export async function openNotification(service, user, notificationId, helpers) {
  const { id, fail } = helpers;
  if (user.kind !== "session") fail(403, "站内信需要人工登录");
  id.parse(notificationId);
  const [notice] = await query(service.db, "SELECT * FROM notifications WHERE id=? AND user_id=?", [
    notificationId,
    user.id,
  ]);
  if (!notice) fail(404, "站内信不存在");
  if (notice.kind === "member_removed" || notice.kind === "project_archived")
    fail(403, "这条站内信不支持跳转");
  if (notice.thread_id) await service.thread(user, notice.thread_id);
  const projects = await service.updateProjectTab(user, notice.project_id, { action: "open" });
  await readNotification(service, user, notificationId, helpers);
  return { projects, projectId: notice.project_id, threadId: notice.thread_id };
}
