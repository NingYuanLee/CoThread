import { randomUUID } from "node:crypto";
import { query } from "./db.js";

export async function recordDocumentChange(db, {
  projectId, artifactId = null, versionId = null, folderId = null,
  action, source = "system", actorType = "system", actorId = null,
  threadId = null, taskId = null, messageId = null, details = {},
}) {
  await query(db, `INSERT INTO document_change_logs
    (id,project_id,artifact_id,version_id,folder_id,action,source,actor_type,actor_id,thread_id,task_id,message_id,details)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [randomUUID(), projectId, artifactId, versionId, folderId, action, source, actorType, actorId,
    threadId, taskId, messageId, JSON.stringify(details || {})]);
}

export async function listDocumentChanges(db, projectId, { artifactId, folderId, action, source, limit = 100, before } = {}) {
  const values = [projectId];
  const filters = ["l.project_id=?"];
  if (artifactId) { filters.push("l.artifact_id=?"); values.push(artifactId); }
  if (folderId) { filters.push("l.folder_id=?"); values.push(folderId); }
  if (action) { filters.push("l.action=?"); values.push(action); }
  if (source) { filters.push("l.source=?"); values.push(source); }
  if (before) { filters.push("l.created_at<?"); values.push(before); }
  const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 200);
  values.push(pageSize + 1);
  const rows = await query(db, `SELECT l.*,u.name actor_name,a.title artifact_title,v.filename version_filename,f.name folder_name
    FROM document_change_logs l
    LEFT JOIN users u ON u.id=l.actor_id
    LEFT JOIN artifacts a ON a.id=l.artifact_id
    LEFT JOIN versions v ON v.id=l.version_id
    LEFT JOIN document_folders f ON f.id=l.folder_id
    WHERE ${filters.join(" AND ")} ORDER BY l.created_at DESC,l.id DESC LIMIT ?`, values);
  return { items: rows.slice(0, pageSize).map((row) => ({ ...row, details: typeof row.details === "string" ? JSON.parse(row.details) : row.details })), page: { hasMore: rows.length > pageSize, before: rows[pageSize - 1]?.created_at || null } };
}
