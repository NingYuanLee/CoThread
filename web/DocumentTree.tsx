/**
 * 文档树的分支渲染：递归渲染子文件夹，并列出该层的文件行。
 * 数据与回调由 Documents 打包成 props 传入；parent / depth 逐层传入。
 */
import {
  type Dispatch,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { OfficialFolderMenu } from "./document-context-menus";
import { TreeDepth, TreeOverflowLabel } from "./document-icons";
import { folderRootKind } from "./document-library";
import type { LibraryFolder, LibraryVersion } from "./document-labels";
import { FolderToggle } from "./document-view-internals";

export type DocumentTreeProps = {
  parent: string | null;
  depth: number;
  renderSelf: (parent: string | null, depth?: number) => ReactNode;
  fileRow: (v: LibraryVersion, depth: number) => ReactNode;
  artifacts: LibraryVersion[];
  libraryFolders: LibraryFolder[];
  sort: "type" | "modified";
  collapsed: Set<string>;
  setCollapsed: Dispatch<SetStateAction<Set<string>>>;
  dropTargetFolderId: string | null;
  setDropTargetFolderId: Dispatch<SetStateAction<string | null>>;
  draggedFolderId: string | null;
  setDraggedFolderId: Dispatch<SetStateAction<string | null>>;
  pending: boolean;
  setPending: Dispatch<SetStateAction<boolean>>;
  openFolderMenuId: string | null;
  setOpenFolderMenuId: Dispatch<SetStateAction<string | null>>;
  setOpenFileMenuId: Dispatch<SetStateAction<string | null>>;
  setTabMenu: Dispatch<SetStateAction<{ id: string; x: number; y: number } | null>>;
  downloadingFolderId: string | null;
  setDownloadingFolderId: Dispatch<SetStateAction<string | null>>;
  downloadProgress: number | null;
  setDownloadProgress: Dispatch<SetStateAction<number | null>>;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  collator: Intl.Collator;
  modified: (a: { updated_at?: string }, b: { updated_at?: string }) => number;
  organizing: boolean;
  canManageOfficialFolders: boolean;
  canDragOfficialFolder: (folder: LibraryFolder) => boolean;
  onReferenceFolder: ((id: string) => void) | undefined;
  onAddFolderToTask: ((id: string) => void) | undefined;
  folderDropHandlers: (targetFolderId: string) => HTMLAttributes<HTMLDivElement>;
  subtreeStats: (folderId: string) => { fileCount: number };
  toggleFolder: (id: string) => void;
  selectFolder: (id: string | null) => void;
  openNewFolder: (targetId: string) => void;
  openRenameFolder: (target: LibraryFolder) => void;
  deleteFolder: (target: LibraryFolder) => void;
  downloadFolder: (folder: LibraryFolder) => Promise<void>;
};

export function DocumentTree(props: DocumentTreeProps) {
  const {
    parent,
    depth,
    renderSelf,
    fileRow,
    artifacts,
    libraryFolders,
    sort,
    collapsed,
    dropTargetFolderId,
    setDropTargetFolderId,
    draggedFolderId,
    setDraggedFolderId,
    pending,
    openFolderMenuId,
    setOpenFolderMenuId,
    setOpenFileMenuId,
    setTabMenu,
    downloadingFolderId,
    downloadProgress,
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
  } = props;
  return (
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
                const canManage =
                  canManageOfficialFolders &&
                  folderRootKind(f.id, libraryFolders) === "project_official" &&
                  !f.system_key &&
                  f.folder_kind !== "project_official";
                const hasMenu =
                  canManage ||
                  subtreeStats(f.id).fileCount > 0 ||
                  Boolean(
                    onAddFolderToTask &&
                    folderRootKind(f.id, libraryFolders) === "project_official",
                  );
                if (!hasMenu || pending) return;
                event.preventDefault();
                event.stopPropagation();
                setOpenFolderMenuId(f.id);
                setOpenFileMenuId(null);
                setTabMenu(null);
              }}
              {...(canManageOfficialFolders &&
              folderRootKind(f.id, libraryFolders) === "project_official" &&
              !f.system_key
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
              {(canManageOfficialFolders &&
                folderRootKind(f.id, libraryFolders) === "project_official" &&
                !f.system_key &&
                f.folder_kind !== "project_official") ||
              subtreeStats(f.id).fileCount > 0 ||
              (onAddFolderToTask && folderRootKind(f.id, libraryFolders) === "project_official") ? (
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
                    onAddToConversation={
                      onReferenceFolder && subtreeStats(f.id).fileCount > 0
                        ? () => onReferenceFolder(f.id)
                        : undefined
                    }
                    onAddToTask={
                      onAddFolderToTask &&
                      folderRootKind(f.id, libraryFolders) === "project_official"
                        ? () => onAddFolderToTask(f.id)
                        : undefined
                    }
                    onDownload={() => downloadFolder(f)}
                    canDownload={subtreeStats(f.id).fileCount > 0}
                    downloadProgress={downloadingFolderId === f.id ? downloadProgress : null}
                    onUpload={
                      canManageOfficialFolders &&
                      folderRootKind(f.id, libraryFolders) === "project_official" &&
                      !f.system_key
                        ? () => {
                            selectFolder(f.id);
                            uploadInputRef.current?.click();
                          }
                        : undefined
                    }
                    onNewFolder={
                      canManageOfficialFolders &&
                      folderRootKind(f.id, libraryFolders) === "project_official" &&
                      !f.system_key
                        ? () => openNewFolder(f.id)
                        : undefined
                    }
                    onRename={
                      canManageOfficialFolders &&
                      folderRootKind(f.id, libraryFolders) === "project_official" &&
                      !f.system_key
                        ? () => openRenameFolder(f)
                        : undefined
                    }
                    onDelete={
                      canManageOfficialFolders &&
                      folderRootKind(f.id, libraryFolders) === "project_official" &&
                      !f.system_key
                        ? () => deleteFolder(f)
                        : undefined
                    }
                  />
                </span>
              ) : null}
            </div>
            {!collapsed.has(f.id) && <div role="group">{renderSelf(f.id, depth + 1)}</div>}
          </div>
        ))}
      {artifacts.filter((v) => (v.folder_id || null) === parent).map((v) => fileRow(v, depth))}
    </>
  );
}
