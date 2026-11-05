import { HttpError } from "./http-error.ts";
import { query } from "./db.ts";

/**
 * Memory lifecycle authority is determined by the source family, never by the
 * subject label or by the first attached source. The policy is deliberately
 * small so every writer can share the same checks.
 */
export const MEMORY_SOURCE_FAMILIES = Object.freeze([
  "conversation",
  "project_activity",
  "project_file",
]);

export function sourceFamilyForKind(sourceKind) {
  if (sourceKind === "message") return "conversation";
  if (["task", "milestone", "thread", "iteration_context", "archive"].includes(sourceKind))
    return "project_activity";
  if (sourceKind === "document_version") return "project_file";
  return null;
}

export function sourceFamilyForSources(sources = []) {
  const resolved = sources.map((source) => sourceFamilyForKind(source?.sourceKind || source?.kind));
  if (!resolved.length || resolved.some((family) => !family)) return null;
  const families = new Set(resolved);
  return families.size === 1 ? [...families][0] : null;
}

/** Resolve provenance, including referenced pages. Unknown/mixed fails closed. */
export async function resolveMemorySourceFamily(db, projectId, pageId, visited = new Set()) {
  if (visited.has(pageId)) return null;
  const path = new Set([...visited, pageId]);
  const [page] = await query(
    db,
    "SELECT source_family sourceFamily FROM wiki_pages WHERE id=? AND project_id=?",
    [pageId, projectId],
  );
  if (!page) return null;
  const [file] = await query(
    db,
    `SELECT page_id FROM file_index_entries WHERE project_id=? AND page_id=?
    UNION ALL SELECT page_id FROM file_index_groups WHERE project_id=? AND page_id=?
    UNION ALL SELECT page_id FROM file_index_roots WHERE project_id=? AND page_id=? LIMIT 1`,
    [projectId, pageId, projectId, pageId, projectId, pageId],
  );
  if (file) return "project_file";
  const sources = await query(
    db,
    "SELECT source_kind kind,source_id id FROM wiki_page_sources WHERE page_id=?",
    [pageId],
  );
  if (!sources.length) return page.sourceFamily || null;
  const families = [];
  for (const source of sources)
    families.push(
      source.kind === "memory_page"
        ? await resolveMemorySourceFamily(db, projectId, source.id, path)
        : sourceFamilyForKind(source.kind),
    );
  if (families.some((family) => !family)) return null;
  return new Set(families).size === 1 ? families[0] : null;
}

export function canSupersedeMemory({
  sourceFamily,
  actorType,
  automatedFileMaintenance = false,
} = {}) {
  if (sourceFamily === "conversation") return actorType === "human";
  if (sourceFamily === "project_activity") return false;
  if (sourceFamily === "project_file") return automatedFileMaintenance === true;
  return false;
}

export function assertCanSupersedeMemory(input) {
  if (canSupersedeMemory(input)) return true;
  throw new HttpError(403, "当前记忆来源不允许由该执行者作废");
}

export function assertProjectActivityMemoryMutable({ operation } = {}) {
  if (["supersede", "invalidate", "discard"].includes(operation))
    throw new HttpError(403, "项目—迭代—任务来源记忆不可作废");
  return true;
}
