import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { hashPassword } from "./auth.js";

async function assertAccountManagementScope(service, user, userId, permission, db, fail) {
  const access = await service.adminPermission(user, permission, db);
  if (access.isSuperAdmin) return;
  const [target] = await query(db, "SELECT is_super_admin FROM users WHERE id=?", [userId]);
  if (target && Number(target.is_super_admin)) fail(403, "仅超级管理员可管理超级管理员账号");
  const roles = await query(
    db,
    `SELECT r.permissions FROM roles r JOIN admin_user_roles ur ON ur.role_id=r.id WHERE ur.user_id=? AND r.scope='platform' AND r.is_builtin=FALSE`,
    [userId],
  );
  if (
    roles.some((role) =>
      (typeof role.permissions === "string" ? JSON.parse(role.permissions) : role.permissions).some(
        (key) => !access.permissions.includes(key),
      ),
    )
  )
    fail(403, "不能管理权限范围高于自己的成员账号");
}

export async function users(service, user, projectId, { fail }) {
  if (user.kind !== "session") fail(403, "成员目录需要人工登录");
  if (projectId) await service.member(user, projectId);
  return query(
    service.db,
    `SELECT id,user_number,COALESCE(username,email) username,name,email,avatar,motto,identity_tags FROM users
     WHERE disabled_at IS NULL${projectId ? " AND id NOT IN (SELECT user_id FROM members WHERE project_id=?)" : ""}
     ORDER BY name,username,email`,
    projectId ? [projectId] : [],
  );
}

export async function createUser(service, user, input, { title, fail }) {
  await service.adminPermission(user, "accounts.create");
  const data = z
    .object({
      name: title.max(80),
      username: z.string().trim().min(3).max(80).optional(),
      email: z.string().trim().min(3).max(191).optional(),
    })
    .transform((value) => ({ ...value, username: value.username || value.email || "" }))
    .parse(input);
  if (data.username.length < 3) fail(400, "账号名至少需要 3 位");
  const userId = randomUUID();
  const password = randomBytes(15).toString("base64url");
  let created;
  try {
    created = await transaction(service.db, async (db) => {
      await query(
        db,
        "INSERT INTO users(id,username,email,name,password_hash) VALUES(?,?,NULL,?,?)",
        [userId, data.username, data.name, await hashPassword(password)],
      );
      await service.accountChange(db, userId, user.id, "created", {
        name: data.name,
        username: data.username,
      });
      const row = (await query(db, "SELECT user_number FROM users WHERE id=?", [userId]))[0];
      if (Number(row.user_number) > 999999) fail(409, "六位用户ID已用完");
      return row;
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") fail(409, "该账号名已被使用");
    throw error;
  }
  return {
    id: userId,
    user_number: Number(created.user_number),
    name: data.name,
    username: data.username,
    email: null,
    password,
  };
}

export async function adminProjects(service, user) {
  await service.adminPermission(user, "projects");
  const [projects, memberships, changes, roleMigrationIssues, recoveryAccess] = await Promise.all([
    query(
      service.db,
      `SELECT p.id,p.name,p.description,p.created_at,p.archived_at,p.created_by,p.project_leader_id,
        u.name creator,CASE WHEN u.avatar IS NULL OR u.avatar='' THEN NULL ELSE CONCAT('/api/admin/projects/',p.id,'/members/',u.id,'/avatar?v=',LEFT(SHA2(u.avatar,256),16)) END creator_avatar
        FROM projects p JOIN users u ON u.id=p.created_by
        ORDER BY p.archived_at IS NOT NULL,p.created_at DESC,p.id`,
    ),
    query(
      service.db,
      `SELECT m.project_id,u.id,u.user_number,COALESCE(u.username,u.email) username,u.name,u.email,m.joined_at,m.role_changed_at,
        CASE WHEN u.avatar IS NULL OR u.avatar='' THEN NULL ELSE CONCAT('/api/admin/projects/',m.project_id,'/members/',u.id,'/avatar?v=',LEFT(SHA2(u.avatar,256),16)) END avatar,
        CASE WHEN p.project_leader_id=u.id THEN 'project_leader' WHEN m.role='project_admin' THEN 'project_admin' ELSE m.role END role
        FROM members m JOIN users u ON u.id=m.user_id JOIN projects p ON p.id=m.project_id
        ORDER BY u.name,u.username,u.email`,
    ),
    query(
      service.db,
      `SELECT l.project_id,l.action,l.details,l.created_at,u.name actor FROM
        (SELECT project_id,actor_user_id,action,details,created_at,id,
          ROW_NUMBER() OVER(PARTITION BY project_id ORDER BY created_at DESC,id DESC) audit_rank
         FROM project_change_logs) l JOIN users u ON u.id=l.actor_user_id
        WHERE l.audit_rank<=50 ORDER BY l.created_at DESC,l.id DESC`,
    ),
    query(
      service.db,
      "SELECT project_id,issue_type,candidate_user_ids FROM project_role_migration_issues",
    ),
    user.kind === "session"
      ? query(service.db, "SELECT is_super_admin FROM users WHERE id=? AND disabled_at IS NULL", [
          user.id,
        ])
      : Promise.resolve([]),
  ]);
  return projects.map((project) => {
    const roleIssue = roleMigrationIssues.find((issue) => issue.project_id === project.id) || null;
    if (roleIssue && typeof roleIssue.candidate_user_ids === "string") {
      try {
        roleIssue.candidate_user_ids = JSON.parse(roleIssue.candidate_user_ids);
      } catch {
        roleIssue.candidate_user_ids = [];
      }
    }
    return {
      ...project,
      members: memberships.filter((member) => member.project_id === project.id),
      changes: changes.filter((change) => change.project_id === project.id).slice(0, 50),
      role_migration_issue: roleIssue,
      can_recover_legacy_roles: Number(recoveryAccess[0]?.is_super_admin) === 1,
    };
  });
}

export async function updateAdminProject(service, user, projectId, input, { id, title, fail }) {
  await service.adminPermission(user, "projects.update");
  id.parse(projectId);
  const data = z
    .object({ name: title.max(120).optional(), description: z.string().max(4000).optional() })
    .refine((value) => value.name !== undefined || value.description !== undefined)
    .parse(input);
  const description = data.description === undefined ? undefined : data.description.trim();
  const updated = await transaction(service.db, async (db) => {
    const [previous] = await query(
      db,
      "SELECT name,description FROM projects WHERE id=? FOR UPDATE",
      [projectId],
    );
    if (!previous) fail(404, "项目不存在");
    const name = data.name ?? previous.name;
    const nextDescription = description ?? previous.description;
    await query(db, "UPDATE projects SET name=?,description=? WHERE id=?", [
      name,
      nextDescription,
      projectId,
    ]);
    await service.projectChange(db, projectId, user.id, "profile_updated", {
      before: { name: previous.name, description: previous.description },
      after: { name, description: nextDescription },
    });
    return { id: projectId, name, description: nextDescription };
  });
  return updated;
}

export async function setProjectArchived(service, user, projectId, archived, { id, fail }) {
  await service.adminPermission(user, archived ? "projects.archive" : "projects.restore");
  id.parse(projectId);
  const result = await transaction(service.db, async (db) => {
    const changed = await query(
      db,
      `UPDATE projects SET archived_at=${archived ? "UTC_TIMESTAMP(3)" : "NULL"} WHERE id=?`,
      [projectId],
    );
    if (changed.affectedRows)
      await service.projectChange(db, projectId, user.id, archived ? "archived" : "restored");
    return changed;
  });
  if (!result.affectedRows) fail(404, "项目不存在");
  return { id: projectId, archived };
}

export async function adminAccounts(service, user) {
  await service.adminPermission(user, "accounts");
  const [accounts, memberships, changes, logins] = await Promise.all([
    query(
      service.db,
      "SELECT id,user_number,COALESCE(username,email) username,name,email,email_verified_at,is_super_admin,disabled_at,created_at,CASE WHEN avatar IS NULL OR avatar='' THEN NULL ELSE CONCAT('/api/admin/accounts/',id,'/avatar?v=',LEFT(SHA2(avatar,256),16)) END avatar FROM users ORDER BY disabled_at IS NOT NULL,user_number",
    ),
    query(
      service.db,
      `SELECT m.user_id,p.id,p.name,m.role,p.archived_at FROM members m JOIN projects p ON p.id=m.project_id
        ORDER BY p.archived_at IS NOT NULL,p.name,p.id`,
    ),
    query(
      service.db,
      `SELECT l.target_user_id,l.action,l.details,l.created_at,u.name actor FROM
        (SELECT target_user_id,actor_user_id,action,details,created_at,id,
          ROW_NUMBER() OVER(PARTITION BY target_user_id ORDER BY created_at DESC,id DESC) audit_rank
         FROM account_change_logs) l JOIN users u ON u.id=l.actor_user_id
        WHERE l.audit_rank<=50 ORDER BY l.created_at DESC,l.id DESC`,
    ),
    query(
      service.db,
      `SELECT user_id,email identifier,ip,country,province,city,district,success,failure_reason,created_at FROM
        (SELECT user_id,email,ip,country,province,city,district,success,failure_reason,created_at,id,
          ROW_NUMBER() OVER(PARTITION BY COALESCE(user_id,email) ORDER BY created_at DESC,id DESC) audit_rank
         FROM login_logs) l WHERE audit_rank<=50 ORDER BY l.created_at DESC,l.id DESC`,
    ),
  ]);
  return accounts.map((account) => ({
    ...account,
    projects: memberships.filter((project) => project.user_id === account.id),
    changes: changes.filter((change) => change.target_user_id === account.id).slice(0, 50),
    logins: logins
      .filter(
        (login) =>
          login.user_id === account.id ||
          (!login.user_id && [account.username, account.email].includes(login.identifier)),
      )
      .slice(0, 50),
  }));
}

export async function setAccountDisabled(service, user, userId, input, { id, fail }) {
  await service.adminPermission(user, "accounts.status");
  id.parse(userId);
  const { disabled } = z.object({ disabled: z.boolean() }).parse(input);
  if (userId === user.id && disabled) fail(409, "不能停用当前登录账号");
  const result = await transaction(service.db, async (db) => {
    const [target] = await query(db, "SELECT is_super_admin FROM users WHERE id=? FOR UPDATE", [
      userId,
    ]);
    await assertAccountManagementScope(service, user, userId, "accounts.status", db, fail);
    if (target && Number(target.is_super_admin) && disabled) {
      const active = await query(
        db,
        "SELECT id FROM users WHERE is_super_admin=TRUE AND disabled_at IS NULL FOR UPDATE",
      );
      if (active.length <= 1) fail(409, "不能停用最后一个超级管理员");
    }
    const changed = await query(
      db,
      `UPDATE users SET disabled_at=${disabled ? "UTC_TIMESTAMP(3)" : "NULL"} WHERE id=?`,
      [userId],
    );
    if (disabled) await query(db, "DELETE FROM credentials WHERE user_id=?", [userId]);
    if (changed.affectedRows)
      await service.accountChange(db, userId, user.id, disabled ? "disabled" : "enabled");
    return changed;
  });
  if (!result.affectedRows) fail(404, "账号不存在");
  return { id: userId, disabled };
}

export async function resetAccountPassword(service, user, userId, { id, fail }) {
  await service.adminPermission(user, "accounts.reset-password");
  id.parse(userId);
  const password = randomBytes(15).toString("base64url");
  const result = await transaction(service.db, async (db) => {
    const [target] = await query(db, "SELECT is_super_admin FROM users WHERE id=? FOR UPDATE", [
      userId,
    ]);
    await assertAccountManagementScope(service, user, userId, "accounts.reset-password", db, fail);
    const changed = await query(db, "UPDATE users SET password_hash=? WHERE id=?", [
      await hashPassword(password),
      userId,
    ]);
    await query(db, "DELETE FROM credentials WHERE user_id=?", [userId]);
    if (changed.affectedRows) await service.accountChange(db, userId, user.id, "password_reset");
    return changed;
  });
  if (!result.affectedRows) fail(404, "账号不存在");
  return { password };
}
