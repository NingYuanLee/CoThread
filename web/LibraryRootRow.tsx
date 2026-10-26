/**
 * 文档树里的库根节点：正式文件 / 沙箱产物 / 对话缓存 / 小程序等。
 * 数据与回调由 Documents 打包成 props 传入；root 逐个传入。
 */
import {
  type Dispatch,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { OfficialFolderMenu } from "./document-context-menus";
import { TreeOverflowLabel } from "./document-icons";
import { LIBRARY_ROOT_KINDS } from "./document-library";
import { ROOT_GUIDES, ROOT_LABELS, type LibraryFolder } from "./document-labels";
import { FolderToggle } from "./document-view-internals";

export type LibraryRootRowProps = {
  root: LibraryFolder;
  collapsed: Set<string>;
  setCollapsed: Dispatch<SetStateAction<Set<string>>>;
  dropTargetFolderId: string | null;
  setDropTargetFolderId: Dispatch<SetStateAction<string | null>>;
  pending: boolean;
  setPending: Dispatch<SetStateAction<boolean>>;
  openFolderMenuId: string | null;
  setOpenFolderMenuId: Dispatch<SetStateAction<string | null>>;
  setOpenFileMenuId: Dispatch<SetStateAction<string | null>>;
  setTabMenu: Dispatch<SetStateAction<{ id: string; x: number; y: number } | null>>;
  setFolderGuideKind: Dispatch<SetStateAction<(typeof LIBRARY_ROOT_KINDS)[number] | null>>;
  downloadingFolderId: string | null;
  setDownloadingFolderId: Dispatch<SetStateAction<string | null>>;
  downloadProgress: number | null;
  setDownloadProgress: Dispatch<SetStateAction<number | null>>;
  organizing: boolean;
  canManageOfficialFolders: boolean;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  onReferenceFolder: ((id: string) => void) | undefined;
  onAddFolderToTask: ((id: string) => void) | undefined;
  folderDropHandlers: (targetFolderId: string) => HTMLAttributes<HTMLDivElement>;
  subtreeStats: (folderId: string) => { fileCount: number };
  toggleFolder: (id: string) => void;
  selectFolder: (id: string | null) => void;
  openNewFolder: (targetId: string) => void;
  downloadFolder: (folder: LibraryFolder) => Promise<void>;
  tree: (parent: string | null, depth?: number) => ReactNode;
};

export function LibraryRootRow({
  root,
  collapsed,
  dropTargetFolderId,
  pending,
  openFolderMenuId,
  setOpenFolderMenuId,
  setOpenFileMenuId,
  setTabMenu,
  setFolderGuideKind,
  downloadingFolderId,
  downloadProgress,
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
  downloadFolder,
  tree,
}: LibraryRootRowProps) {
  return (
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
          aria-label={
            ROOT_LABELS[root.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number]] || root.name
          }
          disabled={root.folder_kind === "project_official" && organizing}
          onClick={() => toggleFolder(root.id)}
        >
          <TreeOverflowLabel
            text={ROOT_LABELS[root.folder_kind as (typeof LIBRARY_ROOT_KINDS)[number]] || root.name}
          />
        </button>
        <span className="tree-root-actions tree-row-actions">
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
            onAddToConversation={
              onReferenceFolder && subtreeStats(root.id).fileCount > 0
                ? () => onReferenceFolder(root.id)
                : undefined
            }
            onAddToTask={
              onAddFolderToTask && root.folder_kind === "project_official"
                ? () => onAddFolderToTask(root.id)
                : undefined
            }
            onDownload={
              subtreeStats(root.id).fileCount > 0 ? () => downloadFolder(root) : undefined
            }
            canDownload={subtreeStats(root.id).fileCount > 0}
            downloadProgress={downloadingFolderId === root.id ? downloadProgress : null}
            onUpload={
              root.folder_kind === "project_official" && canManageOfficialFolders
                ? () => {
                    selectFolder(root.id);
                    uploadInputRef.current?.click();
                  }
                : undefined
            }
            onNewFolder={
              root.folder_kind === "project_official" && canManageOfficialFolders
                ? () => openNewFolder(root.id)
                : undefined
            }
          />
        </span>
      </div>
      {!collapsed.has(root.id) ? <div role="group">{tree(root.id, 1)}</div> : null}
    </div>
  );
}
