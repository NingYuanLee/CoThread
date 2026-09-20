import { randomUUID } from "node:crypto";
import { query } from "./db.js";

function mysqlTimestamp(value) {
  if (!value) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 23).replace("T", " ");
}

function changeFilters(projectId, {
  artifactId, folderId, action, source, fileName, from, to, before, beforeId,
} = {}) {
  const values = [projectId];
  const filters = ["l.project_id=?"];
  if (artifactId) { filters.push("l.artifact_id=?"); values.push(artifactId); }
  if (folderId) { filters.push("l.folder_id=?"); values.push(folderId); }
  if (action) { filters.push("l.action=?"); values.push(action); }
  if (source) { filters.push("l.source=?"); values.push(source); }
  if (fileName) {
    filters.push("(l.artifact_title LIKE ? OR l.version_filename LIKE ? OR l.folder_name LIKE ?)");
    const value = `%${fileName}%`;
    values.push(value, value, value);
  }
  if (from) { filters.push("l.created_at>=CONCAT(?, ' 00:00:00')"); values.push(from); }
  if (to) { filters.push("l.created_at<=CONCAT(?, ' 23:59:59.999')"); values.push(to); }
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

export async function recordDocumentChange(db, {
  projectId, artifactId = null, versionId = null, folderId = null,
  action, source = "system", actorType = "system", actorId = null,
  threadId = null, taskId = null, messageId = null, details = {},
}) {
  const [snapshot] = await query(db, `SELECT u.name actor_name,a.title artifact_title,v.filename version_filename,f.name folder_name
    FROM (SELECT ? actor_id, ? artifact_id, ? version_id, ? folder_id) refs
    LEFT JOIN users u ON u.id=refs.actor_id
    LEFT JOIN artifacts a ON a.id=refs.artifact_id
    LEFT JOIN versions v ON v.id=refs.version_id
    LEFT JOIN document_folders f ON f.id=refs.folder_id`, [actorId, artifactId, versionId, folderId]);
  const detail = details || {};
  await query(db, `INSERT INTO document_change_logs
    (id,project_id,artifact_id,version_id,folder_id,action,source,actor_type,actor_id,thread_id,task_id,message_id,
     actor_name,artifact_title,version_filename,folder_name,details)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [randomUUID(), projectId, artifactId, versionId, folderId, action, source, actorType, actorId,
    threadId, taskId, messageId,
    snapshot?.actor_name || null,
    snapshot?.artifact_title || detail.title || null,
    snapshot?.version_filename || detail.filename || null,
    snapshot?.folder_name || detail.affectedFolderName || detail.folderName || null,
    JSON.stringify(detail)]);
}

export async function countDocumentChanges(db, projectId, filters = {}) {
  const { values, where } = changeFilters(projectId, filters);
  const rows = await query(db, `SELECT COUNT(*) total FROM document_change_logs l WHERE ${where}`, values);
  return Number(rows[0]?.total || 0);
}

export async function listDocumentChanges(db, projectId, {
  limit = 100, page = 1, ...filters
} = {}) {
  const { values, where } = changeFilters(projectId, filters);
  const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const requestedPage = Math.max(Number(page) || 1, 1);
  const offset = (requestedPage - 1) * pageSize;
  const rows = await query(db, `SELECT l.* FROM document_change_logs l
    WHERE ${where} ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?`, [...values, pageSize + 1, offset]);
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((row) => ({ ...row, details: typeof row.details === "string" ? JSON.parse(row.details) : row.details }));
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
