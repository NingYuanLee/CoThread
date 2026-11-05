import { query } from "./db.ts";
import { requireAdminPermission } from "./admin-rbac.js";
import { fail, id } from "./service-support.ts";
import type { Db } from "./types.ts";

/** 访问判定只看这几项：项目令牌的 scope 与登录种类。 */
export type AccessUser = {
  id: string;
  kind?: string | null;
  scope?: string | null;
};

/**
 * 域模块用到的 Service 视图。
 *
 * `service.js` 是转发门面，尚未转换；这里只声明本模块实际调用的 `db` 与 `member`，
 * 避免把整个门面形状抄一遍，也不会在门面改成 `.ts` 后立刻失配。
 */
export type AccessService = {
  db: Db;
  member(
    user: AccessUser,
    projectId: string,
    write?: boolean,
    db?: Db,
    owner?: boolean,
  ): Promise<unknown>;
};

export async function projectManagerOperation(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  db: Db = service.db,
): Promise<void> {
  await service.member(user, projectId, false, db);
  const [project] = await query<{ project_leader_id?: string | null; role?: string | null }>(
    db,
    `SELECT p.project_leader_id,m.role FROM projects p
       JOIN members m ON m.project_id=p.id AND m.user_id=? WHERE p.id=?`,
    [user.id, projectId],
  );
  if (!project || (project.project_leader_id !== user.id && project.role !== "project_admin"))
    fail(403, "仅项目负责人或项目管理员可执行此操作");
}

export async function projectLeaderOperation(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  db: Db = service.db,
  { lock = false }: { lock?: boolean } = {},
): Promise<{ project_leader_id?: string | null }> {
  await service.member(user, projectId, false, db);
  const [project] = await query<{ project_leader_id?: string | null }>(
    db,
    `SELECT project_leader_id FROM projects WHERE id=?${lock ? " FOR UPDATE" : ""}`,
    [projectId],
  );
  if (!project || project.project_leader_id !== user.id) fail(403, "仅项目负责人可执行此操作");
  return project;
}

export async function systemAdminOperation(
  service: AccessService,
  user: AccessUser,
  db: Db = service.db,
): Promise<void> {
  if (user.kind !== "session") fail(403, "系统管理需要人工登录");
  const [account] = await query<{ is_super_admin?: unknown }>(
    db,
    "SELECT is_super_admin FROM users WHERE id=? AND disabled_at IS NULL",
    [user.id],
  );
  if (!account || !Number(account.is_super_admin)) fail(403, "仅超级管理员可执行此操作");
}

export async function adminPermissionOperation(
  service: AccessService,
  user: AccessUser,
  permission: string,
  db: Db = service.db,
): Promise<unknown> {
  return requireAdminPermission(db, user, permission);
}

export async function memberOperation(
  service: AccessService,
  user: AccessUser,
  projectId: string,
  write: boolean = false,
  db: Db = service.db,
  owner: boolean = false,
): Promise<{ role?: string | null; project_leader_id?: string | null }> {
  id.parse(projectId);
  if (user.scope && user.scope !== projectId) fail(403, "令牌仅可访问指定项目");
  const [member] = await query<{ role?: string | null; project_leader_id?: string | null }>(
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
  service: AccessService,
  user: AccessUser,
  threadId: string,
  write: boolean = false,
  db: Db = service.db,
  { display = false }: { display?: boolean } = {},
): Promise<Record<string, unknown>> {
  id.parse(threadId);
  const [thread] = await query<Record<string, unknown>>(
    db,
    `SELECT ${display ? "id,project_id,title,background,goal,status,created_by,created_at,archived_at,side_revision,IF(archive_snapshot IS NULL,NULL,JSON_OBJECT('conclusion',JSON_EXTRACT(archive_snapshot,'$.conclusion'),'versions',JSON_EXTRACT(archive_snapshot,'$.versions'))) archive_snapshot" : "*"} FROM threads WHERE id=?${write ? " FOR UPDATE" : ""}`,
    [threadId],
  );
  if (!thread) fail(404, "迭代不存在");
  await service.member(user, thread.project_id as string, write, db);
  if (write && thread.status !== "active")
    fail(
      409,
      thread.status === "archiving"
        ? "此迭代正在归档，消息、任务及背景目标已冻结，请先撤回归档"
        : "此迭代已归档，无法修改",
    );
  return thread;
}
