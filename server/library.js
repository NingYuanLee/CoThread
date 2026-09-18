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

const id = z.string().uuid();
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
    if (kind === "version") {
      const [row] = await query(db, `SELECT v.id,a.deleted_at,a.folder_id,f.thread_id,f.folder_kind FROM versions v
        JOIN artifacts a ON a.id=v.artifact_id LEFT JOIN document_folders f ON f.id=a.folder_id
        WHERE v.id=? AND a.project_id=? FOR UPDATE`, [id.parse(target),projectId]);
      if (!row) throw new HttpError(404,"文档版本不存在");
      await requireScope(row);
      const versionRoot = await folderRootKind(db, row.folder_id);
      if (versionRoot === "project_official" || isCacheFolderKind(versionRoot))
        throw new HttpError(403, versionRoot === "project_official"
          ? "正式文件只有一个版本，请删除整份文档"
          : "缓存文件只有一个版本，请删除整份文档");
      if (row.deleted_at) throw new HttpError(409,"请先恢复整份文档，再操作其中的版本");
      if (data.deleted === undefined) throw new HttpError(400,"请指定删除或恢复版本");
      if (data.deleted) await query(db,"INSERT IGNORE INTO version_recycle(version_id) VALUES(?)",[target]);
      else await query(db,"DELETE FROM version_recycle WHERE version_id=?",[target]);
    } else if (kind === "artifact") {
      const [row] = await query(
        db,
        `SELECT a.id,a.title,a.folder_id,a.recycle_path,a.deleted_at,f.thread_id,f.folder_kind FROM artifacts a
         LEFT JOIN document_folders f ON f.id=a.folder_id
         WHERE a.id=? AND a.project_id=? FOR UPDATE`,
        [id.parse(target), projectId],
      );
      if (!row) throw new HttpError(404, "文档不存在");
      if (data.deleted !== false || row.folder_id) await requireScope(row);
      const rowRoot = await folderRootKind(db, row.folder_id);
      if (!human && isCacheFolderKind(rowRoot) && data.folderId !== undefined)
        throw new HttpError(403, "缓存文件是来源资料，Agent 不能移动");
      if ((isCacheFolderKind(rowRoot) || isOutputFolderKind(rowRoot)) && data.folderId !== undefined)
        throw new HttpError(403, "缓存文件与产物文件不可移动");
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
        throw new HttpError(403, "缓存文件与产物文件目录不可由 Agent 修改");
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
    return { id: target, ok: true };
  });
}
