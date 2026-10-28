import { z } from "zod/v3";
import { query } from "./db.js";
import { HttpError } from "./http-error.js";
import { adminAccess } from "./admin-rbac.js";
import { listTaskStatusEvents, listTaskUpdates } from "./task-pool.js";
import { projectImageUrlSql } from "./project-image.js";
import { taskStatusFilter } from "../shared/work-status.js";

const uuid = z.string().uuid();
const filters = z.object({
  search: z.string().trim().max(160).default(""),
  projectId: uuid.optional(),
  status: z.string().max(40).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

const joinedProject = (projectColumn) =>
  `EXISTS (SELECT 1 FROM members me WHERE me.project_id=${projectColumn} AND me.user_id=?)`;
const relatedTask = `(
  (w.created_by_type='human_member' AND w.created_by_id=?)
  OR w.source_user_id=?
  OR (w.target_type='human_member' AND w.target_id=?)
  OR (w.claimed_by_type='human_member' AND w.claimed_by_id=?)
  OR (w.accepted_by_type='human_member' AND w.accepted_by_id=?)
)`;
const relatedParams = (userId) => [userId, userId, userId, userId, userId];

async function requireMemberSession(db, user) {
  if (!user?.id) throw new HttpError(401, "请先登录");
  await adminAccess(db, user);
}

export async function listMyProjects(db, user) {
  await requireMemberSession(db, user);
  const projects = await query(
    db,
    `SELECT p.id,p.name,p.description,p.created_at,p.archived_at,p.created_by,p.project_leader_id,
      ${projectImageUrlSql("p.id", "/api/admin/my/projects")} image,
      u.name creator,CASE WHEN u.avatar IS NULL OR u.avatar='' THEN NULL ELSE CONCAT('/api/admin/my/projects/',p.id,'/members/',u.id,'/avatar?v=',LEFT(SHA2(u.avatar,256),16)) END creator_avatar
      FROM projects p JOIN users u ON u.id=p.created_by
      WHERE ${joinedProject("p.id")}
      ORDER BY p.archived_at IS NOT NULL,p.created_at DESC,p.id`,
    [user.id],
  );
  if (!projects.length) return [];
  const ids = projects.map((project) => project.id);
  const marks = ids.map(() => "?").join(",");
  const [memberships, changes] = await Promise.all([
    query(
      db,
      `SELECT m.project_id,u.id,u.user_number,COALESCE(u.username,u.email) username,u.name,u.email,m.joined_at,m.role_changed_at,
        CASE WHEN u.avatar IS NULL OR u.avatar='' THEN NULL ELSE CONCAT('/api/admin/my/projects/',m.project_id,'/members/',u.id,'/avatar?v=',LEFT(SHA2(u.avatar,256),16)) END avatar,
        CASE WHEN p.project_leader_id=u.id THEN 'project_leader' WHEN m.role='project_admin' THEN 'project_admin' ELSE m.role END role
        FROM members m JOIN users u ON u.id=m.user_id JOIN projects p ON p.id=m.project_id
        WHERE m.project_id IN (${marks})
        ORDER BY u.name,u.username,u.email`,
      ids,
    ),
    query(
      db,
      `SELECT l.project_id,l.action,l.details,l.created_at,u.name actor FROM
        (SELECT project_id,actor_user_id,action,details,created_at,id,
          ROW_NUMBER() OVER(PARTITION BY project_id ORDER BY created_at DESC,id DESC) audit_rank
         FROM project_change_logs WHERE project_id IN (${marks})) l JOIN users u ON u.id=l.actor_user_id
        WHERE l.audit_rank<=50 ORDER BY l.created_at DESC,l.id DESC`,
      ids,
    ),
  ]);
  return projects.map((project) => ({
    ...project,
    members: memberships.filter((member) => member.project_id === project.id),
    changes: changes.filter((change) => change.project_id === project.id).slice(0, 50),
    role_migration_issue: null,
    can_recover_legacy_roles: false,
  }));
}

export async function myProjectMemberAvatar(db, user, projectId, userId) {
  await requireMemberSession(db, user);
  uuid.parse(projectId);
  uuid.parse(userId);
  const [member] = await query(
    db,
    `SELECT u.avatar FROM users u JOIN projects p ON p.id=?
     WHERE u.id=? AND ${joinedProject("p.id")} AND (p.created_by=u.id OR p.project_leader_id=u.id OR EXISTS
       (SELECT 1 FROM members m WHERE m.project_id=p.id AND m.user_id=u.id))`,
    [projectId, userId, user.id],
  );
  return member?.avatar || null;
}

export async function myProjectImage(db, user, projectId) {
  await requireMemberSession(db, user);
  uuid.parse(projectId);
  const [project] = await query(
    db,
    `SELECT p.image FROM projects p WHERE p.id=? AND ${joinedProject("p.id")}`,
    [projectId, user.id],
  );
  return project?.image || null;
}

export async function listMyWork(db, user, kind, input) {
  await requireMemberSession(db, user);
  if (!["iterations", "tasks"].includes(kind)) throw new HttpError(404, "页面不存在");
  const data = filters.parse(input);
  const iterations = kind === "iterations";
  const table = iterations ? "threads" : "agent_tasks";
  const where = [joinedProject("w.project_id")];
  const params = [user.id];
  if (!iterations) {
    where.push(relatedTask);
    params.push(...relatedParams(user.id));
  }
  if (data.projectId) {
    where.push("w.project_id=?");
    params.push(data.projectId);
  }
  if (data.status) {
    const filter = iterations
      ? { sql: "w.status=?", params: [data.status] }
      : taskStatusFilter("w.status", data.status);
    where.push(filter.sql);
    params.push(...filter.params);
  }
  if (data.search) {
    where.push("(w.title LIKE ? OR p.name LIKE ?)");
    params.push(`%${data.search}%`, `%${data.search}%`);
  }
  const clause = ` WHERE ${where.join(" AND ")}`;
  const from = `${table} w JOIN projects p ON p.id=w.project_id`;
  const [count] = await query(db, `SELECT COUNT(*) total FROM ${from}${clause}`, params);
  const rows = await query(
    db,
    `SELECT w.id,w.title,w.status,w.project_id,w.created_at,p.name project_name,p.archived_at project_archived_at,${projectImageUrlSql("p.id", "/api/admin/my/projects")} project_image,
    ${iterations ? "w.archived_at,u.name creator,(SELECT COUNT(*) FROM agent_tasks t WHERE t.origin_thread_id=w.id) task_count" : "w.goal,w.progress,w.result_summary,w.updated_at,w.task_type,w.origin_thread_id,w.thread_number,t.title iteration_title,COALESCE(u.name,CASE w.claimed_by_type WHEN 'child_agent' THEN '子 Agent' WHEN 'xiaoxiang' THEN '小祥' END) assignee"}
    FROM ${from} ${iterations ? "LEFT JOIN users u ON u.id=w.created_by" : "LEFT JOIN threads t ON t.id=w.origin_thread_id LEFT JOIN users u ON u.id=COALESCE(w.claimed_by_id,w.target_id)"}
    ${clause} ORDER BY w.created_at DESC,w.id LIMIT ${data.pageSize} OFFSET ${(data.page - 1) * data.pageSize}`,
    params,
  );
  const projects = await query(
    db,
    `SELECT p.id,p.name FROM projects p
     WHERE ${joinedProject("p.id")}
     ORDER BY p.name,p.id`,
    [user.id],
  );
  return {
    items: rows,
    total: Number(count.total),
    page: data.page,
    pageSize: data.pageSize,
    projects,
  };
}

export async function myTaskDetail(db, user, taskId) {
  await requireMemberSession(db, user);
  uuid.parse(taskId);
  const [task] = await query(
    db,
    `SELECT w.*,p.name project_name,${projectImageUrlSql("p.id", "/api/admin/my/projects")} project_image,t.title iteration_title FROM agent_tasks w
     JOIN projects p ON p.id=w.project_id LEFT JOIN threads t ON t.id=w.origin_thread_id
     WHERE w.id=? AND ${joinedProject("w.project_id")} AND ${relatedTask}`,
    [taskId, user.id, ...relatedParams(user.id)],
  );
  if (!task) throw new HttpError(404, "任务不存在");
  const [events, updates] = await Promise.all([
    listTaskStatusEvents(db, taskId),
    listTaskUpdates(db, taskId),
  ]);
  return { ...task, events, updates };
}
