import { readJsonResponse } from "../shared/json-response.js";
import { apiFetch } from "./api-fetch";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";
import { Document, Notebook } from "@react-symbols/icons/files";
const officeIcons = {
  doc: Document,
  docx: Document,
  odt: Document,
  rtf: Document,
  ppt: Notebook,
  pptx: Notebook,
  odp: Notebook,
};

function LibraryFileMenu({
  menuId,
  openMenuId,
  onOpenMenuChange,
  disabled,
  canRename,
  canDelete,
  canSaveToOfficial,
  onDownload,
  onRename,
  onDelete,
  onSaveToOfficial,
}: {
  menuId: string;
  openMenuId: string | null;
  onOpenMenuChange: (id: string | null) => void;
  disabled?: boolean;
  canRename?: boolean;
  canDelete?: boolean;
  canSaveToOfficial?: boolean;
  onDownload: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onSaveToOfficial?: () => void;
}) {
  const open = openMenuId === menuId;
  const anchorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) onOpenMenuChange(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open, onOpenMenuChange]);
  const close = () => onOpenMenuChange(null);
  return (
    <span className="tree-folder-menu-anchor" ref={anchorRef}>
      <button
        type="button"
        className={`tree-menu-trigger${open ? " active" : ""}`}
        title="文件操作"
        aria-label="文件操作"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onOpenMenuChange(open ? null : menuId);
        }}
      >
        <TreeIcon kind="actions" />
      </button>
      {open ? (
        <div className="library-folder-menu" role="menu" onClick={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onDownload(); close(); }}>
            <TreeIcon kind="download" />
            <span>下载</span>
          </button>
          {canRename && onRename ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onRename(); close(); }}>
              <TreeIcon kind="rename" />
              <span>重命名</span>
            </button>
          ) : null}
          {canSaveToOfficial && onSaveToOfficial ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onSaveToOfficial(); close(); }}>
              <TreeIcon kind="saveOfficial" />
              <span>另存至正式文件</span>
            </button>
          ) : null}
          {canDelete && onDelete ? (
            <button type="button" role="menuitem" className="library-folder-menu-item danger" onClick={() => { onDelete(); close(); }}>
              <TreeIcon kind="trash" />
              <span>删除</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

function OfficialFolderMenu({
  menuId,
  openMenuId,
  onOpenMenuChange,
  disabled,
  isRoot,
  onUpload,
  onNewFolder,
  onRename,
  onDelete,
}: {
  menuId: string;
  openMenuId: string | null;
  onOpenMenuChange: (id: string | null) => void;
  disabled?: boolean;
  isRoot?: boolean;
  onUpload: () => void;
  onNewFolder: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const open = openMenuId === menuId;
  const anchorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) onOpenMenuChange(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open, onOpenMenuChange]);
  const close = () => onOpenMenuChange(null);
  return (
    <span className="tree-folder-menu-anchor" ref={anchorRef}>
      <button
        type="button"
        className={`tree-menu-trigger${open ? " active" : ""}`}
        title="文件夹操作"
        aria-label="文件夹操作"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onOpenMenuChange(open ? null : menuId);
        }}
      >
        <TreeIcon kind="actions" />
      </button>
      {open ? (
        <div className="library-folder-menu" role="menu" onClick={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onUpload(); close(); }}>
            <TreeIcon kind="upload" />
            <span>上传文件</span>
          </button>
          <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onNewFolder(); close(); }}>
            <TreeIcon kind="newFolder" />
            <span>新建文件夹</span>
          </button>
          {!isRoot && onRename ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onRename(); close(); }}>
              <TreeIcon kind="rename" />
              <span>重命名</span>
            </button>
          ) : null}
          {!isRoot && onDelete ? (
            <button type="button" role="menuitem" className="library-folder-menu-item danger" onClick={() => { onDelete(); close(); }}>
              <TreeIcon kind="trash" />
              <span>删除</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

function TreeIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    folder: "M3 6h6l2 2h10v11H3Z",
    file: "M6 3h8l4 4v14H6Z M14 3v5h5",
    chevron: "m9 5 6 7-6 7",
    newFolder: "M3 6h6l2 2h10v11H3Z M12 11v5 M9.5 13.5h5",
    newFile: "M6 3h8l4 4v14H6Z M9 14h6 M12 11v6",
    upload: "M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6",
    trash: "M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
    back: "m9 5-6 7 6 7 M3 12h18",
    rename: "m14 4 6 6 M4 20l4-1L21 6a2 2 0 0 0-3-3L5 16Z",
    sortType: "M4 6h10 M4 12h7 M4 18h4 M17 5v14 M14 16l3 3 3-3",
    sortModified: "M12 8v5l3 2 M21 12a9 9 0 1 1-2.6-6.35 M21 4v6h-6",
    actions: "M5 7h14M5 12h14M5 17h14",
    download: "M12 3v10 M8 9l4-4 4 4 M5 19h14",
    restore: "M4 12a8 8 0 1 0 2.3-5.7 M4 4v6h6",
  };
  return (
    <svg
      aria-hidden="true"
      className="tree-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[kind] || paths.file} />
    </svg>
  );
}

export type LibraryVersion = {
  id: string;
  artifact_id: string;
  folder_id?: string | null;
  folder_thread_id?: string | null;
  folder_kind?: string | null;
  deleted_at?: string | null;
  artifact_deleted_at?: string | null;
  version_deleted_at?: string | null;
  recycle_path?: { id: string; name: string }[] | string | null;
  updated_at?: string;
  title: string;
  version: number;
  filename: string;
  review: string | null;
  byte_size: number;
  author: string;
  thread_id: string;
};

type LibraryFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  updated_at?: string;
  system_key?: string | null;
  thread_id?: string | null;
  folder_kind?: string | null;
};

function fileLabel(version: LibraryVersion) {
  const dot = version.filename.lastIndexOf(".");
  const suffix = dot > 0 && dot < version.filename.length - 1
    ? version.filename.slice(dot)
    : "";
  return suffix && !version.title.toLowerCase().endsWith(suffix.toLowerCase())
    ? `${version.title}${suffix}`
    : version.title;
}

function recyclePathNodes(item: LibraryVersion) {
  const value = item.recycle_path;
  const rows = typeof value === "string" ? (() => { try { return JSON.parse(value); } catch { return []; } })() : value;
  return Array.isArray(rows) ? rows.filter((node) => node?.name) : [];
}

function recyclePathLabel(item: LibraryVersion, folders: LibraryFolder[]) {
  const saved = recyclePathNodes(item).map((node) => node.name);
  if (saved.length) return saved.join(" / ");
  const names: string[] = [];
  let current = folders.find((folder) => folder.id === item.folder_id) || null;
  while (current) {
    names.unshift(current.name);
    current = folders.find((folder) => folder.id === current?.parent_id) || null;
  }
  return names.join(" / ");
}

const LIBRARY_ROOT_KINDS = ["project_official", "project_outputs", "project_cache"] as const;
const ROOT_DISPLAY_ORDER = [...LIBRARY_ROOT_KINDS];
const ROOT_LABELS: Record<(typeof LIBRARY_ROOT_KINDS)[number], string> = {
  project_official: "正式文件",
  project_outputs: "产物文件",
  project_cache: "缓存文件",
};

const DEFAULT_OFFICIAL_FOLDER_NAME = "新建文件夹";

export function suggestOfficialFolderName() {
  return DEFAULT_OFFICIAL_FOLDER_NAME;
}

function resolveLibraryRoot(
  kind: (typeof LIBRARY_ROOT_KINDS)[number],
  folders: LibraryFolder[],
): LibraryFolder | undefined {
  const modern = folders.find(
    (f) => f.folder_kind === kind && !f.thread_id && !f.parent_id,
  );
  if (modern) return modern;
  if (kind === "project_official")
    return folders.find((f) => f.folder_kind === "project_official" && !f.parent_id);
  return undefined;
}

export function folderRootKind(
  folderId: string | null | undefined,
  folders: LibraryFolder[],
): string | null {
  if (!folderId) return null;
  let current = folders.find((f) => f.id === folderId);
  while (current) {
    if (
      LIBRARY_ROOT_KINDS.includes(current.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number])
      && !current.parent_id
    )
      return current.folder_kind || null;
    if (current.folder_kind === "iteration_cache") return "project_cache";
    if (current.folder_kind === "iteration_outputs") return "project_outputs";
    if (current.folder_kind === "iteration_root") {
      current = current.parent_id
        ? folders.find((f) => f.id === current!.parent_id)
        : undefined;
      continue;
    }
    current = current.parent_id
      ? folders.find((f) => f.id === current!.parent_id)
      : undefined;
  }
  return null;
}

export function isInProjectLibrary(
  folderId: string | null | undefined,
  folders: LibraryFolder[],
) {
  return folderRootKind(folderId, folders) !== null;
}

export function organizableDocuments(
  versions: LibraryVersion[],
  folders: LibraryFolder[],
) {
  const officialRoot = resolveLibraryRoot("project_official", folders);
  if (!officialRoot) return [];
  const officialFolderIds = new Set<string>([officialRoot.id]);
  const walk = (parentId: string) => {
    for (const folder of folders) {
      if (folder.parent_id !== parentId) continue;
      officialFolderIds.add(folder.id);
      walk(folder.id);
    }
  };
  walk(officialRoot.id);
  const latest = new Map<string, LibraryVersion>();
  for (const item of versions) {
    if (item.deleted_at || !item.folder_id || !officialFolderIds.has(item.folder_id))
      continue;
    const prev = latest.get(item.artifact_id);
    if (!prev || item.version > prev.version) latest.set(item.artifact_id, item);
  }
  return [...latest.values()];
}
export function Documents({
  embedded = false,
  onOpen,
  onReview,
  projectId,
  threadId,
  writable,
  iterationWritable = false,
  folders,
  onRefresh,
  versions,
  selected,
  onSelect,
  onClose,
  onReference,
  organizationJobs = [],
}: {
  embedded?: boolean;
  onOpen?: (versionId: string) => void;
  onReview?: (versionId: string, decision: string) => Promise<void>;
  projectId: string;
  threadId?: string;
  writable: boolean;
  iterationWritable?: boolean;
  folders: LibraryFolder[];
  onRefresh: () => Promise<void>;
  versions: LibraryVersion[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onReference?: (id: string) => void;
  organizationJobs?: { thread_id?: string | null; scope: "iteration" | "project"; status: string; error?: string | null }[];
}) {
  const libraryFolders = folders.filter((folder) => {
    if (folder.folder_kind === "iteration_root") return false;
    if (folder.folder_kind === "iteration_cache" || folder.folder_kind === "iteration_outputs")
      return false;
    // 日期子文件夹与根目录同为 project_cache / project_outputs，必须靠 parent_id 区分
    if (
      LIBRARY_ROOT_KINDS.includes(folder.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number])
      && !folder.parent_id
    )
      return !folder.thread_id;
    return isInProjectLibrary(folder.id, folders);
  });
  const libraryRoots = ROOT_DISPLAY_ORDER
    .map((kind) => resolveLibraryRoot(kind, folders))
    .filter(Boolean) as LibraryFolder[];
  const libraryVersions = versions.filter((item) => isInProjectLibrary(item.folder_id, folders));
  const organization = organizationJobs.find(
    (job) => job.scope === "project" && !job.thread_id,
  );
  const organizing = !!(organization && ["queued", "running"].includes(organization.status));
  const canOrganizeOfficial = organizableDocuments(libraryVersions, libraryFolders).length > 0;
  const officialWritable = writable && !organizing;
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      for (const kind of LIBRARY_ROOT_KINDS) {
        if (kind === "project_official") continue;
        const root = resolveLibraryRoot(kind, folders);
        if (!root) continue;
        if (folders.some((f) => f.parent_id === root.id)) next.delete(root.id);
      }
      return next;
    });
  }, [folders]);
  const [trash, setTrash] = useState(false);
  const [sort, setSort] = useState<"type" | "modified">("type");
  const collator = new Intl.Collator("zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
  const modified = (a: { updated_at?: string }, b: { updated_at?: string }) =>
    (b.updated_at || "").localeCompare(a.updated_at || "");
  const extension = (filename: string) =>
    filename.includes(".")
      ? filename.split(".").pop()?.toLowerCase() || ""
      : "";

  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [newFolder, setNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [draggedArtifactId, setDraggedArtifactId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [openFileMenuId, setOpenFileMenuId] = useState<string | null>(null);
  const officialRoot = libraryRoots.find((f) => f.folder_kind === "project_official");
  const officialFolderParentId = (() => {
    if (!folderId) return officialRoot?.id || null;
    if (folderRootKind(folderId, folders) !== "project_official") return officialRoot?.id || null;
    return folderId;
  })();
  const canManageOfficialFolders = officialWritable && !!officialRoot;
  const selectedLibraryFolder = folderId
    ? libraryFolders.find((f) => f.id === folderId)
    : undefined;
  const showOfficialFolderPanel = !!(
    canManageOfficialFolders
    && selectedLibraryFolder
    && folderRootKind(selectedLibraryFolder.id, libraryFolders) === "project_official"
    && !selectedLibraryFolder.system_key
  );
  const canRenameDeleteOfficialFolder = !!(
    showOfficialFolderPanel
    && selectedLibraryFolder?.folder_kind !== "project_official"
  );
  const selectFolder = (id: string | null) => {
    setFolderId(id);
    onSelect("");
    setRenaming(false);
    setView(null);
    setError("");
  };
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const officialUploadFolderId = (() => {
    if (!officialRoot || !officialWritable) return null;
    if (!folderId) return officialRoot.id;
    if (folderRootKind(folderId, libraryFolders) === "project_official") return folderId;
    return officialRoot.id;
  })();
  const change = async (path: string, data: unknown, method = "POST") => {
    const payload = data && typeof data === "object" && !Array.isArray(data)
      ? { ...(data as Record<string, unknown>), ...(threadId ? { threadId } : {}) }
      : data;
    const res = await apiFetch(`/api${path}`, {
      method,
      ...(payload !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        : {}),
    });
    const result = await readJsonResponse(res, `/api${path}`);
    return result;
  };
  const uploadOfficialFiles = (files: FileList | File[]) => {
    if (!officialUploadFolderId) return;
    void act(async () => {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} 超过单文件 5 MiB 上限`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        const title = file.name.replace(/\.[^.]+$/, "") || file.name;
        const created = await change(
          `/projects/${projectId}/documents/upload`,
          {
            folderId: officialUploadFolderId,
            title,
            filename: file.name,
            mime: file.type || "application/octet-stream",
            contentBase64: btoa(binary),
          },
        ) as { id: string };
        onSelect(created.id);
      }
    });
  };
  const act = async (fn: () => Promise<void>) => {
    setPending(true);
    setActionError("");
    try {
      await fn();
      await onRefresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<{
    text?: string;
    url?: string;
    kind: string;
    mime: string;
  } | null>(null);
  const [error, setError] = useState("");
  const version = libraryVersions.find((v) => v.id === selected);
  const artifacts = libraryVersions
    .filter((v) => Boolean(v.deleted_at) === trash)
    .filter(
      (v, i, list) =>
        list.findIndex((x) => x.artifact_id === v.artifact_id) === i,
    )
    .filter((v) => Boolean(v.deleted_at) === trash)
    .sort(
      (a, b) =>
        (sort === "modified"
          ? modified(a, b)
          : collator.compare(extension(a.filename), extension(b.filename))) ||
        collator.compare(fileLabel(a), fileLabel(b)) ||
        a.artifact_id.localeCompare(b.artifact_id),
    )
    .filter((v) =>
      `${v.title} ${v.filename}`.toLowerCase().includes(filter.toLowerCase()),
    );
  useEffect(() => {
    setView(null);
    setError("");
    if (!selected || embedded) return;
    let alive = true;
    let objectUrl = "";
    apiFetch(`/api/versions/${selected}`)
      .then(async (res) => {
        const result = await readJsonResponse(res, `/api/versions/${selected}`);
        return result;
      })
      .then((v) => {
        if (!alive) return;
        const bytes = Uint8Array.from(atob(v.contentBase64), (c) =>
          c.charCodeAt(0),
        );
        const name = v.filename.toLowerCase();
        const imageMime: Record<string, string> = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
        };
        const extension = name.split(".").pop();
        if (imageMime[extension]) {
          objectUrl = URL.createObjectURL(
            new Blob([bytes], { type: imageMime[extension] }),
          );
          setView({
            kind: "image",
            url: objectUrl,
            mime: imageMime[extension],
          });
        } else if (name.endsWith(".pdf")) {
          objectUrl = URL.createObjectURL(
            new Blob([bytes], { type: "application/pdf" }),
          );
          setView({ kind: "pdf", url: objectUrl, mime: "application/pdf" });
        } else if (
          v.mime.startsWith("text/") ||
          /\.(md|txt|csv|json|py|js|ts|tsx|jsx|html|css|sql|xml|yaml|yml|sh|log)$/.test(
            name,
          )
        )
          setView({
            kind: name.endsWith(".md") ? "markdown" : "text",
            text: new TextDecoder().decode(bytes).slice(0, 200000),
            mime: v.mime,
          });
        else setView({ kind: "download", mime: v.mime });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected, embedded]);
  useEffect(() => {
    setFolderId(libraryRoots[0]?.id || null);
    onSelect("");
    setRenaming(false);
    setTrash(false);
  }, [threadId, projectId]);
  const fileAreaKind = (item: LibraryVersion) =>
    folderRootKind(item.folder_id, libraryFolders);
  const canEditOfficial = (item: LibraryVersion) =>
    officialWritable && !item.deleted_at && fileAreaKind(item) === "project_official";
  const canManageFile = (item: LibraryVersion) =>
    writable && !item.deleted_at && fileAreaKind(item) !== null;
  const isCacheVersion = (item: LibraryVersion) => fileAreaKind(item) === "project_cache";
  const isOutputVersion = (item: LibraryVersion) => fileAreaKind(item) === "project_outputs";
  const canSaveToOfficial = (item: LibraryVersion) =>
    writable && !organizing && !item.deleted_at && (isCacheVersion(item) || isOutputVersion(item));
  const canDragOfficialFolder = (folder: LibraryFolder) =>
    canManageOfficialFolders
    && folderRootKind(folder.id, libraryFolders) === "project_official"
    && !folder.system_key
    && !(folder.folder_kind === "project_official" && !folder.parent_id);
  const startRenameFile = (item: LibraryVersion) => {
    onSelect(item.id);
    setRenameName(item.title);
    setRenaming(true);
    setNewFolder(false);
    setRenamingFolder(false);
  };
  const deleteFile = (item: LibraryVersion) => {
    if (!window.confirm(`删除「${item.title}」及其全部版本？将移入回收站。`)) return;
    void act(async () => {
      await change(
        `/projects/${projectId}/artifacts/${item.artifact_id}`,
        { deleted: true },
        "PATCH",
      );
      if (selected === item.id) onSelect("");
    });
  };
  const restoreFile = (item: LibraryVersion) => {
    void act(async () => {
      if (item.artifact_deleted_at) {
        await change(
          `/projects/${projectId}/artifacts/${item.artifact_id}`,
          { deleted: false },
          "PATCH",
        );
      } else if (item.version_deleted_at) {
        await change(
          `/projects/${projectId}/versions/${item.id}`,
          { deleted: false },
          "PATCH",
        );
      }
      onSelect(item.id);
      setTrash(false);
    });
  };
  const saveFileToOfficial = (item: LibraryVersion) => {
    void act(async () => {
      await change(
        `/projects/${projectId}/versions/${item.id}/save-to-official`,
        {},
      );
    });
  };
  const triggerOrganize = () => act(async () => {
    await change(`/projects/${projectId}/documents/organize`, {});
    onSelect("");
    setOrganizeOpen(false);
  });
  const isOfficialDropFolder = (targetFolderId: string) =>
    folderRootKind(targetFolderId, libraryFolders) === "project_official";
  const moveArtifactToFolder = (artifactId: string, targetFolderId: string) => {
    if (!isOfficialDropFolder(targetFolderId)) return;
    void act(async () => {
      await change(
        `/projects/${projectId}/artifacts/${artifactId}`,
        { folderId: targetFolderId },
        "PATCH",
      );
    });
  };
  const moveFolderToParent = (folderId: string, parentId: string) => {
    if (!isOfficialDropFolder(parentId) || folderId === parentId) return;
    void act(async () => {
      await change(
        `/projects/${projectId}/folders/${folderId}`,
        { parentId },
        "PATCH",
      );
    });
  };
  const folderDropHandlers = (targetFolderId: string) => ({
    onDragOver: (event: React.DragEvent) => {
      if (organizing || !officialWritable) return;
      if (!isOfficialDropFolder(targetFolderId)) return;
      if (!draggedArtifactId && !draggedFolderId) return;
      if (draggedFolderId === targetFolderId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTargetFolderId(targetFolderId);
    },
    onDragLeave: () => {
      setDropTargetFolderId((current) => (current === targetFolderId ? null : current));
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDropTargetFolderId(null);
      const artifactId = event.dataTransfer.getData("application/x-cothread-artifact") || draggedArtifactId;
      const folderDragId = event.dataTransfer.getData("application/x-cothread-folder") || draggedFolderId;
      if (artifactId) moveArtifactToFolder(artifactId, targetFolderId);
      else if (folderDragId && folderDragId !== targetFolderId)
        moveFolderToParent(folderDragId, targetFolderId);
      setDraggedArtifactId(null);
      setDraggedFolderId(null);
    },
  });
  const openNewFolder = (targetId: string) => {
    selectFolder(targetId);
    setNewFolder(true);
    setNewFolderName(suggestOfficialFolderName(targetId, libraryFolders));
    setRenamingFolder(false);
  };
  const openRenameFolder = (target: LibraryFolder) => {
    selectFolder(target.id);
    setRenameFolderName(target.name);
    setRenamingFolder(true);
    setNewFolder(false);
  };
  const deleteFolder = (target: LibraryFolder) => {
    if (!window.confirm(`删除文件夹「${target.name}」？其中文档将移入回收站。`)) return;
    void act(async () => {
      await change(`/projects/${projectId}/folders/${target.id}`, undefined, "DELETE");
      selectFolder(target.parent_id || officialRoot?.id || null);
    });
  };
  const fileRow = (v: LibraryVersion, depth: number) => (
    <div
      className={`tree-file ${version?.artifact_id === v.artifact_id ? "selected" : ""}${draggedArtifactId === v.artifact_id ? " dragging" : ""}`}
      key={v.artifact_id}
      style={{ paddingLeft: depth * 14 }}
      role="treeitem"
      aria-selected={version?.artifact_id === v.artifact_id}
      draggable={canEditOfficial(v) && !pending}
      onDragStart={(event) => {
        if (!canEditOfficial(v)) return;
        setOpenFileMenuId(null);
        setOpenFolderMenuId(null);
        event.dataTransfer.setData("application/x-cothread-artifact", v.artifact_id);
        event.dataTransfer.effectAllowed = "move";
        setDraggedArtifactId(v.artifact_id);
      }}
      onDragEnd={() => {
        setDraggedArtifactId(null);
        setDropTargetFolderId(null);
      }}
    >
      <button
        className="tree-name"
        disabled={organizing && folderRootKind(v.folder_id, libraryFolders) === "project_official"}
        onClick={() => {
          onSelect(v.id);
          if (embedded) onOpen?.(v.id);
          setFolderId(v.folder_id || null);
        }}
        title={`${v.title} · ${v.filename} · v${v.version}${trash && recyclePathLabel(v, libraryFolders) ? ` · ${recyclePathLabel(v, libraryFolders)}` : ""}`}
      >
        <span className="tree-file-indent" />
        <FileIcon
          fileName={v.filename}
          editFileExtensionData={officeIcons}
          autoAssign
          className="tree-icon file-type-icon"
          aria-hidden="true"
          width={16}
          height={16}
        />
        <span className="tree-file-copy">
          <span>{fileLabel(v)}</span>
          {trash && recyclePathLabel(v, libraryFolders) ? <small>{recyclePathLabel(v, libraryFolders)}</small> : null}
        </span>
      </button>
      {onReference && !trash && (
        <button
          className="tree-quick"
          title="/ 引用文档"
          aria-label={`引用 ${v.title}`}
          onClick={() => onReference(v.id)}
        >
          /
        </button>
      )}
      {trash && writable ? (
        <button
          type="button"
          className="tree-restore"
          title="原路恢复"
          aria-label="原路恢复"
          disabled={pending}
          onClick={() => restoreFile(v)}
        >
          <TreeIcon kind="restore" />
        </button>
      ) : !trash ? (
        <LibraryFileMenu
          menuId={v.artifact_id}
          openMenuId={openFileMenuId}
          onOpenMenuChange={(id) => {
            setOpenFileMenuId(id);
            if (id) setOpenFolderMenuId(null);
          }}
          disabled={pending}
          canRename={canManageFile(v)}
          canDelete={canManageFile(v)}
          canSaveToOfficial={canSaveToOfficial(v)}
          onDownload={() => {
            window.open(`/api/versions/${v.id}/download`, "_blank", "noopener,noreferrer");
          }}
          onRename={() => startRenameFile(v)}
          onDelete={() => deleteFile(v)}
          onSaveToOfficial={() => saveFileToOfficial(v)}
        />
      ) : null}
    </div>
  );
  const tree = (parent: string | null, depth = 0): React.ReactNode => (
    <>
      {libraryFolders
        .filter((f) => f.parent_id === parent)
        .sort(
          (a, b) =>
            (sort === "modified" ? modified(a, b) : 0) ||
            collator.compare(a.name, b.name) ||
            a.id.localeCompare(b.id),
        )
        .map((f) => (
          <div key={f.id} role="treeitem" aria-expanded={!collapsed.has(f.id)}>
            <div
              className={`tree-folder ${folderId === f.id ? "selected" : ""}${dropTargetFolderId === f.id ? " drop-target" : ""}${draggedFolderId === f.id ? " dragging" : ""}`}
              style={{ paddingLeft: depth * 14 }}
              draggable={canDragOfficialFolder(f) && !pending}
              onDragStart={(event) => {
                if (!canDragOfficialFolder(f)) return;
                setOpenFileMenuId(null);
                setOpenFolderMenuId(null);
                event.dataTransfer.setData("application/x-cothread-folder", f.id);
                event.dataTransfer.effectAllowed = "move";
                setDraggedFolderId(f.id);
              }}
              onDragEnd={() => {
                setDraggedFolderId(null);
                setDropTargetFolderId(null);
              }}
              {...(canManageOfficialFolders
                && folderRootKind(f.id, libraryFolders) === "project_official"
                && !f.system_key
                ? folderDropHandlers(f.id)
                : {})}
            >
              <button
                className={`tree-toggle ${collapsed.has(f.id) ? "" : "expanded"}`}
                disabled={organizing && folderRootKind(f.id, libraryFolders) === "project_official"}
                aria-label={`${collapsed.has(f.id) ? "展开" : "折叠"} ${f.name}`}
                onClick={() =>
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    next.has(f.id) ? next.delete(f.id) : next.add(f.id);
                    return next;
                  })
                }
              >
                <TreeIcon kind="chevron" />
              </button>
              <button
                className="tree-name"
                disabled={organizing && folderRootKind(f.id, libraryFolders) === "project_official"}
                onClick={() => selectFolder(f.id)}
              >
                <FolderIcon
                  folderName={f.name}
                  className="tree-icon file-type-icon"
                  aria-hidden="true"
                  width={16}
                  height={16}
                />
                <span>{f.name}</span>
              </button>
              {canManageOfficialFolders
                && folderRootKind(f.id, libraryFolders) === "project_official"
                && !f.system_key
                && f.folder_kind !== "project_official" ? (
                <OfficialFolderMenu
                  menuId={f.id}
                  openMenuId={openFolderMenuId}
                  onOpenMenuChange={setOpenFolderMenuId}
                  disabled={pending}
                  onUpload={() => {
                    selectFolder(f.id);
                    uploadInputRef.current?.click();
                  }}
                  onNewFolder={() => openNewFolder(f.id)}
                  onRename={() => openRenameFolder(f)}
                  onDelete={() => deleteFolder(f)}
                />
              ) : null}
            </div>
            {!collapsed.has(f.id) && (
              <div role="group">{tree(f.id, depth + 1)}</div>
            )}
          </div>
        ))}
      {artifacts
        .filter((v) => (v.folder_id || null) === parent)
        .map((v) => fileRow(v, depth))}
    </>
  );
  const renderLibraryRoot = (root: LibraryFolder) => (
    <div key={root.id} role="treeitem" aria-expanded={!collapsed.has(root.id)}>
      <div
        className={`tree-folder tree-library-root ${folderId === root.id ? "selected" : ""}${dropTargetFolderId === root.id ? " drop-target" : ""}`}
        {...(root.folder_kind === "project_official" && canManageOfficialFolders
          ? folderDropHandlers(root.id)
          : {})}
      >
        <button
          className={`tree-toggle ${collapsed.has(root.id) ? "" : "expanded"}`}
          disabled={root.folder_kind === "project_official" && organizing}
          aria-label={`${collapsed.has(root.id) ? "展开" : "折叠"} ${root.name}`}
          onClick={() =>
            setCollapsed((previous) => {
              const next = new Set(previous);
              next.has(root.id) ? next.delete(root.id) : next.add(root.id);
              return next;
            })
          }
        >
          <TreeIcon kind="chevron" />
        </button>
        <button
          className="tree-name"
          disabled={root.folder_kind === "project_official" && organizing}
          onClick={() => selectFolder(root.id)}
        >
          <FolderIcon
            folderName={root.name}
            className="tree-icon file-type-icon"
            aria-hidden="true"
            width={16}
            height={16}
          />
          <span>{ROOT_LABELS[root.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number]] || root.name}</span>
        </button>
        {root.folder_kind === "project_official" ? (
          <span className="tree-root-actions">
            {writable ? (
              <button
                type="button"
                className="tree-organize"
                title="正式文件整理"
                aria-label="正式文件整理"
                disabled={organizing || pending}
                onClick={() => setOrganizeOpen(true)}
              >
                <TreeIcon kind="sortType" />
              </button>
            ) : null}
            {canManageOfficialFolders ? (
              <OfficialFolderMenu
                menuId={root.id}
                openMenuId={openFolderMenuId}
                onOpenMenuChange={setOpenFolderMenuId}
                disabled={pending}
                isRoot
                onUpload={() => {
                  selectFolder(root.id);
                  uploadInputRef.current?.click();
                }}
                onNewFolder={() => openNewFolder(root.id)}
              />
            ) : null}
          </span>
        ) : null}
      </div>
      {!collapsed.has(root.id) ? <div role="group">{tree(root.id, 1)}</div> : null}
    </div>
  );
  return (
    <div className={embedded ? "library-embedded" : "modal-backdrop"}>
      <section
        className="library"
        role={embedded ? undefined : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label="项目文档库"
      >
        <header>
          <div>
            <h2>项目文档库</h2>
            <p>正式文件、产物文件与缓存文件 · 全项目单树浏览</p>
          </div>
          <button onClick={onClose} aria-label="关闭文档库">
            ×
          </button>
        </header>
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) uploadOfficialFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="library-body">
          <aside className="file-explorer">
            <div className="file-explorer-top">
              <div className="tree-filter-bar">
                <input
                  aria-label="搜索文档"
                  placeholder="搜索文档…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <button
                  type="button"
                  className="tree-sort"
                  title={
                    sort === "type"
                      ? "当前：类型 / 名称；切换为最近修改"
                      : "当前：最近修改；切换为类型 / 名称"
                  }
                  aria-label={
                    sort === "type"
                      ? "当前按类型和名称排序，切换为最近修改"
                      : "当前按最近修改排序，切换为类型和名称"
                  }
                  onClick={() => setSort(sort === "type" ? "modified" : "type")}
                >
                  <TreeIcon
                    kind={sort === "type" ? "sortType" : "sortModified"}
                  />
                </button>
              </div>
            </div>
            <div className="file-explorer-scroll">
            <div role="tree" aria-label="项目文档库">
              {organizing ? <p className="muted">一级小祥正在整理正式文件，正式文件区暂时不可操作。</p> : null}
              {trash || filter
                ? artifacts.map((v) => fileRow(v, 0))
                : libraryRoots.map((root) => renderLibraryRoot(root))}
            </div>
            {!artifacts.length && !libraryFolders.length && (
              <p className="muted">文档库尚无文件。</p>
            )}
            {organization?.status === "failed" && <div className="error" role="alert">{organization.error || "正式文件整理未完成，可以重试。"}</div>}
            {actionError && (
              <div className="error" role="alert">
                {actionError}
              </div>
            )}
            </div>
            <footer className="library-explorer-footer">
              <button
                type="button"
                className={trash ? "library-trash-entry active" : "library-trash-entry"}
                title={trash ? "返回文件树" : "回收站"}
                aria-label={trash ? "返回文件树" : "回收站"}
                aria-pressed={trash}
                onClick={() => {
                  setTrash(!trash);
                  onSelect("");
                  setFilter("");
                }}
              >
                <TreeIcon kind={trash ? "back" : "trash"} />
                <span>{trash ? "返回文件树" : "回收站"}</span>
              </button>
            </footer>
          </aside>
          <main className={renaming || newFolder || renamingFolder ? "library-operation" : ""}>
            {newFolder && (
              <form className="library-form" onSubmit={(event) => {
                event.preventDefault();
                if (!officialFolderParentId) return;
                void act(async () => {
                  const name = newFolderName.trim()
                    || suggestOfficialFolderName(officialFolderParentId, libraryFolders);
                  const created = await change(
                    `/projects/${projectId}/folders`,
                    { name, parentId: officialFolderParentId },
                    "POST",
                  );
                  setNewFolder(false);
                  setFolderId(created.id);
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    next.delete(officialFolderParentId);
                    return next;
                  });
                });
              }}>
                <h3>新建子文件夹</h3>
                <p className="muted">将创建在正式文件区内（当前选中的文件夹下）。</p>
                <label>文件夹名称<input autoFocus maxLength={160} placeholder={`留空则使用「${DEFAULT_OFFICIAL_FOLDER_NAME}」`} value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} /></label>
                <div><button type="submit" className="primary" disabled={pending || !officialFolderParentId}>{pending ? "创建中…" : "创建"}</button><button type="button" disabled={pending} onClick={() => setNewFolder(false)}>取消</button></div>
              </form>
            )}
            {renamingFolder && selectedLibraryFolder && (
              <form className="library-form" onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  await change(
                    `/projects/${projectId}/folders/${selectedLibraryFolder.id}`,
                    { name: renameFolderName },
                    "PATCH",
                  );
                  setRenamingFolder(false);
                });
              }}>
                <h3>重命名文件夹</h3>
                <label>名称<input autoFocus required maxLength={160} value={renameFolderName} onChange={(event) => setRenameFolderName(event.target.value)} /></label>
                <div><button type="submit" className="primary" disabled={pending}>{pending ? "保存中…" : "保存"}</button><button type="button" disabled={pending} onClick={() => setRenamingFolder(false)}>取消</button></div>
              </form>
            )}
            {renaming && version && (
              <form className="library-form" onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  await change(`/projects/${projectId}/artifacts/${version.artifact_id}`, { name: renameName }, "PATCH");
                  setRenaming(false);
                });
              }}>
                <h3>重命名文档</h3>
                <label>名称<input autoFocus required maxLength={160} value={renameName} onChange={(event) => setRenameName(event.target.value)} /></label>
                <div><button type="submit" className="primary" disabled={pending}>{pending ? "保存中…" : "保存"}</button><button type="button" disabled={pending} onClick={() => setRenaming(false)}>取消</button></div>
              </form>
            )}
            {!renaming && !newFolder && !renamingFolder && (version ? (
                <>
                  <div className="document-toolbar">
                    <div>
                      <h3>{version.title}</h3>
                      <small>
                        {version.author} ·{" "}
                        {Math.max(1, Math.round(version.byte_size / 1024))} KB ·{" "}
                        {version.filename}
                      </small>
                    </div>
                    <select
                      aria-label="文档历史版本"
                      value={selected}
                      onChange={(e) => onSelect(e.target.value)}
                    >
                      {versions
                        .filter((v) => v.artifact_id === version.artifact_id)
                        .sort((a, b) => b.version - a.version)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            v{v.version}{v.deleted_at ? " · 已删除" : ""}
                            {v.review === "approved"
                              ? " · 已审核"
                              : " · 待确认"}
                          </option>
                        ))}
                    </select>
                    <a
                      className="download-button"
                      href={`/api/versions/${selected}/download`}
                    >
                      下载原文件
                    </a>
                    {onReference && (
                      <button onClick={() => onReference(selected)}>
                        / 引用到讨论
                      </button>
                    )}
                    {canManageFile(version) && (
                      <>
                        <button disabled={pending || !!version.deleted_at} onClick={() => startRenameFile(version)}>重命名</button>
                        <button
                          disabled={pending}
                          onClick={() => act(async () => { await change(`/projects/${projectId}/artifacts/${version.artifact_id}`, { deleted: !version.artifact_deleted_at }, "PATCH"); })}
                        >
                          {version.artifact_deleted_at ? "恢复整份文档" : "删除整份文档（全部版本）"}
                        </button>
                        {canEditOfficial(version) && !version.artifact_deleted_at ? (
                          <button disabled={pending} onClick={() => act(async () => {
                            await change(`/projects/${projectId}/versions/${version.id}`, {deleted:!version.version_deleted_at}, "PATCH");
                          })}>{version.version_deleted_at ? "恢复当前版本" : `删除当前版本（v${version.version}）`}</button>
                        ) : null}
                      </>
                    )}
                    {canSaveToOfficial(version) ? (
                      <button disabled={pending || organizing} onClick={() => saveFileToOfficial(version)}>
                        另存至正式文件
                      </button>
                    ) : null}
                    {writable && version.deleted_at ? (
                      <button disabled={pending} onClick={() => restoreFile(version)}>
                        原路恢复
                      </button>
                    ) : null}
                  </div>
                  {!version.deleted_at && (
                  <div className="library-review-actions">
                      <span>
                        {version.review === "approved"
                          ? "已审核"
                          : version.review === "changes_requested"
                            ? "需要修改"
                            : "待人工审核"}
                      </span>
                      {onReview && version.thread_id === threadId && (
                        <>
                          <button
                            disabled={pending}
                            onClick={() =>
                              act(() => onReview(selected, "approved"))
                            }
                          >
                            确认通过
                          </button>
                          <button
                            disabled={pending}
                            onClick={() =>
                              act(() => onReview(selected, "changes_requested"))
                            }
                          >
                            要求修改
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {version.deleted_at && (
                    <p className="muted">
                      已移入回收站{recyclePathLabel(version, libraryFolders) ? `，原路径：${recyclePathLabel(version, libraryFolders)}` : ""}。历史引用仍可查看，原路恢复后回到原来的文件夹。
                    </p>
                  )}
                  {error && <div className="error">{error}</div>}
                  {!view && !error && <p className="muted">正在读取文档…</p>}
                  <div className="document-preview">
                    {view?.kind === "markdown" && (
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          img: () => <span>（外部图片请在原文件中查看）</span>,
                        }}
                      >
                        {view.text}
                      </Markdown>
                    )}
                    {view?.kind === "text" && <pre>{view.text}</pre>}
                    {view?.kind === "image" && (
                      <img src={view.url} alt={version.filename} />
                    )}{" "}
                    {view?.kind === "pdf" && (
                      <iframe title={version.filename} src={view.url} />
                    )}{" "}
                    {view?.kind === "download" && (
                      <p>
                        文件已安全保存在项目中。此格式暂不支持在线预览，请下载原文件查看。
                      </p>
                    )}
                  </div>
                </>
              ) : showOfficialFolderPanel && selectedLibraryFolder ? (
                <div className="library-folder-panel">
                  <h3>{selectedLibraryFolder.name}</h3>
                  <p className="muted">
                    {selectedLibraryFolder.folder_kind === "project_official"
                      ? "正式文件根目录 · 可上传文件或新建主题子文件夹。"
                      : "正式文件区文件夹 · 可嵌套、上传；删除时其中文档会移入回收站。"}
                  </p>
                  <div className="document-toolbar">
                    <button
                      type="button"
                      disabled={pending || !officialUploadFolderId}
                      onClick={() => uploadInputRef.current?.click()}
                    >
                      上传文件
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setNewFolder(true);
                        setNewFolderName("");
                        setRenaming(false);
                        setRenamingFolder(false);
                      }}
                    >
                      新建子文件夹
                    </button>
                    {canRenameDeleteOfficialFolder ? (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setRenameFolderName(selectedLibraryFolder.name);
                            setRenamingFolder(true);
                            setNewFolder(false);
                          }}
                        >
                          重命名文件夹
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (!window.confirm(`删除文件夹「${selectedLibraryFolder.name}」？其中文档将移入回收站。`)) return;
                            void act(async () => {
                              await change(
                                `/projects/${projectId}/folders/${selectedLibraryFolder.id}`,
                                undefined,
                                "DELETE",
                              );
                              selectFolder(selectedLibraryFolder.parent_id || officialRoot?.id || null);
                            });
                          }}
                        >
                          删除文件夹
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="library-empty">
                  选择一份文档或正式文件区文件夹。
                </div>
              ))}
          </main>
        </div>
        {organizeOpen ? (
          <div className="modal-backdrop library-organize-backdrop" onClick={() => setOrganizeOpen(false)}>
            <section
              className="library-organize-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="library-organize-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <h3 id="library-organize-title">正式文件整理</h3>
                <button type="button" aria-label="关闭" onClick={() => setOrganizeOpen(false)}>×</button>
              </header>
              <p>由一级小祥在后台归类与命名正式文件；整理期间正式文件区不可上传、另存或修改。</p>
              {organizing ? <p className="muted">正在排队或执行中…</p> : null}
              {organization?.status === "failed" ? (
                <div className="error" role="alert">{organization.error || "上次整理失败，可重试。"}</div>
              ) : null}
              <div className="library-organize-actions">
                <button type="button" disabled={pending} onClick={() => setOrganizeOpen(false)}>关闭</button>
                <button
                  type="button"
                  className="primary"
                  disabled={pending || organizing || !canOrganizeOfficial}
                  title={!canOrganizeOfficial ? "正式文件区没有可整理的文档" : undefined}
                  onClick={() => void triggerOrganize()}
                >
                  {organizing ? "整理中…" : pending ? "提交中…" : "立即整理"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
