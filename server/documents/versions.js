/**
 * artifacts / versions 的最小写入 API。
 *
 * 内核之外（含 `server/service.js`）不得再直接拼这些表的 INSERT/UPDATE，
 * 一律经本模块。每条函数只做一件事，SQL 与本模块建立前的写法逐字等价。
 *
 * 说明：`artifacts` 的 folder_id / source_type / source_artifact_id /
 * saved_official_artifact_id / deleted_at / recycle_path / purged_at 全部
 * 可空且默认 NULL（见 005/057/080/086 迁移），因此统一插入全部列、
 * 未提供的写 NULL，与旧代码「省略该列」的结果一致。
 */
import { randomUUID } from "node:crypto";
import { query } from "../db.js";

export async function createArtifact(
  db,
  {
    id = randomUUID(),
    projectId,
    title,
    createdBy,
    folderId = null,
    sourceType = null,
    sourceArtifactId = null,
    savedOfficialArtifactId = null,
  },
) {
  await query(
    db,
    `INSERT INTO artifacts(id,project_id,title,created_by,folder_id,source_type,source_artifact_id,saved_official_artifact_id)
     VALUES(?,?,?,?,?,?,?,?)`,
    [id, projectId, title, createdBy, folderId, sourceType, sourceArtifactId, savedOfficialArtifactId],
  );
  return id;
}

export async function createVersion(
  db,
  { id = randomUUID(), artifactId, version, threadId = null, filename, mime, content, sha256, byteSize, note = null, createdBy },
) {
  await query(
    db,
    `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [id, artifactId, threadId, version, filename, mime, content, sha256, byteSize, note, createdBy],
  );
  return id;
}

/** 下一个版本号：`COALESCE(MAX(version),0)`。调用方自行 +1。 */
export async function nextVersionNumber(db, artifactId, { forUpdate = false } = {}) {
  const [row] = await query(
    db,
    `SELECT COALESCE(MAX(version),0) version FROM versions WHERE artifact_id=?${forUpdate ? " FOR UPDATE" : ""}`,
    [artifactId],
  );
  return Number(row?.version || 0);
}

export async function touchArtifact(db, artifactId) {
  await query(db, "UPDATE artifacts SET updated_at=UTC_TIMESTAMP(3) WHERE id=?", [artifactId]);
}

export async function renameArtifact(db, artifactId, title) {
  await query(db, "UPDATE artifacts SET title=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?", [title, artifactId]);
}

/** 同时改标题与所在文件夹（文档整理用）。 */
export async function placeArtifact(db, artifactId, { title, folderId }) {
  await query(db, "UPDATE artifacts SET title=?,folder_id=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?", [
    title,
    folderId,
    artifactId,
  ]);
}

export async function replaceVersionContent(db, { id, content, mime, sha256, byteSize, note, createdBy }) {
  await query(
    db,
    `UPDATE versions SET content=?,mime=?,sha256=?,byte_size=?,note=?,created_by=? WHERE id=?`,
    [content, mime, sha256, byteSize, note, createdBy, id],
  );
}

export async function setArtifactOfficialLink(db, artifactId, officialArtifactId) {
  await query(db, "UPDATE artifacts SET saved_official_artifact_id=? WHERE id=?", [officialArtifactId, artifactId]);
}

export async function clearArtifactOfficialLink(db, artifactId) {
  await query(db, "UPDATE artifacts SET saved_official_artifact_id=NULL WHERE id=?", [artifactId]);
}

export async function clearArtifactSourceLink(db, artifactId) {
  await query(db, "UPDATE artifacts SET source_artifact_id=NULL WHERE id=?", [artifactId]);
}

export async function createFolder(
  db,
  { id = randomUUID(), projectId, threadId = null, parentId = null, name, systemKey = null, folderKind = null },
) {
  await query(
    db,
    `INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,system_key,folder_kind)
     VALUES(?,?,?,?,?,?,?)`,
    [id, projectId, threadId, parentId, name, systemKey, folderKind],
  );
  return id;
}

export async function renameFolder(db, folderId, name) {
  await query(db, "UPDATE document_folders SET name=? WHERE id=?", [name, folderId]);
}

/** 仅当文件夹仍叫 `fromName` 时改名，用于一次性数据迁移。 */
export async function renameFolderIfNamed(db, folderId, fromName, toName) {
  await query(db, "UPDATE document_folders SET name=? WHERE id=? AND name=?", [toName, folderId, fromName]);
}

export async function moveFolder(db, folderId, parentId) {
  await query(db, "UPDATE document_folders SET parent_id=? WHERE id=?", [parentId, folderId]);
}

export async function deleteFolder(db, folderId) {
  await query(db, "DELETE FROM document_folders WHERE id=?", [folderId]);
}

/**
 * 把文档挂到目标文件夹。`softDeleteOnConflict` 用于同名合并：冲突的副本软删除，
 * 版本历史仍可从回收站恢复。
 */
export async function setArtifactFolder(db, artifactId, folderId, { softDeleteOnConflict = false } = {}) {
  await query(
    db,
    `UPDATE artifacts SET folder_id=?${softDeleteOnConflict ? ",deleted_at=COALESCE(deleted_at,UTC_TIMESTAMP(3))" : ""} WHERE id=?`,
    [folderId, artifactId],
  );
}
