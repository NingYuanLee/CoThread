/**
 * 文档树里的单个文件行：选中、拖拽、右键菜单与关联正式版本入口。
 * 数据与回调由 Documents 打包成 props 传入；v / depth 逐行传入。
 */
import { type Dispatch, type SetStateAction } from "react";
import { LibraryFileMenu } from "./document-context-menus";
import { LibraryFileIcon, TreeDepth, TreeIcon, TreeOverflowLabel } from "./document-icons";
import { folderRootKind } from "./document-library";
import {
  fileLabel,
  recyclePathLabel,
  type LibraryFolder,
  type LibraryVersion,
} from "./document-labels";

export type DocumentFileRowProps = {
  v: LibraryVersion;
  depth: number;
  version: LibraryVersion | undefined;
  libraryFolders: LibraryFolder[];
  writable: boolean;
  pending: boolean;
  trash: boolean;
  organizing: boolean;
  draggedArtifactId: string | null;
  openFileMenuId: string | null;
  setOpenFileMenuId: Dispatch<SetStateAction<string | null>>;
  setOpenFolderMenuId: Dispatch<SetStateAction<string | null>>;
  setDraggedArtifactId: Dispatch<SetStateAction<string | null>>;
  setDropTargetFolderId: Dispatch<SetStateAction<string | null>>;
  setFolderId: Dispatch<SetStateAction<string | null>>;
  setFileContextMenu: Dispatch<SetStateAction<{ id: string; x: number; y: number } | null>>;
  setSelectionContextMenu: Dispatch<SetStateAction<{ x: number; y: number; text: string } | null>>;
  setTabMenu: Dispatch<SetStateAction<{ id: string; x: number; y: number } | null>>;
  onSelect: (id: string) => void;
  onReference: ((id: string) => void) | undefined;
  onAddToTask: ((id: string) => void) | undefined;
  canEditOfficial: (item: LibraryVersion) => boolean;
  canManageFile: (item: LibraryVersion) => boolean;
  showSaveToOfficial: (item: LibraryVersion) => boolean;
  canSaveToOfficial: (item: LibraryVersion) => boolean;
  saveToOfficialHint: (item: LibraryVersion) => string | undefined;
  linkedOfficialVersion: (item: LibraryVersion) => LibraryVersion | undefined;
  fileAreaKind: (item: LibraryVersion) => ReturnType<typeof folderRootKind>;
  selectDocument: (id: string) => void;
  startRenameFile: (item: LibraryVersion) => void;
  deleteFile: (item: LibraryVersion) => void;
  restoreFile: (item: LibraryVersion) => void;
  saveFileToOfficial: (item: LibraryVersion) => void;
};

export function DocumentFileRow({
  v,
  depth,
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
}: DocumentFileRowProps) {
  return (
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
        selectDocument(v.id);
        setFolderId(v.folder_id || null);
        setFileContextMenu(null);
        setSelectionContextMenu(null);
        setOpenFileMenuId(null);
        setOpenFolderMenuId(null);
        setOpenFileMenuId(v.artifact_id);
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
          selectDocument(v.id);
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
          {trash && recyclePathLabel(v, libraryFolders) ? (
            <small>{recyclePathLabel(v, libraryFolders)}</small>
          ) : null}
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
            canSaveToOfficial={showSaveToOfficial(v) && !linkedOfficialVersion(v)}
            canViewOfficial={Boolean(linkedOfficialVersion(v))}
            saveToOfficialDisabled={!canSaveToOfficial(v)}
            saveToOfficialTitle={saveToOfficialHint(v)}
            onAddToConversation={onReference ? () => onReference(v.id) : undefined}
            onAddToTask={
              onAddToTask && fileAreaKind(v) === "project_official" && !v.deleted_at
                ? () => onAddToTask(v.id)
                : undefined
            }
            onDownload={() => {
              window.open(`/api/versions/${v.id}/download`, "_blank", "noopener,noreferrer");
            }}
            onRename={() => startRenameFile(v)}
            onDelete={() => deleteFile(v)}
            onSaveToOfficial={() => saveFileToOfficial(v)}
            onViewOfficial={() => {
              const official = linkedOfficialVersion(v);
              if (official) onSelect(official.id);
            }}
          />
        </span>
      ) : null}
    </div>
  );
}
