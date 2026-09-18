import { readJsonResponse } from "../shared/json-response.js";
import { apiFetch } from "./api-fetch";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileIcon } from "@react-symbols/icons/utils";
import { Document, Notebook } from "@react-symbols/icons/files";
import { DocxPreview, PptxPreview, XlsxPreview } from "./office-preview";
import { inlineHtmlPreviewAssets } from "../shared/html-preview.mjs";
import { fileDisplayName } from "../shared/document-name.js";
import { UiIcon } from "./ui-icon";
import { DialogClose, ModalBackdrop } from "./dialog-fx";
const officeIcons = {
  doc: Document,
  docx: Document,
  odt: Document,
  rtf: Document,
  ppt: Notebook,
  pptx: Notebook,
  odp: Notebook,
};

function HtmlPreviewFrame({
  versionId,
  filename,
}: {
  versionId: string;
  filename: string;
}) {
  const [srcDoc, setSrcDoc] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setSrcDoc("");
    setError("");
    (async () => {
      const response = await apiFetch(`/api/versions/${versionId}/preview/`);
      if (!response.ok) {
        const body = await readJsonResponse(
          response,
          `/api/versions/${versionId}/preview/`,
        ).catch(() => ({ error: `预览失败 ${response.status}` }));
        throw new Error(body.error || `预览失败 ${response.status}`);
      }
      const html = await response.text();
      const inlined = await inlineHtmlPreviewAssets(html, async (path) => {
        const asset = await apiFetch(
          `/api/versions/${versionId}/preview/${encodeURI(path)}`,
        );
        if (!asset.ok) throw new Error(`无法加载 ${path}`);
        return asset.text();
      });
      if (alive) setSrcDoc(inlined);
    })().catch((cause) => {
      if (alive) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => {
      alive = false;
    };
  }, [versionId]);
  if (error) return <p className="error">{error}</p>;
  if (!srcDoc) return <p className="muted doc-browser-loading">正在准备 HTML 预览…</p>;
  return (
    <iframe
      className="doc-html-preview-frame"
      title={filename}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
    />
  );
}

function LibraryFileMenu({
  menuId,
  openMenuId,
  onOpenMenuChange,
  disabled,
  canRename,
  canDelete,
  canSaveToOfficial,
  saveToOfficialDisabled,
  saveToOfficialTitle,
  onAddToConversation,
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
  saveToOfficialDisabled?: boolean;
  saveToOfficialTitle?: string;
  onAddToConversation?: () => void;
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
          {onAddToConversation ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onAddToConversation(); close(); }}>
              <TreeIcon kind="addToChat" />
              <span>添加到会话</span>
            </button>
          ) : null}
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
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              disabled={saveToOfficialDisabled}
              title={saveToOfficialTitle}
              onClick={() => {
                if (saveToOfficialDisabled) return;
                onSaveToOfficial();
                close();
              }}
            >
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

function TreeIcon({ kind, className }: { kind: string; className?: string }) {
  const paths: Record<string, string | string[]> = {
    folder: "M3 7h6.5l2 2H21v11H3Z",
    file: "M6 3h8l4 4v14H6Z M14 3v5h5",
    expand: "m9 6 6 6-6 6",
    collapse: "m6 9 6 6 6-6",
    newFolder: "M3 7h6.5l2 2H21v11H3Z M12 12.5v5 M9.5 15h5",
    newFile: "M6 3h8l4 4v14H6Z M9 14h6 M12 11v6",
    upload: "M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6",
    trash: "M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
    back: "m9 5-6 7 6 7 M3 12h18",
    rename: "M4 20h8 M15.2 4.8 19.2 8.8 8.5 19.5 4.5 20.5 5.5 16.5Z M13.8 6.2 17.8 10.2",
    sortType: "M4 6h10 M4 12h7 M4 18h4 M17 5v14 M14 16l3 3 3-3",
    sortModified: "M12 8v5l3 2 M21 12a9 9 0 1 1-2.6-6.35 M21 4v6h-6",
    organize: [
      "M12 3.2 13.6 8.4 18.8 10 13.6 11.6 12 16.8 10.4 11.6 5.2 10 10.4 8.4Z",
      "M18.4 14.6 19.2 16.7 21.3 17.5 19.2 18.3 18.4 20.4 17.6 18.3 15.5 17.5 17.6 16.7Z",
    ],
    actions: "M5 7h14M5 12h14M5 17h14",
    download: "M12 3v12 M8 11l4 4 4-4 M4 21h16",
    restore: "M4 12a8 8 0 1 0 2.3-5.7 M4 4v6h6",
    addToChat: "M4 5h16v10H8l-4 4Z M8 10h8",
  };
  const glyph = paths[kind] || paths.file;
  const d = Array.isArray(glyph) ? glyph : [glyph];
  return (
    <svg
      aria-hidden="true"
      className={className ? `tree-icon ${className}` : "tree-icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

function TreeDepth({ depth }: { depth: number }) {
  return <span className="tree-depth" style={{ width: depth * 14 }} aria-hidden="true" />;
}

function ClosedFolderIcon() {
  return (
    <svg
      aria-hidden="true"
      className="tree-icon"
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.4 19.6V6.9c0-.9.7-1.6 1.6-1.6h4c.4 0 .8.16 1.05.44L11.6 7.5h7.4c.9 0 1.6.7 1.6 1.6v10.5c0 .9-.7 1.6-1.6 1.6H5c-.9 0-1.6-.7-1.6-1.6Z" />
    </svg>
  );
}

function OpenFolderIcon() {
  return (
    <svg
      aria-hidden="true"
      className="tree-icon"
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.2 9.2V7.1c0-.9.7-1.6 1.6-1.6h3.5c.4 0 .8.15 1.05.42L10.7 7.4h8.1c.9 0 1.6.7 1.6 1.6v1.1" />
      <path d="M3.15 10.7h17.7c.8 0 1.4.74 1.23 1.52l-1.58 7.05A1.7 1.7 0 0 1 18.85 20.8H5.15a1.7 1.7 0 0 1-1.65-1.53l-1.58-7.05A1.26 1.26 0 0 1 3.15 10.7Z" />
    </svg>
  );
}

function FolderToggle({
  name,
  expanded,
  disabled,
  onToggle,
}: {
  name: string;
  expanded: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`tree-toggle tree-folder-toggle${expanded ? " expanded" : ""}`}
      disabled={disabled}
      aria-label={`${expanded ? "折叠" : "展开"} ${name}`}
      onClick={onToggle}
    >
      <span className="folder-toggle-icon icon-idle">
        {expanded ? (
          <OpenFolderIcon />
        ) : (
          <ClosedFolderIcon />
        )}
      </span>
      <span className="folder-toggle-icon icon-hover">
        <TreeIcon kind={expanded ? "collapse" : "expand"} />
      </span>
    </button>
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
  return fileDisplayName(version);
}

const EMPTY_CHANGE_REQUEST_ITEMS = ["", "", ""];

function formatChangeRequestItems(items: string[]) {
  return items
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
}

function isUnversionedArea(kind: string | null) {
  return kind === "project_official" || kind === "project_cache";
}

function documentStatusLabel(version: LibraryVersion, area: string | null) {
  if (area === "project_official" || version.review === "confirmed") return "已确认";
  if (area === "project_cache" || version.review === "draft") {
    if (version.review === "approved") return "已确认";
    if (version.review === "changes_requested") return "需要修改";
    return "草稿";
  }
  if (version.review === "approved") return "已确认";
  if (version.review === "changes_requested") return "需要修改";
  return "待人工审核";
}

function officialTitleWithVersion(name: string, versionNumber: number) {
  const raw = name.trim() || "文档";
  const base = raw.replace(/\s+v\d+$/i, "").trim() || raw;
  return `${base} v${versionNumber}`.slice(0, 160);
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

function documentSourceLabel(item: LibraryVersion, folders: LibraryFolder[]) {
  const kind = folderRootKind(item.folder_id, folders);
  const area =
    kind && kind in ROOT_LABELS
      ? ROOT_LABELS[kind as (typeof LIBRARY_ROOT_KINDS)[number]]
      : "文档库";
  const path = recyclePathLabel(item, folders);
  if (!path) return area;
  if (path === area || path.startsWith(`${area} /`)) return path;
  return `${area} / ${path}`;
}

function formatLibraryDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function latestArtifactUpdatedAt(
  item: LibraryVersion,
  rows: LibraryVersion[],
) {
  const stamps = rows
    .filter((row) => row.artifact_id === item.artifact_id)
    .map((row) => row.updated_at || "")
    .filter(Boolean);
  if (!stamps.length) return item.updated_at || "";
  return stamps.sort().at(-1) || item.updated_at || "";
}

const DEFAULT_OFFICIAL_FOLDER_NAME = "新建文件夹";

export function suggestOfficialFolderName(
  _parentId?: string,
  _folders?: LibraryFolder[],
) {
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

export function isLibraryTreeVersion(
  item: LibraryVersion,
  folders: LibraryFolder[],
) {
  if (isInProjectLibrary(item.folder_id, folders)) return true;
  return Boolean(item.deleted_at && (item.recycle_path || !item.folder_id));
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
  onReference,
  organizationJobs = [],
}: {
  onReview?: (versionId: string, decision: string, comment?: string) => Promise<void>;
  projectId: string;
  threadId?: string;
  writable: boolean;
  iterationWritable?: boolean;
  folders: LibraryFolder[];
  onRefresh: () => Promise<void>;
  versions: LibraryVersion[];
  selected: string;
  onSelect: (id: string) => void;
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
  const libraryVersions = versions.filter((item) => isLibraryTreeVersion(item, folders));
  const organization = organizationJobs.find(
    (job) => job.scope === "project" && !job.thread_id,
  );
  const organizing = !!(organization && ["queued", "running"].includes(organization.status));
  const canOrganizeOfficial = organizableDocuments(libraryVersions, libraryFolders).length > 0;
  const officialWritable = writable && !organizing;
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleFolder = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
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
  const [savingOfficial, setSavingOfficial] = useState<LibraryVersion | null>(null);
  const [saveOfficialVersionId, setSaveOfficialVersionId] = useState("");
  const [saveOfficialTitle, setSaveOfficialTitle] = useState("");
  const [draggedArtifactId, setDraggedArtifactId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [openFileMenuId, setOpenFileMenuId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { type: "file"; item: LibraryVersion }
    | { type: "folder"; item: LibraryFolder }
    | null
  >(null);
  const [changeRequest, setChangeRequest] = useState<{ versionId: string; title: string } | null>(null);
  const [changeRequestItems, setChangeRequestItems] = useState<string[]>(EMPTY_CHANGE_REQUEST_ITEMS);
  const changeRequestInputRefs = useRef<Array<HTMLInputElement | null>>([]);
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
    bytes?: Uint8Array;
    kind: string;
    mime: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [treeOpen, setTreeOpen] = useState(true);
  const [previewModeByVersion, setPreviewModeByVersion] = useState<
    Record<string, "preview" | "text">
  >({});
  const previewMode = selected
    ? previewModeByVersion[selected] ?? "preview"
    : "preview";
  const setPreviewMode = (mode: "preview" | "text") => {
    if (!selected) return;
    setPreviewModeByVersion((previous) => ({ ...previous, [selected]: mode }));
  };
  useEffect(() => {
    if (!selected) return;
    setOpenTabs((previous) => (previous.includes(selected) ? previous : [...previous, selected]));
  }, [selected]);
  const closeTab = (id: string) => {
    setOpenTabs((previous) => {
      const next = previous.filter((tabId) => tabId !== id);
      if (selected === id) onSelect(next[next.length - 1] || "");
      return next;
    });
  };
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
    if (!selected) return;
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
        } else if (name.endsWith(".docx")) {
          setView({ kind: "docx", bytes, mime: v.mime });
        } else if (name.endsWith(".xlsx")) {
          setView({ kind: "xlsx", bytes, mime: v.mime });
        } else if (name.endsWith(".pptx")) {
          setView({ kind: "pptx", bytes, mime: v.mime });
        } else if (name.endsWith(".html") || name.endsWith(".htm")) {
          const text = new TextDecoder().decode(bytes).slice(0, 500000);
          setView({ kind: "html", text, mime: v.mime });
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
  }, [selected]);
  useEffect(() => {
    setFolderId(libraryRoots[0]?.id || null);
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
  const showSaveToOfficial = (item: LibraryVersion) =>
    writable && !organizing && !item.deleted_at && (isCacheVersion(item) || isOutputVersion(item));
  const cacheConfirmed = (item: LibraryVersion) => item.review === "approved";
  const confirmedOutputVersions = (item: LibraryVersion) =>
    libraryVersions
      .filter((row) => row.artifact_id === item.artifact_id && !row.deleted_at && row.review === "approved")
      .sort((a, b) => b.version - a.version);
  const canSaveToOfficial = (item: LibraryVersion) => {
    if (!showSaveToOfficial(item)) return false;
    if (isCacheVersion(item)) return cacheConfirmed(item);
    if (isOutputVersion(item)) return confirmedOutputVersions(item).length > 0;
    return false;
  };
  const saveToOfficialHint = (item: LibraryVersion) => {
    if (canSaveToOfficial(item)) return undefined;
    if (isCacheVersion(item)) return "仅已确认的缓存文件可另存为正式文件";
    if (isOutputVersion(item)) return "仅已确认的产物文件版本可另存为正式文件";
    return undefined;
  };
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
    setSavingOfficial(null);
  };
  const subtreeStats = (folderId: string) => {
    const ids = new Set<string>();
    const walk = (id: string) => {
      ids.add(id);
      for (const folder of libraryFolders) {
        if (folder.parent_id === id) walk(folder.id);
      }
    };
    walk(folderId);
    const files = new Set(
      versions
        .filter((item) => !item.deleted_at && item.folder_id && ids.has(item.folder_id))
        .map((item) => item.artifact_id),
    );
    return { folderCount: ids.size - 1, fileCount: files.size };
  };
  const deleteFile = (item: LibraryVersion) => {
    setDeleteConfirm({ type: "file", item });
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
    if (isOutputVersion(item)) {
      const confirmed = confirmedOutputVersions(item);
      const pick = confirmed.find((row) => row.id === item.id) || confirmed[0];
      if (!pick) return;
      onSelect(pick.id);
      setSavingOfficial(item);
      setSaveOfficialVersionId(pick.id);
      setSaveOfficialTitle(officialTitleWithVersion(item.title, pick.version));
      setRenaming(false);
      setNewFolder(false);
      setRenamingFolder(false);
      return;
    }
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
    setSavingOfficial(null);
  };
  const openRenameFolder = (target: LibraryFolder) => {
    selectFolder(target.id);
    setRenameFolderName(target.name);
    setRenamingFolder(true);
    setNewFolder(false);
    setSavingOfficial(null);
  };
  const deleteFolder = (target: LibraryFolder) => {
    setDeleteConfirm({ type: "folder", item: target });
  };
  const confirmDelete = () => {
    if (!deleteConfirm) return;
    const target = deleteConfirm;
    setDeleteConfirm(null);
    if (target.type === "file") {
      const item = target.item;
      void act(async () => {
        await change(
          `/projects/${projectId}/artifacts/${item.artifact_id}`,
          { deleted: true },
          "PATCH",
        );
        if (selected === item.id) onSelect("");
      });
      return;
    }
    void act(async () => {
      await change(`/projects/${projectId}/folders/${target.item.id}`, undefined, "DELETE");
      selectFolder(target.item.parent_id || officialRoot?.id || null);
    });
  };
  const fileRow = (v: LibraryVersion, depth: number) => (
    <div
      className={`tree-file ${version?.artifact_id === v.artifact_id ? "selected" : ""}${draggedArtifactId === v.artifact_id ? " dragging" : ""}`}
      key={v.artifact_id}
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
      <TreeDepth depth={depth} />
      <button
        className="tree-name"
        disabled={organizing && folderRootKind(v.folder_id, libraryFolders) === "project_official"}
        onClick={() => {
          onSelect(v.id);
          setFolderId(v.folder_id || null);
        }}
        title={`${v.title} · ${v.filename}${isUnversionedArea(fileAreaKind(v)) ? "" : ` · v${v.version}`}${trash && recyclePathLabel(v, libraryFolders) ? ` · ${recyclePathLabel(v, libraryFolders)}` : ""}`}
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
        <span className="tree-row-actions">
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
          canSaveToOfficial={showSaveToOfficial(v)}
          saveToOfficialDisabled={!canSaveToOfficial(v)}
          saveToOfficialTitle={saveToOfficialHint(v)}
          onAddToConversation={onReference ? () => onReference(v.id) : undefined}
          onDownload={() => {
            window.open(`/api/versions/${v.id}/download`, "_blank", "noopener,noreferrer");
          }}
          onRename={() => startRenameFile(v)}
          onDelete={() => deleteFile(v)}
          onSaveToOfficial={() => saveFileToOfficial(v)}
        />
        </span>
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
              className={`tree-folder${dropTargetFolderId === f.id ? " drop-target" : ""}${draggedFolderId === f.id ? " dragging" : ""}`}
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
              <TreeDepth depth={depth} />
              <FolderToggle
                name={f.name}
                expanded={!collapsed.has(f.id)}
                disabled={organizing && folderRootKind(f.id, libraryFolders) === "project_official"}
                onToggle={() => toggleFolder(f.id)}
              />
              <button
                type="button"
                className="tree-name"
                disabled={organizing && folderRootKind(f.id, libraryFolders) === "project_official"}
                onClick={() => toggleFolder(f.id)}
              >
                <span>{f.name}</span>
              </button>
              {canManageOfficialFolders
                && folderRootKind(f.id, libraryFolders) === "project_official"
                && !f.system_key
                && f.folder_kind !== "project_official" ? (
                <span className="tree-row-actions">
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
                </span>
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
        className={`tree-folder tree-library-root${dropTargetFolderId === root.id ? " drop-target" : ""}`}
        {...(root.folder_kind === "project_official" && canManageOfficialFolders
          ? folderDropHandlers(root.id)
          : {})}
      >
        <FolderToggle
          name={ROOT_LABELS[root.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number]] || root.name}
          expanded={!collapsed.has(root.id)}
          disabled={root.folder_kind === "project_official" && organizing}
          onToggle={() => toggleFolder(root.id)}
        />
        <button
          type="button"
          className="tree-name"
          disabled={root.folder_kind === "project_official" && organizing}
          onClick={() => toggleFolder(root.id)}
        >
          <span>{ROOT_LABELS[root.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number]] || root.name}</span>
        </button>
        {root.folder_kind === "project_official" ? (
          <span className="tree-root-actions tree-row-actions">
            {writable ? (
              <button
                type="button"
                className="tree-organize"
                title="正式文件整理"
                aria-label="正式文件整理"
                disabled={organizing || pending}
                onClick={() => setOrganizeOpen(true)}
              >
                <TreeIcon kind="organize" />
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
  const uploadInput = (
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
  );
  const explorer = (
    <aside className="file-explorer doc-browser-tree">
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
            <div className="file-explorer-scroll" aria-busy={pending}>
            {pending ? (
              <div className="tree-loading" role="status">
                <span className="tree-loading-spinner" aria-hidden="true" />
                <span>正在更新文档树…</span>
              </div>
            ) : null}
            <div role="tree" aria-label="项目文档库">
              {organizing ? <p className="muted">项目级Agent（L1）正在整理正式文件，正式文件区暂时不可操作。</p> : null}
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
  );
  const viewModeToggle = view?.kind === "markdown" || view?.kind === "html" ? (
    <span className="doc-view-mode" role="group" aria-label="预览方式">
      <button
        type="button"
        className={previewMode === "preview" ? "active" : ""}
        aria-pressed={previewMode === "preview"}
        onClick={() => setPreviewMode("preview")}
      >
        <UiIcon name="preview" size={12} />
        预览
      </button>
      <button
        type="button"
        className={previewMode === "text" ? "active" : ""}
        aria-pressed={previewMode === "text"}
        onClick={() => setPreviewMode("text")}
      >
        <UiIcon name="code" size={12} />
        源码
      </button>
    </span>
  ) : null;
  const versionOptionDetail = (v: LibraryVersion) =>
    `v${v.version}${v.deleted_at ? " · 已删除" : ""}${
      v.review === "approved" ? " · 已确认" : " · 待确认"
    }`;
  const artifactVersionRows =
    version
      ? versions
          .filter((v) => v.artifact_id === version.artifact_id)
          .sort((a, b) => b.version - a.version)
      : [];
  const browserVersionHistorySelect =
    version && !isUnversionedArea(fileAreaKind(version)) ? (
      <select
        className="doc-browser-version-select"
        aria-label="文档历史版本"
        title={versionOptionDetail(
          artifactVersionRows.find((v) => v.id === selected) || version,
        )}
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
      >
        {artifactVersionRows.map((v) => (
          <option key={v.id} value={v.id} title={versionOptionDetail(v)}>
            {`v${v.version}`}
          </option>
        ))}
      </select>
    ) : null;
  const browserFileMeta = version ? (
    <small
      className="doc-browser-meta doc-browser-bottombar-meta"
      title={`${documentSourceLabel(version, libraryFolders)} · ${formatLibraryDateTime(latestArtifactUpdatedAt(version, libraryVersions))}`}
    >
      来源 {documentSourceLabel(version, libraryFolders)} · 修改{" "}
      {formatLibraryDateTime(latestArtifactUpdatedAt(version, libraryVersions))}
    </small>
  ) : null;
  const reviewActions = version && !version.deleted_at ? (
    <div className="library-review-actions">
      {fileAreaKind(version) === "project_official" || version.review === "confirmed" ? (
        <span>已确认</span>
      ) : (
        <>
          <span>{documentStatusLabel(version, fileAreaKind(version))}</span>
          {onReview && (fileAreaKind(version) === "project_cache" || fileAreaKind(version) === "project_outputs") && (
            <>
              <button
                disabled={pending}
                onClick={() =>
                  act(() => onReview(selected, "approved"))
                }
              >
                <UiIcon name="check" size={12} />
                {fileAreaKind(version) === "project_cache" ? "确认" : "确认通过"}
              </button>
              <button
                disabled={pending}
                onClick={() => {
                  setChangeRequest({ versionId: selected, title: version.title });
                  setChangeRequestItems([...EMPTY_CHANGE_REQUEST_ITEMS]);
                  setActionError("");
                }}
              >
                <UiIcon name="edit" size={12} />
                需要修改
              </button>
            </>
          )}
        </>
      )}
    </div>
  ) : null;
  const sourceFrameSrc = selected ? `/api/versions/${selected}/source` : undefined;
  const previewContent = (
    <>
      {view?.kind === "markdown" && previewMode === "preview" && (
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            img: () => <span>（外部图片请在原文件中查看）</span>,
          }}
        >
          {view.text}
        </Markdown>
      )}
      {view?.kind === "markdown" && previewMode === "text" && (
        <iframe
          key={`${selected}-source`}
          className="doc-file-source-frame"
          title={`${version?.filename ?? "文档"} 源码`}
          src={sourceFrameSrc}
          sandbox=""
          referrerPolicy="no-referrer"
        />
      )}
      {view?.kind === "html" && previewMode === "preview" && selected && (
        <HtmlPreviewFrame
          key={`${selected}-preview`}
          versionId={selected}
          filename={version?.filename ?? "HTML"}
        />
      )}
      {view?.kind === "html" && previewMode === "text" && (
        <pre className="doc-file-source-pre" key={`${selected}-source`}>
          {view.text}
        </pre>
      )}
      {view?.kind === "text" && <pre>{view.text}</pre>}
      {view?.kind === "docx" && view.bytes && <DocxPreview bytes={view.bytes} />}
      {view?.kind === "xlsx" && view.bytes && <XlsxPreview bytes={view.bytes} />}
      {view?.kind === "pptx" && view.bytes && <PptxPreview bytes={view.bytes} />}
      {view?.kind === "image" && version && (
        <img src={view.url} alt={version.filename} />
      )}{" "}
      {view?.kind === "pdf" && version && (
        <iframe title={version.filename} src={view.url} />
      )}{" "}
      {view?.kind === "download" && (
        <p>
          文件已安全保存在项目中。此格式暂不支持在线预览，请下载原文件查看。
        </p>
      )}
    </>
  );
  const mainPanel = (
    <main className={`${renaming || newFolder || renamingFolder || savingOfficial ? "library-operation" : ""} doc-browser-main`}>
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
            {savingOfficial && (
              <form className="library-form" onSubmit={(event) => {
                event.preventDefault();
                const picked = confirmedOutputVersions(savingOfficial).find((row) => row.id === saveOfficialVersionId);
                if (!picked || !saveOfficialTitle.trim()) return;
                void act(async () => {
                  await change(
                    `/projects/${projectId}/versions/${picked.id}/save-to-official`,
                    { title: saveOfficialTitle.trim() },
                  );
                  setSavingOfficial(null);
                });
              }}>
                <h3>另存至正式文件</h3>
                <p className="muted">只能另存已确认的产物版本；存入后名称默认带版本号，可再修改。</p>
                <label>
                  选择版本
                  <select
                    aria-label="另存的产物版本"
                    value={saveOfficialVersionId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      setSaveOfficialVersionId(nextId);
                      const picked = confirmedOutputVersions(savingOfficial).find((row) => row.id === nextId);
                      if (picked) setSaveOfficialTitle(officialTitleWithVersion(savingOfficial.title, picked.version));
                    }}
                  >
                    {confirmedOutputVersions(savingOfficial).map((row) => (
                      <option key={row.id} value={row.id}>
                        v{row.version} · 已确认
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  正式文件名称
                  <input
                    autoFocus
                    required
                    maxLength={160}
                    value={saveOfficialTitle}
                    onChange={(event) => setSaveOfficialTitle(event.target.value)}
                  />
                </label>
                <div>
                  <button type="submit" className="primary" disabled={pending || !saveOfficialVersionId || !saveOfficialTitle.trim()}>
                    {pending ? "另存中…" : "另存"}
                  </button>
                  <button type="button" disabled={pending} onClick={() => setSavingOfficial(null)}>取消</button>
                </div>
              </form>
            )}
            {!renaming && !newFolder && !renamingFolder && !savingOfficial && (version ? (
                <>
                  {version.deleted_at && (
                    <p className="muted doc-browser-notice">
                      已移入回收站{recyclePathLabel(version, libraryFolders) ? `，原路径：${recyclePathLabel(version, libraryFolders)}` : ""}。历史引用仍可查看，原路恢复后回到原来的文件夹。
                    </p>
                  )}
                  {error && <div className="error doc-browser-error">{error}</div>}
                  <div className="doc-browser-view">
                    {viewModeToggle ? (
                      <div className="doc-browser-preview-chrome">{viewModeToggle}</div>
                    ) : null}
                    <div className="document-preview doc-browser-preview">
                      {!view && !error && <p className="muted doc-browser-loading">正在读取文档…</p>}
                      {previewContent}
                    </div>
                  </div>
                  <footer className="doc-browser-bottombar">
                    {browserFileMeta}
                    {browserVersionHistorySelect}
                    {reviewActions}
                  </footer>
                </>
              ) : (
                <div className="library-empty">从文件树选择文档。</div>
              ))}
          </main>
  );
  const organizeDialog = organizeOpen ? (
          <ModalBackdrop className="library-organize-backdrop" onClose={() => setOrganizeOpen(false)}>
            {(close) => <section
              className="library-organize-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="library-organize-title"
            >
              <header>
                <h3 id="library-organize-title">正式文件整理</h3>
                <DialogClose onClick={close} label="关闭" />
              </header>
              <p>由项目级Agent（L1）在后台归类与命名正式文件；整理期间正式文件区不可上传、另存或修改。</p>
              {organizing ? <p className="muted">正在排队或执行中…</p> : null}
              {organization?.status === "failed" ? (
                <div className="error" role="alert">{organization.error || "上次整理失败，可重试。"}</div>
              ) : null}
              <div className="library-organize-actions">
                <button type="button" disabled={pending} onClick={close}>关闭</button>
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
            </section>}
          </ModalBackdrop>
        ) : null;
  const deleteConfirmCopy = (() => {
    if (!deleteConfirm) return null;
    if (deleteConfirm.type === "file") {
      const item = deleteConfirm.item;
      const unversioned = isUnversionedArea(fileAreaKind(item));
      return {
        title: "确认删除文件",
        body: unversioned
          ? `删除「${item.title}」后将移入回收站，可从回收站原路恢复。`
          : `删除「${item.title}」及其全部版本后将移入回收站，可从回收站原路恢复。`,
      };
    }
    const stats = subtreeStats(deleteConfirm.item.id);
    const parts = [
      stats.fileCount ? `${stats.fileCount} 个文件` : "",
      stats.folderCount ? `${stats.folderCount} 个子文件夹` : "",
    ].filter(Boolean);
    return {
      title: "确认删除文件夹",
      body: parts.length
        ? `「${deleteConfirm.item.name}」内含 ${parts.join("、")}。删除后其中文档会移入回收站，文件夹将被移除。`
        : `将删除空文件夹「${deleteConfirm.item.name}」。`,
    };
  })();
  const deleteConfirmDialog = deleteConfirm && deleteConfirmCopy ? (
          <ModalBackdrop className="library-organize-backdrop" onClose={() => setDeleteConfirm(null)}>
            {(close) => <section
              className="library-organize-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="library-delete-title"
            >
              <header>
                <h3 id="library-delete-title">{deleteConfirmCopy.title}</h3>
                <DialogClose onClick={close} label="关闭" />
              </header>
              <p>{deleteConfirmCopy.body}</p>
              <div className="library-organize-actions">
                <button type="button" onClick={close}>取消</button>
                <button type="button" className="primary" onClick={confirmDelete}><UiIcon name="trash" size={13} />确认删除</button>
              </div>
            </section>}
          </ModalBackdrop>
        ) : null;

  const changeRequestDialog = changeRequest ? (
          <ModalBackdrop className="library-organize-backdrop" onClose={() => setChangeRequest(null)} enabled={!pending}>
            {(close) => <section
              className="library-organize-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="library-change-request-title"
            >
              <header>
                <h3 id="library-change-request-title">需要修改</h3>
                <DialogClose disabled={pending} onClick={close} label="关闭" />
              </header>
              <p>按条填写要对「{changeRequest.title}」修改什么。确认后会自动发到当前迭代群聊并 @ 对方：产物文件会 @小祥；缓存文件若来自别人则 @来源人，本人上传的缓存则 @小祥。被 @ 的人请让小祥改并保存为产物文件，或自己改完后在对话框重新上传新的缓存文件。</p>
              <ol className="change-request-list" aria-label="需要修改的内容">
                {changeRequestItems.map((item, index) => (
                  <li key={index}>
                    <input
                      ref={(el) => { changeRequestInputRefs.current[index] = el; }}
                      autoFocus={index === 0}
                      aria-label={`第 ${index + 1} 条`}
                      placeholder="这一条要改什么"
                      value={item}
                      maxLength={800}
                      onChange={(event) => {
                        const value = event.target.value;
                        setChangeRequestItems((rows) => rows.map((row, rowIndex) => (rowIndex === index ? value : row)));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          setChangeRequestItems((rows) => {
                            if (rows.length >= 20) return rows;
                            const next = [...rows];
                            next.splice(index + 1, 0, "");
                            queueMicrotask(() => changeRequestInputRefs.current[index + 1]?.focus());
                            return next;
                          });
                          return;
                        }
                        if (event.key === "Backspace" && !item && changeRequestItems.length > 1) {
                          event.preventDefault();
                          setChangeRequestItems((rows) => {
                            const next = rows.filter((_, rowIndex) => rowIndex !== index);
                            const focusAt = Math.max(0, index - 1);
                            queueMicrotask(() => changeRequestInputRefs.current[focusAt]?.focus());
                            return next.length ? next : [...EMPTY_CHANGE_REQUEST_ITEMS];
                          });
                        }
                      }}
                    />
                    {changeRequestItems.length > 1 ? (
                      <button
                        type="button"
                        className="change-request-remove"
                        aria-label={`删除第 ${index + 1} 条`}
                        disabled={pending}
                        onClick={() => {
                          setChangeRequestItems((rows) => {
                            const next = rows.filter((_, rowIndex) => rowIndex !== index);
                            return next.length ? next : [...EMPTY_CHANGE_REQUEST_ITEMS];
                          });
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="change-request-add"
                disabled={pending || changeRequestItems.length >= 20}
                onClick={() => {
                  setChangeRequestItems((rows) => {
                    if (rows.length >= 20) return rows;
                    queueMicrotask(() => changeRequestInputRefs.current[rows.length]?.focus());
                    return [...rows, ""];
                  });
                }}
              >
                添加一条
              </button>
              {actionError ? <p className="error" role="alert">{actionError}</p> : null}
              <div className="library-organize-actions">
                <button type="button" disabled={pending} onClick={close}>取消</button>
                <button
                  type="button"
                  className="primary"
                  disabled={pending || !formatChangeRequestItems(changeRequestItems)}
                  onClick={() => {
                    const comment = formatChangeRequestItems(changeRequestItems);
                    const versionId = changeRequest.versionId;
                    void act(async () => {
                      await onReview?.(versionId, "changes_requested", comment);
                      setChangeRequest(null);
                      setChangeRequestItems([...EMPTY_CHANGE_REQUEST_ITEMS]);
                    });
                  }}
                >
                  确认发送
                </button>
              </div>
            </section>}
          </ModalBackdrop>
        ) : null;

  const tabVersion = (id: string) => libraryVersions.find((item) => item.id === id)
    || versions.find((item) => item.id === id);
  return (
    <div className="library-embedded doc-browser">
      <section className="library doc-browser-shell" aria-label="项目文档库">
        {uploadInput}
        <div className="doc-browser-tabbar">
          <div className="doc-browser-tabs" role="tablist" aria-label="打开的文档">
            {openTabs.map((id) => {
              const item = tabVersion(id);
              return (
                <span
                  key={id}
                  className={`doc-browser-tab${selected === id ? " active" : ""}`}
                  role="presentation"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected === id}
                    className="doc-browser-tab-open"
                    title={item ? `${item.title} · ${item.filename}` : "文档"}
                    onClick={() => onSelect(id)}
                  >
                    {item ? (
                      <FileIcon
                        fileName={item.filename}
                        editFileExtensionData={officeIcons}
                        autoAssign
                        className="tree-icon file-type-icon"
                        aria-hidden="true"
                        width={14}
                        height={14}
                      />
                    ) : null}
                    <span className="doc-browser-tab-label">{item ? fileLabel(item) : "文档"}</span>
                  </button>
                  <button
                    type="button"
                    className="doc-browser-tab-close"
                    aria-label={`关闭 ${item ? fileLabel(item) : "文档"}`}
                    title="关闭"
                    onClick={() => closeTab(id)}
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {!openTabs.length && <span className="doc-browser-tabs-empty">从文件树选择文档</span>}
          </div>
          <button
            type="button"
            className={`doc-browser-tree-toggle${treeOpen ? " active" : ""}`}
            title={treeOpen ? "隐藏文件树" : "显示文件树"}
            aria-label={treeOpen ? "隐藏文件树" : "显示文件树"}
            aria-pressed={treeOpen}
            onClick={() => setTreeOpen(!treeOpen)}
          >
            <TreeIcon kind="folder" />
          </button>
        </div>
        <div className="library-body doc-browser-body">
          {treeOpen ? explorer : null}
          {mainPanel}
        </div>
        {organizeDialog}
        {deleteConfirmDialog}
        {changeRequestDialog}
      </section>
    </div>
  );
}
