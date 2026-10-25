import { query } from "./db.js";
import { memoryNeighborhood, noteMemoryRecall } from "./memory-graph.js";
import { MEMORY_SUBJECT_LABELS, isMemorySubject } from "../shared/memory-kinds.js";

const SOURCE_LABELS = {
  message: "群聊消息",
  document_version: "文档版本",
  task: "任务",
  archive: "归档",
  thread: "迭代",
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
    `SELECT page_id pageId,source_kind sourceKind,source_id sourceId,label
     FROM wiki_page_sources
     WHERE page_id IN (${pageIds.map(() => "?").join(",")})
     ORDER BY created_at,id`,
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
  { query: keyword, subjects, aboutUserId, status = "current", depth = 1, limit = 20 } = {},
) {
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const selected = (Array.isArray(subjects) ? subjects : []).filter(isMemorySubject);
  const where = ["project_id=?", "status=?"];
  const params = [projectId, status];
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
  const columns =
    "id,subject_type subjectType,kind,title,body,status,about_user_id aboutUserId,recall_count recallCount,updated_at updatedAt";
  let rows = [];
  if (kw) {
    rows = await query(
      db,
      `SELECT ${columns}, MATCH(title,body) AGAINST(? IN BOOLEAN MODE) score
       FROM wiki_pages WHERE ${where.join(" AND ")}
         AND MATCH(title,body) AGAINST(? IN BOOLEAN MODE)
       ORDER BY score DESC, updated_at DESC LIMIT ?`,
      [...params, kw, kw, cap],
    );
  }
  if (!rows.length) {
    if (kw)
      rows = await query(
        db,
        `SELECT ${columns} FROM wiki_pages WHERE ${where.join(" AND ")}
           AND (title LIKE ? OR body LIKE ?) ORDER BY updated_at DESC LIMIT ?`,
        [...params, `%${kw}%`, `%${kw}%`, cap],
      );
    else
      rows = await query(
        db,
        `SELECT ${columns} FROM wiki_pages WHERE ${where.join(" AND ")}
         ORDER BY updated_at DESC LIMIT ?`,
        [...params, cap],
      );
  }
  const ids = rows.map((row) => row.id);
  const sourceMap = await sourcesOf(db, ids);
  const entries = rows.map((row) => ({
    pageId: row.id,
    subject: row.subjectType,
    subjectLabel: MEMORY_SUBJECT_LABELS[row.subjectType] || "",
    kind: row.kind,
    title: row.title,
    excerpt: excerptOf(row.body),
    aboutUserId: row.aboutUserId || null,
    recallCount: Number(row.recallCount || 0),
    updatedAt: row.updatedAt,
    sources: sourceMap.get(row.id) || [],
  }));
  let related = [];
  if (depth > 0 && ids.length) {
    const hood = await memoryNeighborhood(db, projectId, ids, { depth, limit: 40 });
    related = hood
      .filter((item) => !ids.includes(item.pageId))
      .map((item) => ({
        pageId: item.pageId,
        title: item.title || "",
        subject: item.subjectType || null,
        relation: item.via,
        distance: item.distance,
      }));
  }
  if (ids.length) await noteMemoryRecall(db, ids);
  return { entries, related, total: entries.length };
}
