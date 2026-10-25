import { randomUUID } from "node:crypto";
import { query } from "./db.js";

/**
 * 记忆条目的统一落页：按「对象类型 + 标题」找现行条目，有就更新、没有就新建，
 * 出处按 (page,kind,id) 去重。各记忆写入者共用，避免各自复制一份 upsert。
 */
export async function upsertMemoryPage(
  db,
  projectId,
  { subject, kind = "status", title, body, createdBy, sources = [] } = {},
) {
  const clean = String(title || "")
    .trim()
    .slice(0, 160);
  if (!projectId || !subject || !clean) return null;
  const [existing] = await query(
    db,
    `SELECT id FROM wiki_pages
     WHERE project_id=? AND subject_type=? AND status<>'superseded' AND title=?
     ORDER BY updated_at DESC LIMIT 1`,
    [projectId, subject, clean],
  );
  const pageId = existing?.id || randomUUID();
  const text = String(body || "").slice(0, 60000);
  if (existing) {
    await query(db, "UPDATE wiki_pages SET body=?,kind=?,updated_by=? WHERE id=?", [
      text,
      kind,
      createdBy || null,
      pageId,
    ]);
  } else {
    await query(
      db,
      `INSERT INTO wiki_pages(id,project_id,subject_type,kind,title,body,status,created_by,updated_by)
       VALUES(?,?,?,?,?,?,'current',?,?)`,
      [pageId, projectId, subject, kind, clean, text, createdBy || null, createdBy || null],
    );
  }
  for (const source of sources) {
    if (!source?.id) continue;
    const sourceKind = source.kind || "manual";
    const [dup] = await query(
      db,
      "SELECT id FROM wiki_page_sources WHERE page_id=? AND source_kind=? AND source_id=? LIMIT 1",
      [pageId, sourceKind, source.id],
    );
    if (dup) continue;
    await query(
      db,
      "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,?,?,?)",
      [randomUUID(), pageId, sourceKind, source.id, String(source.label || "").slice(0, 240)],
    );
  }
  return pageId;
}

/** 项目整体记忆页：每项目一条现行页，作为讨论/任务记忆「继承」的落点。 */
export async function ensureProjectMemoryPage(db, { projectId, createdBy } = {}) {
  if (!projectId) return null;
  const [existing] = await query(
    db,
    `SELECT id FROM wiki_pages WHERE project_id=? AND subject_type='project' AND status='current'
     ORDER BY updated_at DESC LIMIT 1`,
    [projectId],
  );
  if (existing) return existing.id;
  const [project] = await query(db, "SELECT name FROM projects WHERE id=?", [projectId]);
  const body = [
    "## 是什么",
    "项目整体记忆：记录项目目标、边界和当前状态。",
    "",
    "## 当前状态",
    "- 待老翁在下次结算时更新。",
    "",
    "## 何时该看",
    "- 接手项目、判断现在做到哪一步时。",
  ].join("\n");
  return upsertMemoryPage(db, projectId, {
    subject: "project",
    kind: "status",
    title: "项目整体：" + (project?.name || "项目"),
    body,
    createdBy,
  });
}
