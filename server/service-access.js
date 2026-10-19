import { query } from "./db.js";
import { requireAdminPermission } from "./admin-rbac.js";
import { fail, id } from "./service-support.js";

export async function projectManagerOperation(service, user, projectId, db = service.db) {
  await service.member(user, projectId, false, db);
  const [project] = await query(
    db,
    `SELECT p.project_leader_id,m.role FROM projects p
       JOIN members m ON m.project_id=p.id AND m.user_id=? WHERE p.id=?`,
    [user.id, projectId],
  );
  if (!project || (project.project_leader_id !== user.id && project.role !== "project_admin"))
    fail(403, "仅项目负责人或项目管理员可执行此操作");
}

export async function projectLeaderOperation(
  service,
  user,
  projectId,
  db = service.db,
  { lock = false } = {},
) {
  await service.member(user, projectId, false, db);
  const [project] = await query(
    db,
    `SELECT project_leader_id FROM projects WHERE id=?${lock ? " FOR UPDATE" : ""}`,
    [projectId],
  );
  if (!project || project.project_leader_id !== user.id) fail(403, "仅项目负责人可执行此操作");
  return project;
}

export async function systemAdminOperation(service, user, db = service.db) {
  if (user.kind !== "session") fail(403, "系统管理需要人工登录");
  const [account] = await query(
    db,
    "SELECT is_super_admin FROM users WHERE id=? AND disabled_at IS NULL",
    [user.id],
  );
  if (!account || !Number(account.is_super_admin)) fail(403, "仅超级管理员可执行此操作");
}

export async function adminPermissionOperation(service, user, permission, db = service.db) {
  return requireAdminPermission(db, user, permission);
}

export async function memberOperation(
  service,
  user,
  projectId,
  write = false,
  db = service.db,
  owner = false,
) {
  id.parse(projectId);
  if (user.scope && user.scope !== projectId) fail(403, "令牌仅可访问指定项目");
  const [member] = await query(
    db,
    `SELECT m.role,p.project_leader_id FROM members m JOIN projects p ON p.id=m.project_id
       WHERE m.project_id=? AND m.user_id=? AND p.archived_at IS NULL`,
    [projectId, user.id],
  );
  if (
    !member ||
    (write && member.role === "viewer") ||
    (owner && member.project_leader_id !== user.id && member.role !== "project_admin")
  )
    fail(403, "没有此项目的操作权限");
  return member;
}

export async function threadOperation(
  service,
  user,
  threadId,
  write = false,
  db = service.db,
  { display = false } = {},
) {
  id.parse(threadId);
  const [thread] = await query(
    db,
    `SELECT ${display ? "id,project_id,title,background,goal,status,created_by,created_at,archived_at,side_revision,IF(archive_snapshot IS NULL,NULL,JSON_OBJECT('conclusion',JSON_EXTRACT(archive_snapshot,'$.conclusion'),'versions',JSON_EXTRACT(archive_snapshot,'$.versions'))) archive_snapshot" : "*"} FROM threads WHERE id=?${write ? " FOR UPDATE" : ""}`,
    [threadId],
  );
  if (!thread) fail(404, "迭代不存在");
  await service.member(user, thread.project_id, write, db);
  if (write && thread.status !== "active")
    fail(
      409,
      thread.status === "archiving"
        ? "此迭代正在归档，消息、任务及背景目标已冻结，请先撤回归档"
        : "此迭代已归档，无法修改",
    );
  return thread;
}
