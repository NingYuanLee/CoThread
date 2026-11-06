import { query } from "../db.ts";
import { randomUUID } from "node:crypto";
import { nextDuplicateName, uniqueDisplayTitle } from "../../shared/document-name.js";
import type { Db } from "../types.ts";

/** 文档树里的文件夹行（只用到下面这几列）。 */
export type LibraryFolderRow = {
  id: string;
  parent_id?: string | null;
  name?: string | null;
  folder_kind?: string | null;
  system_key?: string | null;
  thread_id?: string | null;
};

/** 版本/产物行的可见性过滤只用这几个字段。 */
export type LibraryVersionRow = {
  deleted_at?: unknown;
  folder_kind?: string | null;
  folder_thread_id?: string | null;
};

/** `latestVersionsByFolderRoots` 返回的版本行。 */
export type FolderRootVersion = {
  root_id: string;
  version_id: string;
  artifact_id: string;
  title?: string | null;
  filename?: string | null;
  version?: unknown;
};

export const PROJECT_LIBRARY_ROOT_KINDS = [
  "project_official",
  "project_cache",
  "project_outputs",
  "project_miniprogram",
];

/**
 * Fixed subfolders of the miniprogram workspace root. Created lazily by
 * ensureMiniprogramWorkspace, protected from rename/move/delete, and named in
 * this display order.
 */
export const MINIPROGRAM_FIXED_FOLDERS = [
  ["小程序源文件", "miniprogram_source", "miniprogram_source"],
  ["小程序 Web 产物", "miniprogram_web", "miniprogram_web"],
  ["PC 管理后台", "miniprogram_admin", "miniprogram_admin"],
  ["云函数", "miniprogram_server", "miniprogram_server"],
];

export const MINIPROGRAM_FOLDER_KINDS = MINIPROGRAM_FIXED_FOLDERS.map(([, , kind]) => kind);

export function isMiniprogramFolderKind(kind: unknown): boolean {
  return (
    kind === "project_miniprogram" ||
    (typeof kind === "string" && MINIPROGRAM_FOLDER_KINDS.includes(kind))
  );
}

export function utcDateKey(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isCacheFolderKind(kind: unknown): boolean {
  return kind === "project_cache" || kind === "iteration_cache";
}

export function isOutputFolderKind(kind: unknown): boolean {
  return kind === "project_outputs" || kind === "iteration_outputs";
}

export async function uniqueArtifactTitle(
  db: Db,
  projectId: string,
  folderId: string | null | undefined,
  desired: string,
  excludeId: string | null = null,
  filename: string | null = null,
) {
  const rows = await query(
    db,
    `SELECT a.title, (
       SELECT v.filename FROM versions v
       LEFT JOIN version_recycle vr ON vr.version_id=v.id
       WHERE v.artifact_id=a.id AND vr.version_id IS NULL
       ORDER BY v.version DESC, v.created_at DESC, v.id DESC
       LIMIT 1
     ) AS filename
     FROM artifacts a
     WHERE a.project_id=? AND a.deleted_at IS NULL AND a.folder_id <=> ?
     ${excludeId ? "AND a.id<>?" : ""}`,
    [projectId, folderId, ...(excludeId ? [excludeId] : [])],
  );
  let matchFilename = filename;
  if (matchFilename == null && excludeId) {
    const [self] = await query(
      db,
      `SELECT v.filename FROM versions v
       LEFT JOIN version_recycle vr ON vr.version_id=v.id
       WHERE v.artifact_id=? AND vr.version_id IS NULL
       ORDER BY v.version DESC, v.created_at DESC, v.id DESC
       LIMIT 1`,
      [excludeId],
    );
    matchFilename = self?.filename || null;
  }
  return uniqueDisplayTitle(desired, matchFilename, rows);
}

export async function uniqueVersionFilename(
  db: Db,
  projectId: string,
  folderId: string | null | undefined,
  desired: string,
  excludeArtifactId: string | null = null,
) {
  const rows = await query(
    db,
    `SELECT v.filename FROM versions v
     JOIN artifacts a ON a.id=v.artifact_id
     LEFT JOIN version_recycle vr ON vr.version_id=v.id
     WHERE a.project_id=? AND a.deleted_at IS NULL AND vr.version_id IS NULL AND a.folder_id <=> ?
       AND v.id=(SELECT v2.id FROM versions v2 WHERE v2.artifact_id=a.id ORDER BY v2.version DESC, v2.created_at DESC, v2.id DESC LIMIT 1)
       ${excludeArtifactId ? "AND a.id<>?" : ""}`,
    [projectId, folderId, ...(excludeArtifactId ? [excludeArtifactId] : [])],
  );
  return nextDuplicateName(
    desired,
    rows.map((row) => row.filename),
  );
}

/** SQL fragment (leading AND) for artifacts in cache/output library areas. */
export const OUTPUT_LIBRARY_FOLDER_SQL = `
  AND f.folder_kind IN ('project_outputs','iteration_outputs')`;

export function isProjectLibraryRootKind(kind: unknown): boolean {
  return typeof kind === "string" && PROJECT_LIBRARY_ROOT_KINDS.includes(kind);
}

export function isProjectLibraryAreaRoot(row: LibraryFolderRow | null | undefined): boolean {
  return Boolean(row && isProjectLibraryRootKind(row.folder_kind) && !row.parent_id);
}

/** ISO date segment used for cache/output day folders — not for official taxonomy. */
export const LIBRARY_DATE_FOLDER_NAME = /^\d{4}-\d{2}-\d{2}$/;

export const PROJECT_LIBRARY_FOLDER_KINDS = [
  "project_official",
  "project_cache",
  "project_outputs",
  "project_miniprogram",
  "miniprogram_source",
  "miniprogram_web",
  "miniprogram_admin",
  "miniprogram_server",
  "iteration_cache",
  "iteration_outputs",
];

export function isRefableLibraryFolderRow(folder: LibraryFolderRow | null | undefined): boolean {
  if (!folder) return true;
  if (folder.folder_kind === "iteration_root") return false;
  if (folder.folder_kind == null) return true;
  return PROJECT_LIBRARY_FOLDER_KINDS.includes(folder.folder_kind);
}

export function filterProjectLibraryFolders<T extends LibraryFolderRow>(folders: T[]): T[] {
  return folders.filter((folder) => {
    if (folder.folder_kind === "iteration_root") return false;
    if (folder.folder_kind === "iteration_cache" || folder.folder_kind === "iteration_outputs")
      return !folder.thread_id;
    if (isProjectLibraryAreaRoot(folder)) return !folder.thread_id;
    if (folder.thread_id) return false;
    return true;
  });
}

/** 与 web/Documents 文档树可见性一致（含 cache/outputs 下的日期子文件夹）。 */
export function isVisibleLibraryTreeFolder(
  folder: LibraryFolderRow | null | undefined,
  folders: LibraryFolderRow[],
): boolean {
  if (!folder) return false;
  if (folder.folder_kind === "iteration_root") return false;
  if (folder.folder_kind === "iteration_cache" || folder.folder_kind === "iteration_outputs")
    return false;
  if (isProjectLibraryAreaRoot(folder)) return !folder.thread_id;
  return folderRootKindInList(folder.id, folders) !== null;
}

export function folderRootKindInList(
  folderId: string | null | undefined,
  folders: LibraryFolderRow[],
): string | null {
  if (!folderId) return null;
  let current = folders.find((f) => f.id === folderId);
  while (current) {
    if (isProjectLibraryAreaRoot(current)) return current.folder_kind ?? null;
    if (current.folder_kind === "iteration_cache") return "project_cache";
    if (current.folder_kind === "iteration_outputs") return "project_outputs";
    if (current.folder_kind === "iteration_root") return null;
    current = current.parent_id ? folders.find((f) => f.id === current?.parent_id) : undefined;
  }
  return null;
}

export function filterProjectLibraryVersions<T extends LibraryVersionRow>(versions: T[]): T[] {
  return versions.filter((version) => {
    if (version.deleted_at) return false;
    if (version.folder_kind === "iteration_root") return false;
    if (version.folder_thread_id) return false;
    if (version.folder_kind == null) return true;
    return PROJECT_LIBRARY_FOLDER_KINDS.includes(version.folder_kind);
  });
}

export async function ensureProjectLibraryRoots(db: Db, projectId: string) {
  const specs = [
    ["正式文件", "project_official", "project_official"],
    ["对话缓存", "project_cache", "project_cache"],
    ["沙箱产物", "project_outputs", "project_outputs"],
  ];
  for (const [name, systemKey, kind] of specs) {
    const [existing] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind=? AND thread_id IS NULL AND parent_id IS NULL LIMIT 1",
      [projectId, kind],
    );
    if (existing) continue;
    await query(
      db,
      "INSERT INTO document_folders(id,project_id,name,system_key,folder_kind) VALUES(?,?,?,?,?)",
      [randomUUID(), projectId, name, `${systemKey}:${projectId}`, kind],
    );
  }
}

export async function folderRootKind(
  db: Db,
  folderId: string | null | undefined,
): Promise<string | null> {
  if (!folderId) return null;
  let current = folderId;
  while (current) {
    const [row] = await query(
      db,
      "SELECT id,parent_id,folder_kind FROM document_folders WHERE id=?",
      [current],
    );
    if (!row) return null;
    if (isProjectLibraryAreaRoot(row)) return row.folder_kind;
    if (row.folder_kind === "iteration_root") return null;
    if (row.folder_kind === "iteration_cache" || row.folder_kind === "iteration_outputs")
      return row.folder_kind;
    current = row.parent_id;
  }
  return null;
}

export async function isOfficialLibraryFolder(
  db: Db,
  folderId: string | null | undefined,
): Promise<boolean> {
  return (await folderRootKind(db, folderId)) === "project_official";
}

/** SQL fragment (leading AND) for versions/artifacts in the unified project document library. */
export const DOCUMENT_LIBRARY_FOLDER_SQL = `
  AND (
    f.folder_kind IN ('project_official','project_cache','project_outputs','project_miniprogram',
      'miniprogram_source','miniprogram_web','miniprogram_admin','miniprogram_server')
    OR f.folder_kind IN ('iteration_cache','iteration_outputs')
    OR (f.folder_kind IS NULL AND EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT id,parent_id,folder_kind FROM document_folders WHERE id=f.parent_id
        UNION ALL
        SELECT p.id,p.parent_id,p.folder_kind FROM document_folders p
        JOIN ancestors child ON p.id=child.parent_id WHERE child.folder_kind IS NULL
      )
      SELECT 1 FROM ancestors
      WHERE (folder_kind IN ('project_official','project_cache','project_outputs','project_miniprogram') AND parent_id IS NULL)
        OR folder_kind IN ('iteration_cache','iteration_outputs')
    ))
  )`;

export async function latestVersionsByFolderRoots(
  db: Db,
  projectId: string,
  folderIds: unknown[],
): Promise<Map<string, FolderRootVersion[]>> {
  const ids = [
    ...new Set(
      (folderIds || []).filter((id): id is string => typeof id === "string" && Boolean(id)),
    ),
  ];
  const grouped = new Map<string, FolderRootVersion[]>(
    ids.map((id): [string, FolderRootVersion[]] => [id, []]),
  );
  if (!ids.length) return grouped;
  const placeholders = ids.map(() => "?").join(",");
  const rows = await query<FolderRootVersion>(
    db,
    `WITH RECURSIVE tree AS (
      SELECT id, id AS root_id FROM document_folders WHERE project_id=? AND id IN (${placeholders})
      UNION ALL
      SELECT f.id, t.root_id FROM document_folders f JOIN tree t ON f.parent_id=t.id WHERE f.project_id=?
    )
    SELECT t.root_id, v.id version_id, a.id artifact_id, a.title, v.filename, v.version
    FROM tree t
    JOIN artifacts a ON a.folder_id=t.id AND a.project_id=?
    JOIN versions v ON v.id=(SELECT v2.id FROM versions v2 WHERE v2.artifact_id=a.id
      ORDER BY v2.version DESC, v2.created_at DESC, v2.id DESC LIMIT 1)
    LEFT JOIN version_recycle vr ON vr.version_id=v.id
    WHERE a.deleted_at IS NULL AND vr.version_id IS NULL`,
    [projectId, ...ids, projectId, projectId],
  );
  for (const row of rows) {
    const list = grouped.get(row.root_id);
    if (list) list.push(row);
  }
  return grouped;
}
