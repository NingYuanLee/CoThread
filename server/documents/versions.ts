/**
 * artifacts / versions 的最小写入 API。
 *
 * 内核之外（含 `server/service.ts`）不得再直接拼这些表的 INSERT/UPDATE，
 * 一律经本模块。每条函数只做一件事，SQL 与本模块建立前的写法逐字等价。
 *
 * 说明：`artifacts` 的 folder_id / source_type / source_artifact_id /
 * saved_official_artifact_id / deleted_at / recycle_path / purged_at 全部
 * 可空且默认 NULL（见 005/057/080/086 迁移），因此统一插入全部列、
 * 未提供的写 NULL，与旧代码「省略该列」的结果一致。
 */
import { randomUUID } from "node:crypto";
import { query, transaction } from "../db.ts";
import { recordDocumentChange } from "./document-audit.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "../types.ts";

/** 新建 artifact 的入参。 */
export type CreateArtifactInput = {
  id?: string;
  projectId: string;
  title: unknown;
  createdBy: string | null;
  folderId?: string | null;
  sourceType?: string | null;
  sourceArtifactId?: string | null;
  savedOfficialArtifactId?: string | null;
};

/** 新建 version 的入参。 */
export type CreateVersionInput = {
  id?: string;
  artifactId: string;
  version: unknown;
  threadId?: string | null;
  filename: unknown;
  mime: unknown;
  content: unknown;
  sha256: unknown;
  byteSize: unknown;
  note?: string | null;
  createdBy: string | null;
};

/** 替换版本内容的入参。 */
export type ReplaceVersionInput = {
  id: string;
  content: unknown;
  mime: unknown;
  sha256: unknown;
  byteSize: unknown;
  note?: string | null;
  createdBy: string | null;
};

/** 新建文件夹的入参。 */
export type CreateFolderInput = {
  id?: string;
  projectId: string;
  threadId?: string | null;
  parentId?: string | null;
  name: unknown;
  systemKey?: string | null;
  folderKind?: string | null;
};

export async function createArtifact(
  db: Db,
  {
    id = randomUUID(),
    projectId,
    title,
    createdBy,
    folderId = null,
    sourceType = null,
    sourceArtifactId = null,
    savedOfficialArtifactId = null,
  }: CreateArtifactInput,
): Promise<string> {
  await query(
    db,
    `INSERT INTO artifacts(id,project_id,title,created_by,folder_id,source_type,source_artifact_id,saved_official_artifact_id)
     VALUES(?,?,?,?,?,?,?,?)`,
    [
      id,
      projectId,
      title,
      createdBy,
      folderId,
      sourceType,
      sourceArtifactId,
      savedOfficialArtifactId,
    ],
  );
  return id;
}

export async function createVersion(db: Db, input: CreateVersionInput): Promise<string> {
  const {
    id = randomUUID(),
    artifactId,
    version,
    threadId = null,
    filename,
    mime,
    content,
    sha256,
    byteSize,
    note = null,
    createdBy,
  } = input;
  if (typeof (db as Pool).getConnection === "function") {
    return transaction(db as Pool, (conn) =>
      createVersion(conn, {
        id,
        artifactId,
        version,
        threadId,
        filename,
        mime,
        content,
        sha256,
        byteSize,
        note,
        createdBy,
      }),
    );
  }
  await query(
    db,
    `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [id, artifactId, threadId, version, filename, mime, content, sha256, byteSize, note, createdBy],
  );
  {
    // 正式文件的根目录和子目录都可能产生项目进程候选。
    const [signalArtifact] = await query<{
      project_id?: string | null;
      folder_id?: string | null;
    }>(
      db,
      `SELECT a.project_id,a.folder_id,f.folder_kind FROM artifacts a
       LEFT JOIN document_folders f ON f.id=a.folder_id WHERE a.id=?`,
      [artifactId],
    );
    if (signalArtifact?.project_id) {
      await recordDocumentChange(db, {
        projectId: signalArtifact.project_id,
        artifactId,
        versionId: id,
        folderId: signalArtifact.folder_id,
        action: "version_created",
        source: "system",
        actorId: createdBy,
        threadId,
        details: { filename, version },
      });
    }
    // 正式文件新版本已记录在 document_change_logs；项目进程信号由扫描器按游标生成。
  }
  return id;
}

/** 下一个版本号：`COALESCE(MAX(version),0)`。调用方自行 +1。 */
export async function nextVersionNumber(
  db: Db,
  artifactId: string,
  { forUpdate = false }: { forUpdate?: boolean } = {},
): Promise<number> {
  const [row] = await query<{ version?: unknown }>(
    db,
    `SELECT COALESCE(MAX(version),0) version FROM versions WHERE artifact_id=?${forUpdate ? " FOR UPDATE" : ""}`,
    [artifactId],
  );
  return Number(row?.version || 0);
}

export async function touchArtifact(db: Db, artifactId: string): Promise<void> {
  await query(db, "UPDATE artifacts SET updated_at=UTC_TIMESTAMP(3) WHERE id=?", [artifactId]);
}

export async function renameArtifact(db: Db, artifactId: string, title: unknown): Promise<void> {
  await query(db, "UPDATE artifacts SET title=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?", [
    title,
    artifactId,
  ]);
}

/** 同时改标题与所在文件夹（文档整理用）。 */
export async function placeArtifact(
  db: Db,
  artifactId: string,
  { title, folderId }: { title: unknown; folderId?: string | null },
): Promise<void> {
  await query(
    db,
    "UPDATE artifacts SET title=?,folder_id=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?",
    [title, folderId, artifactId],
  );
}

export async function replaceVersionContent(db: Db, input: ReplaceVersionInput): Promise<void> {
  const { id, content, mime, sha256, byteSize, note, createdBy } = input;
  if (typeof (db as Pool).getConnection === "function") {
    return transaction(db as Pool, (conn) =>
      replaceVersionContent(conn, { id, content, mime, sha256, byteSize, note, createdBy }),
    );
  }
  const [previous] = await query<{
    sha256?: unknown;
    mime?: unknown;
    artifactId: string;
    projectId: string;
  }>(
    db,
    `SELECT v.sha256,v.mime,v.artifact_id artifactId,a.project_id projectId
    FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.id=? FOR UPDATE`,
    [id],
  );
  if (!previous) return;
  await query(
    db,
    `UPDATE versions SET content=?,mime=?,sha256=?,byte_size=?,note=?,created_by=? WHERE id=?`,
    [content, mime, sha256, byteSize, note, createdBy, id],
  );
  if (previous.sha256 === sha256 && previous.mime === mime) return;
  await recordDocumentChange(db, {
    projectId: previous.projectId,
    artifactId: previous.artifactId,
    versionId: id,
    action: "version_content_replaced",
    source: "system",
    actorId: createdBy,
  });
  // 内容替换已记录在 document_change_logs；项目进程信号由扫描器按游标生成。
}

export async function setArtifactOfficialLink(
  db: Db,
  artifactId: string,
  officialArtifactId: string | null,
): Promise<void> {
  await query(db, "UPDATE artifacts SET saved_official_artifact_id=? WHERE id=?", [
    officialArtifactId,
    artifactId,
  ]);
}

export async function clearArtifactOfficialLink(db: Db, artifactId: string): Promise<void> {
  await query(db, "UPDATE artifacts SET saved_official_artifact_id=NULL WHERE id=?", [artifactId]);
}

export async function clearArtifactSourceLink(db: Db, artifactId: string): Promise<void> {
  await query(db, "UPDATE artifacts SET source_artifact_id=NULL WHERE id=?", [artifactId]);
}

export async function createFolder(
  db: Db,
  {
    id = randomUUID(),
    projectId,
    threadId = null,
    parentId = null,
    name,
    systemKey = null,
    folderKind = null,
  }: CreateFolderInput,
): Promise<string> {
  await query(
    db,
    `INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,system_key,folder_kind)
     VALUES(?,?,?,?,?,?,?)`,
    [id, projectId, threadId, parentId, name, systemKey, folderKind],
  );
  return id;
}

export async function renameFolder(db: Db, folderId: string, name: unknown): Promise<void> {
  await query(db, "UPDATE document_folders SET name=? WHERE id=?", [name, folderId]);
}

/** 仅当文件夹仍叫 `fromName` 时改名，用于一次性数据迁移。 */
export async function renameFolderIfNamed(
  db: Db,
  folderId: string,
  fromName: unknown,
  toName: unknown,
): Promise<void> {
  await query(db, "UPDATE document_folders SET name=? WHERE id=? AND name=?", [
    toName,
    folderId,
    fromName,
  ]);
}

export async function moveFolder(db: Db, folderId: string, parentId: string | null): Promise<void> {
  await query(db, "UPDATE document_folders SET parent_id=? WHERE id=?", [parentId, folderId]);
}

export async function deleteFolder(db: Db, folderId: string): Promise<void> {
  await query(db, "DELETE FROM document_folders WHERE id=?", [folderId]);
}

/**
 * 把文档挂到目标文件夹。`softDeleteOnConflict` 用于同名合并：冲突的副本软删除，
 * 版本历史仍可从回收站恢复。
 */
export async function setArtifactFolder(
  db: Db,
  artifactId: string,
  folderId: string | null,
  { softDeleteOnConflict = false }: { softDeleteOnConflict?: boolean } = {},
): Promise<void> {
  await query(
    db,
    `UPDATE artifacts SET folder_id=?${softDeleteOnConflict ? ",deleted_at=COALESCE(deleted_at,UTC_TIMESTAMP(3))" : ""} WHERE id=?`,
    [folderId, artifactId],
  );
  if (softDeleteOnConflict) {
    // 同名合并会把冲突副本软删除；它的文档信号同样不可核验，一并清掉。
    const { dropDocumentVersionSignals } = await import("../project-memory.ts");
    await dropDocumentVersionSignals(db, {
      artifactIds: [artifactId],
    } as unknown as Parameters<typeof dropDocumentVersionSignals>[1]);
  }
}
