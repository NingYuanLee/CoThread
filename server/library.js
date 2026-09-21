import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import {
  folderRootKind,
  isCacheFolderKind,
  isOfficialLibraryFolder,
  isOutputFolderKind,
  LIBRARY_DATE_FOLDER_NAME,
  uniqueArtifactTitle,
} from "./project-library.js";
import { recordDocumentChange } from "./document-audit.js";

const id = z.string().uuid();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const name = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((x) => !/[\\/\x00-\x1f]/.test(x), "名称不可包含路径");

function parseRecyclePath(value) {
  if (!value) return null;
  const rows = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(rows) && rows.length ? rows : null;
}

async function folderAncestry(db, folderId) {
  const chain = [];
  let current = folderId;
  while (current) {
    const [row] = await query(db,
      "SELECT id,parent_id,name,folder_kind,system_key,thread_id FROM document_folders WHERE id=?",
      [current]);
    if (!row) break;
    chain.unshift({
      id: row.id,
      parent_id: row.parent_id,
      name: row.name,
      folder_kind: row.folder_kind,
      system_key: row.system_key,
      thread_id: row.thread_id,
    });
    current = row.parent_id;
  }
  return chain.length ? chain : null;
}

async function restoreFolderAncestry(db, projectId, chain) {
  let parentId = null;
  let lastId = null;
  for (const node of chain || []) {
    const [byId] = await query(db,
      "SELECT id FROM document_folders WHERE id=? AND project_id=?", [node.id, projectId]);
    if (byId) {
      parentId = byId.id;
      lastId = byId.id;
      continue;
    }
    if (node.system_key || (node.folder_kind && !node.parent_id)) {
      const [root] = await query(db,
        "SELECT id FROM document_folders WHERE project_id=? AND folder_kind=? AND parent_id IS NULL LIMIT 1",
        [projectId, node.folder_kind]);
      if (root) {
        parentId = root.id;
        lastId = root.id;
        continue;
      }
    }
    await query(db,
      "INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,folder_kind,system_key) VALUES(?,?,?,?,?,?,?)",
      [node.id, projectId, node.thread_id, parentId, node.name, node.folder_kind || null, node.system_key || null]);
    parentId = node.id;
    lastId = node.id;
  }
  return lastId;
}

export async function libraryChange(
  service,
  user,
  projectId,
  kind,
  target,
  input,
  options = {},
) {
  if (user.kind !== "session" && !options.tool) throw new HttpError(403, "文档整理需要人工登录");
  const data = z
    .object({
      name: name.optional(),
      parentId: id.nullable().optional(),
      folderId: id.nullable().optional(),
      threadId: id.optional(),
      deleted: z.boolean().optional(),
    })
    .parse(input);
  return transaction(service.db, async (db) => {
    await service.member(user, projectId, true, db);
    await options.authorize?.(db);
    await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [
      projectId,
    ]);
    async function folder(folderId) {
      if (!folderId) return;
      const [row] = await query(
        db,
        "SELECT * FROM document_folders WHERE id=? AND project_id=?",
        [id.parse(folderId), projectId],
      );
      if (!row) throw new HttpError(404, "文件夹不存在");
      return row;
    }
    const requireScope = async (row) => {
      if (!row) throw new HttpError(400, "请选择文档文件夹");
      const folderId = row.folder_id || row.id;
      if (folderId && await isOfficialLibraryFolder(db, folderId))
        await service.assertOfficialOrganizing(db, projectId);
      return row;
    };
    const human = user.kind === "session" && !options.tool;
    const creatingFolder = kind === "folder" && !target;
    let removedFolderName = null;
    if (kind === "version") {
      const [row] = await query(db, `SELECT v.id,a.deleted_at,a.folder_id,vr.purged_at,f.thread_id,f.folder_kind FROM versions v
        JOIN artifacts a ON a.id=v.artifact_id LEFT JOIN document_folders f ON f.id=a.folder_id
        LEFT JOIN version_recycle vr ON vr.version_id=v.id
        WHERE v.id=? AND a.project_id=? FOR UPDATE`, [id.parse(target),projectId]);
      if (!row) throw new HttpError(404,"文档版本不存在");
      await requireScope(row);
      const versionRoot = await folderRootKind(db, row.folder_id);
      if (versionRoot === "project_official" || isCacheFolderKind(versionRoot))
        throw new HttpError(403, versionRoot === "project_official"
          ? "正式文件只有一个版本，请删除整份文档"
          : "对话缓存只有一个版本，请删除整份文档");
      if (row.deleted_at) throw new HttpError(409,"请先恢复整份文档，再操作其中的版本");
      if (row.purged_at) throw new HttpError(409, "该版本已从回收站永久清除，无法恢复");
      if (data.deleted === undefined) throw new HttpError(400,"请指定删除或恢复版本");
      if (data.deleted) await query(db,"INSERT IGNORE INTO version_recycle(version_id) VALUES(?)",[target]);
      else await query(db,"DELETE FROM version_recycle WHERE version_id=?",[target]);
    } else if (kind === "artifact") {
      const [row] = await query(
        db,
        `SELECT a.id,a.title,a.folder_id,a.recycle_path,a.deleted_at,a.purged_at,f.thread_id,f.folder_kind FROM artifacts a
         LEFT JOIN document_folders f ON f.id=a.folder_id
         WHERE a.id=? AND a.project_id=? FOR UPDATE`,
        [id.parse(target), projectId],
      );
      if (!row) throw new HttpError(404, "文档不存在");
      if (data.deleted !== false || row.folder_id) await requireScope(row);
      const rowRoot = await folderRootKind(db, row.folder_id);
      if (!human && isCacheFolderKind(rowRoot) && data.folderId !== undefined)
        throw new HttpError(403, "对话缓存是来源资料，Agent 不能移动");
      if ((isCacheFolderKind(rowRoot) || isOutputFolderKind(rowRoot)) && data.folderId !== undefined)
        throw new HttpError(403, "对话缓存与沙箱产物不可移动");
      const destination = data.folderId !== undefined ? await requireScope(await folder(data.folderId)) : null;
      if (destination) {
        const destRoot = await folderRootKind(db, destination.id);
        if (human) {
          if (rowRoot !== "project_official" || destRoot !== "project_official")
            throw new HttpError(403, "人工只能在正式文件区内移动文档");
        } else if (destRoot !== rowRoot)
          throw new HttpError(409, "不能跨文档区移动，请使用“另存为正式文件”");
      }
      if (destination?.folder_kind === "iteration_root")
        throw new HttpError(403, "请选择正式文件子文件夹");
      if (data.name !== undefined) {
        const uniqueName = await uniqueArtifactTitle(db, projectId, destination?.id || row.folder_id, data.name, target);
        await query(db, "UPDATE artifacts SET title=? WHERE id=?", [
          uniqueName,
          target,
        ]);
      }
      if (data.folderId !== undefined) {
        if (data.name === undefined && destination) {
          const uniqueName = await uniqueArtifactTitle(db, projectId, destination.id, row.title, target);
          await query(db, "UPDATE artifacts SET title=? WHERE id=?", [uniqueName, target]);
        }
        await query(db, "UPDATE artifacts SET folder_id=? WHERE id=?", [
          data.folderId,
          target,
        ]);
      }
      if (data.deleted === true) {
        const path = parseRecyclePath(row.recycle_path) || await folderAncestry(db, row.folder_id);
        await query(db,
          "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3),recycle_path=? WHERE id=?",
          [path ? JSON.stringify(path) : null, target]);
      } else if (data.deleted === false) {
        if (row.purged_at) throw new HttpError(409, "该文档已从回收站永久清除，无法恢复");
        let folderId = row.folder_id;
        if (folderId) {
          const [exists] = await query(db,
            "SELECT id FROM document_folders WHERE id=? AND project_id=?", [folderId, projectId]);
          if (!exists) folderId = null;
        }
        if (!folderId)
          folderId = await restoreFolderAncestry(db, projectId, parseRecyclePath(row.recycle_path));
        if (!folderId) {
          const [official] = await query(db,
            "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
            [projectId]);
          folderId = official?.id || null;
        }
        if (folderId) await requireScope({ folder_id: folderId });
        const restoredTitle = await uniqueArtifactTitle(db, projectId, folderId, row.title, target);
        await query(db,
          "UPDATE artifacts SET deleted_at=NULL,recycle_path=NULL,folder_id=?,title=? WHERE id=?",
          [folderId, restoredTitle, target]);
      }
    } else {
      const current = target ? await requireScope(await folder(target)) : null;
      if (kind === "remove-folder") removedFolderName = current?.name || null;
      if (target && current?.system_key)
        throw new HttpError(403, "系统文件夹不能重命名、移动或删除");
      const destination = data.parentId ? await requireScope(await folder(data.parentId)) : null;
      const currentRoot = current ? await folderRootKind(db, current.id) : null;
      const destinationRoot = destination ? await folderRootKind(db, destination.id) : null;
      if (human) {
        const areaRoot = destinationRoot || currentRoot;
        if (areaRoot !== "project_official")
          throw new HttpError(403, "人工只能在正式文件区管理子文件夹");
      } else if (isCacheFolderKind(currentRoot) || isCacheFolderKind(destinationRoot)
        || isOutputFolderKind(currentRoot) || isOutputFolderKind(destinationRoot))
        throw new HttpError(403, "对话缓存与沙箱产物目录不可由 Agent 修改");
      else if (destinationRoot && destinationRoot !== "project_official")
        throw new HttpError(403, "只能在正式文件区内创建子文件夹");
      if (kind === "remove-folder") {
        if (human && currentRoot === "project_official") {
          const subtree = await query(db, `WITH RECURSIVE subtree AS (
              SELECT id, 0 depth FROM document_folders WHERE id=?
              UNION ALL
              SELECT f.id, s.depth + 1 FROM document_folders f JOIN subtree s ON f.parent_id = s.id
            )
            SELECT id FROM subtree ORDER BY depth DESC`, [target]);
          const ids = subtree.map((row) => row.id);
          if (ids.length) {
            const placeholders = ids.map(() => "?").join(",");
            const artifacts = await query(db,
              `SELECT id,folder_id,recycle_path FROM artifacts WHERE folder_id IN (${placeholders})`, ids);
            for (const artifact of artifacts) {
              const path = parseRecyclePath(artifact.recycle_path) || await folderAncestry(db, artifact.folder_id);
              await query(db,
                `UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3),recycle_path=?,folder_id=NULL WHERE id=?`,
                [path ? JSON.stringify(path) : null, artifact.id]);
            }
            await query(db, `DELETE FROM document_folders WHERE id IN (${placeholders})`, ids);
          }
        } else {
          const [children] = await query(
            db,
            "SELECT (SELECT COUNT(*) FROM document_folders WHERE parent_id=?)+(SELECT COUNT(*) FROM artifacts WHERE folder_id=? AND deleted_at IS NULL) count",
            [target, target],
          );
          if (Number(children.count))
            throw new HttpError(409, "请先移出或删除文件夹中的内容");
          await query(
            db,
            "UPDATE artifacts SET folder_id=NULL WHERE folder_id=?",
            [target],
          );
          await query(db, "DELETE FROM document_folders WHERE id=?", [target]);
        }
      } else {
        if (data.parentId !== undefined && target) {
          let ancestor = data.parentId;
          while (ancestor) {
            if (ancestor === target)
              throw new HttpError(409, "不能移入自身或子文件夹");
            ancestor = (await folder(ancestor)).parent_id;
          }
        }
        let parent =
          data.parentId === undefined
            ? current?.parent_id || null
            : data.parentId;
        if (!target && parent === null) {
          const [official] = await query(db,
            "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND thread_id IS NULL LIMIT 1",
            [projectId]);
          parent = official?.id ?? null;
        }
        const folderName = data.name || current?.name;
        if (!folderName) throw new HttpError(400, "请输入文件夹名称");
        const officialArea = destinationRoot === "project_official" || currentRoot === "project_official";
        if (officialArea && LIBRARY_DATE_FOLDER_NAME.test(folderName))
          throw new HttpError(400, "日期文件夹属于缓存/产物区，正式文件请使用主题名称");
        if (target)
          await query(
            db,
            "UPDATE document_folders SET name=?,parent_id=? WHERE id=?",
            [folderName, parent, target],
          );
        else {
          target = randomUUID();
          await query(
            db,
            "INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,folder_kind) VALUES(?,?,?,?,?,?)",
            [target, projectId, null, parent, folderName, null],
          );
        }
      }
    }
    const source = options.source || (user.kind === "api" ? "mcp" : user.kind === "agent" ? "agent" : "ui");
    const action = kind === "version"
      ? (data.deleted ? "version_deleted" : "version_restored")
      : kind === "artifact"
        ? (data.deleted === true ? "document_deleted" : data.deleted === false ? "document_restored" : data.name !== undefined ? "document_renamed" : "document_moved")
        : kind === "remove-folder" ? "folder_deleted" : creatingFolder ? "folder_created" : data.name !== undefined ? "folder_renamed" : "folder_moved";
    await recordDocumentChange(db, {
      projectId, artifactId: kind === "artifact" ? target : null, versionId: kind === "version" ? target : null,
      folderId: kind === "folder" ? target : null,
      action, source, actorType: user.kind, actorId: user.id, threadId: data.threadId,
      details: { kind, action, input: data, affectedFolderId: kind === "remove-folder" ? target : null, affectedFolderName: removedFolderName },
    });
    return { id: target, ok: true };
  });
}

function collectUuids(value, into, depth = 0) {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") {
    if (UUID.test(value)) into.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUuids(item, into, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectUuids(item, into, depth + 1);
  }
}

function parseJsonColumn(value) {
  if (value == null || value === "") return value;
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function referencedVersionIds(db, projectId) {
  const ids = new Set();
  const messages = await query(db,
    `SELECT m.refs FROM messages m JOIN threads t ON t.id=m.thread_id
     WHERE t.project_id=? AND m.refs IS NOT NULL`, [projectId]);
  for (const row of messages) collectUuids(parseJsonColumn(row.refs), ids);
  const tasks = await query(db,
    "SELECT artifact_refs,document_refs FROM agent_tasks WHERE project_id=?", [projectId]);
  for (const row of tasks) {
    collectUuids(parseJsonColumn(row.artifact_refs), ids);
    collectUuids(parseJsonColumn(row.document_refs), ids);
  }
  const linked = await query(db,
    `SELECT atd.version_id FROM agent_task_documents atd
     JOIN messages m ON m.id=atd.message_id JOIN threads t ON t.id=m.thread_id
     WHERE t.project_id=?`, [projectId]);
  for (const row of linked) if (row.version_id) ids.add(row.version_id);
  const archives = await query(db,
    "SELECT archive_snapshot FROM threads WHERE project_id=? AND archive_snapshot IS NOT NULL",
    [projectId]);
  for (const row of archives) collectUuids(parseJsonColumn(row.archive_snapshot), ids);
  return ids;
}

async function deleteVersions(db, versionIds) {
  if (!versionIds.length) return;
  const placeholders = versionIds.map(() => "?").join(",");
  await query(db, `DELETE FROM version_recycle WHERE version_id IN (${placeholders})`, versionIds);
  await query(db, `DELETE FROM reviews WHERE version_id IN (${placeholders})`, versionIds);
  await query(db, `DELETE FROM versions WHERE id IN (${placeholders})`, versionIds);
}

export async function emptyLibraryRecycle(service, user, projectId) {
  if (user.kind !== "session") throw new HttpError(403, "清空回收站需要人工登录");
  id.parse(projectId);
  return transaction(service.db, async (db) => {
    await service.member(user, projectId, true, db);
    await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [projectId]);
    const referenced = await referencedVersionIds(db, projectId);
    const recycledArtifacts = await query(db,
      `SELECT id FROM artifacts WHERE project_id=? AND deleted_at IS NOT NULL AND purged_at IS NULL FOR UPDATE`,
      [projectId]);
    const recycledVersions = await query(db,
      `SELECT v.id,v.artifact_id FROM versions v JOIN artifacts a ON a.id=v.artifact_id
       JOIN version_recycle vr ON vr.version_id=v.id
       WHERE a.project_id=? AND a.deleted_at IS NULL AND vr.purged_at IS NULL FOR UPDATE`,
      [projectId]);
    let removedArtifacts = 0;
    let purgedArtifacts = 0;
    let removedVersions = 0;
    let purgedVersions = 0;
    for (const artifact of recycledArtifacts) {
      const versions = await query(db, "SELECT id FROM versions WHERE artifact_id=?", [artifact.id]);
      const versionIds = versions.map((row) => row.id);
      const keep = versionIds.some((versionId) => referenced.has(versionId));
      if (keep) {
        await query(db, "UPDATE artifacts SET purged_at=UTC_TIMESTAMP(3) WHERE id=?", [artifact.id]);
        if (versionIds.length) {
          const placeholders = versionIds.map(() => "?").join(",");
          await query(db,
            `UPDATE version_recycle SET purged_at=UTC_TIMESTAMP(3) WHERE version_id IN (${placeholders}) AND purged_at IS NULL`,
            versionIds);
        }
        purgedArtifacts += 1;
        purgedVersions += versionIds.length;
      } else {
        await deleteVersions(db, versionIds);
        await query(db, "DELETE FROM artifacts WHERE id=?", [artifact.id]);
        removedArtifacts += 1;
        removedVersions += versionIds.length;
      }
    }
    for (const version of recycledVersions) {
      if (referenced.has(version.id)) {
        await query(db, "UPDATE version_recycle SET purged_at=UTC_TIMESTAMP(3) WHERE version_id=? AND purged_at IS NULL",
          [version.id]);
        purgedVersions += 1;
      } else {
        await deleteVersions(db, [version.id]);
        removedVersions += 1;
      }
    }
    if (removedArtifacts || purgedArtifacts || removedVersions || purgedVersions)
      await recordDocumentChange(db, {
        projectId, action: "recycle_emptied", source: "ui", actorType: user.kind, actorId: user.id,
        details: { removedArtifacts, purgedArtifacts, removedVersions, purgedVersions },
      });
    return {
      ok: true,
      removed: { artifacts: removedArtifacts, versions: removedVersions },
      retained: { artifacts: purgedArtifacts, versions: purgedVersions },
    };
  });
}
