import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query } from "./db.js";

export async function notify(db, userId, projectId, kind, text, threadId = null, messageId = null, senderName = "系统通知") {
  await query(db, "INSERT INTO notifications(id,user_id,project_id,kind,body,thread_id,message_id,sender_name) VALUES(?,?,?,?,?,?,?,?)", [
    randomUUID(), userId, projectId, kind, text, threadId, messageId, senderName,
  ]);
}

export async function listNotifications(service, user, before, input, { id, fail }) {
  if (user.kind !== "session") fail(403, "站内信需要人工登录");
  if (before) id.parse(before);
  const { kind, limit } = z.object({
    kind: z.enum(["all", "mention", "member_added", "member_removed"]).default("all"),
    limit: z.coerce.number().int().min(1).max(50).default(50),
  }).parse(input);
  const params = [user.id];
  if (kind !== "all") params.push(kind);
  if (before) params.push(before, user.id);
  const itemsQuery = input.summary === "1" ? Promise.resolve([]) : query(service.db, `SELECT n.*,p.name project_name,
      CASE n.kind WHEN 'mention' THEN CONCAT('在「',COALESCE(t.title,p.name),'」中提到了你') WHEN 'member_added' THEN CONCAT('你已加入「',p.name,'」') ELSE CONCAT('你已被移出「',p.name,'」') END title,
      (m.user_id IS NOT NULL AND n.kind<>'member_removed') can_open
      FROM notifications n JOIN projects p ON p.id=n.project_id
      LEFT JOIN threads t ON t.id=n.thread_id
      LEFT JOIN members m ON m.project_id=n.project_id AND m.user_id=n.user_id
      WHERE n.user_id=? ${kind !== "all" ? "AND n.kind=?" : ""} ${before ? "AND (n.created_at,n.id)<(SELECT created_at,id FROM notifications WHERE id=? AND user_id=?)" : ""}
      ORDER BY n.created_at DESC,n.id DESC LIMIT ${limit + 1}`, params);
  const countsQuery = query(service.db, "SELECT kind,COUNT(*) total,SUM(read_at IS NULL) unread FROM notifications WHERE user_id=? GROUP BY kind", [user.id]);
  const [items, counts] = await Promise.all([itemsQuery, countsQuery]);
  return {
    items: items.slice(0, limit),
    unread: counts.reduce((sum, row) => sum + Number(row.unread), 0),
    counts: Object.fromEntries(counts.map((row) => [row.kind, { total: Number(row.total), unread: Number(row.unread) }])),
    next: items.length > limit ? items[limit - 1].id : null,
  };
}

export async function readNotification(service, user, notificationId, { id, fail }) {
  if (user.kind !== "session") fail(403, "站内信需要人工登录");
  if (notificationId) id.parse(notificationId);
  await query(service.db, `UPDATE notifications SET read_at=UTC_TIMESTAMP(3) WHERE user_id=? AND read_at IS NULL${notificationId ? " AND id=?" : ""}`, notificationId ? [user.id, notificationId] : [user.id]);
  return { ok: true };
}

export async function openNotification(service, user, notificationId, helpers) {
  const { id, fail } = helpers;
  if (user.kind !== "session") fail(403, "站内信需要人工登录");
  id.parse(notificationId);
  const [notice] = await query(service.db, "SELECT * FROM notifications WHERE id=? AND user_id=?", [notificationId, user.id]);
  if (!notice) fail(404, "站内信不存在");
  if (notice.kind === "member_removed") fail(403, "移出通知不支持跳转");
  if (notice.thread_id) await service.thread(user, notice.thread_id);
  const projects = await service.updateProjectTab(user, notice.project_id, { action: "open" });
  await readNotification(service, user, notificationId, helpers);
  return { projects, projectId: notice.project_id, threadId: notice.thread_id };
}
