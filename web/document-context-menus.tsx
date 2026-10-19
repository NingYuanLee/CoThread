import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TreeIcon } from "./document-icons";
export function LibraryFileMenu({
  menuId,
  openMenuId,
  onOpenMenuChange,
  disabled,
  canRename,
  canDelete,
  canSaveToOfficial,
  canViewOfficial,
  saveToOfficialDisabled,
  saveToOfficialTitle,
  onAddToConversation,
  onAddToTask,
  onDownload,
  onRename,
  onDelete,
  onSaveToOfficial,
  onViewOfficial,
}: {
  menuId: string;
  openMenuId: string | null;
  onOpenMenuChange: (id: string | null) => void;
  disabled?: boolean;
  canRename?: boolean;
  canDelete?: boolean;
  canSaveToOfficial?: boolean;
  canViewOfficial?: boolean;
  saveToOfficialDisabled?: boolean;
  saveToOfficialTitle?: string;
  onAddToConversation?: () => void;
  onAddToTask?: () => void;
  onDownload: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onSaveToOfficial?: () => void;
  onViewOfficial?: () => void;
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
        <div
          className="library-folder-menu"
          role="menu"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {onAddToConversation ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                onAddToConversation();
                close();
              }}
            >
              <TreeIcon kind="addToChat" />
              <span>添加到会话</span>
            </button>
          ) : null}
          {onAddToTask ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                onAddToTask();
                close();
              }}
            >
              <TreeIcon kind="addToTask" />
              <span>添加到任务</span>
            </button>
          ) : null}
          {hasLeadItems ? <div className="library-folder-menu-sep" role="separator" /> : null}
          <button
            type="button"
            role="menuitem"
            className="library-folder-menu-item"
            onClick={() => {
              onDownload();
              close();
            }}
          >
            <TreeIcon kind="download" />
            <span>下载</span>
          </button>
          {canRename && onRename ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                onRename();
                close();
              }}
            >
              <TreeIcon kind="rename" />
              <span>重命名</span>
            </button>
          ) : null}
          {canViewOfficial && onViewOfficial ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                onViewOfficial();
                close();
              }}
            >
              <TreeIcon kind="preview" />
              <span>查看正式文件</span>
            </button>
          ) : canSaveToOfficial && onSaveToOfficial ? (
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
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item danger"
              onClick={() => {
                onDelete();
                close();
              }}
            >
              <TreeIcon kind="trash" />
              <span>删除</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

export function OfficialFolderMenu({
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
  const hasMainItems = Boolean(
    onDownload || onUpload || onCopyProjectInfo || onNewFolder || (!isRoot && onRename),
  );
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
        <div
          className="library-folder-menu"
          role="menu"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {onExplain ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                onExplain();
                close();
              }}
            >
              <TreeIcon kind="info" />
              <span>文件夹说明</span>
            </button>
          ) : null}
          {onAddToConversation ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                onAddToConversation();
                close();
              }}
            >
              <TreeIcon kind="addToChat" />
              <span>添加到会话</span>
            </button>
          ) : null}
          {onAddToTask ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                onAddToTask();
                close();
              }}
            >
              <TreeIcon kind="addToTask" />
              <span>添加到任务</span>
            </button>
          ) : null}
          {hasLeadItems && (hasMainItems || hasDeleteItem) ? (
            <div className="library-folder-menu-sep" role="separator" />
          ) : null}
          {onDownload ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              disabled={
                !canDownload || (downloadProgress !== undefined && downloadProgress !== null)
              }
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
                  ? downloadProgress > 0
                    ? `下载压缩包 ${downloadProgress}%`
                    : "正在准备压缩包…"
                  : "下载压缩包"}
              </span>
            </button>
          ) : null}
          {onUpload ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                onUpload();
                close();
              }}
            >
              <TreeIcon kind="upload" />
              <span>上传文件</span>
            </button>
          ) : null}
          {onCopyProjectInfo ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                onCopyProjectInfo();
                close();
              }}
            >
              <TreeIcon kind="copy" />
              <span>复制项目信息</span>
            </button>
          ) : null}
          {onNewFolder ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                onNewFolder();
                close();
              }}
            >
              <TreeIcon kind="newFolder" />
              <span>新建文件夹</span>
            </button>
          ) : null}
          {!isRoot && onRename ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                onRename();
                close();
              }}
            >
              <TreeIcon kind="rename" />
              <span>重命名</span>
            </button>
          ) : null}
          {hasDeleteItem ? <div className="library-folder-menu-sep" role="separator" /> : null}
          {!isRoot && onDelete ? (
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item danger"
              onClick={() => {
                onDelete();
                close();
              }}
            >
              <TreeIcon kind="trash" />
              <span>删除</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

export type TabMenuItem = {
  key: string;
  label: string;
  icon: string;
  disabled?: boolean;
  disabledTitle?: string;
  separatorBefore?: boolean;
  onRun: () => void;
};

export function TabContextMenu({
  x,
  y,
  items,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
  className,
}: {
  x: number;
  y: number;
  items: TabMenuItem[];
  onDismiss: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  className?: string;
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
    left = Math.min(
      Math.max(offsetLeft + 8, left),
      Math.max(offsetLeft + 8, offsetLeft + viewWidth - rect.width - 8),
    );
    top = Math.min(
      Math.max(offsetTop + 8, top),
      Math.max(offsetTop + 8, offsetTop + viewHeight - rect.height - 8),
    );
    setBox((previous) =>
      previous.left === left && previous.top === top ? previous : { left, top },
    );
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
  const run = (item: TabMenuItem) => {
    if (item.disabled) return;
    item.onRun();
    onDismiss();
  };
  return createPortal(
    <div
      ref={ref}
      className={`library-folder-menu doc-browser-tab-menu${className ? ` ${className}` : ""}`}
      role="menu"
      style={{ left: box.left, top: box.top }}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {items.map((item) => (
        <Fragment key={item.key}>
          {item.separatorBefore ? (
            <div className="doc-browser-tab-menu-sep" role="separator" />
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="library-folder-menu-item"
            disabled={item.disabled}
            title={item.disabled ? item.disabledTitle : undefined}
            onClick={() => run(item)}
          >
            <TreeIcon kind={item.icon} />
            <span>{item.label}</span>
          </button>
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}

export type FileContextMenuKind = "html" | "image" | "other" | "selection";

export type TextSelectionSnapshot = {
  root: HTMLElement;
  startPath: number[];
  startOffset: number;
  endPath: number[];
  endOffset: number;
  rects: Array<{ left: number; right: number; top: number; bottom: number }>;
};

export type PendingTextSelection = {
  snapshot: TextSelectionSnapshot;
  text: string;
};

export function getNodePath(root: Node, target: Node) {
  const path: number[] = [];
  let current: Node | null = target;
  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return null;
    const index = Array.prototype.indexOf.call(parent.childNodes, current);
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }
  return current === root ? path : null;
}

export function resolveNodePath(root: Node, path: number[]) {
  let current: Node = root;
  for (const index of path) {
    const next = current.childNodes[index];
    if (!next) return null;
    current = next;
  }
  return current;
}

export function DocumentFileContextMenu({
  x,
  y,
  kind,
  onOpenBrowser,
  onCopyAddress,
  onCopyImage,
  onAddToConversation,
  onDownload,
  onDismiss,
}: {
  x: number;
  y: number;
  kind: FileContextMenuKind;
  onOpenBrowser?: () => void;
  onCopyAddress?: () => void;
  onCopyImage?: () => void;
  onAddToConversation?: () => void;
  onDownload: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? document.documentElement.clientWidth;
    const viewportHeight = window.visualViewport?.height ?? document.documentElement.clientHeight;
    const offsetLeft = window.visualViewport?.offsetLeft ?? 0;
    const offsetTop = window.visualViewport?.offsetTop ?? 0;
    const left = Math.min(
      Math.max(offsetLeft + 8, x),
      Math.max(offsetLeft + 8, offsetLeft + viewportWidth - rect.width - 8),
    );
    const top = Math.min(
      Math.max(offsetTop + 8, y),
      Math.max(offsetTop + 8, offsetTop + viewportHeight - rect.height - 8),
    );
    setBox((previous) =>
      previous.left === left && previous.top === top ? previous : { left, top },
    );
  }, [x, y]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onDismiss]);
  const run = (action?: () => void) => {
    action?.();
    onDismiss();
  };
  return createPortal(
    <div
      ref={ref}
      className="library-folder-menu document-context-menu"
      role="menu"
      style={{ left: box.left, top: box.top }}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
    >
      {kind === "html" && onOpenBrowser ? (
        <button
          type="button"
          role="menuitem"
          className="library-folder-menu-item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run(onOpenBrowser)}
        >
          <TreeIcon kind="preview" />
          <span>在浏览器打开</span>
        </button>
      ) : null}
      {kind === "image" && onCopyAddress ? (
        <button
          type="button"
          role="menuitem"
          className="library-folder-menu-item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run(onCopyAddress)}
        >
          <TreeIcon kind="share" />
          <span>复制地址</span>
        </button>
      ) : null}
      {kind === "image" && onCopyImage ? (
        <button
          type="button"
          role="menuitem"
          className="library-folder-menu-item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run(onCopyImage)}
        >
          <TreeIcon kind="copy" />
          <span>复制图片</span>
        </button>
      ) : null}
      {kind === "selection" && onCopyAddress ? (
        <button
          type="button"
          role="menuitem"
          className="library-folder-menu-item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run(onCopyAddress)}
        >
          <TreeIcon kind="copy" />
          <span>复制</span>
        </button>
      ) : null}
      {kind === "selection" && onAddToConversation ? (
        <button
          type="button"
          role="menuitem"
          className="library-folder-menu-item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run(onAddToConversation)}
        >
          <TreeIcon kind="addToChat" />
          <span>添加到对话</span>
        </button>
      ) : null}
      {kind !== "selection" ? (
        <button
          type="button"
          role="menuitem"
          className="library-folder-menu-item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run(onDownload)}
        >
          <TreeIcon kind="download" />
          <span>下载</span>
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

export function TextSelectionContextMenu({
  x,
  y,
  onCopy,
  onAddToConversation,
  onDismiss,
}: {
  x: number;
  y: number;
  onCopy: () => void;
  onAddToConversation: () => void;
  onDismiss: () => void;
}) {
  return (
    <DocumentFileContextMenu
      x={x}
      y={y}
      kind="selection"
      onDownload={onDismiss}
      onDismiss={onDismiss}
      onCopyAddress={onCopy}
      onAddToConversation={onAddToConversation}
    />
  );
}
