import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { Service } from "./service.js";
import { publishWork } from "./work-events.js";
import { listOrganizationDocuments } from "./document-organization.js";
import { visualVerificationEnabled, visualVerificationSkip } from "./visual-capability.js";

const planSchema = z.object({
  documents: z.array(z.object({
    artifactId: z.string().uuid(),
    title: z.string().trim().min(1).max(160).optional(),
    folder: z.string().trim().min(1).max(80).nullable().optional(),
  })).max(500),
});
const visualVerificationSchema = z.object({
  ok: z.boolean(),
  issues: z.string().max(4000).default(""),
});

async function createPlan(db, job, documents, options = {}) {
  const { runL1Task } = await import("./l1-agent.js");
  return runL1Task(db, job.project_id, "document_organization", {
    instructions: "返回 {documents:[{artifactId,title?,folder?}]}。只根据清单整理，名称清楚简短；分类层级只允许一层；folder 使用主题名称，禁止使用 YYYY-MM-DD 日期作为文件夹名；不要删除文件；不确定时保持原名称且 folder 为 null。",
    scope: job.scope,
    documents,
  }, planSchema, options);
}

async function verifyOrganization(db, job, documents, screenshot, options = {}) {
  const { runL1Task } = await import("./l1-agent.js");
  return runL1Task(db, job.project_id, "document_organization", {
    instructions: "这是数据库整理完成后的真实文档树截图。只做视觉复核，返回 {ok:boolean,issues:string}。检查文件是否出现在合理文件夹、树结构是否清晰、是否存在明显缺失或显示异常。数据库清单不能替代截图。",
    scope: job.scope,
    documents,
  }, visualVerificationSchema, {
    ...(options || {}),
    image: { data: screenshot.toString("base64"), mimeType: "image/png" },
  });
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
          if (item.folder) {
            const [base] = await query(conn, `SELECT id FROM document_folders WHERE project_id=? AND thread_id IS NULL AND folder_kind='project_official' LIMIT 1`,
              [job.project_id]);
            if (base) {
              let [folder] = await query(conn, "SELECT id FROM document_folders WHERE project_id=? AND parent_id=? AND name=?", [job.project_id, base.id, item.folder]);
              if (!folder) {
                folder = { id: randomUUID() };
                await query(conn, `INSERT INTO document_folders(id,project_id,thread_id,parent_id,name,folder_kind)
                  VALUES(?,?,?,?,?,?)`, [folder.id, job.project_id, null, base.id, item.folder, null]);
              }
              folderId = folder.id;
            }
          }
          await query(conn, "UPDATE artifacts SET title=?,folder_id=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?",
            [item.title || source.title, folderId, item.artifactId]);
          changed.push(item.artifactId);
        }
      });
      let visual;
      if (!visualVerificationEnabled("knowledge")) {
        visual = visualVerificationSkip("l1");
      } else {
        const { captureProjectTree } = await import("./preview-screenshot.js");
        const project = await new Service(db).project({ id: job.requested_by, kind: "session" }, job.project_id);
        const screenshot = await captureProjectTree(project);
        visual = await verifyOrganization(db, job, rows, screenshot, options.l1Options);
        if (!visual.ok) throw new Error(`文档整理视觉复核未通过：${visual.issues || "请人工检查文档树"}`);
      }
      await query(db, `UPDATE document_organization_jobs SET status='completed',result=?,finished_at=UTC_TIMESTAMP(3)
        WHERE id=?`, [JSON.stringify({ checked: rows.length, changed: changed.length, visualVerification: visual }), job.id]);
    }
  } catch (error) {
    await query(db, `UPDATE document_organization_jobs SET status='failed',error=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
      ["文档整理未完成，可以重试。", job.id]);
    console.error("Document organization failed", { type: error.name });
  }
  publishWork(db, job.thread_id || undefined);
  return true;
}
