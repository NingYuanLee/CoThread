/**
 * 文档库的标签、分区与树状态：纯类型与纯函数，不含渲染。
 */
import { fileDisplayName } from "../shared/document-name.js";
import { LIBRARY_ROOT_KINDS, folderRootKind } from "./document-library";

export type LibraryVersion = {
  id: string;
  artifact_id: string;
  folder_id?: string | null;
  source_type?: "member_upload" | "cache_saved" | "output_saved" | "recycle_restored" | null;
  source_artifact_id?: string | null;
  saved_official_artifact_id?: string | null;
  folder_thread_id?: string | null;
  folder_kind?: string | null;
  deleted_at?: string | null;
  artifact_deleted_at?: string | null;
  version_deleted_at?: string | null;
  recycle_path?: { id: string; name: string }[] | string | null;
  created_at?: string;
  batch_id?: string | null;
  updated_at?: string;
  title: string;
  version: number;
  filename: string;
  mime?: string | null;
  review: string | null;
  byte_size: number;
  author: string;
  thread_id: string;
};

export type LibraryFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  updated_at?: string;
  system_key?: string | null;
  thread_id?: string | null;
  folder_kind?: string | null;
};
export type DocumentChange = {
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
export type DocumentChangePage = {
  hasMore: boolean;
  total: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  before: string | null;
  beforeId: string | null;
};
export type DocumentChangeFilters = {
  from: string;
  to: string;
  fileName: string;
  action: string;
  limit: string;
};

export const documentChangeLabels: Record<string, string> = {
  document_uploaded: "上传正式文件",
  cache_uploaded: "上传对话缓存",
  artifact_published: "发布沙箱产物",
  version_branched: "创建新版",
  document_saved_to_official: "另存为正式文件",
  document_renamed: "重命名文档",
  document_moved: "移动文档",
  document_deleted: "删除文档",
  document_restored: "恢复文档",
  version_deleted: "删除版本",
  version_restored: "恢复版本",
  folder_created: "创建文件夹",
  folder_renamed: "重命名文件夹",
  folder_moved: "移动文件夹",
  folder_deleted: "删除文件夹",
  recycle_emptied: "清空回收站",
};

export const officialSourceTypeLabels: Record<string, string> = {
  member_upload: "成员上传",
  cache_saved: "缓存另存",
  output_saved: "沙箱另存",
  recycle_restored: "回收站恢复",
};
export const fileAreaTypeLabels: Record<string, string> = {
  project_official: "正式文件",
  project_cache: "对话缓存",
  project_outputs: "沙箱产物",
};
export const documentChangeSources: Record<string, string> = {
  ui: "界面",
  mcp: "MCP",
  agent: "Agent",
  system: "系统",
};
export const documentChangeActions = Object.entries(documentChangeLabels);

export function fileLabel(version: LibraryVersion) {
  return fileDisplayName(version);
}

export function isUnversionedArea(kind: string | null) {
  return kind === "project_official" || kind === "project_cache";
}

export function documentStatusLabel(version: LibraryVersion, area: string | null) {
  if (
    area === "project_official" ||
    version.review === "confirmed" ||
    version.review === "approved"
  )
    return "已确认";
  if (area === "project_cache" || area === "project_outputs") return "草稿";
  if (version.review === "changes_requested") return "需要修改";
  return "待确认";
}

export function officialTitleWithVersion(name: string, versionNumber: string) {
  const raw = name.trim() || "文档";
  const base = raw.replace(/\s+v\d+$/i, "").trim() || raw;
  return `${base} v${versionNumber}`.slice(0, 160);
}

export function recyclePathNodes(item: LibraryVersion) {
  const value = item.recycle_path;
  const rows =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return [];
          }
        })()
      : value;
  return Array.isArray(rows) ? rows.filter((node) => node?.name) : [];
}

export function recyclePathLabel(item: LibraryVersion, folders: LibraryFolder[]) {
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

export const ROOT_DISPLAY_ORDER = [...LIBRARY_ROOT_KINDS];
export const ROOT_LABELS: Record<(typeof LIBRARY_ROOT_KINDS)[number], string> = {
  project_official: "正式文件",
  project_outputs: "沙箱产物",
  project_cache: "对话缓存",
  project_miniprogram: "小程序",
};
export const ROOT_GUIDES: Record<(typeof LIBRARY_ROOT_KINDS)[number], string> = {
  project_official:
    "项目的正式资料库。成员可以在这里上传、建文件夹、整理和归档确认后的文件；对话缓存和沙箱产物经确认后，也可以另存进来作为正式版本。",
  project_outputs:
    "小祥在沙箱里生成、修改并发布的成果。对话框附件不会进这里。成员可以预览、下载、确认，或把已确认版本另存为正式文件。",
  project_cache:
    "对话框或连接器随消息上传的临时资料，按日期放进子文件夹。对小祥只读，改完应另存为沙箱产物；确认后也可以另存为正式文件。",
  project_miniprogram:
    "小程序全栈工作区。固定包含小程序源文件、小程序 Web 产物、PC 管理后台和云函数四个子目录；源码可在此预览，也可交给 Dimina 编译后在「CloudBase」面板实时运行。",
};

export const CODE_LIBRARY_ROOT_ID = "code-library-root";
export const CODE_LIBRARY_ROOT_NAME = "连接器";
export const CODE_LIBRARY_GUIDE =
  "连接器是平台能力；勾选的仓库是本项目范围。此处仅展示连接与范围状态，不浏览源码内容。鉴权走平台连接器令牌。小祥与子 Agent 在需要时可只读查阅。";

export type CodeConnectorState = {
  kind: "github" | "yunxiao";
  enabled: boolean;
  hasToken: boolean;
  tokenHint: string | null;
  organizationId?: string | null;
};

export type CodeRemoteState = {
  id: string;
  platform?: "github" | "yunxiao" | null;
  label: string;
  remoteUrl: string;
};

export type CodeLibraryConfig = {
  connectors: { github: CodeConnectorState; yunxiao: CodeConnectorState };
  remotes: CodeRemoteState[];
};

export type CodeLibraryNode =
  | {
      type: "connector";
      id: string;
      platform: "github" | "yunxiao";
      name: string;
      lines: string[];
      remotes: Array<{ id: string; name: string; lines: string[] }>;
    }
  | { type: "orphan"; id: string; name: string; lines: string[] };

export const CODE_PLATFORM_LABELS = { github: "GitHub", yunxiao: "云效 Codeup" } as const;
export const CODE_PLATFORM_ICONS = { github: "github", yunxiao: "yunxiao" } as const;

/** Hide Yunxiao organization id prefixes like "60de7a…/group/repo" or "60de7a… / repo". */
export function codeRemoteDisplayName(label: string) {
  const value = String(label || "").trim();
  if (!value) return "未命名仓库";
  const orgId = /^[a-f0-9]{16,}$/i;
  const spaced = value
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (spaced.length > 1 && orgId.test(spaced[0])) return spaced.slice(1).join(" / ");
  const parts = value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1 && orgId.test(parts[0])) return parts.slice(1).join("/");
  return value;
}

export function codeLibraryEntries(config: CodeLibraryConfig | null): CodeLibraryNode[] {
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
      item?.hasToken
        ? `令牌：已配置${item.tokenHint ? `（${item.tokenHint}）` : ""}`
        : "令牌：未配置",
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

export function documentSourceLabel(item: LibraryVersion, folders: LibraryFolder[]) {
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

export function formatVersionCode(createdAt?: string, fallback?: number) {
  if (!createdAt) return fallback == null ? "—" : String(fallback);
  const value = createdAt.includes("T") ? createdAt : createdAt.replace(" ", "T") + "Z";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback == null ? "—" : String(fallback);
  const pad = (part: number) => String(part).padStart(2, "0");
  return (
    String(date.getFullYear() % 100).padStart(2, "0") +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

export function versionCodeForRows(version: LibraryVersion, rows: LibraryVersion[]) {
  const batchRows = version.batch_id
    ? rows.filter((row) => row.batch_id === version.batch_id)
    : [version];
  const earliest = batchRows
    .map((row) => row.created_at)
    .filter((value): value is string => Boolean(value))
    .sort()[0];
  return formatVersionCode(earliest || version.created_at, version.version);
}

export const DOCUMENT_TREE_STATE_KEY = "cothread-document-tree-open";
export const DOCUMENT_TREE_WIDTH_KEY = "cothread-document-tree-width";
export const TREE_WIDTH_DEFAULT = 240;
export const TREE_WIDTH_MIN = 220;
export const TREE_WIDTH_MAX = 560;

export function readStoredBoolean(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

export function readStoredTreeWidth() {
  try {
    const value = Number(localStorage.getItem(DOCUMENT_TREE_WIDTH_KEY));
    if (!Number.isFinite(value)) return TREE_WIDTH_DEFAULT;
    return Math.min(Math.max(Math.round(value), TREE_WIDTH_MIN), TREE_WIDTH_MAX);
  } catch {
    return TREE_WIDTH_DEFAULT;
  }
}

export const DEFAULT_OFFICIAL_FOLDER_NAME = "新建文件夹";

export function suggestOfficialFolderName(_parentId?: string, _folders?: LibraryFolder[]) {
  return DEFAULT_OFFICIAL_FOLDER_NAME;
}

export function resolveLibraryRoot(
  kind: (typeof LIBRARY_ROOT_KINDS)[number],
  folders: LibraryFolder[],
): LibraryFolder | undefined {
  const modern = folders.find((f) => f.folder_kind === kind && !f.thread_id && !f.parent_id);
  if (modern) return modern;
  if (kind === "project_official")
    return folders.find((f) => f.folder_kind === "project_official" && !f.parent_id);
  return undefined;
}

export function isInProjectLibrary(folderId: string | null | undefined, folders: LibraryFolder[]) {
  return folderRootKind(folderId, folders) !== null;
}

export function isLibraryTreeVersion(item: LibraryVersion, folders: LibraryFolder[]) {
  if (isInProjectLibrary(item.folder_id, folders)) return true;
  return Boolean(item.deleted_at && (item.recycle_path || !item.folder_id));
}

export function organizableDocuments(versions: LibraryVersion[], folders: LibraryFolder[]) {
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
    if (item.deleted_at || !item.folder_id || !officialFolderIds.has(item.folder_id)) continue;
    const prev = latest.get(item.artifact_id);
    if (!prev || item.version > prev.version) latest.set(item.artifact_id, item);
  }
  return [...latest.values()];
}
