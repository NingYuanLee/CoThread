import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import { publishWork } from "./work-events.js";

const planSchema = z.object({
  documents: z.array(z.object({
    artifactId: z.string().uuid(),
    title: z.string().trim().min(1).max(160).optional(),
    folder: z.string().trim().min(1).max(80).nullable().optional(),
  })).max(500),
});

export async function listOrganizationDocuments(db, job) {
  return query(db, `SELECT a.id artifactId,a.title,a.folder_id folderId,v.filename,v.version,
    f.thread_id folderThreadId,f.folder_kind folderKind,f.parent_id parentId
    FROM artifacts a JOIN document_folders f ON f.id=a.folder_id
    JOIN versions v ON v.artifact_id=a.id
    WHERE a.project_id=? AND a.deleted_at IS NULL
    AND v.version=(SELECT MAX(v2.version) FROM versions v2 WHERE v2.artifact_id=a.id)
    AND ${job.scope === "project" ? "f.thread_id IS NULL" : "f.thread_id=? AND f.folder_kind='iteration_outputs'"}
    ORDER BY a.updated_at DESC`, job.scope === "project" ? [job.project_id] : [job.project_id, job.thread_id]);
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
      const [active] = await query(db, "SELECT id FROM threads WHERE project_id=? AND status='active' LIMIT 1 FOR UPDATE", [projectId]);
      if (active) throw new HttpError(409, "全部迭代归档后才能整理项目正式文件");
    }
    const scope = threadId ? "iteration" : "project";
    const documents = await listOrganizationDocuments(db, { project_id: projectId, thread_id: threadId, scope });
    if (!documents.length) throw new HttpError(409, "当前范围没有可整理的文档");
    const [existing] = await query(db, `SELECT id,status FROM document_organization_jobs
      WHERE project_id=? AND scope=? AND thread_id <=> ? AND status IN ('queued','running') LIMIT 1`,
    [projectId, scope, threadId]);
    if (existing) return existing;
    const id = randomUUID();
    await query(db, `INSERT INTO document_organization_jobs(id,project_id,thread_id,scope,requested_by)
      VALUES(?,?,?,?,?)`, [id, projectId, threadId, scope, user.id]);
    return { id, status: "queued" };
  });
  publishWork(service.db, threadId || undefined);
  return result;
}

async function createPlan(db, job, documents, options = {}) {
  const { runL1Task } = await import("./l1-agent.js");
  return runL1Task(db, job.project_id, "document_organization", {
    instructions: "返回 {documents:[{artifactId,title?,folder?}]}。只根据清单整理，名称清楚简短；分类层级只允许一层；不要删除文件；不确定时保持原名称且 folder 为 null。",
    scope: job.scope,
    documents,
  }, planSchema, options);
}

export async function processNextDocumentOrganization(db, options = {}) {
  const job = await transaction(db, async (conn) => {
    const [next] = await query(conn, `SELECT * FROM document_organization_jobs
      WHERE status='queued' ${options.threadId ? "AND thread_id=?" : ""} ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
    options.threadId ? [options.threadId] : []);
    if (!next) return null;
    await query(conn, "UPDATE document_organization_jobs SET status='running',started_at=UTC_TIMESTAMP(3) WHERE id=?", [next.id]);
    return next;
  });
  if (!job) return false;
  try {
    const rows = await listOrganizationDocuments(db, job);
    if (!rows.length) {
      await query(db, `UPDATE document_organization_jobs SET status='completed',result=?,finished_at=UTC_TIMESTAMP(3)
        WHERE id=?`, [JSON.stringify({ checked: 0, changed: 0 }), job.id]);
    } else {
      const plan = options.createPlan
        ? await options.createPlan(job, rows)
        : await createPlan(db, job, rows, options.l1Options);
      const allowed = new Map(rows.map((row) => [row.artifactId, row]));
      const changed = [];
      await transaction(db, async (conn) => {
        const [current] = await query(conn, "SELECT status FROM document_organization_jobs WHERE id=? FOR UPDATE", [job.id]);
        if (current?.status !== "running") return;
        for (const item of plan.documents) {
          const source = allowed.get(item.artifactId);
          if (!source) continue;
          let folderId = source.folderId;
          if (item.folder && source.folderKind !== "iteration_cache") {
            const baseKind = job.scope === "project" ? "project_official" : source.folderKind;
            const [base] = await query(conn, `SELECT id FROM document_folders WHERE project_id=? AND thread_id <=> ? AND folder_kind=? LIMIT 1`,
              [job.project_id, job.thread_id, baseKind]);
            if (base) {
              let [folder] = await query(conn, "SELECT id FROM document_folders WHERE project_id=? AND parent_id=? AND name=?", [job.project_id, base.id, item.folder]);
              if (!folder) {
                folder = { id: randomUUID() };
                await query(conn, `INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,folder_kind)
                  VALUES(?,?,?,?,?,?)`, [folder.id, job.project_id, job.thread_id, base.id, item.folder,
                  job.scope === "project" ? null : baseKind]);
              }
              folderId = folder.id;
            }
          }
          await query(conn, "UPDATE artifacts SET title=?,folder_id=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?",
            [item.title || source.title, folderId, item.artifactId]);
          changed.push(item.artifactId);
        }
        await query(conn, `UPDATE document_organization_jobs SET status='completed',result=?,finished_at=UTC_TIMESTAMP(3)
          WHERE id=?`, [JSON.stringify({ checked: rows.length, changed: changed.length }), job.id]);
      });
    }
  } catch (error) {
    await query(db, `UPDATE document_organization_jobs SET status='failed',error=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
      ["文档整理未完成，可以重试。", job.id]);
    console.error("Document organization failed", { type: error.name });
  }
  publishWork(db, job.thread_id || undefined);
  return true;
}
