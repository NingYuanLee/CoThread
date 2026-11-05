import { HttpError } from "./http-error.ts";
import { query } from "./db.ts";
import type { Db } from "./types.ts";

/**
 * Memory lifecycle authority is determined by the source family, never by the
 * subject label or by the first attached source. The policy is deliberately
 * small so every writer can share the same checks.
 */
export const MEMORY_SOURCE_FAMILIES: readonly string[] = Object.freeze([
  "conversation",
  "project_activity",
  "project_file",
]);

/** 作废权限判定的入参。 */
export type SupersedeMemoryInput = {
  sourceFamily?: string | null;
  actorType?: string | null;
  automatedFileMaintenance?: boolean;
};

/** 来源种类 → 来源族。认不出的返回 null（调用方按「不可作废」处理）。 */
export function sourceFamilyForKind(sourceKind: unknown): string | null {
  if (sourceKind === "message") return "conversation";
  if (
    ["task", "milestone", "thread", "iteration_context", "archive"].includes(sourceKind as string)
  )
    return "project_activity";
  if (sourceKind === "document_version") return "project_file";
  return null;
}

/** 一组来源必须同族才算确定；混合或含未知一律 null。 */
export function sourceFamilyForSources(sources: unknown[] = []): string | null {
  const resolved = sources.map((source) => {
    const item = source as { sourceKind?: unknown; kind?: unknown } | null | undefined;
    return sourceFamilyForKind(item?.sourceKind || item?.kind);
  });
  if (!resolved.length || resolved.some((family) => !family)) return null;
  const families = new Set(resolved);
  return families.size === 1 ? ([...families][0] as string) : null;
}

/** Resolve provenance, including referenced pages. Unknown/mixed fails closed. */
export async function resolveMemorySourceFamily(
  db: Db,
  projectId: string,
  pageId: string,
  visited: Set<string> = new Set(),
): Promise<string | null> {
  if (visited.has(pageId)) return null;
  const path = new Set([...visited, pageId]);
  const [page] = await query<{ sourceFamily?: string | null }>(
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
  const sources = await query<{ kind: string; id: string }>(
    db,
    "SELECT source_kind kind,source_id id FROM wiki_page_sources WHERE page_id=?",
    [pageId],
  );
  if (!sources.length) return page.sourceFamily || null;
  const families: (string | null)[] = [];
  for (const source of sources)
    families.push(
      source.kind === "memory_page"
        ? await resolveMemorySourceFamily(db, projectId, source.id, path)
        : sourceFamilyForKind(source.kind),
    );
  if (families.some((family) => !family)) return null;
  return new Set(families).size === 1 ? (families[0] as string) : null;
}

/** 谁能作废：群消息只允许人，项目—迭代—任务谁都不行，项目文件交给自动维护。 */
export function canSupersedeMemory({
  sourceFamily,
  actorType,
  automatedFileMaintenance = false,
}: SupersedeMemoryInput = {}): boolean {
  if (sourceFamily === "conversation") return actorType === "human";
  if (sourceFamily === "project_activity") return false;
  if (sourceFamily === "project_file") return automatedFileMaintenance === true;
  return false;
}

export function assertCanSupersedeMemory(input: SupersedeMemoryInput): true {
  if (canSupersedeMemory(input)) return true;
  throw new HttpError(403, "当前记忆来源不允许由该执行者作废");
}

export function assertProjectActivityMemoryMutable({
  operation,
}: { operation?: string | null } = {}): true {
  if (["supersede", "invalidate", "discard"].includes(operation as string))
    throw new HttpError(403, "项目—迭代—任务来源记忆不可作废");
  return true;
}
