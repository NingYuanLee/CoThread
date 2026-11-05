/** 任务域：documents。内部依赖具体领域模块，不依赖 task-pool 兼容入口。 */

import { query } from "./db.ts";
import { HttpError } from "./http-error.ts";

import { folderRootKind, latestVersionsByFolderRoots } from "./documents/index.js";
import { parseDocumentRefs } from "./task-pool-helpers.ts";
import type { Db } from "./types.ts";

/** 一处文档引用的展示信息。 */
export type DocumentRefLabel = {
  id: string;
  title?: unknown;
  version?: unknown;
  filename?: unknown;
};

/** 文件夹行的展示信息。 */
type FolderRow = {
  id: string;
  parent_id?: string | null;
  name?: string | null;
  folder_kind?: string | null;
};

export async function assertDocumentRefs(
  conn: Db,
  projectId: string,
  refs: unknown,
): Promise<string[]> {
  const ids = parseDocumentRefs(refs);
  if (ids.length > 30) throw new HttpError(400, "任务最多引用 30 个文档版本");
  for (const ref of ids) {
    const [version] = await query<{ id: string; folder_id?: string | null }>(
      conn,
      `SELECT v.id,a.folder_id FROM versions v JOIN artifacts a ON a.id=v.artifact_id
         LEFT JOIN version_recycle vr ON vr.version_id=v.id
         WHERE v.id=? AND a.project_id=? AND a.deleted_at IS NULL AND vr.version_id IS NULL`,
      [ref, projectId],
    );
    if (!version || (await folderRootKind(conn, version.folder_id)) !== "project_official")
      throw new HttpError(400, "任务只能引用本项目正式文件中的有效文档版本");
  }
  return ids;
}

export async function assertFolderRefs(
  conn: Db,
  projectId: string,
  refs: unknown,
): Promise<string[]> {
  const ids = parseDocumentRefs(refs);
  if (ids.length > 30) throw new HttpError(400, "任务最多引用 30 个文件夹");
  for (const ref of ids) {
    const [folder] = await query(
      conn,
      "SELECT id FROM document_folders WHERE id=? AND project_id=?",
      [ref, projectId],
    );
    if (!folder || (await folderRootKind(conn, ref)) !== "project_official")
      throw new HttpError(400, "任务只能引用本项目正式文件中的文件夹");
  }
  return ids;
}

export async function stripDocumentRefsCoveredByFolders(
  conn: Db,
  projectId: string,
  documentRefs: string[],
  folderRefs: string[],
): Promise<string[]> {
  if (!documentRefs.length || !folderRefs.length) return documentRefs;
  const versionsByFolder = (await latestVersionsByFolderRoots(conn, projectId, folderRefs)) as Map<
    string,
    Array<{ version_id: string }>
  >;
  const covered = new Set<string>();
  for (const rows of versionsByFolder.values()) {
    for (const row of rows) covered.add(row.version_id);
  }
  return documentRefs.filter((id) => !covered.has(id));
}

export async function documentRefLabels(conn: Db, refs: unknown): Promise<DocumentRefLabel[]> {
  const ids = parseDocumentRefs(refs);
  if (!ids.length) return [];
  const rows = await query<DocumentRefLabel>(
    conn,
    `SELECT v.id,a.title,v.version,v.filename FROM versions v
    JOIN artifacts a ON a.id=v.artifact_id WHERE v.id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id) || { id, title: id });
}

export async function folderRefLabels(
  conn: Db,
  projectId: string,
  refs: unknown,
): Promise<DocumentRefLabel[]> {
  const ids = parseDocumentRefs(refs);
  if (!ids.length) return [];
  const folders = await query<FolderRow>(
    conn,
    "SELECT id,parent_id,name,folder_kind FROM document_folders WHERE project_id=?",
    [projectId],
  );
  const byId = new Map(folders.map((row) => [row.id, row]));
  const pathOf = (id: string): string => {
    const names: string[] = [];
    let current: FolderRow | undefined = byId.get(id);
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(
        !current.parent_id && current.folder_kind === "project_official"
          ? "正式文件"
          : current.name || current.id,
      );
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return names.join(" / ");
  };
  return ids.map((id) => ({ id, title: byId.has(id) ? pathOf(id) : id }));
}

export async function documentsForTaskInstruction(
  conn: Db,
  projectId: string,
  documentRefs: unknown,
  folderRefs: unknown,
): Promise<{ documents: DocumentRefLabel[]; folders: DocumentRefLabel[] }> {
  return {
    documents: await documentRefLabels(conn, documentRefs),
    folders: await folderRefLabels(conn, projectId, folderRefs),
  };
}
