import { visibleFileIndexSql } from "./file-index-visibility.js";
import { query } from "./db.js";
import {
  intactConversationMemorySql,
  readableConversationMemorySql,
} from "./conversation-memory-integrity.js";

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

/** Combine individual utterances while retaining compatibility with legacy
 * per-member pages and their section headings. */
export function summarizeUtterancePages(pages) {
  if (!pages.length) return null;
  if (pages.length === 1) {
    const body = pages[0].body;
    return {
      summary: memoryExcerpt(memorySection(body, "要点") || body, 800) || "（暂无要点）",
      statementSummary: memoryExcerpt(memorySection(body, "立场与主张"), 2000) || null,
    };
  }
  const text = pages
    .map((page) => {
      const body = memorySection(page.body, "要点") || page.body;
      const stance = memorySection(page.body, "立场与主张");
      return `- ${page.title}：${[body, stance].filter(Boolean).join("；")}`;
    })
    .join("\n");
  return { summary: memoryExcerpt(text, 800), statementSummary: memoryExcerpt(text, 2000) || null };
}

async function memberPages(db, projectId, userId) {
  return query(
    db,
    `SELECT id,title,body FROM wiki_pages p
    WHERE project_id=? AND subject_type='utterance' AND status='current' AND about_user_id=? AND ${readableConversationMemorySql("p")}
    ORDER BY updated_at DESC,id LIMIT 50`,
    [projectId, userId],
  );
}

/** 发言记忆 → 成员摘要缓存：要点 / 立场与主张。 */
export async function refreshMemberSummaryCache(db, projectId, userId) {
  if (!projectId || !userId) return null;
  const aggregate = summarizeUtterancePages(await memberPages(db, projectId, userId));
  if (!aggregate) return null;
  const { summary, statementSummary } = aggregate;
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
  const { readProjectStatus } = await import("./project-status.js");
  const status = await readProjectStatus(db, projectId);
  const body = String(status?.body || "").trim();
  if (!body) return null;
  const summary = memoryExcerpt(body, 2000) || "（暂无项目状态）";
  await query(
    db,
    `INSERT INTO agent_project_summaries(project_id,summary) VALUES(?,?)
     ON DUPLICATE KEY UPDATE summary=VALUES(summary),updated_at=UTC_TIMESTAMP(3)`,
    [projectId, summary],
  );
  return { summary };
}

/** 文档记忆按文件身份匹配，避免同名文件的摘要串用。 */
export async function refreshDocumentSummaryCache(db, projectId, versionId) {
  if (!projectId || !versionId) return null;
  const [page] = await query(
    db,
    `SELECT p.id,p.title,p.body FROM file_index_entries fi
     JOIN wiki_pages p ON p.id=fi.page_id AND p.project_id=fi.project_id
     WHERE fi.indexed_version_id=? AND fi.project_id=?
       AND p.subject_type='document' AND p.status<>'superseded' AND ${visibleFileIndexSql("p")} LIMIT 1`,
    [versionId, projectId],
  );
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
  const aggregate = summarizeUtterancePages(await memberPages(db, projectId, userId));
  if (aggregate) {
    return {
      understanding: aggregate.summary,
      statementSummary: aggregate.statementSummary,
      understandingUpdatedAt: null,
      source: "wiki",
    };
  }
  const [stale] = await query(
    db,
    `SELECT id FROM wiki_pages p WHERE project_id=? AND about_user_id=?
    AND subject_type='utterance' AND status='current' AND NOT ${intactConversationMemorySql("p")} LIMIT 1`,
    [projectId, userId],
  );
  if (stale) return null;
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
