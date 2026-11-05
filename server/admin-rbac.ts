import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.ts";
import { HttpError } from "./http-error.ts";
import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_PERMISSION_TREE,
  IMPLICIT_ADMIN_PERMISSIONS,
  expandAdminPermissions,
} from "../shared/admin-permissions.js";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";

const uuid = z.string().uuid();

/** zod 的 enum 需要非空可变元组；共享常量是只读数组，这里展开一份。 */
function permissionEnum() {
  return z.enum([...ADMIN_PERMISSION_KEYS] as [string, ...string[]]);
}

const roleInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(""),
    permissions: z.array(permissionEnum()).max(ADMIN_PERMISSION_KEYS.length),
  })
  .strict();

/** JSON 列可能是字符串也可能是已解析结构。 */
const decode = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

/** 管理空间的访问者。 */
export type AdminUser = { id: string; kind?: string | null };

/** 角色行。 */
type AdminRoleRow = {
  id: string;
  name?: string | null;
  description?: string | null;
  permissions?: unknown;
  scope?: string | null;
  code?: string | null;
  is_builtin?: unknown;
  member_count?: unknown;
};

/** 管理权限判定结果。 */
export type AdminAccess = {
  user: { id: string; name?: string | null };
  isSuperAdmin: boolean;
  roles: Array<{ id: string; name?: string | null }>;
  permissions: string[];
  tree: unknown;
};

export async function adminAccess(db: Db, user: AdminUser): Promise<AdminAccess> {
  if (user.kind !== "session") throw new HttpError(403, "管理空间需要成员账号登录");
  const [account] = await query<{ id: string; name?: string | null; is_super_admin?: unknown }>(
    db,
    "SELECT id,name,is_super_admin FROM users WHERE id=? AND disabled_at IS NULL",
    [user.id],
  );
  if (!account) throw new HttpError(403, "账号已停用或不存在");
  const roles = await query<AdminRoleRow>(
    db,
    `SELECT r.id,r.name,r.permissions FROM roles r
    JOIN admin_user_roles ur ON ur.role_id=r.id WHERE ur.user_id=? AND r.scope='platform' AND r.is_builtin=FALSE ORDER BY r.name,r.id`,
    [user.id],
  );
  const granted = Number(account.is_super_admin)
    ? [...ADMIN_PERMISSION_KEYS]
    : expandAdminPermissions(roles.flatMap((role) => (decode(role.permissions) as string[]) || []));
  const permissions = [...new Set([...IMPLICIT_ADMIN_PERMISSIONS, ...granted])] as string[];
  return {
    user: { id: account.id, name: account.name },
    isSuperAdmin: !!Number(account.is_super_admin),
    roles: roles.map(({ id, name }) => ({ id, name })),
    permissions,
    tree: ADMIN_PERMISSION_TREE,
  };
}

export async function requireAdminPermission(
  db: Db,
  user: AdminUser,
  permission: string,
): Promise<AdminAccess> {
  const access = await adminAccess(db, user);
  if (!access.permissions.includes(permission)) throw new HttpError(403, "没有此管理操作的权限");
  return access;
}

export async function adminAudit(
  db: Db,
  user: AdminUser,
  action: string,
  targetId: string | null,
  details: unknown,
): Promise<void> {
  await query(
    db,
    "INSERT INTO admin_change_logs(id,actor_user_id,action,target_id,details) VALUES(?,?,?,?,?)",
    [randomUUID(), user.id, action, targetId, JSON.stringify(details)],
  );
}

export async function listAdminRoles(db: Db, user: AdminUser) {
  await requireAdminPermission(db, user, "roles");
  const rows = await query<AdminRoleRow>(
    db,
    `SELECT r.id,r.scope,r.code,r.name,r.description,r.permissions,r.is_builtin,
      CASE
        WHEN r.code='super_admin' THEN (SELECT COUNT(*) FROM users WHERE is_super_admin=TRUE)
        WHEN r.scope='project' AND r.code='project_leader' THEN (SELECT COUNT(*) FROM projects WHERE project_leader_id IS NOT NULL)
        WHEN r.scope='project' AND r.code='project_admin' THEN (SELECT COUNT(*) FROM members WHERE role='project_admin')
        WHEN r.scope='project' AND r.code='member' THEN (
          SELECT COUNT(*) FROM members m JOIN projects p ON p.id=m.project_id
          WHERE m.role='member' AND (p.project_leader_id IS NULL OR p.project_leader_id<>m.user_id)
        )
        WHEN r.scope='project' AND r.code='viewer' THEN (SELECT COUNT(*) FROM members WHERE role='viewer')
        ELSE (SELECT COUNT(*) FROM admin_user_roles ur WHERE ur.role_id=r.id)
      END member_count
    FROM roles r ORDER BY r.scope,r.is_builtin DESC,r.created_at,r.id`,
  );
  return rows.map((role) => ({
    ...role,
    is_builtin: !!Number(role.is_builtin),
    permissions:
      role.scope === "platform"
        ? expandAdminPermissions((decode(role.permissions) as string[]) || [])
        : [],
  }));
}

async function readAdminRoles(db: Db) {
  const rows = await query<AdminRoleRow>(
    db,
    `SELECT r.*, (SELECT COUNT(*) FROM admin_user_roles ur WHERE ur.role_id=r.id) member_count
    FROM roles r WHERE r.scope='platform' AND r.is_builtin=FALSE ORDER BY r.created_at,r.id`,
  );
  return rows.map((role) => ({
    ...role,
    permissions: expandAdminPermissions((decode(role.permissions) as string[]) || []),
  }));
}

export async function adminRoleOptions(db: Db, user: AdminUser, userId: string) {
  uuid.parse(userId);
  const access = await requireAdminPermission(db, user, "roles.assign");
  const [account] = await query<{ id: string; is_super_admin?: unknown }>(
    db,
    "SELECT id,is_super_admin FROM users WHERE id=?",
    [userId],
  );
  if (!account) throw new HttpError(404, "成员不存在");
  const [roles, assigned] = await Promise.all([
    readAdminRoles(db),
    query<{ role_id: string }>(db, "SELECT role_id FROM admin_user_roles WHERE user_id=?", [
      userId,
    ]),
  ]);
  const roleIds = assigned.map((row) => row.role_id);
  const aboveScope = roles.some(
    (role) =>
      roleIds.includes(role.id) &&
      role.permissions.some((key) => !access.permissions.includes(key)),
  );
  return {
    roles,
    roleIds,
    canAssign:
      !Number(account.is_super_admin) && !aboveScope && (access.isSuperAdmin || userId !== user.id),
  };
}

export async function saveAdminRole(
  db: Db,
  user: AdminUser,
  roleId: string | null | undefined,
  input: unknown,
) {
  const data = roleInput.parse(input);
  if (roleId) uuid.parse(roleId);
  return transaction(db as Pool, async (conn) => {
    const access = await requireAdminPermission(conn, user, "roles.manage");
    const permissions = expandAdminPermissions(data.permissions);
    if (permissions.some((key) => !access.permissions.includes(key)))
      throw new HttpError(403, "不能授予超出自身范围的权限");
    const targetId = roleId || randomUUID();
    if (roleId) {
      const [current] = await query<{ permissions?: unknown }>(
        conn,
        "SELECT permissions FROM roles WHERE id=? AND scope='platform' AND is_builtin=FALSE FOR UPDATE",
        [roleId],
      );
      if (!current) throw new HttpError(404, "角色不存在");
      if (
        expandAdminPermissions(decode(current.permissions) as string[]).some(
          (key) => !access.permissions.includes(key),
        )
      )
        throw new HttpError(403, "不能修改超出自身权限范围的角色");
    }
    try {
      if (roleId)
        await query(conn, "UPDATE roles SET name=?,description=?,permissions=? WHERE id=?", [
          data.name,
          data.description,
          JSON.stringify(permissions),
          targetId,
        ]);
      else
        await query(
          conn,
          "INSERT INTO roles(id,scope,code,name,description,permissions,is_builtin,created_by) VALUES(?,'platform',NULL,?,?,?,FALSE,?)",
          [targetId, data.name, data.description, JSON.stringify(permissions), user.id],
        );
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === "ER_DUP_ENTRY")
        throw new HttpError(409, "角色名称已存在");
      throw error;
    }
    await adminAudit(conn, user, roleId ? "role_updated" : "role_created", targetId, {
      ...data,
      permissions,
    });
    return { id: targetId };
  });
}

export async function deleteAdminRole(db: Db, user: AdminUser, roleId: string) {
  uuid.parse(roleId);
  return transaction(db as Pool, async (conn) => {
    const access = await requireAdminPermission(conn, user, "roles.manage");
    const [role] = await query<{ permissions?: unknown }>(
      conn,
      "SELECT permissions FROM roles WHERE id=? AND scope='platform' AND is_builtin=FALSE FOR UPDATE",
      [roleId],
    );
    if (!role) throw new HttpError(404, "角色不存在");
    if (
      expandAdminPermissions(decode(role.permissions) as string[]).some(
        (key) => !access.permissions.includes(key),
      )
    )
      throw new HttpError(403, "不能删除超出自身权限范围的角色");
    const [assigned] = await query(
      conn,
      "SELECT user_id FROM admin_user_roles WHERE role_id=? LIMIT 1",
      [roleId],
    );
    if (assigned) throw new HttpError(409, "角色已分配给成员，请先解除分配");
    await query(conn, "DELETE FROM roles WHERE id=?", [roleId]);
    await adminAudit(conn, user, "role_deleted", roleId, {});
    return { ok: true };
  });
}

export async function assignAdminRoles(db: Db, user: AdminUser, userId: string, input: unknown) {
  uuid.parse(userId);
  const { roleIds } = z
    .object({ roleIds: z.array(uuid).max(100) })
    .strict()
    .parse(input);
  return transaction(db as Pool, async (conn) => {
    const access = await requireAdminPermission(conn, user, "roles.assign");
    const [account] = await query<{ id: string }>(
      conn,
      "SELECT id FROM users WHERE id=? FOR UPDATE",
      [userId],
    );
    if (!account) throw new HttpError(404, "成员不存在");
    if (userId === user.id && !access.isSuperAdmin)
      throw new HttpError(409, "不能修改自己的管理角色");
    const existing = await query<{ permissions?: unknown }>(
      conn,
      `SELECT r.permissions FROM roles r JOIN admin_user_roles ur ON ur.role_id=r.id WHERE ur.user_id=? AND r.scope='platform' AND r.is_builtin=FALSE`,
      [userId],
    );
    if (
      existing.some((role) =>
        expandAdminPermissions(decode(role.permissions) as string[]).some(
          (key) => !access.permissions.includes(key),
        ),
      )
    )
      throw new HttpError(403, "不能修改权限范围高于自己的成员角色");
    const nextIds = [...new Set(roleIds)].sort();
    for (const roleId of nextIds) {
      const [role] = await query<{ permissions?: unknown }>(
        conn,
        "SELECT permissions FROM roles WHERE id=? AND scope='platform' AND is_builtin=FALSE FOR UPDATE",
        [roleId],
      );
      if (!role) throw new HttpError(404, "角色不存在");
      if (
        expandAdminPermissions(decode(role.permissions) as string[]).some(
          (key) => !access.permissions.includes(key),
        )
      )
        throw new HttpError(403, "不能分配超出自身范围的角色");
    }
    await query(conn, "DELETE FROM admin_user_roles WHERE user_id=?", [userId]);
    for (const roleId of nextIds)
      await query(conn, "INSERT INTO admin_user_roles(user_id,role_id) VALUES(?,?)", [
        userId,
        roleId,
      ]);
    await adminAudit(conn, user, "member_roles_updated", userId, { roleIds: nextIds });
    return { ok: true };
  });
}
