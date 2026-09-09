import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";

const id = z.string().uuid();
const name = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((x) => !/[\\/\x00-\x1f]/.test(x), "名称不可包含路径");
export async function libraryChange(
  service,
  user,
  projectId,
  kind,
  target,
  input,
) {
  if (user.kind !== "session") throw new HttpError(403, "文档整理需要人工登录");
  const data = z
    .object({
      name: name.optional(),
      parentId: id.nullable().optional(),
      folderId: id.nullable().optional(),
      deleted: z.boolean().optional(),
    })
    .parse(input);
  return transaction(service.db, async (db) => {
    await service.member(user, projectId, true, db);
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
    if (kind === "version") {
      const [row] = await query(db, "SELECT v.id,a.deleted_at FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.id=? AND a.project_id=? FOR UPDATE", [id.parse(target),projectId]);
      if (!row) throw new HttpError(404,"文档版本不存在");
      if (row.deleted_at) throw new HttpError(409,"请先恢复整份文档，再操作其中的版本");
      if (data.deleted === undefined) throw new HttpError(400,"请指定删除或恢复版本");
      if (data.deleted) await query(db,"INSERT IGNORE INTO version_recycle(version_id) VALUES(?)",[target]);
      else await query(db,"DELETE FROM version_recycle WHERE version_id=?",[target]);
    } else if (kind === "artifact") {
      const [row] = await query(
        db,
        "SELECT id FROM artifacts WHERE id=? AND project_id=? FOR UPDATE",
        [id.parse(target), projectId],
      );
      if (!row) throw new HttpError(404, "文档不存在");
      if ((await folder(data.folderId))?.system_key)
        throw new HttpError(403, "不能移入对话临时文件");
      if (data.name !== undefined)
        await query(db, "UPDATE artifacts SET title=? WHERE id=?", [
          data.name,
          target,
        ]);
      if (data.folderId !== undefined)
        await query(db, "UPDATE artifacts SET folder_id=? WHERE id=?", [
          data.folderId,
          target,
        ]);
      if (data.deleted !== undefined)
        await query(
          db,
          `UPDATE artifacts SET deleted_at=${data.deleted ? "UTC_TIMESTAMP(3)" : "NULL"} WHERE id=?`,
          [target],
        );
    } else {
      if (target && (await folder(target))?.system_key)
        throw new HttpError(403, "系统文件夹不能重命名、移动或删除");
      if ((await folder(data.parentId))?.system_key)
        throw new HttpError(403, "不能在对话临时文件中创建或移入文件夹");
      if (kind === "remove-folder") {
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
      } else {
        if (data.parentId !== undefined && target) {
          let ancestor = data.parentId;
          while (ancestor) {
            if (ancestor === target)
              throw new HttpError(409, "不能移入自身或子文件夹");
            ancestor = (await folder(ancestor)).parent_id;
          }
        }
        const current = target ? await folder(target) : null;
        const parent =
          data.parentId === undefined
            ? current?.parent_id || null
            : data.parentId;
        const folderName = data.name || current?.name;
        if (!folderName) throw new HttpError(400, "请输入文件夹名称");
        const [duplicate] = await query(
          db,
          "SELECT id FROM document_folders WHERE project_id=? AND parent_id <=> ? AND name=? AND id<>?",
          [projectId, parent, folderName, target || ""],
        );
        if (duplicate) throw new HttpError(409, "同级已有同名文件夹");
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
            "INSERT INTO document_folders(id,project_id,parent_id,name) VALUES(?,?,?,?)",
            [target, projectId, parent, folderName],
          );
        }
      }
    }
    return { id: target, ok: true };
  });
}
