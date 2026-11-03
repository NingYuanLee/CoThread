import { query, transaction } from "./db.js";
import { memoryNeighborhood, noteMemoryRecall } from "./memory-graph.js";
import { MEMORY_SUBJECT_LABELS, isMemorySubject } from "../shared/memory-kinds.js";
import { MEMORY_SUBTYPE_LABELS } from "../shared/memory-taxonomy.js";
import { visibleFileIndexSql, historicalFileIndexSql } from "./file-index-visibility.js";
import {
  intactConversationMemorySql,
  readableConversationMemorySql,
} from "./conversation-memory-integrity.js";
import { hydrateFileIndexRoots } from "./file-index-roots.js";
import { hydrateFileIndexGroups } from "./file-index-groups.js";
import { hydrateFileIndexPaths } from "./file-index-path.js";

const SOURCE_LABELS = {
  message: "群聊消息",
  document_version: "文档版本",
  task: "任务",
  archive: "归档",
  thread: "迭代",
  milestone: "项目变更",
  iteration_context: "迭代目标背景变更",
  memory_page: "关联项目记忆",
};

function excerptOf(text, size = 240) {
  const value = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value.length > size ? value.slice(0, size) + "…" : value;
}

async function sourcesOf(db, pageIds) {
  const map = new Map();
  if (!pageIds.length) return map;
  const rows = await query(
    db,
    `SELECT s.page_id pageId,s.source_kind sourceKind,s.source_id sourceId,s.label
     FROM wiki_page_sources s
     LEFT JOIN versions v ON s.source_kind='document_version' AND v.id=s.source_id
     LEFT JOIN artifacts a ON a.id=v.artifact_id
     LEFT JOIN version_recycle vr ON vr.version_id=v.id
     WHERE s.page_id IN (${pageIds.map(() => "?").join(",")})
       AND (s.source_kind<>'document_version' OR (v.id IS NOT NULL AND a.deleted_at IS NULL AND a.purged_at IS NULL AND vr.version_id IS NULL))
     ORDER BY s.created_at,s.id`,
    pageIds,
  );
  for (const row of rows) {
    const list = map.get(row.pageId) || [];
    if (list.length >= 3) continue;
    list.push({
      kind: row.sourceKind,
      id: row.sourceId,
      label: row.label || SOURCE_LABELS[row.sourceKind] || "",
    });
    map.set(row.pageId, list);
  }
  return map;
}

/**
 * 检索项目记忆：先按对象类型/成员/状态收窄，再用 ngram 全文找候选。
 * 记忆是索引不是正文，返回摘录与出处；需要原话再按出处打开。
 */
export async function searchProjectMemory(
  db,
  projectId,
  {
    query: keyword,
    subjects,
    aboutUserId,
    status = "current",
    purpose = "current",
    asOf = null,
    depth = 1,
    limit = 20,
  } = {},
) {
  if (typeof db.getConnection === "function")
    return transaction(db, (conn) =>
      searchProjectMemory(conn, projectId, {
        query: keyword,
        subjects,
        aboutUserId,
        status,
        purpose,
        asOf,
        depth,
        limit,
      }),
    );
  if (!["current", "history", "explain"].includes(purpose)) throw new Error("不支持的记忆查询用途");
  if (!["current", "superseded", "all"].includes(status)) throw new Error("不支持的记忆状态");
  if (asOf && !Number.isFinite(Date.parse(asOf))) throw new Error("无效的历史时间");
  if (asOf)
    return searchHistoricalRevisions(db, projectId, {
      keyword,
      subjects,
      aboutUserId,
      asOf,
      limit,
      purpose,
    });
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const selected = (Array.isArray(subjects) ? subjects : []).filter(isMemorySubject);
  const where = [
    "p.project_id=?",
    ...(status === "all" || purpose !== "current" ? [] : ["p.status=?"]),
    purpose === "current" ? visibleFileIndexSql("p") : historicalFileIndexSql("p"),
    readableConversationMemorySql("p"),
  ];
  const params = [projectId, ...(status === "all" || purpose !== "current" ? [] : [status])];
  if (selected.length) {
    where.push(`subject_type IN (${selected.map(() => "?").join(",")})`);
    params.push(...selected);
  }
  if (aboutUserId) {
    where.push("about_user_id=?");
    params.push(aboutUserId);
  }
  const kw = String(keyword || "")
    .trim()
    .slice(0, 200);
  const correctionRank =
    purpose === "current"
      ? "EXISTS(SELECT 1 FROM memory_relations c JOIN wiki_pages n ON n.id=c.from_page_id AND n.status='current' AND n.project_id=p.project_id WHERE c.to_page_id=p.id AND c.relation='corrects')"
      : "0";
  const columns =
    "p.id,p.subject_type subjectType,p.memory_subtype subtype,p.title,p.body,p.status,p.source_family sourceFamily,p.about_user_id aboutUserId,p.recall_count recallCount,p.updated_at updatedAt," +
    correctionRank +
    " corrected";
  let rows = [];
  if (kw) {
    rows = await query(
      db,
      `SELECT ${columns}, MATCH(title,body) AGAINST(? IN BOOLEAN MODE) score
       FROM wiki_pages p WHERE ${where.join(" AND ")}
         AND MATCH(title,body) AGAINST(? IN BOOLEAN MODE)
       ORDER BY corrected ASC,score DESC, updated_at DESC LIMIT ?`,
      [...params, kw, kw, cap],
    );
  }
  if (!rows.length) {
    if (kw)
      rows = await query(
        db,
        `SELECT ${columns} FROM wiki_pages p WHERE ${where.join(" AND ")}
           AND (title LIKE ? OR body LIKE ?) ORDER BY corrected ASC,updated_at DESC LIMIT ?`,
        [...params, `%${kw}%`, `%${kw}%`, cap],
      );
    else
      rows = await query(
        db,
        `SELECT ${columns} FROM wiki_pages p WHERE ${where.join(" AND ")}
         ORDER BY corrected ASC,updated_at DESC LIMIT ?`,
        [...params, cap],
      );
  }
  if (kw && rows.length < cap) {
    const topicRows = await query(
      db,
      `SELECT ${columns} FROM wiki_pages p
      JOIN file_index_entries topic_index ON topic_index.page_id=p.id
      WHERE ${where.join(" AND ")} AND CAST(topic_index.topics AS CHAR) LIKE ?
      ORDER BY corrected ASC,p.updated_at DESC LIMIT ?`,
      [...params, `%${kw}%`, cap],
    );
    const seen = new Set(rows.map((row) => row.id));
    rows.push(...topicRows.filter((row) => !seen.has(row.id)).slice(0, cap - rows.length));
  }
  if (kw && rows.length < cap) {
    const folderRows = await query(
      db,
      `WITH RECURSIVE matching_folders AS (
        SELECT f.id FROM document_folders f WHERE f.project_id=? AND f.name LIKE ?
        UNION DISTINCT
        SELECT child.id FROM document_folders child JOIN matching_folders parent ON child.parent_id=parent.id
        WHERE child.project_id=?
      )
      SELECT ${columns} FROM wiki_pages p
      JOIN file_index_entries fi ON fi.page_id=p.id
      JOIN artifacts a ON a.id=fi.artifact_id AND a.project_id=fi.project_id
      WHERE ${where.join(" AND ")} AND a.folder_id IN (SELECT id FROM matching_folders)
      ORDER BY corrected ASC,p.updated_at DESC LIMIT ?`,
      [projectId, `%${kw}%`, projectId, ...params, cap],
    );
    const seen = new Set(rows.map((row) => row.id));
    rows.push(...folderRows.filter((row) => !seen.has(row.id)).slice(0, cap - rows.length));
  }
  rows = await hydrateFileIndexGroups(
    db,
    projectId,
    await hydrateFileIndexRoots(db, projectId, rows),
  );
  rows = await hydrateFileIndexPaths(db, projectId, rows);
  const ids = rows.map((row) => row.id);
  const roots = ids.length
    ? await query(
        db,
        `SELECT page_id pageId FROM file_index_roots
    WHERE project_id=? AND page_id IN (${ids.map(() => "?").join(",")})`,
        [projectId, ...ids],
      )
    : [];
  const rootIds = new Set(roots.map((row) => row.pageId));
  const sourceMap = await sourcesOf(db, ids);
  const { readProjectStatusNode } = await import("./project-status-node.js");
  const projectStatus = await readProjectStatusNode(db, projectId);
  const { captureMemoryRevision } = await import("./memory-history.js");
  for (const row of rows) row.memoryRevisionId = await captureMemoryRevision(db, row);
  const entries = rows.map((row) => ({
    pageId: row.id,
    memoryRevisionId: row.memoryRevisionId,
    sourceFamily: row.sourceFamily || null,
    status: row.status,
    corrected: Boolean(Number(row.corrected)),
    subject: row.subjectType,
    subjectLabel: MEMORY_SUBJECT_LABELS[row.subjectType] || "",
    subtype: row.subtype || null,
    subtypeLabel: MEMORY_SUBTYPE_LABELS[row.subtype] || "",
    title: row.title,
    excerpt:
      (projectStatus?.id === row.id && Number(projectStatus.sourceNeedsReview)
        ? "【现状待核实】"
        : "") + excerptOf(row.body),
    ...(projectStatus?.id === row.id
      ? { sourceNeedsReview: Boolean(Number(projectStatus.sourceNeedsReview)) }
      : {}),
    ...(rootIds.has(row.id)
      ? {
          navigation:
            row.body.length > 8000
              ? `${row.body.slice(0, 8000)}\n\n导航已截断，请按主题或文件名搜索。`
              : row.body,
        }
      : {}),
    aboutUserId: row.aboutUserId || null,
    recallCount: Number(row.recallCount || 0),
    updatedAt: row.updatedAt,
    sources: sourceMap.get(row.id) || [],
  }));
  let related = [];
  if (depth > 0 && ids.length) {
    const hood = await memoryNeighborhood(db, projectId, ids, {
      depth,
      limit: 40,
      historical: purpose !== "current",
    });
    const otherIds = hood.filter((item) => !ids.includes(item.pageId)).map((item) => item.pageId);
    const visible = otherIds.length
      ? await query(
          db,
          `SELECT p.id FROM wiki_pages p WHERE p.project_id=?
      AND p.id IN (${otherIds.map(() => "?").join(",")}) AND ${readableConversationMemorySql("p")}
      AND ${purpose === "current" ? visibleFileIndexSql("p") : historicalFileIndexSql("p")}`,
          [projectId, ...otherIds],
        )
      : [];
    const visibleIds = new Set(visible.map((row) => row.id));
    related = hood
      .filter((item) => visibleIds.has(item.pageId))
      .map((item) => ({
        pageId: item.pageId,
        title: item.title || "",
        subject: item.subjectType || null,
        relation: item.via,
        distance: item.distance,
      }));
  }
  if (ids.length) await noteMemoryRecall(db, ids);
  return { entries, related, total: entries.length, purpose };
}

async function searchHistoricalRevisions(
  db,
  projectId,
  { keyword, subjects, aboutUserId, asOf, limit, purpose },
) {
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const selected = (Array.isArray(subjects) ? subjects : []).filter(isMemorySubject);
  const kw = String(keyword || "")
    .trim()
    .slice(0, 200);
  const where = ["r.project_id=?", "r.recorded_at<=?", historicalFileIndexSql("p")];
  const params = [projectId, new Date(asOf).toISOString().slice(0, 23).replace("T", " ")];
  if (selected.length) {
    where.push(`r.subject_type IN (${selected.map(() => "?").join(",")})`);
    params.push(...selected);
  }
  if (aboutUserId) {
    where.push("p.about_user_id=?");
    params.push(aboutUserId);
  }
  if (kw) {
    where.push("(r.title LIKE ? OR r.body LIKE ?)");
    params.push(`%${kw}%`, `%${kw}%`);
  }
  const rows = await query(
    db,
    `SELECT r.id memoryRevisionId,r.page_id pageId,r.title,r.body,r.status,r.sources,r.subject_type subject,r.recorded_at recordedAt,r.capture_kind captureKind
    FROM memory_page_revisions r JOIN wiki_pages p ON p.id=r.page_id AND p.project_id=r.project_id
    WHERE ${where.join(" AND ")} AND NOT EXISTS(SELECT 1 FROM memory_page_revisions newer
      WHERE newer.page_id=r.page_id AND newer.recorded_at<=? AND (newer.recorded_at>r.recorded_at OR newer.recorded_at=r.recorded_at AND newer.id>r.id))
    ORDER BY r.recorded_at DESC,r.id DESC LIMIT ?`,
    [...params, params[1], cap],
  );
  const { canReadHistoricalSources } = await import("./memory-history.js");
  const entries = [];
  for (const row of rows) {
    const sources = typeof row.sources === "string" ? JSON.parse(row.sources) : row.sources || [];
    if (await canReadHistoricalSources(db, projectId, sources))
      entries.push({ ...row, body: undefined, excerpt: excerptOf(row.body), sources });
  }
  return {
    entries,
    related: [],
    purpose,
    asOf,
    total: entries.length,
    coverage: "仅返回在该时间之前实际记录的修订；不推测缺失历史",
  };
}
