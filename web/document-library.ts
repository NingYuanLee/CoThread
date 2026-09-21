export const LIBRARY_ROOT_KINDS = ["project_official", "project_outputs", "project_cache"] as const;

type LibraryFolderRef = {
  id: string;
  parent_id: string | null;
  folder_kind?: string | null;
};

export function folderRootKind(
  folderId: string | null | undefined,
  folders: LibraryFolderRef[],
): string | null {
  if (!folderId) return null;
  let current = folders.find((folder) => folder.id === folderId);
  while (current) {
    if (
      LIBRARY_ROOT_KINDS.includes(current.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number])
      && !current.parent_id
    )
      return current.folder_kind || null;
    if (current.folder_kind === "iteration_cache") return "project_cache";
    if (current.folder_kind === "iteration_outputs") return "project_outputs";
    const parentId = current.parent_id;
    current = parentId ? folders.find((folder) => folder.id === parentId) : undefined;
  }
  return null;
}
