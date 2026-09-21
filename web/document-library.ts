export const LIBRARY_ROOT_KINDS = ["project_official", "project_outputs", "project_cache"] as const;

export const LIBRARY_ROOT_LABELS: Record<(typeof LIBRARY_ROOT_KINDS)[number], string> = {
  project_official: "正式文件",
  project_outputs: "沙箱产物",
  project_cache: "对话缓存",
};

type LibraryFolderRef = {
  id: string;
  parent_id: string | null;
  name?: string;
  folder_kind?: string | null;
};

export function libraryFolderPath(
  folderId: string | null | undefined,
  folders: LibraryFolderRef[],
): string {
  if (!folderId) return "";
  const names: string[] = [];
  let current = folders.find((folder) => folder.id === folderId) || null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const kind = current.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number] | undefined;
    const label = !current.parent_id && kind && LIBRARY_ROOT_LABELS[kind]
      ? LIBRARY_ROOT_LABELS[kind]
      : current.name || current.id;
    names.unshift(label);
    current = current.parent_id ? folders.find((folder) => folder.id === current?.parent_id) || null : null;
  }
  return names.join(" / ");
}

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
