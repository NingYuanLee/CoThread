import { readJsonResponse } from "../shared/json-response.js";
import { apiFetch } from "./api-fetch";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type SVGProps } from "react";
import { createPortal } from "react-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileIcon } from "@react-symbols/icons/utils";
import {
  Document,
  Markdown as MarkdownFile,
  Notebook,
  Python,
  Text,
} from "@react-symbols/icons/files";
import { CodePreview, DocxPreview, formatHtmlSource, MermaidPreview, PptxPreview, XlsxPreview } from "./office-preview";
import { resolvePreviewAssetPath, PREVIEW_CONSOLE_MESSAGE } from "../shared/html-preview.mjs";
import { fileDisplayName } from "../shared/document-name.js";
import { LIBRARY_ROOT_KINDS, folderRootKind } from "./document-library";
import { UiIcon } from "./ui-icon";
import { DialogClose, ModalBackdrop } from "./dialog-fx";
import { ImagePreviewDialog, type ImagePreviewSource } from "./ImagePreview";
import { showTip } from "./Tip";
import { MCP_OFFICIAL_LIBRARY_COPY_INSTRUCTION, formatMcpCopyPayload } from "../shared/mcp-guide.js";
import { uploadFileWithIntegrity } from "./file-upload";
import { PdfPreview } from "./PdfPreview";
const officeIcons = {
  odt: Document,
  rtf: Document,
  odp: Notebook,
  md: MarkdownFile,
  markdown: MarkdownFile,
  txt: Text,
  log: Text,
  env: Text,
  ini: Text,
  conf: Text,
  toml: Text,
  py: Python,
};

function isSvgFilename(fileName: string) {
  return /\.svg$/i.test(fileName);
}

function OfficeFileIcon({ fileName, ...props }: { fileName: string } & SVGProps<SVGSVGElement>) {
  const extension = fileName.toLowerCase().split(".").pop() || "";
  const isPresentation = extension === "ppt" || extension === "pptx";
  const isDocument = extension === "doc" || extension === "docx";
  if (!isPresentation && !isDocument) {
    return (
      <FileIcon
        fileName={fileName}
        editFileExtensionData={officeIcons}
        autoAssign
        {...props}
      />
    );
  }

  const accent = isPresentation ? "#d24726" : "#185abd";
  const mark = isPresentation ? "P" : "W";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path d="M5 2.75h8.7L19 8.05v13.2H5z" fill="#fff" stroke={accent} strokeWidth="1.4" />
      <path d="M13.7 2.75v5.3H19" fill={accent} opacity=".18" />
      <path d="M13.7 2.75v5.3H19" stroke={accent} strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="3" y="10.2" width="9.2" height="9.2" rx="1.5" fill={accent} />
      <text x="7.6" y="17.05" fill="#fff" fontFamily="Arial, sans-serif" fontSize="6.8" fontWeight="700" textAnchor="middle">
        {mark}
      </text>
    </svg>
  );
}

function LibraryFileIcon({
  fileName,
  versionId,
  className,
  width,
  height,
}: {
  fileName: string;
  versionId: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (versionId && isSvgFilename(fileName) && !failed) {
    return (
      <img
        src={`/api/versions/${versionId}/source`}
        alt=""
        className={className}
        width={width}
        height={height}
        aria-hidden="true"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <OfficeFileIcon
      fileName={fileName}
      className={className}
      aria-hidden="true"
      width={width}
      height={height}
    />
  );
}

function HtmlPreviewFrame({
  versionId,
  filename,
}: {
  versionId: string;
  filename: string;
}) {
  const src = `/api/versions/${versionId}/preview/`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [logs, setLogs] = useState<Array<{ id: number; level: string; args: string[] }>>([]);
  useEffect(() => {
    setLogs([]);
    setConsoleOpen(false);
    let nextId = 1;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== "null" && event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== PREVIEW_CONSOLE_MESSAGE || !Array.isArray(data.args)) return;
      const level = String(data.level || "log");
      const args = data.args.map((item: unknown) => String(item));
      setLogs((previous) => {
        const row = { id: nextId++, level, args };
        return previous.length > 180 ? [...previous.slice(-160), row] : [...previous, row];
      });
      if (level === "error") setConsoleOpen(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [versionId]);
  const errorCount = logs.filter((row) => row.level === "error").length;
  return (
    <div className="doc-html-preview-shell">
      <iframe
        ref={iframeRef}
        className="doc-html-preview-frame"
        title={filename}
        src={src}
        sandbox="allow-scripts allow-forms allow-modals"
        referrerPolicy="no-referrer"
      />
      <div className={`doc-html-preview-console${consoleOpen ? " open" : ""}`}>
        <div className="doc-html-preview-console-bar">
          <button type="button" onClick={() => setConsoleOpen((open) => !open)}>
            控制台{errorCount ? ` · ${errorCount}` : logs.length ? ` · ${logs.length}` : ""}
          </button>
          {consoleOpen ? (
            <button type="button" onClick={() => setLogs([])} disabled={!logs.length}>
              清空
            </button>
          ) : null}
        </div>
        {consoleOpen ? (
          <div className="doc-html-preview-console-log" role="log">
            {logs.length ? logs.map((row) => (
              <p key={row.id} className={`doc-html-preview-console-${row.level}`}>
                <span>{row.level}</span>
                {row.args.join(" ")}
              </p>
            )) : <p className="muted">暂无输出。脚本报错或资源 404 会出现在这里。</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const TEXT_PREVIEW_LIMIT = 1_048_576;
const TEXT_PREVIEW_NAME = /\.(md|markdown|txt|json|py|js|mjs|cjs|ts|tsx|jsx|css|scss|less|sql|xml|yaml|yml|sh|bash|log|env|ini|conf|toml|properties|gitignore)$/i;

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readVersionText(versionId: string, byteSize = 0) {
  const truncated = byteSize > TEXT_PREVIEW_LIMIT;
  const path = truncated
    ? `/api/versions/${versionId}/source?limit=${TEXT_PREVIEW_LIMIT}`
    : `/api/versions/${versionId}/source`;
  const response = await apiFetch(path);
  if (!response.ok) {
    const body = await readJsonResponse(response, path).catch(() => null);
    throw new Error(body?.error || `源码读取失败（${response.status}）`);
  }
  return { text: await response.text(), truncated, byteSize };
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
  onAddToTask,
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
  onAddToTask?: () => void;
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
      if (event.button !== 0) return;
      if (!anchorRef.current?.contains(event.target as Node)) onOpenMenuChange(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open, onOpenMenuChange]);
  const close = () => onOpenMenuChange(null);
  const hasLeadItems = Boolean(onAddToConversation || onAddToTask);
  const hasDeleteItem = Boolean(canDelete && onDelete);
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
        <div className="library-folder-menu" role="menu" onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
          {onAddToConversation ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onAddToConversation(); close(); }}>
              <TreeIcon kind="addToChat" />
              <span>添加到会话</span>
            </button>
          ) : null}
          {onAddToTask ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onAddToTask(); close(); }}>
              <TreeIcon kind="addToTask" />
              <span>添加到任务</span>
            </button>
          ) : null}
          {hasLeadItems ? <div className="library-folder-menu-sep" role="separator" /> : null}
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
          {hasDeleteItem ? <div className="library-folder-menu-sep" role="separator" /> : null}
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
  onAddToConversation,
  onAddToTask,
  onUpload,
  onDownload,
  canDownload,
  downloadProgress,
  onNewFolder,
  onRename,
  onDelete,
  onCopyProjectInfo,
  onExplain,
}: {
  menuId: string;
  openMenuId: string | null;
  onOpenMenuChange: (id: string | null) => void;
  disabled?: boolean;
  isRoot?: boolean;
  onAddToConversation?: () => void;
  onAddToTask?: () => void;
  onUpload?: () => void;
  onDownload?: () => void;
  canDownload?: boolean;
  downloadProgress?: number | null;
  onNewFolder?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onCopyProjectInfo?: () => void;
  onExplain?: () => void;
}) {
  const open = openMenuId === menuId;
  const anchorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (!anchorRef.current?.contains(event.target as Node)) onOpenMenuChange(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open, onOpenMenuChange]);
  const close = () => onOpenMenuChange(null);
  const hasLeadItems = Boolean(onExplain || onAddToConversation || onAddToTask);
  const hasMainItems = Boolean(onDownload || onUpload || onCopyProjectInfo || onNewFolder || (!isRoot && onRename));
  const hasDeleteItem = Boolean(!isRoot && onDelete);
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
        <div className="library-folder-menu" role="menu" onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
          {onExplain ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onExplain(); close(); }}>
              <TreeIcon kind="info" />
              <span>文件夹说明</span>
            </button>
          ) : null}
          {onAddToConversation ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onAddToConversation(); close(); }}>
              <TreeIcon kind="addToChat" />
              <span>添加到会话</span>
            </button>
          ) : null}
          {onAddToTask ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onAddToTask(); close(); }}>
              <TreeIcon kind="addToTask" />
              <span>添加到任务</span>
            </button>
          ) : null}
          {hasLeadItems && (hasMainItems || hasDeleteItem) ? <div className="library-folder-menu-sep" role="separator" /> : null}
          {onDownload ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              disabled={!canDownload || downloadProgress !== undefined && downloadProgress !== null}
              title={canDownload ? "下载文件夹内文件" : "文件夹内没有文件"}
              aria-busy={downloadProgress !== undefined && downloadProgress !== null}
              onClick={() => {
                if (canDownload && (downloadProgress === undefined || downloadProgress === null)) {
                  onDownload();
                  close();
                }
              }}
            >
              <TreeIcon kind="download" />
              <span>
                {downloadProgress !== undefined && downloadProgress !== null
                  ? downloadProgress > 0 ? `下载压缩包 ${downloadProgress}%` : "正在准备压缩包…"
                  : "下载压缩包"}
              </span>
            </button>
          ) : null}
          {onUpload ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onUpload(); close(); }}>
              <TreeIcon kind="upload" />
              <span>上传文件</span>
            </button>
          ) : null}
          {onCopyProjectInfo ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onCopyProjectInfo(); close(); }}>
              <TreeIcon kind="copy" />
              <span>复制项目信息</span>
            </button>
          ) : null}
          {onNewFolder ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onNewFolder(); close(); }}>
              <TreeIcon kind="newFolder" />
              <span>新建文件夹</span>
            </button>
          ) : null}
          {!isRoot && onRename ? (
            <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => { onRename(); close(); }}>
              <TreeIcon kind="rename" />
              <span>重命名</span>
            </button>
          ) : null}
          {hasDeleteItem ? <div className="library-folder-menu-sep" role="separator" /> : null}
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
    addToTask: "M9 5H4v14h16V9 M14 4h6v6 M17 4v6 M14 7h6 M8 13h8 M8 17h5",
    copy: ["M8 8h11v11H8z", "M5 16V5h11"],
    info: ["M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16", "M12 11v5", "M12 8h.01"],
    refresh: "M21 12a9 9 0 1 1-3.2-6.9 M21 3v6h-6",
    closeFile: "M6 6l12 12 M18 6 6 18",
    closeOthers: ["M6 6l12 12 M18 6 6 18", "M4 20h16"],
    closeRight: ["M6 6l12 12 M18 6 6 18", "M20 20V10"],
    closeLeft: ["M6 6l12 12 M18 6 6 18", "M4 20V10"],
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

function DocBrowserTabMenu({
  x,
  y,
  index,
  tabCount,
  canAddToConversation,
  onRefresh,
  onDownload,
  onAddToConversation,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseLeft,
  onDismiss,
}: {
  x: number;
  y: number;
  index: number;
  tabCount: number;
  canAddToConversation: boolean;
  onRefresh: () => void;
  onDownload: () => void;
  onAddToConversation: () => void;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseRight: () => void;
  onCloseLeft: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewWidth = window.visualViewport?.width ?? document.documentElement.clientWidth;
    const viewHeight = window.visualViewport?.height ?? document.documentElement.clientHeight;
    const offsetLeft = window.visualViewport?.offsetLeft ?? 0;
    const offsetTop = window.visualViewport?.offsetTop ?? 0;
    let left = x;
    if (x + rect.width > offsetLeft + viewWidth - 8) left = x - rect.width;
    let top = y;
    if (y + rect.height > offsetTop + viewHeight - 8) top = y - rect.height;
    left = Math.min(Math.max(offsetLeft + 8, left), Math.max(offsetLeft + 8, offsetLeft + viewWidth - rect.width - 8));
    top = Math.min(Math.max(offsetTop + 8, top), Math.max(offsetTop + 8, offsetTop + viewHeight - rect.height - 8));
    setBox((previous) => (previous.left === left && previous.top === top ? previous : { left, top }));
  }, [x, y]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);
  const run = (action: () => void) => {
    action();
    onDismiss();
  };
  const hasOthers = tabCount > 1;
  const hasLeft = index > 0;
  const hasRight = index < tabCount - 1;
  return createPortal(
    <div
      ref={ref}
      className="library-folder-menu doc-browser-tab-menu"
      role="menu"
      style={{ left: box.left, top: box.top }}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => run(onRefresh)}>
        <TreeIcon kind="refresh" />
        <span>刷新</span>
      </button>
      <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => run(onDownload)}>
        <TreeIcon kind="download" />
        <span>下载</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="library-folder-menu-item"
        disabled={!canAddToConversation}
        title={canAddToConversation ? undefined : "当前迭代不可添加到对话"}
        onClick={() => {
          if (!canAddToConversation) return;
          run(onAddToConversation);
        }}
      >
        <TreeIcon kind="addToChat" />
        <span>添加到对话</span>
      </button>
      <div className="doc-browser-tab-menu-sep" role="separator" />
      <button type="button" role="menuitem" className="library-folder-menu-item" onClick={() => run(onClose)}>
        <TreeIcon kind="closeFile" />
        <span>关闭文件</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="library-folder-menu-item"
        disabled={!hasOthers}
        onClick={() => {
          if (!hasOthers) return;
          run(onCloseOthers);
        }}
      >
        <TreeIcon kind="closeOthers" />
        <span>关闭其它文件</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="library-folder-menu-item"
        disabled={!hasRight}
        onClick={() => {
          if (!hasRight) return;
          run(onCloseRight);
        }}
      >
        <TreeIcon kind="closeRight" />
        <span>关闭右侧文件</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="library-folder-menu-item"
        disabled={!hasLeft}
        onClick={() => {
          if (!hasLeft) return;
          run(onCloseLeft);
        }}
      >
        <TreeIcon kind="closeLeft" />
        <span>关闭左侧文件</span>
      </button>
    </div>,
    document.body,
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
  icon,
}: {
  name: string;
  expanded: boolean;
  disabled?: boolean;
  onToggle: () => void;
  /** Always shown when idle (collapsed or expanded); hover still shows expand/collapse. */
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tree-toggle tree-folder-toggle${expanded ? " expanded" : ""}${icon ? " has-custom-icon" : ""}`}
      disabled={disabled}
      aria-label={`${expanded ? "折叠" : "展开"} ${name}`}
      onClick={onToggle}
    >
      <span className="folder-toggle-icon icon-idle">
        {icon ?? (expanded ? <OpenFolderIcon /> : <ClosedFolderIcon />)}
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
type DocumentChange = {
  id: string;
  action: string;
  source: string;
  actor_type?: string;
  actor_name?: string | null;
  artifact_title?: string | null;
  version_filename?: string | null;
  folder_name?: string | null;
  details?: Record<string, unknown>;
  created_at: string;
};
type DocumentChangePage = {
  hasMore: boolean;
  total: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  before: string | null;
  beforeId: string | null;
};
type DocumentChangeFilters = { from: string; to: string; fileName: string; action: string; limit: string };

const documentChangeLabels: Record<string, string> = {
  document_uploaded: "上传正式文件", cache_uploaded: "上传对话缓存",
  artifact_published: "发布沙箱产物", document_saved_to_official: "另存为正式文件",
  document_renamed: "重命名文档", document_moved: "移动文档",
  document_deleted: "删除文档", document_restored: "恢复文档",
  version_deleted: "删除版本", version_restored: "恢复版本",
  folder_created: "创建文件夹", folder_renamed: "重命名文件夹",
  folder_moved: "移动文件夹", folder_deleted: "删除文件夹",
  recycle_emptied: "清空回收站",
};
const documentChangeSources: Record<string, string> = { ui: "界面", mcp: "MCP", agent: "Agent", system: "系统" };
const documentChangeActions = Object.entries(documentChangeLabels);

function documentChangePageNumbers(current: number, totalPages: number) {
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, current + 2);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

type DocumentChangeDateRange = { from: string; to: string };

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function dateRangeLabel({ from, to }: DocumentChangeDateRange) {
  if (!from && !to) return "选择日期范围";
  return `${from || "开始日期"} 至 ${to || "结束日期"}`;
}

function DocumentChangeDateRangePicker({ value, onChange }: { value: DocumentChangeDateRange; onChange: (next: DocumentChangeDateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = parseDateKey(value.from) || parseDateKey(value.to) || new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const firstCell = new Date(monthStart);
  firstCell.setDate(1 - monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstCell);
    day.setDate(firstCell.getDate() + index);
    return day;
  });
  const rangeEnd = value.to || (value.from && hovered ? hovered : "");
  const rangeStart = value.from && rangeEnd && rangeEnd < value.from ? rangeEnd : value.from;
  const normalizedEnd = value.from && rangeEnd && rangeEnd < value.from ? value.from : rangeEnd;

  const selectDate = (selected: string) => {
    if (!value.from || value.to) {
      onChange({ from: selected, to: "" });
      setHovered("");
      return;
    }
    onChange(selected < value.from ? { from: selected, to: value.from } : { from: value.from, to: selected });
    setHovered("");
    setOpen(false);
  };

  return <div className="document-change-log-date-range-picker" ref={rootRef}>
    <button type="button" className={`document-change-log-date-range-trigger${open ? " is-open" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span>{dateRangeLabel(value)}</span><UiIcon name="layout" size={14} />
    </button>
    {open ? <div className="document-change-log-date-range-popover" role="dialog" aria-label="选择日期范围">
      <div className="document-change-log-date-range-toolbar"><button type="button" aria-label="上个月" onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button><strong>{`${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`}</strong><button type="button" aria-label="下个月" onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button></div>
      <div className="document-change-log-date-range-weekdays">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="document-change-log-date-range-calendar">{days.map((day) => {
        const key = dateKey(day);
        const inMonth = day.getMonth() === viewMonth.getMonth();
        const inRange = Boolean(rangeStart && normalizedEnd && key >= rangeStart && key <= normalizedEnd);
        const selected = key === value.from || key === value.to;
        return <button key={key} type="button" className={`${inMonth ? "" : "is-outside"}${inRange ? " is-in-range" : ""}${selected ? " is-selected" : ""}`} onMouseEnter={() => value.from && !value.to && setHovered(key)} onClick={() => selectDate(key)}>{day.getDate()}</button>;
      })}</div>
      <div className="document-change-log-date-range-footer"><span>{value.from && !value.to ? "请选择结束日期" : dateRangeLabel(value)}</span>{(value.from || value.to) && <button type="button" onClick={() => { onChange({ from: "", to: "" }); setHovered(""); }}>清空</button>}</div>
    </div> : null}
  </div>;
}

function fileLabel(version: LibraryVersion) {
  return fileDisplayName(version);
}

function TreeOverflowLabel({ text }: { text: string }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  const measure = () => {
    const wrap = wrapRef.current;
    const node = textRef.current;
    if (!wrap || !node) return;
    setDistance(Math.max(0, Math.ceil(node.scrollWidth - wrap.clientWidth)));
  };
  useLayoutEffect(() => {
    measure();
  }, [text]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);
  return (
    <span
      ref={wrapRef}
      className={`tree-overflow${distance > 0 ? " is-overflow" : ""}`}
      style={distance > 0
        ? {
            "--tree-overflow": `${distance}px`,
            "--tree-overflow-ms": `${Math.min(8000, Math.max(1600, distance * 18))}ms`,
          } as CSSProperties
        : undefined}
      onMouseEnter={measure}
    >
      <span ref={textRef} className="tree-overflow-text">{text}</span>
    </span>
  );
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

const ROOT_DISPLAY_ORDER = [...LIBRARY_ROOT_KINDS];
const ROOT_LABELS: Record<(typeof LIBRARY_ROOT_KINDS)[number], string> = {
  project_official: "正式文件",
  project_outputs: "沙箱产物",
  project_cache: "对话缓存",
};
const ROOT_GUIDES: Record<(typeof LIBRARY_ROOT_KINDS)[number], string> = {
  project_official: "项目的正式资料库。成员可以在这里上传、建文件夹、整理和归档确认后的文件；对话缓存和沙箱产物经确认后，也可以另存进来作为正式版本。",
  project_outputs: "小祥在沙箱里生成、修改并发布的成果。对话框附件不会进这里。成员可以预览、下载、确认，或把已确认版本另存为正式文件。",
  project_cache: "对话框或连接器随消息上传的临时资料，按日期放进子文件夹。对小祥只读，改完应另存为沙箱产物；确认后也可以另存为正式文件。",
};

const CODE_LIBRARY_ROOT_ID = "code-library-root";
const CODE_LIBRARY_ROOT_NAME = "连接器";
const CODE_LIBRARY_GUIDE = "连接器是平台能力；勾选的仓库是本项目范围。此处仅展示连接与范围状态，不浏览源码内容。鉴权走平台连接器令牌。L2/L3 在需要时可只读查阅。";

type CodeConnectorState = {
  kind: "github" | "yunxiao";
  enabled: boolean;
  hasToken: boolean;
  tokenHint: string | null;
  organizationId?: string | null;
};

type CodeRemoteState = {
  id: string;
  platform?: "github" | "yunxiao" | null;
  label: string;
  remoteUrl: string;
};

type CodeLibraryConfig = {
  connectors: { github: CodeConnectorState; yunxiao: CodeConnectorState };
  remotes: CodeRemoteState[];
};

type CodeLibraryNode =
  | { type: "connector"; id: string; platform: "github" | "yunxiao"; name: string; lines: string[]; remotes: Array<{ id: string; name: string; lines: string[] }> }
  | { type: "orphan"; id: string; name: string; lines: string[] };

const CODE_PLATFORM_LABELS = { github: "GitHub", yunxiao: "云效 Codeup" } as const;
const CODE_PLATFORM_ICONS = { github: "github", yunxiao: "yunxiao" } as const;

/** Hide Yunxiao organization id prefixes like "60de7a…/group/repo" or "60de7a… / repo". */
function codeRemoteDisplayName(label: string) {
  const value = String(label || "").trim();
  if (!value) return "未命名仓库";
  const orgId = /^[a-f0-9]{16,}$/i;
  const spaced = value.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  if (spaced.length > 1 && orgId.test(spaced[0])) return spaced.slice(1).join(" / ");
  const parts = value.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && orgId.test(parts[0])) return parts.slice(1).join("/");
  return value;
}

function codeLibraryEntries(config: CodeLibraryConfig | null): CodeLibraryNode[] {
  if (!config) return [];
  const entries: CodeLibraryNode[] = [];
  const usedRemoteIds = new Set<string>();
  for (const kind of ["github", "yunxiao"] as const) {
    const item = config.connectors[kind];
    const remotes = config.remotes.filter((remote) => remote.platform === kind);
    if (!item?.enabled && !item?.hasToken && !remotes.length) continue;
    for (const remote of remotes) usedRemoteIds.add(remote.id);
    const lines = [
      item?.enabled ? "能力：已启用" : item?.hasToken ? "能力：已保存令牌，未启用" : "能力：未配置",
      item?.hasToken ? `令牌：已配置${item.tokenHint ? `（${item.tokenHint}）` : ""}` : "令牌：未配置",
      remotes.length ? `范围：已勾选 ${remotes.length} 个仓库` : "范围：尚未勾选仓库",
    ];
    if (kind === "yunxiao") {
      lines.push(item?.organizationId ? `组织 ID：${item.organizationId}` : "组织 ID：未配置");
    }
    entries.push({
      type: "connector",
      id: `code-connector-${kind}`,
      platform: kind,
      name: CODE_PLATFORM_LABELS[kind],
      lines,
      remotes: remotes.map((remote) => ({
        id: `code-remote-${remote.id}`,
        name: codeRemoteDisplayName(remote.label),
        lines: [`地址：${remote.remoteUrl}`, "范围仓库 · 鉴权走平台连接器"],
      })),
    });
  }
  for (const remote of config.remotes) {
    if (usedRemoteIds.has(remote.id)) continue;
    entries.push({
      type: "orphan",
      id: `code-remote-${remote.id}`,
      name: codeRemoteDisplayName(remote.label),
      lines: [`地址：${remote.remoteUrl}`, "范围仓库"],
    });
  }
  return entries;
}

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

const DOCUMENT_TREE_STATE_KEY = "cothread-document-tree-open";
const DOCUMENT_TREE_WIDTH_KEY = "cothread-document-tree-width";
const TREE_WIDTH_DEFAULT = 240;
const TREE_WIDTH_MIN = 220;
const TREE_WIDTH_MAX = 560;

function readStoredBoolean(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function readStoredTreeWidth() {
  try {
    const value = Number(localStorage.getItem(DOCUMENT_TREE_WIDTH_KEY));
    if (!Number.isFinite(value)) return TREE_WIDTH_DEFAULT;
    return Math.min(Math.max(Math.round(value), TREE_WIDTH_MIN), TREE_WIDTH_MAX);
  } catch {
    return TREE_WIDTH_DEFAULT;
  }
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
  onReferenceFolder,
  onAddToTask,
  onAddFolderToTask,
  organizationJobs = [],
  codeSourcesTick = 0,
}: {
  onReview?: (versionId: string, decision: string, comment?: string) => Promise<void>;
  projectId: string;
  projectName?: string;
  mcpEndpoint?: string;
  threadId?: string;
  writable: boolean;
  iterationWritable?: boolean;
  folders: LibraryFolder[];
  onRefresh: () => Promise<void>;
  versions: LibraryVersion[];
  selected: string;
  onSelect: (id: string) => void;
  onReference?: (id: string) => void;
  onReferenceFolder?: (id: string) => void;
  onAddToTask?: (id: string) => void;
  onAddFolderToTask?: (id: string) => void;
  organizationJobs?: { thread_id?: string | null; scope: "iteration" | "project"; status: string; error?: string | null }[];
  codeSourcesTick?: number;
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
  const codeEntries = codeLibraryEntries(codeConfig);
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
  const [pendingLabel, setPendingLabel] = useState("正在更新文档树…");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
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
      showTip("无法自动复制项目信息，请检查剪贴板权限后重试。", "error");
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
      showTip(detail, "error");
    } finally {
      setPending(false);
      setUploadProgress(null);
      setPendingLabel("正在更新文档树…");
    }
  };
  const [filter, setFilter] = useState("");
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
  const [error, setError] = useState("");
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [previewReload, setPreviewReload] = useState(0);
  const [treeOpen, setTreeOpen] = useState(() => readStoredBoolean(DOCUMENT_TREE_STATE_KEY, false));
  const [treeWidth, setTreeWidth] = useState(readStoredTreeWidth);
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
  const setPreviewMode = (mode: "preview" | "text") => {
    if (!selected) return;
    setPreviewModeByVersion((previous) => ({ ...previous, [selected]: mode }));
  };
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
  const closeOtherTabs = (id: string) => {
    setOpenTabs([id]);
    if (selected !== id) onSelect(id);
  };
  const closeTabsDirection = (id: string, side: "left" | "right") => {
    setOpenTabs((previous) => {
      const index = previous.indexOf(id);
      if (index < 0) return previous;
      const next = side === "left" ? previous.slice(index) : previous.slice(0, index + 1);
      if (!next.includes(selected)) onSelect(id);
      return next;
    });
  };
  const openTabContextMenu = (event: ReactMouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenFileMenuId(null);
    setOpenFolderMenuId(null);
    setTabMenu({ id, x: event.clientX, y: event.clientY });
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
    setImagePreview(null);
    if (!selected) return;
    let alive = true;
    let objectUrl = "";
    const load = async () => {
      const metadataResponse = await apiFetch(`/api/versions/${selected}?metadata=1`);
      const metadata = await readJsonResponse(metadataResponse, `/api/versions/${selected}?metadata=1`);
      const name = String(metadata.filename || "").toLowerCase();
      if (!alive) return;
      if (name.endsWith(".pdf")) {
        const response = await apiFetch(`/api/versions/${selected}/preview-data`);
        const value = await readJsonResponse(response, `/api/versions/${selected}/preview-data`);
        const bytes = Uint8Array.from(atob(value.contentBase64), (c) => c.charCodeAt(0));
        setView({ kind: "pdf", bytes, mime: "application/pdf" });
        return;
      }
      if (name.endsWith(".html") || name.endsWith(".htm")) {
        setView({
          kind: "html",
          mime: String(metadata.mime || "text/html"),
          byteSize: Number(metadata.byte_size) || 0,
        });
        return;
      }
      const imageMime: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
      };
      const extension = name.split(".").pop() || "";
      const mime = String(metadata.mime || "");
      if (
        imageMime[extension]
        || name.endsWith(".docx")
        || name.endsWith(".xlsx")
        || name.endsWith(".csv")
        || name.endsWith(".pptx")
      ) {
        const response = await apiFetch(`/api/versions/${selected}`);
        const v = await readJsonResponse(response, `/api/versions/${selected}`);
        if (!alive) return;
        const bytes = Uint8Array.from(atob(v.contentBase64), (c) => c.charCodeAt(0));
        if (imageMime[extension]) {
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: imageMime[extension] }));
          setView({ kind: "image", url: objectUrl, mime: imageMime[extension] });
        } else if (name.endsWith(".docx")) setView({ kind: "docx", bytes, mime: v.mime });
        else if (name.endsWith(".xlsx") || name.endsWith(".csv")) setView({ kind: "xlsx", bytes, mime: v.mime });
        else setView({ kind: "pptx", bytes, mime: v.mime });
        return;
      }
      if (mime.startsWith("text/") || TEXT_PREVIEW_NAME.test(name)) {
        const loaded = await readVersionText(selected, Number(metadata.byte_size) || 0);
        if (!alive) return;
        setView({
          kind: name.endsWith(".md") || name.endsWith(".markdown") ? "markdown" : "text",
          text: loaded.text,
          mime: mime || "text/plain",
          truncated: loaded.truncated,
          byteSize: loaded.byteSize,
        });
        return;
      }
      setView({ kind: "download", mime: mime || "application/octet-stream" });
    };
    load().catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selected, previewReload]);
  useEffect(() => {
    if (!selected || view?.kind !== "html" || previewMode !== "text" || view.text != null) return;
    let alive = true;
    const loadSource = async () => {
      const loaded = await readVersionText(selected, view.byteSize || 0);
      if (alive) {
        setView((previous) => (previous?.kind === "html"
          ? { ...previous, text: loaded.text, truncated: loaded.truncated, byteSize: loaded.byteSize }
          : previous));
      }
    };
    loadSource().catch((cause) => {
      if (alive) setError(cause instanceof Error ? cause.message : "源码读取失败");
    });
    return () => { alive = false; };
  }, [selected, previewMode, view?.kind, view?.text]);
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
  const downloadFolder = async (folder: LibraryFolder) => {
    if (downloadingFolderId) return;
    setDownloadingFolderId(folder.id);
    setDownloadProgress(0);
    setActionError("");
    try {
      const response = await apiFetch(`/api/projects/${projectId}/folders/${folder.id}/download`);
      if (!response.ok) {
        const body = await readJsonResponse(response, "文件夹压缩包下载").catch(() => null);
        throw new Error(body?.error || `下载失败（${response.status}）`);
      }
      if (!response.body) throw new Error("下载失败：浏览器不支持读取下载进度");
      const total = Number(response.headers.get("Content-Length")) || 0;
      const reader = response.body.getReader();
      const chunks: ArrayBuffer[] = [];
      let received = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        if (!part.value) continue;
        const chunk = part.value.slice();
        chunks.push(chunk.buffer as ArrayBuffer);
        received += part.value.length;
        if (total) setDownloadProgress(Math.min(99, Math.round(received / total * 100)));
      }
      const blob = new Blob(chunks, { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${folder.name || "文件夹"}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDownloadProgress(100);
      showTip("压缩包已开始下载");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "压缩包下载失败";
      setActionError(detail);
      showTip(detail, "error");
    } finally {
      window.setTimeout(() => {
        setDownloadingFolderId(null);
        setDownloadProgress(null);
      }, 400);
    }
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
      onContextMenu={(event) => {
        if (trash || pending) return;
        event.preventDefault();
        event.stopPropagation();
        setOpenFileMenuId(v.artifact_id);
        setOpenFolderMenuId(null);
        setTabMenu(null);
      }}
    >
      <TreeDepth depth={depth} />
      <button
        className="tree-name"
        data-tooltip="false"
        aria-label={fileLabel(v)}
        disabled={organizing && folderRootKind(v.folder_id, libraryFolders) === "project_official"}
        onClick={() => {
          onSelect(v.id);
          setFolderId(v.folder_id || null);
        }}
      >
        <span className="tree-file-indent" />
        <LibraryFileIcon
          fileName={v.filename}
          versionId={v.id}
          className="tree-icon file-type-icon"
          width={16}
          height={16}
        />
        <span className="tree-file-copy">
          <TreeOverflowLabel text={fileLabel(v)} />
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
            if (id) {
              setOpenFolderMenuId(null);
              setTabMenu(null);
            }
          }}
          disabled={pending}
          canRename={canManageFile(v)}
          canDelete={canManageFile(v)}
          canSaveToOfficial={showSaveToOfficial(v)}
          saveToOfficialDisabled={!canSaveToOfficial(v)}
          saveToOfficialTitle={saveToOfficialHint(v)}
          onAddToConversation={onReference ? () => onReference(v.id) : undefined}
          onAddToTask={onAddToTask && fileAreaKind(v) === "project_official" && !v.deleted_at
            ? () => onAddToTask(v.id) : undefined}
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
              onContextMenu={(event) => {
                const canManage = canManageOfficialFolders
                  && folderRootKind(f.id, libraryFolders) === "project_official"
                  && !f.system_key
                  && f.folder_kind !== "project_official";
                const hasMenu = canManage
                  || subtreeStats(f.id).fileCount > 0
                  || Boolean(onAddFolderToTask && folderRootKind(f.id, libraryFolders) === "project_official");
                if (!hasMenu || pending) return;
                event.preventDefault();
                event.stopPropagation();
                setOpenFolderMenuId(f.id);
                setOpenFileMenuId(null);
                setTabMenu(null);
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
                data-tooltip="false"
                aria-label={f.name}
                disabled={organizing && folderRootKind(f.id, libraryFolders) === "project_official"}
                onClick={() => toggleFolder(f.id)}
              >
                <TreeOverflowLabel text={f.name} />
              </button>
              {((canManageOfficialFolders
                && folderRootKind(f.id, libraryFolders) === "project_official"
                && !f.system_key
                && f.folder_kind !== "project_official")
                || subtreeStats(f.id).fileCount > 0
                || (onAddFolderToTask && folderRootKind(f.id, libraryFolders) === "project_official")) ? (
                <span className="tree-row-actions">
                <OfficialFolderMenu
                  menuId={f.id}
                  openMenuId={openFolderMenuId}
                  onOpenMenuChange={(id) => {
                    setOpenFolderMenuId(id);
                    if (id) {
                      setOpenFileMenuId(null);
                      setTabMenu(null);
                    }
                  }}
                  disabled={pending}
                  onAddToConversation={onReferenceFolder && subtreeStats(f.id).fileCount > 0
                    ? () => onReferenceFolder(f.id) : undefined}
                  onAddToTask={onAddFolderToTask && folderRootKind(f.id, libraryFolders) === "project_official"
                    ? () => onAddFolderToTask(f.id) : undefined}
                  onDownload={() => downloadFolder(f)}
                  canDownload={subtreeStats(f.id).fileCount > 0}
                  downloadProgress={downloadingFolderId === f.id ? downloadProgress : null}
                  onUpload={canManageOfficialFolders && folderRootKind(f.id, libraryFolders) === "project_official" && !f.system_key
                    ? () => {
                      selectFolder(f.id);
                      uploadInputRef.current?.click();
                    } : undefined}
                  onNewFolder={canManageOfficialFolders && folderRootKind(f.id, libraryFolders) === "project_official" && !f.system_key
                    ? () => openNewFolder(f.id) : undefined}
                  onRename={canManageOfficialFolders && folderRootKind(f.id, libraryFolders) === "project_official" && !f.system_key
                    ? () => openRenameFolder(f) : undefined}
                  onDelete={canManageOfficialFolders && folderRootKind(f.id, libraryFolders) === "project_official" && !f.system_key
                    ? () => deleteFolder(f) : undefined}
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
        onContextMenu={(event) => {
          if (pending) return;
          event.preventDefault();
          event.stopPropagation();
          setOpenFolderMenuId(root.id);
          setOpenFileMenuId(null);
          setTabMenu(null);
        }}
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
          data-tooltip="false"
          aria-label={ROOT_LABELS[root.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number]] || root.name}
          disabled={root.folder_kind === "project_official" && organizing}
          onClick={() => toggleFolder(root.id)}
        >
          <TreeOverflowLabel text={ROOT_LABELS[root.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number]] || root.name} />
        </button>
        <span className="tree-root-actions tree-row-actions">
            {root.folder_kind === "project_official" && writable ? (
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
            <OfficialFolderMenu
                menuId={root.id}
                openMenuId={openFolderMenuId}
                onOpenMenuChange={(id) => {
                  setOpenFolderMenuId(id);
                  if (id) {
                    setOpenFileMenuId(null);
                    setTabMenu(null);
                  }
                }}
                disabled={pending}
                isRoot
                onExplain={() => {
                  const kind = root.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number];
                  if (kind in ROOT_GUIDES) setFolderGuideKind(kind);
                }}
                onAddToConversation={onReferenceFolder && subtreeStats(root.id).fileCount > 0
                  ? () => onReferenceFolder(root.id) : undefined}
                onAddToTask={onAddFolderToTask && root.folder_kind === "project_official"
                  ? () => onAddFolderToTask(root.id) : undefined}
                onDownload={subtreeStats(root.id).fileCount > 0 ? () => downloadFolder(root) : undefined}
                canDownload={subtreeStats(root.id).fileCount > 0}
                downloadProgress={downloadingFolderId === root.id ? downloadProgress : null}
                onUpload={root.folder_kind === "project_official" && canManageOfficialFolders ? () => {
                  selectFolder(root.id);
                  uploadInputRef.current?.click();
                } : undefined}
                onNewFolder={root.folder_kind === "project_official" && canManageOfficialFolders
                  ? () => openNewFolder(root.id) : undefined}
                onCopyProjectInfo={root.folder_kind === "project_official" ? () => void copyProjectInfo() : undefined}
              />
          </span>
      </div>
      {!collapsed.has(root.id) ? <div role="group">{tree(root.id, 1)}</div> : null}
    </div>
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
  const renderCodeLibraryRoot = () => (
    <div key={CODE_LIBRARY_ROOT_ID} role="treeitem" aria-expanded={!collapsed.has(CODE_LIBRARY_ROOT_ID)}>
      <div
        className="tree-folder tree-library-root tree-code-library-root"
        onContextMenu={(event) => openCodeFolderMenu(event, CODE_LIBRARY_ROOT_ID)}
      >
        <FolderToggle
          name={CODE_LIBRARY_ROOT_NAME}
          expanded={!collapsed.has(CODE_LIBRARY_ROOT_ID)}
          onToggle={() => toggleFolder(CODE_LIBRARY_ROOT_ID)}
        />
        <button
          type="button"
          className="tree-name"
          data-tooltip="false"
          aria-label={CODE_LIBRARY_ROOT_NAME}
          onClick={() => toggleFolder(CODE_LIBRARY_ROOT_ID)}
        >
          <TreeOverflowLabel text={CODE_LIBRARY_ROOT_NAME} />
        </button>
        <span className="tree-root-actions tree-row-actions">
          <OfficialFolderMenu
            {...codeFolderMenuProps(CODE_LIBRARY_ROOT_ID)}
            onExplain={() => setCodeGuideId(CODE_LIBRARY_ROOT_ID)}
          />
        </span>
      </div>
      {!collapsed.has(CODE_LIBRARY_ROOT_ID) ? (
        <div role="group">
          {codeEntries.map((entry) => (
            entry.type === "orphan" ? (
              <div key={entry.id} role="treeitem">
                <div
                  className="tree-folder tree-code-source-folder tree-code-leaf"
                  onContextMenu={(event) => openCodeFolderMenu(event, entry.id)}
                >
                  <TreeDepth depth={1} />
                  <span className="tree-code-leaf-icon" aria-hidden="true">
                    <ClosedFolderIcon />
                  </span>
                  <button
                    type="button"
                    className="tree-name"
                    data-tooltip="false"
                    aria-label={entry.name}
                    onClick={() => setCodeGuideId(entry.id)}
                  >
                    <TreeOverflowLabel text={entry.name} />
                  </button>
                  <span className="tree-root-actions tree-row-actions">
                    <OfficialFolderMenu
                      {...codeFolderMenuProps(entry.id)}
                      onExplain={() => setCodeGuideId(entry.id)}
                    />
                  </span>
                </div>
              </div>
            ) : (
            <div key={entry.id} role="treeitem" aria-expanded={!collapsed.has(entry.id)}>
              <div
                className="tree-folder tree-code-source-folder"
                onContextMenu={(event) => openCodeFolderMenu(event, entry.id)}
              >
                <TreeDepth depth={1} />
                <FolderToggle
                  name={entry.name}
                  expanded={!collapsed.has(entry.id)}
                  onToggle={() => toggleFolder(entry.id)}
                  icon={<UiIcon name={CODE_PLATFORM_ICONS[entry.platform]} size={16} />}
                />
                <button
                  type="button"
                  className="tree-name"
                  data-tooltip="false"
                  aria-label={entry.name}
                  onClick={() => toggleFolder(entry.id)}
                >
                  <TreeOverflowLabel text={entry.name} />
                </button>
                <span className="tree-root-actions tree-row-actions">
                  <OfficialFolderMenu
                    {...codeFolderMenuProps(entry.id)}
                    onExplain={() => setCodeGuideId(entry.id)}
                  />
                </span>
              </div>
              {!collapsed.has(entry.id) ? (
                <div role="group" className="tree-code-source-notes">
                  {entry.remotes.map((remote) => (
                    <div key={remote.id} role="treeitem">
                      <div
                        className="tree-folder tree-code-source-folder tree-code-leaf"
                        onContextMenu={(event) => openCodeFolderMenu(event, remote.id)}
                      >
                        <TreeDepth depth={2} />
                        <span className="tree-code-leaf-icon" aria-hidden="true">
                          <ClosedFolderIcon />
                        </span>
                        <button
                          type="button"
                          className="tree-name"
                          data-tooltip="false"
                          aria-label={remote.name}
                          onClick={() => setCodeGuideId(remote.id)}
                        >
                          <TreeOverflowLabel text={remote.name} />
                        </button>
                        <span className="tree-root-actions tree-row-actions">
                          <OfficialFolderMenu
                            {...codeFolderMenuProps(remote.id)}
                            onExplain={() => setCodeGuideId(remote.id)}
                          />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            )
          ))}
        </div>
      ) : null}
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
    <aside
      className="file-explorer doc-browser-tree"
      style={{ "--doc-tree-width": `${treeWidth}px` } as CSSProperties}
    >
            <div
              className="doc-browser-tree-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label="拖拽调整文件树宽度"
              title="拖拽调整宽度"
              aria-valuemin={TREE_WIDTH_MIN}
              aria-valuemax={TREE_WIDTH_MAX}
              aria-valuenow={treeWidth}
              onPointerDown={startTreeResize}
            />
            <div className="file-explorer-top">
              <div className="tree-filter-bar">
                <input
                  ref={fileSearchRef}
                  type="search"
                  name="cothread-document-tree-filter"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  aria-label="搜索文档"
                  placeholder="搜索文档…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  onKeyDown={(event) => {
                    // Keep browser/app-level find shortcuts from taking over the file tree search.
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
                      event.preventDefault();
                      event.nativeEvent.stopImmediatePropagation();
                      event.currentTarget.select();
                    }
                    event.stopPropagation();
                  }}
                  onKeyUp={(event) => event.stopPropagation()}
                  onKeyPress={(event) => event.stopPropagation()}
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
            <div role="tree" aria-label="项目文档库">
              {organizing ? <p className="muted">项目级Agent（L1）正在整理正式文件，正式文件区暂时不可操作。</p> : null}
              {trash || filter
                ? artifacts.map((v) => fileRow(v, 0))
                : (
                  <>
                    {libraryRoots.map((root) => renderLibraryRoot(root))}
                    {renderCodeLibraryRoot()}
                  </>
                )}
            </div>
            {trash && !artifacts.length ? (
              <p className="muted">回收站是空的。</p>
            ) : null}
            {!artifacts.length && !libraryFolders.length && !trash && (
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
              {trash && writable ? (
                <button
                  type="button"
                  className="library-trash-empty"
                  title="永久清空回收站"
                  aria-label="清空回收站"
                  disabled={pending || !libraryVersions.some((item) => item.deleted_at)}
                  onClick={() => setDeleteConfirm({ type: "empty-recycle" })}
                >
                  <TreeIcon kind="trash" />
                  <span>清空回收站</span>
                </button>
              ) : null}
            </footer>
            {pending ? (
              <div className="tree-loading" role="status" aria-live="polite">
                <span className="tree-loading-spinner" aria-hidden="true" />
                <span>
                  {pendingLabel}
                  {uploadProgress != null ? ` ${uploadProgress}%` : ""}
                </span>
              </div>
            ) : null}
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
  const browserFileBreadcrumb = version ? (
    <nav className="doc-browser-preview-header" aria-label="文档路径">
      <span className="doc-browser-preview-path">{documentSourceLabel(version, libraryFolders)}</span>
      <span className="doc-browser-preview-separator" aria-hidden="true">/</span>
      <strong className="doc-browser-preview-name" title={version.filename}>{fileLabel(version)}</strong>
    </nav>
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
  const loadFullText = () => {
    if (!selected) return;
    setView((previous) => (previous ? { ...previous, nativeSource: true, truncated: false } : previous));
  };
  const nativeSourceFrame = view?.nativeSource && selected ? (
    <iframe
      className="doc-file-source-frame"
      title={version?.filename ?? "源码"}
      src={`/api/versions/${selected}/source`}
      sandbox=""
      referrerPolicy="no-referrer"
    />
  ) : null;
  const truncatedNotice = view?.nativeSource ? (
    <p className="muted doc-source-truncated">
      完整源码以纯文本打开（不加高亮），避免把大文件塞进页面导致卡顿。
      <button
        type="button"
        onClick={() => setView((previous) => (previous
          ? { ...previous, nativeSource: false, truncated: (previous.byteSize || 0) > TEXT_PREVIEW_LIMIT }
          : previous))}
      >
        返回开头预览
      </button>
    </p>
  ) : view?.truncated ? (
    <p className="muted doc-source-truncated">
      文件 {formatFileSize(view.byteSize || 0)}，源码视图先显示开头 {formatFileSize(TEXT_PREVIEW_LIMIT)}。
      HTML 预览仍会加载完整 JS/CSS。
      <button type="button" onClick={loadFullText}>
        加载全部源码
      </button>
    </p>
  ) : null;
  const previewContent = (
    <>
      {view?.kind === "markdown" && previewMode === "preview" && (
        view.nativeSource ? (
          <>
            {truncatedNotice}
            {nativeSourceFrame}
          </>
        ) : (
          <div className="markdown-preview">
            {truncatedNotice}
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                img: ({ src, alt }) => {
                  const path = resolvePreviewAssetPath(src || "");
                  const assetSrc = selected && path
                    ? `/api/versions/${selected}/preview/${encodeURI(path)}`
                    : src;
                  return assetSrc ? <img src={assetSrc} alt={alt || ""} loading="lazy" /> : null;
                },
                code: ({ className, children, ...props }) => {
                  const language = className?.match(/language-([\w-]+)/)?.[1]?.toLowerCase();
                  if (language === "mermaid") {
                    const chart = String(children).replace(/\n$/, "");
                    return <MermaidPreview key={chart} chart={chart} />;
                  }
                  return className ? (
                    <pre className="markdown-code-block"><code className={className} {...props}>{children}</code></pre>
                  ) : (
                    <code className="markdown-inline-code" {...props}>{children}</code>
                  );
                },
              }}
            >
              {view.text}
            </Markdown>
          </div>
        )
      )}
      {view?.kind === "markdown" && previewMode === "text" && (
        <>
          {truncatedNotice}
          {view.nativeSource
            ? nativeSourceFrame
            : (
              <CodePreview
                text={view.text || ""}
                filename={version?.filename}
              />
            )}
        </>
      )}
      {view?.kind === "html" && previewMode === "preview" && selected && (
        <HtmlPreviewFrame
          key={`${selected}-preview-${previewReload}`}
          versionId={selected}
          filename={version?.filename ?? "HTML"}
        />
      )}
      {view?.kind === "html" && previewMode === "text" && (
        view.nativeSource ? (
          <>
            {truncatedNotice}
            {nativeSourceFrame}
          </>
        ) : view.text == null
          ? <p className="muted doc-browser-loading">正在读取源码…</p>
          : (
            <>
              {truncatedNotice}
              <CodePreview
                text={view.text.length > 80_000 ? view.text : formatHtmlSource(view.text)}
                filename={version?.filename}
              />
            </>
          )
      )}
      {view?.kind === "text" && (
        <>
          {truncatedNotice}
          {view.nativeSource
            ? nativeSourceFrame
            : <CodePreview text={view.text || ""} filename={version?.filename} />}
        </>
      )}
      {view?.kind === "docx" && view.bytes && <DocxPreview bytes={view.bytes} />}
      {view?.kind === "xlsx" && view.bytes && <XlsxPreview bytes={view.bytes} filename={version?.filename} />}
      {view?.kind === "pptx" && view.bytes && <PptxPreview bytes={view.bytes} />}
      {view?.kind === "image" && version && (
        <button
          type="button"
          className="doc-image-open"
          title="打开预览"
          onClick={() => setImagePreview({
            id: version.id,
            title: fileLabel(version),
            filename: version.filename,
            src: view.url,
          })}
        >
          <img src={view.url} alt={version.filename} />
        </button>
      )}{" "}
      {view?.kind === "pdf" && version && view.bytes && (
        <PdfPreview
          bytes={view.bytes}
          filename={version.filename}
        />
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
                }, "文件夹已创建");
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
                }, "文件夹已重命名");
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
                }, "文档已重命名");
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
                }, "已另存至正式文件");
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
                    {browserFileBreadcrumb}
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
                <div className="library-empty">
                  <p>从文件树选择文档。</p>
                  <button
                    type="button"
                    className="doc-browser-open-tree"
                    onClick={() => setTreeOpen(true)}
                  >
                    <TreeIcon kind="folder" />
                    打开文件树
                  </button>
                </div>
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
  const folderGuideDialog = folderGuideKind ? (
          <ModalBackdrop className="library-organize-backdrop" onClose={() => setFolderGuideKind(null)}>
            {(close) => <section
              className="library-organize-dialog folder-guide-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="folder-guide-title"
            >
              <header>
                <h3 id="folder-guide-title">{ROOT_LABELS[folderGuideKind]} · 文件夹说明</h3>
                <DialogClose onClick={close} label="关闭文件夹说明" />
              </header>
              <p>{ROOT_GUIDES[folderGuideKind]}</p>
              <div className="library-organize-actions">
                <button type="button" className="primary" onClick={close}>知道了</button>
              </div>
            </section>}
          </ModalBackdrop>
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
          <ModalBackdrop className="library-organize-backdrop" onClose={() => setCodeGuideId(null)}>
            {(close) => <section
              className="library-organize-dialog folder-guide-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="code-guide-title"
            >
              <header>
                <h3 id="code-guide-title">{codeGuideTarget.title} · 文件夹说明</h3>
                <DialogClose onClick={close} label="关闭文件夹说明" />
              </header>
              {codeGuideTarget.lines ? (
                <ul className="folder-guide-lines">
                  {codeGuideTarget.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p>{codeGuideTarget.body}</p>
              )}
              <div className="library-organize-actions">
                <button type="button" className="primary" onClick={close}>知道了</button>
              </div>
            </section>}
          </ModalBackdrop>
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
                <button type="button" className={deleteConfirm.type === "empty-recycle" ? "danger" : "primary"} onClick={confirmDelete} disabled={deleteConfirm.type === "empty-recycle" && !libraryVersions.some((item) => item.deleted_at)}>
                  <UiIcon name="trash" size={13} />{deleteConfirmCopy.confirm}
                </button>
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
              <p>按条填写要对「{changeRequest.title}」修改什么。确认后会自动发到当前迭代群聊并 @ 对方：沙箱产物会 @小祥；对话缓存若来自别人则 @来源人，本人上传的对话缓存则 @小祥。被 @ 的人请让小祥改并保存为沙箱产物，或自己改完后在对话框重新上传新的对话缓存。</p>
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
  const visibleChangePages = documentChangePageNumbers(changePage.currentPage, changePage.totalPages);
  const goToChangePage = (target: number) => {
    const next = Math.min(Math.max(Math.trunc(target) || 1, 1), changePage.totalPages);
    if (next === changePageNumber) return;
    setChangePageInput(String(next));
    setChangePageNumber(next);
    setChangePage((current) => ({ ...current, currentPage: next, hasMore: next < current.totalPages }));
  };
  return (
    <div className="library-embedded doc-browser">
      <section className="library doc-browser-shell" aria-label="项目文档库">
        {uploadInput}
        <div
          className="doc-browser-tabbar"
          onContextMenu={(event) => {
            if (!openTabs.length) return;
            if ((event.target as HTMLElement).closest(".doc-browser-tab")) return;
            const id = selected && openTabs.includes(selected) ? selected : openTabs[openTabs.length - 1];
            openTabContextMenu(event, id);
          }}
        >
          <div className="doc-browser-tabs" role="tablist" aria-label="打开的文档">
            {openTabs.map((id) => {
              const item = tabVersion(id);
              return (
                <span
                  key={id}
                  className={`doc-browser-tab${selected === id ? " active" : ""}`}
                  role="presentation"
                  onContextMenu={(event) => openTabContextMenu(event, id)}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected === id}
                    className="doc-browser-tab-open"
                    title={item ? fileLabel(item) : "文档"}
                    onClick={() => onSelect(id)}
                  >
                    {item ? (
                      <LibraryFileIcon
                        fileName={item.filename}
                        versionId={item.id}
                        className="tree-icon file-type-icon"
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
          {tabMenu && openTabs.includes(tabMenu.id) ? (
            <DocBrowserTabMenu
              x={tabMenu.x}
              y={tabMenu.y}
              index={openTabs.indexOf(tabMenu.id)}
              tabCount={openTabs.length}
              canAddToConversation={Boolean(onReference)}
              onRefresh={() => {
                if (tabMenu.id !== selected) onSelect(tabMenu.id);
                setPreviewReload((value) => value + 1);
                void onRefresh();
              }}
              onDownload={() => {
                window.open(`/api/versions/${tabMenu.id}/download`, "_blank", "noopener,noreferrer");
              }}
              onAddToConversation={() => onReference?.(tabMenu.id)}
              onClose={() => closeTab(tabMenu.id)}
              onCloseOthers={() => closeOtherTabs(tabMenu.id)}
              onCloseRight={() => closeTabsDirection(tabMenu.id, "right")}
              onCloseLeft={() => closeTabsDirection(tabMenu.id, "left")}
              onDismiss={() => setTabMenu(null)}
            />
          ) : null}
          <button type="button" className="doc-browser-tree-toggle" title="文档操作日志" aria-label="查看文档操作日志" onClick={() => { setChangePageNumber(1); setChangePageInput("1"); setChangesOpen(true); }}>
            <UiIcon name="history" size={15} />
          </button>
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
        {folderGuideDialog}
        {codeGuideDialog}
        {deleteConfirmDialog}
        {changeRequestDialog}
        {changesOpen ? (
          <ModalBackdrop className="library-organize-backdrop" onClose={() => setChangesOpen(false)}>
            {(close) => <section className="library-organize-dialog document-change-log-dialog" role="dialog" aria-modal="true" aria-labelledby="document-change-log-title">
              <header className="library-organize-header"><div><span>项目文档库</span><h3 id="document-change-log-title">文档操作日志</h3></div><DialogClose onClick={close} label="关闭文档操作日志" /></header>
              <form
                className="document-change-log-filters"
                onSubmit={(event) => {
                  event.preventDefault();
                  setChangePageNumber(1);
                  setChangePageInput("1");
                  setChangeFilters({ ...changeFilterDraft, fileName: changeFilterDraft.fileName.trim() });
                }}
              >
                <label><span>操作类型</span><select value={changeFilterDraft.action} onChange={(event) => setChangeFilterDraft((current) => ({ ...current, action: event.target.value }))}><option value="">全部操作</option>{documentChangeActions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="document-change-log-date-range"><span>日期范围</span><DocumentChangeDateRangePicker value={changeFilterDraft} onChange={(range) => setChangeFilterDraft((current) => ({ ...current, ...range }))} /></label>
                <label className="document-change-log-file-filter"><span>文件名</span><input type="search" value={changeFilterDraft.fileName} placeholder="搜索文档标题或文件名" onChange={(event) => setChangeFilterDraft((current) => ({ ...current, fileName: event.target.value }))} /></label>
                <div className="document-change-log-filter-actions"><button type="submit">应用筛选</button><button type="button" className="secondary" onClick={() => { const empty = { from: "", to: "", fileName: "", action: "", limit: "20" }; setChangeFilterDraft(empty); setChangeFilters(empty); setChangePageNumber(1); setChangePageInput("1"); }}>重置</button></div>
              </form>
              <div className="document-change-log-list">
                <div className="document-change-log-list-head" aria-hidden="true"><span>操作</span><span>文档 / 文件夹</span><span>操作人 / 来源</span><span>时间</span></div>
                <div className={`document-change-log-rows${changesLoading && changes.length && !changesError ? " is-refreshing" : ""}`} aria-busy={changesLoading}>
                  {changesError ? <p className="error document-change-log-state" role="alert">{changesError}</p> : changes.length ? changes.map((item) => <article className="document-change-log-item" key={item.id}>
                    <strong>{documentChangeLabels[item.action] || item.action}</strong>
                    <span className="document-change-log-target">{item.artifact_title || item.version_filename || item.folder_name || String(item.details?.title || item.details?.filename || item.details?.affectedFolderName || "文档库")}</span>
                    <span className="document-change-log-actor">{item.actor_name || (item.actor_type === "agent" ? "Agent" : "系统")} · {documentChangeSources[item.source] || item.source}</span>
                    <time>{new Date(item.created_at).toLocaleString("zh-CN")}</time>
                  </article>) : <p className="muted document-change-log-state">{changesLoading ? "正在读取操作日志…" : "暂无文档操作记录。"}</p>}
                </div>
              </div>
              <footer className="document-change-log-pagination">
                <small>共 {changePage.total} 条 · 第 {changePage.currentPage} / {changePage.totalPages} 页</small>
                <div>
                  <label className="document-change-log-page-size"><span>每页</span><select value={changeFilters.limit} onChange={(event) => { const limit = event.target.value; setChangeFilterDraft((current) => ({ ...current, limit })); setChangeFilters((current) => ({ ...current, limit })); setChangePageNumber(1); setChangePageInput("1"); setChangePage((current) => ({ ...current, currentPage: 1 })); }}><option value="20">20 条</option><option value="50">50 条</option><option value="100">100 条</option></select></label>
                  <button type="button" disabled={changePage.currentPage <= 1} onClick={() => goToChangePage(changePage.currentPage - 1)}>上一页</button>
                  {visibleChangePages.map((page) => <button key={page} type="button" className={page === changePage.currentPage ? "active" : ""} aria-current={page === changePage.currentPage ? "page" : undefined} disabled={page === changePage.currentPage} onClick={() => goToChangePage(page)}>{page}</button>)}
                  <label className="document-change-log-page-jump"><span>跳至</span><input type="number" min="1" max={changePage.totalPages} value={changePageInput} onChange={(event) => setChangePageInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); goToChangePage(Number(changePageInput)); } }} /></label>
                  <button type="button" onClick={() => goToChangePage(Number(changePageInput))}>跳转</button>
                  <button type="button" disabled={changePage.currentPage >= changePage.totalPages} onClick={() => goToChangePage(changePage.currentPage + 1)}>下一页</button>
                </div>
              </footer>
            </section>}
          </ModalBackdrop>
        ) : null}
        {imagePreview && (
          <ImagePreviewDialog
            id={imagePreview.id}
            title={imagePreview.title}
            filename={imagePreview.filename}
            src={imagePreview.src}
            onClose={() => setImagePreview(null)}
          />
        )}
      </section>
    </div>
  );
}



