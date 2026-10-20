/**
 * 小程序工作区的云存储页：目录导航、上传、新建文件夹与文件操作。
 */
import React, { type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  TablePagination,
  WorkspaceDialog,
  formatStorageSize,
  storageFileName,
  type CloudbaseEnvInfo,
  type DatabaseEnvironment,
  type MiniProgramTabId,
  type StorageFile,
} from "./miniprogram-internals";
import { UiIcon } from "./ui-icon";

export type MiniprogramStoragePanelProps = {
  tab: MiniProgramTabId;
  setTab: Dispatch<SetStateAction<MiniProgramTabId>>;
  writable: boolean;
  projectId: string;
  browseBusy: "collections" | "files" | null;
  storageActionBusy: "create" | "upload" | "delete" | null;
  browsePath: string;
  browseError: string;
  setBrowseError: Dispatch<SetStateAction<string>>;
  cbEnvironments: CloudbaseEnvInfo[];
  storageEnvironment: DatabaseEnvironment;
  setStorageEnvironment: Dispatch<SetStateAction<DatabaseEnvironment>>;
  storageLoaded: boolean;
  storagePage: number;
  setStoragePage: Dispatch<SetStateAction<number>>;
  storagePageSize: number;
  setStoragePageSize: Dispatch<SetStateAction<number>>;
  storageHasNext: boolean;
  visibleStorageFiles: StorageFile[];
  pagedStorageFiles: StorageFile[];
  storageBreadcrumbs: string[];
  newFolderOpen: boolean;
  setNewFolderOpen: Dispatch<SetStateAction<boolean>>;
  newFolderName: string;
  setNewFolderName: Dispatch<SetStateAction<string>>;
  storageFolderInputRef: RefObject<HTMLInputElement | null>;
  storageFileInputRef: RefObject<HTMLInputElement | null>;
  browseStorage: (path?: string) => Promise<void>;
  uploadStorageFiles: (files: FileList | null, keepRelativePath: boolean) => Promise<void>;
  deleteStorageEntry: (file: StorageFile) => Promise<void>;
  createStorageFolder: () => Promise<void>;
};

export function MiniprogramStoragePanel({
  tab,
  writable,
  projectId,
  browseBusy,
  storageActionBusy,
  browsePath,
  browseError,
  cbEnvironments,
  storageEnvironment,
  setStorageEnvironment,
  storageLoaded,
  storagePage,
  setStoragePage,
  storagePageSize,
  setStoragePageSize,
  storageHasNext,
  visibleStorageFiles,
  pagedStorageFiles,
  storageBreadcrumbs,
  newFolderOpen,
  setNewFolderOpen,
  newFolderName,
  setNewFolderName,
  storageFolderInputRef,
  storageFileInputRef,
  browseStorage,
  uploadStorageFiles,
  deleteStorageEntry,
  createStorageFolder,
}: MiniprogramStoragePanelProps) {
  return (
    <>
      {tab === "storage" ? (
        <section className="miniprogram-panel miniprogram-storage-panel">
          <div
            className="miniprogram-admin-toolbar miniprogram-storage-addressbar"
            role="toolbar"
            aria-label="CloudBase 云存储工具栏"
          >
            <button
              type="button"
              className="miniprogram-preview-icon-button"
              title="刷新当前文件夹"
              aria-label="刷新当前文件夹"
              disabled={browseBusy !== null || storageActionBusy !== null}
              onClick={() => void browseStorage(browsePath)}
            >
              <UiIcon name="refresh" size={14} />
            </button>
            <nav
              className="miniprogram-admin-address miniprogram-storage-breadcrumbs"
              aria-label="文件夹路径"
            >
              <UiIcon name="folder" size={13} />
              <button type="button" onClick={() => void browseStorage("")}>
                根目录
              </button>
              {storageBreadcrumbs.map((part, index) => {
                const path = storageBreadcrumbs.slice(0, index + 1).join("/");
                return (
                  <React.Fragment key={path}>
                    <span aria-hidden="true">/</span>
                    <button type="button" onClick={() => void browseStorage(path)}>
                      {part}
                    </button>
                  </React.Fragment>
                );
              })}
            </nav>
            <div
              className="miniprogram-database-environment"
              role="group"
              aria-label="CloudBase 云存储环境"
            >
              {(["development", "production"] as const).map((environment) => {
                const info = cbEnvironments.find((item) => item.kind === environment);
                const selected = storageEnvironment === environment;
                const label = environment === "production" ? "生产环境" : "开发环境";
                const unavailable = Boolean(cbEnvironments.length && !info?.configured);
                return (
                  <button
                    type="button"
                    key={environment}
                    className={selected ? "is-selected" : ""}
                    aria-pressed={selected}
                    title={
                      info?.inherited
                        ? `${label}（共用开发环境）`
                        : `${label}${info?.envId ? ` ${info.envId}` : "未配置"}`
                    }
                    disabled={browseBusy !== null || storageActionBusy !== null || unavailable}
                    onClick={() => {
                      if (!selected) {
                        setStorageEnvironment(environment);
                        setStoragePage(0);
                      }
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="miniprogram-preview-icon-button"
              title="新建文件夹"
              aria-label="新建文件夹"
              disabled={!writable || storageActionBusy !== null}
              onClick={() => setNewFolderOpen(true)}
            >
              <UiIcon name="folderPlus" size={14} />
            </button>
            <button
              type="button"
              className="miniprogram-preview-icon-button"
              title="上传文件夹"
              aria-label="上传文件夹"
              disabled={!writable || storageActionBusy !== null}
              onClick={() => storageFolderInputRef.current?.click()}
            >
              <UiIcon name="folderUpload" size={14} />
            </button>
            <button
              type="button"
              className="miniprogram-preview-icon-button"
              title="上传文件"
              aria-label="上传文件"
              disabled={!writable || storageActionBusy !== null}
              onClick={() => storageFileInputRef.current?.click()}
            >
              <UiIcon name="upload" size={14} />
            </button>
          </div>

          <div className="miniprogram-table-content miniprogram-storage-content">
            <div className="miniprogram-storage-inputs" aria-hidden="true">
              <input
                ref={storageFolderInputRef}
                className="miniprogram-storage-file-input"
                type="file"
                multiple
                {...({
                  webkitdirectory: "",
                  directory: "",
                } as React.InputHTMLAttributes<HTMLInputElement>)}
                onChange={(event) => void uploadStorageFiles(event.target.files, true)}
              />
              <input
                ref={storageFileInputRef}
                className="miniprogram-storage-file-input"
                type="file"
                multiple
                onChange={(event) => void uploadStorageFiles(event.target.files, false)}
              />
            </div>

            <div className="miniprogram-storage-table-wrap">
              <table className="miniprogram-storage-table">
                <thead>
                  <tr>
                    <th>文件名</th>
                    <th>fileid</th>
                    <th>大小</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedStorageFiles.map((file) => (
                    <tr key={file.key}>
                      <td>
                        {file.isDirectory ? (
                          <button
                            type="button"
                            className="miniprogram-storage-name"
                            onClick={() => void browseStorage(file.key)}
                          >
                            <UiIcon name="folder" size={14} />
                            <span>{storageFileName(file.key)}/</span>
                          </button>
                        ) : (
                          <span className="miniprogram-storage-name is-file">
                            <UiIcon name="detail" size={14} />
                            <span>{storageFileName(file.key)}</span>
                          </span>
                        )}
                      </td>
                      <td title={file.fileId || undefined}>{file.fileId || "—"}</td>
                      <td>{file.isDirectory ? "—" : formatStorageSize(file.size)}</td>
                      <td>{file.lastModified || "—"}</td>
                      <td>
                        <div className="miniprogram-storage-row-actions">
                          {!file.isDirectory ? (
                            <a
                              href={`/api/projects/${projectId}/cloudbase/storage/download?environment=${storageEnvironment}&path=${encodeURIComponent(file.key)}`}
                              target="_blank"
                              rel="noreferrer"
                              download
                              title={`下载 ${storageFileName(file.key)}`}
                            >
                              <UiIcon name="download" size={13} />
                              下载
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="is-danger"
                            disabled={!writable || storageActionBusy !== null}
                            onClick={() => void deleteStorageEntry(file)}
                          >
                            <UiIcon name="trash" size={13} />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!visibleStorageFiles.length && storageLoaded && browseBusy === null ? (
                    <tr>
                      <td className="miniprogram-storage-empty" colSpan={5}>
                        当前文件夹为空。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              {browseBusy === "files" ? (
                <div className="miniprogram-storage-loading">正在加载文件列表…</div>
              ) : null}
            </div>
            <TablePagination
              page={storagePage}
              pageSize={storagePageSize}
              total={visibleStorageFiles.length}
              hasNext={storageHasNext}
              onPageChange={setStoragePage}
              onPageSizeChange={(pageSize) => {
                setStoragePageSize(pageSize);
                setStoragePage(0);
              }}
            />
            {browseError ? (
              <p className="miniprogram-config-error miniprogram-storage-error">{browseError}</p>
            ) : null}
          </div>
          {newFolderOpen ? (
            <WorkspaceDialog title="新建文件夹" onClose={() => setNewFolderOpen(false)}>
              <label className="miniprogram-field miniprogram-field-column">
                <span>文件夹名称</span>
                <input
                  value={newFolderName}
                  autoFocus
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createStorageFolder();
                  }}
                />
              </label>
              <div className="miniprogram-config-actions miniprogram-storage-dialog-actions">
                <button type="button" onClick={() => setNewFolderOpen(false)}>
                  取消
                </button>
                <button
                  type="button"
                  disabled={!newFolderName.trim() || storageActionBusy !== null}
                  onClick={() => void createStorageFolder()}
                >
                  {storageActionBusy === "create" ? "创建中…" : "创建"}
                </button>
              </div>
            </WorkspaceDialog>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
