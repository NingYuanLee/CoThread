import { query } from "./db.js";

/**
 * 方向 A：wiki_pages 是事实，三张旧摘要表（agent_member_summaries /
 * agent_document_summaries / agent_project_summaries）降级为“从 wiki 刷新”的读取缓存。
 * 这里只负责刷新缓存与提供“wiki 优先”的读取，不写 wiki。
 */

export function memorySection(markdown, heading) {
  const lines = String(markdown || "").split("\n");
  const start = lines.findIndex((line) => line.trim() === "## " + heading);
  if (start < 0) return "";
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) break;
    body.push(lines[index]);
  }
  return body.join("\n").trim();
}

export function memoryExcerpt(text, maximum) {
  const clean = String(text || "").trim();
  return Array.from(clean).slice(0, maximum).join("");
}

async function currentPage(db, projectId, subject, where, params) {
  const [row] = await query(
    db,
    `SELECT id,title,body FROM wiki_pages
     WHERE project_id=? AND subject_type=? AND status<>'superseded' ${where}
     ORDER BY updated_at DESC LIMIT 1`,
    [projectId, subject, ...params],
  );
  return row || null;
}

/** 发言记忆 → 成员摘要缓存：要点 / 立场与主张。 */
export async function refreshMemberSummaryCache(db, projectId, userId) {
  if (!projectId || !userId) return null;
  const page = await currentPage(db, projectId, "utterance", "AND about_user_id=?", [userId]);
  if (!page) return null;
  const summary =
    memoryExcerpt(memorySection(page.body, "要点") || page.body, 800) || "（暂无要点）";
  const statementSummary = memoryExcerpt(memorySection(page.body, "立场与主张"), 2000) || null;
  await query(
    db,
    `INSERT INTO agent_member_summaries(project_id,user_id,summary,statement_summary,through_sequence)
     VALUES(?,?,?,?,0) ON DUPLICATE KEY UPDATE
     summary=VALUES(summary),statement_summary=VALUES(statement_summary),updated_at=UTC_TIMESTAMP(3)`,
    [projectId, userId, summary, statementSummary],
  );
  return { summary, statementSummary };
}

/** 项目整体记忆 → 项目导读缓存。 */
export async function refreshProjectGuideCache(db, projectId) {
  if (!projectId) return null;
  const page = await currentPage(db, projectId, "project", "", []);
  if (!page) return null;
  const status = memorySection(page.body, "当前状态");
  // 占位页（尚未结算）不覆盖导读缓存，避免把“待更新”写进模型上下文。
  if (!status || status.includes("待老翁在下次结算时更新")) return null;
  const summary = memoryExcerpt(status, 2000) || "（暂无项目状态）";
  await query(
    db,
    `INSERT INTO agent_project_summaries(project_id,summary) VALUES(?,?)
     ON DUPLICATE KEY UPDATE summary=VALUES(summary),updated_at=UTC_TIMESTAMP(3)`,
    [projectId, summary],
  );
  return { summary };
}

/** 文档记忆（按 artifact 标题对应）→ 该版本摘要缓存。 */
export async function refreshDocumentSummaryCache(db, projectId, versionId) {
  if (!projectId || !versionId) return null;
  const [row] = await query(
    db,
    `SELECT a.title FROM versions v JOIN artifacts a ON a.id=v.artifact_id
     WHERE v.id=? AND a.project_id=?`,
    [versionId, projectId],
  );
  if (!row?.title) return null;
  const page = await currentPage(db, projectId, "document", "AND title=?", [row.title]);
  if (!page) return null;
  const summary =
    memoryExcerpt(memorySection(page.body, "变更要点") || page.body, 2000) || "（暂无摘要）";
  await query(
    db,
    `INSERT INTO agent_document_summaries(version_id,summary) VALUES(?,?)
     ON DUPLICATE KEY UPDATE summary=VALUES(summary),updated_at=UTC_TIMESTAMP(3)`,
    [versionId, summary],
  );
  return { summary };
}

/** wiki 优先的成员认识读取：有发言记忆就用它，没有才回落到旧表。 */
export async function readMemberUnderstanding(db, projectId, userId) {
  const page = await currentPage(db, projectId, "utterance", "AND about_user_id=?", [userId]);
  if (page) {
    return {
      understanding: memoryExcerpt(memorySection(page.body, "要点") || page.body, 800) || null,
      statementSummary: memoryExcerpt(memorySection(page.body, "立场与主张"), 2000) || null,
      understandingUpdatedAt: null,
      source: "wiki",
    };
  }
  const [memory] = await query(
    db,
    `SELECT summary understanding,statement_summary statementSummary,updated_at understandingUpdatedAt
     FROM agent_member_summaries WHERE project_id=? AND user_id=?`,
    [projectId, userId],
  );
  return memory ? { ...memory, source: "cache" } : null;
}

/** 回填/修复用：按 wiki 全量刷新三类缓存。 */
export async function refreshAllCaches(db, projectId) {
  const speakers = await query(
    db,
    `SELECT DISTINCT about_user_id userId FROM wiki_pages
     WHERE project_id=? AND subject_type='utterance' AND status<>'superseded' AND about_user_id IS NOT NULL`,
    [projectId],
  );
  for (const speaker of speakers) await refreshMemberSummaryCache(db, projectId, speaker.userId);
  await refreshProjectGuideCache(db, projectId);
  const versions = await query(
    db,
    `SELECT v.id versionId FROM versions v JOIN artifacts a ON a.id=v.artifact_id
     WHERE a.project_id=? AND a.deleted_at IS NULL
     AND v.id=(SELECT MAX(v2.id) FROM versions v2 WHERE v2.artifact_id=a.id)`,
    [projectId],
  );
  for (const version of versions)
    await refreshDocumentSummaryCache(db, projectId, version.versionId);
  return { speakers: speakers.length, documents: versions.length };
}
