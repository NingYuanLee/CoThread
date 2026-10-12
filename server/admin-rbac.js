import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";
import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_PERMISSION_TREE,
  expandAdminPermissions,
} from "../shared/admin-permissions.js";

const uuid = z.string().uuid();
const roleInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(""),
    permissions: z.array(z.enum(ADMIN_PERMISSION_KEYS)).max(ADMIN_PERMISSION_KEYS.length),
  })
  .strict();
const decode = (value) => (typeof value === "string" ? JSON.parse(value) : value);

export async function adminAccess(db, user) {
  if (user.kind !== "session") throw new HttpError(403, "管理平台需要成员账号登录");
  const [account] = await query(
    db,
    "SELECT id,name,is_super_admin FROM users WHERE id=? AND disabled_at IS NULL",
    [user.id],
  );
  if (!account) throw new HttpError(403, "账号已停用或不存在");
  const roles = await query(
    db,
    `SELECT r.id,r.name,r.permissions FROM roles r
    JOIN admin_user_roles ur ON ur.role_id=r.id WHERE ur.user_id=? AND r.scope='platform' AND r.is_builtin=FALSE ORDER BY r.name,r.id`,
    [user.id],
  );
  const permissions = Number(account.is_super_admin)
    ? [...ADMIN_PERMISSION_KEYS]
    : expandAdminPermissions(roles.flatMap((role) => decode(role.permissions) || []));
  return {
    user: { id: account.id, name: account.name },
    isSuperAdmin: !!Number(account.is_super_admin),
    roles: roles.map(({ id, name }) => ({ id, name })),
    permissions,
    tree: ADMIN_PERMISSION_TREE,
  };
}

export async function requireAdminPermission(db, user, permission) {
  const access = await adminAccess(db, user);
  if (!access.permissions.includes(permission)) throw new HttpError(403, "没有此管理操作的权限");
  return access;
}

export async function adminAudit(db, user, action, targetId, details) {
  await query(
    db,
    "INSERT INTO admin_change_logs(id,actor_user_id,action,target_id,details) VALUES(?,?,?,?,?)",
    [randomUUID(), user.id, action, targetId, JSON.stringify(details)],
  );
}

export async function listAdminRoles(db, user) {
  await requireAdminPermission(db, user, "roles");
  return query(
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
  ).then((rows) => rows.map((role) => ({
    ...role,
    is_builtin: !!Number(role.is_builtin),
    permissions: role.scope === "platform" ? expandAdminPermissions(decode(role.permissions) || []) : [],
  })));
}

async function readAdminRoles(db) {
  const rows = await query(
    db,
    `SELECT r.*, (SELECT COUNT(*) FROM admin_user_roles ur WHERE ur.role_id=r.id) member_count
    FROM roles r WHERE r.scope='platform' AND r.is_builtin=FALSE ORDER BY r.created_at,r.id`,
  );
  return rows.map((role) => ({
    ...role,
    permissions: expandAdminPermissions(decode(role.permissions) || []),
  }));
}

export async function adminRoleOptions(db, user, userId) {
  uuid.parse(userId);
  const access = await requireAdminPermission(db, user, "roles.assign");
  const [account] = await query(db, "SELECT id,is_super_admin FROM users WHERE id=?", [userId]);
  if (!account) throw new HttpError(404, "成员不存在");
  const [roles, assigned] = await Promise.all([
    readAdminRoles(db),
    query(db, "SELECT role_id FROM admin_user_roles WHERE user_id=?", [userId]),
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

export async function saveAdminRole(db, user, roleId, input) {
  const data = roleInput.parse(input);
  if (roleId) uuid.parse(roleId);
  return transaction(db, async (conn) => {
    const access = await requireAdminPermission(conn, user, "roles.manage");
    const permissions = expandAdminPermissions(data.permissions);
    if (permissions.some((key) => !access.permissions.includes(key)))
      throw new HttpError(403, "不能授予超出自身范围的权限");
    const targetId = roleId || randomUUID();
    if (roleId) {
      const [current] = await query(
        conn,
        "SELECT permissions FROM roles WHERE id=? AND scope='platform' AND is_builtin=FALSE FOR UPDATE",
        [roleId],
      );
      if (!current) throw new HttpError(404, "角色不存在");
      if (
        expandAdminPermissions(decode(current.permissions)).some(
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
      if (error.code === "ER_DUP_ENTRY") throw new HttpError(409, "角色名称已存在");
      throw error;
    }
    await adminAudit(conn, user, roleId ? "role_updated" : "role_created", targetId, {
      ...data,
      permissions,
    });
    return { id: targetId };
  });
}

export async function deleteAdminRole(db, user, roleId) {
  uuid.parse(roleId);
  return transaction(db, async (conn) => {
    const access = await requireAdminPermission(conn, user, "roles.manage");
    const [role] = await query(conn, "SELECT permissions FROM roles WHERE id=? AND scope='platform' AND is_builtin=FALSE FOR UPDATE", [
      roleId,
    ]);
    if (!role) throw new HttpError(404, "角色不存在");
    if (
      expandAdminPermissions(decode(role.permissions)).some(
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

export async function assignAdminRoles(db, user, userId, input) {
  uuid.parse(userId);
  const { roleIds } = z
    .object({ roleIds: z.array(uuid).max(100) })
    .strict()
    .parse(input);
  return transaction(db, async (conn) => {
    const access = await requireAdminPermission(conn, user, "roles.assign");
    const [account] = await query(conn, "SELECT id FROM users WHERE id=? FOR UPDATE", [userId]);
    if (!account) throw new HttpError(404, "成员不存在");
    if (userId === user.id && !access.isSuperAdmin)
      throw new HttpError(409, "不能修改自己的管理角色");
    const existing = await query(
      conn,
      `SELECT r.permissions FROM roles r JOIN admin_user_roles ur ON ur.role_id=r.id WHERE ur.user_id=? AND r.scope='platform' AND r.is_builtin=FALSE`,
      [userId],
    );
    if (
      existing.some((role) =>
        expandAdminPermissions(decode(role.permissions)).some(
          (key) => !access.permissions.includes(key),
        ),
      )
    )
      throw new HttpError(403, "不能修改权限范围高于自己的成员角色");
    const nextIds = [...new Set(roleIds)].sort();
    for (const roleId of nextIds) {
      const [role] = await query(
        conn,
        "SELECT permissions FROM roles WHERE id=? AND scope='platform' AND is_builtin=FALSE FOR UPDATE",
        [roleId],
      );
      if (!role) throw new HttpError(404, "角色不存在");
      if (
        expandAdminPermissions(decode(role.permissions)).some(
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
