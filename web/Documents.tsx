import { readJsonResponse } from "../shared/json-response.js";
import { apiFetch } from "./api-fetch";
import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ClosedFolderIcon,
  LibraryFileIcon,
  OpenFolderIcon,
  TreeIcon,
  isImageFilename,
} from "./document-icons";
import { LIBRARY_ROOT_KINDS, folderRootKind } from "./document-library";
import { ProjectContentPanel } from "./ProjectContentPanel";
import { UiIcon } from "./ui-icon";
import { ModalBackdrop } from "./dialog-fx";
import { ImagePreviewDialog, type ImagePreviewSource } from "./ImagePreview";
import { showTip , useTipError } from "./Tip";
import { MCP_OFFICIAL_LIBRARY_COPY_INSTRUCTION, formatMcpCopyPayload } from "../shared/mcp-guide.js";
import { uploadFileWithIntegrity } from "./file-upload";
import { type DocumentTabListItem } from "./DocumentTabList";
import { DocumentsTabbar } from "./DocumentsTabbar";
import { CodeLibraryRoot } from "./CodeLibraryRoot";
import { buildDocumentTabMenuItems } from "./document-tab-menu";
import { DocumentFileRow } from "./DocumentFileRow";
import { LibraryRootRow } from "./LibraryRootRow";
import { DocumentTree } from "./DocumentTree";
import { DocumentMainPanel } from "./DocumentMainPanel";
import { useDocumentPreviewSource } from "./use-document-preview-source";
import { resolveBrowserNavigation as resolveBrowserNavigationImpl } from "./document-browser-navigation";
import { downloadFolderArchive } from "./folder-download";
import { StaticDocumentPreview } from "./StaticDocumentPreview";
import { DocumentChangeLogDialog } from "./DocumentChangeLogDialog";
import { type HtmlDeviceMode } from "./HtmlBrowserToolbar";
import { HtmlPreviewFrame } from "./HtmlPreviewFrame";
import { DOC_PREVIEW_DEFAULT_DEVICE_ID } from "./MiniProgramDeviceShell";
import { DocumentFileInfoDialog, type DocumentFileInfoRow } from "./DocumentFileInfoDialog";
import { DocumentFileActionCapsule } from "./DocumentFileActionCapsule";
import { DocumentPreviewBreadcrumb } from "./DocumentPreviewBreadcrumb";
import { DocumentVersionHistorySelect, type DocumentVersionHistoryOption } from "./DocumentVersionHistorySelect";
import { DocumentSourceActions } from "./DocumentSourceActions";
import { DocumentReviewActions } from "./DocumentReviewActions";
import { FolderGuideDialog, LibraryOrganizeDialog } from "./LibraryOrganizeDialog";
import { CodeGuideDialog } from "./CodeGuideDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { BranchVersionDialog } from "./BranchVersionDialog";
import { DocumentPreviewContent } from "./DocumentPreviewContent";
import { DocumentLibraryExplorer } from "./DocumentLibraryExplorer";

import {
  type BrowserTab,
  START_TAB_ID,
  TEXT_PREVIEW_NAME,
  formatFileSize,
  documentViewCache,
  readVersionText,
} from "./document-view-internals";
import {
  DocumentFileContextMenu,
  TextSelectionContextMenu,
  getNodePath,
  resolveNodePath,
  type FileContextMenuKind,
  type PendingTextSelection,
  type TabMenuItem,
  type TextSelectionSnapshot,
} from "./document-context-menus";
import {
  CODE_LIBRARY_GUIDE,
  CODE_LIBRARY_ROOT_ID,
  CODE_LIBRARY_ROOT_NAME,
  DOCUMENT_TREE_STATE_KEY,
  DOCUMENT_TREE_WIDTH_KEY,
  ROOT_DISPLAY_ORDER,
  ROOT_GUIDES,
  ROOT_LABELS,
  TREE_WIDTH_MAX,
  TREE_WIDTH_MIN,
  codeLibraryEntries,
  documentChangeActions,
  documentChangeLabels,
  documentChangeSources,
  documentSourceLabel,
  documentStatusLabel,
  fileAreaTypeLabels,
  fileLabel,
  isInProjectLibrary,
  isLibraryTreeVersion,
  isUnversionedArea,
  officialSourceTypeLabels,
  officialTitleWithVersion,
  organizableDocuments,
  readStoredBoolean,
  readStoredTreeWidth,
  resolveLibraryRoot,
  suggestOfficialFolderName,
  versionCodeForRows,
  type CodeLibraryConfig,
  type DocumentChange,
  type DocumentChangeFilters,
  type DocumentChangePage,
  type LibraryFolder,
  type LibraryVersion,
} from "./document-labels";
export type { LibraryVersion } from "./document-labels";
export const Documents = memo(function Documents({
  onReview,
  onRequestRevision,
  projectId,
  projectName,
  mcpEndpoint,
  threadId,
  writable,
  iterationWritable = false,
  folders,
  onRefresh,
  versions,
  selected,
  onSelect,
  onReference,
  onAddSelectionToConversation,
  onReferenceFolder,
  onAddToTask,
  onAddFolderToTask,
  organizationJobs = [],
  codeSourcesTick = 0,
  documentFullscreen = false,
  documentFocus = 0,
}: {
  onReview?: (versionId: string, decision: string, comment?: string) => Promise<void>;
  onRequestRevision?: (versionId: string, target: "current" | "new", title?: string) => Promise<void>;
  projectId: string;
  projectName?: string;
  mcpEndpoint?: string;
  threadId?: string;
  writable: boolean;
  currentUserId: string;
  owner: boolean;
  iterationWritable?: boolean;
  folders: LibraryFolder[];
  onRefresh: () => Promise<void>;
  versions: LibraryVersion[];
  selected: string;
  onSelect: (id: string) => void;
  onReference?: (id: string) => void;
  onAddSelectionToConversation?: (text: string, versionId: string) => void;
  onReferenceFolder?: (id: string) => void;
  onAddToTask?: (id: string) => void;
  onAddFolderToTask?: (id: string) => void;
  organizationJobs?: { thread_id?: string | null; scope: "iteration" | "project"; status: string; error?: string | null }[];
  codeSourcesTick?: number;
  documentFullscreen?: boolean;
  onDocumentFullscreenChange?: (fullscreen: boolean) => void;
  /** 群聊里点文件时递增，用来打开右侧栏中的该文件。 */
  documentFocus?: number;
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
  const [folderGuideKind, setFolderGuideKind] = useState<(typeof LIBRARY_ROOT_KINDS)[number] | null>(null);
  const [codeGuideId, setCodeGuideId] = useState<string | null>(null);
  const [codeConfig, setCodeConfig] = useState<CodeLibraryConfig | null>(null);
  const codeEntries = useMemo(() => codeLibraryEntries(codeConfig), [codeConfig]);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void apiFetch(`/api/projects/${projectId}/code-connectors`)
        .then((response) => readJsonResponse(response, "代码连接器"))
        .then((value) => {
          if (!cancelled) setCodeConfig(value as CodeLibraryConfig);
        })
        .catch(() => {
          if (!cancelled) setCodeConfig(null);
        });
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [projectId, codeSourcesTick]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const knownFolderIds = useRef(new Set(folders.filter((folder) => folder.parent_id).map((folder) => folder.id)));
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(folders.filter((folder) => folder.parent_id).map((folder) => folder.id)),
  );
  useEffect(() => {
    if (!codeEntries.length) return;
    setCollapsed((previous) => {
      const next = new Set(previous);
      const ids: string[] = [];
      for (const entry of codeEntries) {
        ids.push(entry.id);
        if (entry.type === "connector") {
          for (const remote of entry.remotes) ids.push(remote.id);
        }
      }
      for (const id of ids) {
        if (!previous.has(id) && !knownFolderIds.current.has(id)) next.add(id);
      }
      for (const id of ids) knownFolderIds.current.add(id);
      return next;
    });
  }, [codeEntries.map((entry) => (
    entry.type === "connector"
      ? `${entry.id}:${entry.remotes.map((remote) => remote.id).join("+")}`
      : entry.id
  )).join(",")]);
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
      const known = knownFolderIds.current;
      for (const folder of folders) {
        if (known.has(folder.id)) continue;
        if (folder.parent_id) next.add(folder.id);
      }
      const codeIds = codeEntries.flatMap((entry) => (
        entry.type === "connector" ? [entry.id, ...entry.remotes.map((remote) => remote.id)] : [entry.id]
      ));
      knownFolderIds.current = new Set([
        ...folders.map((folder) => folder.id),
        ...codeIds,
        CODE_LIBRARY_ROOT_ID,
      ]);
      return next;
    });
  }, [folders, codeEntries.map((entry) => (
    entry.type === "connector"
      ? `${entry.id}:${entry.remotes.map((remote) => remote.id).join("+")}`
      : entry.id
  )).join(",")]);
  const [trash, setTrash] = useState(false);
  const [sort, setSort] = useState<"type" | "modified">("type");
  const collator = useMemo(() => new Intl.Collator("zh-CN", {
    numeric: true,
    sensitivity: "base",
  }), []);
  const modified = (a: { updated_at?: string }, b: { updated_at?: string }) =>
    (b.updated_at || "").localeCompare(a.updated_at || "");
  const extension = (filename: string) =>
    filename.includes(".")
      ? filename.split(".").pop()?.toLowerCase() || ""
      : "";
  const fileEncodingLabel = (mime: string | undefined, filename: string) => {
    const charset = mime?.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
    if (charset === "utf-8" || charset === "utf8") return "UTF-8";
    if (charset === "utf-16le") return "UTF-16 LE";
    if (charset === "utf-16be") return "UTF-16 BE";
    if (charset === "gb18030") return "GB18030";
    if (charset === "gbk") return "GBK";
    if (charset) return charset.toUpperCase();
    if (mime?.startsWith("text/")) return "UTF-8";
    if (/\.(html?|css|m?js|json|md|markdown|txt|py|ts|tsx|jsx|csv|sql|ya?ml|xml|log|env|ini|conf|toml|properties|sh|bash)$/i.test(filename)) {
      return "UTF-8";
    }
    return "二进制";
  };

  const [pending, setPending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("正在更新文档树…");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [actionError, setActionError] = useTipError();
  const copyProjectInfo = async () => {
    const official = libraryRoots.find((f) => f.folder_kind === "project_official");
    const targetFolderId = official && folderId && folderRootKind(folderId, libraryFolders) === "project_official"
      ? folderId
      : official?.id;
    const targetFolder = libraryFolders.find((f) => f.id === targetFolderId);
    try {
      await navigator.clipboard.writeText(formatMcpCopyPayload({
        server: `${location.origin}${mcpEndpoint || "/mcp"}`,
        project: projectName,
        projectId,
        folder: targetFolder?.name || "正式文件",
        folderId: targetFolderId,
        instruction: MCP_OFFICIAL_LIBRARY_COPY_INSTRUCTION,
      }));
      setActionError("");
      showTip("项目信息已复制");
    } catch {
      setActionError("无法自动复制项目信息，请检查剪贴板权限后重试。");
    }
  };
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [newFolder, setNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [savingOfficial, setSavingOfficial] = useState<LibraryVersion | null>(null);
  const [saveOfficialVersionId, setSaveOfficialVersionId] = useState("");
  const [saveOfficialTitle, setSaveOfficialTitle] = useState("");
  const [branchVersion, setBranchVersion] = useState<LibraryVersion | null>(null);
  const [branchTarget, setBranchTarget] = useState<"current" | "new">("current");
  const [branchTitle, setBranchTitle] = useState("");
  const [draggedArtifactId, setDraggedArtifactId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changes, setChanges] = useState<DocumentChange[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesError, setChangesError] = useState("");
  const [changePageNumber, setChangePageNumber] = useState(1);
  const [changePage, setChangePage] = useState<DocumentChangePage>({ hasMore: false, total: 0, totalPages: 1, currentPage: 1, pageSize: 20, before: null, beforeId: null });
  const [changePageInput, setChangePageInput] = useState("1");
  const [changeFilterDraft, setChangeFilterDraft] = useState<DocumentChangeFilters>({ from: "", to: "", fileName: "", action: "", limit: "20" });
  const [changeFilters, setChangeFilters] = useState<DocumentChangeFilters>({ from: "", to: "", fileName: "", action: "", limit: "20" });
  const changeCountCacheRef = useRef({ key: "", total: 0 });
  const [openFileMenuId, setOpenFileMenuId] = useState<string | null>(null);
  const [downloadingFolderId, setDownloadingFolderId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { type: "file"; item: LibraryVersion }
    | { type: "folder"; item: LibraryFolder }
    | { type: "empty-recycle" }
    | null
  >(null);
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
    if (!officialWritable) {
      showTip(organizing ? "正式文件正在整理，暂时不能上传" : "没有上传正式文件的权限", "error");
      return;
    }
    if (!officialUploadFolderId) {
      showTip("找不到正式文件目录，请刷新后重试", "error");
      return;
    }
    const list = Array.from(files);
    void act(async () => {
      for (const file of list) {
        setPendingLabel(`正在上传 ${file.name}`);
        setUploadProgress(0);
        const created = await uploadFileWithIntegrity({
          kind: "official_file",
          projectId,
          folderId: officialUploadFolderId,
        }, file, (percent) => setUploadProgress(percent)) as { id: string };
        onSelect(created.id);
      }
      setUploadProgress(null);
      setPendingLabel("正在更新文档树…");
    }, list.length > 1 ? `已上传 ${list.length} 个文件` : "文件已上传");
  };
  const act = async (fn: () => Promise<void>, success?: string) => {
    setPending(true);
    setPendingLabel("正在更新文档树…");
    setActionError("");
    try {
      await fn();
      if (success) showTip(success);
      setPendingLabel("正在更新文档树…");
      await onRefresh();
    } catch (e) {
      const detail = (e as Error).message;
      setActionError(detail);
    } finally {
      setPending(false);
      setUploadProgress(null);
      setPendingLabel("正在更新文档树…");
    }
  };
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const fileSearchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<{
    text?: string;
    url?: string;
    bytes?: Uint8Array;
    kind: string;
    mime: string;
    truncated?: boolean;
    byteSize?: number;
    nativeSource?: boolean;
  } | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreviewSource | null>(null);
  const [fileInfoOpen, setFileInfoOpen] = useState(false);
  const [error, setError] = useTipError();
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>([]);
  const [browserSelected, setBrowserSelected] = useState("");
  const [documentSelected, setDocumentSelected] = useState(selected);
  // 开始页签是「什么都没打开」的默认页签：与加号互斥，只有还有别的页签时才有关闭按钮。
  const [startOpen, setStartOpen] = useState(() => !selected);
  const [startActive, setStartActive] = useState(() => !selected);
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [newTabMenu, setNewTabMenu] = useState<{ x: number; y: number } | null>(null);
  const [fileContextMenu, setFileContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selectionContextMenu, setSelectionContextMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const selectionRestoreRef = useRef<TextSelectionSnapshot | null>(null);
  const pendingSelectionRef = useRef<PendingTextSelection | null>(null);
  const lastSelectionRef = useRef<PendingTextSelection | null>(null);
  const mainPanelRef = useRef<HTMLElement | null>(null);
  const [previewReload, setPreviewReload] = useState(0);
  const [browserDeviceMode, setBrowserDeviceMode] = useState<HtmlDeviceMode>("desktop");
  const [browserMobileDeviceId, setBrowserMobileDeviceId] = useState(DOC_PREVIEW_DEFAULT_DEVICE_ID);
  const [browserMobileZoom, setBrowserMobileZoom] = useState(100);
  const [browserAddressQuery, setBrowserAddressQuery] = useState("");
  const [browserAddressFocusKey, setBrowserAddressFocusKey] = useState("");
  const [activeTool, setActiveTool] = useState<"files" | "browser">("files");
  const [treeOpen, setTreeOpen] = useState(() => readStoredBoolean(DOCUMENT_TREE_STATE_KEY, false));
  const [treeWidth, setTreeWidth] = useState(readStoredTreeWidth);
  const treeVisible = treeOpen && activeTool === "files";
  const treeWasVisible = useRef(treeVisible);
  useEffect(() => {
    const opened = treeVisible && !treeWasVisible.current;
    treeWasVisible.current = treeVisible;
    if (opened) fileSearchRef.current?.focus();
  }, [treeVisible]);
  useEffect(() => {
    if (!changesOpen) return;
    let alive = true;
    const params = new URLSearchParams({ limit: changeFilters.limit, page: String(changePageNumber) });
    if (changeFilters.from) params.set("from", changeFilters.from);
    if (changeFilters.to) params.set("to", changeFilters.to);
    if (changeFilters.fileName.trim()) params.set("fileName", changeFilters.fileName.trim());
    if (changeFilters.action) params.set("action", changeFilters.action);
    setChangesLoading(true);
    setChangesError("");
    const countKey = `${projectId}|${params.get("from") || ""}|${params.get("to") || ""}|${params.get("fileName") || ""}|${params.get("action") || ""}|${changeFilters.limit}`;
    const cachedTotal = changeCountCacheRef.current.key === countKey ? changeCountCacheRef.current.total : null;
    const countParams = new URLSearchParams(params);
    countParams.delete("limit");
    countParams.delete("page");
    void Promise.all([
      apiFetch(`/api/projects/${projectId}/document-changes?${params}`).then((response) => readJsonResponse(response, "文档操作日志")),
      cachedTotal == null
        ? apiFetch(`/api/projects/${projectId}/document-changes/count?${countParams}`).then((response) => readJsonResponse(response, "文档操作日志总数"))
        : Promise.resolve({ total: cachedTotal }),
    ])
      .then(([value, count]) => {
        if (!alive) return;
        setChanges(value.items || []);
        const total = Number(count.total || 0);
        changeCountCacheRef.current = { key: countKey, total };
        const pageSize = Number(changeFilters.limit) || 20;
        const totalPages = Math.max(Math.ceil(total / pageSize), 1);
        const currentPage = Math.min(Number(value.page?.currentPage || changePageNumber), totalPages);
        setChangePage({ ...(value.page || {}), total, totalPages, currentPage, pageSize, hasMore: currentPage < totalPages });
        setChangePageInput(String(currentPage));
        if (currentPage !== changePageNumber) setChangePageNumber(currentPage);
      })
      .catch((cause) => { if (alive) setChangesError(cause instanceof Error ? cause.message : "日志读取失败"); })
      .finally(() => { if (alive) setChangesLoading(false); });
    return () => { alive = false; };
  }, [changesOpen, projectId, changePageNumber, changeFilters]);
  useEffect(() => {
    try { localStorage.setItem(DOCUMENT_TREE_STATE_KEY, String(treeOpen)); } catch {}
  }, [treeOpen]);
  useEffect(() => {
    try { localStorage.setItem(DOCUMENT_TREE_WIDTH_KEY, String(treeWidth)); } catch {}
  }, [treeWidth]);
  const startTreeResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = treeWidth;
    const parentWidth = event.currentTarget.parentElement?.parentElement?.getBoundingClientRect().width
      || window.innerWidth;
    const onMove = (move: PointerEvent) => {
      const max = Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, Math.round(parentWidth - 72)));
      setTreeWidth(Math.min(Math.max(startWidth + (startX - move.clientX), TREE_WIDTH_MIN), max));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("col-resizing");
    };
    document.body.classList.add("col-resizing");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const [previewModeByVersion, setPreviewModeByVersion] = useState<
    Record<string, "preview" | "text">
  >({});
  const previewMode = selected
    ? previewModeByVersion[selected] ?? "preview"
    : "preview";
  const browserFileAddress = (item: LibraryVersion) =>
    `${documentSourceLabel(item, libraryFolders)} / ${fileLabel(item)}`;
  const setPreviewMode = (mode: "preview" | "text") => {
    if (!selected) return;
    setPreviewModeByVersion((previous) => ({ ...previous, [selected]: mode }));
  };
  const makeBrowserNewTab = (): BrowserTab => ({
    key: `new-tab:${Date.now()}-${Math.random().toString(36).slice(2)}`,
    versionId: "",
    url: "",
    loadUrl: "",
    label: "新HTML阅览页",
  });
  // 打开「开始」页签：没有别的页签时它是默认页签。加号不再召回开始页签。
  const activateStartTab = () => {
    setStartOpen(true);
    setStartActive(true);
    setActiveTool("files");
    if (selected) onSelect("");
  };
  const createBrowserNewTab = () => {
    const tab = makeBrowserNewTab();
    setBrowserTabs((previous) => [...previous, tab]);
    setBrowserSelected(tab.key);
    setBrowserAddressQuery("");
    setBrowserAddressFocusKey(tab.key);
    setStartOpen(false);
    setStartActive(false);
    setActiveTool("browser");
    onSelect("");
  };
  const selectDocument = (id: string) => {
    setStartOpen(false);
    setStartActive(false);
    setDocumentSelected(id);
    setActiveTool("files");
    onSelect(id);
  };
  const openBrowserTab = (id: string) => {
    const target = libraryVersions.find((item) => item.id === id) || versions.find((item) => item.id === id);
    if (!target || !/\.html?$/i.test(target.filename || "")) return;
    const key = `version:${id}`;
    const current = browserTabs.find((tab) => tab.key === browserSelected);
    const existing = browserTabs.find((tab) => tab.key === key);
    const nextTab = {
      key,
      versionId: id,
      url: browserFileAddress(target),
      loadUrl: `/api/versions/${id}/preview/`,
      label: target.filename,
    };
    setBrowserTabs((previous) => {
      if (existing) return previous;
      if (current && !current.versionId) return previous.map((tab) => tab.key === current.key ? nextTab : tab);
      return [...previous, nextTab];
    });
    setBrowserSelected(existing?.key || key);
    setBrowserAddressQuery(nextTab.url);
    setStartOpen(false);
    setStartActive(false);
    setActiveTool("browser");
    onSelect(id);
  };
  const selectBrowserTab = (key: string) => {
    const target = browserTabs.find((tab) => tab.key === key);
    setBrowserSelected(key);
    if (target) {
      setBrowserAddressQuery(target.url);
      onSelect(target.versionId || "");
    }
    setStartActive(false);
    setActiveTool("browser");
  };
  const closeBrowserTab = (key: string) => {
    const index = browserTabs.findIndex((tab) => tab.key === key);
    if (index < 0) return;
    const next = browserTabs.filter((tab) => tab.key !== key);
    setBrowserTabs(next);
    if (browserSelected !== key) return;
    setBrowserSelected("");
    // 正看着这个 HTML 页签：接管到相邻页签；文档和 HTML 都没有了才回到开始页签。
    if (startActive || activeTool !== "browser") return;
    const neighbor = next[index] || next[index - 1];
    if (neighbor) selectBrowserTab(neighbor.key);
    else if (openTabs.length) selectDocument(openTabs[openTabs.length - 1]);
    else activateStartTab();
  };
  // 页签菜单里的「关闭其它 / 关闭左 / 右」：只作用在 HTML 阅览页签之间。
  const closeOtherBrowserTabs = (key: string) => {
    const target = browserTabs.find((tab) => tab.key === key);
    if (!target) return;
    setBrowserTabs([target]);
    setBrowserSelected(target.key);
    setBrowserAddressQuery(target.url);
    if (activeTool === "browser" && !startActive) onSelect(target.versionId || "");
  };
  const closeBrowserTabsDirection = (key: string, side: "left" | "right") => {
    const index = browserTabs.findIndex((tab) => tab.key === key);
    if (index < 0) return;
    const next = side === "left" ? browserTabs.slice(index) : browserTabs.slice(0, index + 1);
    setBrowserTabs(next);
    if (next.some((tab) => tab.key === browserSelected)) return;
    const target = next.find((tab) => tab.key === key);
    if (!target) return;
    setBrowserSelected(target.key);
    setBrowserAddressQuery(target.url);
    if (activeTool === "browser" && !startActive) onSelect(target.versionId || "");
  };
  const copyBrowserTabAddress = async (tab: BrowserTab) => {
    const href = tab.loadUrl || `/api/versions/${tab.versionId}/preview/`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(new URL(href, location.origin).href);
      showTip("阅览页地址已复制");
    } catch {
      showTip("复制失败，请检查剪贴板权限。", "error");
    }
  };
  const activateDocumentTool = () => {
    setActiveTool("files");
    const nextId = documentSelected || openTabs[openTabs.length - 1] || "";
    if (!nextId) {
      if (!browserTabs.length) activateStartTab();
      return;
    }
    setStartOpen(false);
    setStartActive(false);
    if (nextId !== selected) onSelect(nextId);
  };
  const openDocumentTree = () => {
    setTreeOpen(true);
    if (openTabs.length) {
      if (activeTool !== "files") activateDocumentTool();
      return;
    }
    activateStartTab();
  };
  const openBranchDialog = (item: LibraryVersion) => {
    if (!canBranchVersion(item)) return;
    setBranchVersion(item);
    setBranchTarget("current");
    setBranchTitle(item.title);
  };
  const submitBranch = async () => {
    if (!branchVersion) return;
    if (!onRequestRevision) {
      showTip("当前迭代不可发送改新版请求", "error");
      return;
    }
    await onRequestRevision(
      branchVersion.id,
      branchTarget,
      branchTarget === "new" ? branchTitle.trim() : undefined,
    );
    setBranchVersion(null);
    showTip("改新版请求已发送给 @小祥");
  };
  const openHtmlInBrowser = (target: LibraryVersion) => {
    if (!/\.html?$/i.test(target.filename || "")) return;
    setPreviewModeByVersion((previous) => ({ ...previous, [target.id]: "preview" }));
    openBrowserTab(target.id);
    setFileContextMenu(null);
    setSelectionContextMenu(null);
  };
  const imageSourceUrl = (target: LibraryVersion) => `/api/versions/${target.id}/source`;
  const copyImageAddress = async (target: LibraryVersion) => {
    const sourceUrl = imageSourceUrl(target);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(`${location.origin}${sourceUrl}`);
      showTip("图片地址已复制");
    } catch {
      showTip("复制失败，请检查剪贴板权限。", "error");
    }
    setFileContextMenu(null);
  };
  const copyImageVersion = async (target: LibraryVersion) => {
    const sourceUrl = imageSourceUrl(target);
    try {
      const response = await apiFetch(sourceUrl);
      if (!response.ok) throw new Error("图片读取失败");
      const blob = await response.blob();
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("image clipboard unavailable");
      }
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      showTip("图片已复制");
    } catch {
      showTip("无法复制图片，请检查浏览器和剪贴板权限。", "error");
    }
    setFileContextMenu(null);
  };
  const restoreTextSelection = () => {
    const snapshot = selectionRestoreRef.current;
    if (!snapshot || !snapshot.root.isConnected) return false;
    const startNode = resolveNodePath(snapshot.root, snapshot.startPath);
    const endNode = resolveNodePath(snapshot.root, snapshot.endPath);
    if (!startNode || !endNode) return false;
    const selection = window.getSelection();
    if (!selection) return false;
    try {
      const range = document.createRange();
      const maxOffset = (node: Node) => node.nodeType === Node.TEXT_NODE
        ? node.nodeValue?.length || 0
        : node.childNodes.length;
      range.setStart(startNode, Math.min(snapshot.startOffset, maxOffset(startNode)));
      range.setEnd(endNode, Math.min(snapshot.endOffset, maxOffset(endNode)));
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch {
      return false;
    }
  };
  const copySelection = async () => {
    const text = selectionContextMenu?.text;
    if (!text) return;
    restoreTextSelection();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        if (!document.execCommand("copy")) throw new Error("copy failed");
        textarea.remove();
      }
      showTip("已复制选中内容");
    } catch {
      showTip("复制失败，请检查剪贴板权限。", "error");
    }
  };
  const captureTextSelection = (root: HTMLElement): PendingTextSelection | null => {
    const selection = window.getSelection();
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    const text = selection?.toString() || "";
    if (!range || !text.trim()) return null;
    const startPath = getNodePath(root, range.startContainer);
    const endPath = getNodePath(root, range.endContainer);
    if (!startPath || !endPath) return null;
    return {
      text,
      snapshot: {
        root,
        startPath,
        startOffset: range.startOffset,
        endPath,
        endOffset: range.endOffset,
        rects: Array.from(range.getClientRects()).map((rect) => ({
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        })),
      },
    };
  };
  useEffect(() => {
    const rememberSelection = () => {
      const root = mainPanelRef.current;
      if (!root) return;
      const next = captureTextSelection(root);
      if (next) lastSelectionRef.current = next;
    };
    document.addEventListener("selectionchange", rememberSelection);
    return () => document.removeEventListener("selectionchange", rememberSelection);
  }, []);
  const handleDocumentMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (activeTool === "browser" || event.button !== 2) return;
    pendingSelectionRef.current = captureTextSelection(event.currentTarget);
    if (pendingSelectionRef.current) event.preventDefault();
  };
  const handleDocumentContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    if (activeTool === "browser") return;
    const pendingSelection = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    const currentSelection = captureTextSelection(event.currentTarget);
    const rememberedSelection = lastSelectionRef.current;
    const pointInRememberedSelection = rememberedSelection?.snapshot.rects.some((rect) => (
      event.clientX >= rect.left - 4
      && event.clientX <= rect.right + 4
      && event.clientY >= rect.top - 4
      && event.clientY <= rect.bottom + 4
    ));
    const textSelection = pendingSelection || currentSelection || (pointInRememberedSelection ? rememberedSelection : null);
    if (textSelection && onAddSelectionToConversation) {
      selectionRestoreRef.current = textSelection.snapshot;
      event.preventDefault();
      event.stopPropagation();
      setFileContextMenu(null);
      setSelectionContextMenu({ x: event.clientX, y: event.clientY, text: textSelection.text });
      return;
    }
    const currentVersion = libraryVersions.find((item) => item.id === selected)
      || versions.find((item) => item.id === selected);
    if (!currentVersion) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectionContextMenu(null);
    setFileContextMenu({ id: currentVersion.id, x: event.clientX, y: event.clientY });
  };
  useLayoutEffect(() => {
    if (!selectionContextMenu) return;
    restoreTextSelection();
  }, [selectionContextMenu]);
  useEffect(() => {
    const preventPageFind = (event: KeyboardEvent) => {
      if (document.activeElement !== fileSearchRef.current) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      fileSearchRef.current?.focus();
      fileSearchRef.current?.select();
    };
    window.addEventListener("keydown", preventPageFind, true);
    return () => window.removeEventListener("keydown", preventPageFind, true);
  }, []);
  useEffect(() => {
    if (!selected || startActive) return;
    if (activeTool === "files") {
      setOpenTabs((previous) => (previous.includes(selected) ? previous : [...previous, selected]));
      setDocumentSelected(selected);
      setStartOpen(false);
      setStartActive(false);
    }
  }, [activeTool, selected, startActive]);
  const documentFocusSeen = useRef(documentFocus);
  useEffect(() => {
    if (!documentFocus || documentFocus === documentFocusSeen.current) return;
    documentFocusSeen.current = documentFocus;
    if (!selected) return;
    setActiveTool("files");
    setStartOpen(false);
    setStartActive(false);
    setOpenTabs((previous) => (previous.includes(selected) ? previous : [...previous, selected]));
    setDocumentSelected(selected);
  }, [documentFocus, selected]);
  useEffect(() => {
    if (openTabs.length) setStartOpen(false);
  }, [openTabs.length]);
  const closeTab = (id: string) => {
    const next = openTabs.filter((tabId) => tabId !== id);
    setOpenTabs(next);
    if (documentSelected !== id) return;
    setDocumentSelected("");
    // 正看着这个文档页签：接管到相邻页签；文档和 HTML 都没有了才回到开始页签。
    if (startActive || activeTool !== "files") return;
    const fallback = next[next.length - 1];
    if (fallback) selectDocument(fallback);
    else if (browserTabs.length) selectBrowserTab(browserTabs[browserTabs.length - 1].key);
    else activateStartTab();
  };
  const closeOtherTabs = (id: string) => {
    setOpenTabs([id]);
    setDocumentSelected(id);
    if (activeTool === "files") {
      setStartActive(false);
      if (selected !== id) onSelect(id);
    }
  };
  const closeTabsDirection = (id: string, side: "left" | "right") => {
    const index = openTabs.indexOf(id);
    if (index < 0) return;
    const next = side === "left" ? openTabs.slice(index) : openTabs.slice(0, index + 1);
    setOpenTabs(next);
    if (!next.includes(documentSelected)) setDocumentSelected(id);
    if (activeTool === "files" && !next.includes(selected)) {
      setStartActive(false);
      onSelect(id);
    }
  };
  const openTabContextMenu = (event: ReactMouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenFileMenuId(null);
    setOpenFolderMenuId(null);
    setTabMenu({ id, x: event.clientX, y: event.clientY });
  };
  const version = libraryVersions.find((v) => v.id === selected);
  const htmlBrowserFiles = libraryVersions
    .filter((item) => !item.deleted_at && /\.html?$/i.test(item.filename || ""))
    .map((item) => ({ id: item.id, filename: item.filename, address: browserFileAddress(item) }));
  const activeBrowserTab = browserTabs.find((tab) => tab.key === browserSelected) || null;
  const browserNavigationCtx = {
    libraryVersions,
    versions,
    libraryFolders,
    browserFileAddress,
  };
  const resolveBrowserNavigation = (href: string, tab: BrowserTab) =>
    resolveBrowserNavigationImpl(href, tab, browserNavigationCtx);
  const handleBrowserNavigation = (href: string) => {
    if (!activeBrowserTab) return;
    const navigation = resolveBrowserNavigation(href, activeBrowserTab);
    setBrowserTabs((previous) => previous.map((tab) => (
      tab.key === activeBrowserTab.key
        ? { ...tab, versionId: navigation.versionId, url: navigation.address, loadUrl: navigation.href, label: navigation.label }
        : tab
    )));
    setBrowserAddressQuery(navigation.address);
    if (navigation.versionId) onSelect(navigation.versionId);
  };
  const handleBrowserNewWindow = (href: string, title?: string) => {
    if (!activeBrowserTab) return;
    const key = `window:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const navigation = resolveBrowserNavigation(href, activeBrowserTab);
    const label = title?.trim() || navigation.label || "新页面";
    setBrowserTabs((previous) => [...previous, {
      key,
      versionId: navigation.versionId,
      url: navigation.address,
      loadUrl: navigation.href,
      label,
    }]);
    setBrowserSelected(key);
    setBrowserAddressQuery(navigation.address);
    setStartOpen(false);
    setStartActive(false);
    setActiveTool("browser");
    onSelect(navigation.versionId);
  };
  const openBrowserInComputer = () => {
    if (!activeBrowserTab?.versionId) return;
    const href = activeBrowserTab.loadUrl || `/api/versions/${activeBrowserTab.versionId}/preview/`;
    window.open(href, "_blank", "noopener,noreferrer");
  };
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
      `${v.title} ${v.filename}`.toLowerCase().includes(deferredFilter.toLowerCase()),
    );
  const previewSourceContext = {
    selected,
    previewReload,
    setView,
    setError,
    setImagePreview,
    setFileInfoOpen,
  };
  useDocumentPreviewSource(previewSourceContext);
  useEffect(() => {
    const htmlDocumentMode = activeTool === "files";
    if (!selected || view?.kind !== "html" || (!htmlDocumentMode && previewMode !== "text") || view.text != null) return;
    let alive = true;
    const cached = documentViewCache.get(selected);
    if (cached?.kind === "html" && cached.text != null) {
      setView((previous) => (previous?.kind === "html"
        ? { ...previous, text: cached.text, truncated: cached.truncated, byteSize: cached.byteSize }
        : previous));
      return () => { alive = false; };
    }
    const loadSource = async () => {
      const loaded = await readVersionText(selected, view.byteSize || 0);
      if (alive) {
        documentViewCache.update(selected, (previous) => previous?.kind === "html"
          ? { ...previous, text: loaded.text, truncated: loaded.truncated, byteSize: loaded.byteSize }
          : previous || { kind: "html", mime: view.mime, text: loaded.text, truncated: loaded.truncated, byteSize: loaded.byteSize });
        setView((previous) => (previous?.kind === "html"
          ? { ...previous, text: loaded.text, truncated: loaded.truncated, byteSize: loaded.byteSize }
          : previous));
      }
    };
    loadSource().catch((cause) => {
      if (alive) setError(cause instanceof Error ? cause.message : "源码读取失败");
    });
    return () => { alive = false; };
  }, [activeTool, selected, previewMode, view?.kind, view?.text]);
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
  const linkedOfficialVersion = (item: LibraryVersion) => item.saved_official_artifact_id
    ? versions
      .filter((row) => row.artifact_id === item.saved_official_artifact_id)
      .sort((a, b) => b.version - a.version)[0]
    : undefined;
  const showSaveToOfficial = (item: LibraryVersion) =>
    writable && !organizing && !item.deleted_at && (isCacheVersion(item) || isOutputVersion(item));
  const canBranchVersion = (item: LibraryVersion) =>
    writable && !item.deleted_at && isOutputVersion(item);
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
    if (isCacheVersion(item)) return "仅已确认的对话缓存可另存为正式文件";
    if (isOutputVersion(item)) return "仅已确认的沙箱产物版本可另存为正式文件";
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
  const folderDownloadCtx = {
    projectId,
    downloadingFolderId,
    setDownloadingFolderId,
    setDownloadProgress,
    setActionError,
  };
  const downloadFolder = (folder: LibraryFolder) =>
    downloadFolderArchive(folder, folderDownloadCtx);
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
    }, "文件已恢复");
  };
  const saveFileToOfficial = (item: LibraryVersion) => {
    if (isOutputVersion(item)) {
      const confirmed = confirmedOutputVersions(item);
      const pick = confirmed.find((row) => row.id === item.id) || confirmed[0];
      if (!pick) return;
      onSelect(pick.id);
      setSavingOfficial(item);
      setSaveOfficialVersionId(pick.id);
      setSaveOfficialTitle(officialTitleWithVersion(item.title, versionCodeForRows(pick, versions)));
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
    }, "已另存至正式文件");
  };
  const triggerOrganize = () => act(async () => {
    await change(`/projects/${projectId}/documents/organize`, {});
    onSelect("");
    setOrganizeOpen(false);
  }, "已提交正式文件整理");
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
    }, "文件已移动");
  };
  const moveFolderToParent = (folderId: string, parentId: string) => {
    if (!isOfficialDropFolder(parentId) || folderId === parentId) return;
    void act(async () => {
      await change(
        `/projects/${projectId}/folders/${folderId}`,
        { parentId },
        "PATCH",
      );
    }, "文件夹已移动");
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
    if (target.type === "empty-recycle") {
      void act(async () => {
        const result = await change(`/projects/${projectId}/recycle/empty`, {}) as {
          retained?: { versions?: number };
        };
        onSelect("");
        const kept = Number(result?.retained?.versions || 0);
        showTip(kept
          ? `回收站已清空。仍有 ${kept} 个被引用的版本保留内容，可从历史消息打开，但不能恢复到文件树。`
          : "回收站已清空");
      });
      return;
    }
    if (target.type === "file") {
      const item = target.item;
      void act(async () => {
        await change(
          `/projects/${projectId}/artifacts/${item.artifact_id}`,
          { deleted: true },
          "PATCH",
        );
        if (selected === item.id) onSelect("");
      }, "文件已删除");
      return;
    }
    void act(async () => {
      await change(`/projects/${projectId}/folders/${target.item.id}`, undefined, "DELETE");
      selectFolder(target.item.parent_id || officialRoot?.id || null);
    }, "文件夹已删除");
  };
  const fileRowProps = {
    version,
    libraryFolders,
    writable,
    pending,
    trash,
    organizing,
    draggedArtifactId,
    openFileMenuId,
    setOpenFileMenuId,
    setOpenFolderMenuId,
    setDraggedArtifactId,
    setDropTargetFolderId,
    setFolderId,
    setFileContextMenu,
    setSelectionContextMenu,
    setTabMenu,
    onSelect,
    onReference,
    onAddToTask,
    canEditOfficial,
    canManageFile,
    showSaveToOfficial,
    canSaveToOfficial,
    saveToOfficialHint,
    linkedOfficialVersion,
    fileAreaKind,
    selectDocument,
    startRenameFile,
    deleteFile,
    restoreFile,
    saveFileToOfficial,
  };
  const fileRow = (v: LibraryVersion, depth: number) => (
    <DocumentFileRow {...fileRowProps} v={v} depth={depth} />
  );
  const treeProps = {
    fileRow,
    artifacts,
    libraryFolders,
    sort,
    collapsed,
    setCollapsed,
    dropTargetFolderId,
    setDropTargetFolderId,
    draggedFolderId,
    setDraggedFolderId,
    pending,
    setPending,
    openFolderMenuId,
    setOpenFolderMenuId,
    setOpenFileMenuId,
    setTabMenu,
    downloadingFolderId,
    setDownloadingFolderId,
    downloadProgress,
    setDownloadProgress,
    uploadInputRef,
    collator,
    modified,
    organizing,
    canManageOfficialFolders,
    canDragOfficialFolder,
    onReferenceFolder,
    onAddFolderToTask,
    folderDropHandlers,
    subtreeStats,
    toggleFolder,
    selectFolder,
    openNewFolder,
    openRenameFolder,
    deleteFolder,
    downloadFolder,
  };
  const tree = (parent: string | null, depth = 0): ReactNode => (
    <DocumentTree {...treeProps} parent={parent} depth={depth} renderSelf={tree} />
  );
  const libraryRootRowProps = {
    collapsed,
    setCollapsed,
    dropTargetFolderId,
    setDropTargetFolderId,
    pending,
    setPending,
    openFolderMenuId,
    setOpenFolderMenuId,
    setOpenFileMenuId,
    setTabMenu,
    setOrganizeOpen,
    setFolderGuideKind,
    downloadingFolderId,
    setDownloadingFolderId,
    downloadProgress,
    setDownloadProgress,
    writable,
    organizing,
    canManageOfficialFolders,
    uploadInputRef,
    onReferenceFolder,
    onAddFolderToTask,
    folderDropHandlers,
    subtreeStats,
    toggleFolder,
    selectFolder,
    openNewFolder,
    copyProjectInfo,
    downloadFolder,
    tree,
  };
  const renderLibraryRoot = (root: LibraryFolder) => (
    <LibraryRootRow key={root.id} {...libraryRootRowProps} root={root} />
  );
  const openCodeFolderMenu = (event: ReactMouseEvent, menuId: string) => {
    if (pending) return;
    event.preventDefault();
    event.stopPropagation();
    setOpenFolderMenuId(menuId);
    setOpenFileMenuId(null);
    setTabMenu(null);
  };
  const codeFolderMenuProps = (menuId: string) => ({
    menuId,
    openMenuId: openFolderMenuId,
    onOpenMenuChange: (id: string | null) => {
      setOpenFolderMenuId(id);
      if (id) {
        setOpenFileMenuId(null);
        setTabMenu(null);
      }
    },
    disabled: pending,
    isRoot: true as const,
  });
  const codeLibraryRootProps = {
    collapsed,
    setCollapsed,
    setCodeGuideId,
    codeEntries,
    openCodeFolderMenu,
    toggleFolder,
    codeFolderMenuProps,
  };
  const renderCodeLibraryRoot = () => <CodeLibraryRoot {...codeLibraryRootProps} />;
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
  const explorerTreeContent = trash || filter
    ? artifacts.map((v) => fileRow(v, 0))
    : (
      <>
        {libraryRoots.map((root) => renderLibraryRoot(root))}
        {renderCodeLibraryRoot()}
      </>
    );
  const explorer = (
    <DocumentLibraryExplorer
      treeWidth={treeWidth}
      treeWidthMin={TREE_WIDTH_MIN}
      treeWidthMax={TREE_WIDTH_MAX}
      fileSearchRef={fileSearchRef}
      filter={filter}
      sort={sort}
      pending={pending}
      organizing={organizing}
      writable={writable}
      trash={trash}
      artifacts={artifacts}
      canEmptyTrash={libraryVersions.some((item) => item.deleted_at)}
      libraryFolders={libraryFolders}
      actionError={actionError}
      organizationError={organization?.status === "failed" ? organization.error || "正式文件整理未完成，可以重试。" : undefined}
      pendingLabel={pendingLabel}
      uploadProgress={uploadProgress}
      treeContent={explorerTreeContent}
      renderTreeIcon={(kind) => <TreeIcon kind={kind} />}
      onResizeStart={startTreeResize}
      onFilterChange={setFilter}
      onSortToggle={() => setSort(sort === "type" ? "modified" : "type")}
      onToggleTrash={() => {
        setTrash(!trash);
        onSelect("");
        setFilter("");
      }}
      onEmptyTrash={() => setDeleteConfirm({ type: "empty-recycle" })}
      onOpenChangeLog={() => {
        setChangePageNumber(1);
        setChangePageInput("1");
        setChangesOpen(true);
      }}
      changeLogOpen={changesOpen}
    />
  );
  const capsuleKind = view?.kind || (() => {
    const name = String(version?.filename || "").toLowerCase();
    if (/\.html?$/.test(name)) return "html";
    if (/\.md(own)?$/.test(name)) return "markdown";
    if (TEXT_PREVIEW_NAME.test(name)) return "text";
    if (/\.pdf$/.test(name)) return "pdf";
    if (/\.(png|jpe?g|gif|webp|svg)$/.test(name)) return "image";
    if (/\.docx$/.test(name)) return "docx";
    if (/\.(xlsx|csv)$/.test(name)) return "xlsx";
    if (/\.pptx$/.test(name)) return "pptx";
    return "download";
  })();
  const isHtmlFile = capsuleKind === "html";
  const supportsPreview = ["markdown", "docx", "xlsx", "pptx", "image", "pdf"].includes(capsuleKind);
  const supportsSource = ["markdown", "html", "text"].includes(capsuleKind);
  const setSourceMode = () => {
    setPreviewMode("text");
    setView((previous) => (previous ? { ...previous, nativeSource: false } : previous));
  };
  const setPlainTextMode = () => {
    setPreviewMode("text");
    setView((previous) => (previous ? { ...previous, nativeSource: true, truncated: false } : previous));
  };
  const setPreviewViewMode = () => {
    setPreviewMode("preview");
    setView((previous) => (previous ? { ...previous, nativeSource: false } : previous));
  };
  // 文档阅览的「刷新」：丢掉该版本的预览缓存后再重新读取，这样刷新是真的重新拉一次。
  const reloadDocumentPreview = () => {
    if (selected) documentViewCache.delete(selected);
    setPreviewReload((value) => value + 1);
  };
  const fileActionCapsule = version && activeTool === "files" && (supportsPreview || supportsSource) ? (
    <DocumentFileActionCapsule
      supportsPreview={supportsPreview}
      supportsSource={supportsSource}
      isPreviewActive={previewMode === "preview" && !view?.nativeSource}
      isSourceActive={(previewMode === "text" || (isHtmlFile && activeTool === "files")) && !view?.nativeSource}
      isPlainTextActive={Boolean(view?.nativeSource)}
      onPreview={setPreviewViewMode}
      onSource={setSourceMode}
      onPlainText={setPlainTextMode}
    />
  ) : null;
  const fileInfoRows: DocumentFileInfoRow[] = version ? [
    { label: "名称", value: version.title },
    { label: "文件名", value: version.filename },
    { label: "ID", value: version.id },
    { label: "位置", value: documentSourceLabel(version, libraryFolders) },
    { label: "类型", value: fileAreaTypeLabels[fileAreaKind(version) || ""] || "未知" },
    { label: "大小", value: formatFileSize(view?.byteSize || version.byte_size || 0) },
    { label: "后缀", value: extension(version.filename) ? `.${extension(version.filename)}` : "—" },
    { label: "格式", value: fileEncodingLabel(version.mime || view?.mime, version.filename) },
    { label: "作者", value: version.author || "—" },
    { label: "创建时间", value: version.created_at ? new Date(version.created_at).toLocaleString("zh-CN") : "—" },
    { label: "修改日期", value: version.updated_at ? new Date(version.updated_at).toLocaleString("zh-CN") : "—" },
  ] : [];
  const fileInfoDialog = fileInfoOpen && version ? (
    <DocumentFileInfoDialog rows={fileInfoRows} onClose={() => setFileInfoOpen(false)} />
  ) : null;
  const versionOptionDetail = (v: LibraryVersion) =>
    `v${versionCodeForRows(v, versions)}${v.deleted_at ? " · 已删除" : ""}${
      documentStatusLabel(v, fileAreaKind(v)) === "已确认" ? " · 已确认" : ` · ${documentStatusLabel(v, fileAreaKind(v))}`
    }`;
  const artifactVersionRows = useMemo(
    () => version
      ? versions
          .filter((v) => v.artifact_id === version.artifact_id)
          .sort((a, b) => b.version - a.version)
      : [],
    [version, versions],
  );
  const browserVersionHistorySelect =
    version && artifactVersionRows.length > 1 ? (
      <DocumentVersionHistorySelect
        selected={selected}
        title={versionOptionDetail(artifactVersionRows.find((v) => v.id === selected) || version)}
        options={artifactVersionRows.map<DocumentVersionHistoryOption>((v) => ({
          id: v.id,
          value: v.id,
          title: versionOptionDetail(v),
          label: `v${versionCodeForRows(v, versions)}`,
        }))}
        onChange={onSelect}
      />
    ) : null;
  const browserFileBreadcrumb = version ? (
    <DocumentPreviewBreadcrumb
      sourceLabel={documentSourceLabel(version, libraryFolders)}
      filename={version.filename}
      displayName={fileLabel(version)}
      onReload={reloadDocumentPreview}
      onShowInfo={() => setFileInfoOpen(true)}
    />
  ) : null;
  const browserSourceActions = version ? (() => {
    const area = fileAreaKind(version);
    if (area === "project_official") {
      const source = version.source_artifact_id
        ? versions.find((row) => row.artifact_id === version.source_artifact_id)
        : null;
      const sourceType = version.source_type;
      if (sourceType !== "cache_saved" && sourceType !== "output_saved") return null;
      const sourceLabel = officialSourceTypeLabels[sourceType] || "来源文件";
      return (
        <DocumentSourceActions
          sourceId={source && !source.deleted_at ? source.id : undefined}
          buttonLabel={sourceType === "cache_saved" ? "查看·缓存源文件" : "查看·沙箱源文件"}
          deletedLabel={`${sourceLabel} · 源文件已删除`}
          pending={pending}
          onSelect={onSelect}
        />
      );
    }
    if (area !== "project_cache" && area !== "project_outputs") return null;
    if (!version.saved_official_artifact_id) return null;
    const official = versions.find((row) => row.artifact_id === version.saved_official_artifact_id);
    return (
      <DocumentSourceActions
        sourceId={official && !official.deleted_at ? official.id : undefined}
        buttonLabel="查看·已另存正式文件"
        deletedLabel="已另存 · 正式文件已删除"
        pending={pending}
        onSelect={onSelect}
      />
    );
  })() : null;
  const reviewActions = version && !version.deleted_at ? (
    <DocumentReviewActions
      showApprove={
        !artifactVersionRows.some((row) => !row.deleted_at && row.version > version.version)
        && (fileAreaKind(version) === "project_cache" || fileAreaKind(version) === "project_outputs")
        && documentStatusLabel(version, fileAreaKind(version)) === "草稿" && Boolean(onReview)
      }
      statusLabel={documentStatusLabel(version, fileAreaKind(version))}
      canBranch={canBranchVersion(version)}
      pending={pending}
      onApprove={() => {
        if (onReview) void act(() => onReview(selected, "approved"));
      }}
      onBranch={() => openBranchDialog(version)}
    />
  ) : null;
  const nativeSourceFrame = view?.nativeSource && selected ? (
    <iframe
      className="doc-file-source-frame"
      title={version?.filename ?? "源码"}
      src={`/api/versions/${selected}/source`}
      sandbox=""
      referrerPolicy="no-referrer"
    />
  ) : null;
  const documentPreviewMode = activeTool === "files" && view?.kind === "html"
    ? "text"
    : previewMode;
  const previewContent = (
    <>
      <DocumentPreviewContent
        kind={view?.kind}
        mode={documentPreviewMode}
        text={view?.text}
        selected={selected}
        filename={version?.filename}
        nativeSourceFrame={nativeSourceFrame}
        htmlPreview={selected ? (
          <HtmlPreviewFrame
            key={`${browserSelected || selected}-preview-${previewReload}`}
            versionId={selected}
            filename={activeBrowserTab?.label || version?.filename || "HTML"}
            src={activeBrowserTab?.loadUrl}
            files={htmlBrowserFiles}
            addressQuery={browserAddressQuery}
            onAddressQueryChange={setBrowserAddressQuery}
            onSelectFile={openBrowserTab}
            deviceMode={browserDeviceMode}
            mobileDeviceId={browserMobileDeviceId}
            onDeviceModeChange={setBrowserDeviceMode}
            onMobileDeviceIdChange={setBrowserMobileDeviceId}
            zoomPercent={browserMobileZoom}
            onZoomChange={setBrowserMobileZoom}
            onReload={() => setPreviewReload((value) => value + 1)}
            onOpenExternal={openBrowserInComputer}
            onNavigate={handleBrowserNavigation}
            onNewWindow={handleBrowserNewWindow}
          />
        ) : null}
      />
      {view && <StaticDocumentPreview kind={view.kind} bytes={view.bytes} version={version} url={view.url} onOpenImage={(source) => setImagePreview({ ...source, title: fileLabel(version!) })} />}
    </>
  );
  // 开始页签（也是「什么都没打开」时的默认内容）：两个入口按钮。
  const startPageContent = (
    <div className="library-empty">
      <UiIcon name="compass" size={48} className="doc-browser-start-mark" />
      <button
        type="button"
        className="doc-browser-start-card"
        onClick={() => (treeOpen ? setTreeOpen(false) : openDocumentTree())}
      >
        {treeOpen
          ? <OpenFolderIcon className="doc-browser-start-card-icon" />
          : <ClosedFolderIcon className="doc-browser-start-card-icon" />}
        <span className="doc-browser-start-card-copy">
          <strong>{treeOpen ? "关闭文件树" : "打开文件树"}</strong>
          <small>{treeOpen ? "收起项目里的文档与文件夹" : "浏览项目里的文档与文件夹"}</small>
        </span>
      </button>
      <button
        type="button"
        className="doc-browser-start-card"
        onClick={createBrowserNewTab}
      >
        <TreeIcon kind="globe" className="doc-browser-start-card-icon" />
        <span className="doc-browser-start-card-copy">
          <strong>打开新HTML页签</strong>
          <small>在项目里打开一个 HTML 页面</small>
        </span>
      </button>
    </div>
  );
  const mainPanelProps = {
    mainPanelRef,
    renaming,
    setRenaming,
    renameName,
    setRenameName,
    newFolder,
    setNewFolder,
    newFolderName,
    setNewFolderName,
    renamingFolder,
    setRenamingFolder,
    renameFolderName,
    setRenameFolderName,
    savingOfficial,
    setSavingOfficial,
    saveOfficialVersionId,
    setSaveOfficialVersionId,
    saveOfficialTitle,
    setSaveOfficialTitle,
    pending,
    setPending,
    error,
    setError,
    activeTool,
    setActiveTool,
    browserAddressQuery,
    setBrowserAddressQuery,
    browserDeviceMode,
    setBrowserDeviceMode,
    browserAddressFocusKey,
    setBrowserAddressFocusKey,
    projectId,
    libraryFolders,
    versions,
    version,
    selectedLibraryFolder,
    officialFolderParentId,
    startActive,
    view,
    setCollapsed,
    setFolderId,
    startPageContent,
    previewContent,
    browserFileBreadcrumb,
    fileActionCapsule,
    browserVersionHistorySelect,
    reviewActions,
    browserSourceActions,
    activeBrowserTab,
    htmlBrowserFiles,
    act,
    change,
    openBrowserTab,
    confirmedOutputVersions,
    handleDocumentMouseDown,
    handleDocumentContextMenu,
  };
  const mainPanel = <DocumentMainPanel {...mainPanelProps} />;
  const organizeDialog = organizeOpen ? (
          <LibraryOrganizeDialog
            organizing={organizing}
            pending={pending}
            canOrganize={canOrganizeOfficial}
            error={organization?.status === "failed" ? organization.error || "上次整理失败，可重试。" : undefined}
            onClose={() => setOrganizeOpen(false)}
            onOrganize={() => void triggerOrganize()}
          />
        ) : null;
  const folderGuideDialog = folderGuideKind ? (
          <FolderGuideDialog
            title={`${ROOT_LABELS[folderGuideKind]} · 文件夹说明`}
            body={ROOT_GUIDES[folderGuideKind]}
            onClose={() => setFolderGuideKind(null)}
          />
        ) : null;
  const codeGuideTarget = (() => {
    if (!codeGuideId) return null;
    if (codeGuideId === CODE_LIBRARY_ROOT_ID) {
      return { title: CODE_LIBRARY_ROOT_NAME, body: CODE_LIBRARY_GUIDE as string | null, lines: null as string[] | null };
    }
    for (const entry of codeEntries) {
      if (entry.id === codeGuideId) {
        return { title: entry.name, body: null, lines: entry.lines };
      }
      if (entry.type === "connector") {
        const remote = entry.remotes.find((item) => item.id === codeGuideId);
        if (remote) return { title: remote.name, body: null, lines: remote.lines };
      }
    }
    return { title: "连接器", body: CODE_LIBRARY_GUIDE, lines: null };
  })();
  const codeGuideDialog = codeGuideTarget ? (
          <CodeGuideDialog
            title={codeGuideTarget.title}
            body={codeGuideTarget.body}
            lines={codeGuideTarget.lines}
            onClose={() => setCodeGuideId(null)}
          />
        ) : null;
  const deleteConfirmCopy = (() => {
    if (!deleteConfirm) return null;
    if (deleteConfirm.type === "empty-recycle") {
      const count = libraryVersions
        .filter((item) => item.deleted_at)
        .filter((item, index, list) => list.findIndex((row) => row.artifact_id === item.artifact_id) === index)
        .length;
      return {
        title: "确认清空回收站",
        body: count
          ? `将永久清空本项目回收站中的 ${count} 份文档，不受当前搜索筛选影响。未被消息或任务引用的文件会从数据库删除；仍被引用的版本会保留内容供历史查看，但不能再恢复到文件树。`
          : "回收站没有可清空的文件。",
        confirm: "确认清空",
      };
    }
    if (deleteConfirm.type === "file") {
      const item = deleteConfirm.item;
      const unversioned = isUnversionedArea(fileAreaKind(item));
      return {
        title: "确认删除文件",
        body: unversioned
          ? `删除「${item.title}」后将移入回收站，可从回收站原路恢复。`
          : `删除「${item.title}」及其全部版本后将移入回收站，可从回收站原路恢复。`,
        confirm: "确认删除",
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
      confirm: "确认删除",
    };
  })();
  const deleteConfirmDialog = deleteConfirm && deleteConfirmCopy ? (
          <DeleteConfirmDialog
            title={deleteConfirmCopy.title}
            body={deleteConfirmCopy.body}
            confirmLabel={deleteConfirmCopy.confirm}
            danger={deleteConfirm.type === "empty-recycle"}
            confirmDisabled={deleteConfirm.type === "empty-recycle" && !libraryVersions.some((item) => item.deleted_at)}
            onClose={() => setDeleteConfirm(null)}
            onConfirm={confirmDelete}
          />
        ) : null;
  const branchDialog = branchVersion ? (
    <BranchVersionDialog
      target={branchTarget}
      title={branchTitle}
      pending={pending}
      onTargetChange={setBranchTarget}
      onTitleChange={setBranchTitle}
      onClose={() => setBranchVersion(null)}
      onSubmit={() => void submitBranch()}
    />
  ) : null;

  const tabVersion = (id: string) => libraryVersions.find((item) => item.id === id)
    || versions.find((item) => item.id === id);
  const goToChangePage = (target: number) => {
    const next = Math.min(Math.max(Math.trunc(target) || 1, 1), changePage.totalPages);
    if (next === changePageNumber) return;
    setChangePageInput(String(next));
    setChangePageNumber(next);
    setChangePage((current) => ({ ...current, currentPage: next, hasMore: next < current.totalPages }));
  };
  const contextVersion = fileContextMenu
    ? libraryVersions.find((item) => item.id === fileContextMenu.id)
      || versions.find((item) => item.id === fileContextMenu.id)
    : null;
  const contextKind: FileContextMenuKind = contextVersion && isImageFilename(contextVersion.filename)
    ? "image"
    : contextVersion && /\.html?$/i.test(contextVersion.filename || "")
      ? "html"
      : "other";
  // 文档阅览与 HTML 阅览共用一个页签栏：文档页签在前、HTML 页签在后，末尾是新开 HTML 页签的加号，
  // 再接文档操作日志、全屏与文件树开合按钮。四种元素必须同排（同一 .doc-browser-tabbar 行），所以整行一起成型。
  const isBrowserTabKey = (id: string) => browserTabs.some((tab) => tab.key === id);
  const activeTabId = startActive
    ? START_TAB_ID
    : activeTool === "browser"
      ? browserSelected || null
      : documentSelected || selected || null;
  const hasContentTabs = openTabs.length > 0 || browserTabs.length > 0;
  // 开始页签排在最后（就是加号的位置）：没有别的页签时它是默认页签、不显示关闭按钮，
  // 有别的页签时显示关闭按钮；加号只在它关闭时出现，两者互斥。
  const contentTabs: DocumentTabListItem[] = [
    ...openTabs.map<DocumentTabListItem>((id) => {
      const item = tabVersion(id);
      return {
        id,
        label: item ? fileLabel(item) : "文档",
        icon: item ? <LibraryFileIcon fileName={item.filename} versionId={item.id} className="tree-icon file-type-icon" width={14} height={14} /> : null,
      };
    }),
    ...browserTabs.map<DocumentTabListItem>((tab, index) => {
      const item = tabVersion(tab.versionId);
      return {
        id: tab.key,
        label: tab.label,
        title: tab.url || tab.label,
        // 还没打开具体页面的 HTML 阅览页签用地球图标，与「打开新HTML页签」入口一致。
        icon: item
          ? <LibraryFileIcon fileName={item.filename} versionId={item.id} className="tree-icon file-type-icon" width={14} height={14} />
          : <UiIcon name="globe" size={14} />,
        // 第一项 HTML 页签在文档页签之后加一条分隔线，让同一栏里的两类页签可区分。
        className: index === 0 && openTabs.length ? "doc-browser-tab-html" : undefined,
      };
    }),
    ...(startOpen
      ? [{
        id: START_TAB_ID,
        label: "开始",
        title: "开始",
        icon: <UiIcon name="compass" size={14} />,
        className: hasContentTabs ? "doc-browser-tab-start" : undefined,
        closable: hasContentTabs,
      } satisfies DocumentTabListItem]
      : []),
  ];
  const closeStartTab = () => {
    setStartOpen(false);
    if (!startActive) return;
    // 关掉正在看的开始页签：接管到左边最近的页签；没有别的页签就保持开始页签。
    const neighbor = browserTabs[browserTabs.length - 1];
    const docTab = openTabs[openTabs.length - 1];
    if (neighbor) selectBrowserTab(neighbor.key);
    else if (docTab) selectDocument(docTab);
    else {
      setStartOpen(true);
      setStartActive(true);
    }
  };
  const selectContentTab = (id: string) => {
    if (id === START_TAB_ID) activateStartTab();
    else if (isBrowserTabKey(id)) selectBrowserTab(id);
    else selectDocument(id);
  };
  const closeContentTab = (id: string) => {
    if (id === START_TAB_ID) closeStartTab();
    else if (isBrowserTabKey(id)) closeBrowserTab(id);
    else closeTab(id);
  };
  // 页签右键菜单：文档页签、HTML 阅览页签、开始页签各有各自适用的动作。
  const tabMenuContext = {
    treeOpen,
    setTreeOpen,
    openDocumentTree,
    hasContentTabs,
    openTabs,
    setOpenTabs,
    browserTabs,
    setBrowserTabs,
    browserSelected,
    setBrowserSelected,
    setPreviewReload,
    selected,
    onSelect,
    onRefresh,
    onReference,
    createBrowserNewTab,
    closeStartTab,
    selectBrowserTab,
    copyBrowserTabAddress,
    closeBrowserTab,
    closeOtherBrowserTabs,
    closeBrowserTabsDirection,
    closeTab,
    closeOtherTabs,
    closeTabsDirection,
  };
  const buildTabMenuItems = (id: string) => buildDocumentTabMenuItems(id, tabMenuContext);
  // 所有页签（文档 / HTML 阅览页 / 开始）都提供右键菜单。
  const openContentTabContextMenu = (event: ReactMouseEvent, id: string) => {
    if (!buildTabMenuItems(id).length) return;
    openTabContextMenu(event, id);
  };
  const tabMenuItems: TabMenuItem[] = tabMenu ? buildTabMenuItems(tabMenu.id) : [];
  // 文件树只属于文档阅览态（HTML 阅览态它是右侧浮层，会压住浏览器工具条），
  // 所以在 HTML 页签上点它等价于“回到文档阅览并打开文件树”。
  const treeToggleActive = treeOpen && activeTool === "files";
  const toggleTree = () => {
    if (treeToggleActive) {
      setTreeOpen(false);
      return;
    }
    openDocumentTree();
  };
  const tabbarProps = {
    openTabs,
    setOpenTabs,
    browserTabs,
    setBrowserTabs,
    startOpen,
    activeTabId,
    treeToggleActive,
    tabMenu,
    setTabMenu,
    tabMenuItems,
    newTabMenu,
    setNewTabMenu,
    contentTabs,
    openContentTabContextMenu,
    selectContentTab,
    closeContentTab,
    createBrowserNewTab,
    openDocumentTree,
    toggleTree,
  };
  const contentTabbar = <DocumentsTabbar {...tabbarProps} />;
  return (
    <div className="library-embedded doc-browser">
      <section className={`library doc-browser-shell${activeTool === "browser" ? " browser-tool-active" : ""}`} aria-label="项目文档库">
        {uploadInput}
        {fileContextMenu && contextVersion ? (
          <DocumentFileContextMenu
            x={fileContextMenu.x}
            y={fileContextMenu.y}
            kind={contextKind}
            onOpenBrowser={contextKind === "html" ? () => openHtmlInBrowser(contextVersion) : undefined}
            onCopyAddress={contextKind === "image" ? () => void copyImageAddress(contextVersion) : undefined}
            onCopyImage={contextKind === "image" ? () => void copyImageVersion(contextVersion) : undefined}
            onDownload={() => {
              window.open(`/api/versions/${contextVersion.id}/download`, "_blank", "noopener,noreferrer");
              setFileContextMenu(null);
            }}
            onDismiss={() => setFileContextMenu(null)}
          />
        ) : null}
        {selectionContextMenu && onAddSelectionToConversation ? (
          <TextSelectionContextMenu
            x={selectionContextMenu.x}
            y={selectionContextMenu.y}
            onCopy={() => void copySelection()}
            onAddToConversation={() => {
              restoreTextSelection();
              onAddSelectionToConversation(selectionContextMenu.text, selected);
              setSelectionContextMenu(null);
            }}
            onDismiss={() => setSelectionContextMenu(null)}
          />
        ) : null}
        <ProjectContentPanel
          tabbar={contentTabbar}
          explorer={activeTool === "files" && treeOpen ? explorer : null}
          mainPanel={mainPanel}
        />
        {organizeDialog}
        {folderGuideDialog}
        {codeGuideDialog}
        {deleteConfirmDialog}
        {fileInfoDialog}
        {branchDialog}
        {changesOpen ? (
          <ModalBackdrop className="library-organize-backdrop" onClose={() => setChangesOpen(false)}>
            {(close) => <DocumentChangeLogDialog
              close={close}
              draft={changeFilterDraft}
              filters={changeFilters}
              page={changePage}
              changes={changes}
              loading={changesLoading}
              error={changesError}
              actionLabels={documentChangeLabels}
              sourceLabels={documentChangeSources}
              actions={documentChangeActions}
              onDraftChange={setChangeFilterDraft}
              onApply={() => { setChangePageNumber(1); setChangePageInput("1"); setChangeFilters({ ...changeFilterDraft, fileName: changeFilterDraft.fileName.trim() }); }}
              onReset={() => { const empty = { from: "", to: "", fileName: "", action: "", limit: "20" }; setChangeFilterDraft(empty); setChangeFilters(empty); setChangePageNumber(1); setChangePageInput("1"); }}
              onLimitChange={(limit) => { setChangeFilterDraft((current) => ({ ...current, limit })); setChangeFilters((current) => ({ ...current, limit })); setChangePageNumber(1); setChangePageInput("1"); setChangePage((current) => ({ ...current, currentPage: 1 })); }}
              onGoToPage={goToChangePage}
            />}
          </ModalBackdrop>
        ) : null}
        {imagePreview && (
          <ImagePreviewDialog
            {...imagePreview}
            onClose={() => setImagePreview(null)}
          />
        )}
      </section>
    </div>
  );
});
