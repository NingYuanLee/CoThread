import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.ts";
import { HttpError } from "./service.ts";
import { publishWork } from "./work-events.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";

/** 文档整理作业里本模块会读的字段。 */
type OrganizationJob = { project_id: string; scope?: string };

/** 一条待整理的正式文档。 */
export type OrganizationDocument = {
  artifactId: string;
  title?: string | null;
  folderId?: string | null;
  filename?: string | null;
  version?: unknown;
  folderThreadId?: string | null;
  folderKind?: string | null;
  parentId?: string | null;
};

/** 排队整理所需的 Service 视图。 */
export type OrganizationService = {
  db: Pool;
  thread(
    user: OrganizationUser,
    threadId: string,
    write?: boolean,
    db?: Db,
  ): Promise<{ project_id: string }>;
  member(user: OrganizationUser, projectId: string, write?: boolean, db?: Db): Promise<unknown>;
};

/** 发起人。 */
export type OrganizationUser = { id: string; kind?: string | null };

export async function listOrganizationDocuments(
  db: Db,
  job: OrganizationJob,
): Promise<OrganizationDocument[]> {
  return query<OrganizationDocument>(
    db,
    `WITH RECURSIVE official_tree AS (
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
    ORDER BY a.updated_at DESC`,
    [job.project_id, job.project_id],
  );
}

export async function queueDocumentOrganization(
  service: OrganizationService,
  user: OrganizationUser,
  { projectId, threadId = null }: { projectId: string; threadId?: string | null },
): Promise<{ id: string; status: string }> {
  if (user.kind !== "session") throw new HttpError(403, "需要人工登录");
  let targetProjectId = projectId;
  const result = await transaction(service.db, async (db) => {
    if (threadId) {
      const thread = await service.thread(user, threadId, true, db);
      targetProjectId = thread.project_id;
    } else {
      await service.member(user, targetProjectId, true, db);
      await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [targetProjectId]);
    }
    const scope = "project";
    const documents = await listOrganizationDocuments(db, {
      project_id: targetProjectId,
      scope,
    });
    if (!documents.length) throw new HttpError(409, "正式文件区没有可整理的文档");
    const [existing] = await query<{ id: string; status: string }>(
      db,
      `SELECT id,status FROM document_organization_jobs
      WHERE project_id=? AND scope=? AND thread_id IS NULL AND status IN ('queued','running') LIMIT 1`,
      [targetProjectId, scope],
    );
    if (existing) return existing;
    const id = randomUUID();
    await query(
      db,
      `INSERT INTO document_organization_jobs(id,project_id,thread_id,scope,requested_by)
      VALUES(?,?,?,?,?)`,
      [id, targetProjectId, null, scope, user.id],
    );
    return { id, status: "queued" };
  });
  publishWork(service.db, threadId || undefined);
  return result;
}
