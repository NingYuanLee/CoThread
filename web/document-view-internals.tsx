/**
 * 文档预览的内部件：页签类型、文本预览上限、文件大小格式、视图缓存与文件夹折叠按钮。
 */
import { readJsonResponse } from "../shared/json-response.js";
import { apiFetch } from "./api-fetch";
import { type ReactNode } from "react";
import { createResourceCache } from "../shared/resource-cache.js";
import { ClosedFolderIcon, OpenFolderIcon, TreeIcon } from "./document-icons";

export type BrowserTab = {
  key: string;
  versionId: string;
  url: string;
  loadUrl: string;
  label: string;
};

/** 开始页签的固定 id（文档页签是版本 id、HTML 页签带 key 前缀，不会撞车）。 */
export const START_TAB_ID = "start";

export const TEXT_PREVIEW_LIMIT = 1_048_576;
export const TEXT_PREVIEW_NAME =
  /\.(md|markdown|txt|json|py|js|mjs|cjs|ts|tsx|jsx|css|scss|less|sql|xml|yaml|yml|sh|bash|log|env|ini|conf|toml|properties|gitignore)$/i;

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function readVersionText(versionId: string, byteSize = 0, signal?: AbortSignal) {
  const truncated = byteSize > TEXT_PREVIEW_LIMIT;
  const path = truncated
    ? `/api/versions/${versionId}/source?limit=${TEXT_PREVIEW_LIMIT}`
    : `/api/versions/${versionId}/source`;
  const response = await apiFetch(path, signal ? { signal } : {});
  if (!response.ok) {
    const body = await readJsonResponse(response, path).catch(() => null);
    throw new Error(body?.error || `源码读取失败（${response.status}）`);
  }
  return { text: await response.text(), truncated, byteSize };
}

export type DocumentViewCacheEntry = {
  kind: string;
  mime: string;
  text?: string;
  bytes?: Uint8Array;
  truncated?: boolean;
  byteSize?: number;
};

// Version IDs are immutable document snapshots. Keep a small in-memory cache so
// switching between already-open files does not re-read their content.
export const documentViewCache = createResourceCache<DocumentViewCacheEntry>(8);

import {
  DocumentFileContextMenu,
  LibraryFileMenu,
  OfficialFolderMenu,
  TabContextMenu,
  TextSelectionContextMenu,
  getNodePath,
  resolveNodePath,
  type FileContextMenuKind,
  type PendingTextSelection,
  type TabMenuItem,
  type TextSelectionSnapshot,
} from "./document-context-menus";
export function FolderToggle({
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

import {
  documentChangeLabels,
  officialSourceTypeLabels,
  fileAreaTypeLabels,
  documentChangeSources,
  documentChangeActions,
  fileLabel,
  isUnversionedArea,
  documentStatusLabel,
  officialTitleWithVersion,
  recyclePathLabel,
  ROOT_DISPLAY_ORDER,
  ROOT_LABELS,
  ROOT_GUIDES,
  CODE_LIBRARY_ROOT_ID,
  CODE_LIBRARY_ROOT_NAME,
  CODE_LIBRARY_GUIDE,
  CODE_PLATFORM_ICONS,
  codeLibraryEntries,
  documentSourceLabel,
  versionCodeForRows,
  DOCUMENT_TREE_STATE_KEY,
  DOCUMENT_TREE_WIDTH_KEY,
  TREE_WIDTH_MIN,
  TREE_WIDTH_MAX,
  readStoredBoolean,
  readStoredTreeWidth,
  DEFAULT_OFFICIAL_FOLDER_NAME,
  resolveLibraryRoot,
  isInProjectLibrary,
  isLibraryTreeVersion,
  organizableDocuments,
  suggestOfficialFolderName,
  type LibraryVersion,
  type LibraryFolder,
  type DocumentChange,
  type DocumentChangePage,
  type DocumentChangeFilters,
  type CodeLibraryConfig,
} from "./document-labels";
export type { LibraryVersion } from "./document-labels";
