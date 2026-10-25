import { AGENT_XIAOXIANG_MEMBER, AGENT_MEMBER } from "../shared/agent-member.js";
import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { hashPassword } from "./auth.js";

import { fail, id, title } from "./service-support.js";

export async function accountChangeOperation(
  service,
  db,
  targetUserId,
  actorUserId,
  action,
  details = {},
) {
  await query(
    db,
    "INSERT INTO account_change_logs(id,target_user_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
    [randomUUID(), targetUserId, actorUserId, action, JSON.stringify(details)],
  );
}

export async function removeMemberOperation(service, user, projectId, userId) {
  if (user.kind !== "session") fail(403, "成员管理需要人工登录");
  return transaction(service.db, async (db) => {
    await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [projectId]);
    await service.projectManager(user, projectId, db);
    // 系统 Agent 的 id 是固定哨兵值而不是 uuid，必须先于格式校验拦下，
    // 否则只会返回 400「Invalid uuid」，给不出「系统 Agent 不能被移出」的准确答复。
    if ([AGENT_MEMBER.id, AGENT_XIAOXIANG_MEMBER.id].includes(userId))
      fail(409, "项目负责人和系统 Agent 不能被移出项目");
    id.parse(userId);
    const [target] = await query(
      db,
      `SELECT u.name,m.role,p.project_leader_id FROM members m
         JOIN users u ON u.id=m.user_id JOIN projects p ON p.id=m.project_id
         WHERE m.project_id=? AND m.user_id=? FOR UPDATE`,
      [projectId, userId],
    );
    if (
      [AGENT_MEMBER.id, AGENT_XIAOXIANG_MEMBER.id].includes(userId) ||
      target?.project_leader_id === userId
    )
      fail(409, "项目负责人和系统 Agent 不能被移出项目");
    if (target?.role === "project_admin") fail(409, "请先撤销项目管理员身份，再移出成员");
    const result = await query(db, "DELETE FROM members WHERE project_id=? AND user_id=?", [
      projectId,
      userId,
    ]);
    if (!result.affectedRows) fail(409, "成员不存在或不能移除项目负责人");
    const [sender] = await query(db, "SELECT name FROM users WHERE id=?", [user.id]);
    await service.notify(
      db,
      userId,
      projectId,
      "member_removed",
      "你已被移出该项目",
      null,
      null,
      sender.name,
    );
    await service.projectChange(db, projectId, user.id, "member_removed", {
      userId,
      userName: target?.name || null,
    });
    return { ok: true };
  });
}

export async function transferProjectLeaderOperation(service, user, projectId, input) {
  if (user.kind !== "session") fail(403, "请使用成员账号转移项目负责人");
  id.parse(projectId);
  const { userId } = z.object({ userId: id }).parse(input);
  if (userId === user.id) fail(409, "该成员已经是项目负责人");
  if ([AGENT_MEMBER.id, AGENT_XIAOXIANG_MEMBER.id].includes(userId))
    fail(409, "项目负责人必须是人类成员");
  return transaction(service.db, async (db) => {
    await service.projectLeader(user, projectId, db, { lock: true });
    const [target] = await query(
      db,
      "SELECT u.name,u.disabled_at,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? AND m.user_id=? FOR UPDATE",
      [projectId, userId],
    );
    if (!target) fail(409, "新负责人必须先加入项目");
    if (target.disabled_at) fail(409, "新负责人必须是正常状态的成员");
    const [actor] = await query(db, "SELECT name FROM users WHERE id=?", [user.id]);
    await query(db, "UPDATE projects SET project_leader_id=? WHERE id=?", [userId, projectId]);
    await query(
      db,
      "UPDATE members SET role='member',role_changed_at=UTC_TIMESTAMP(6) WHERE project_id=? AND user_id=?",
      [projectId, user.id],
    );
    await query(
      db,
      "UPDATE members SET role='member',role_changed_at=UTC_TIMESTAMP(6) WHERE project_id=? AND user_id=?",
      [projectId, userId],
    );
    await service.projectChange(db, projectId, user.id, "leader_transferred", {
      fromUserId: user.id,
      fromUserName: actor?.name || null,
      fromRole: "project_leader",
      toUserId: userId,
      toUserName: target.name,
      toRole: "project_leader",
    });
    return { projectId, project_leader_id: userId };
  });
}

export async function addProjectAdminOperation(service, user, projectId, input) {
  if (user.kind !== "session") fail(403, "请使用成员账号管理项目管理员");
  id.parse(projectId);
  const { userId } = z.object({ userId: id }).parse(input);
  if ([AGENT_MEMBER.id, AGENT_XIAOXIANG_MEMBER.id].includes(userId))
    fail(409, "项目管理员必须是人类成员");
  return transaction(service.db, async (db) => {
    await service.projectLeader(user, projectId, db, { lock: true });
    const [target] = await query(
      db,
      "SELECT u.name,u.disabled_at,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? AND m.user_id=? FOR UPDATE",
      [projectId, userId],
    );
    if (!target) fail(409, "项目管理员必须先加入项目");
    if (userId === user.id) fail(409, "项目负责人不能同时作为项目管理员分配");
    if (target.disabled_at) fail(409, "项目管理员必须是正常状态的成员");
    if (target.role === "viewer") fail(409, "只读成员不能设为项目管理员");
    if (target.role === "project_admin") fail(409, "该成员已拥有项目管理身份");
    await query(
      db,
      "UPDATE members SET role='project_admin',role_changed_at=UTC_TIMESTAMP(6) WHERE project_id=? AND user_id=?",
      [projectId, userId],
    );
    await service.projectChange(db, projectId, user.id, "admin_added", {
      userId,
      userName: target.name,
      fromRole: target.role,
      toRole: "project_admin",
    });
    return { projectId, userId, role: "project_admin" };
  });
}

export async function removeProjectAdminOperation(service, user, projectId, userId) {
  if (user.kind !== "session") fail(403, "请使用成员账号管理项目管理员");
  id.parse(projectId);
  id.parse(userId);
  return transaction(service.db, async (db) => {
    await service.projectLeader(user, projectId, db, { lock: true });
    const [target] = await query(
      db,
      "SELECT u.name,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? AND m.user_id=? FOR UPDATE",
      [projectId, userId],
    );
    if (!target || target.role !== "project_admin") fail(409, "该成员不是项目管理员");
    await query(
      db,
      "UPDATE members SET role='member',role_changed_at=UTC_TIMESTAMP(6) WHERE project_id=? AND user_id=?",
      [projectId, userId],
    );
    await service.projectChange(db, projectId, user.id, "admin_removed", {
      userId,
      userName: target.name,
      fromRole: "project_admin",
      toRole: "member",
    });
    return { projectId, userId, role: "member" };
  });
}

export async function recoverProjectLeaderOperation(service, user, projectId, input) {
  id.parse(projectId);
  const { userId } = z.object({ userId: id }).parse(input);
  if ([AGENT_MEMBER.id, AGENT_XIAOXIANG_MEMBER.id].includes(userId))
    fail(409, "项目负责人必须是人类成员");
  return transaction(service.db, async (db) => {
    await service.systemAdmin(user, db);
    const [project] = await query(
      db,
      "SELECT project_leader_id FROM projects WHERE id=? FOR UPDATE",
      [projectId],
    );
    if (!project) fail(404, "项目不存在");
    if (project.project_leader_id) fail(409, "该项目已经设置项目负责人");
    const [issue] = await query(
      db,
      "SELECT issue_type,candidate_user_ids FROM project_role_migration_issues WHERE project_id=? FOR UPDATE",
      [projectId],
    );
    if (!issue) fail(409, "该项目没有待处理的历史角色迁移问题");
    if (issue.issue_type === "multiple_legacy_owners") {
      const candidateIds =
        typeof issue.candidate_user_ids === "string"
          ? JSON.parse(issue.candidate_user_ids)
          : issue.candidate_user_ids;
      if (!Array.isArray(candidateIds) || !candidateIds.includes(userId))
        fail(409, "负责人应从历史负责人候选中选择");
    }
    const [target] = await query(
      db,
      "SELECT u.name,m.role,u.disabled_at FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? AND m.user_id=? FOR UPDATE",
      [projectId, userId],
    );
    if (!target || target.disabled_at) fail(409, "负责人必须是项目内正常状态的人类成员");
    await query(db, "UPDATE projects SET project_leader_id=? WHERE id=?", [userId, projectId]);
    await query(
      db,
      "UPDATE members SET role='member',role_changed_at=UTC_TIMESTAMP(6) WHERE project_id=? AND user_id=?",
      [projectId, userId],
    );
    await query(db, "DELETE FROM project_role_migration_issues WHERE project_id=?", [projectId]);
    await service.projectChange(db, projectId, user.id, "leader_migration_resolved", {
      userId,
      userName: target.name,
      toRole: "project_leader",
      migrationIssueType: issue.issue_type,
    });
    return { projectId, project_leader_id: userId };
  });
}

export async function addMemberOperation(service, user, projectId, input) {
  if (user.kind !== "session") fail(403, "成员管理需要人工登录");
  await service.projectManager(user, projectId);
  if (input.userId) {
    const data = z
      .object({
        userId: id,
        role: z.enum(["member", "viewer"]).default("member"),
      })
      .parse(input);
    const [account] = await query(
      service.db,
      "SELECT id,name FROM users WHERE id=? AND disabled_at IS NULL",
      [data.userId],
    );
    if (!account) fail(404, "账号不存在");
    try {
      await transaction(service.db, async (db) => {
        await query(
          db,
          "INSERT INTO members(project_id,user_id,role,joined_at,role_changed_at) VALUES(?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))",
          [projectId, data.userId, data.role],
        );
        await query(
          db,
          "INSERT INTO thread_reads(thread_id, user_id, last_read_sequence, read_at) SELECT id, ?, COALESCE((SELECT MAX(sequence) FROM messages WHERE thread_id=threads.id), 0), UTC_TIMESTAMP(3) FROM threads WHERE project_id=? ON DUPLICATE KEY UPDATE thread_id=thread_reads.thread_id",
          [data.userId, projectId],
        );
        const [sender] = await query(db, "SELECT name FROM users WHERE id=?", [user.id]);
        await service.notify(
          db,
          data.userId,
          projectId,
          "member_added",
          "你已被加入该项目",
          null,
          null,
          sender.name,
        );
        await service.projectChange(db, projectId, user.id, "member_added", {
          userId: data.userId,
          userName: account.name,
          role: data.role,
        });
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") fail(409, "该账号已经是项目成员");
      throw error;
    }
    return { id: data.userId, role: data.role };
  }
  const data = z
    .object({
      username: z.string().trim().min(3).max(80).optional(),
      email: z.string().trim().min(3).max(191).optional(),
      name: title.max(80),
      password: z.string().min(8).max(200).optional(),
      role: z.enum(["member", "viewer"]).default("member"),
    })
    .transform((value) => ({ ...value, username: value.username || value.email || "" }))
    .parse(input);
  return transaction(service.db, async (db) => {
    const [existing] = await query(db, "SELECT id,name FROM users WHERE username=? OR email=?", [
      data.username,
      data.username,
    ]);
    const userId = existing?.id || randomUUID();
    if (!existing) {
      if (!data.password) fail(400, "新成员需设置至少 8 位初始密码");
      await query(
        db,
        "INSERT INTO users(id,username,email,name,password_hash) VALUES(?,?,NULL,?,?)",
        [userId, data.username, data.name, await hashPassword(data.password)],
      );
      await service.accountChange(db, userId, user.id, "created", {
        name: data.name,
        username: data.username,
      });
    }
    await query(
      db,
      "INSERT INTO members(project_id,user_id,role,joined_at,role_changed_at) VALUES(?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))",
      [projectId, userId, data.role],
    );
    const [sender] = await query(db, "SELECT name FROM users WHERE id=?", [user.id]);
    await service.notify(
      db,
      userId,
      projectId,
      "member_added",
      "你已被加入该项目",
      null,
      null,
      sender.name,
    );
    await service.projectChange(db, projectId, user.id, "member_added", {
      userId,
      userName: existing?.name || data.name,
      role: data.role,
    });
    return { id: userId, username: data.username, role: data.role };
  });
}

export async function updateMemberRoleOperation(service, user, projectId, userId, input) {
  if (user.kind !== "session") fail(403, "成员管理需要人工登录");
  id.parse(projectId);
  id.parse(userId);
  const { role } = z.object({ role: z.enum(["member", "viewer"]) }).parse(input);
  if ([AGENT_MEMBER.id, AGENT_XIAOXIANG_MEMBER.id].includes(userId))
    fail(409, "系统 Agent 不支持切换项目成员角色");
  return transaction(service.db, async (db) => {
    await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [projectId]);
    await service.projectManager(user, projectId, db);
    const [target] = await query(
      db,
      `SELECT u.name,m.role,p.project_leader_id FROM members m
         JOIN users u ON u.id=m.user_id JOIN projects p ON p.id=m.project_id
         WHERE m.project_id=? AND m.user_id=? FOR UPDATE`,
      [projectId, userId],
    );
    if (!target) fail(404, "项目成员不存在");
    if (target.project_leader_id === userId || target.role === "project_admin")
      fail(409, "项目负责人和项目管理员身份需通过专属操作管理");
    if (target.role === role) return { projectId, userId, role };
    await query(
      db,
      "UPDATE members SET role=?,role_changed_at=UTC_TIMESTAMP(6) WHERE project_id=? AND user_id=?",
      [role, projectId, userId],
    );
    await service.projectChange(db, projectId, user.id, "member_role_changed", {
      userId,
      userName: target.name,
      fromRole: target.role,
      toRole: role,
    });
    return { projectId, userId, role };
  });
}
