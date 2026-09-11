import { attachMessageQuotes } from "./message-quotes.js";
import { contextUsage } from "../shared/context.js";
import { AGENT_MEMBER, mentionsAgent } from "../shared/agent-member.js";
import { modelConfig } from "./model-config.js";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { digest, hashPassword } from "./auth.js";
import { publishWork } from "./work-events.js";
import { queueDocumentMemory, queueMemberMemory } from "./project-memory.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const id = z.string().uuid();
const title = z.string().trim().min(1).max(160);
const body = z.string().trim().min(1).max(20000);
const json = (value) => (typeof value === "string" ? JSON.parse(value) : value);
export class Service {
  constructor(db) {
    this.db = db;
  }
  async accountChange(db, targetUserId, actorUserId, action, details = {}) {
    await query(db, "INSERT INTO account_change_logs(id,target_user_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
      [randomUUID(), targetUserId, actorUserId, action, JSON.stringify(details)]);
  }
  async projectChange(db, projectId, actorUserId, action, details = {}) {
    await query(db, "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
      [randomUUID(), projectId, actorUserId, action, JSON.stringify(details)]);
  }
  async notify(db, userId, projectId, kind, text, threadId = null, messageId = null, senderName = "系统通知") {
    await query(db, "INSERT INTO notifications(id,user_id,project_id,kind,body,thread_id,message_id,sender_name) VALUES(?,?,?,?,?,?,?,?)",
      [randomUUID(), userId, projectId, kind, text, threadId, messageId, senderName]);
  }
  async notifications(user, before, input = {}) {
    if (user.kind !== "session") fail(403, "站内信需要人工登录");
    if (before) id.parse(before);
    const { kind, limit } = z.object({ kind: z.enum(["all", "mention", "member_added", "member_removed"]).default("all"), limit: z.coerce.number().int().min(1).max(50).default(50) }).parse(input);
    const params = [user.id];
    if (kind !== "all") params.push(kind);
    if (before) params.push(before, user.id);
    const itemsQuery = input.summary === "1" ? Promise.resolve([]) : query(this.db, `SELECT n.*,p.name project_name,
      CASE n.kind WHEN 'mention' THEN CONCAT('在「',COALESCE(t.title,p.name),'」中提到了你') WHEN 'member_added' THEN CONCAT('你已加入「',p.name,'」') ELSE CONCAT('你已被移出「',p.name,'」') END title,
      (m.user_id IS NOT NULL AND n.kind<>'member_removed') can_open
      FROM notifications n JOIN projects p ON p.id=n.project_id
      LEFT JOIN threads t ON t.id=n.thread_id
      LEFT JOIN members m ON m.project_id=n.project_id AND m.user_id=n.user_id
      WHERE n.user_id=? ${kind !== "all" ? "AND n.kind=?" : ""} ${before ? "AND (n.created_at,n.id)<(SELECT created_at,id FROM notifications WHERE id=? AND user_id=?)" : ""}
      ORDER BY n.created_at DESC,n.id DESC LIMIT ${limit + 1}`, params);
    const countsQuery = query(this.db, "SELECT kind,COUNT(*) total,SUM(read_at IS NULL) unread FROM notifications WHERE user_id=? GROUP BY kind", [user.id]);
    const [items, counts] = await Promise.all([itemsQuery, countsQuery]);
    return { items: items.slice(0, limit), unread: counts.reduce((sum, row) => sum + Number(row.unread), 0), counts: Object.fromEntries(counts.map((row) => [row.kind, { total: Number(row.total), unread: Number(row.unread) }])), next: items.length > limit ? items[limit - 1].id : null };
  }
  async readNotification(user, notificationId) {
    if (user.kind !== "session") fail(403, "站内信需要人工登录");
    if (notificationId) id.parse(notificationId);
    await query(this.db, `UPDATE notifications SET read_at=UTC_TIMESTAMP(3) WHERE user_id=? AND read_at IS NULL${notificationId ? " AND id=?" : ""}`, notificationId ? [user.id, notificationId] : [user.id]);
    return { ok: true };
  }
  async openNotification(user, notificationId) {
    if (user.kind !== "session") fail(403, "站内信需要人工登录");
    id.parse(notificationId);
    const [notice] = await query(this.db, "SELECT * FROM notifications WHERE id=? AND user_id=?", [notificationId, user.id]);
    if (!notice) fail(404, "站内信不存在");
    if (notice.kind === "member_removed") fail(403, "移出通知不支持跳转");
    if (notice.thread_id) await this.thread(user, notice.thread_id);
    const projects = await this.updateProjectTab(user, notice.project_id, { action: "open" });
    await this.readNotification(user, notificationId);
    return { projects, projectId: notice.project_id, threadId: notice.thread_id };
  }
  async removeMember(user, projectId, userId) {
    if (user.kind !== "session") fail(403, "成员管理需要人工登录");
    return transaction(this.db, async (db) => {
      await this.projectCreator(user, projectId, db);
      if (userId === AGENT_MEMBER.id || userId === user.id)
        fail(409, "项目创建人和小祥不能被移出项目");
      id.parse(userId);
      const result = await query(db, "DELETE FROM members WHERE project_id=? AND user_id=?", [projectId, userId]);
      if (!result.affectedRows) fail(409, "成员不存在或不能移除项目负责人");
      const [sender] = await query(db, "SELECT name FROM users WHERE id=?", [user.id]);
      await this.notify(db, userId, projectId, "member_removed", "你已被移出该项目", null, null, sender.name);
      await this.projectChange(db, projectId, user.id, "member_removed", { userId });
      return { ok: true };
    });
  }
  async projectCreator(user, projectId, db = this.db) {
    await this.member(user, projectId, false, db);
    const [project] = await query(db, "SELECT created_by FROM projects WHERE id=?", [projectId]);
    if (!project || project.created_by !== user.id)
      fail(403, "仅项目创建人可执行此操作");
  }
  async updateProject(user, projectId, input) {
    if (user.kind !== "session") fail(403, "项目设置需要人工登录");
    await this.projectCreator(user, projectId);
    const data = z.object({ name: title.max(120) }).parse(input);
    await transaction(this.db, async (db) => {
      const [previous] = await query(db, "SELECT name FROM projects WHERE id=? FOR UPDATE", [projectId]);
      await query(db, "UPDATE projects SET name=? WHERE id=?", [data.name, projectId]);
      await this.projectChange(db, projectId, user.id, "profile_updated", { before: { name: previous.name }, after: { name: data.name } });
    });
    return { id: projectId, ...data };
  }
  async systemAdmin(user, db = this.db) {
    if (user.kind !== "session") fail(403, "系统管理需要人工登录");
    const [account] = await query(db, "SELECT is_super_admin FROM users WHERE id=? AND disabled_at IS NULL", [user.id]);
    if (!account || !Number(account.is_super_admin)) fail(403, "仅超级管理员可执行此操作");
  }
  async member(user, projectId, write = false, db = this.db, owner = false) {
    id.parse(projectId);
    if (user.scope && user.scope !== projectId)
      fail(403, "令牌仅可访问指定项目");
    const [member] = await query(
      db,
      `SELECT m.role FROM members m JOIN projects p ON p.id=m.project_id
       WHERE m.project_id=? AND m.user_id=? AND p.archived_at IS NULL`,
      [projectId, user.id],
    );
    if (
      !member ||
      (write && member.role === "viewer") ||
      (owner && member.role !== "owner")
    )
      fail(403, "没有此项目的操作权限");
    return member;
  }
  async thread(user, threadId, write = false, db = this.db, { display = false } = {}) {
    id.parse(threadId);
    const [thread] = await query(
      db,
      `SELECT ${display ? "id,project_id,title,status,created_by,created_at,archived_at,IF(archive_snapshot IS NULL,NULL,JSON_OBJECT('conclusion',JSON_EXTRACT(archive_snapshot,'$.conclusion'),'versions',JSON_EXTRACT(archive_snapshot,'$.versions'))) archive_snapshot" : "*"} FROM threads WHERE id=?${write ? " FOR UPDATE" : ""}`,
      [threadId],
    );
    if (!thread) fail(404, "迭代不存在");
    await this.member(user, thread.project_id, write, db);
    if (write && thread.status !== "active")
      fail(409, "此迭代已归档，无法修改");
    return thread;
  }
  async projects(user) {
    return query(
      this.db,
      `SELECT p.*,m.role,m.tab_visible,m.tab_opened_at,m.tab_pinned_at,(SELECT COUNT(*) FROM threads t WHERE t.project_id=p.id AND t.status='active') active_threads
      FROM projects p JOIN members m ON m.project_id=p.id WHERE m.user_id=? AND p.archived_at IS NULL${user.scope ? " AND p.id=?" : ""}
      ORDER BY m.tab_pinned_at DESC,m.tab_opened_at DESC,p.created_at DESC,p.id`,
      user.scope ? [user.id, user.scope] : [user.id],
    );
  }
  async updateProjectTab(user, projectId, input) {
    if (user.kind === "api") fail(403, "请在界面中管理项目页签");
    await this.member(user, projectId);
    const { action } = z
      .object({ action: z.enum(["open", "close", "pin", "unpin"]) })
      .parse(input);
    const updates = {
      open: "tab_opened_at=IF(tab_visible,tab_opened_at,UTC_TIMESTAMP(6)),tab_visible=TRUE",
      close: "tab_visible=FALSE",
      pin: "tab_pinned_at=UTC_TIMESTAMP(6)",
      unpin: "tab_pinned_at=NULL",
    };
    await transaction(this.db, async (db) => {
      await query(db, "SELECT id FROM users WHERE id=? FOR UPDATE", [user.id]);
      await query(
        db,
        `UPDATE members SET ${updates[action]} WHERE project_id=? AND user_id=?${action === "close" ? " AND tab_pinned_at IS NULL" : action === "pin" ? " AND tab_visible=TRUE" : ""}`,
        [projectId, user.id],
      );
    });
    return this.projects(user);
  }
  async reorderProjectTabs(user, input) {
    if (user.kind === "api") fail(403, "请在界面中管理项目页签");
    const { projectIds } = z
      .object({ projectIds: z.array(id).min(1).max(1000) })
      .parse(input);
    await transaction(this.db, async (db) => {
      await query(db, "SELECT id FROM users WHERE id=? FOR UPDATE", [user.id]);
      const pinned = await query(
        db,
        "SELECT project_id FROM members WHERE user_id=? AND tab_visible=TRUE AND tab_pinned_at IS NOT NULL FOR UPDATE",
        [user.id],
      );
      const allowed = new Set(pinned.map((p) => p.project_id));
      if (
        projectIds.length !== allowed.size ||
        new Set(projectIds).size !== allowed.size ||
        projectIds.some((projectId) => !allowed.has(projectId))
      )
        fail(409, "固定项目列表已变化，请刷新后重试");
      // Pinned timestamps are ordering keys; opening times stay unchanged.
      const [clock] = await query(db, "SELECT UTC_TIMESTAMP(6) sort_time");
      for (const [index, projectId] of projectIds.entries()) {
        await query(
          db,
          "UPDATE members SET tab_pinned_at=DATE_SUB(?, INTERVAL ? MICROSECOND) WHERE user_id=? AND project_id=?",
          [clock.sort_time, index, user.id, projectId],
        );
      }
    });
    return this.projects(user);
  }
  async createProject(user, input) {
    if (user.kind === "api") fail(403, "请在界面中创建项目");
    const data = z
      .object({
        name: title.max(120),
        description: z.string().max(4000).default(""),
      })
      .parse(input);
    const projectId = randomUUID();
    await transaction(this.db, async (db) => {
      await query(
        db,
        "INSERT INTO projects(id,name,description,created_by) VALUES(?,?,?,?)",
        [projectId, data.name, data.description, user.id],
      );
      await query(
        db,
        "INSERT INTO document_folders(id,project_id,name,system_key) VALUES(?,?,?,?)",
        [randomUUID(), projectId, "对话临时文件", "chat_uploads"],
      );
      await query(
        db,
        "INSERT INTO members(project_id,user_id,role,tab_visible,tab_opened_at) VALUES(?,?,?,TRUE,UTC_TIMESTAMP(6))",
        [projectId, user.id, "owner"],
      );
      await this.projectChange(db, projectId, user.id, "created", { name: data.name, description: data.description });
    });
    return { id: projectId, ...data };
  }
  async project(user, projectId, { display = false } = {}) {
    await this.member(user, projectId);
    const projectQuery = query(
      this.db,
      "SELECT * FROM projects WHERE id=?",
      [projectId],
    );
    const threadsQuery = query(
      this.db,
      `SELECT t.id,t.title,t.status,t.created_at,t.archived_at,t.created_by,u.name creator,
       GREATEST(t.created_at,COALESCE(t.archived_at,t.created_at),
         COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.thread_id=t.id),t.created_at),
         COALESCE((SELECT MAX(COALESCE(e.finished_at,e.created_at)) FROM agent_events e JOIN messages m ON m.id=e.message_id WHERE m.thread_id=t.id),t.created_at),
         COALESCE((SELECT MAX(COALESCE(r.finished_at,r.created_at)) FROM sandbox_runs r WHERE r.thread_id=t.id),t.created_at)
       ) last_active_at
       FROM threads t JOIN users u ON u.id=t.created_by WHERE t.project_id=? ORDER BY last_active_at DESC,t.created_at DESC`,
      [projectId],
    );
    const membersQuery = query(
      this.db,
      `SELECT u.id,u.user_number,u.username,u.name,COALESCE(u.username,u.email) email,u.email bound_email,${display ? "CONCAT('/api/projects/',m.project_id,'/members/',u.id,'/avatar?v=',LEFT(SHA2(u.avatar,256),16)) avatar" : "u.avatar"},u.motto,u.identity_tags,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?`,
      [projectId],
    );
    const versionsQuery = query(
      this.db,
      `SELECT a.id artifact_id,a.title,a.folder_id,COALESCE(a.deleted_at,vr.deleted_at) deleted_at,a.deleted_at artifact_deleted_at,vr.deleted_at version_deleted_at,a.updated_at,v.id,v.version,v.filename,v.mime,v.byte_size,v.sha256,v.note,v.thread_id,v.created_at,u.name author,
      (SELECT r.decision FROM reviews r WHERE r.version_id=v.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) review
      FROM artifacts a JOIN versions v ON v.artifact_id=a.id LEFT JOIN version_recycle vr ON vr.version_id=v.id JOIN users u ON u.id=v.created_by WHERE a.project_id=? ORDER BY v.created_at DESC,v.version DESC`,
      [projectId],
    );
    const foldersQuery = query(
      this.db,
      "SELECT id,parent_id,name,updated_at,system_key FROM document_folders WHERE project_id=? ORDER BY name",
      [projectId],
    );
    const [[project], threads, members, versions, folders] = await Promise.all([projectQuery, threadsQuery, membersQuery, versionsQuery, foldersQuery]);
    const coordinatorModel = modelConfig("coordinator");
    return {
      ...project,
      threads,
      members: [...members, {
        ...AGENT_MEMBER,
        motto: `${coordinatorModel.model} · ${coordinatorModel.reasoningEffort}`,
      }],
      versions,
      folders,
    };
  }
  async agentMonitor(user, projectId) {
    await this.member(user, projectId);
    const modelSummary = (scope) => {
      const config = modelConfig(scope);
      return { provider: config.provider, model: config.model, reasoningEffort: config.reasoningEffort };
    };
    const [memberQueue, documentQueue, memberSummary, documentSummary, coordinators, executors] =
      await Promise.all([
        query(this.db, `SELECT COUNT(*) pending,
          COALESCE(SUM(available_at<=UTC_TIMESTAMP(3)),0) ready,
          MIN(available_at) next_at FROM agent_member_memory_queue WHERE project_id=?`, [projectId]),
        query(this.db, `SELECT COUNT(*) pending,
          COALESCE(SUM(q.available_at<=UTC_TIMESTAMP(3)),0) ready,
          MIN(q.available_at) next_at FROM agent_document_memory_queue q
          JOIN versions v ON v.id=q.version_id JOIN artifacts a ON a.id=v.artifact_id
          WHERE a.project_id=?`, [projectId]),
        query(this.db, "SELECT MAX(updated_at) updated_at FROM agent_member_summaries WHERE project_id=?", [projectId]),
        query(this.db, `SELECT MAX(s.updated_at) updated_at FROM agent_document_summaries s
          JOIN versions v ON v.id=s.version_id JOIN artifacts a ON a.id=v.artifact_id
          WHERE a.project_id=?`, [projectId]),
        query(this.db, `SELECT t.id,t.title,t.status,t.created_at,t.archived_at,
          COALESCE(SUM(q.status='queued'),0) queued_requests,
          COALESCE(SUM(q.status='running'),0) running_requests,
          (SELECT COUNT(*) FROM assistant_replies ar JOIN messages am ON am.id=ar.message_id
            WHERE am.thread_id=t.id AND ar.execution_active=TRUE) active_executors,
          MAX(COALESCE(q.first_response_at,m.created_at,t.created_at)) last_activity_at
          FROM threads t LEFT JOIN messages m ON m.thread_id=t.id
          LEFT JOIN agent_requests q ON q.message_id=m.id
          WHERE t.project_id=? GROUP BY t.id,t.title,t.status,t.created_at,t.archived_at
          ORDER BY t.status='active' DESC,last_activity_at DESC`, [projectId]),
        query(this.db, `SELECT r.message_id task_id,t.id thread_id,t.title thread_title,
          m.author_id,u.name requested_by,LEFT(m.body,280) goal,r.status,r.progress,
          r.agent_slot,r.execution_active,m.created_at started_at,r.finished_at,
          e.tool last_action,e.status last_action_status,e.created_at last_action_at,
          (SELECT COUNT(*) FROM agent_task_updates tu WHERE tu.task_message_id=r.message_id) update_count
          FROM assistant_replies r JOIN messages m ON m.id=r.message_id
          JOIN threads t ON t.id=m.thread_id JOIN users u ON u.id=m.author_id
          LEFT JOIN agent_events e ON e.id=(SELECT MAX(ae.id) FROM agent_events ae WHERE ae.message_id=r.message_id)
          WHERE t.project_id=? AND (r.agent_slot IS NOT NULL OR r.execution_active=TRUE)
          ORDER BY r.execution_active DESC,m.created_at DESC LIMIT 100`, [projectId]),
      ]);
    const memberMemory = memberQueue[0] || {};
    const documentMemory = documentQueue[0] || {};
    return {
      generatedAt: new Date().toISOString(),
      models: {
        knowledge: modelSummary("knowledge"),
        coordinator: modelSummary("coordinator"),
        executor: modelSummary("executor"),
      },
      knowledge: {
        memberPending: Number(memberMemory.pending || 0),
        documentPending: Number(documentMemory.pending || 0),
        ready: Number(memberMemory.ready || 0) + Number(documentMemory.ready || 0),
        nextAt: [memberMemory.next_at, documentMemory.next_at].filter(Boolean)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || null,
        lastUpdatedAt: [memberSummary[0]?.updated_at, documentSummary[0]?.updated_at].filter(Boolean)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null,
      },
      coordinators: coordinators.map((row) => ({
        ...row,
        queued_requests: Number(row.queued_requests),
        running_requests: Number(row.running_requests),
        active_executors: Number(row.active_executors),
      })),
      executors: executors.map((row) => ({ ...row, update_count: Number(row.update_count) })),
    };
  }
  async users(user, projectId) {
    if (user.kind !== "session") fail(403, "成员目录需要人工登录");
    if (projectId) await this.member(user, projectId);
    return query(
      this.db,
      `SELECT id,user_number,COALESCE(username,email) username,name,email,avatar,motto,identity_tags FROM users
       WHERE disabled_at IS NULL${projectId ? " AND id NOT IN (SELECT user_id FROM members WHERE project_id=?)" : ""}
       ORDER BY name,username,email`,
      projectId ? [projectId] : [],
    );
  }
  async createUser(user, input) {
    await this.systemAdmin(user);
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
      created = await transaction(this.db, async (db) => {
        await query(db, "INSERT INTO users(id,username,email,name,password_hash) VALUES(?,?,NULL,?,?)",
          [userId, data.username, data.name, await hashPassword(password)]);
        await this.accountChange(db, userId, user.id, "created", { name: data.name, username: data.username });
        const row = (await query(db, "SELECT user_number FROM users WHERE id=?", [userId]))[0];
        if (Number(row.user_number) > 999999) fail(409, "六位用户ID已用完");
        return row;
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY")
        fail(409, "该账号名已被使用");
      throw error;
    }
    return { id: userId, user_number: Number(created.user_number), name: data.name, username: data.username, email: null, password };
  }
  async adminProjects(user) {
    await this.systemAdmin(user);
    const [projects, memberships, changes] = await Promise.all([
      query(this.db, `SELECT p.id,p.name,p.description,p.created_at,p.archived_at,p.created_by,u.name creator
        FROM projects p JOIN users u ON u.id=p.created_by ORDER BY p.archived_at IS NOT NULL,p.created_at DESC,p.id`),
      query(this.db, `SELECT m.project_id,u.id,u.user_number,COALESCE(u.username,u.email) username,u.name,u.email,m.role FROM members m JOIN users u ON u.id=m.user_id
        ORDER BY u.name,u.username,u.email`),
      query(this.db, `SELECT l.project_id,l.action,l.details,l.created_at,u.name actor FROM
        (SELECT project_id,actor_user_id,action,details,created_at,id,
          ROW_NUMBER() OVER(PARTITION BY project_id ORDER BY created_at DESC,id DESC) audit_rank
         FROM project_change_logs) l JOIN users u ON u.id=l.actor_user_id
        WHERE l.audit_rank<=50 ORDER BY l.created_at DESC,l.id DESC`),
    ]);
    return projects.map((project) => ({ ...project,
      members: memberships.filter((member) => member.project_id === project.id),
      changes: changes.filter((change) => change.project_id === project.id).slice(0, 50),
    }));
  }
  async adminCreateProject(user, input) {
    await this.systemAdmin(user);
    return this.createProject(user, input);
  }
  async setProjectArchived(user, projectId, archived) {
    await this.systemAdmin(user);
    id.parse(projectId);
    const result = await transaction(this.db, async (db) => {
      const changed = await query(db, `UPDATE projects SET archived_at=${archived ? "UTC_TIMESTAMP(3)" : "NULL"} WHERE id=?`, [projectId]);
      if (changed.affectedRows) await this.projectChange(db, projectId, user.id, archived ? "archived" : "restored");
      return changed;
    });
    if (!result.affectedRows) fail(404, "项目不存在");
    return { id: projectId, archived };
  }
  async adminAccounts(user) {
    await this.systemAdmin(user);
    const [accounts, memberships, changes, logins] = await Promise.all([
      query(this.db, "SELECT id,user_number,COALESCE(username,email) username,name,email,email_verified_at,is_super_admin,disabled_at,created_at FROM users ORDER BY disabled_at IS NOT NULL,user_number"),
      query(this.db, `SELECT m.user_id,p.id,p.name,m.role,p.archived_at FROM members m JOIN projects p ON p.id=m.project_id
        ORDER BY p.archived_at IS NOT NULL,p.name,p.id`),
      query(this.db, `SELECT l.target_user_id,l.action,l.details,l.created_at,u.name actor FROM
        (SELECT target_user_id,actor_user_id,action,details,created_at,id,
          ROW_NUMBER() OVER(PARTITION BY target_user_id ORDER BY created_at DESC,id DESC) audit_rank
         FROM account_change_logs) l JOIN users u ON u.id=l.actor_user_id
        WHERE l.audit_rank<=50 ORDER BY l.created_at DESC,l.id DESC`),
      query(this.db, `SELECT user_id,email identifier,ip,country,province,city,district,success,failure_reason,created_at FROM
        (SELECT user_id,email,ip,country,province,city,district,success,failure_reason,created_at,id,
          ROW_NUMBER() OVER(PARTITION BY COALESCE(user_id,email) ORDER BY created_at DESC,id DESC) audit_rank
         FROM login_logs) l WHERE audit_rank<=50 ORDER BY created_at DESC,id DESC`),
    ]);
    return accounts.map((account) => ({ ...account,
      projects: memberships.filter((project) => project.user_id === account.id),
      changes: changes.filter((change) => change.target_user_id === account.id).slice(0, 50),
      logins: logins.filter((login) => login.user_id === account.id || (!login.user_id && [account.username, account.email].includes(login.identifier))).slice(0, 50),
    }));
  }
  async setAccountDisabled(user, userId, input) {
    await this.systemAdmin(user);
    id.parse(userId);
    const { disabled } = z.object({ disabled: z.boolean() }).parse(input);
    if (userId === user.id && disabled) fail(409, "不能停用当前登录账号");
    const result = await transaction(this.db, async (db) => {
      const changed = await query(db, `UPDATE users SET disabled_at=${disabled ? "UTC_TIMESTAMP(3)" : "NULL"} WHERE id=?`, [userId]);
      if (disabled) await query(db, "DELETE FROM credentials WHERE user_id=?", [userId]);
      if (changed.affectedRows) await this.accountChange(db, userId, user.id, disabled ? "disabled" : "enabled");
      return changed;
    });
    if (!result.affectedRows) fail(404, "账号不存在");
    return { id: userId, disabled };
  }
  async resetAccountPassword(user, userId) {
    await this.systemAdmin(user);
    id.parse(userId);
    const password = randomBytes(15).toString("base64url");
    const result = await transaction(this.db, async (db) => {
      const changed = await query(db, "UPDATE users SET password_hash=? WHERE id=?", [await hashPassword(password), userId]);
      await query(db, "DELETE FROM credentials WHERE user_id=?", [userId]);
      if (changed.affectedRows) await this.accountChange(db, userId, user.id, "password_reset");
      return changed;
    });
    if (!result.affectedRows) fail(404, "账号不存在");
    return { password };
  }
  async addMember(user, projectId, input) {
    await this.member(user, projectId);
    if (user.kind !== "session") fail(403, "成员管理需要人工登录");
    if (input.userId) {
      const data = z
        .object({
          userId: id,
          role: z.enum(["member", "viewer"]).default("member"),
        })
        .parse(input);
      const [account] = await query(
        this.db,
        "SELECT id FROM users WHERE id=? AND disabled_at IS NULL",
        [data.userId],
      );
      if (!account) fail(404, "账号不存在");
      try {
        await transaction(this.db, async (db) => {
        await query(
          db,
          "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)",
          [projectId, data.userId, data.role],
        );
        const [sender] = await query(db, "SELECT name FROM users WHERE id=?", [user.id]);
        await this.notify(db, data.userId, projectId, "member_added", "你已被加入该项目", null, null, sender.name);
        await this.projectChange(db, projectId, user.id, "member_added", { userId: data.userId, role: data.role });
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
    return transaction(this.db, async (db) => {
      const [existing] = await query(db, "SELECT id FROM users WHERE username=? OR email=?", [
        data.username, data.username,
      ]);
      const userId = existing?.id || randomUUID();
      if (!existing) {
        if (!data.password) fail(400, "新成员需设置至少 8 位初始密码");
        await query(
          db,
          "INSERT INTO users(id,username,email,name,password_hash) VALUES(?,?,NULL,?,?)",
          [userId, data.username, data.name, await hashPassword(data.password)],
        );
        await this.accountChange(db, userId, user.id, "created", { name: data.name, username: data.username });
      }
      await query(
        db,
        "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)",
        [projectId, userId, data.role],
      );
      const [sender] = await query(db, "SELECT name FROM users WHERE id=?", [user.id]);
      await this.notify(db, userId, projectId, "member_added", "你已被加入该项目", null, null, sender.name);
      await this.projectChange(db, projectId, user.id, "member_added", { userId, role: data.role });
      return { id: userId, username: data.username, role: data.role };
    });
  }
  async createThread(user, projectId, input) {
    await this.member(user, projectId, true);
    const data = z.object({ title }).parse(input);
    const threadId = randomUUID();
    await query(
      this.db,
      "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)",
      [threadId, projectId, data.title, user.id],
    );
    return { id: threadId, ...data };
  }
  async context(user, threadId, db = this.db, { display = false, limit = 50, before, after } = {}) {
    const thread = await this.thread(user, threadId, false, db, { display });
    const pageSize = z.coerce.number().int().min(1).max(200).parse(limit);
    const cursor = before || after;
    if (cursor) z.string().regex(/^\d+$/).parse(cursor);
    const messagesQuery = query(
      db,
      `SELECT m.id,m.sequence,m.body,m.refs,m.source,m.agent_task_id,m.created_at,u.name author,u.id author_id,${display ? "CASE WHEN m.source='assistant' THEN NULL ELSE CONCAT('/api/projects/',?,'/members/',u.id,'/avatar?v=',LEFT(SHA2(u.avatar,256),16)) END author_avatar" : "u.avatar author_avatar"},
      JSON_UNQUOTE(JSON_EXTRACT(u.identity_tags, '$[0]')) author_role
      FROM messages m JOIN users u ON u.id=m.author_id WHERE m.thread_id=?${display && cursor ? ` AND m.sequence${before ? "<" : ">"}?` : ""} ORDER BY m.sequence${display && !after ? " DESC" : ""}${display ? ` LIMIT ${pageSize + 1}` : ""}`,
      display ? [thread.project_id, threadId, ...(cursor ? [cursor] : [])] : [threadId],
    );
    const page = display ? await messagesQuery : null;
    const hasMore = !!page && page.length > pageSize;
    const selected = page?.slice(0, pageSize);
    if (display && !after) selected.reverse();
    const eventFilter = display && !after ? ` AND m.id IN (${selected.length ? selected.map(() => "?").join(",") : "NULL"})` : "";
    const reviewsQuery = query(
      db,
      `SELECT r.*,u.name reviewer FROM reviews r JOIN versions v ON v.id=r.version_id
      JOIN users u ON u.id=r.reviewer_id WHERE v.thread_id=? ORDER BY r.created_at,r.id`,
      [threadId],
    );
    const runsQuery = query(
      db,
      "SELECT id,kind,status,output,progress,created_at,finished_at FROM sandbox_runs WHERE thread_id=? ORDER BY created_at DESC LIMIT 20",
      [threadId],
    );
    const repliesQuery = query(
      db,
      `SELECT r.message_id,m.author_id,m.created_at started_at,r.status,r.error,r.reply_id,r.progress,r.participation,r.parent_message_id,r.dispatch_ready,r.agent_slot,r.finished_at,r.first_response_at,r.usage_stats FROM assistant_replies r
      JOIN messages m ON m.id=r.message_id WHERE m.thread_id=? ORDER BY m.sequence`,
      [threadId],
    );
    const eventsQuery = query(
      db,
      `SELECT ${display ? `e.id,e.message_id,e.tool,e.status,e.created_at,e.finished_at,
       CASE WHEN JSON_VALID(e.input) THEN JSON_OBJECT('action',JSON_EXTRACT(e.input,'$.action'),'scope',JSON_EXTRACT(e.input,'$.scope'),'name',JSON_EXTRACT(e.input,'$.name'),'artifactId',JSON_EXTRACT(e.input,'$.artifactId'),'folderId',JSON_EXTRACT(e.input,'$.folderId'),'threadId',JSON_EXTRACT(e.input,'$.threadId'),'versionId',JSON_EXTRACT(e.input,'$.versionId'),
       'path',JSON_EXTRACT(e.input,'$.path'),'title',JSON_EXTRACT(e.input,'$.title'),'command',LEFT(JSON_UNQUOTE(JSON_EXTRACT(e.input,'$.command')),300)) ELSE '{}' END input,
       NULL output` : "e.*"} FROM agent_events e JOIN messages m ON m.id=e.message_id WHERE m.thread_id=?${eventFilter} ORDER BY e.id`,
      [threadId, ...(display && !after ? selected.map((m) => m.id) : [])],
    );
    const agentContextQuery = query(
      db,
      "SELECT context_stats,seen_sequence,compact_status,compact_error,compact_result FROM agent_sessions WHERE thread_id=?",
      [threadId],
    );
    const updatesQuery = query(db,
      `SELECT u.message_id,u.task_message_id,u.delivered_at FROM agent_task_updates u
       JOIN messages m ON m.id=u.message_id WHERE m.thread_id=? ORDER BY m.sequence`, [threadId]);
    const requestsQuery = query(db,
      `SELECT q.message_id,q.status,q.response_id,q.error,q.first_response_at,q.usage_stats FROM agent_requests q JOIN messages m ON m.id=q.message_id
       WHERE m.thread_id=? ORDER BY m.sequence`, [threadId]);
    const pendingQuery = display ? query(db, `SELECT m.id,m.sequence,m.body,m.refs,m.source,u.name author,u.id author_id,JSON_UNQUOTE(JSON_EXTRACT(u.identity_tags, '$[0]')) author_role FROM messages m JOIN users u ON u.id=m.author_id LEFT JOIN agent_sessions s ON s.thread_id=m.thread_id WHERE m.thread_id=? AND m.sequence>COALESCE(s.seen_sequence,0)`, [threadId]) : Promise.resolve(null);
    const [messages, reviews, runs, replies, events, [agentContext], updates, requests, pending] = await Promise.all([display ? selected : messagesQuery, reviewsQuery, runsQuery, repliesQuery, eventsQuery, agentContextQuery, updatesQuery, requestsQuery, pendingQuery]);
    const withQuotes = await attachMessageQuotes(db, [...new Map([...(pending || []), ...messages].map(m => [m.id, { ...m, refs: json(m.refs) }])).values()]);
    const quotedById = new Map(withQuotes.map(m => [m.id, m]));
    return {
      ...thread,
      contextUsage: contextUsage(
        agentContext,
        (pending || messages).map(m => quotedById.get(m.id)),
        replies,
      ),
      archive_snapshot: thread.archive_snapshot
        ? json(thread.archive_snapshot)
        : null,
      ...(display ? { page: { hasMore, before: messages[0]?.sequence || null, after: messages.at(-1)?.sequence || after || null } } : {}),
      messages: messages.map(m => quotedById.get(m.id)),
      reviews,
      runs,
      replies,
      events: events.map((event) => ({ ...event, input: typeof event.input === "string" ? event.input : JSON.stringify(event.input) })),
      updates,
      requests,
    };
  }
  async refs(db, projectId, refs) {
    for (const ref of refs) {
      const [version] = await query(
        db,
        "SELECT v.id FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.id=? AND a.project_id=?",
        [ref, projectId],
      );
      if (!version) fail(400, "引用的文档版本不属于当前项目");
    }
  }
  async insertMessage(
    db,
    user,
    threadId,
    text,
    refs = [],
    source = user.kind === "agent"
      ? "assistant"
      : user.kind === "api"
        ? "local_ai"
        : "human",
    agentTaskId = null,
    messageId = randomUUID(),
  ) {
    const inserted = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs,agent_task_id) VALUES(?,?,?,?,?,?,?)",
      [messageId, threadId, user.id, source, text, JSON.stringify(refs), agentTaskId],
    );
    if (source !== "system") {
      const [thread] = await query(db, "SELECT project_id,title FROM threads WHERE id=?", [threadId]);
      const members = await query(db, "SELECT u.id,u.name,COALESCE(u.username,u.email) email FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? AND (?='assistant' OR u.id<>?)", [thread.project_id, source, user.id]);
      const [author] = await query(db, "SELECT name FROM users WHERE id=?", [user.id]);
      const memoryMembers = new Set([...(source === "human" || source === "local_ai" ? [user.id] : [])]);
      for (const member of members) {
        const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if ([member.name, member.email].some((value) => new RegExp(`(^|[^\\p{L}\\p{N}_@])@${escape(value)}(?=$|[^\\p{L}\\p{N}_@])`, "u").test(text))) {
          memoryMembers.add(member.id);
          await this.notify(db, member.id, thread.project_id, "mention", `${source === "assistant" ? AGENT_MEMBER.name : author.name} 在「${thread.title}」中 @了你：${text.slice(0, 500)}`, threadId, messageId, source === "assistant" ? AGENT_MEMBER.name : author.name);
        }
      }
      if (memoryMembers.size) await queueMemberMemory(db, thread.project_id,
        [...memoryMembers], String(inserted.insertId));
    }
    return { id: messageId };
  }

  async listMessages(user, threadId, input = {}) {
    await this.thread(user, id.parse(threadId));
    const args = z.object({ limit: z.number().int().min(1).max(100).default(20), beforeMessageId: id.optional() }).parse(input);
    let sequence;
    if (args.beforeMessageId) {
      const [anchor] = await query(this.db, "SELECT sequence FROM messages WHERE id=? AND thread_id=?", [args.beforeMessageId, threadId]);
      if (!anchor) fail(404, "消息不存在于当前会话");
      sequence = anchor.sequence;
    }
    const rows = await query(this.db, `SELECT m.id,m.thread_id,m.sequence,m.source,m.body,m.refs,m.author_id,u.name author,m.created_at
      FROM messages m JOIN users u ON u.id=m.author_id WHERE m.thread_id=?${sequence ? ' AND m.sequence<?' : ''}
      ORDER BY m.sequence DESC LIMIT ?`, [threadId, ...(sequence ? [sequence] : []), args.limit + 1]);
    const hasMore = rows.length > args.limit;
    const messages = await attachMessageQuotes(this.db, rows.slice(0,args.limit).reverse().map(m => ({...m,refs:json(m.refs)})));
    return { threadId, messages, page: { hasMore, beforeMessageId: messages[0]?.id || null } };
  }
  async readMessage(user, threadId, messageId, before = 0) {
    await this.thread(user, id.parse(threadId));
    id.parse(messageId);
    z.number().int().min(0).max(20).parse(before);
    const [row] = await query(this.db, `SELECT m.id,m.thread_id,m.sequence,m.source,m.body,m.refs,m.author_id,u.name author,m.created_at
      FROM messages m JOIN users u ON u.id=m.author_id WHERE m.id=? AND m.thread_id=?`, [messageId, threadId]);
    if (!row) fail(404, "消息不存在于当前会话");
    const [message] = await attachMessageQuotes(this.db,[{...row,refs:json(row.refs)}]);
    const previous = before ? (await this.listMessages(user, threadId, {beforeMessageId:messageId,limit:before})).messages : [];
    return { message, previous };
  }
  async conversationMembers(user, projectId, memberId) {
    await this.member(user, id.parse(projectId));
    if (memberId === AGENT_MEMBER.id) return { id: AGENT_MEMBER.id, name: AGENT_MEMBER.name, role: AGENT_MEMBER.role, identity_tags: AGENT_MEMBER.identity_tags };
    if (memberId) id.parse(memberId);
    const rows = await query(this.db, `SELECT u.id,u.name,m.role${memberId ? ',u.motto,u.identity_tags' : ''}
      FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?${memberId ? ' AND u.id=?' : ''} ORDER BY u.name,u.id`, [projectId,...(memberId ? [memberId] : [])]);
    if (memberId) { if (!rows.length) fail(404,"成员不属于当前项目"); return rows[0]; }
    return [...rows, { id: AGENT_MEMBER.id, name: AGENT_MEMBER.name, role: AGENT_MEMBER.role }];
  }
  async postMessage(user, threadId, input) {
    const data = z
      .object({
        body,
        refs: z.array(id).max(30).default([]),
        quoteIds: z.array(id).max(10).default([]),
        clientMessageId: id.optional(),
        mentionAgent: z.boolean().default(false),
        files: z.array(z.object({
          title,
          filename: z.string().min(1).max(200),
          mime: z.string().optional(),
          contentBase64: z.string().max(7_000_000),
          folderId: id.nullable().optional(),
        })).max(10).default([]),
      })
      .parse(input);
    if (data.refs.length + data.files.length > 30)
      fail(400, "一条消息最多关联 30 个文档版本（含上传文件）");
    if (data.files.reduce((sum, file) => sum + Buffer.from(file.contentBase64, "base64").length, 0) > 20 * 1024 * 1024)
      fail(413, "一条消息的文件总大小不能超过 20 MiB");
    const text = data.mentionAgent && !mentionsAgent(data.body)
      ? `@${AGENT_MEMBER.name} ${data.body}` : data.body;
    body.parse(text);
    const result = await transaction(this.db, async (db) => {
      const thread = await this.thread(user, threadId, true, db);
      if (data.clientMessageId) {
        const [existing] = await query(db,
          "SELECT id,thread_id,author_id,source FROM messages WHERE id=?", [data.clientMessageId]);
        if (existing) {
          if (existing.thread_id !== threadId || existing.author_id !== user.id || existing.source !== "human")
            fail(409, "消息标识已被占用");
          return { id: existing.id, duplicate: true };
        }
      }
      await this.refs(db, thread.project_id, data.refs);
      const quoteIds = [...new Set(data.quoteIds)];
      if (quoteIds.length) {
        const quoted = await query(db, `SELECT id FROM messages WHERE thread_id=? AND id IN (${quoteIds.map(() => '?').join(',')})`, [threadId, ...quoteIds]);
        if (quoted.length !== quoteIds.length) fail(400, "只能引用当前会话中存在的消息");
      }
      const files = [];
      for (const file of data.files) {
        files.push(await this.submitVersion(user, threadId, file, undefined, undefined, false, { db, silent: true }));
      }
      const refs = [...new Set([...data.refs, ...files.map((file) => file.id)])];
      const message = await this.insertMessage(
        db,
        user,
        threadId,
        text,
        refs,
        undefined,
        null,
        data.clientMessageId,
      );
      for (const quotedId of quoteIds) await query(db,
        "INSERT INTO message_quotes(message_id,quoted_message_id) VALUES(?,?)", [message.id, quotedId]);
      if (user.kind === "session" || (user.kind === "api" && mentionsAgent(text))) {
        await query(db, "INSERT INTO agent_requests(message_id) VALUES(?)", [message.id]);
        if (mentionsAgent(text)) {
          // postMessage already holds the discussion row lock. Completion and
          // dispatch use the same lock, so an update cannot fall between tasks.
          const [existing] = await query(db,
            `SELECT r.message_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id
             WHERE m.thread_id=? AND m.author_id=? AND r.status IN ('queued','running')
             AND r.participation='reply' ORDER BY m.sequence LIMIT 1`, [threadId, user.id]);
          if (existing) {
            await query(db, "INSERT INTO agent_task_updates(message_id,task_message_id) VALUES(?,?)",
              [message.id, existing.message_id]);
            return { ...message, refs, files, updatedTaskId: existing.message_id };
          }
        }
        // Agent is a built-in member, so only real project memberships are
        // stored here. Other members count even when they have not spoken.
        const others = await query(
          db,
          "SELECT user_id FROM members WHERE project_id=? AND user_id<>? LIMIT 1",
          [thread.project_id, user.id],
        );
        await query(
          db,
          "INSERT INTO assistant_replies(message_id,participation) VALUES(?,?)",
          [
            message.id,
            mentionsAgent(text) || !others.length ? "reply" : "pending",
          ],
        );
      }
      return { ...message, refs, files };
    });
    publishWork(this.db, threadId);
    // Return the committed chat row and receipt so the sender can render them
    // immediately, without waiting for a separate workspace refresh.
    const [saved] = await query(this.db, `SELECT m.sequence,m.body,m.source,m.created_at,u.name author,m.author_id,
      q.status request_status,r.participation FROM messages m JOIN users u ON u.id=m.author_id
      LEFT JOIN agent_requests q ON q.message_id=m.id LEFT JOIN assistant_replies r ON r.message_id=m.id
      WHERE m.id=?`, [result.id]);
    return { ...result, ...saved };
  }
  async submitVersion(
    user,
    threadId,
    input,
    exportKey,
    agentMessageId,
    chatUpload = false,
    options = {},
  ) {
    if (chatUpload && user.kind !== "session")
      fail(403, "对话上传需要人工登录");
    const data = z
      .object({
        artifactId: id.optional(),
        folderId: id.nullable().optional(),
        title,
        filename: z
          .string()
          .min(1)
          .max(200)
          .refine((x) => !/[\\/\x00-\x1f]/.test(x), "文件名不可包含路径"),
        mime: z
          .string()
          .max(150)
          .regex(/^[\w.+-]+\/[\w.+-]+$/)
          .default("text/plain"),
        contentBase64: z
          .string()
          .max(7_000_000)
          .refine((value) => Buffer.from(value, "base64").toString("base64") === value,
            "文件内容必须为有效的 base64"),
        note: z.string().max(4000).default(""),
      })
      .parse(input);
    const bytes = Buffer.from(data.contentBase64, "base64");
    if (bytes.length > 5 * 1024 * 1024) fail(413, "首版单个文件上限为 5 MiB");
    const save = async (db) => {
      const thread = await this.thread(user, threadId, true, db);
      if (agentMessageId) {
        const [job] = await query(
          db,
          "SELECT status FROM assistant_replies WHERE message_id=? FOR UPDATE",
          [agentMessageId],
        );
        if (job?.status !== "running")
          fail(409, "Agent 任务已停止，不能继续提交");
      }
      if (exportKey) {
        const [existing] = await query(
          db,
          `SELECT v.id,v.artifact_id artifactId,v.version,v.sha256 FROM agent_exports e JOIN versions v ON v.id=e.version_id WHERE e.export_key=?`,
          [exportKey],
        );
        if (existing) return { ...existing, reused: true };
      }
      await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [
        thread.project_id,
      ]);
      if (chatUpload) {
        if (data.artifactId) fail(400, "对话上传必须创建新文件");
        const [temporary] = await query(
          db,
          "SELECT id FROM document_folders WHERE project_id=? AND system_key='chat_uploads'",
          [thread.project_id],
        );
        data.folderId = temporary.id;
      }
      if (data.folderId) {
        const [folder] = await query(
          db,
          "SELECT id,system_key FROM document_folders WHERE id=? AND project_id=?",
          [data.folderId, thread.project_id],
        );
        if (!folder) fail(404, "文件夹不存在");
        if (folder.system_key && !chatUpload)
          fail(403, "该文件夹仅接收对话上传");
      }
      let artifactId = data.artifactId;
      if (artifactId) {
        const [artifact] = await query(
          db,
          "SELECT id FROM artifacts WHERE id=? AND project_id=? AND deleted_at IS NULL FOR UPDATE",
          [artifactId, thread.project_id],
        );
        if (!artifact) fail(404, "文档不存在");
      } else {
        artifactId = randomUUID();
        await query(
          db,
          "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
          [
            artifactId,
            thread.project_id,
            data.title,
            user.id,
            data.folderId || null,
          ],
        );
      }
      const [last] = await query(
        db,
        "SELECT COALESCE(MAX(version),0) version FROM versions WHERE artifact_id=?",
        [artifactId],
      );
      const versionId = randomUUID();
      const version = Number(last.version) + 1;
      await query(
        db,
        `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [
          versionId,
          artifactId,
          threadId,
          version,
          data.filename,
          data.mime,
          bytes,
          digest(bytes),
          bytes.length,
          data.note,
          user.id,
        ],
      );
      if (!chatUpload) await queueDocumentMemory(db, versionId);
      await query(
        db,
        "UPDATE artifacts SET updated_at=UTC_TIMESTAMP(3) WHERE id=?",
        [artifactId],
      );
      if (!chatUpload && !options.silent)
        await this.insertMessage(
          db,
          user,
          threadId,
          `提交文档「${data.title}」v${version}${data.note ? `：${data.note}` : ""}`,
          [versionId],
          undefined,
          agentMessageId || null,
        );
      if (exportKey)
        await query(
          db,
          "INSERT INTO agent_exports(export_key,version_id) VALUES(?,?)",
          [exportKey, versionId],
        );
      return { id: versionId, artifactId, version, sha256: digest(bytes) };
    };
    return options.db ? save(options.db) : transaction(this.db, save);
  }
  async version(user, versionId) {
    id.parse(versionId);
    const [version] = await query(
      this.db,
      "SELECT v.*,a.project_id,a.title FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.id=?",
      [versionId],
    );
    if (!version) fail(404, "文档版本不存在");
    await this.member(user, version.project_id);
    return version;
  }
  async review(user, versionId, input) {
    if (user.kind !== "session") fail(403, "文档审核需要人工登录");
    const data = z
      .object({
        decision: z.enum(["approved", "changes_requested"]),
        comment: z.string().max(4000).default(""),
      })
      .parse(input);
    const version = await this.version(user, versionId);
    return transaction(this.db, async (db) => {
      await this.thread(user, version.thread_id, true, db);
      const reviewId = randomUUID();
      await query(
        db,
        "INSERT INTO reviews(id,version_id,reviewer_id,decision,comment) VALUES(?,?,?,?,?)",
        [reviewId, versionId, user.id, data.decision, data.comment],
      );
      await this.insertMessage(
        db,
        user,
        version.thread_id,
        `${data.decision === "approved" ? "审核通过" : "要求修改"}「${version.title}」v${version.version}${data.comment ? `：${data.comment}` : ""}`,
        [versionId],
        "system",
      );
      return { id: reviewId };
    });
  }
  async archive(user, threadId, input) {
    if (user.kind !== "session") fail(403, "归档需要人工登录");
    const data = z.object({ conclusion: body }).parse(input);
    return transaction(this.db, async (db) => {
      const thread = await this.thread(user, threadId, true, db);
      const [running] = await query(
        db,
        "SELECT id FROM sandbox_runs WHERE thread_id=? AND status='running' LIMIT 1",
        [threadId],
      );
      if (running) fail(409, "请等待执行结束后再归档");
      const [agent] = await query(
        db,
        `SELECT r.message_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id WHERE m.thread_id=? AND (r.status='running' OR r.execution_active=TRUE) LIMIT 1`,
        [threadId],
      );
      if (agent) fail(409, "请先停止 Agent，或等待任务完成后再归档");
      await query(
        db,
        `UPDATE assistant_replies r JOIN messages m ON m.id=r.message_id
        SET r.status='cancelled',r.finished_at=UTC_TIMESTAMP(3) WHERE m.thread_id=? AND r.status IN ('queued','running')`,
        [threadId],
      );
      await this.insertMessage(
        db,
        user,
        threadId,
        `迭代归档：${data.conclusion}`,
        [],
        "system",
      );
      const context = await this.context(user, threadId, db);
      const versionIds = [...new Set(context.messages.flatMap((m) => m.refs))];
      const versions = [];
      for (const versionId of versionIds) {
        const [v] = await query(
          db,
          "SELECT id,artifact_id,version,filename,sha256,byte_size FROM versions WHERE id=?",
          [versionId],
        );
        const reviews = await query(
          db,
          "SELECT id,reviewer_id,decision,comment,created_at FROM reviews WHERE version_id=? ORDER BY created_at,id",
          [versionId],
        );
        versions.push({ ...v, reviews });
      }
      const snapshot = {
        schemaVersion: 1,
        projectId: thread.project_id,
        threadId,
        conclusion: data.conclusion,
        archivedBy: user.id,
        archivedAt: new Date().toISOString(),
        messages: context.messages,
        versions,
        reviews: context.reviews,
        runs: context.runs,
      };
      await query(
        db,
        "UPDATE threads SET status='archived',archive_snapshot=?,archived_at=UTC_TIMESTAMP(3) WHERE id=?",
        [JSON.stringify(snapshot), threadId],
      );
      return snapshot;
    });
  }
}
