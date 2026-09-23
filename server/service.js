import { attachMessageQuotes } from "./message-quotes.js";
import { contextUsage } from "../shared/context.js";
import { AGENT_L1_PROFILE, AGENT_L2_MEMBER, AGENT_MEMBER, mentionsAgent } from "../shared/agent-member.js";
import { modelConfig } from "./model-config.js";
import { randomBytes, randomUUID } from "node:crypto";
import { posix as pathPosix } from "node:path";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { digest, hashPassword } from "./auth.js";
import { decodeUploadedBytes, verifyBytes } from "./file-bytes.js";
import { INLINE_FILE_MAX_BYTES } from "../shared/upload-limits.js";
import { publishWork } from "./work-events.js";
import { queueDocumentMemory, queueMemberMemory } from "./project-memory.js";
import { taskExecutionSnapshot } from "./task-pool.js";
import { describeAgentAction, formatAgentAction, L1_MAINTENANCE_TASKS, l1TaskLabel, normalizeL1Task } from "../shared/agent-label.js";
import {
  ensureProjectLibraryRoots,
  folderRootKind,
  folderRootKindInList,
  isCacheFolderKind,
  isOfficialLibraryFolder,
  isOutputFolderKind,
  isProjectLibraryAreaRoot,
  latestVersionsByFolderRoots,
  OUTPUT_LIBRARY_FOLDER_SQL,
  uniqueArtifactTitle,
  uniqueVersionFilename,
  utcDateKey,
} from "./project-library.js";
import { previewContentType, resolveStoredMime } from "./preview-mime.js";
import { previewConsoleProbeHtml } from "../shared/html-preview.mjs";
import { signPreviewTicket } from "../shared/preview-ticket.mjs";
import { recordDocumentChange } from "./document-audit.js";
import JSZip from "jszip";

function rewriteRootRelativeAssetUrls(html) {
  return html.replace(
    /(\s(?:href|src|action)=["'])\/([^"']+)(["'])/gi,
    (_, prefix, path, suffix) => `${prefix}${path}${suffix}`,
  );
}

function retargetPreviewNavigation(html) {
  return html
    .replace(
      /(\s)target\s*=\s*(["'])(_blank|_parent|_top)\2/gi,
      "$1target=$2_self$2",
    )
    .replace(
      /(\s)target\s*=\s*(_blank|_parent|_top)(?=[\s>/])/gi,
      '$1target="_self"',
    );
}

function previewBaseHref(versionId, assetPath = "", userId, ticket = "") {
  const dir = pathPosix.dirname(String(assetPath || "").replace(/\\/g, "/"));
  const prefix = !dir || dir === "."
    ? ""
    : `${dir.split("/").filter(Boolean).map(encodeURIComponent).join("/")}/`;
  const token = ticket || signPreviewTicket(userId, versionId);
  return `/api/versions/${versionId}/preview/${token}/${prefix}`;
}

function injectPreviewBase(html, baseHref) {
  let document = retargetPreviewNavigation(rewriteRootRelativeAssetUrls(html));
  const baseTag = `<base href="${baseHref}" target="_self">`;
  const probe = /data-cothread-preview-console/i.test(document)
    ? ""
    : previewConsoleProbeHtml();
  const headInject = `${baseTag}${probe}`;
  if (/<base\s/i.test(document)) {
    return document.replace(/<base\s[^>]*>/i, headInject);
  }
  if (/<head[\s>]/i.test(document)) {
    return document.replace(/<head(\s[^>]*)?>/i, `<head$1>${headInject}`);
  }
  if (/<html[\s>]/i.test(document)) {
    return document.replace(
      /<html(\s[^>]*)?>/i,
      `<html$1><head>${headInject}</head>`,
    );
  }
  return `<!DOCTYPE html><html><head>${headInject}</head><body>${document}</body></html>`;
}

function asPreviewHtml(content, versionId, assetPath = "", userId, ticket = "") {
  const html = Buffer.isBuffer(content)
    ? content.toString("utf8")
    : String(content ?? "");
  return Buffer.from(
    injectPreviewBase(html, previewBaseHref(versionId, assetPath, userId, ticket)),
    "utf8",
  );
}

async function previewAssetInFolder(db, folderId, filename) {
  if (!folderId || !filename) return null;
  const [row] = await query(
    db,
    `SELECT v.content, v.mime, v.filename FROM versions v
     JOIN artifacts a ON a.id = v.artifact_id
     WHERE a.folder_id = ? AND a.deleted_at IS NULL
       AND (v.filename = ? OR v.filename LIKE CONCAT('%/', ?))
     ORDER BY
       CASE WHEN v.filename = ? THEN 0 WHEN v.filename LIKE CONCAT('%/', ?) THEN 1 ELSE 2 END,
       v.version DESC
     LIMIT 1`,
    [folderId, filename, filename, filename, filename],
  );
  return row || null;
}

async function walkPreviewSubfolders(db, projectId, startFolderId, segments) {
  let folderId = startFolderId;
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") return null;
    const [child] = await query(
      db,
      `SELECT id FROM document_folders
       WHERE project_id=? AND parent_id=? AND name=?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [projectId, folderId, segment],
    );
    if (!child) return null;
    folderId = child.id;
  }
  return folderId;
}

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

export function officialTitleWithVersion(name, versionNumber) {
  const raw = String(name || "").trim() || "文档";
  const base = raw.replace(/\s+v\d+$/i, "").trim() || raw;
  return `${base} v${versionNumber}`.slice(0, 160);
}
function submittedVersion(id, artifactId, version, sha256, data, byteSize) {
  return {
    id,
    artifactId,
    version,
    sha256,
    byteSize,
    title: data.title,
    filename: data.filename,
    mime: data.mime,
  };
}
const json = (value) => (typeof value === "string" ? JSON.parse(value) : value);
const parseMessageRow = (m) => ({ ...m, refs: json(m.refs) || [], folder_refs: json(m.folder_refs) || [] });
const mentions = (text, value) => {
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_@])@${escaped}(?=$|[^\\p{L}\\p{N}_@])`, "u").test(text);
};
export class Service {
  constructor(db) {
    this.db = db;
  }
  async createIterationFolders() {}
  async documentFolder(db, projectId, kind, threadId = null) {
    if (threadId && (kind === "iteration_cache" || kind === "iteration_outputs" || kind === "iteration_root")) {
      const [legacy] = await query(db,
        `SELECT id,project_id,thread_id,parent_id,name,system_key,folder_kind FROM document_folders
         WHERE project_id=? AND folder_kind=? AND thread_id=?`, [projectId, kind, threadId]);
      if (legacy) return legacy;
    }
    const projectRoot = ["project_official", "project_cache", "project_outputs"].includes(kind) && !threadId;
    const [folder] = await query(db,
      `SELECT id,project_id,thread_id,parent_id,name,system_key,folder_kind FROM document_folders
       WHERE project_id=? AND folder_kind=? AND thread_id <=> ?${projectRoot ? " AND parent_id IS NULL" : ""}`,
      [projectId, kind, threadId]);
    if (!folder) {
      await ensureProjectLibraryRoots(db, projectId);
      const [created] = await query(db,
        `SELECT id,project_id,thread_id,parent_id,name,system_key,folder_kind FROM document_folders
         WHERE project_id=? AND folder_kind=? AND thread_id <=> ?${projectRoot ? " AND parent_id IS NULL" : ""}`,
        [projectId, kind, threadId]);
      if (!created) fail(500, "项目文档目录尚未初始化");
      return created;
    }
    return folder;
  }
  async dailyProjectFolder(db, projectId, area, now = new Date()) {
    const kind = area === "outputs" ? "project_outputs" : "project_cache";
    const root = await this.documentFolder(db, projectId, kind, null);
    const date = utcDateKey(now);
    let [folder] = await query(db, `SELECT id FROM document_folders
      WHERE project_id=? AND parent_id=? AND name=? AND folder_kind=? LIMIT 1`,
    [projectId, root.id, date, kind]);
    if (!folder) {
      folder = { id: randomUUID() };
      await query(db, `INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,system_key,folder_kind)
        VALUES(?,?,?,?,?,?,?)`, [folder.id, projectId, null, root.id, date,
        `project:${projectId}:${area}:${date}`, kind]);
    }
    return folder;
  }
  async resolveVersionFolderId(db, projectId, folderId, { chatUpload, sourceFile, generatedByTask }) {
    if (chatUpload || sourceFile)
      return (await this.dailyProjectFolder(db, projectId, "cache")).id;
    if (folderId == null)
      return (await this.dailyProjectFolder(db, projectId, generatedByTask ? "outputs" : "cache")).id;
    const [folder] = await query(
      db,
      "SELECT id,folder_kind,parent_id FROM document_folders WHERE id=? AND project_id=?",
      [folderId, projectId],
    );
    if (!folder) fail(404, "文件夹不存在");
    if (isProjectLibraryAreaRoot(folder)) {
      if (folder.folder_kind === "project_official") return folder.id;
      if (folder.folder_kind === "project_outputs")
        return (await this.dailyProjectFolder(db, projectId, "outputs")).id;
      return (await this.dailyProjectFolder(db, projectId, "cache")).id;
    }
    if (folder.folder_kind === "iteration_root" || folder.folder_kind === "iteration_cache")
      return (await this.dailyProjectFolder(db, projectId, "cache")).id;
    if (folder.folder_kind === "iteration_outputs")
      return (await this.dailyProjectFolder(db, projectId, "outputs")).id;
    return folder.id;
  }
  async assertOfficialOrganizing(db, projectId) {
    const [job] = await query(db, `SELECT id FROM document_organization_jobs
      WHERE project_id=? AND scope='project' AND status IN ('queued','running') LIMIT 1`, [projectId]);
    if (job) fail(409, "一级小祥正在整理正式文件，正式文件区暂时不可操作");
  }
  async assertDocumentScopeAvailable(db, projectId, folderId = null) {
    if (!folderId) {
      await this.assertOfficialOrganizing(db, projectId);
      return;
    }
    if (await isOfficialLibraryFolder(db, folderId)) await this.assertOfficialOrganizing(db, projectId);
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
    const data = z.object({
      name: title.max(120).optional(),
      description: z.string().max(4000).optional(),
    }).refine((value) => value.name !== undefined || value.description !== undefined).parse(input);
    const next = {
      ...data,
      description: data.description === undefined ? undefined : data.description.trim(),
    };
    await transaction(this.db, async (db) => {
      const [previous] = await query(db, "SELECT name,description FROM projects WHERE id=? FOR UPDATE", [projectId]);
      const name = next.name ?? previous.name;
      const description = next.description ?? previous.description;
      await query(db, "UPDATE projects SET name=?,description=? WHERE id=?", [name, description, projectId]);
      await this.projectChange(db, projectId, user.id, "profile_updated", {
        before: { name: previous.name, description: previous.description },
        after: { name, description },
      });
    });
    const [updated] = await query(this.db, "SELECT id,name,description FROM projects WHERE id=?", [projectId]);
    return updated;
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
      `SELECT p.*,m.role,m.joined_at,m.tab_visible,m.tab_opened_at,m.tab_pinned_at,(SELECT COUNT(*) FROM threads t WHERE t.project_id=p.id AND t.status='active') active_threads
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
      await ensureProjectLibraryRoots(db, projectId);
      await query(
        db,
        "INSERT INTO members(project_id,user_id,role,tab_visible,tab_opened_at) VALUES(?,?,?,TRUE,UTC_TIMESTAMP(6))",
        [projectId, user.id, "owner"],
      );
      await this.projectChange(db, projectId, user.id, "created", { name: data.name, description: data.description });
    });
    return { id: projectId, ...data };
  }
  libraryQueries(projectId) {
    return {
      versions: query(
        this.db,
        `SELECT a.id artifact_id,a.title,a.folder_id,a.recycle_path,f.thread_id folder_thread_id,f.folder_kind,COALESCE(a.deleted_at,vr.deleted_at) deleted_at,a.deleted_at artifact_deleted_at,vr.deleted_at version_deleted_at,a.updated_at,v.id,v.version,v.filename,v.mime,v.byte_size,v.sha256,v.note,v.thread_id,v.created_by author_id,v.created_at,u.name author,
        (SELECT r.decision FROM reviews r WHERE r.version_id=v.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) review
        FROM artifacts a JOIN versions v ON v.artifact_id=a.id LEFT JOIN document_folders f ON f.id=a.folder_id LEFT JOIN version_recycle vr ON vr.version_id=v.id JOIN users u ON u.id=v.created_by WHERE a.project_id=? AND a.purged_at IS NULL AND vr.purged_at IS NULL ORDER BY v.created_at DESC,v.version DESC`,
        [projectId],
      ),
      folders: query(
        this.db,
        "SELECT id,parent_id,thread_id,name,updated_at,system_key,folder_kind FROM document_folders WHERE project_id=? ORDER BY name",
        [projectId],
      ),
      documentOrganizationJobs: query(
        this.db,
        `SELECT id,thread_id,scope,status,result,error,created_at,started_at,finished_at
        FROM document_organization_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 20`,
        [projectId],
      ),
    };
  }
  mapLibraryVersions(versions, folders) {
    return versions.map((version) => {
      const root = folderRootKindInList(version.folder_id, folders);
      if (root === "project_official") return { ...version, review: "confirmed" };
      if (root === "project_cache" && !version.review) return { ...version, review: "draft" };
      return version;
    });
  }
  async projectLibrary(user, projectId) {
    await this.member(user, projectId);
    await ensureProjectLibraryRoots(this.db, projectId);
    const queries = this.libraryQueries(projectId);
    const [versions, folders, documentOrganizationJobs] = await Promise.all([
      queries.versions,
      queries.folders,
      queries.documentOrganizationJobs,
    ]);
    return {
      folders,
      versions: this.mapLibraryVersions(versions, folders),
      documentOrganizationJobs,
    };
  }
  async project(user, projectId, { display = false } = {}) {
    await this.member(user, projectId);
    await ensureProjectLibraryRoots(this.db, projectId);
    const library = this.libraryQueries(projectId);
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
      `SELECT u.id,u.user_number,u.username,u.name,COALESCE(u.username,u.email) email,u.email bound_email,${display ? "CONCAT('/api/projects/',m.project_id,'/members/',u.id,'/avatar?v=',LEFT(SHA2(u.avatar,256),16)) avatar" : "u.avatar"},u.motto,u.identity_tags,m.role,
        c.id connector_id,c.name connector_name,c.platform connector_platform,c.version connector_version,c.last_seen_at connector_last_seen_at,
        CASE WHEN c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) THEN 1 ELSE 0 END connector_online,
        CASE WHEN cp.connector_id IS NULL THEN 0 ELSE 1 END connector_bound
       FROM members m JOIN users u ON u.id=m.user_id
       LEFT JOIN connectors c ON c.user_id=u.id AND c.revoked_at IS NULL
       LEFT JOIN connector_projects cp ON cp.connector_id=c.id AND cp.project_id=m.project_id
       WHERE m.project_id=?`,
      [projectId],
    );
    const [[project], threads, members, versions, folders, documentOrganizationJobs] = await Promise.all([
      projectQuery,
      threadsQuery,
      membersQuery,
      library.versions,
      library.folders,
      library.documentOrganizationJobs,
    ]);
    const libraryVersions = this.mapLibraryVersions(versions, folders);
    const knowledgeModel = modelConfig("knowledge");
    const coordinatorModel = modelConfig("coordinator");
    const [projectSummary] = await query(this.db, `SELECT s.summary,s.updated_at,t.title last_thread_title
      FROM agent_project_summaries s LEFT JOIN threads t ON t.id=s.last_thread_id WHERE s.project_id=?`, [projectId]);
    return {
      ...project,
      longTermSummary: projectSummary ? {
        summary: projectSummary.summary,
        updatedAt: projectSummary.updated_at,
        lastThreadTitle: projectSummary.last_thread_title || null,
      } : null,
      threads,
      members: [
        ...members.map((row) => {
          const {
            connector_id, connector_name, connector_platform, connector_version,
            connector_last_seen_at, connector_online, connector_bound, ...member
          } = row;
          return {
            ...member,
            kind: "human",
            connector: connector_id ? {
              id: connector_id,
              name: connector_name,
              platform: connector_platform,
              version: connector_version,
              online: !!Number(connector_online),
              bound: !!Number(connector_bound),
              lastSeenAt: connector_last_seen_at,
            } : null,
          };
        }),
        {
          ...AGENT_MEMBER,
          kind: "l1",
          nickname: AGENT_L1_PROFILE.nickname,
          title: AGENT_L1_PROFILE.title,
          display_avatar: AGENT_L1_PROFILE.avatar,
          motto: `${knowledgeModel.model} · ${knowledgeModel.reasoningEffort}`,
        },
        {
          ...AGENT_L2_MEMBER,
          kind: "l2",
          motto: `${coordinatorModel.model} · ${coordinatorModel.reasoningEffort}`,
        },
      ],
      versions: libraryVersions,
      folders,
      documentOrganizationJobs,
    };
  }
  async agentMonitor(user, projectId) {
    await this.member(user, projectId);
    const modelSummary = (scope) => {
      const config = modelConfig(scope);
      return { model: config.model, reasoningEffort: config.reasoningEffort };
    };
    const [memberQueue, documentQueue, memberSummary, documentSummary, l1Sessions, coordinators, executors, taskExecutions, eventLog, organizationJobs, organizationLast, archives, archiveLast, l1Runs, l1RunLast, l2Sessions] =
      await Promise.all([
        query(this.db, `SELECT COUNT(*) pending,
          COALESCE(SUM(available_at<=UTC_TIMESTAMP(3)),0) ready,
          MIN(available_at) next_at FROM agent_member_memory_queue WHERE project_id=?`, [projectId]),
        query(this.db, `SELECT COUNT(*) pending,
          COALESCE(SUM(q.available_at<=UTC_TIMESTAMP(3)),0) ready,
          MIN(q.available_at) next_at FROM agent_document_memory_queue q
          JOIN versions v ON v.id=q.version_id JOIN artifacts a ON a.id=v.artifact_id
          LEFT JOIN document_folders f ON f.id=a.folder_id
          WHERE a.project_id=?
          AND (
            f.folder_kind IN ('project_official','project_cache','project_outputs')
            OR f.folder_kind IN ('iteration_cache','iteration_outputs')
          )`, [projectId]),
        query(this.db, "SELECT MAX(updated_at) updated_at FROM agent_member_summaries WHERE project_id=?", [projectId]),
        query(this.db, `SELECT MAX(s.updated_at) updated_at FROM agent_document_summaries s
          JOIN versions v ON v.id=s.version_id JOIN artifacts a ON a.id=v.artifact_id
          LEFT JOIN document_folders f ON f.id=a.folder_id
          WHERE a.project_id=?
          AND (
            f.folder_kind IN ('project_official','project_cache','project_outputs')
            OR f.folder_kind IN ('iteration_cache','iteration_outputs')
          )`, [projectId]),
        query(this.db, `SELECT s.id,s.session_id,s.task,s.thread_id,s.status,s.last_error,s.last_started_at,s.last_finished_at,
          s.updated_at,s.context_stats,s.compact_status,s.compact_error,s.compact_result,t.title thread_title
          FROM agent_project_sessions s LEFT JOIN threads t ON t.id=s.thread_id WHERE s.project_id=?`, [projectId]),
        query(this.db, `SELECT t.id,t.title,t.status,t.created_at,t.archived_at,
          COALESCE((SELECT s.convergence_state FROM agent_sessions s WHERE s.thread_id=t.id),'active') convergence_state,
          COALESCE((SELECT s.steering_epoch FROM agent_sessions s WHERE s.thread_id=t.id),0) steering_epoch,
          (SELECT s.wait_reason FROM agent_sessions s WHERE s.thread_id=t.id) wait_reason,
          (SELECT ar.progress FROM assistant_replies ar JOIN messages arm ON arm.id=ar.message_id
            WHERE arm.thread_id=t.id AND ar.status IN ('queued','running') ORDER BY arm.sequence DESC LIMIT 1) current_action,
          (SELECT ae.tool FROM agent_events ae JOIN messages aem ON aem.id=ae.message_id
            WHERE aem.thread_id=t.id ORDER BY ae.id DESC LIMIT 1) react_phase,
          (SELECT LEFT(rm.body,500) FROM messages rm WHERE rm.thread_id=t.id AND rm.source='assistant'
            ORDER BY rm.sequence DESC LIMIT 1) recent_message,
          COALESCE(SUM(q.status='queued'),0) queued_requests,
          COALESCE(SUM(q.status='running'),0) running_requests,
          ((SELECT COUNT(*) FROM agent_task_execution_runs er JOIN agent_tasks et ON et.id=er.task_id
            WHERE et.origin_thread_id=t.id AND er.executor_type='dsh_l3' AND er.status IN ('running','waiting'))
          +(SELECT COUNT(*) FROM assistant_replies ar JOIN messages am ON am.id=ar.message_id
            WHERE am.thread_id=t.id AND ar.execution_active=TRUE)) active_executors,
          MAX(COALESCE(q.first_response_at,m.created_at,t.created_at)) last_activity_at
          FROM threads t LEFT JOIN messages m ON m.thread_id=t.id
          LEFT JOIN agent_requests q ON q.message_id=m.id
          WHERE t.project_id=? GROUP BY t.id,t.title,t.status,t.created_at,t.archived_at
          ORDER BY t.status='active' DESC,last_activity_at DESC`, [projectId]),
        query(this.db, `SELECT r.message_id task_id,t.id thread_id,t.title thread_title,
          m.author_id,u.name requested_by,LEFT(m.body,280) goal,r.status,r.progress,
          r.agent_slot,r.execution_active,m.created_at started_at,r.finished_at,
          e.tool last_action,e.status last_action_status,e.created_at last_action_at,
          (SELECT COUNT(*) FROM agent_task_updates tu WHERE tu.task_message_id=r.message_id) update_count,
          cs.context_stats,cs.compact_status,cs.compact_error,cs.compact_result
          FROM assistant_replies r JOIN messages m ON m.id=r.message_id
          JOIN threads t ON t.id=m.thread_id JOIN users u ON u.id=m.author_id
          LEFT JOIN agent_events e ON e.id=(SELECT MAX(ae.id) FROM agent_events ae WHERE ae.message_id=r.message_id)
          LEFT JOIN agent_child_sessions cs ON cs.message_id=r.message_id
          WHERE t.project_id=? AND (r.agent_slot IS NOT NULL OR r.execution_active=TRUE)
          ORDER BY r.execution_active DESC,m.created_at DESC LIMIT 100`, [projectId]),
        taskExecutionSnapshot(this.db, projectId),
        query(this.db, `SELECT e.id,e.message_id,e.agent_session_id,e.tool,e.status,e.created_at,e.finished_at,
          m.thread_id,t.title thread_title,s.session_id l2_session_id,LEFT(e.input,16000) input
          FROM agent_events e JOIN messages m ON m.id=e.message_id
          JOIN threads t ON t.id=m.thread_id LEFT JOIN agent_sessions s ON s.thread_id=m.thread_id
          WHERE t.project_id=? ORDER BY e.id DESC LIMIT 300`, [projectId]),
        query(this.db, `SELECT j.id,j.thread_id,j.scope,j.status,j.error,j.created_at,j.started_at,j.finished_at,
          t.title thread_title, JSON_LENGTH(JSON_EXTRACT(j.result,'$.documents')) document_count
          FROM document_organization_jobs j LEFT JOIN threads t ON t.id=j.thread_id
          WHERE j.project_id=? ORDER BY j.created_at DESC LIMIT 20`, [projectId]),
        query(this.db, `SELECT MAX(finished_at) last_at FROM document_organization_jobs
          WHERE project_id=? AND status='completed'`, [projectId]),
        query(this.db, `SELECT id,title,archived_at,JSON_UNQUOTE(JSON_EXTRACT(archive_snapshot,'$.conclusion')) conclusion
          FROM threads WHERE project_id=? AND status='archived' ORDER BY archived_at DESC LIMIT 20`, [projectId]),
        query(this.db, `SELECT MAX(archived_at) last_at FROM threads WHERE project_id=? AND status='archived'`, [projectId]),
        query(this.db, `SELECT id,task,thread_id,trigger_source,status,agent_called,had_updates,item_count,error,created_at,started_at,finished_at
          FROM agent_l1_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 80`, [projectId]),
        query(this.db, `SELECT task,MAX(finished_at) last_at FROM agent_l1_runs
          WHERE project_id=? AND status='completed' GROUP BY task`, [projectId]),
        query(this.db, `SELECT s.thread_id,s.context_stats,s.compact_status,s.compact_error,s.compact_result
          FROM agent_sessions s JOIN threads t ON t.id=s.thread_id WHERE t.project_id=?`, [projectId]),
      ]);
    const humanAgents = await query(this.db, `SELECT u.id member_id,u.name,CASE WHEN c.id IS NULL THEN 0 ELSE 1 END connector_configured,CASE WHEN c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) THEN 1 ELSE 0 END connector_online,c.id connector_id FROM members m JOIN users u ON u.id=m.user_id LEFT JOIN connectors c ON c.user_id=u.id AND c.revoked_at IS NULL WHERE m.project_id=? GROUP BY u.id,u.name,c.id,c.last_seen_at`, [projectId]);
    const memberMemory = memberQueue[0] || {};
    const documentMemoryRow = documentQueue[0] || {};
    const documentSummaryRow = documentSummary[0] || {};
    const documentMemory = {
      pending: Number(documentMemoryRow.pending || 0),
      ready: Number(documentMemoryRow.ready || 0),
      next_at: documentMemoryRow.next_at || null,
    };
    const latest = (...values) => values.filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
    const memberRunLast = l1RunLast.find((row) => row.task === "member_memory")?.last_at || null;
    const documentRunLast = latest(
      ...l1RunLast.filter((row) => ["document_memory", "project_document_memory", "iteration_document_memory"].includes(row.task))
        .map((row) => row.last_at),
    );
    const mapL1Run = (row) => ({
      id: row.id,
      task: row.task,
      thread_id: row.thread_id || null,
      trigger_source: row.trigger_source,
      status: row.status,
      agent_called: !!Number(row.agent_called),
      had_updates: !!Number(row.had_updates),
      item_count: row.item_count == null ? null : Number(row.item_count),
      error: row.error || null,
      created_at: row.created_at,
      started_at: row.started_at,
      finished_at: row.finished_at,
    });
    const mapSession = (row) => ({
      id: row.id,
      task: row.task,
      threadId: row.thread_id || null,
      threadTitle: row.thread_title || null,
      sessionId: row.session_id || null,
      sessionStatus: row.status || "idle",
      lastError: row.last_error || null,
      lastStartedAt: row.last_started_at || null,
      lastFinishedAt: row.last_finished_at || null,
      contextUsage: contextUsage(row, [], []),
    });
    const headingSession = [...l1Sessions].sort((left, right) => {
      const running = (value) => value.status === "running" ? 1 : 0;
      if (running(right) !== running(left)) return running(right) - running(left);
      return new Date(right.last_finished_at || right.last_started_at || 0).getTime()
        - new Date(left.last_finished_at || left.last_started_at || 0).getTime();
    })[0];
    const archiveRuns = l1Runs.filter((row) => row.task === "iteration_archive" || row.task === "thread_archive");
    const archiveSession = l1Sessions.find((session) => session.task === "iteration_archive" && !session.thread_id)
      || l1Sessions.find((session) => session.task === "iteration_archive")
      || {};
    return {
      generatedAt: new Date().toISOString(),
      models: {
        knowledge: modelSummary("knowledge"),
        coordinator: modelSummary("coordinator"),
        executor: modelSummary("executor"),
      },
      knowledge: {
        sessionId: headingSession?.session_id || null,
        sessionStatus: headingSession?.status || "idle",
        lastTask: headingSession?.task || null,
        lastError: headingSession?.last_error || null,
        lastStartedAt: headingSession?.last_started_at || null,
        lastFinishedAt: headingSession?.last_finished_at || null,
        sessions: l1Sessions.map(mapSession),
        memberPending: Number(memberMemory.pending || 0),
        documentPending: Number(documentMemory.pending || 0),
        ready: Number(memberMemory.ready || 0) + Number(documentMemory.ready || 0),
        nextAt: [memberMemory.next_at, documentMemory.next_at].filter(Boolean)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || null,
        lastUpdatedAt: latest(memberSummary[0]?.updated_at, documentSummaryRow.updated_at, memberRunLast, documentRunLast),
        memberLastAt: latest(memberSummary[0]?.updated_at, memberRunLast),
        memberNextAt: memberMemory.next_at || null,
        documentLastAt: latest(documentSummaryRow.updated_at, documentRunLast),
        documentNextAt: documentMemory.next_at || null,
        projectDocumentPending: Number(documentMemory.pending || 0),
        projectDocumentLastAt: latest(documentSummaryRow.updated_at, documentRunLast),
        projectDocumentNextAt: documentMemory.next_at || null,
        iterationDocumentPending: 0,
        iterationDocumentLastAt: null,
        iterationDocumentNextAt: null,
        memberRuns: l1Runs.filter((row) => row.task === "member_memory").map(mapL1Run),
        projectDocumentRuns: [],
        iterationDocumentRuns: [],
        documentRuns: l1Runs.filter((row) => row.task === "document_memory"
          || row.task === "project_document_memory"
          || row.task === "iteration_document_memory").map(mapL1Run),
        organizationLastAt: organizationLast[0]?.last_at || null,
        organizationJobs: organizationJobs.map((row) => ({
          id: row.id,
          thread_id: row.thread_id,
          thread_title: row.thread_title || null,
          scope: row.scope,
          status: row.status,
          error: row.error || null,
          document_count: row.document_count == null ? null : Number(row.document_count),
          created_at: row.created_at,
          started_at: row.started_at,
          finished_at: row.finished_at,
        })),
        archiveLastAt: latest(archiveLast[0]?.last_at, ...archiveRuns.map((row) => row.finished_at || row.started_at)),
        archives: archives.map((row) => ({
          id: row.id,
          title: row.title,
          archived_at: row.archived_at,
          conclusion: row.conclusion || "",
          contextUsage: contextUsage(archiveSession, [], []),
          sessionStatus: archiveSession.status || "idle",
          runs: archiveRuns.filter((run) => run.thread_id === row.id).map(mapL1Run),
        })),
      },
      coordinators: coordinators.map((row) => {
        const session = l2Sessions.find((item) => item.thread_id === row.id) || {};
        return {
          ...row,
          queued_requests: Number(row.queued_requests),
          running_requests: Number(row.running_requests),
          active_executors: Number(row.active_executors),
          contextUsage: contextUsage(session, [], []),
        };
      }),
      humanAgents: humanAgents.map((row) => ({ member_id: row.member_id, name: row.name, nodes: [{ executor_type: "human_self", executor_id: row.member_id, online: true }, { executor_type: "human_connector", executor_id: row.connector_id, online: !!Number(row.connector_online), configured: !!Number(row.connector_configured) }] })),
      taskPool: taskExecutions,
      eventLog: eventLog.map((row) => {
        let args = {};
        try { args = typeof row.input === "string" ? JSON.parse(row.input) : row.input || {}; }
        catch {}
        const action = ["thinking", "assistant_text", "assistant_final"].includes(row.tool)
          ? row.tool === "thinking" ? "思考" : "正文"
          : formatAgentAction(row.tool, args);
        return {
          id: String(row.id), message_id: row.message_id, thread_id: row.thread_id,
          thread_title: row.thread_title, agent_session_id: row.agent_session_id,
          agent_type: row.agent_session_id && row.agent_session_id !== row.l2_session_id ? "dsh_l3" : "l2",
          tool: row.tool, action, status: row.status, created_at: row.created_at,
          finished_at: row.finished_at,
          duration_ms: row.finished_at ? Math.max(0, new Date(row.finished_at).getTime() - new Date(row.created_at).getTime()) : null,
        };
      }),
      executors: [
        ...executors.map((row) => ({
          ...row,
          executor_type: "dsh_l3",
          update_count: Number(row.update_count),
          contextUsage: contextUsage(row, [], []),
        })),
        ...taskExecutions.map((row) => ({
          task_id: row.task_id, thread_id: row.origin_thread_id || null, thread_title: null,
          requested_by: row.source_user_id, goal: row.goal, status: row.task_status,
          task_status: row.task_status, run_status: row.run_status,
          progress: row.progress, agent_slot: null,
          execution_active: !!row.executor_id && ["running", "waiting"].includes(row.run_status),
          started_at: row.started_at, finished_at: row.finished_at, last_action: null, last_action_status: null,
          last_action_at: null, update_count: 0, executor_type: row.executor_type,
          executor_id: row.executor_id, target_type: row.target_type, target_id: row.target_id,
          task_type: row.task_type, source_type: row.source_type, created_by_type: row.created_by_type,
          created_by_id: row.created_by_id, claimed_by_type: row.claimed_by_type, claimed_by_id: row.claimed_by_id,
          result_summary: row.result_summary, artifact_refs: row.artifact_refs,
        })),
      ],
    };
  }
  async agentLogs(user, scopeType, scopeId, { task } = {}) {
    const duration = (row) => row.finished_at
      ? Math.max(0, new Date(row.finished_at).getTime() - new Date(row.created_at).getTime()) : null;
    const labelFor = (row) => {
      if (row.agent_type === "l1") return {
        action: ({
          prepare_context: "准备项目上下文",
          start_harness: "启动 DSH 会话",
          compact_context: "压缩维护上下文",
          model_run: "执行维护任务",
          validate_result: "校验结构化结果",
          save_checkpoint: "保存会话检查点",
        })[row.tool] || row.tool,
        target: "",
      };
      let args = {};
      try { args = typeof row.input === "string" ? JSON.parse(row.input) : row.input || {}; }
      catch {}
      if (["thinking", "assistant_text", "assistant_final"].includes(row.tool))
        return {
          action: row.tool === "thinking" ? "思考" : "正文",
          target: "",
        };
      const label = describeAgentAction(row.tool, args);
      return { action: formatAgentAction(row.tool, args), target: label.target || "" };
    };
    const collectInputs = (rows) => {
      const seen = new Set();
      const inputs = [];
      for (const row of [...rows].reverse()) {
        if (!row.message_id || !row.user_created_at || seen.has(row.message_id)) continue;
        seen.add(row.message_id);
        inputs.push({
          id: `user:${row.message_id}`,
          messageId: row.message_id,
          createdAt: row.user_created_at,
          preview: String(row.user_preview || "").replace(/\s+/g, " ").trim(),
        });
      }
      return inputs;
    };
    const taskEventScope = `EXISTS (SELECT 1 FROM agent_task_execution_runs owner_run
          WHERE owner_run.task_id=? AND owner_run.executor_type='dsh_l3'
            AND owner_run.executor_id=e.agent_session_id)
          AND (e.agent_task_id=? OR (e.agent_task_id IS NULL AND EXISTS (
            SELECT 1 FROM agent_task_execution_runs timed_run WHERE timed_run.task_id=?
              AND timed_run.executor_type='dsh_l3' AND timed_run.executor_id=e.agent_session_id
              AND e.created_at>=COALESCE(timed_run.started_at,timed_run.created_at)
              AND e.created_at<=COALESCE(timed_run.finished_at,UTC_TIMESTAMP(3)))))`;
    let titleText;
    let rows;
    if (scopeType === "project") {
      const project = await this.project(user, scopeId);
      const scopedTask = normalizeL1Task(task);
      if (!L1_MAINTENANCE_TASKS.includes(scopedTask))
        fail(400, "请指定维护任务");
      titleText = `${project.name} · ${l1TaskLabel(scopedTask)}`;
      rows = await query(this.db, `SELECT e.id,e.agent_session_id,e.task,e.thread_id,e.phase tool,e.status,e.created_at,e.finished_at,e.error,
        a.id visual_artifact_id
        FROM agent_project_events e LEFT JOIN agent_visual_artifacts a ON a.agent_project_event_id=e.id
        WHERE e.project_id=? AND e.task=? ORDER BY e.id DESC LIMIT 300`,
      [scopeId, scopedTask]);
      const l1RunOf = new Map();
      const l1FirstIds = new Set();
      const l1SeenRuns = new Set();
      let l1Run = 0;
      for (const row of [...rows].sort((left, right) => Number(left.id) - Number(right.id))) {
        if (row.tool === "prepare_context") l1Run += 1;
        const runId = String(Math.max(l1Run, 1));
        l1RunOf.set(String(row.id), runId);
        if (!l1SeenRuns.has(runId)) {
          l1SeenRuns.add(runId);
          l1FirstIds.add(String(row.id));
        }
      }
      rows = rows.map((row) => {
        const messageId = `l1:${l1RunOf.get(String(row.id))}`;
        return {
          ...row,
          agent_type: "l1",
          task_id: null,
          message_id: messageId,
          thread_id: null,
          user_preview: l1TaskLabel(row.task),
          user_created_at: l1FirstIds.has(String(row.id)) ? row.created_at : null,
        };
      });
    } else if (scopeType === "thread") {
      const thread = await this.thread(user, scopeId);
      const [session] = await query(this.db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [scopeId]);
      titleText = `${thread.title} · 二级小祥轨迹`;
      rows = session ? await query(this.db, `SELECT e.id,e.agent_session_id,e.agent_task_id task_id,e.tool,e.status,
        e.created_at,e.finished_at,e.input,e.message_id,m.thread_id,LEFT(m.body,240) user_preview,m.created_at user_created_at,
        a.id visual_artifact_id,
        CASE WHEN e.tool IN ('assistant_text','assistant_final') THEN LEFT(e.output,240) END output_preview
        FROM agent_events e JOIN messages m ON m.id=e.message_id
        LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id
        WHERE m.thread_id=? AND e.agent_session_id=? ORDER BY e.id DESC LIMIT 300`,
      [scopeId, session.session_id]) : [];
      rows = rows.map((row) => ({ ...row, agent_type: "l2" }));
    } else if (scopeType === "task") {
      const [task] = await query(this.db, "SELECT id,project_id,title FROM agent_tasks WHERE id=?", [scopeId]);
      if (!task) fail(404, "任务不存在");
      await this.member(user, task.project_id);
      titleText = `${task.title} · 三级小祥轨迹`;
      rows = await query(this.db, `SELECT DISTINCT e.id,e.agent_session_id,? task_id,e.tool,e.status,
        e.created_at,e.finished_at,e.input,e.message_id,m.thread_id,LEFT(m.body,240) user_preview,m.created_at user_created_at,
        a.id visual_artifact_id,
        CASE WHEN e.tool IN ('assistant_text','assistant_final') THEN LEFT(e.output,240) END output_preview
        FROM agent_events e JOIN messages m ON m.id=e.message_id
        LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id
        WHERE ${taskEventScope}
        ORDER BY e.id DESC LIMIT 300`, [scopeId, scopeId, scopeId, scopeId]);
      rows = rows.map((row) => ({ ...row, agent_type: "dsh_l3" }));
    } else fail(400, "未知日志作用域");
    return {
      scopeType, scopeId, title: titleText,
      inputs: collectInputs(rows),
      events: rows.map((row) => {
        const label = labelFor(row);
        const preview = ["assistant_text", "assistant_final"].includes(row.tool)
          ? String(row.output_preview || "").replace(/\s+/g, " ").trim() : "";
        return {
          id: String(row.id), agentType: row.agent_type, agentSessionId: row.agent_session_id,
          taskId: row.task_id || null, messageId: row.message_id || null, threadId: row.thread_id || null,
          tool: row.tool, action: label.action, target: label.target || undefined, status: row.status,
          createdAt: row.created_at, finishedAt: row.finished_at, durationMs: duration(row),
          ...(preview ? { preview } : {}),
          ...(row.visual_artifact_id ? { screenshotUrl: `/api/agent-visual-artifacts/${row.visual_artifact_id}` } : {}),
          ...(row.agent_type === "l1" && row.task ? { task: row.task } : {}),
          ...(row.agent_type === "l1" && row.error ? { error: row.error } : {}),
        };
      }),
    };
  }
  async agentLogEvent(user, scopeType, scopeId, eventId) {
    const id = z.string().regex(/^\d+$/).parse(String(eventId));
    if (scopeType === "project") {
      await this.project(user, scopeId);
      const [event] = await query(this.db,
        `SELECT e.id,e.phase tool,e.status,e.error,e.created_at,e.finished_at,a.id visual_artifact_id
         FROM agent_project_events e LEFT JOIN agent_visual_artifacts a ON a.agent_project_event_id=e.id
         WHERE e.id=? AND e.project_id=?`,
        [id, scopeId]);
      if (!event) fail(404, "执行记录不存在");
      return { ...event, ...(event.visual_artifact_id ? { screenshotUrl: `/api/agent-visual-artifacts/${event.visual_artifact_id}` } : {}) };
    }
    if (scopeType === "thread") {
      await this.thread(user, scopeId, false, this.db, { display: true });
      const [event] = await query(this.db,
        `SELECT e.*,a.id visual_artifact_id FROM agent_events e JOIN messages m ON m.id=e.message_id
         LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id WHERE e.id=? AND m.thread_id=?`,
        [id, scopeId]);
      if (!event) fail(404, "执行记录不存在");
      return { ...event, ...(event.visual_artifact_id ? { screenshotUrl: `/api/agent-visual-artifacts/${event.visual_artifact_id}` } : {}) };
    }
    if (scopeType === "task") {
      const [task] = await query(this.db, "SELECT id,project_id FROM agent_tasks WHERE id=?", [scopeId]);
      if (!task) fail(404, "任务不存在");
      await this.member(user, task.project_id);
      const [event] = await query(this.db, `SELECT e.*,a.id visual_artifact_id FROM agent_events e
        LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id WHERE e.id=? AND EXISTS (SELECT 1 FROM agent_task_execution_runs owner_run
          WHERE owner_run.task_id=? AND owner_run.executor_type='dsh_l3'
            AND owner_run.executor_id=e.agent_session_id)
          AND (e.agent_task_id=? OR (e.agent_task_id IS NULL AND EXISTS (
            SELECT 1 FROM agent_task_execution_runs timed_run WHERE timed_run.task_id=?
              AND timed_run.executor_type='dsh_l3' AND timed_run.executor_id=e.agent_session_id
              AND e.created_at>=COALESCE(timed_run.started_at,timed_run.created_at)
              AND e.created_at<=COALESCE(timed_run.finished_at,UTC_TIMESTAMP(3)))))`,
      [id, scopeId, scopeId, scopeId]);
      if (!event) fail(404, "执行记录不存在");
      return { ...event, ...(event.visual_artifact_id ? { screenshotUrl: `/api/agent-visual-artifacts/${event.visual_artifact_id}` } : {}) };
    }
    fail(400, "未知日志作用域");
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
          "INSERT INTO members(project_id,user_id,role,joined_at) VALUES(?,?,?,UTC_TIMESTAMP(6))",
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
        "INSERT INTO members(project_id,user_id,role,joined_at) VALUES(?,?,?,UTC_TIMESTAMP(6))",
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
    await transaction(this.db, async (db) => {
      await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [projectId]);
      await this.assertDocumentScopeAvailable(db, projectId, null);
      await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)",
        [threadId, projectId, data.title, user.id]);
      await this.createIterationFolders(db, projectId, threadId, data.title);
    });
    return { id: threadId, ...data };
  }
  async context(user, threadId, db = this.db, { display = false, limit = 50, before, after } = {}) {
    const thread = await this.thread(user, threadId, false, db, { display });
    const pageSize = z.coerce.number().int().min(1).max(200).parse(limit);
    const cursor = before || after;
    if (cursor) z.string().regex(/^\d+$/).parse(cursor);
    // Never inline base64 avatars or full tool I/O here — a busy thread can exceed
    // 30 MiB and arrive as HTTP 200 with a truncated/non-JSON body through the proxy.
    // Avatars stay on /members/:id/avatar; event payloads stay on /events/:eventId.
    const messagesQuery = query(
      db,
      `SELECT m.id,m.sequence,m.body,m.refs,m.folder_refs,m.source,m.execution_target,m.agent_task_id,m.created_at,u.name author,u.id author_id,CASE WHEN m.source='assistant' THEN NULL ELSE CONCAT('/api/projects/',?,'/members/',u.id,'/avatar?v=',LEFT(SHA2(u.avatar,256),16)) END author_avatar,
      JSON_UNQUOTE(JSON_EXTRACT(u.identity_tags, '$[0]')) author_role
      FROM messages m JOIN users u ON u.id=m.author_id WHERE m.thread_id=? AND NOT (m.source='human' AND m.agent_task_id IS NOT NULL)${display && cursor ? ` AND m.sequence${before ? "<" : ">"}?` : ""} ORDER BY m.sequence${display && !after ? " DESC" : ""}${display ? ` LIMIT ${pageSize + 1}` : ""}`,
      [thread.project_id, threadId, ...(display && cursor ? [cursor] : [])],
    );
    const page = display ? await messagesQuery : null;
    const hasMore = !!page && page.length > pageSize;
    const selected = page?.slice(0, pageSize);
    if (display && !after) selected.reverse();
    const eventFilter = display ? ` AND m.id IN (${selected.length ? selected.map(() => "?").join(",") : "NULL"})` : "";
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
      `SELECT e.id,e.message_id,e.tool,e.status,e.created_at,e.finished_at,
       CASE WHEN JSON_VALID(e.input) THEN JSON_OBJECT('action',JSON_EXTRACT(e.input,'$.action'),'scope',JSON_EXTRACT(e.input,'$.scope'),'name',JSON_EXTRACT(e.input,'$.name'),'artifactId',JSON_EXTRACT(e.input,'$.artifactId'),'folderId',JSON_EXTRACT(e.input,'$.folderId'),'threadId',JSON_EXTRACT(e.input,'$.threadId'),'versionId',JSON_EXTRACT(e.input,'$.versionId'),
       'path',JSON_EXTRACT(e.input,'$.path'),'title',JSON_EXTRACT(e.input,'$.title'),'command',LEFT(JSON_UNQUOTE(JSON_EXTRACT(e.input,'$.command')),300)) ELSE '{}' END input,
       NULL output FROM agent_events e JOIN messages m ON m.id=e.message_id WHERE m.thread_id=?${eventFilter} ORDER BY e.id`,
      [threadId, ...(display ? selected.map((m) => m.id) : [])],
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
    const connectorTasksQuery = query(db, `SELECT t.id,t.message_id,t.requested_by,t.assigned_to,t.status,t.policy,t.allow_git_push allowGitPush,t.progress,t.agent_kind agentKind,t.error,t.output,t.diff,
      CASE WHEN ? IN (t.requested_by,t.assigned_to) THEN t.instruction ELSE NULL END instruction,
      t.created_at,t.started_at,t.finished_at,c.id connector_id,c.name connector_name,u.name connector_owner_name
      FROM connector_tasks t JOIN connectors c ON c.id=t.connector_id JOIN users u ON u.id=c.user_id
      WHERE t.thread_id=? ORDER BY t.created_at,t.id`, [user.id, threadId]);
    const pendingQuery = display ? query(db, `SELECT m.id,m.sequence,m.body,m.refs,m.folder_refs,m.source,u.name author,u.id author_id,JSON_UNQUOTE(JSON_EXTRACT(u.identity_tags, '$[0]')) author_role FROM messages m JOIN users u ON u.id=m.author_id LEFT JOIN agent_sessions s ON s.thread_id=m.thread_id WHERE m.thread_id=? AND m.sequence>COALESCE(s.seen_sequence,0)`, [threadId]) : Promise.resolve(null);
    const [messages, reviews, runs, replies, events, [agentContext], updates, requests, pending, connectorTasks] = await Promise.all([display ? selected : messagesQuery, reviewsQuery, runsQuery, repliesQuery, eventsQuery, agentContextQuery, updatesQuery, requestsQuery, pendingQuery, connectorTasksQuery]);
    const withQuotes = await attachMessageQuotes(db, [...new Map([...(pending || []), ...messages].map(m => [m.id, parseMessageRow(m)])).values()]);
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
      connectorTasks,
    };
  }
  async refs(db, projectId, refs) {
    for (const ref of refs) {
      const [version] = await query(
        db,
        `SELECT v.id FROM versions v JOIN artifacts a ON a.id=v.artifact_id
         LEFT JOIN document_folders f ON f.id=a.folder_id
         LEFT JOIN version_recycle vr ON vr.version_id=v.id
         WHERE v.id=? AND a.project_id=? AND a.deleted_at IS NULL AND vr.version_id IS NULL
         AND (f.id IS NULL OR f.folder_kind IS NULL OR f.folder_kind <> 'iteration_root')`,
        [ref, projectId],
      );
      if (!version) fail(400, "只能引用本项目文档库中的有效文档版本");
    }
  }
  async folderRefs(db, projectId, folderIds) {
    for (const folderId of folderIds) {
      const [folder] = await query(
        db,
        "SELECT id,folder_kind FROM document_folders WHERE id=? AND project_id=?",
        [folderId, projectId],
      );
      if (!folder || folder.folder_kind === "iteration_root") fail(400, "只能引用本项目文档库中的文件夹");
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
    executionTarget = "cloud",
    executionTargetUserId = null,
    folderRefs = [],
  ) {
    const inserted = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs,agent_task_id,execution_target,execution_target_user_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [messageId, threadId, user.id, source, text, JSON.stringify(refs), JSON.stringify(folderRefs), agentTaskId, executionTarget, executionTargetUserId],
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
    const rows = await query(this.db, `SELECT m.id,m.thread_id,m.sequence,m.source,m.body,m.refs,m.folder_refs,m.author_id,u.name author,m.created_at
      FROM messages m JOIN users u ON u.id=m.author_id WHERE m.thread_id=? AND NOT (m.source='human' AND m.agent_task_id IS NOT NULL)${sequence ? ' AND m.sequence<?' : ''}
      ORDER BY m.sequence DESC LIMIT ?`, [threadId, ...(sequence ? [sequence] : []), args.limit + 1]);
    const hasMore = rows.length > args.limit;
    const messages = await attachMessageQuotes(this.db, rows.slice(0,args.limit).reverse().map(parseMessageRow));
    return { threadId, messages, page: { hasMore, beforeMessageId: messages[0]?.id || null } };
  }
  async readMessage(user, threadId, messageId, before = 0) {
    await this.thread(user, id.parse(threadId));
    id.parse(messageId);
    z.number().int().min(0).max(20).parse(before);
    const [row] = await query(this.db, `SELECT m.id,m.thread_id,m.sequence,m.source,m.body,m.refs,m.folder_refs,m.author_id,u.name author,m.created_at
      FROM messages m JOIN users u ON u.id=m.author_id WHERE m.id=? AND m.thread_id=?`, [messageId, threadId]);
    if (!row) fail(404, "消息不存在于当前会话");
    const [message] = await attachMessageQuotes(this.db,[parseMessageRow(row)]);
    const previous = before ? (await this.listMessages(user, threadId, {beforeMessageId:messageId,limit:before})).messages : [];
    return { message, previous };
  }
  async conversationMembers(user, projectId, memberId) {
    await this.member(user, id.parse(projectId));
    if (memberId === AGENT_MEMBER.id) return { id: AGENT_MEMBER.id, name: AGENT_MEMBER.name, role: AGENT_MEMBER.role, kind: "l1", identity_tags: AGENT_MEMBER.identity_tags };
    if (memberId === AGENT_L2_MEMBER.id) return { id: AGENT_L2_MEMBER.id, name: AGENT_L2_MEMBER.name, role: AGENT_L2_MEMBER.role, kind: "l2", identity_tags: AGENT_L2_MEMBER.identity_tags };
    if (memberId) id.parse(memberId);
    const rows = await query(this.db, `SELECT u.id,u.name,m.role${memberId ? ',u.motto,u.identity_tags' : ''}
      FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?${memberId ? ' AND u.id=?' : ''} ORDER BY u.name,u.id`, [projectId,...(memberId ? [memberId] : [])]);
    if (memberId) { if (!rows.length) fail(404,"成员不属于当前项目"); return { ...rows[0], kind: "human" }; }
    return [...rows.map((row) => ({ ...row, kind: "human" })), { id: AGENT_L2_MEMBER.id, name: AGENT_L2_MEMBER.name, role: AGENT_L2_MEMBER.role, kind: "l2" }];
  }
  async postMessage(user, threadId, input) {
    const data = z
      .object({
        body,
        refs: z.array(id).max(30).default([]),
        folderRefs: z.array(id).max(30).default([]),
        quoteIds: z.array(id).max(10).default([]),
        clientMessageId: id.optional(),
        mentionAgent: z.boolean().default(false),
        files: z.array(z.object({
          title,
          filename: z.string().min(1).max(200),
          mime: z.string().max(200).optional(),
          contentBase64: z.string().max(7_000_000),
          sha256: z.string().optional(),
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
      const folderRefs = [...new Set(data.folderRefs)];
      await this.folderRefs(db, thread.project_id, folderRefs);
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
        "cloud",
        null,
        folderRefs,
      );
      for (const quotedId of quoteIds) await query(db,
        "INSERT INTO message_quotes(message_id,quoted_message_id) VALUES(?,?)", [message.id, quotedId]);
       if (user.kind === "session" || (user.kind === "api" && mentionsAgent(text))) {
        // MCP is one account capability regardless of which client wrote the config.
        // For audit and task attribution, an online connector bound to this project
        // makes the current API message connector-originated automatically.
        let interactionSource = user.kind === "api" ? "mcp" : null;
        if (user.kind === "api") {
          const [onlineConnector] = await query(db, `SELECT c.id FROM connectors c
            JOIN connector_projects cp ON cp.connector_id=c.id AND cp.project_id=?
            WHERE c.user_id=? AND c.revoked_at IS NULL
              AND c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) LIMIT 1`,
          [thread.project_id, user.id]);
          if (onlineConnector) interactionSource = "connector_mcp";
        }
        await query(db, "INSERT INTO agent_requests(message_id,interaction_source) VALUES(?,?)", [message.id, interactionSource]);
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
            return { ...message, refs, folder_refs: folderRefs, files, updatedTaskId: existing.message_id };
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
      return { ...message, refs, folder_refs: folderRefs, files };
    });
    publishWork(this.db, threadId);
    // Return the committed chat row and receipt so the sender can render them
    // immediately, without waiting for a separate workspace refresh.
    const [saved] = await query(this.db, `SELECT m.sequence,m.body,m.source,m.execution_target,m.created_at,u.name author,m.author_id,
      q.status request_status,r.participation FROM messages m JOIN users u ON u.id=m.author_id
      LEFT JOIN agent_requests q ON q.message_id=m.id LEFT JOIN assistant_replies r ON r.message_id=m.id
      WHERE m.id=?`, [result.id]);
    return { ...result, ...saved };
  }
  async uploadOfficialDocument(user, projectId, input, options = {}) {
    if (!["session", "api"].includes(user.kind)) fail(403, "上传正式文件需要人工或已授权的 MCP 账号");
    id.parse(projectId);
    const data = z
      .object({
        folderId: id.optional(),
        title,
        filename: z
          .string()
          .min(1)
          .max(200)
          .refine((x) => !/[\\/\x00-\x1f]/.test(x), "文件名不可包含路径"),
        mime: z.string().max(200).optional(),
        contentBase64: z.string().max(7_000_000).optional(),
        sha256: z.string().optional(),
        note: z.string().max(4000).default(""),
      })
      .parse(input);
    data.mime = resolveStoredMime(data.filename, data.mime);
    const { bytes, sha256 } = options.bytes
      ? verifyBytes(options.bytes, data.sha256, options.bytes.length)
      : decodeUploadedBytes(data.contentBase64, { sha256: data.sha256, maxBytes: INLINE_FILE_MAX_BYTES });
    const save = async (db) => {
      await this.member(user, projectId, true, db);
      await this.assertOfficialOrganizing(db, projectId);
      await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [projectId]);
      if (!data.folderId)
        data.folderId = (await this.documentFolder(db, projectId, "project_official", null)).id;
      const [folder] = await query(
        db,
        "SELECT id FROM document_folders WHERE id=? AND project_id=?",
        [data.folderId, projectId],
      );
      if (!folder) fail(404, "文件夹不存在");
      if (!(await isOfficialLibraryFolder(db, folder.id)))
        fail(403, "只能上传到正式文件区");
      data.title = await uniqueArtifactTitle(db, projectId, data.folderId, data.title, null, data.filename);
      data.filename = await uniqueVersionFilename(db, projectId, data.folderId, data.filename);
      const artifactId = randomUUID();
      await query(
        db,
        "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
        [artifactId, projectId, data.title, user.id, data.folderId],
      );
      const versionId = randomUUID();
      await query(
        db,
        `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [
          versionId,
          artifactId,
          null,
          1,
          data.filename,
          data.mime,
          bytes,
          sha256,
          bytes.length,
          data.note,
          user.id,
        ],
      );
      await queueDocumentMemory(db, versionId);
      await query(db, "UPDATE artifacts SET updated_at=UTC_TIMESTAMP(3) WHERE id=?", [artifactId]);
      await recordDocumentChange(db, {
        projectId, artifactId, versionId, folderId: data.folderId, action: "document_uploaded",
        source: user.kind === "api" ? "mcp" : "ui", actorType: user.kind, actorId: user.id,
        details: { title: data.title, filename: data.filename, version: 1 },
      });
      return submittedVersion(versionId, artifactId, 1, sha256, data, bytes.length);
    };
    return options.db ? save(options.db) : transaction(this.db, save);
  }
  async uploadCacheDraft(user, threadId, input, options = {}) {
    return this.submitVersion(user, threadId, input, undefined, undefined, false, { ...options, silent: true });
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
    if (user.kind === "session" && !chatUpload && !options.silent)
      fail(403, "人工文件只能通过对话框上传");
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
        mime: z.string().max(200).optional(),
        contentBase64: z.string().max(7_000_000).optional(),
        sha256: z.string().optional(),
        note: z.string().max(4000).default(""),
      })
      .parse(input);
    data.mime = resolveStoredMime(data.filename, data.mime);
    const { bytes, sha256 } = options.bytes
      ? verifyBytes(options.bytes, data.sha256, options.bytes.length)
      : decodeUploadedBytes(data.contentBase64, { sha256: data.sha256, maxBytes: INLINE_FILE_MAX_BYTES });
    const save = async (db) => {
      const thread = await this.thread(user, threadId, true, db);
      if (agentMessageId) {
        const [reply] = await query(
          db,
          "SELECT status FROM assistant_replies WHERE message_id=? FOR UPDATE",
          [agentMessageId],
        );
        const liveReply = ["queued", "running"].includes(reply?.status);
        let liveL3 = false;
        if (!liveReply && options.executorSessionId) {
          const [run] = await query(db, `SELECT id FROM agent_task_execution_runs
            WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting') LIMIT 1`,
            [options.executorSessionId]);
          liveL3 = !!run;
        }
        if (!liveReply && !liveL3)
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
      const sourceFile = chatUpload || options.silent;
      const generatedByTask = user.kind === "agent" || !!agentMessageId || (user.kind === "api" && !options.silent);
      if (sourceFile && data.artifactId) fail(400, "对话上传必须创建新文件");
      if (!data.artifactId) {
        data.folderId = await this.resolveVersionFolderId(db, thread.project_id, data.folderId, {
          chatUpload,
          sourceFile,
          generatedByTask,
        });
      } else if (data.folderId != null) {
        data.folderId = await this.resolveVersionFolderId(db, thread.project_id, data.folderId, {
          chatUpload: false,
          sourceFile: false,
          generatedByTask: false,
        });
      }
      if (data.folderId) {
        const [folder] = await query(
          db,
          "SELECT id,thread_id,folder_kind FROM document_folders WHERE id=? AND project_id=?",
          [data.folderId, thread.project_id],
        );
        if (!folder) fail(404, "文件夹不存在");
        const rootKind = await folderRootKind(db, folder.id);
        if (rootKind === "project_official")
          fail(403, "正式文件不分版本，请通过上传或另存创建");
        if (chatUpload && !isCacheFolderKind(rootKind))
          fail(403, "对话上传只能保存到对话缓存");
        if (isCacheFolderKind(rootKind) && !sourceFile) {
          if (!generatedByTask)
            fail(403, "对话缓存只能由对话上传产生，Agent 不能新增");
          data.folderId = (await this.dailyProjectFolder(db, thread.project_id, "outputs")).id;
        }
        if (isOutputFolderKind(rootKind) && sourceFile)
          fail(403, "沙箱产物只能由云端 Agent 构建");
        await this.assertDocumentScopeAvailable(db, thread.project_id, folder.id);
      }
      let artifactId = data.artifactId;
      if (artifactId) {
        const [artifact] = await query(
          db,
          `SELECT a.id,a.title,a.folder_id,f.thread_id,f.folder_kind FROM artifacts a LEFT JOIN document_folders f ON f.id=a.folder_id
           WHERE a.id=? AND a.project_id=? AND a.deleted_at IS NULL FOR UPDATE`,
          [artifactId, thread.project_id],
        );
        if (!artifact) fail(404, "文档不存在");
        const artifactRoot = await folderRootKind(db, artifact.folder_id);
        if (artifactRoot === "project_official")
          fail(403, "正式文件不分版本，不能提交新版本");
        if (isCacheFolderKind(artifactRoot)) {
          if (!generatedByTask)
            fail(403, "对话缓存是只读来源，不能提交新版本");
          artifactId = randomUUID();
          data.folderId = (await this.dailyProjectFolder(db, thread.project_id, "outputs")).id;
          if (!data.note) data.note = `基于对话缓存「${artifact.title}」修改`;
          data.title = await uniqueArtifactTitle(db, thread.project_id, data.folderId, data.title, null, data.filename);
          data.filename = await uniqueVersionFilename(db, thread.project_id, data.folderId, data.filename);
          await query(
            db,
            "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
            [artifactId, thread.project_id, data.title, user.id, data.folderId],
          );
        } else {
          await this.assertDocumentScopeAvailable(db, thread.project_id, artifact.folder_id);
        }
      } else {
        artifactId = randomUUID();
        data.title = await uniqueArtifactTitle(db, thread.project_id, data.folderId || null, data.title, null, data.filename);
        data.filename = await uniqueVersionFilename(db, thread.project_id, data.folderId || null, data.filename);
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
          sha256,
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
      await recordDocumentChange(db, {
        projectId: thread.project_id, artifactId, versionId, folderId: data.folderId,
        action: sourceFile ? "cache_uploaded" : "artifact_published",
        source: user.kind === "agent" ? "agent" : user.kind === "api" ? "mcp" : "ui",
        actorType: user.kind, actorId: user.id, threadId,
        messageId: agentMessageId || null,
        details: { title: data.title, filename: data.filename, version },
      });
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
      return submittedVersion(versionId, artifactId, version, sha256, data, bytes.length);
    };
    return options.db ? save(options.db) : transaction(this.db, save);
  }
  async version(user, versionId, { includeContent = true, maxBytes = 0 } = {}) {
    id.parse(versionId);
    const limit = Math.min(Math.max(0, Math.trunc(Number(maxBytes) || 0)), 1_048_576);
    const metaColumns = "v.id,v.artifact_id,v.thread_id,v.version,v.filename,v.mime,v.sha256,v.byte_size,v.note,v.created_by,v.created_at";
    const versionColumns = !includeContent
      ? metaColumns
      : limit
        ? `${metaColumns},SUBSTRING(v.content, 1, ?) AS content`
        : "v.*";
    const [version] = await query(
      this.db,
      `SELECT ${versionColumns},a.project_id,a.title,a.folder_id,f.thread_id folder_thread_id,f.folder_kind
       FROM versions v JOIN artifacts a ON a.id=v.artifact_id LEFT JOIN document_folders f ON f.id=a.folder_id WHERE v.id=?`,
      limit && includeContent ? [limit, versionId] : [versionId],
    );
    if (!version) fail(404, "文档版本不存在");
    await this.member(user, version.project_id);
    return version;
  }
  async folderArchive(user, projectId, folderId) {
    id.parse(projectId);
    id.parse(folderId);
    await this.member(user, projectId);
    const folders = await query(
      this.db,
      "SELECT id,parent_id,name,folder_kind FROM document_folders WHERE project_id=?",
      [projectId],
    );
    const root = folders.find((folder) => folder.id === folderId);
    if (!root) fail(404, "文件夹不存在");
    if (root.folder_kind === "project_official") fail(404, "正式文件根目录不可直接下载");
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const folderIds = new Set([folderId]);
    const relativeFolders = new Map([[folderId, ""]]);
    const pending = [folderId];
    while (pending.length) {
      const parentId = pending.shift();
      for (const folder of folders) {
        if (folder.parent_id !== parentId) continue;
        folderIds.add(folder.id);
        relativeFolders.set(folder.id, `${relativeFolders.get(parentId)}${folder.name}/`);
        pending.push(folder.id);
      }
    }
    const placeholders = [...folderIds].map(() => "?").join(",");
    const versions = await query(
      this.db,
      `SELECT v.id,v.artifact_id,v.version,v.filename,v.content,a.title,a.folder_id
       FROM versions v JOIN artifacts a ON a.id=v.artifact_id
       LEFT JOIN version_recycle vr ON vr.version_id=v.id
       WHERE a.project_id=? AND a.deleted_at IS NULL AND vr.version_id IS NULL
         AND a.folder_id IN (${placeholders})
         AND NOT EXISTS (
           SELECT 1 FROM versions newer
           LEFT JOIN version_recycle newer_vr ON newer_vr.version_id=newer.id
           WHERE newer.artifact_id=v.artifact_id AND newer.version>v.version
             AND newer_vr.version_id IS NULL
         )
       ORDER BY a.folder_id,v.filename,v.id`,
      [projectId, ...folderIds],
    );
    if (!versions.length) fail(404, "文件夹内没有可下载的文件");
    const zip = new JSZip();
    const usedNames = new Map();
    for (const version of versions) {
      const prefix = relativeFolders.get(version.folder_id) || "";
      const originalName = String(version.filename || "文档").replace(/[\\/\x00-\x1f]/g, "_");
      const key = `${prefix}${originalName}`;
      const count = usedNames.get(key) || 0;
      usedNames.set(key, count + 1);
      const dot = originalName.lastIndexOf(".");
      const suffix = dot > 0 ? originalName.slice(dot) : "";
      const stem = suffix ? originalName.slice(0, -suffix.length) : originalName;
      const filename = count ? `${prefix}${stem} (${count + 1})${suffix}` : key;
      zip.file(filename, version.content);
    }
    return {
      content: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
      filename: `${String(root.name || "文件夹").replace(/[\\/\x00-\x1f]/g, "_") || "文件夹"}.zip`,
      fileCount: versions.length,
      folder: folderById.get(folderId),
    };
  }
  async versionSource(user, versionId, { maxBytes = 0 } = {}) {
    const version = await this.version(user, versionId, {
      includeContent: true,
      maxBytes,
    });
    const filename = String(version.filename || "");
    // /source is the code view: force text/plain for markup so the browser does not render HTML.
    // HTML/CSS/JS preview uses versionPreview + /preview/, which prefers filename over stored mime.
    const mime = /\.(html?|md|markdown|txt|css|js|json|xml|ya?ml|csv|sql|log)$/i.test(
      filename,
    )
      ? "text/plain; charset=utf-8"
      : previewContentType(version.mime, filename);
    return {
      content: version.content,
      mime,
      filename,
    };
  }
  async versionPreview(user, versionId, assetPath = "", ticket = "") {
    const root = await this.version(user, versionId, { includeContent: !assetPath });
    const rootName = String(root.filename || "").replace(/\\/g, "/");
    if (!/\.html?$/i.test(rootName)) fail(404, "该版本不是 HTML 文档");
    if (!assetPath) {
      return {
        content: asPreviewHtml(root.content, versionId, "", user.id, ticket),
        mime: previewContentType(root.mime, rootName),
        filename: rootName,
      };
    }
    const relative = String(assetPath).replace(/\\/g, "/").replace(/^\/+/, "");
    if (!relative) fail(403, "资源路径无效");
    const dir = pathPosix.dirname(rootName);
    const resolved = pathPosix.normalize(
      pathPosix.join(dir === "." ? "" : dir, relative),
    );
    if (
      !resolved
      || resolved === ".."
      || resolved.startsWith("../")
      || resolved.split("/").includes("..")
    ) {
      fail(403, "资源路径无效");
    }
    const target = String(resolved).replace(/^\/+/, "") || pathPosix.basename(rootName);
    if (!root.folder_id) fail(404, "资源不存在");
    const segments = target.split("/").filter(Boolean);
    const filename = segments.pop();
    if (!filename) fail(403, "资源路径无效");
    let row = null;
    if (segments.length) {
      const nestedFolder = await walkPreviewSubfolders(
        this.db,
        root.project_id,
        root.folder_id,
        segments,
      );
      if (nestedFolder) row = await previewAssetInFolder(this.db, nestedFolder, filename);
    }
    if (!row) {
      const lookupNames = segments.length ? [target] : [filename];
      for (const name of lookupNames) {
        row = await previewAssetInFolder(this.db, root.folder_id, name);
        if (row) break;
      }
    }
    if (!row) fail(404, "资源不存在");
    const mime = previewContentType(row.mime, row.filename);
    const isHtml = /\.html?$/i.test(row.filename) || /\.html?$/i.test(target);
    return {
      content: isHtml ? asPreviewHtml(row.content, versionId, target, user.id, ticket) : row.content,
      mime,
      filename: row.filename,
    };
  }
  async duplicateVersionToOfficial(db, user, projectId, versionId, {
    threadId = null,
    note = "另存至项目正式文件",
    skipOrganizeCheck = false,
    title: givenTitle,
  } = {}) {
    id.parse(versionId);
    id.parse(projectId);
    if (!skipOrganizeCheck) await this.assertOfficialOrganizing(db, projectId);
    const [source] = await query(db, `SELECT v.*,a.title,a.project_id,a.folder_id,f.folder_kind
      FROM versions v JOIN artifacts a ON a.id=v.artifact_id LEFT JOIN document_folders f ON f.id=a.folder_id
      WHERE v.id=? AND a.project_id=?`, [versionId, projectId]);
    if (!source) fail(404, "文档版本不存在");
    const sourceRoot = await folderRootKind(db, source.folder_id);
    if (sourceRoot === "project_official")
      return { id: source.id, artifactId: source.artifact_id, reused: true };
    if (!isCacheFolderKind(sourceRoot) && !isOutputFolderKind(sourceRoot))
      fail(403, "只能从对话缓存或沙箱产物另存为正式文件");
    if (isCacheFolderKind(sourceRoot) || isOutputFolderKind(sourceRoot)) {
      const [review] = await query(db,
        "SELECT decision FROM reviews WHERE version_id=? ORDER BY created_at DESC,id DESC LIMIT 1",
        [versionId]);
      if (review?.decision !== "approved")
        fail(409, isCacheFolderKind(sourceRoot)
          ? "只有已确认的对话缓存可以另存为正式文件"
          : "只有已确认的沙箱产物版本可以另存为正式文件");
    }
    const official = await this.documentFolder(db, projectId, "project_official");
    const copiedTitle = await uniqueArtifactTitle(db, projectId, official.id, givenTitle
      || (isOutputFolderKind(sourceRoot) ? officialTitleWithVersion(source.title, source.version) : source.title),
      null, source.filename);
    const copiedFilename = await uniqueVersionFilename(db, projectId, official.id, source.filename);
    const artifactId = randomUUID(), copiedVersionId = randomUUID();
    await query(db, "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,?,?,?)",
      [artifactId, projectId, copiedTitle, user.id, official.id]);
    await query(db, `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [copiedVersionId, artifactId, threadId || source.thread_id || null, 1, copiedFilename, source.mime,
      source.content, source.sha256, source.byte_size, note, user.id]);
    await queueDocumentMemory(db, copiedVersionId);
    await recordDocumentChange(db, {
      projectId, artifactId, versionId: copiedVersionId, folderId: official.id,
      action: "document_saved_to_official", source: user.kind === "agent" ? "agent" : "ui",
      actorType: user.kind, actorId: user.id, threadId,
      details: { sourceVersionId: versionId, title: copiedTitle, filename: copiedFilename, version: 1 },
    });
    return { id: copiedVersionId, artifactId, version: 1, title: copiedTitle };
  }
  async saveVersionToOfficial(user, projectId, versionId, input = {}) {
    if (user.kind !== "session") fail(403, "另存项目正式文件需要人工登录");
    const data = z.object({ title: title.optional() }).parse(input || {});
    return transaction(this.db, (db) =>
      this.duplicateVersionToOfficial(db, user, projectId, versionId, { title: data.title }));
  }
  async copyVersionToOfficial(user, threadId, versionId, options = {}) {
    if (user.kind !== "session" && !options.agent) fail(403, "另存项目正式文件需要人工登录");
    id.parse(versionId);
    const save = async (db) => {
      const thread = await this.thread(user, threadId, !options.archive, db);
      return this.duplicateVersionToOfficial(db, user, thread.project_id, versionId, {
        threadId,
        note: options.archive ? "迭代归档自动另存" : "另存至项目正式文件",
        skipOrganizeCheck: !!options.archive,
      });
    };
    return options.db ? save(options.db) : transaction(this.db, save);
  }
  async review(user, versionId, input) {
    if (user.kind !== "session") fail(403, "文档审核需要人工登录");
    const data = z
      .object({
        decision: z.enum(["approved", "changes_requested"]),
        comment: z.string().max(4000).default(""),
        threadId: id.optional(),
      })
      .parse(input);
    const version = await this.version(user, versionId);
    const rootKind = await folderRootKind(this.db, version.folder_id);
    if (rootKind === "project_official")
      fail(403, "正式文件已确认，不需要审核");
    if (!isCacheFolderKind(rootKind) && !isOutputFolderKind(rootKind))
      fail(400, "只能审核对话缓存或沙箱产物");
    const comment = data.comment.trim();
    if (data.decision === "changes_requested" && !comment)
      fail(400, "请填写需要修改的内容");
    const threadId = data.threadId || version.thread_id;
    if (!threadId) fail(400, "请在当前迭代中审核文档");
    const thread = await this.thread(user, threadId, true);
    if (thread.project_id !== version.project_id)
      fail(400, "只能在本项目的迭代中发送审核意见");
    const reviewId = randomUUID();
    await transaction(this.db, async (db) => {
      await this.thread(user, threadId, true, db);
      await query(
        db,
        "INSERT INTO reviews(id,version_id,reviewer_id,decision,comment) VALUES(?,?,?,?,?)",
        [reviewId, versionId, user.id, data.decision, comment],
      );
      if (data.decision === "approved") {
        const cache = isCacheFolderKind(rootKind);
        const action = cache ? "确认" : "审核通过";
        await this.insertMessage(
          db,
          user,
          threadId,
          `${action}「${version.title}」${cache ? "" : `v${version.version}`}`,
          [versionId],
          "system",
        );
      }
    });
    if (data.decision !== "changes_requested") return { id: reviewId };
    const mentionAgent = isOutputFolderKind(rootKind)
      || !version.created_by
      || version.created_by === user.id
      || version.created_by === AGENT_MEMBER.id;
    let mentionName = AGENT_MEMBER.name;
    if (!mentionAgent) {
      const [author] = await query(this.db, "SELECT name FROM users WHERE id=?", [version.created_by]);
      mentionName = author?.name || AGENT_MEMBER.name;
    }
    const label = isCacheFolderKind(rootKind) ? "" : `v${version.version}`;
    const numbered = /(?:^|\n)\d+\.\s/.test(comment) || comment.includes("\n");
    const commentBlock = numbered ? `\n${comment}` : comment;
    const saveHint = isCacheFolderKind(rootKind)
      ? (mentionAgent
        ? `${numbered ? "\n" : "。"}修改后请保存为沙箱产物，不要改对话缓存原件`
        : `${numbered ? "\n" : "。"}请让小祥帮忙改并保存为沙箱产物，或自己改完后在对话框重新上传新的对话缓存`)
      : "";
    const body = `@${mentionName} 需要修改「${version.title}」${label}：${commentBlock}${saveHint}`;
    const message = await this.postMessage(user, threadId, {
      body,
      refs: [versionId],
      mentionAgent: mentionAgent || mentionName === AGENT_MEMBER.name,
    });
    return { id: reviewId, messageId: message.id };
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
      const outputVersions = await query(db, `SELECT v.id,v.artifact_id,v.version,
        (SELECT r.decision FROM reviews r WHERE r.version_id=v.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) review
        FROM versions v
        JOIN artifacts a ON a.id=v.artifact_id JOIN document_folders f ON f.id=a.folder_id
        WHERE v.thread_id=? AND a.deleted_at IS NULL ${OUTPUT_LIBRARY_FOLDER_SQL}`, [threadId]);
      const latestConfirmed = new Map();
      for (const row of outputVersions) {
        if (row.review !== "approved") continue;
        const previous = latestConfirmed.get(row.artifact_id);
        if (!previous || row.version > previous.version) latestConfirmed.set(row.artifact_id, row);
      }
      const archivedOutputs = [];
      for (const output of latestConfirmed.values())
        archivedOutputs.push(await this.copyVersionToOfficial(user, threadId, output.id, { db, archive: true }));
      const context = await this.context(user, threadId, db);
      const folderIds = [...new Set(context.messages.flatMap((m) => m.folder_refs || []))];
      const folderVersions = await latestVersionsByFolderRoots(db, thread.project_id, folderIds);
      const versionIds = [...new Set([
        ...context.messages.flatMap((m) => m.refs),
        ...[...folderVersions.values()].flatMap((rows) => rows.map((row) => row.version_id)),
      ])];
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
        archivedOutputs,
      };
      await query(
        db,
        "UPDATE threads SET status='archived',archive_snapshot=?,archived_at=UTC_TIMESTAMP(3) WHERE id=?",
        [JSON.stringify(snapshot), threadId],
      );
      const [existing] = await query(db, `SELECT id,status FROM agent_l1_runs
        WHERE project_id=? AND task='iteration_archive' AND thread_id=? AND status IN ('queued','running') LIMIT 1`,
      [thread.project_id, threadId]);
      if (!existing) await query(db, `INSERT INTO agent_l1_runs(id,project_id,thread_id,task,trigger_source,requested_by)
        VALUES(?,?,?,'iteration_archive','user',?)`, [randomUUID(), thread.project_id, threadId, user.id]);
      return snapshot;
    });
    publishWork(this.db);
    return snapshot;
  }
}
