import type { CSSProperties, ReactNode, RefObject } from "react";

export function DocumentLibraryExplorer({
  treeWidth,
  treeWidthMin,
  treeWidthMax,
  fileSearchRef,
  filter,
  sort,
  pending,
  organizing,
  writable,
  trash,
  artifacts,
  canEmptyTrash,
  libraryFolders,
  actionError,
  organizationError,
  pendingLabel,
  uploadProgress,
  treeContent,
  renderTreeIcon,
  onResizeStart,
  onFilterChange,
  onSortToggle,
  onToggleTrash,
  onEmptyTrash,
  onOpenChangeLog,
  changeLogOpen,
}: {
  treeWidth: number;
  treeWidthMin: number;
  treeWidthMax: number;
  fileSearchRef: RefObject<HTMLInputElement | null>;
  filter: string;
  sort: "modified" | "type";
  pending: boolean;
  organizing: boolean;
  writable: boolean;
  trash: boolean;
  artifacts: unknown[];
  canEmptyTrash: boolean;
  libraryFolders: unknown[];
  actionError?: string;
  organizationError?: string;
  pendingLabel: string;
  uploadProgress?: number | null;
  treeContent: ReactNode;
  renderTreeIcon: (kind: string) => ReactNode;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onFilterChange: (value: string) => void;
  onSortToggle: () => void;
  onToggleTrash: () => void;
  onEmptyTrash: () => void;
  onOpenChangeLog: () => void;
  changeLogOpen: boolean;
}) {
  return (
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
        aria-valuemin={treeWidthMin}
        aria-valuemax={treeWidthMax}
        aria-valuenow={treeWidth}
        onPointerDown={onResizeStart}
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
            onChange={(event) => onFilterChange(event.target.value)}
            onKeyDown={(event) => {
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
            onClick={onSortToggle}
          >
            {renderTreeIcon(sort === "type" ? "sortType" : "sortModified")}
          </button>
        </div>
      </div>
      <div className="file-explorer-scroll" aria-busy={pending}>
        <div role="tree" aria-label="项目文档库">
          {organizing ? (
            <p className="muted">项目级Agent（L1）正在整理正式文件，正式文件区暂时不可操作。</p>
          ) : null}
          {treeContent}
        </div>
        {trash && !artifacts.length ? <p className="muted">回收站是空的。</p> : null}
        {!artifacts.length && !libraryFolders.length && !trash ? (
          <p className="muted">文档库尚无文件。</p>
        ) : null}
        {organizationError ? (
          <div className="error" role="alert">
            {organizationError}
          </div>
        ) : null}
        {actionError ? (
          <div className="error" role="alert">
            {actionError}
          </div>
        ) : null}
      </div>
      <footer className="library-explorer-footer">
        <button
          type="button"
          className={changeLogOpen ? "library-trash-entry active" : "library-trash-entry"}
          title="文档操作日志"
          aria-label="文档操作日志"
          aria-pressed={changeLogOpen}
          onClick={onOpenChangeLog}
        >
          {renderTreeIcon("history")}
          <span>操作日志</span>
        </button>
        <button
          type="button"
          className={trash ? "library-trash-entry active" : "library-trash-entry"}
          title={trash ? "返回文件树" : "回收站"}
          aria-label={trash ? "返回文件树" : "回收站"}
          aria-pressed={trash}
          onClick={onToggleTrash}
        >
          {renderTreeIcon(trash ? "back" : "trash")}
          <span>{trash ? "返回文件树" : "回收站"}</span>
        </button>
        {trash && writable ? (
          <button
            type="button"
            className="library-trash-empty"
            title="永久清空回收站"
            aria-label="清空回收站"
            disabled={pending || !canEmptyTrash}
            onClick={onEmptyTrash}
          >
            {renderTreeIcon("trash")}
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
}
