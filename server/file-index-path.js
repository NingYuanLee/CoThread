import { query } from "./db.ts";

function pathFromFolders(folderId, byId) {
  const seen = new Set();
  const names = [];
  let current = folderId;
  while (current && !seen.has(current) && names.length < 64) {
    seen.add(current);
    const folder = byId.get(current);
    if (!folder) return "未知";
    names.unshift(
      String(folder.name || "")
        .replace(/[\r\n]+/g, " ")
        .trim(),
    );
    current = folder.parent_id;
  }
  if (current || !names.length) return "未知";
  return names.join(" / ");
}

export async function fileIndexFolderPath(db, projectId, folderId) {
  if (!folderId) return "未知";
  const rows = await query(
    db,
    "SELECT id,parent_id,name FROM document_folders WHERE project_id=?",
    [projectId],
  );
  return pathFromFolders(folderId, new Map(rows.map((row) => [row.id, row])));
}

/** Paths reflect the live tree even if a containing folder is renamed or moved. */
export async function hydrateFileIndexPaths(db, projectId, pages) {
  if (!pages.length) return pages;
  const files = await query(
    db,
    `SELECT fi.page_id pageId,a.folder_id folderId FROM file_index_entries fi
    JOIN artifacts a ON a.id=fi.artifact_id AND a.project_id=fi.project_id
    WHERE fi.project_id=? AND fi.page_id IN (${pages.map(() => "?").join(",")})`,
    [projectId, ...pages.map((page) => page.id)],
  );
  if (!files.length) return pages;
  const folders = await query(
    db,
    "SELECT id,parent_id,name FROM document_folders WHERE project_id=?",
    [projectId],
  );
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map(files.map((file) => [file.pageId, pathFromFolders(file.folderId, byId)]));
  return pages.map((page) =>
    paths.has(page.id)
      ? {
          ...page,
          body: String(page.body || "").replace(
            /^- 位置：[^\r\n]*$/m,
            () => `- 位置：${paths.get(page.id)}`,
          ),
        }
      : page,
  );
}
