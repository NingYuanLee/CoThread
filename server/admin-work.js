import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { adminAudit, requireAdminPermission } from "./admin-rbac.js";
import { publishWork } from "./work-events.js";
import { listTaskStatusEvents, listTaskUpdates } from "./task-pool.js";

const uuid = z.string().uuid();
const filters = z.object({
  search: z.string().trim().max(160).default(""),
  projectId: uuid.optional(),
  status: z.string().max(40).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export async function listAdminWork(db, user, kind, input) {
  await requireAdminPermission(db, user, kind);
  const data = filters.parse(input);
  const iterations = kind === "iterations";
  const table = iterations ? "threads" : "agent_tasks";
  const where = [],
    params = [];
  if (data.projectId) {
    where.push("w.project_id=?");
    params.push(data.projectId);
  }
  if (data.status) {
    where.push("w.status=?");
    params.push(data.status);
  }
  if (data.search) {
    where.push("(w.title LIKE ? OR p.name LIKE ?)");
    params.push(`%${data.search}%`, `%${data.search}%`);
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const from = `${table} w JOIN projects p ON p.id=w.project_id`;
  const [count] = await query(db, `SELECT COUNT(*) total FROM ${from}${clause}`, params);
  const rows = await query(
    db,
    `SELECT w.id,w.title,w.status,w.project_id,w.created_at,p.name project_name,p.archived_at project_archived_at,
    ${iterations ? "w.archived_at,u.name creator,(SELECT COUNT(*) FROM agent_tasks t WHERE t.origin_thread_id=w.id) task_count" : "w.goal,w.progress,w.result_summary,w.updated_at,w.task_type,w.origin_thread_id,w.thread_number,t.title iteration_title,COALESCE(u.name,CASE w.claimed_by_type WHEN 'dsh_l3' THEN '子 Agent' WHEN 'l2_session' THEN '小祥' END) assignee"}
    FROM ${from} ${iterations ? "LEFT JOIN users u ON u.id=w.created_by" : "LEFT JOIN threads t ON t.id=w.origin_thread_id LEFT JOIN users u ON u.id=COALESCE(w.claimed_by_id,w.target_id)"}
    ${clause} ORDER BY w.created_at DESC,w.id LIMIT ${data.pageSize} OFFSET ${(data.page - 1) * data.pageSize}`,
    params,
  );
  // Options do not expose projects outside this page's permission boundary.
  const projects = await query(
    db,
    `SELECT DISTINCT p.id,p.name FROM projects p JOIN ${table} w ON w.project_id=p.id ORDER BY p.name,p.id`,
  );
  return { items: rows, total: Number(count.total), page: data.page, pageSize: data.pageSize, projects };
}

export async function adminTaskDetail(db, user, taskId) {
  await requireAdminPermission(db, user, "tasks");
  uuid.parse(taskId);
  const [task] = await query(
    db,
    `SELECT w.*,p.name project_name,t.title iteration_title FROM agent_tasks w
    JOIN projects p ON p.id=w.project_id LEFT JOIN threads t ON t.id=w.origin_thread_id WHERE w.id=?`,
    [taskId],
  );
  if (!task) throw new HttpError(404, "任务不存在");
  const [events, updates] = await Promise.all([
    listTaskStatusEvents(db, taskId),
    listTaskUpdates(db, taskId),
  ]);
  return { ...task, events, updates };
}

export async function updateAdminWork(db, user, kind, targetId, input) {
  uuid.parse(targetId);
  const iterations = kind === "iterations";
  const data = (
    iterations
      ? z.object({ title: z.string().trim().min(1).max(160) }).strict()
      : z
          .object({
            title: z.string().trim().min(1).max(240),
            goal: z.string().trim().min(1).max(20000),
          })
          .strict()
  ).parse(input);
  let threadId;
  await transaction(db, async (conn) => {
    await requireAdminPermission(conn, user, `${kind}.update`);
    const table = iterations ? "threads" : "agent_tasks";
    const [current] = await query(
      conn,
      `SELECT w.*,p.archived_at project_archived_at FROM ${table} w JOIN projects p ON p.id=w.project_id WHERE w.id=? FOR UPDATE`,
      [targetId],
    );
    if (!current) throw new HttpError(404, iterations ? "迭代不存在" : "任务不存在");
    if (current.project_archived_at || (iterations && current.status !== "active"))
      throw new HttpError(409, "已归档内容不能修改");
    if (!iterations && !["draft", "awaiting_acceptance"].includes(current.status))
      throw new HttpError(409, "仅草稿和待确认任务可修改资料");
    if (iterations)
      await query(conn, "UPDATE threads SET title=? WHERE id=?", [data.title, targetId]);
    else
      await query(conn, "UPDATE agent_tasks SET title=?,goal=?,revision=revision+1 WHERE id=?", [
        data.title,
        data.goal,
        targetId,
      ]);
    await adminAudit(conn, user, `${kind}_updated`, targetId, {
      before: { title: current.title, ...(!iterations ? { goal: current.goal } : {}) },
      after: data,
    });
    threadId = iterations ? targetId : current.origin_thread_id;
  });
  if (threadId) publishWork(db, threadId);
  return { ok: true };
}
