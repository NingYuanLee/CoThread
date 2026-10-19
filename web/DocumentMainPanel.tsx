/**
 * 文档库主面板：重命名 / 新建文件夹表单、预览区、源码与开始页。
 * 数据与回调由 Documents 打包成 props 传入。
 */
import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { HtmlBrowserEmptyState } from "./HtmlBrowserEmptyState";
import {
  DEFAULT_OFFICIAL_FOLDER_NAME,
  officialTitleWithVersion,
  recyclePathLabel,
  suggestOfficialFolderName,
  versionCodeForRows,
  type LibraryFolder,
  type LibraryVersion,
} from "./document-labels";
import type { BrowserTab } from "./document-view-internals";
import type { HtmlDeviceMode } from "./HtmlBrowserToolbar";

export type DocumentMainPanelProps = {
  mainPanelRef: RefObject<HTMLElement | null>;
  renaming: boolean;
  setRenaming: Dispatch<SetStateAction<boolean>>;
  renameName: string;
  setRenameName: Dispatch<SetStateAction<string>>;
  newFolder: boolean;
  setNewFolder: Dispatch<SetStateAction<boolean>>;
  newFolderName: string;
  setNewFolderName: Dispatch<SetStateAction<string>>;
  renamingFolder: boolean;
  setRenamingFolder: Dispatch<SetStateAction<boolean>>;
  renameFolderName: string;
  setRenameFolderName: Dispatch<SetStateAction<string>>;
  savingOfficial: LibraryVersion | null;
  setSavingOfficial: Dispatch<SetStateAction<LibraryVersion | null>>;
  saveOfficialVersionId: string;
  setSaveOfficialVersionId: Dispatch<SetStateAction<string>>;
  saveOfficialTitle: string;
  setSaveOfficialTitle: Dispatch<SetStateAction<string>>;
  pending: boolean;
  setPending: Dispatch<SetStateAction<boolean>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  activeTool: "files" | "browser";
  setActiveTool: Dispatch<SetStateAction<"files" | "browser">>;
  browserAddressQuery: string;
  setBrowserAddressQuery: Dispatch<SetStateAction<string>>;
  browserDeviceMode: HtmlDeviceMode;
  setBrowserDeviceMode: Dispatch<SetStateAction<HtmlDeviceMode>>;
  browserAddressFocusKey: string;
  setBrowserAddressFocusKey: Dispatch<SetStateAction<string>>;
  projectId: string;
  libraryFolders: LibraryFolder[];
  versions: LibraryVersion[];
  version: LibraryVersion | undefined;
  selectedLibraryFolder: LibraryFolder | undefined;
  officialFolderParentId: string | null;
  startActive: boolean;
  view: {
    text?: string;
    url?: string;
    bytes?: Uint8Array;
    kind: string;
    mime: string;
    truncated?: boolean;
    byteSize?: number;
    nativeSource?: boolean;
  } | null;
  setCollapsed: Dispatch<SetStateAction<Set<string>>>;
  setFolderId: Dispatch<SetStateAction<string | null>>;
  startPageContent: ReactNode;
  previewContent: ReactNode;
  browserFileBreadcrumb: ReactNode;
  fileActionCapsule: ReactNode;
  browserVersionHistorySelect: ReactNode;
  reviewActions: ReactNode;
  browserSourceActions: ReactNode;
  activeBrowserTab: BrowserTab | null;
  htmlBrowserFiles: { id: string; filename: string; address: string }[];
  act: (fn: () => Promise<void>, success?: string) => Promise<void>;
  change: (
    path: string,
    data: unknown,
    method?: string,
  ) => Promise<Record<string, unknown> & { id: string }>;
  openBrowserTab: (id: string) => void;
  confirmedOutputVersions: (item: LibraryVersion) => LibraryVersion[];
  handleDocumentMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
  handleDocumentContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
};

export function DocumentMainPanel({
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
  error,
  activeTool,
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
}: DocumentMainPanelProps) {
  return (
    <main
      ref={mainPanelRef}
      className={`${renaming || newFolder || renamingFolder || savingOfficial ? "library-operation" : ""} doc-browser-main`}
      onMouseDown={handleDocumentMouseDown}
      onContextMenu={handleDocumentContextMenu}
    >
      {newFolder && (
        <form
          className="library-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!officialFolderParentId) return;
            void act(async () => {
              const name =
                newFolderName.trim() ||
                suggestOfficialFolderName(officialFolderParentId, libraryFolders);
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
          }}
        >
          <h3>新建子文件夹</h3>
          <p className="muted">将创建在正式文件区内（当前选中的文件夹下）。</p>
          <label>
            文件夹名称
            <input
              autoFocus
              maxLength={160}
              placeholder={`留空则使用「${DEFAULT_OFFICIAL_FOLDER_NAME}」`}
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
            />
          </label>
          <div>
            <button type="submit" className="primary" disabled={pending || !officialFolderParentId}>
              {pending ? "创建中…" : "创建"}
            </button>
            <button type="button" disabled={pending} onClick={() => setNewFolder(false)}>
              取消
            </button>
          </div>
        </form>
      )}
      {renamingFolder && selectedLibraryFolder && (
        <form
          className="library-form"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await change(
                `/projects/${projectId}/folders/${selectedLibraryFolder.id}`,
                { name: renameFolderName },
                "PATCH",
              );
              setRenamingFolder(false);
            }, "文件夹已重命名");
          }}
        >
          <h3>重命名文件夹</h3>
          <label>
            名称
            <input
              autoFocus
              required
              maxLength={160}
              value={renameFolderName}
              onChange={(event) => setRenameFolderName(event.target.value)}
            />
          </label>
          <div>
            <button type="submit" className="primary" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </button>
            <button type="button" disabled={pending} onClick={() => setRenamingFolder(false)}>
              取消
            </button>
          </div>
        </form>
      )}
      {renaming && version && (
        <form
          className="library-form"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await change(
                `/projects/${projectId}/artifacts/${version.artifact_id}`,
                { name: renameName },
                "PATCH",
              );
              setRenaming(false);
            }, "文档已重命名");
          }}
        >
          <h3>重命名文档</h3>
          <label>
            名称
            <input
              autoFocus
              required
              maxLength={160}
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
            />
          </label>
          <div>
            <button type="submit" className="primary" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </button>
            <button type="button" disabled={pending} onClick={() => setRenaming(false)}>
              取消
            </button>
          </div>
        </form>
      )}
      {savingOfficial && (
        <form
          className="library-form"
          onSubmit={(event) => {
            event.preventDefault();
            const picked = confirmedOutputVersions(savingOfficial).find(
              (row) => row.id === saveOfficialVersionId,
            );
            if (!picked || !saveOfficialTitle.trim()) return;
            void act(async () => {
              await change(`/projects/${projectId}/versions/${picked.id}/save-to-official`, {
                title: saveOfficialTitle.trim(),
              });
              setSavingOfficial(null);
            }, "已另存至正式文件");
          }}
        >
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
                const picked = confirmedOutputVersions(savingOfficial).find(
                  (row) => row.id === nextId,
                );
                if (picked)
                  setSaveOfficialTitle(
                    officialTitleWithVersion(
                      savingOfficial.title,
                      versionCodeForRows(picked, versions),
                    ),
                  );
              }}
            >
              {confirmedOutputVersions(savingOfficial).map((row) => (
                <option key={row.id} value={row.id}>
                  v{versionCodeForRows(row, versions)} · 已确认
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
            <button
              type="submit"
              className="primary"
              disabled={pending || !saveOfficialVersionId || !saveOfficialTitle.trim()}
            >
              {pending ? "另存中…" : "另存"}
            </button>
            <button type="button" disabled={pending} onClick={() => setSavingOfficial(null)}>
              取消
            </button>
          </div>
        </form>
      )}
      {!renaming &&
        !newFolder &&
        !renamingFolder &&
        !savingOfficial &&
        (startActive ? (
          startPageContent
        ) : activeTool === "browser" && !activeBrowserTab?.versionId ? (
          <div className="doc-browser-view doc-browser-browser-empty-view">
            <div className="document-preview doc-browser-preview">
              <HtmlBrowserEmptyState
                files={htmlBrowserFiles}
                addressQuery={browserAddressQuery}
                onAddressQueryChange={setBrowserAddressQuery}
                onSelectFile={openBrowserTab}
                deviceMode={browserDeviceMode}
                onDeviceModeChange={setBrowserDeviceMode}
                focusAddressKey={
                  activeBrowserTab?.key === browserAddressFocusKey ? browserAddressFocusKey : ""
                }
                onAddressFocused={() => setBrowserAddressFocusKey("")}
              />
            </div>
          </div>
        ) : version ? (
          <>
            {version.deleted_at && (
              <p className="muted doc-browser-notice">
                已移入回收站
                {recyclePathLabel(version, libraryFolders)
                  ? `，原路径：${recyclePathLabel(version, libraryFolders)}`
                  : ""}
                。历史引用仍可查看，原路恢复后回到原来的文件夹。
              </p>
            )}
            {error && <div className="error doc-browser-error">{error}</div>}
            <div className="doc-browser-view">
              {browserFileBreadcrumb}
              {fileActionCapsule ? (
                <div className="doc-browser-preview-chrome">{fileActionCapsule}</div>
              ) : null}
              <div className="document-preview doc-browser-preview">
                {!view && !error && <p className="muted doc-browser-loading">正在读取文档…</p>}
                {previewContent}
              </div>
            </div>
            <footer className="doc-browser-bottombar">
              {browserVersionHistorySelect}
              {reviewActions}
              {browserSourceActions}
            </footer>
          </>
        ) : (
          startPageContent
        ))}
    </main>
  );
}
