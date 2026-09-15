import { query } from "./db.js";
import { randomUUID } from "node:crypto";

export const PROJECT_LIBRARY_ROOT_KINDS = [
  "project_official",
  "project_cache",
  "project_outputs",
];

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function isCacheFolderKind(kind) {
  return kind === "project_cache" || kind === "iteration_cache";
}

export function isOutputFolderKind(kind) {
  return kind === "project_outputs" || kind === "iteration_outputs";
}

/** SQL fragment (leading AND) for artifacts in cache/output library areas. */
export const OUTPUT_LIBRARY_FOLDER_SQL = `
  AND f.folder_kind IN ('project_outputs','iteration_outputs')`;

export function isProjectLibraryRootKind(kind) {
  return PROJECT_LIBRARY_ROOT_KINDS.includes(kind);
}

export function isProjectLibraryAreaRoot(row) {
  return row && isProjectLibraryRootKind(row.folder_kind) && !row.parent_id;
}

/** ISO date segment used for cache/output day folders — not for official taxonomy. */
export const LIBRARY_DATE_FOLDER_NAME = /^\d{4}-\d{2}-\d{2}$/;

export const PROJECT_LIBRARY_FOLDER_KINDS = [
  "project_official",
  "project_cache",
  "project_outputs",
  "iteration_cache",
  "iteration_outputs",
];

export function isRefableLibraryFolderRow(folder) {
  if (!folder) return true;
  if (folder.folder_kind === "iteration_root") return false;
  if (folder.folder_kind == null) return true;
  return PROJECT_LIBRARY_FOLDER_KINDS.includes(folder.folder_kind);
}

export function filterProjectLibraryFolders(folders) {
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
export function isVisibleLibraryTreeFolder(folder, folders) {
  if (!folder) return false;
  if (folder.folder_kind === "iteration_root") return false;
  if (folder.folder_kind === "iteration_cache" || folder.folder_kind === "iteration_outputs")
    return false;
  if (isProjectLibraryAreaRoot(folder)) return !folder.thread_id;
  return folderRootKindInList(folder.id, folders) !== null;
}

export function folderRootKindInList(folderId, folders) {
  if (!folderId) return null;
  let current = folders.find((f) => f.id === folderId);
  while (current) {
    if (isProjectLibraryAreaRoot(current)) return current.folder_kind;
    if (current.folder_kind === "iteration_cache") return "project_cache";
    if (current.folder_kind === "iteration_outputs") return "project_outputs";
    if (current.folder_kind === "iteration_root") return null;
    current = current.parent_id ? folders.find((f) => f.id === current.parent_id) : undefined;
  }
  return null;
}

export function filterProjectLibraryVersions(versions) {
  return versions.filter((version) => {
    if (version.deleted_at) return false;
    if (version.folder_kind === "iteration_root") return false;
    if (version.folder_thread_id) return false;
    if (version.folder_kind == null) return true;
    return PROJECT_LIBRARY_FOLDER_KINDS.includes(version.folder_kind);
  });
}

export async function ensureProjectLibraryRoots(db, projectId) {
  const specs = [
    ["正式文件", "project_official", "project_official"],
    ["缓存文件", "project_cache", "project_cache"],
    ["产物文件", "project_outputs", "project_outputs"],
  ];
  for (const [name, systemKey, kind] of specs) {
    const [existing] = await query(db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind=? AND thread_id IS NULL AND parent_id IS NULL LIMIT 1",
      [projectId, kind]);
    if (existing) continue;
    await query(db,
      "INSERT INTO document_folders(id,project_id,name,system_key,folder_kind) VALUES(?,?,?,?,?)",
      [randomUUID(), projectId, name, `${systemKey}:${projectId}`, kind]);
  }
}

export async function folderRootKind(db, folderId) {
  if (!folderId) return null;
  let current = folderId;
  while (current) {
    const [row] = await query(db,
      "SELECT id,parent_id,folder_kind FROM document_folders WHERE id=?",
      [current]);
    if (!row) return null;
    if (isProjectLibraryAreaRoot(row)) return row.folder_kind;
    if (row.folder_kind === "iteration_root") return null;
    if (row.folder_kind === "iteration_cache" || row.folder_kind === "iteration_outputs")
      return row.folder_kind;
    current = row.parent_id;
  }
  return null;
}

export async function isOfficialLibraryFolder(db, folderId) {
  return (await folderRootKind(db, folderId)) === "project_official";
}

/** SQL fragment (leading AND) for versions/artifacts in the unified project document library. */
export const DOCUMENT_LIBRARY_FOLDER_SQL = `
  AND (
    f.folder_kind IN ('project_official','project_cache','project_outputs')
    OR f.folder_kind IN ('iteration_cache','iteration_outputs')
  )`;
