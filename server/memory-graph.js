import { randomUUID } from "node:crypto";
import { query } from "./db.js";
import { HttpError } from "./service.js";
import { MEMORY_DIRECTED_RELATIONS, MEMORY_RELATION_LABELS } from "../shared/memory-kinds.js";

const RELATIONS = Object.keys(MEMORY_RELATION_LABELS);
/** derives / supersedes 是单向边，防环只看有向边。 */
const CYCLE_DEPTH_LIMIT = 8;

async function projectPages(db, projectId, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await query(
    db,
    `SELECT id,subject_type subjectType,status,title FROM wiki_pages
     WHERE project_id=? AND id IN (${unique.map(() => "?").join(",")})`,
    [projectId, ...unique],
  );
  return new Map(rows.map((row) => [row.id, row]));
}

/** 从 to 沿 derives 反向可达 from 时，新增 from→to 会成环。 */
async function wouldCycle(db, fromPageId, toPageId) {
  const rows = await query(
    db,
    `WITH RECURSIVE reach(id, depth) AS (
       SELECT to_page_id, 1 FROM memory_relations
       WHERE from_page_id=? AND relation='derives'
       UNION ALL
       SELECT r.to_page_id, reach.depth+1
       FROM memory_relations r JOIN reach ON r.from_page_id=reach.id
       WHERE r.relation='derives' AND reach.depth<?
     )
     SELECT id FROM reach WHERE id=? LIMIT 1`,
    [toPageId, CYCLE_DEPTH_LIMIT, fromPageId],
  );
  return rows.length > 0;
}

/**
 * 建一条记忆关系。关联 relates 可双向，同一个 from/to 只存一行；
 * 继承 derives 与替代 supersedes 单向，继承禁止成环。
 */
export async function createMemoryRelation(
  db,
  { projectId, fromPageId, toPageId, relation, note = "", createdBy = null },
) {
  if (!RELATIONS.includes(relation)) throw new HttpError(400, "不支持的记忆关系");
  if (!fromPageId || !toPageId) throw new HttpError(400, "关系两端不能为空");
  if (fromPageId === toPageId) throw new HttpError(400, "记忆不能关联自己");
  const pages = await projectPages(db, projectId, [fromPageId, toPageId]);
  if (pages.size !== 2) throw new HttpError(404, "记忆条目不存在或不属于该项目");
  if (relation === "derives" && (await wouldCycle(db, fromPageId, toPageId)))
    throw new HttpError(409, "继承关系不能成环");
  const id = randomUUID();
  await query(
    db,
    `INSERT INTO memory_relations(id,project_id,from_page_id,to_page_id,relation,note,created_by)
     VALUES(?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE note=VALUES(note)`,
    [id, projectId, fromPageId, toPageId, relation, String(note || "").slice(0, 255), createdBy],
  );
  const [row] = await query(
    db,
    "SELECT * FROM memory_relations WHERE from_page_id=? AND to_page_id=? AND relation=?",
    [fromPageId, toPageId, relation],
  );
  return row;
}

export async function deleteMemoryRelation(db, { projectId, relationId }) {
  const result = await query(db, "DELETE FROM memory_relations WHERE id=? AND project_id=?", [
    relationId,
    projectId,
  ]);
  if (!Number(result?.affectedRows || 0)) throw new HttpError(404, "关系不存在");
}

/** 一条记忆的全部直接关系：出边与入边都返回，relates 不重复存反向边。 */
export async function listMemoryRelations(db, projectId, pageId) {
  return query(
    db,
    `SELECT r.id,r.from_page_id fromPageId,r.to_page_id toPageId,r.relation,r.note,
       r.created_at createdAt,
       fp.title fromTitle,fp.subject_type fromSubject,tp.title toTitle,tp.subject_type toSubject
     FROM memory_relations r
     JOIN wiki_pages fp ON fp.id=r.from_page_id
     JOIN wiki_pages tp ON tp.id=r.to_page_id
     WHERE r.project_id=? AND (r.from_page_id=? OR r.to_page_id=?)
     ORDER BY r.relation,r.created_at`,
    [projectId, pageId, pageId],
  );
}

/**
 * 召回：从起始条目按关系展开。默认 1 跳（继承上游 + 关联），最多 limit 跳。
 * 返回带距离与经由关系的条目，供读侧决定注入摘要还是打开全文。
 */
export async function memoryNeighborhood(
  db,
  projectId,
  startPageIds,
  { depth = 1, limit = 40 } = {},
) {
  const hops = Math.min(Math.max(Number(depth) || 1, 1), 3);
  const visited = new Map();
  let frontier = [...new Set(startPageIds.filter(Boolean))];
  for (const id of frontier) visited.set(id, { pageId: id, distance: 0, via: null });
  for (let step = 0; step < hops && frontier.length; step++) {
    const rows = await query(
      db,
      `SELECT from_page_id fromPageId,to_page_id toPageId,relation FROM memory_relations
       WHERE project_id=? AND (from_page_id IN (${frontier.map(() => "?").join(",")})
         OR to_page_id IN (${frontier.map(() => "?").join(",")}))`,
      [projectId, ...frontier, ...frontier],
    );
    const next = [];
    for (const row of rows) {
      const other = frontier.includes(row.fromPageId) ? row.toPageId : row.fromPageId;
      if (visited.has(other) || visited.size >= limit) continue;
      visited.set(other, { pageId: other, distance: step + 1, via: row.relation });
      next.push(other);
    }
    frontier = next;
  }
  const missing = [...visited.keys()].filter((id) => !startPageIds.includes(id));
  if (missing.length) {
    const rows = await query(
      db,
      `SELECT id,title,subject_type subjectType,status FROM wiki_pages
       WHERE project_id=? AND id IN (${missing.map(() => "?").join(",")})`,
      [projectId, ...missing],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const item of visited.values()) Object.assign(item, byId.get(item.pageId) || {});
  }
  return [...visited.values()];
}

/** 召回统计：只加计数与最近时间，不改正文。 */
export async function noteMemoryRecall(db, pageIds = []) {
  const ids = [...new Set(pageIds.filter(Boolean))];
  if (!ids.length) return;
  await query(
    db,
    `UPDATE wiki_pages SET recall_count=recall_count+1,last_recalled_at=UTC_TIMESTAMP(3)
     WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
}

export function directedRelations() {
  return [...MEMORY_DIRECTED_RELATIONS];
}
