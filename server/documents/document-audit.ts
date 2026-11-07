import { randomUUID } from "node:crypto";
import { query } from "../db.ts";
import { clampLimit } from "../limits.ts";
import type { Db } from "../types.ts";

/** 变更日志的筛选条件。 */
export type DocumentChangeFilters = {
  artifactId?: string | null;
  folderId?: string | null;
  action?: string | null;
  source?: string | null;
  fileName?: string | null;
  from?: string | null;
  to?: string | null;
  before?: string | null;
  beforeId?: string | null;
};

/** 记录一次文档变更所需字段。 */
export type DocumentChangeInput = {
  projectId: string;
  artifactId?: string | null;
  versionId?: string | null;
  folderId?: string | null;
  action: string;
  source?: string;
  actorType?: string;
  actorId?: string | null;
  threadId?: string | null;
  taskId?: string | null;
  messageId?: string | null;
  details?: Record<string, unknown> | null;
};

function mysqlTimestamp(value: unknown): unknown {
  if (!value) return value;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 23).replace("T", " ");
}

function changeFilters(
  projectId: string,
  {
    artifactId,
    folderId,
    action,
    source,
    fileName,
    from,
    to,
    before,
    beforeId,
  }: DocumentChangeFilters = {},
): { values: unknown[]; where: string } {
  const values: unknown[] = [projectId];
  const filters = ["l.project_id=?"];
  if (artifactId) {
    filters.push("l.artifact_id=?");
    values.push(artifactId);
  }
  if (folderId) {
    filters.push("l.folder_id=?");
    values.push(folderId);
  }
  if (action) {
    filters.push("l.action=?");
    values.push(action);
  }
  if (source) {
    filters.push("l.source=?");
    values.push(source);
  }
  if (fileName) {
    filters.push("(l.artifact_title LIKE ? OR l.version_filename LIKE ? OR l.folder_name LIKE ?)");
    const value = `%${fileName}%`;
    values.push(value, value, value);
  }
  if (from) {
    filters.push("l.created_at>=CONCAT(?, ' 00:00:00')");
    values.push(from);
  }
  if (to) {
    filters.push("l.created_at<=CONCAT(?, ' 23:59:59.999')");
    values.push(to);
  }
  if (before) {
    const cursorTime = mysqlTimestamp(before);
    if (beforeId) {
      filters.push("(l.created_at<? OR (l.created_at=? AND l.id<?))");
      values.push(cursorTime, cursorTime, beforeId);
    } else {
      filters.push("l.created_at<?");
      values.push(cursorTime);
    }
  }
  return { values, where: filters.join(" AND ") };
}

export async function recordDocumentChange(
  db: Db,
  {
    projectId,
    artifactId = null,
    versionId = null,
    folderId = null,
    action,
    source = "system",
    actorType = "system",
    actorId = null,
    threadId = null,
    taskId = null,
    messageId = null,
    details = {},
  }: DocumentChangeInput,
): Promise<void> {
  const [snapshot] = await query<{
    actor_name?: string | null;
    artifact_title?: string | null;
    version_filename?: string | null;
    folder_name?: string | null;
    memory_artifact_id?: string | null;
  }>(
    db,
    `SELECT u.name actor_name,a.title artifact_title,v.filename version_filename,f.name folder_name,COALESCE(a.id,v.artifact_id) memory_artifact_id
    FROM (SELECT ? actor_id, ? artifact_id, ? version_id, ? folder_id) refs
    LEFT JOIN users u ON u.id=refs.actor_id
    LEFT JOIN artifacts a ON a.id=refs.artifact_id
    LEFT JOIN versions v ON v.id=refs.version_id
    LEFT JOIN document_folders f ON f.id=refs.folder_id`,
    [actorId, artifactId, versionId, folderId],
  );
  const detail = details || {};
  await query(
    db,
    `INSERT INTO document_change_logs
    (id,project_id,artifact_id,version_id,folder_id,action,source,actor_type,actor_id,thread_id,task_id,message_id,
     actor_name,artifact_title,version_filename,folder_name,details,memory_artifact_id,memory_version_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      randomUUID(),
      projectId,
      artifactId,
      versionId,
      folderId,
      action,
      source,
      actorType,
      actorId,
      threadId,
      taskId,
      messageId,
      snapshot?.actor_name || null,
      snapshot?.artifact_title || detail.title || null,
      snapshot?.version_filename || detail.filename || null,
      snapshot?.folder_name || detail.affectedFolderName || detail.folderName || null,
      JSON.stringify(detail),
      snapshot?.memory_artifact_id || artifactId,
      versionId,
    ],
  );
}

export async function countDocumentChanges(
  db: Db,
  projectId: string,
  filters: DocumentChangeFilters = {},
): Promise<number> {
  const { values, where } = changeFilters(projectId, filters);
  const rows = await query<{ total: number }>(
    db,
    `SELECT COUNT(*) total FROM document_change_logs l WHERE ${where}`,
    values,
  );
  return Number(rows[0]?.total || 0);
}

export async function listDocumentChanges(
  db: Db,
  projectId: string,
  {
    limit = 100,
    page = 1,
    ...filters
  }: DocumentChangeFilters & { limit?: number; page?: number } = {},
) {
  const { values, where } = changeFilters(projectId, filters);
  const pageSize = clampLimit(limit, 100, 1, 200);
  // OFFSET 同样只接受整数：页码向下取整，避免小数页码算出小数偏移。
  const requestedPage = Math.max(Math.trunc(Number(page) || 1), 1);
  const offset = (requestedPage - 1) * pageSize;
  const rows = await query<Record<string, unknown>>(
    db,
    `SELECT l.* FROM document_change_logs l
    WHERE ${where} ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?`,
    [...values, pageSize + 1, offset],
  );
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((row): Record<string, unknown> => ({
    ...row,
    details: typeof row.details === "string" ? JSON.parse(row.details) : row.details,
  }));
  const last = items.at(-1);
  return {
    items,
    page: {
      hasMore,
      pageSize,
      currentPage: requestedPage,
      before: last?.created_at || null,
      beforeId: last?.id || null,
    },
  };
}
