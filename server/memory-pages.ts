import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.ts";
import { DEFAULT_MEMORY_SUBTYPES } from "../shared/memory-taxonomy.js";
import type { Db } from "./types.ts";

/** 记忆页的一条出处。 */
export type MemorySource = { id?: string | null; kind?: string | null; label?: unknown };

/** `upsertMemoryPage` 的入参。 */
export type UpsertMemoryPageInput = {
  subject?: string | null;
  subtype?: string | null;
  title?: unknown;
  body?: unknown;
  createdBy?: string | null;
  sources?: MemorySource[];
  sourceFamily?: string | null;
};

/**
 * 记忆条目的统一落页：按「对象类型 + 标题」找现行条目，有就更新、没有就新建，
 * 出处按 (page,kind,id) 去重。各记忆写入者共用，避免各自复制一份 upsert。
 */
export async function upsertMemoryPage(
  db: Db,
  projectId: string,
  {
    subject,
    subtype = (DEFAULT_MEMORY_SUBTYPES as Record<string, string | null>)[subject as string] || null,
    title,
    body,
    createdBy,
    sources = [],
    sourceFamily = null,
  }: UpsertMemoryPageInput = {},
): Promise<string | null> {
  if (typeof (db as { getConnection?: unknown }).getConnection === "function")
    return transaction(db as never, (conn) =>
      upsertMemoryPage(conn, projectId, {
        subject,
        subtype,
        title,
        body,
        createdBy,
        sources,
        sourceFamily,
      }),
    );
  const clean = String(title || "")
    .trim()
    .slice(0, 160);
  if (!projectId || !subject || !clean) return null;
  // Serialize identity lookup and insertion, including simultaneous first writes.
  const [project] = await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [projectId]);
  if (!project) return null;
  const taskSourceId = sources.find((s) => s.kind === "task")?.id || null;
  const [existing] = await query<{ id: string }>(
    db,
    `SELECT p.id FROM wiki_pages p
     WHERE p.project_id=? AND p.subject_type=? AND p.status='current' AND
       (? IS NOT NULL AND EXISTS(SELECT 1 FROM wiki_page_sources s WHERE s.page_id=p.id AND s.source_kind='task' AND s.source_id=?)
        OR ? IS NULL AND p.title=?)
     ORDER BY updated_at DESC LIMIT 1`,
    [projectId, subject, taskSourceId, taskSourceId, taskSourceId, clean],
  );
  const pageId = existing?.id || randomUUID();
  const text = String(body || "").slice(0, 60000);
  if (existing) {
    await query(
      db,
      "UPDATE wiki_pages SET title=?,body=?,memory_subtype=COALESCE(?,memory_subtype),updated_by=? WHERE id=?",
      [clean, text, subtype, createdBy || null, pageId],
    );
  } else {
    await query(
      db,
      `INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,title,body,status,created_by,updated_by)
       VALUES(?,?,?,?,?,?,'current',?,?)`,
      [pageId, projectId, subject, subtype, clean, text, createdBy || null, createdBy || null],
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
  const { sourceFamilyForSources } = await import("./memory-policy.ts");
  await query(db, "UPDATE wiki_pages SET source_family=? WHERE id=?", [
    sourceFamily || sourceFamilyForSources(sources),
    pageId,
  ]);
  const { captureMemoryRevision } = await import("./memory-history.js");
  await captureMemoryRevision(
    db,
    { id: pageId, title: clean, body: text, status: "current" },
    { captureKind: "activity_snapshot" },
  );
  return pageId;
}
