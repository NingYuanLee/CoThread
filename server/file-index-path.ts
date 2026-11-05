import { query } from "./db.ts";
import type { Db } from "./types.ts";

/** `document_folders` 的一行；拼路径只需要这三列。 */
type FolderRow = { id: string; parent_id?: string | null; name?: unknown };

/** 文件索引页面：`body` 会被替换掉「位置」那一行。 */
export type FileIndexPage = { id: string; body?: unknown; [field: string]: unknown };

/** 从叶子往上拼文件夹路径；成环或超过 64 层一律返回「未知」。 */
function pathFromFolders(
  folderId: string | null | undefined,
  byId: Map<string, FolderRow>,
): string {
  const seen = new Set<string>();
  const names: string[] = [];
  let current: string | null | undefined = folderId;
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

export async function fileIndexFolderPath(
  db: Db,
  projectId: string,
  folderId: string | null | undefined,
): Promise<string> {
  if (!folderId) return "未知";
  const rows = await query<FolderRow>(
    db,
    "SELECT id,parent_id,name FROM document_folders WHERE project_id=?",
    [projectId],
  );
  return pathFromFolders(folderId, new Map(rows.map((row) => [row.id, row])));
}

/** Paths reflect the live tree even if a containing folder is renamed or moved. */
export async function hydrateFileIndexPaths(
  db: Db,
  projectId: string,
  pages: FileIndexPage[],
): Promise<FileIndexPage[]> {
  if (!pages.length) return pages;
  const files = await query<{ pageId: string; folderId?: string | null }>(
    db,
    `SELECT fi.page_id pageId,a.folder_id folderId FROM file_index_entries fi
    JOIN artifacts a ON a.id=fi.artifact_id AND a.project_id=fi.project_id
    WHERE fi.project_id=? AND fi.page_id IN (${pages.map(() => "?").join(",")})`,
    [projectId, ...pages.map((page) => page.id)],
  );
  if (!files.length) return pages;
  const folders = await query<FolderRow>(
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
