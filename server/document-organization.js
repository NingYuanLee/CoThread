import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import { publishWork } from "./work-events.js";

export async function listOrganizationDocuments(db, job) {
  return query(db, `WITH RECURSIVE official_tree AS (
      SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official'
      UNION ALL
      SELECT f.id FROM document_folders f JOIN official_tree o ON f.parent_id=o.id
    )
    SELECT a.id artifactId,a.title,a.folder_id folderId,v.filename,v.version,
      f.thread_id folderThreadId,f.folder_kind folderKind,f.parent_id parentId
    FROM artifacts a JOIN document_folders f ON f.id=a.folder_id
    JOIN official_tree t ON t.id=a.folder_id
    JOIN versions v ON v.artifact_id=a.id
    WHERE a.project_id=? AND a.deleted_at IS NULL
    AND v.version=(SELECT MAX(v2.version) FROM versions v2 WHERE v2.artifact_id=a.id)
    ORDER BY a.updated_at DESC`, [job.project_id, job.project_id]);
}

export async function queueDocumentOrganization(service, user, { projectId, threadId = null }) {
  if (user.kind !== "session") throw new HttpError(403, "需要人工登录");
  const result = await transaction(service.db, async (db) => {
    if (threadId) {
      const thread = await service.thread(user, threadId, true, db);
      projectId = thread.project_id;
    } else {
      await service.member(user, projectId, true, db);
      await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [projectId]);
    }
    const scope = "project";
    const documents = await listOrganizationDocuments(db, { project_id: projectId, scope });
    if (!documents.length) throw new HttpError(409, "正式文件区没有可整理的文档");
    const [existing] = await query(db, `SELECT id,status FROM document_organization_jobs
      WHERE project_id=? AND scope=? AND thread_id IS NULL AND status IN ('queued','running') LIMIT 1`,
    [projectId, scope]);
    if (existing) return existing;
    const id = randomUUID();
    await query(db, `INSERT INTO document_organization_jobs(id,project_id,thread_id,scope,requested_by)
      VALUES(?,?,?,?,?)`, [id, projectId, null, scope, user.id]);
    return { id, status: "queued" };
  });
  publishWork(service.db, threadId || undefined);
  return result;
}
