/**
 * 文档内核的业务实现层。
 *
 * 这些方法原来长在业务门面 `server/service.js` 里，导致文档逻辑与项目/成员/迭代
 * 逻辑同处一个文件、且门面必须反过来 import 内核。现在按 1.1 的方式纯移动到这里：
 * `Service extends DocumentsService`，正文逐字未改，`this` 语义不变。
 *
 * 写入一律经 `./versions.js` / `./library.js`；本文件不直接拼文档表的 SQL。
 * 与业务侧的协作（权限、迭代锁、记忆队列）继续通过传入的 `this` 与显式 import 完成。
 */
import { randomUUID } from "node:crypto";
import { posix as pathPosix } from "node:path";
import JSZip from "jszip";
import { z } from "zod/v3";
import { query, transaction } from "../db.js";
import { HttpError } from "../http-error.js";
import { AGENT_MEMBER } from "../../shared/agent-member.js";
import { decodeUploadedBytes, verifyBytes } from "./file-bytes.js";
import { INLINE_FILE_MAX_BYTES } from "../../shared/upload-limits.js";
import { publishWork } from "../work-events.js";
import { queueDocumentMemory } from "../project-memory.js";
import {
  DOCUMENT_LIBRARY_FOLDER_SQL,
  OUTPUT_LIBRARY_FOLDER_SQL,
  ensureProjectLibraryRoots,
  folderRootKind,
  folderRootKindInList,
  isCacheFolderKind,
  isOfficialLibraryFolder,
  isOutputFolderKind,
  isProjectLibraryAreaRoot,
  latestVersionsByFolderRoots,
  uniqueArtifactTitle,
  uniqueVersionFilename,
  utcDateKey,
} from "./project-library.js";
import { libraryChange } from "./library.js";
import { previewContentType, resolveStoredMime } from "./preview-mime.js";
import { recordDocumentChange } from "./document-audit.js";
import { asPreviewHtml, previewAssetInFolder, walkPreviewSubfolders } from "./service-preview.js";
import {
  clearArtifactOfficialLink,
  clearArtifactSourceLink,
  createArtifact,
  createFolder,
  createVersion,
  nextVersionNumber,
  renameArtifact,
  replaceVersionContent,
  setArtifactOfficialLink,
  touchArtifact,
} from "./versions.js";

const fail = (status, message) => {
  throw new HttpError(status, message);
};
const json = (value) => (typeof value === "string" ? JSON.parse(value) : value);
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

export class DocumentsService {
  constructor(db) {
    this.db = db;
  }
  async documentFolder(db, projectId, kind, threadId = null) {
    if (
      threadId &&
      (kind === "iteration_cache" || kind === "iteration_outputs" || kind === "iteration_root")
    ) {
      const [legacy] = await query(
        db,
        `SELECT id,project_id,thread_id,parent_id,name,system_key,folder_kind FROM document_folders
         WHERE project_id=? AND folder_kind=? AND thread_id=?`,
        [projectId, kind, threadId],
      );
      if (legacy) return legacy;
    }
    const projectRoot =
      ["project_official", "project_cache", "project_outputs"].includes(kind) && !threadId;
    const [folder] = await query(
      db,
      `SELECT id,project_id,thread_id,parent_id,name,system_key,folder_kind FROM document_folders
       WHERE project_id=? AND folder_kind=? AND thread_id <=> ?${projectRoot ? " AND parent_id IS NULL" : ""}`,
      [projectId, kind, threadId],
    );
    if (!folder) {
      await ensureProjectLibraryRoots(db, projectId);
      const [created] = await query(
        db,
        `SELECT id,project_id,thread_id,parent_id,name,system_key,folder_kind FROM document_folders
         WHERE project_id=? AND folder_kind=? AND thread_id <=> ?${projectRoot ? " AND parent_id IS NULL" : ""}`,
        [projectId, kind, threadId],
      );
      if (!created) fail(500, "项目文档目录尚未初始化");
      return created;
    }
    return folder;
  }
  async dailyProjectFolder(db, projectId, area, now = new Date()) {
    const kind = area === "outputs" ? "project_outputs" : "project_cache";
    const root = await this.documentFolder(db, projectId, kind, null);
    const date = utcDateKey(now);
    let [folder] = await query(
      db,
      `SELECT id FROM document_folders
      WHERE project_id=? AND parent_id=? AND name=? AND folder_kind=? LIMIT 1`,
      [projectId, root.id, date, kind],
    );
    if (!folder) {
      folder = { id: randomUUID() };
      await createFolder(db, {
        id: folder.id,
        projectId,
        parentId: root.id,
        name: date,
        systemKey: `project:${projectId}:${area}:${date}`,
        folderKind: kind,
      });
    }
    return folder;
  }
  async resolveVersionFolderId(
    db,
    projectId,
    folderId,
    { chatUpload, sourceFile, generatedByTask },
  ) {
    if (chatUpload || sourceFile) return (await this.dailyProjectFolder(db, projectId, "cache")).id;
    if (folderId == null)
      return (await this.dailyProjectFolder(db, projectId, generatedByTask ? "outputs" : "cache"))
        .id;
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
    const [job] = await query(
      db,
      `SELECT id FROM document_organization_jobs
      WHERE project_id=? AND scope='project' AND status IN ('queued','running') LIMIT 1`,
      [projectId],
    );
    if (job) fail(409, "一级小祥正在整理正式文件，正式文件区暂时不可操作");
  }
  async assertDocumentScopeAvailable(db, projectId, folderId = null) {
    if (!folderId) {
      await this.assertOfficialOrganizing(db, projectId);
      return;
    }
    if (await isOfficialLibraryFolder(db, folderId))
      await this.assertOfficialOrganizing(db, projectId);
  }
  libraryQueries(projectId) {
    return {
      versions: query(
        this.db,
        `SELECT a.id artifact_id,a.title,a.folder_id,a.source_type,a.source_artifact_id,a.saved_official_artifact_id,a.recycle_path,f.thread_id folder_thread_id,f.folder_kind,COALESCE(a.deleted_at,vr.deleted_at) deleted_at,a.deleted_at artifact_deleted_at,vr.deleted_at version_deleted_at,a.updated_at,v.id,v.version,v.filename,v.mime,v.byte_size,v.sha256,v.note,v.thread_id,v.created_by author_id,v.created_at,u.name author,
        (SELECT d.message_id FROM document_change_logs d WHERE d.version_id=v.id AND d.action='artifact_published' AND d.message_id IS NOT NULL ORDER BY d.created_at,d.id LIMIT 1) batch_id,
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
      if (!folder || folder.folder_kind === "iteration_root")
        fail(400, "只能引用本项目文档库中的文件夹");
    }
  }
  async uploadOfficialDocument(user, projectId, input, options = {}) {
    if (!["session", "api"].includes(user.kind))
      fail(403, "上传正式文件需要人工或已授权的 MCP 账号");
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
      : decodeUploadedBytes(data.contentBase64, {
          sha256: data.sha256,
          maxBytes: INLINE_FILE_MAX_BYTES,
        });
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
      if (!(await isOfficialLibraryFolder(db, folder.id))) fail(403, "只能上传到正式文件区");
      data.title = await uniqueArtifactTitle(
        db,
        projectId,
        data.folderId,
        data.title,
        null,
        data.filename,
      );
      data.filename = await uniqueVersionFilename(db, projectId, data.folderId, data.filename);
      const artifactId = await createArtifact(db, {
        projectId,
        title: data.title,
        createdBy: user.id,
        folderId: data.folderId,
        sourceType: "member_upload",
      });
      const versionId = await createVersion(db, {
        artifactId,
        version: 1,
        filename: data.filename,
        mime: data.mime,
        content: bytes,
        sha256,
        byteSize: bytes.length,
        note: data.note,
        createdBy: user.id,
      });
      await queueDocumentMemory(db, versionId);
      await touchArtifact(db, artifactId);
      await recordDocumentChange(db, {
        projectId,
        artifactId,
        versionId,
        folderId: data.folderId,
        action: "document_uploaded",
        source: user.kind === "api" ? "mcp" : "ui",
        actorType: user.kind,
        actorId: user.id,
        details: { title: data.title, filename: data.filename, version: 1 },
      });
      return submittedVersion(versionId, artifactId, 1, sha256, data, bytes.length);
    };
    return options.db ? save(options.db) : transaction(this.db, save);
  }
  async uploadCacheDraft(user, threadId, input, options = {}) {
    return this.submitVersion(user, threadId, input, undefined, undefined, false, {
      ...options,
      silent: true,
    });
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
    if (chatUpload && user.kind !== "session") fail(403, "对话上传需要人工登录");
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
      : decodeUploadedBytes(data.contentBase64, {
          sha256: data.sha256,
          maxBytes: INLINE_FILE_MAX_BYTES,
        });
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
          const [run] = await query(
            db,
            `SELECT id FROM agent_task_execution_runs
            WHERE executor_type='dsh_l3' AND executor_id=? AND status IN ('running','waiting') LIMIT 1`,
            [options.executorSessionId],
          );
          liveL3 = !!run;
        }
        if (!liveReply && !liveL3) fail(409, "Agent 任务已停止，不能继续提交");
      }
      if (exportKey) {
        const [existing] = await query(
          db,
          `SELECT v.id,v.artifact_id artifactId,v.version,v.sha256 FROM agent_exports e JOIN versions v ON v.id=e.version_id WHERE e.export_key=?`,
          [exportKey],
        );
        if (existing) return { ...existing, reused: true };
      }
      await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [thread.project_id]);
      const sourceFile = chatUpload || options.silent;
      const generatedByTask =
        user.kind === "agent" || !!agentMessageId || (user.kind === "api" && !options.silent);
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
        if (rootKind === "project_official") fail(403, "正式文件不分版本，请通过上传或另存创建");
        if (chatUpload && !isCacheFolderKind(rootKind)) fail(403, "对话上传只能保存到对话缓存");
        if (isCacheFolderKind(rootKind) && !sourceFile) {
          if (!generatedByTask) fail(403, "对话缓存只能由对话上传产生，Agent 不能新增");
          data.folderId = (await this.dailyProjectFolder(db, thread.project_id, "outputs")).id;
        }
        if (isOutputFolderKind(rootKind) && sourceFile) fail(403, "沙箱产物只能由云端 Agent 构建");
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
        if (artifactRoot === "project_official") fail(403, "正式文件不分版本，不能提交新版本");
        if (isCacheFolderKind(artifactRoot)) {
          if (!generatedByTask) fail(403, "对话缓存是只读来源，不能提交新版本");
          artifactId = randomUUID();
          data.folderId = (await this.dailyProjectFolder(db, thread.project_id, "outputs")).id;
          if (!data.note) data.note = `基于对话缓存「${artifact.title}」修改`;
          data.title = await uniqueArtifactTitle(
            db,
            thread.project_id,
            data.folderId,
            data.title,
            null,
            data.filename,
          );
          data.filename = await uniqueVersionFilename(
            db,
            thread.project_id,
            data.folderId,
            data.filename,
          );
          await createArtifact(db, {
            id: artifactId,
            projectId: thread.project_id,
            title: data.title,
            createdBy: user.id,
            folderId: data.folderId,
          });
        } else {
          await this.assertDocumentScopeAvailable(db, thread.project_id, artifact.folder_id);
        }
      } else {
        artifactId = randomUUID();
        data.title = await uniqueArtifactTitle(
          db,
          thread.project_id,
          data.folderId || null,
          data.title,
          null,
          data.filename,
        );
        data.filename = await uniqueVersionFilename(
          db,
          thread.project_id,
          data.folderId || null,
          data.filename,
        );
        await createArtifact(db, {
          id: artifactId,
          projectId: thread.project_id,
          title: data.title,
          createdBy: user.id,
          folderId: data.folderId || null,
        });
      }
      const versionId = randomUUID();
      const version = (await nextVersionNumber(db, artifactId)) + 1;
      await createVersion(db, {
        id: versionId,
        artifactId,
        threadId,
        version,
        filename: data.filename,
        mime: data.mime,
        content: bytes,
        sha256,
        byteSize: bytes.length,
        note: data.note,
        createdBy: user.id,
      });
      if (!chatUpload) await queueDocumentMemory(db, versionId);
      await touchArtifact(db, artifactId);
      await recordDocumentChange(db, {
        projectId: thread.project_id,
        artifactId,
        versionId,
        folderId: data.folderId,
        action: sourceFile ? "cache_uploaded" : "artifact_published",
        source: user.kind === "agent" ? "agent" : user.kind === "api" ? "mcp" : "ui",
        actorType: user.kind,
        actorId: user.id,
        threadId,
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
        await query(db, "INSERT INTO agent_exports(export_key,version_id) VALUES(?,?)", [
          exportKey,
          versionId,
        ]);
      return submittedVersion(versionId, artifactId, version, sha256, data, bytes.length);
    };
    return options.db ? save(options.db) : transaction(this.db, save);
  }
  async version(user, versionId, { includeContent = true, maxBytes = 0 } = {}) {
    id.parse(versionId);
    const limit = Math.min(Math.max(0, Math.trunc(Number(maxBytes) || 0)), 1_048_576);
    const metaColumns =
      "v.id,v.artifact_id,v.thread_id,v.version,v.filename,v.mime,v.sha256,v.byte_size,v.note,v.created_by,v.created_at";
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
    const mime = /\.(html?|md|markdown|txt|css|js|json|xml|ya?ml|csv|sql|log)$/i.test(filename)
      ? "text/plain; charset=utf-8"
      : previewContentType(version.mime, filename);
    return {
      content: version.content,
      mime,
      filename,
    };
  }
  async versionPreview(user, versionId, assetPath = "", ticket = "", nonce = "") {
    const root = await this.version(user, versionId, { includeContent: !assetPath });
    const rootName = String(root.filename || "").replace(/\\/g, "/");
    if (!/\.html?$/i.test(rootName)) fail(404, "该版本不是 HTML 文档");
    if (!assetPath) {
      return {
        content: asPreviewHtml(root.content, versionId, "", user.id, ticket, nonce),
        mime: previewContentType(root.mime, rootName),
        filename: rootName,
      };
    }
    const relative = String(assetPath).replace(/\\/g, "/").replace(/^\/+/, "");
    if (!relative) fail(403, "资源路径无效");
    const dir = pathPosix.dirname(rootName);
    const resolved = pathPosix.normalize(pathPosix.join(dir === "." ? "" : dir, relative));
    if (
      !resolved ||
      resolved === ".." ||
      resolved.startsWith("../") ||
      resolved.split("/").includes("..")
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
      content: isHtml
        ? asPreviewHtml(row.content, versionId, target, user.id, ticket, nonce)
        : row.content,
      mime,
      filename: row.filename,
    };
  }
  async updateLinkedOfficialFromSource(db, user, projectId, versionId) {
    const [source] = await query(
      db,
      `SELECT v.*,a.title,a.folder_id,a.source_type,a.saved_official_artifact_id,f.folder_kind
      FROM versions v JOIN artifacts a ON a.id=v.artifact_id
      LEFT JOIN document_folders f ON f.id=a.folder_id
      WHERE v.id=? AND a.project_id=? FOR UPDATE`,
      [versionId, projectId],
    );
    if (
      !source ||
      (!isCacheFolderKind(await folderRootKind(db, source.folder_id)) &&
        !isOutputFolderKind(await folderRootKind(db, source.folder_id))) ||
      !source.saved_official_artifact_id
    )
      return null;
    const [official] = await query(
      db,
      `SELECT a.id,a.title,a.deleted_at,a.purged_at,v.id version_id
      FROM artifacts a LEFT JOIN versions v ON v.artifact_id=a.id AND v.version=1
      WHERE a.id=? AND a.project_id=? FOR UPDATE`,
      [source.saved_official_artifact_id, projectId],
    );
    if (!official || official.deleted_at || official.purged_at || !official.version_id) {
      await clearArtifactOfficialLink(db, source.artifact_id);
      if (official) await clearArtifactSourceLink(db, official.id);
      return null;
    }
    await replaceVersionContent(db, {
      id: official.version_id,
      content: source.content,
      mime: source.mime,
      sha256: source.sha256,
      byteSize: source.byte_size,
      note: `${isCacheFolderKind(await folderRootKind(db, source.folder_id)) ? "来源对话缓存" : "来源沙箱产物"} v${source.version}`,
      createdBy: source.created_by,
    });
    await touchArtifact(db, official.id);
    await recordDocumentChange(db, {
      projectId,
      artifactId: official.id,
      versionId: official.version_id,
      folderId: source.folder_id,
      action: "official_updated_from_source",
      source: user.kind === "agent" ? "agent" : "ui",
      actorType: user.kind,
      actorId: user.id,
      threadId: source.thread_id,
      details: {
        sourceArtifactId: source.artifact_id,
        sourceVersionId: versionId,
        version: source.version,
      },
    });
    return {
      id: official.version_id,
      artifactId: official.id,
      version: 1,
      title: official.title,
      updated: true,
    };
  }
  async duplicateVersionToOfficial(
    db,
    user,
    projectId,
    versionId,
    {
      threadId = null,
      note = "另存至项目正式文件",
      skipOrganizeCheck = false,
      title: givenTitle,
    } = {},
  ) {
    id.parse(versionId);
    id.parse(projectId);
    if (!skipOrganizeCheck) await this.assertOfficialOrganizing(db, projectId);
    const [source] = await query(
      db,
      `SELECT v.*,a.title,a.project_id,a.folder_id,a.saved_official_artifact_id,f.folder_kind
      FROM versions v JOIN artifacts a ON a.id=v.artifact_id LEFT JOIN document_folders f ON f.id=a.folder_id
      WHERE v.id=? AND a.project_id=?`,
      [versionId, projectId],
    );
    if (!source) fail(404, "文档版本不存在");
    const sourceRoot = await folderRootKind(db, source.folder_id);
    if (sourceRoot === "project_official")
      return { id: source.id, artifactId: source.artifact_id, reused: true };
    if (!isCacheFolderKind(sourceRoot) && !isOutputFolderKind(sourceRoot))
      fail(403, "只能从对话缓存或沙箱产物另存为正式文件");
    if (isCacheFolderKind(sourceRoot) || isOutputFolderKind(sourceRoot)) {
      const [review] = await query(
        db,
        "SELECT decision FROM reviews WHERE version_id=? ORDER BY created_at DESC,id DESC LIMIT 1",
        [versionId],
      );
      if (review?.decision !== "approved")
        fail(
          409,
          isCacheFolderKind(sourceRoot)
            ? "只有已确认的对话缓存可以另存为正式文件"
            : "只有已确认的沙箱产物版本可以另存为正式文件",
        );
    }
    if (source.saved_official_artifact_id) {
      const updated = await this.updateLinkedOfficialFromSource(db, user, projectId, versionId);
      if (updated) {
        if (givenTitle) {
          const [officialRow] = await query(
            db,
            "SELECT folder_id FROM artifacts WHERE id=? AND project_id=?",
            [updated.artifactId, projectId],
          );
          const nextTitle = await uniqueArtifactTitle(
            db,
            projectId,
            officialRow?.folder_id || null,
            givenTitle,
            updated.artifactId,
            source.filename,
          );
          await renameArtifact(db, updated.artifactId, nextTitle);
          return { ...updated, title: nextTitle };
        }
        return updated;
      }
    }
    const official = await this.documentFolder(db, projectId, "project_official");
    const copiedTitle = await uniqueArtifactTitle(
      db,
      projectId,
      official.id,
      givenTitle ||
        (isOutputFolderKind(sourceRoot)
          ? officialTitleWithVersion(source.title, source.version)
          : source.title),
      null,
      source.filename,
    );
    const copiedFilename = await uniqueVersionFilename(db, projectId, official.id, source.filename);
    const artifactId = randomUUID(),
      copiedVersionId = randomUUID();
    const sourceType = isCacheFolderKind(sourceRoot) ? "cache_saved" : "output_saved";
    await createArtifact(db, {
      id: artifactId,
      projectId,
      title: copiedTitle,
      createdBy: user.id,
      folderId: official.id,
      sourceType,
      sourceArtifactId: source.artifact_id,
    });
    await createVersion(db, {
      id: copiedVersionId,
      artifactId,
      threadId: threadId || source.thread_id || null,
      version: 1,
      filename: copiedFilename,
      mime: source.mime,
      content: source.content,
      sha256: source.sha256,
      byteSize: source.byte_size,
      note,
      createdBy: user.id,
    });
    await queueDocumentMemory(db, copiedVersionId);
    await setArtifactOfficialLink(db, artifactId, source.artifact_id);
    await recordDocumentChange(db, {
      projectId,
      artifactId,
      versionId: copiedVersionId,
      folderId: official.id,
      action: "document_saved_to_official",
      source: user.kind === "agent" ? "agent" : "ui",
      actorType: user.kind,
      actorId: user.id,
      threadId,
      details: {
        sourceVersionId: versionId,
        title: copiedTitle,
        filename: copiedFilename,
        version: 1,
      },
    });
    return { id: copiedVersionId, artifactId, version: 1, title: copiedTitle };
  }
  async saveVersionToOfficial(user, projectId, versionId, input = {}) {
    if (user.kind !== "session") fail(403, "另存项目正式文件需要人工登录");
    const data = z.object({ title: title.optional() }).parse(input || {});
    return transaction(this.db, (db) =>
      this.duplicateVersionToOfficial(db, user, projectId, versionId, { title: data.title }),
    );
  }
  async branchOutputVersion(user, projectId, versionId, input = {}) {
    if (!["session", "agent"].includes(user.kind)) fail(403, "创建文档新版需要人工登录");
    id.parse(projectId);
    id.parse(versionId);
    const data = z
      .object({ target: z.enum(["current", "new"]), title: title.optional() })
      .parse(input || {});
    return transaction(this.db, async (db) => {
      await this.member(user, projectId, true, db);
      const [source] = await query(
        db,
        `SELECT v.*,a.title,a.project_id,a.folder_id,f.folder_kind
        FROM versions v JOIN artifacts a ON a.id=v.artifact_id
        LEFT JOIN document_folders f ON f.id=a.folder_id
        LEFT JOIN version_recycle vr ON vr.version_id=v.id
        WHERE v.id=? AND a.project_id=? AND a.purged_at IS NULL AND a.deleted_at IS NULL
          AND vr.version_id IS NULL AND vr.purged_at IS NULL FOR UPDATE`,
        [versionId, projectId],
      );
      if (!source) fail(404, "文档版本不存在");
      const rootKind = await folderRootKind(db, source.folder_id);
      if (!isOutputFolderKind(rootKind)) fail(403, "只能基于沙箱产物创建新版");
      await this.assertDocumentScopeAvailable(db, projectId, source.folder_id);
      let artifactId = source.artifact_id;
      let nextTitle = source.title;
      let nextFilename = source.filename;
      let version = 1;
      if (data.target === "new") {
        nextTitle = await uniqueArtifactTitle(
          db,
          projectId,
          source.folder_id,
          data.title || source.title,
          null,
          source.filename,
        );
        nextFilename = await uniqueVersionFilename(
          db,
          projectId,
          source.folder_id,
          source.filename,
        );
        artifactId = randomUUID();
        await createArtifact(db, {
          id: artifactId,
          projectId,
          title: nextTitle,
          createdBy: user.id,
          folderId: source.folder_id,
        });
      } else {
        version = (await nextVersionNumber(db, source.artifact_id, { forUpdate: true })) + 1;
      }
      const nextVersionId = randomUUID();
      await createVersion(db, {
        id: nextVersionId,
        artifactId,
        threadId: source.thread_id || null,
        version,
        filename: nextFilename,
        mime: source.mime,
        content: source.content,
        sha256: source.sha256,
        byteSize: source.byte_size,
        note: `基于 v${source.version} 创建新版`,
        createdBy: user.id,
      });
      await touchArtifact(db, artifactId);
      await queueDocumentMemory(db, nextVersionId);
      await recordDocumentChange(db, {
        projectId,
        artifactId,
        versionId: nextVersionId,
        folderId: source.folder_id,
        action: "version_branched",
        source: user.kind === "agent" ? "agent" : "ui",
        actorType: user.kind,
        actorId: user.id,
        threadId: source.thread_id || null,
        details: {
          sourceVersionId: versionId,
          target: data.target,
          title: nextTitle,
          filename: nextFilename,
          version,
        },
      });
      return { id: nextVersionId, artifactId, version, title: nextTitle, filename: nextFilename };
    });
  }
  async copyVersionToOfficial(user, threadId, versionId, options = {}) {
    if (user.kind !== "session" && !options.agent) fail(403, "另存项目正式文件需要人工登录");
    id.parse(versionId);
    const save = async (db) => {
      const thread = await this.thread(user, threadId, !options.archive, db);
      return this.duplicateVersionToOfficial(db, user, thread.project_id, versionId, {
        threadId,
        note: "另存至项目正式文件",
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
    if (rootKind === "project_official") fail(403, "正式文件已确认，不需要审核");
    if (!isCacheFolderKind(rootKind) && !isOutputFolderKind(rootKind))
      fail(400, "只能审核对话缓存或沙箱产物");
    if (isOutputFolderKind(rootKind) && data.decision === "approved") {
      const [latest] = await query(
        this.db,
        "SELECT version FROM versions WHERE artifact_id=? ORDER BY version DESC LIMIT 1",
        [version.artifact_id],
      );
      if (latest && Number(latest.version) > Number(version.version))
        fail(409, "历史版本不能确认，请先选择当前版本");
    }
    const comment = data.comment.trim();
    if (data.decision === "changes_requested" && !comment) fail(400, "请填写需要修改的内容");
    const threadId = data.threadId || version.thread_id;
    if (!threadId) fail(400, "请在当前迭代中审核文档");
    const thread = await this.thread(user, threadId, true);
    if (thread.project_id !== version.project_id) fail(400, "只能在本项目的迭代中发送审核意见");
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
        if (isOutputFolderKind(rootKind))
          await this.updateLinkedOfficialFromSource(db, user, version.project_id, versionId);
      }
    });
    if (data.decision !== "changes_requested") return { id: reviewId };
    const mentionAgent =
      isOutputFolderKind(rootKind) ||
      !version.created_by ||
      version.created_by === user.id ||
      version.created_by === AGENT_MEMBER.id;
    let mentionName = AGENT_MEMBER.name;
    if (!mentionAgent) {
      const [author] = await query(this.db, "SELECT name FROM users WHERE id=?", [
        version.created_by,
      ]);
      mentionName = author?.name || AGENT_MEMBER.name;
    }
    const label = isCacheFolderKind(rootKind) ? "" : `v${version.version}`;
    const numbered = /(?:^|\n)\d+\.\s/.test(comment) || comment.includes("\n");
    const commentBlock = numbered ? `\n${comment}` : comment;
    const saveHint = isCacheFolderKind(rootKind)
      ? mentionAgent
        ? `${numbered ? "\n" : "。"}修改后请保存为沙箱产物，不要改对话缓存原件`
        : `${numbered ? "\n" : "。"}请让小祥帮忙改并保存为沙箱产物，或自己改完后在对话框重新上传新的对话缓存`
      : "";
    const body = `@${mentionName} 需要修改「${version.title}」${label}：${commentBlock}${saveHint}`;
    const message = await this.postMessage(user, threadId, {
      body,
      refs: [versionId],
      mentionAgent: mentionAgent || mentionName === AGENT_MEMBER.name,
    });
    return { id: reviewId, messageId: message.id };
  }
  async archive(user, threadId, input = {}) {
    if (user.kind !== "session") fail(403, "归档需要人工登录");
    const data = z
      .object({ conclusion: z.string().trim().max(20000).optional() })
      .parse(input || {});
    const conclusion = data.conclusion?.trim() || "";
    const snapshot = await transaction(this.db, async (db) => {
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
      await this.insertMessage(db, user, threadId, "迭代已归档", [], "system");
      const context = await this.context(user, threadId, db);
      const folderIds = [...new Set(context.messages.flatMap((m) => m.folder_refs || []))];
      const folderVersions = await latestVersionsByFolderRoots(db, thread.project_id, folderIds);
      const versionIds = [
        ...new Set([
          ...context.messages.flatMap((m) => m.refs),
          ...[...folderVersions.values()].flatMap((rows) => rows.map((row) => row.version_id)),
        ]),
      ];
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
        conclusion,
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
      const [existing] = await query(
        db,
        `SELECT id,status FROM agent_l1_runs
        WHERE project_id=? AND task='iteration_archive' AND thread_id=? AND status IN ('queued','running') LIMIT 1`,
        [thread.project_id, threadId],
      );
      if (!existing)
        await query(
          db,
          `INSERT INTO agent_l1_runs(id,project_id,thread_id,task,trigger_source,requested_by)
        VALUES(?,?,?,'iteration_archive','user',?)`,
          [randomUUID(), thread.project_id, threadId, user.id],
        );
      return snapshot;
    });
    publishWork(this.db);
    return snapshot;
  }
  async archivedThread(user, threadId, write = false, db = this.db) {
    id.parse(threadId);
    const [thread] = await query(
      db,
      `SELECT * FROM threads WHERE id=?${write ? " FOR UPDATE" : ""}`,
      [threadId],
    );
    if (!thread) fail(404, "迭代不存在");
    await this.member(user, thread.project_id, write, db);
    if (thread.status !== "archived") fail(409, "只能操作已归档的迭代");
    return thread;
  }
  async restoreArchivedThread(user, threadId) {
    if (user.kind !== "session") fail(403, "恢复迭代需要人工登录");
    return transaction(this.db, async (db) => {
      await this.archivedThread(user, threadId, true, db);
      await query(db, "UPDATE threads SET status='active', archived_at=NULL WHERE id=?", [threadId]);
      return { id: threadId, status: "active" };
    }).then((result) => {
      publishWork(this.db, threadId);
      return result;
    });
  }
  async deleteArchivedThread(user, threadId) {
    if (user.kind !== "session") fail(403, "删除迭代需要人工登录");
    return transaction(this.db, async (db) => {
      const thread = await this.archivedThread(user, threadId, true, db);
      const messageIds = (
        await query(db, "SELECT id FROM messages WHERE thread_id=?", [threadId])
      ).map((row) => row.id);
      if (messageIds.length) {
        const placeholders = messageIds.map(() => "?").join(",");
        await query(
          db,
          `DELETE FROM message_quotes WHERE message_id IN (${placeholders}) OR quoted_message_id IN (${placeholders})`,
          [...messageIds, ...messageIds],
        );
        await query(
          db,
          `DELETE FROM agent_live_output WHERE message_id IN (${placeholders})`,
          messageIds,
        );
        await query(
          db,
          `DELETE FROM notifications WHERE thread_id=? OR message_id IN (${placeholders})`,
          [threadId, ...messageIds],
        );
      } else {
        await query(db, "DELETE FROM notifications WHERE thread_id=?", [threadId]);
      }
      await query(db, "DELETE FROM sandbox_runs WHERE thread_id=?", [threadId]);
      await query(db, "DELETE FROM document_organization_jobs WHERE thread_id=?", [threadId]);
      const folderRows = await query(
        db,
        "SELECT id, parent_id FROM document_folders WHERE thread_id=?",
        [threadId],
      );
      const folderIds = folderRows.map((row) => row.id);
      const versionIdRows = folderIds.length
        ? await query(
            db,
            `SELECT v.id FROM versions v
             JOIN artifacts a ON a.id=v.artifact_id
             WHERE v.thread_id=? OR a.folder_id IN (${folderIds.map(() => "?").join(",")})`,
            [threadId, ...folderIds],
          )
        : await query(db, "SELECT id FROM versions WHERE thread_id=?", [threadId]);
      const versionIds = [...new Set(versionIdRows.map((row) => row.id))];
      if (versionIds.length) {
        const placeholders = versionIds.map(() => "?").join(",");
        await query(db, `DELETE FROM agent_exports WHERE version_id IN (${placeholders})`, versionIds);
        await query(db, `DELETE FROM version_recycle WHERE version_id IN (${placeholders})`, versionIds);
        await query(db, `DELETE FROM reviews WHERE version_id IN (${placeholders})`, versionIds);
        await query(db, `DELETE FROM versions WHERE id IN (${placeholders})`, versionIds);
      }
      if (folderIds.length) {
        const placeholders = folderIds.map(() => "?").join(",");
        await query(db, `DELETE FROM artifacts WHERE folder_id IN (${placeholders})`, folderIds);
        const remaining = new Set(folderIds);
        while (remaining.size) {
          const leafIds = [...remaining].filter(
            (folderId) =>
              !folderRows.some((row) => row.parent_id === folderId && remaining.has(row.id)),
          );
          if (!leafIds.length) fail(500, "无法删除迭代文件夹");
          const leafPlaceholders = leafIds.map(() => "?").join(",");
          await query(db, `DELETE FROM document_folders WHERE id IN (${leafPlaceholders})`, leafIds);
          for (const leafId of leafIds) remaining.delete(leafId);
        }
      }
      await query(db, "DELETE FROM messages WHERE thread_id=?", [threadId]);
      await query(db, "DELETE FROM threads WHERE id=?", [threadId]);
      return { id: threadId, project_id: thread.project_id };
    }).then((result) => {
      publishWork(this.db, threadId);
      return result;
    });
  }
}
