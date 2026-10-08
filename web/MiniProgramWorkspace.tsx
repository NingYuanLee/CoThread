import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { readJsonResponse } from "../shared/json-response.js";
import { UiIcon, type UiIconName } from "./ui-icon";
import { DialogClose, ModalBackdrop } from "./dialog-fx";
import {
  DatabaseFilterBuilder,
  databaseFilterCount,
  type DatabaseFilterSpec,
} from "./DatabaseFilterBuilder";
import { showTip } from "./Tip";
import {
  MiniProgramDeviceShell,
  PREVIEW_DEFAULT_DEVICE_ID,
  PREVIEW_DEVICES,
  PREVIEW_ZOOM_OPTIONS,
  findPreviewDevice,
} from "./MiniProgramDeviceShell";
import "./miniprogram.css";

export const MINIPROGRAM_TABS = [
  { id: "preview", label: "Dimina预览", icon: "smartphone" },
  { id: "admin", label: "Admin预览", icon: "monitor" },
  { id: "database", label: "云数据库", icon: "layers" },
  { id: "storage", label: "云存储", icon: "folder" },
  { id: "server", label: "云函数", icon: "server" },
  { id: "deploy", label: "生产发布", icon: "upload" },
] as const;

export type MiniProgramTabId = (typeof MINIPROGRAM_TABS)[number]["id"];

type MiniProgramConfig = {
  enabled: boolean;
  appId: string | null;
  appName: string | null;
  status: string;
  cloudbaseEnvs: Partial<Record<"development" | "production", { envId: string }>>;
  adminDeploy: {
    target: "cloudbase_static";
    environment: "production";
    hostingPath: string;
  } | null;
  lastVerifiedAt: string | null;
  secrets: Record<string, { configured: boolean; hint: string | null }>;
};

const TAB_STATE_KEY = "cothread-miniprogram-tab";
const PREVIEW_VIEW_KEY = "cothread-miniprogram-preview-view";
const ADMIN_VIEW_KEY = "cothread-miniprogram-admin-view";

type PreviewViewState = { deviceId: string; zoom: string };

type StorageFile = {
  key: string;
  fileId: string | null;
  size: number;
  lastModified: string | null;
  isDirectory: boolean;
};

function normalizedStoragePath(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function joinStoragePath(...parts: string[]) {
  return parts.map(normalizedStoragePath).filter(Boolean).join("/");
}

function storageFileName(key: string) {
  const normalized = key.replace(/\/+$/, "");
  return normalized.split("/").pop() || normalized;
}

function formatStorageSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function fileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error(`读取 ${file.name} 失败`));
    reader.readAsDataURL(file);
  });
}

/**
 * 记住上次选的机型与缩放（按项目）。localStorage 在隐私模式/被禁用时会抛错，
 * 这里静默降级为「不记忆」，不影响预览本身。
 */
function readStoredPreviewView(projectId: string): PreviewViewState | null {
  try {
    const raw = localStorage.getItem(`${PREVIEW_VIEW_KEY}:${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PreviewViewState>;
    return {
      deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : "",
      zoom: typeof parsed.zoom === "string" ? parsed.zoom : "",
    };
  } catch {
    return null;
  }
}

function storePreviewView(projectId: string, view: PreviewViewState) {
  try {
    localStorage.setItem(`${PREVIEW_VIEW_KEY}:${projectId}`, JSON.stringify(view));
  } catch {
    /* 忽略：仅退化为不记忆 */
  }
}

type AdminDeviceMode = "desktop" | "mobile";

type AdminPreviewViewState = {
  deviceMode: AdminDeviceMode;
  deviceId: string;
  zoom: string;
};

/**
 * Admin 预览的设备模式单独一份（`ADMIN_VIEW_KEY`），与 Dimina 预览互不覆盖：
 * 后台是桌面应用，多数时候要看「电脑模式」，不该被 Dimina 那边的机型选择带走。
 */
function readStoredAdminView(projectId: string): AdminPreviewViewState | null {
  try {
    const raw = localStorage.getItem(`${ADMIN_VIEW_KEY}:${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminPreviewViewState>;
    return {
      deviceMode: parsed.deviceMode === "mobile" ? "mobile" : "desktop",
      deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : "",
      zoom: typeof parsed.zoom === "string" ? parsed.zoom : "",
    };
  } catch {
    return null;
  }
}

function storeAdminView(projectId: string, view: AdminPreviewViewState) {
  try {
    localStorage.setItem(`${ADMIN_VIEW_KEY}:${projectId}`, JSON.stringify(view));
  } catch {
    /* 忽略：仅退化为不记忆 */
  }
}

function readStoredTab(projectId: string): MiniProgramTabId {
  try {
    const raw = localStorage.getItem(`${TAB_STATE_KEY}:${projectId}`);
    const known = MINIPROGRAM_TABS.some((tab) => tab.id === raw);
    return known ? (raw as MiniProgramTabId) : "preview";
  } catch {
    return "preview";
  }
}

function PendingPanel({
  title,
  detail,
  icon,
}: {
  title: string;
  detail: string;
  icon: UiIconName;
}) {
  return (
    <div className="miniprogram-panel-pending">
      <UiIcon name={icon} size={18} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

/**
 * Dimina预览页把微信发布 / 发布记录收进弹窗，这里统一弹窗外壳：
 * 标题 + 关闭按钮 + 可滚动正文，视觉沿用文档库的 library-organize-dialog。
 */
function WorkspaceDialog({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const titleId = useId();
  return (
    <ModalBackdrop className="library-organize-backdrop" onClose={onClose}>
      {(close) => (
        <section
          className={`library-organize-dialog miniprogram-dialog ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <header>
            <h3 id={titleId}>{title}</h3>
            <DialogClose onClick={close} label={`关闭${title}`} />
          </header>
          <div className="miniprogram-dialog-body">{children}</div>
        </section>
      )}
    </ModalBackdrop>
  );
}

type AdminServer = {
  id: string;
  port: number | null;
  status: "starting" | "running" | "failed" | "stopped";
  error: string | null;
  proxyBase: string;
  lastActivityAt: string | null;
};

type AdminServerList = { servers: AdminServer[]; activeId: string | null };

const ADMIN_STATUS_LABELS: Record<AdminServer["status"], string> = {
  starting: "启动中",
  running: "运行中",
  failed: "启动失败",
  stopped: "已停止",
};

const ADMIN_STATUS_TONES: Record<AdminServer["status"], string> = {
  starting: "warning",
  running: "ok",
  failed: "failed",
  stopped: "muted",
};

type CloudbaseEnvInfo = {
  kind: string;
  label: string;
  envId: string | null;
  region: string | null;
  configured: boolean;
  inherited: boolean;
  agentAllowed: boolean;
};

type DeploymentRow = {
  id: string;
  target: string;
  environment: string;
  status: string;
  version: string | null;
  url: string | null;
  publishedAt: string | null;
  createdAt: string | null;
};

type CloudbaseTimer = {
  name: string;
  type: "timer";
  schedule: string;
  enabled: boolean;
};

type CloudbaseFunction = {
  id: string | null;
  name: string;
  description: string | null;
  runtime: string | null;
  status: string;
  statusDetail: string | null;
  type: string | null;
  handler: string | null;
  modifiedAt: string | null;
  createdAt: string | null;
  timers: CloudbaseTimer[];
};

const TABLE_PAGE_SIZE = 20;
const TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function TablePagination({
  page,
  pageSize,
  total,
  hasNext,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number | null;
  hasNext: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages =
    total === null
      ? Math.max(1, page + (hasNext ? 2 : 1))
      : Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="miniprogram-table-pagination" aria-label="表格分页">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPageChange(Math.max(0, page - 1))}
      >
        上一页
      </button>
      <span>
        共 {total === null ? "—" : total} 条 · 每页 {pageSize} 条 · 第 {page + 1} / {totalPages} 页
      </span>
      <label className="miniprogram-table-page-size">
        <span>每页</span>
        <select
          aria-label="每页条数"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {TABLE_PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span>条</span>
      </label>
      <button type="button" disabled={!hasNext} onClick={() => onPageChange(page + 1)}>
        下一页
      </button>
    </nav>
  );
}

const DEPLOY_TARGET_LABELS: Record<string, string> = {
  wechat_preview: "开发版预览",
  wechat_upload: "体验版上传",
  cloudbase_static: "Admin 静态托管",
  cloudbase_function: "云函数",
};

const DEVELOPMENT_ENVIRONMENT = "development";
type DatabaseEnvironment = "development" | "production";

function databaseCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function adminHostingUrl(row: DeploymentRow): string | null {
  if (
    row.environment !== "production" ||
    row.status !== "succeeded" ||
    row.target !== "cloudbase_static" ||
    !row.url
  )
    return null;
  try {
    const parsed = new URL(row.url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function DeploymentRecordList({
  rows,
  openDeploymentId,
  deploymentLog,
  emptyText,
  onOpen,
}: {
  rows: DeploymentRow[];
  openDeploymentId: string;
  deploymentLog: string;
  emptyText: string;
  onOpen: (id: string) => void;
}) {
  if (!rows.length) return <p className="muted miniprogram-note">{emptyText}</p>;
  return (
    <ul className="miniprogram-deploy-list">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="miniprogram-deploy-row">
            <button type="button" onClick={() => onOpen(row.id)}>
              <span
                className={`miniprogram-status ${row.status === "succeeded" ? "ok" : "failed"}`}
              >
                {row.status === "succeeded" ? "成功" : "失败"}
              </span>
              <span className="miniprogram-deploy-target">
                {DEPLOY_TARGET_LABELS[row.target] || row.target}
              </span>
              <span className="miniprogram-deploy-version">{row.version || "—"}</span>
              <span className="muted">{row.publishedAt || row.createdAt || ""}</span>
            </button>
            {adminHostingUrl(row) ? (
              <a
                className="miniprogram-deploy-url"
                href={adminHostingUrl(row)!}
                target="_blank"
                rel="noreferrer"
                title={`在新标签打开 ${adminHostingUrl(row)}`}
              >
                <UiIcon name="globe" size={13} />
                <span>{adminHostingUrl(row)}</span>
              </a>
            ) : null}
          </div>
          {openDeploymentId === row.id ? (
            <pre className="miniprogram-doc-result">{deploymentLog}</pre>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** `server/release-requests.js` 的 publicRow 形状。 */
type ReleaseRequest = {
  id: string;
  applicationId: string;
  target: string;
  targetLabel: string;
  environment: string;
  version: string | null;
  resourceName: string | null;
  releaseNote: string | null;
  sourceHash: string;
  status: string;
  statusLabel: string;
  requestedBy: string;
  requestedByKind: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  deploymentId: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ReleaseApplication = {
  id: string;
  status: string;
  statusLabel: string;
  requestedBy: string;
  requestedByKind: string;
  releaseNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  sourceChanged: boolean;
  items: ReleaseRequest[];
};

const RELEASE_STATUS_TONES: Record<string, string> = {
  pending: "warning",
  approved: "ok",
  executing: "warning",
  succeeded: "ok",
  failed: "failed",
  rejected: "muted",
  cancelled: "muted",
  expired: "failed",
  partial: "warning",
};

function releaseStatusTone(status: string): string {
  return RELEASE_STATUS_TONES[status] || "muted";
}

const loadedRuntimeStyles = new Set<string>();

function ensureRuntimeStyle(href: string) {
  if (!href || loadedRuntimeStyles.has(href)) return;
  loadedRuntimeStyles.add(href);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

type DiminaContainer = {
  openApp?: (options: Record<string, unknown>) => Promise<void> | void;
  closeApp?: () => void;
  destroy?: () => void;
};

type DiminaRuntimeModule = {
  createContainer: (options: Record<string, unknown>) => DiminaContainer;
};

type DiminaRuntimeHolder = { url: string; module: DiminaRuntimeModule };

const RUNTIME_LOADER_URL = "/dimina/loader.js";

/**
 * Dimina 运行时不在 Vite 的模块图里。
 *
 * 它必须放在 `public/`（生产构建原样复制；且容器内部用
 * `new URL("./service.js", import.meta.url)` 推导 worker 路径，必须与
 * service.js / pageFrame.* 同目录）。而 Vite 明确禁止从源码 import() `public/`
 * 里的文件——直接 import 会得到 500「should not be imported from source code」。
 * 所以改为按 URL 加载一个静态 ESM 加载器，由它把运行时挂到全局。
 */
function loadDiminaRuntime(): Promise<DiminaRuntimeModule> {
  const holder = () =>
    (globalThis as { __COTHREAD_DIMINA__?: DiminaRuntimeHolder }).__COTHREAD_DIMINA__;
  const ready = holder();
  if (ready?.module) return Promise.resolve(ready.module);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = RUNTIME_LOADER_URL;
    script.onload = () => {
      const loaded = holder();
      if (loaded?.module?.createContainer) resolve(loaded.module);
      else reject(new Error("小程序运行时未导出 createContainer"));
    };
    script.onerror = () => reject(new Error(`无法加载小程序运行时：${RUNTIME_LOADER_URL}`));
    document.head.appendChild(script);
  });
}

type PreviewMeta = {
  appId: string | null;
  entryPage: string | null;
  enabled: boolean;
  sourceHash: string | null;
  sourceFileCount: number;
  build: { id: string; status: string; errorCode: string | null; finishedAt: string | null } | null;
  runnable: boolean;
  stale: boolean;
  runtime: {
    moduleUrl: string;
    styleUrl: string;
    pageFrameUrl: string;
    resourceBaseUrl: string;
  };
};

function formatBuildTime(value: string | null | undefined) {
  if (!value) return "尚未编译";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Mounts the vendored Dimina Web container. The runtime module is loaded at
 * runtime (not bundled) because it ships as static assets under /dimina and
 * resolves its logic worker relative to its own module URL.
 */
function PreviewCanvas({ meta, projectId }: { meta: PreviewMeta; projectId: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<{ destroy?: () => void } | null>(null);
  const [state, setState] = useState<"loading" | "running" | "error">("loading");
  const [error, setError] = useState("");
  const storedView = useMemo(() => readStoredPreviewView(projectId), [projectId]);
  const [deviceId, setDeviceId] = useState(() =>
    PREVIEW_DEVICES.some((item) => item.id === storedView?.deviceId)
      ? (storedView?.deviceId as string)
      : PREVIEW_DEFAULT_DEVICE_ID,
  );
  const [zoomMode, setZoomMode] = useState(() =>
    PREVIEW_ZOOM_OPTIONS.some((option) => option.value === storedView?.zoom)
      ? (storedView?.zoom as string)
      : "fit",
  );
  useEffect(() => {
    storePreviewView(projectId, { deviceId, zoom: zoomMode });
  }, [projectId, deviceId, zoomMode]);

  const device = findPreviewDevice(deviceId);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let cancelled = false;
    setState("loading");
    setError("");
    void (async () => {
      try {
        ensureRuntimeStyle(meta.runtime.styleUrl);
        const mod = await loadDiminaRuntime();
        if (cancelled) return;
        const container = mod.createContainer({
          mount,
          resourceBaseUrl: meta.runtime.resourceBaseUrl,
          pageFrameUrl: meta.runtime.pageFrameUrl,
          // The workspace lives inside the CoThread shell; never let the
          // container rewrite the host address bar.
          urlSync: false,
          onAppLaunchError: (cause: unknown) => {
            if (cancelled) return;
            setError(cause instanceof Error ? cause.message : String(cause));
            setState("error");
          },
        });
        containerRef.current = container;
        if (typeof container.openApp !== "function") {
          throw new Error("小程序运行时缺少 openApp");
        }
        await container.openApp({
          appId: meta.appId || "",
          path: meta.entryPage || undefined,
          destroy: true,
        });
        if (cancelled) return;
        setState("running");
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "小程序运行失败");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
      try {
        containerRef.current?.destroy?.();
      } catch {}
      containerRef.current = null;
      mount.replaceChildren();
    };
  }, [
    meta.appId,
    meta.entryPage,
    meta.build?.id,
    // 换机型要重建容器，否则容器仍按旧视口尺寸初始化。
    device.id,
    meta.runtime.moduleUrl,
    meta.runtime.pageFrameUrl,
    meta.runtime.resourceBaseUrl,
    meta.runtime.styleUrl,
  ]);

  return (
    <MiniProgramDeviceShell
      deviceId={deviceId}
      onDeviceIdChange={setDeviceId}
      zoomMode={zoomMode}
      onZoomModeChange={setZoomMode}
      notice={
        state === "error" ? (
          <p className="miniprogram-config-error">{error || "小程序启动失败"}</p>
        ) : null
      }
    >
      <div className="miniprogram-canvas" ref={mountRef} />
    </MiniProgramDeviceShell>
  );
}

export function MiniProgramWorkspace({
  projectId,
  request,
  writable,
  currentUserId,
  owner,
}: {
  projectId: string;
  request: (path: string, options?: RequestInit) => Promise<Response>;
  writable: boolean;
  currentUserId: string;
  owner: boolean;
}) {
  const [tab, setTab] = useState<MiniProgramTabId>(() => readStoredTab(projectId));
  const [config, setConfig] = useState<MiniProgramConfig | null>(null);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<PreviewMeta | null>(null);
  const [openAction, setOpenAction] = useState<"wechat" | "records" | null>(null);
  const [refreshMenuOpen, setRefreshMenuOpen] = useState(false);
  const refreshMenuRef = useRef<HTMLDivElement>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [adminServers, setAdminServers] = useState<AdminServer[]>([]);
  const [adminActiveId, setAdminActiveId] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminFrameKey, setAdminFrameKey] = useState(0);
  const adminFrameRef = useRef<HTMLIFrameElement>(null);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminProductionPath, setAdminProductionPath] = useState("/admin/");
  const [adminDeviceMode, setAdminDeviceMode] = useState<AdminDeviceMode>(
    () => readStoredAdminView(projectId)?.deviceMode ?? "desktop",
  );
  const [adminDeviceId, setAdminDeviceId] = useState(() => {
    const stored = readStoredAdminView(projectId)?.deviceId || "";
    return PREVIEW_DEVICES.some((item) => item.id === stored) ? stored : PREVIEW_DEFAULT_DEVICE_ID;
  });
  const [adminZoomMode, setAdminZoomMode] = useState(() => {
    const stored = readStoredAdminView(projectId)?.zoom || "";
    return PREVIEW_ZOOM_OPTIONS.some((option) => option.value === stored) ? stored : "fit";
  });
  const [serverFunctions, setServerFunctions] = useState<CloudbaseFunction[]>([]);
  const [releaseFunctions, setReleaseFunctions] = useState<CloudbaseFunction[]>([]);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [functionEnvironment, setFunctionEnvironment] =
    useState<DatabaseEnvironment>("development");
  const [functionSearch, setFunctionSearch] = useState("");
  const [functionPage, setFunctionPage] = useState(0);
  const [functionPageSize, setFunctionPageSize] = useState(TABLE_PAGE_SIZE);
  const [timerFunctionName, setTimerFunctionName] = useState("");
  const [timerName, setTimerName] = useState("");
  const [timerSchedule, setTimerSchedule] = useState("");
  const [timerError, setTimerError] = useState("");
  const [timerToDelete, setTimerToDelete] = useState<string | null>(null);
  const [timerEditorOpen, setTimerEditorOpen] = useState(false);
  const [timerEditingName, setTimerEditingName] = useState<string | null>(null);
  const [cbEnvironments, setCbEnvironments] = useState<CloudbaseEnvInfo[]>([]);
  const [cbEnv, setCbEnv] = useState("development");
  const [dbEnvironment, setDbEnvironment] = useState<DatabaseEnvironment>("development");
  const [dbCollection, setDbCollection] = useState("");
  const [dbFilter, setDbFilter] = useState<DatabaseFilterSpec | null>(null);
  const [dbFilterOpen, setDbFilterOpen] = useState(false);
  const [dbLimit, setDbLimit] = useState(20);
  const [dbPage, setDbPage] = useState(0);
  const [dbHasNext, setDbHasNext] = useState(false);
  const [dbTotal, setDbTotal] = useState<number | null>(null);
  const [dbDocs, setDbDocs] = useState<Array<Record<string, unknown>>>([]);
  const [dbBusy, setDbBusy] = useState(false);
  const [dbError, setDbError] = useState("");
  const [wechatBusy, setWechatBusy] = useState<"preview" | "upload" | null>(null);
  const [wechatError, setWechatError] = useState("");
  const [wechatNotice, setWechatNotice] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [uploadVersion, setUploadVersion] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [openDeploymentId, setOpenDeploymentId] = useState("");
  const [deploymentLog, setDeploymentLog] = useState("");
  const [releaseApplications, setReleaseApplications] = useState<ReleaseApplication[]>([]);
  const [releaseCreateOpen, setReleaseCreateOpen] = useState(false);
  const [releaseDetailId, setReleaseDetailId] = useState("");
  const [releaseSelection, setReleaseSelection] = useState<string[]>([]);
  const [releaseNote, setReleaseNote] = useState("");
  const [releaseBusy, setReleaseBusy] = useState("");
  const [releaseError, setReleaseError] = useState("");
  const [releaseNotice, setReleaseNotice] = useState("");
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [collections, setCollections] = useState<string[]>([]);
  const [storageFiles, setStorageFiles] = useState<StorageFile[]>([]);
  const [browseBusy, setBrowseBusy] = useState<"collections" | "files" | null>(null);
  const [browseError, setBrowseError] = useState("");
  const [browsePath, setBrowsePath] = useState("");
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [storageEnvironment, setStorageEnvironment] = useState<DatabaseEnvironment>("development");
  const [storagePage, setStoragePage] = useState(0);
  const [storagePageSize, setStoragePageSize] = useState(TABLE_PAGE_SIZE);
  const [storageActionBusy, setStorageActionBusy] = useState<"create" | "upload" | "delete" | null>(
    null,
  );
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const storageFileInputRef = useRef<HTMLInputElement>(null);
  const storageFolderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setTab(readStoredTab(projectId)), [projectId]);

  // 切项目时，后台预览的设备模式也要跟着回到该项目上次的选择。
  useEffect(() => {
    const stored = readStoredAdminView(projectId);
    setAdminDeviceMode(stored?.deviceMode ?? "desktop");
    setAdminDeviceId(
      stored && PREVIEW_DEVICES.some((item) => item.id === stored.deviceId)
        ? stored.deviceId
        : PREVIEW_DEFAULT_DEVICE_ID,
    );
    setAdminZoomMode(
      stored && PREVIEW_ZOOM_OPTIONS.some((option) => option.value === stored.zoom)
        ? stored.zoom
        : "fit",
    );
  }, [projectId]);

  useEffect(() => {
    storeAdminView(projectId, {
      deviceMode: adminDeviceMode,
      deviceId: adminDeviceId,
      zoom: adminZoomMode,
    });
  }, [projectId, adminDeviceMode, adminDeviceId, adminZoomMode]);

  useEffect(() => {
    try {
      localStorage.setItem(`${TAB_STATE_KEY}:${projectId}`, tab);
    } catch {}
  }, [projectId, tab]);

  useEffect(() => {
    let alive = true;
    setError("");
    void request(`/api/projects/${projectId}/miniprogram-config`)
      .then((response) => readJsonResponse(response, "小程序配置"))
      .then((value) => {
        if (alive) {
          const next = value as MiniProgramConfig;
          setConfig(next);
          setAdminProductionPath(next.adminDeploy?.hostingPath || "/admin/");
        }
      })
      .catch((cause) => {
        if (alive) setError(cause instanceof Error ? cause.message : "小程序配置读取失败");
      });
    return () => {
      alive = false;
    };
  }, [projectId, request]);

  const enabled = Boolean(config?.enabled);
  const devEnv = config?.cloudbaseEnvs?.development?.envId || null;
  const previewRoute = meta?.entryPage
    ? meta.entryPage.startsWith("/")
      ? meta.entryPage
      : `/${meta.entryPage}`
    : "未设置页面路由";

  useEffect(() => {
    if (!refreshMenuOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!refreshMenuRef.current?.contains(event.target as Node)) {
        setRefreshMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRefreshMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [refreshMenuOpen]);

  const loadMeta = useCallback(async () => {
    const response = await request(`/api/projects/${projectId}/miniprogram/preview-meta`);
    return (await readJsonResponse(response, "小程序预览状态")) as PreviewMeta;
  }, [projectId, request]);

  useEffect(() => {
    let alive = true;
    void loadMeta()
      .then((value) => {
        if (alive) setMeta(value);
      })
      .catch(() => {
        if (alive) setMeta(null);
      });
    return () => {
      alive = false;
    };
  }, [loadMeta, reloadKey]);

  const loadAdminServers = useCallback(async () => {
    setAdminBusy(true);
    setAdminError("");
    try {
      const response = await request(`/api/projects/${projectId}/miniprogram/dev-servers`);
      const data = (await readJsonResponse(response, "后台预览服务")) as AdminServerList;
      setAdminServers(data.servers || []);
      setAdminActiveId(data.activeId || null);
    } catch (cause) {
      setAdminError(cause instanceof Error ? cause.message : "读取后台预览服务失败");
      setAdminServers([]);
    } finally {
      setAdminBusy(false);
    }
  }, [projectId, request]);

  useEffect(() => {
    if (tab !== "admin") return undefined;
    void loadAdminServers();
    return undefined;
  }, [tab, loadAdminServers]);

  useEffect(() => {
    if (
      tab !== "admin" ||
      adminBusy ||
      !adminServers.some((server) => server.status === "starting")
    ) {
      return undefined;
    }
    const timer = window.setTimeout(() => void loadAdminServers(), 2_000);
    return () => window.clearTimeout(timer);
  }, [adminBusy, adminServers, loadAdminServers, tab]);

  useEffect(() => {
    if (tab !== "admin") {
      setAdminDialogOpen(false);
    }
  }, [tab]);

  const loadServerFunctions = useCallback(async () => {
    setServerBusy(true);
    setServerError("");
    try {
      const response = await request(
        `/api/projects/${projectId}/cloudbase/functions?environment=${functionEnvironment}`,
      );
      const data = (await readJsonResponse(response, "云函数列表")) as {
        functions: CloudbaseFunction[];
      };
      setServerFunctions(data.functions || []);
    } catch (cause) {
      setServerFunctions([]);
      setServerError(cause instanceof Error ? cause.message : "读取云函数失败");
    } finally {
      setServerBusy(false);
    }
  }, [functionEnvironment, projectId, request]);

  const loadReleaseFunctions = useCallback(async () => {
    try {
      const response = await request(
        `/api/projects/${projectId}/cloudbase/functions?environment=development`,
      );
      const data = (await readJsonResponse(response, "待发布云函数")) as {
        functions: CloudbaseFunction[];
      };
      setReleaseFunctions(data.functions || []);
    } catch (cause) {
      setReleaseFunctions([]);
      setReleaseError(cause instanceof Error ? cause.message : "读取待发布云函数失败");
    }
  }, [projectId, request]);

  const saveTimer = async (functionName: string) => {
    setServerBusy(true);
    setTimerError("");
    try {
      if (timerEditingName) {
        const deleteResponse = await request(
          `/api/projects/${projectId}/cloudbase/functions/${encodeURIComponent(functionName)}/timers/${encodeURIComponent(timerEditingName)}?environment=${functionEnvironment}`,
          { method: "DELETE" },
        );
        await readJsonResponse(deleteResponse, "更新定时触发器");
      }
      const response = await request(
        `/api/projects/${projectId}/cloudbase/functions/${encodeURIComponent(functionName)}/timers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            environment: functionEnvironment,
            name: timerName,
            schedule: timerSchedule,
          }),
        },
      );
      await readJsonResponse(response, timerEditingName ? "更新定时触发器" : "创建定时任务");
      setTimerEditorOpen(false);
      setTimerEditingName(null);
      setTimerName("");
      setTimerSchedule("");
      await loadServerFunctions();
    } catch (cause) {
      setTimerError(cause instanceof Error ? cause.message : "保存定时触发器失败");
    } finally {
      setServerBusy(false);
    }
  };

  const disableTimer = async (functionName: string, triggerName: string) => {
    setServerBusy(true);
    setTimerError("");
    try {
      const response = await request(
        `/api/projects/${projectId}/cloudbase/functions/${encodeURIComponent(functionName)}/timers/${encodeURIComponent(triggerName)}?environment=${functionEnvironment}`,
        { method: "DELETE" },
      );
      await readJsonResponse(response, "删除定时触发器");
      await loadServerFunctions();
    } catch (cause) {
      setTimerError(cause instanceof Error ? cause.message : "删除定时触发器失败");
    } finally {
      setServerBusy(false);
    }
  };

  const stopAdminServer = async (serverId: string) => {
    setAdminBusy(true);
    setAdminError("");
    try {
      const response = await request(
        `/api/projects/${projectId}/miniprogram/dev-servers/${serverId}`,
        { method: "DELETE" },
      );
      await readJsonResponse(response, "停止后台预览服务");
      await loadAdminServers();
      setAdminDialogOpen(false);
    } catch (cause) {
      setAdminError(cause instanceof Error ? cause.message : "停止失败");
    } finally {
      setAdminBusy(false);
    }
  };

  const startAdminServer = async (serverId?: string) => {
    setAdminBusy(true);
    setAdminError("");
    try {
      const response = await request(`/api/projects/${projectId}/miniprogram/dev-servers/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serverId ? { serverId } : {}),
      });
      await readJsonResponse(response, serverId ? "重启后台预览服务" : "开启后台预览服务");
      setAdminFrameKey((value) => value + 1);
      await loadAdminServers();
      setAdminDialogOpen(false);
    } catch (cause) {
      setAdminError(cause instanceof Error ? cause.message : "启动失败");
    } finally {
      setAdminBusy(false);
    }
  };

  const cbCall = useCallback(
    async (path: string, body: unknown) => {
      const response = await request(`/api/projects/${projectId}/cloudbase/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return await readJsonResponse(response, "CloudBase 操作");
    },
    [projectId, request],
  );

  useEffect(() => {
    if (tab !== "server" && tab !== "database" && tab !== "storage") return undefined;
    let alive = true;
    void request(`/api/projects/${projectId}/cloudbase/environments`)
      .then((response) => readJsonResponse(response, "CloudBase 环境"))
      .then((data: unknown) => {
        if (!alive) return;
        const info = data as {
          environments: CloudbaseEnvInfo[];
          defaultEnvironment: string | null;
        };
        setCbEnvironments(info.environments || []);
        if (info.defaultEnvironment) setCbEnv((current) => current || info.defaultEnvironment!);
      })
      .catch(() => {
        if (alive) setCbEnvironments([]);
      });
    return () => {
      alive = false;
    };
  }, [tab, projectId, request]);

  const runDbQuery = useCallback(
    async (collectionName = dbCollection, filter = dbFilter, page = dbPage, limit = dbLimit) => {
      setDbBusy(true);
      setDbError("");
      try {
        const body: Record<string, unknown> = {
          environment: dbEnvironment,
          collection: collectionName,
          limit,
          skip: page * limit,
        };
        if (filter && databaseFilterCount(filter)) body.filter = filter;
        const result = (await cbCall("databases/query", body)) as {
          documents: Array<Record<string, unknown>>;
          count: number;
          total: number | null;
        };
        setDbDocs(result.documents || []);
        setDbPage(page);
        setDbHasNext((result.documents || []).length >= limit);
        setDbTotal(
          typeof result.total === "number"
            ? result.total
            : result.documents.length < limit
              ? page * limit + result.count
              : null,
        );
      } catch (cause) {
        setDbError(cause instanceof Error ? cause.message : "查询失败");
        setDbDocs([]);
        setDbTotal(null);
      } finally {
        setDbBusy(false);
      }
    },
    [cbCall, dbCollection, dbEnvironment, dbFilter, dbLimit, dbPage],
  );

  const openDocumentCollection = (name: string) => {
    setDbCollection(name);
    setDbPage(0);
    void runDbQuery(name, dbFilter, 0);
  };

  const loadDeployments = useCallback(async () => {
    try {
      const response = await request(`/api/projects/${projectId}/miniprogram/deployments`);
      const data = (await readJsonResponse(response, "发布记录")) as {
        deployments: DeploymentRow[];
      };
      setDeployments(data.deployments || []);
    } catch {
      setDeployments([]);
    }
  }, [projectId, request]);

  useEffect(() => {
    if (tab !== "server") return undefined;
    void Promise.all([loadServerFunctions(), loadDeployments()]);
    return undefined;
  }, [tab, loadServerFunctions, loadDeployments]);

  const loadReleaseApplications = useCallback(async () => {
    try {
      const response = await request(`/api/projects/${projectId}/miniprogram/release-applications`);
      const data = (await readJsonResponse(response, "生产发布申请")) as {
        applications: ReleaseApplication[];
      };
      setReleaseApplications(data.applications || []);
    } catch {
      setReleaseApplications([]);
    }
  }, [projectId, request]);

  const submitReleaseApplication = async () => {
    const items = releaseSelection.map((key) => {
      if (key.startsWith("function:")) {
        return { target: "cloudbase_function", resourceName: key.slice("function:".length) };
      }
      return { target: key.slice("admin:".length) };
    });
    setReleaseBusy("submit");
    setReleaseError("");
    setReleaseNotice("");
    try {
      if (releaseSelection.includes("admin:cloudbase_static")) {
        const configResponse = await request(
          `/api/projects/${projectId}/miniprogram/admin-production`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hostingPath: adminProductionPath.trim() || "/admin/" }),
          },
        );
        const next = (await readJsonResponse(
          configResponse,
          "保存 Admin 生产版配置",
        )) as MiniProgramConfig;
        setConfig(next);
        setAdminProductionPath(next.adminDeploy?.hostingPath || "/admin/");
      }
      const response = await request(
        `/api/projects/${projectId}/miniprogram/release-applications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            environment: "production",
            releaseNote: releaseNote.trim() || undefined,
          }),
        },
      );
      await readJsonResponse(response, "提交生产发布申请");
      setReleaseSelection([]);
      setReleaseNote("");
      setReleaseCreateOpen(false);
      await loadReleaseApplications();
      showTip(`已提交包含 ${items.length} 个目标的生产发布申请`);
    } catch (cause) {
      setReleaseError(cause instanceof Error ? cause.message : "提交发布申请失败");
      await loadReleaseApplications();
    } finally {
      setReleaseBusy("");
    }
  };

  const cancelReleaseApplication = async (application: ReleaseApplication) => {
    setReleaseBusy(`cancel:${application.id}`);
    setReleaseError("");
    setReleaseNotice("");
    try {
      const response = await request(
        `/api/projects/${projectId}/miniprogram/release-applications/${application.id}/cancel`,
        { method: "POST" },
      );
      await readJsonResponse(response, "放弃生产发布");
      setReleaseNotice("已放弃本次生产发布");
      await loadReleaseApplications();
    } catch (cause) {
      setReleaseError(cause instanceof Error ? cause.message : "放弃生产发布失败");
      await loadReleaseApplications();
    } finally {
      setReleaseBusy("");
    }
  };

  /** 一个申请整批批准或拒绝；每个目标保留独立执行结果。 */
  const decideReleaseApplication = async (
    application: ReleaseApplication,
    action: "approve" | "reject",
  ) => {
    const reason = rejectReason.trim();
    if (action === "reject" && !reason) {
      setReleaseError("拒绝必须填写理由。");
      return;
    }
    setReleaseBusy(`${action}:${application.id}`);
    setReleaseError("");
    setReleaseNotice("");
    try {
      const response = await request(
        `/api/projects/${projectId}/miniprogram/release-applications/${application.id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action === "reject" ? { reason } : {}),
        },
      );
      const data = (await readJsonResponse(
        response,
        action === "approve" ? "批准发布申请" : "拒绝发布申请",
      )) as Partial<ReleaseApplication> | null;
      const label = application.items
        .map((item) => item.resourceName || item.targetLabel)
        .join("、");
      setReleaseNotice(
        action === "approve"
          ? `已批准并执行：${label}${data?.statusLabel ? `（当前状态：${data.statusLabel}）` : ""}`
          : `已拒绝：${label}`,
      );
      setRejectingId("");
      setRejectReason("");
      await loadReleaseApplications();
      await loadDeployments();
    } catch (cause) {
      setReleaseError(
        cause instanceof Error ? cause.message : action === "approve" ? "批准失败" : "拒绝失败",
      );
      // 失败也可能已经改变了服务端状态（例如源码变更导致作废），所以照常刷新。
      await loadReleaseApplications();
      await loadDeployments();
    } finally {
      setReleaseBusy("");
    }
  };

  useEffect(() => {
    if (tab !== "preview" && tab !== "deploy") return undefined;
    void loadDeployments();
    return undefined;
  }, [tab, loadDeployments]);

  useEffect(() => {
    if (tab !== "deploy") return undefined;
    void Promise.all([loadReleaseApplications(), loadReleaseFunctions()]);
    return undefined;
  }, [tab, loadReleaseApplications, loadReleaseFunctions]);

  const generateWechatPreview = async () => {
    setWechatBusy("preview");
    setWechatError("");
    setWechatNotice("");
    try {
      const response = await request(`/api/projects/${projectId}/miniprogram/wechat/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await readJsonResponse(response, "微信预览")) as {
        qrcodeBase64: string | null;
        qrcodeMime: string | null;
        desc: string;
        projectConfigSynthesized: boolean;
      };
      setQrDataUrl(
        data.qrcodeBase64
          ? `data:${data.qrcodeMime || "image/png"};base64,${data.qrcodeBase64}`
          : "",
      );
      setWechatNotice(
        data.qrcodeBase64
          ? `已生成开发版预览二维码（${data.desc}）${data.projectConfigSynthesized ? "；项目内无 project.config.json，已按项目配置合成" : ""}`
          : "微信返回成功但未取到二维码图片，请查看发布记录日志",
      );
      await loadDeployments();
    } catch (cause) {
      setWechatError(cause instanceof Error ? cause.message : "生成预览失败");
      setQrDataUrl("");
      await loadDeployments();
    } finally {
      setWechatBusy(null);
    }
  };

  const uploadWechatVersion = async () => {
    if (!writable) return;
    setWechatBusy("upload");
    setWechatError("");
    setWechatNotice("");
    try {
      const response = await request(`/api/projects/${projectId}/miniprogram/wechat/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: uploadVersion, desc: uploadDesc }),
      });
      const data = (await readJsonResponse(response, "微信上传")) as { version: string };
      setWechatNotice(`已上传版本 ${data.version}，可在微信后台提交审核`);
      setUploadVersion("");
      await loadDeployments();
    } catch (cause) {
      setWechatError(cause instanceof Error ? cause.message : "上传失败");
      await loadDeployments();
    } finally {
      setWechatBusy(null);
    }
  };

  const openDeployment = async (id: string) => {
    if (openDeploymentId === id) {
      setOpenDeploymentId("");
      setDeploymentLog("");
      return;
    }
    setOpenDeploymentId(id);
    setDeploymentLog("正在读取…");
    try {
      const response = await request(`/api/projects/${projectId}/miniprogram/deployments/${id}`);
      const data = (await readJsonResponse(response, "发布记录详情")) as { log: string };
      setDeploymentLog(data.log || "（无日志）");
    } catch (cause) {
      setDeploymentLog(cause instanceof Error ? cause.message : "读取失败");
    }
  };

  const loadCollections = useCallback(async () => {
    setBrowseBusy("collections");
    setBrowseError("");
    try {
      const response = await request(
        `/api/projects/${projectId}/cloudbase/collections?environment=${dbEnvironment}`,
      );
      const data = (await readJsonResponse(response, "集合列表")) as { collections: string[] };
      const nextCollections = data.collections || [];
      setCollections(nextCollections);
      if (nextCollections.length) {
        const nextCollection = nextCollections.includes(dbCollection)
          ? dbCollection
          : nextCollections[0];
        setDbCollection(nextCollection);
        await runDbQuery(nextCollection, dbFilter, 0);
      } else {
        setDbCollection("");
        setDbDocs([]);
      }
    } catch (cause) {
      setBrowseError(cause instanceof Error ? cause.message : "载入集合列表失败");
      setCollections([]);
      setDbCollection("");
      setDbDocs([]);
      setDbPage(0);
      setDbHasNext(false);
      setDbTotal(0);
    } finally {
      setBrowseBusy(null);
    }
  }, [dbEnvironment, projectId, request, runDbQuery]);

  useEffect(() => {
    if (tab !== "database") return undefined;
    void loadCollections();
    return undefined;
  }, [tab, projectId, dbEnvironment]);

  const switchDatabaseEnvironment = (environment: DatabaseEnvironment) => {
    if (environment === dbEnvironment) return;
    setCollections([]);
    setDbCollection("");
    setDbDocs([]);
    setDbPage(0);
    setDbHasNext(false);
    setDbTotal(null);
    setDbError("");
    setDbEnvironment(environment);
  };

  const browseStorage = async (path = browsePath) => {
    setBrowseBusy("files");
    setBrowseError("");
    try {
      const params = new URLSearchParams({ environment: storageEnvironment });
      if (path.trim()) params.set("path", path.trim());
      const response = await request(
        `/api/projects/${projectId}/cloudbase/storage/files?${params.toString()}`,
      );
      const data = (await readJsonResponse(response, "存储目录")) as {
        files: StorageFile[];
      };
      setBrowsePath(normalizedStoragePath(path));
      setStorageFiles(data.files || []);
      setStoragePage(0);
      setStorageLoaded(true);
    } catch (cause) {
      setBrowseError(cause instanceof Error ? cause.message : "浏览存储目录失败");
      setStorageFiles([]);
      setStorageLoaded(true);
    } finally {
      setBrowseBusy(null);
    }
  };

  useEffect(() => {
    if (tab !== "storage") return;
    void browseStorage(browsePath);
  }, [tab, projectId, storageEnvironment]);

  const createStorageFolder = async () => {
    const name = normalizedStoragePath(newFolderName);
    if (!name || name.includes("/") || name.includes("..")) {
      setBrowseError("文件夹名称不能包含 / 或 ..");
      return;
    }
    setStorageActionBusy("create");
    setBrowseError("");
    try {
      const response = await request(`/api/projects/${projectId}/cloudbase/storage/directory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment: storageEnvironment,
          cloudPath: joinStoragePath(browsePath, name),
        }),
      });
      await readJsonResponse(response, "新建文件夹");
      setNewFolderOpen(false);
      setNewFolderName("");
      await browseStorage(browsePath);
    } catch (cause) {
      setBrowseError(cause instanceof Error ? cause.message : "新建文件夹失败");
    } finally {
      setStorageActionBusy(null);
    }
  };

  const uploadStorageFiles = async (files: FileList | null, keepRelativePath: boolean) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setStorageActionBusy("upload");
    setBrowseError("");
    try {
      for (const file of selected) {
        const relativePath = keepRelativePath
          ? (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
          : file.name;
        const response = await request(`/api/projects/${projectId}/cloudbase/storage/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            environment: storageEnvironment,
            cloudPath: joinStoragePath(browsePath, relativePath),
            contentBase64: await fileAsBase64(file),
          }),
        });
        await readJsonResponse(response, `上传 ${relativePath}`);
      }
      showTip(`已上传 ${selected.length} 个文件`);
      await browseStorage(browsePath);
    } catch (cause) {
      setBrowseError(cause instanceof Error ? cause.message : "上传失败");
    } finally {
      setStorageActionBusy(null);
      if (storageFileInputRef.current) storageFileInputRef.current.value = "";
      if (storageFolderInputRef.current) storageFolderInputRef.current.value = "";
    }
  };

  const deleteStorageEntry = async (file: StorageFile) => {
    if (
      !window.confirm(
        `确定删除${file.isDirectory ? "文件夹" : "文件"}“${storageFileName(file.key)}”吗？`,
      )
    )
      return;
    setStorageActionBusy("delete");
    setBrowseError("");
    try {
      const response = await request(`/api/projects/${projectId}/cloudbase/storage/delete-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment: storageEnvironment,
          cloudPath: file.key,
          isDirectory: file.isDirectory,
        }),
      });
      await readJsonResponse(response, "删除存储项");
      await browseStorage(browsePath);
    } catch (cause) {
      setBrowseError(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setStorageActionBusy(null);
    }
  };

  const storageBreadcrumbs = normalizedStoragePath(browsePath).split("/").filter(Boolean);
  const visibleStorageFiles = storageFiles;
  const pagedStorageFiles = visibleStorageFiles.slice(
    storagePage * storagePageSize,
    (storagePage + 1) * storagePageSize,
  );
  const storageHasNext = (storagePage + 1) * storagePageSize < visibleStorageFiles.length;

  const activeAdminServer =
    adminServers.find((row) => row.id === adminActiveId) ||
    adminServers.find((row) => row.status === "running" || row.status === "starting") ||
    adminServers[0] ||
    null;
  const adminStatusLabel = activeAdminServer
    ? ADMIN_STATUS_LABELS[activeAdminServer.status]
    : "未启动";
  const adminStatusTone = activeAdminServer
    ? ADMIN_STATUS_TONES[activeAdminServer.status]
    : "muted";
  const adminPreviewRunning = activeAdminServer?.status === "running";
  const adminServiceTitle = activeAdminServer
    ? activeAdminServer.status === "running"
      ? "预览服务正在运行"
      : activeAdminServer.status === "starting"
        ? "预览服务正在启动"
        : activeAdminServer.status === "failed"
          ? "预览服务启动失败"
          : "预览服务已停止"
    : "尚未启动预览服务";
  const adminServiceDescription = activeAdminServer
    ? activeAdminServer.status === "running"
      ? "Admin 根目录已通过 CoThread 宿主机提供实时预览。"
      : activeAdminServer.status === "starting"
        ? "服务正在启动，状态就绪后预览会自动显示。"
        : activeAdminServer.status === "failed"
          ? "请检查错误信息后重新启动服务。"
          : "重新开启后可继续预览 Admin 根目录。"
    : "开启服务后即可在当前页签预览 Admin 根目录。";
  const adminPendingTitle = activeAdminServer
    ? activeAdminServer.status === "failed"
      ? "开发服务器启动失败"
      : activeAdminServer.status === "stopped"
        ? "开发服务器已停止"
        : "开发服务器启动中"
    : "还没有 Admin 开发服务器";
  const adminPendingDetail = activeAdminServer
    ? activeAdminServer.error ||
      (activeAdminServer.status === "stopped"
        ? "请重新启动 Admin 开发服务器，并登记新的预览服务。"
        : `L3 需用 --base=${activeAdminServer.proxyBase} 启动开发服务器，再标记为 running。`)
    : "L3 在任务中用 miniprogram_register_admin_preview 登记端口并启动开发服务器后，这里会实时显示管理后台。";
  const selectedReleaseApplication = releaseApplications.find(
    (application) => application.id === releaseDetailId,
  );
  const wechatDeployments = deployments.filter(
    (row) => row.target === "wechat_preview" || row.target === "wechat_upload",
  );
  const adminFrontendDeployments = deployments.filter(
    (row) => row.environment === "production" && row.target === "cloudbase_static",
  );
  const adminProductionAddress =
    adminFrontendDeployments.find((row) => row.status === "succeeded" && row.url)?.url || "";
  const serverDeployments = deployments.filter(
    (row) => row.environment === "production" && row.target === "cloudbase_function",
  );
  const visibleFunctions = serverFunctions.filter((item) =>
    item.name.toLocaleLowerCase().includes(functionSearch.trim().toLocaleLowerCase()),
  );
  const selectedTimerFunction = serverFunctions.find((item) => item.name === timerFunctionName);
  const trimmedTimerName = timerName.trim();
  const trimmedTimerSchedule = timerSchedule.trim();
  const timerNameValid = /^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(trimmedTimerName);
  const timerScheduleValid = trimmedTimerSchedule.split(/\s+/).length === 7;
  const timerNameDuplicate = Boolean(
    selectedTimerFunction?.timers.some((timer) => timer.name === trimmedTimerName),
  );
  const timerLimitReached = (selectedTimerFunction?.timers.length || 0) >= 10;
  const pagedFunctions = visibleFunctions.slice(
    functionPage * functionPageSize,
    (functionPage + 1) * functionPageSize,
  );
  const functionHasNext = (functionPage + 1) * functionPageSize < visibleFunctions.length;
  useEffect(() => {
    setFunctionPage(0);
  }, [functionSearch]);
  const documentColumns = Array.from(
    new Set(dbDocs.flatMap((document) => Object.keys(document))),
  ).slice(0, 7);

  const rebuild = async (force: boolean) => {
    setBuilding(true);
    setBuildError("");
    try {
      const response = await request(`/api/projects/${projectId}/miniprogram/builds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      await readJsonResponse(response, "小程序编译");
      setMeta(await loadMeta());
    } catch (cause) {
      setBuildError(cause instanceof Error ? cause.message : "编译失败");
      try {
        setMeta(await loadMeta());
      } catch {}
    } finally {
      setBuilding(false);
    }
  };

  // Rebuild once automatically when the source hash moves, so the preview
  // follows edits without a manual click. The ref prevents rebuild loops.
  const autoBuiltRef = useRef<string | null>(null);
  useEffect(() => {
    if (tab !== "preview" || !enabled || building) return;
    if (!meta?.stale || !meta.sourceHash) return;
    if (autoBuiltRef.current === meta.sourceHash) return;
    autoBuiltRef.current = meta.sourceHash;
    void rebuild(false);
  }, [tab, enabled, building, meta?.stale, meta?.sourceHash, rebuild]);

  return (
    <div className="miniprogram-workspace">
      <nav className="miniprogram-tabs" aria-label="小程序工作区">
        {MINIPROGRAM_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={tab === item.id ? "active" : ""}
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            <UiIcon name={item.icon} size={13} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div
        className={`miniprogram-tab-body ${
          tab === "preview"
            ? "miniprogram-preview-tab-body"
            : tab === "admin"
              ? "miniprogram-admin-tab-body"
              : tab === "database"
                ? "miniprogram-database-tab-body"
                : tab === "storage"
                  ? "miniprogram-storage-tab-body"
                  : tab === "server"
                    ? "miniprogram-server-tab-body"
                    : ""
        }`}
        role="tabpanel"
      >
        {error ? <p className="miniprogram-config-error">{error}</p> : null}
        {!enabled ? (
          <p className="miniprogram-workspace-notice">
            请在「项目管理 →
            小程序与云开发」完成①②配置，然后运行连接测试；验证通过后工作区会自动开放。
          </p>
        ) : null}

        {tab === "preview" ? (
          <section className="miniprogram-panel miniprogram-preview-panel">
            <div
              className="miniprogram-preview-toolbar"
              role="toolbar"
              aria-label="小程序预览工具栏"
            >
              <div className="miniprogram-preview-refresh" ref={refreshMenuRef}>
                <button
                  type="button"
                  className="miniprogram-preview-icon-button"
                  aria-label="刷新与编译"
                  aria-haspopup="menu"
                  aria-expanded={refreshMenuOpen}
                  title="刷新与编译"
                  disabled={building}
                  onClick={() => setRefreshMenuOpen((value) => !value)}
                >
                  <UiIcon name="refresh" size={14} />
                </button>
                {refreshMenuOpen ? (
                  <div className="miniprogram-preview-refresh-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!enabled || building}
                      onClick={() => {
                        setRefreshMenuOpen(false);
                        void rebuild(false);
                      }}
                    >
                      <UiIcon name="play" size={13} />
                      {building ? "编译中…" : meta?.runnable ? "重新编译" : "编译并预览"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={building}
                      onClick={() => {
                        setRefreshMenuOpen(false);
                        setReloadKey((value) => value + 1);
                      }}
                    >
                      <UiIcon name="refresh" size={13} />
                      重新加载
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={building || !meta?.runnable}
                      onClick={() => {
                        setRefreshMenuOpen(false);
                        void rebuild(true);
                      }}
                    >
                      <UiIcon name="restore" size={13} />
                      强制重新编译
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="miniprogram-preview-route" title={previewRoute}>
                <UiIcon name="code" size={13} />
                <span className="miniprogram-preview-route-path">{previewRoute}</span>
                <span
                  className="miniprogram-preview-build-time"
                  title={meta?.build?.finishedAt || undefined}
                >
                  上次编译：{formatBuildTime(meta?.build?.finishedAt)}
                </span>
              </div>
              <div className="miniprogram-preview-primary-actions">
                <button
                  type="button"
                  className="miniprogram-preview-icon-button"
                  aria-label="微信发布"
                  title="微信发布"
                  onClick={() => setOpenAction("wechat")}
                >
                  <UiIcon name="upload" size={14} />
                </button>
                <button
                  type="button"
                  className="miniprogram-preview-icon-button"
                  aria-label="记录"
                  title="记录"
                  onClick={() => setOpenAction("records")}
                >
                  <UiIcon name="history" size={14} />
                </button>
              </div>
            </div>
            <div className="miniprogram-preview-scroll">
              {buildError ? <p className="miniprogram-config-error">{buildError}</p> : null}
              {meta?.build?.errorCode ? (
                <p className="miniprogram-config-error">上次编译失败（{meta.build.errorCode}）</p>
              ) : null}
              {!enabled ? (
                <PendingPanel
                  icon="smartphone"
                  title="工作区尚未开放"
                  detail="在「项目管理 → 小程序与云开发」完成配置并通过连接测试后，这里会自动开放。"
                />
              ) : meta?.runnable && meta.appId ? (
                <PreviewCanvas
                  key={`${meta.build?.id}-${meta.runtime.moduleUrl}-${reloadKey}`}
                  meta={meta}
                  projectId={projectId}
                />
              ) : (
                <PendingPanel
                  icon="smartphone"
                  title={meta?.build ? "源码已变更，需要重新编译" : "还没有可运行的编译产物"}
                  detail="点击「编译并预览」把「小程序源文件」编译为 Dimina 资源包，随后在此运行。源码仍可在文档树中直接预览。"
                />
              )}
            </div>
            {openAction === "wechat" ? (
              <WorkspaceDialog title="微信发布" onClose={() => setOpenAction(null)}>
                <div className="miniprogram-config-actions">
                  <button
                    type="button"
                    disabled={!enabled || wechatBusy !== null}
                    onClick={() => void generateWechatPreview()}
                  >
                    {wechatBusy === "preview"
                      ? "生成中…"
                      : qrDataUrl
                        ? "重新生成预览二维码"
                        : "生成开发版预览二维码"}
                  </button>
                </div>
                {wechatError ? <p className="miniprogram-config-error">{wechatError}</p> : null}
                {wechatNotice ? <p className="muted miniprogram-note">{wechatNotice}</p> : null}
                {qrDataUrl ? (
                  <div className="miniprogram-qr">
                    <img src={qrDataUrl} alt="微信开发版预览二维码" />
                    <span className="muted">
                      用微信扫码打开开发版；二维码由微信官方 CI 生成，会过期。
                    </span>
                  </div>
                ) : (
                  <p className="muted miniprogram-note">
                    还没有二维码。生成后用微信扫码打开开发版；二维码由微信官方 CI 生成，会过期。
                  </p>
                )}

                <h5>上传体验版</h5>
                {writable ? (
                  <>
                    <div className="miniprogram-field">
                      <span>上传版本号</span>
                      <input
                        type="text"
                        value={uploadVersion}
                        placeholder="1.0.0"
                        autoComplete="off"
                        onChange={(event) => setUploadVersion(event.target.value)}
                      />
                    </div>
                    <div className="miniprogram-field">
                      <span>版本说明</span>
                      <input
                        type="text"
                        value={uploadDesc}
                        placeholder="本次更新内容"
                        autoComplete="off"
                        onChange={(event) => setUploadDesc(event.target.value)}
                      />
                    </div>
                    <div className="miniprogram-config-actions">
                      <button
                        type="button"
                        disabled={wechatBusy !== null || !uploadVersion}
                        onClick={() => void uploadWechatVersion()}
                      >
                        {wechatBusy === "upload" ? "上传中…" : "上传体验版"}
                      </button>
                    </div>
                    <p className="muted miniprogram-note">
                      上传后生成微信体验版，不代表已提交审核；提审与正式发布仍需在微信后台完成。微信还要求调用方
                      IP 在白名单内。
                    </p>
                  </>
                ) : (
                  <p className="muted miniprogram-note">当前账号对该项目只读，无法上传版本。</p>
                )}
              </WorkspaceDialog>
            ) : null}

            {openAction === "records" ? (
              <WorkspaceDialog title="微信小程序发布记录" onClose={() => setOpenAction(null)}>
                <DeploymentRecordList
                  rows={wechatDeployments}
                  openDeploymentId={openDeploymentId}
                  deploymentLog={deploymentLog}
                  emptyText="还没有微信小程序发布记录。"
                  onOpen={(id) => void openDeployment(id)}
                />
              </WorkspaceDialog>
            ) : null}
          </section>
        ) : null}

        {tab === "admin" ? (
          <section className="miniprogram-panel miniprogram-admin-panel">
            <div className="miniprogram-admin-toolbar" role="toolbar" aria-label="Admin预览工具栏">
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                aria-label={adminPreviewRunning ? "重新加载 Admin预览" : "开启 Admin预览服务"}
                title={adminPreviewRunning ? "重新加载" : "开启 Admin预览服务"}
                onClick={() => {
                  if (adminPreviewRunning) {
                    setAdminFrameKey((value) => value + 1);
                    return;
                  }
                  setAdminDialogOpen(true);
                }}
              >
                <UiIcon name={adminPreviewRunning ? "refresh" : "play"} size={14} />
              </button>
              <div
                className="miniprogram-admin-address"
                title={activeAdminServer?.proxyBase || "Admin预览服务未连接"}
              >
                <UiIcon name="globe" size={13} />
                <span>{activeAdminServer?.proxyBase || "Admin预览服务未连接"}</span>
              </div>
              <div className="miniprogram-admin-device-controls" role="group" aria-label="预览设备">
                <button
                  type="button"
                  className={`miniprogram-preview-icon-button${adminDeviceMode === "desktop" ? " is-active" : ""}`}
                  aria-label="电脑模式"
                  aria-pressed={adminDeviceMode === "desktop"}
                  title="电脑模式"
                  disabled={!adminPreviewRunning}
                  onClick={() => setAdminDeviceMode("desktop")}
                >
                  <UiIcon name="monitor" size={14} />
                </button>
                <button
                  type="button"
                  className={`miniprogram-preview-icon-button${adminDeviceMode === "mobile" ? " is-active" : ""}`}
                  aria-label="手机模式"
                  aria-pressed={adminDeviceMode === "mobile"}
                  title="手机模式"
                  disabled={!adminPreviewRunning}
                  onClick={() => setAdminDeviceMode("mobile")}
                >
                  <UiIcon name="smartphone" size={14} />
                </button>
              </div>
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                aria-label="在电脑浏览器中打开"
                title="在电脑浏览器中打开"
                disabled={!adminPreviewRunning}
                onClick={() => {
                  if (!activeAdminServer?.proxyBase) return;
                  window.open(activeAdminServer.proxyBase, "_blank", "noopener,noreferrer");
                }}
              >
                <UiIcon name="share" size={14} />
              </button>
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                aria-label="Admin预览服务"
                title={`Admin预览服务 · ${adminStatusLabel}`}
                onClick={() => setAdminDialogOpen(true)}
              >
                <UiIcon name="server" size={14} />
              </button>
            </div>

            {activeAdminServer?.status === "running" ? (
              adminDeviceMode === "mobile" ? (
                // 手机模式只套机模外壳，不给 iframe 加 sandbox：
                // 同源 cookie、CloudBase 鉴权与 HMR WebSocket 都必须保持可用。
                <MiniProgramDeviceShell
                  deviceId={adminDeviceId}
                  onDeviceIdChange={setAdminDeviceId}
                  zoomMode={adminZoomMode}
                  onZoomModeChange={setAdminZoomMode}
                  deviceAriaLabel="后台预览机型"
                  zoomAriaLabel="后台预览缩放"
                >
                  <iframe
                    ref={adminFrameRef}
                    key={adminFrameKey}
                    className="miniprogram-admin-frame"
                    title="PC 管理后台预览"
                    src={activeAdminServer.proxyBase}
                  />
                </MiniProgramDeviceShell>
              ) : (
                <div className="miniprogram-admin-preview">
                  <iframe
                    ref={adminFrameRef}
                    key={adminFrameKey}
                    className="miniprogram-admin-frame"
                    title="PC 管理后台预览"
                    src={activeAdminServer.proxyBase}
                  />
                </div>
              )
            ) : (
              <div className="miniprogram-admin-preview">
                <PendingPanel
                  icon="monitor"
                  title={adminPendingTitle}
                  detail={adminPendingDetail}
                />
              </div>
            )}

            {adminDialogOpen ? (
              <WorkspaceDialog title="Admin预览服务" onClose={() => setAdminDialogOpen(false)}>
                <section className="miniprogram-admin-service-section">
                  <div className="miniprogram-admin-service-summary">
                    <span className="miniprogram-admin-service-icon" aria-hidden="true">
                      <UiIcon name={adminPreviewRunning ? "online" : "server"} size={16} />
                    </span>
                    <div className="miniprogram-admin-service-summary-copy">
                      <div className="miniprogram-admin-service-head">
                        <div>
                          <span className="miniprogram-admin-service-environment">开发版</span>
                          <h5>{adminServiceTitle}</h5>
                        </div>
                        <span className={`miniprogram-status ${adminStatusTone}`}>
                          {adminStatusLabel}
                        </span>
                      </div>
                      <p className="muted miniprogram-note">{adminServiceDescription}</p>
                    </div>
                  </div>
                  {adminError ? <p className="miniprogram-config-error">{adminError}</p> : null}
                  {activeAdminServer ? (
                    <div className="miniprogram-admin-service-details">
                      <div className="miniprogram-admin-service-address">
                        <span>预览地址</span>
                        <code>{activeAdminServer.proxyBase}</code>
                      </div>
                      <dl className="miniprogram-admin-service-meta">
                        <div>
                          <dt>端口</dt>
                          <dd>{activeAdminServer.port || "—"}</dd>
                        </div>
                        <div>
                          <dt>最近活动</dt>
                          <dd>{activeAdminServer.lastActivityAt || "—"}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : (
                    <div className="miniprogram-admin-service-empty">
                      <strong>当前没有已登记的服务</strong>
                      <span>开启后会在这里显示预览地址和运行信息。</span>
                    </div>
                  )}
                  <div className="miniprogram-admin-service-actions">
                    <div className="miniprogram-config-actions miniprogram-admin-service-primary-actions">
                      <button
                        type="button"
                        className="primary"
                        disabled={adminBusy || !writable}
                        onClick={() => void startAdminServer(activeAdminServer?.id)}
                      >
                        <UiIcon
                          name={activeAdminServer?.status === "running" ? "refresh" : "play"}
                          size={13}
                        />
                        {adminBusy
                          ? "处理中…"
                          : activeAdminServer?.status === "running" ||
                              activeAdminServer?.status === "failed"
                            ? "重启服务"
                            : "开启服务"}
                      </button>
                      <button
                        type="button"
                        disabled={adminBusy}
                        onClick={() => void loadAdminServers()}
                      >
                        <UiIcon name="refresh" size={13} />
                        {adminBusy ? "刷新中…" : "刷新状态"}
                      </button>
                    </div>
                    {activeAdminServer?.status === "running" ? (
                      <div className="miniprogram-admin-service-danger-zone">
                        <div>
                          <strong>停止开发服务</strong>
                          <span>停止后当前 Admin预览将不可访问。</span>
                        </div>
                        <button
                          type="button"
                          className="miniprogram-danger"
                          disabled={adminBusy || !writable}
                          onClick={() => void stopAdminServer(activeAdminServer.id)}
                        >
                          <UiIcon name="stop" size={13} />
                          停止服务
                        </button>
                      </div>
                    ) : null}
                  </div>
                </section>

                {writable ? null : <p className="muted miniprogram-note">当前账号对该项目只读。</p>}
              </WorkspaceDialog>
            ) : null}
          </section>
        ) : null}

        {tab === "server" ? (
          <section className="miniprogram-panel miniprogram-server-panel">
            <div
              className="miniprogram-admin-toolbar miniprogram-function-addressbar"
              role="toolbar"
              aria-label="云函数工具栏"
            >
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                title="刷新云函数"
                aria-label="刷新云函数"
                disabled={serverBusy}
                onClick={() => void Promise.all([loadServerFunctions(), loadDeployments()])}
              >
                <UiIcon name="refresh" size={14} />
              </button>
              <label className="miniprogram-function-search">
                <UiIcon name="search" size={13} />
                <input
                  type="search"
                  value={functionSearch}
                  placeholder="按函数名搜索"
                  aria-label="按函数名搜索云函数"
                  onChange={(event) => setFunctionSearch(event.target.value)}
                />
              </label>
              <div
                className="miniprogram-database-environment"
                role="group"
                aria-label="云函数环境"
              >
                {(["development", "production"] as const).map((environment) => {
                  const info = cbEnvironments.find((item) => item.kind === environment);
                  const selected = functionEnvironment === environment;
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
                      disabled={serverBusy || unavailable}
                      onClick={() => {
                        if (selected) return;
                        setFunctionEnvironment(environment);
                        setFunctionPage(0);
                        setTimerFunctionName("");
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {serverError ? <p className="miniprogram-config-error">{serverError}</p> : null}
            <div className="miniprogram-table-content miniprogram-server-content">
              <section className="miniprogram-server-functions" aria-label="云函数列表">
                {pagedFunctions.length ? (
                  <div className="miniprogram-function-table-wrap">
                    <table className="miniprogram-function-table">
                      <thead>
                        <tr>
                          <th>函数名</th>
                          <th>描述</th>
                          <th title="函数运行环境，例如 Nodejs20.19、Python3.10">运行时</th>
                          <th>函数类型</th>
                          <th>处理器路径</th>
                          <th>状态</th>
                          <th>更新时间</th>
                          <th>定时任务</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedFunctions.map((item) => {
                          const publishedToProduction = serverDeployments.some(
                            (row) =>
                              row.environment === "production" &&
                              row.status === "succeeded" &&
                              row.version === item.name,
                          );
                          return (
                            <tr key={item.name}>
                              <td className="miniprogram-function-name">{item.name}</td>
                              <td className="miniprogram-function-description">
                                {item.description || "—"}
                              </td>
                              <td title={item.runtime || undefined}>{item.runtime || "—"}</td>
                              <td>{item.type || "—"}</td>
                              <td className="miniprogram-function-handler">
                                {item.handler || "—"}
                              </td>
                              <td>
                                <span
                                  className={`miniprogram-status ${item.status === "Active" ? "ok" : "warning"}`}
                                >
                                  {item.status === "Active" ? "运行中" : item.status}
                                </span>
                              </td>
                              <td>{item.modifiedAt || item.createdAt || "—"}</td>
                              <td>
                                {item.timers.length ? `${item.timers.length} 个` : "—"}
                                {item.timers.length ? (
                                  <div className="miniprogram-function-timer-summary">
                                    {item.timers
                                      .map((timer) => `${timer.name} · ${timer.schedule}`)
                                      .join("；")}
                                  </div>
                                ) : null}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  disabled={!writable}
                                  onClick={() => {
                                    setTimerFunctionName(
                                      timerFunctionName === item.name ? "" : item.name,
                                    );
                                    setTimerName("");
                                    setTimerSchedule("");
                                    setTimerError("");
                                  }}
                                >
                                  <UiIcon name="clock" size={13} />
                                  管理定时触发器
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : serverBusy ? null : (
                  <p className="muted miniprogram-note">
                    {functionSearch.trim() ? "没有匹配的云函数。" : "当前环境没有云函数。"}
                  </p>
                )}
                {selectedTimerFunction ? (
                  <WorkspaceDialog
                    title={`${timerFunctionName} · 定时触发器`}
                    onClose={() => setTimerFunctionName("")}
                    className="miniprogram-timer-dialog"
                  >
                    <section
                      className="miniprogram-function-detail"
                      aria-label={`${timerFunctionName} 的定时触发器`}
                    >
                      <div className="miniprogram-function-detail-head">
                        <span className="miniprogram-function-timer-count">
                          {selectedTimerFunction.timers.length} / 10 个触发器
                        </span>
                      </div>
                      {selectedTimerFunction.timers.length ? (
                        <div className="miniprogram-function-timer-list">
                          {selectedTimerFunction.timers.map((timer) => (
                            <div className="miniprogram-function-timer-row" key={timer.name}>
                              <span className="miniprogram-function-timer-name">{timer.name}</span>
                              <code>{timer.schedule}</code>
                              <span
                                className={timer.enabled ? "miniprogram-timer-active" : "muted"}
                              >
                                {timer.enabled ? "已启用" : "已停用"}
                              </span>
                              <span className="miniprogram-function-timer-actions">
                                <button
                                  type="button"
                                  disabled={!writable || serverBusy}
                                  onClick={() => {
                                    setTimerEditingName(timer.name);
                                    setTimerName(timer.name);
                                    setTimerSchedule(timer.schedule);
                                    setTimerError("");
                                    setTimerEditorOpen(true);
                                  }}
                                >
                                  修改
                                </button>
                                <button
                                  type="button"
                                  className="miniprogram-danger"
                                  disabled={!writable || serverBusy}
                                  aria-label={`删除定时触发器 ${timer.name}`}
                                  onClick={() => setTimerToDelete(timer.name)}
                                >
                                  删除
                                </button>
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="muted miniprogram-function-timer-empty">尚无定时触发器。</p>
                      )}
                      <div className="miniprogram-timer-create">
                        <button
                          type="button"
                          disabled={!writable || serverBusy || timerLimitReached}
                          onClick={() => {
                            setTimerEditingName(null);
                            setTimerName("");
                            setTimerSchedule("");
                            setTimerError("");
                            setTimerEditorOpen(true);
                          }}
                        >
                          新增定时触发器
                        </button>
                      </div>
                    </section>
                    {timerEditorOpen ? (
                      <WorkspaceDialog
                        title={timerEditingName ? "修改定时触发器" : "新增定时触发器"}
                        onClose={() => setTimerEditorOpen(false)}
                        className="miniprogram-timer-editor-dialog"
                      >
                        <div className="miniprogram-timer-form">
                          <label>
                            <span>名称</span>
                            <input
                              aria-label="定时触发器名称"
                              value={timerName}
                              maxLength={60}
                              placeholder="例如 dailyReport"
                              disabled={!writable || (!timerEditingName && timerLimitReached)}
                              onChange={(event) => {
                                setTimerName(event.target.value);
                                setTimerError("");
                              }}
                            />
                          </label>
                          <label>
                            <span>Cron 表达式</span>
                            <input
                              aria-label="Cron 表达式"
                              value={timerSchedule}
                              placeholder="0 0 9 * * * *"
                              disabled={!writable || (!timerEditingName && timerLimitReached)}
                              onChange={(event) => {
                                setTimerSchedule(event.target.value);
                                setTimerError("");
                              }}
                            />
                          </label>
                          <p className="muted miniprogram-timer-help">
                            {timerLimitReached && !timerEditingName
                              ? "已达到每个云函数 10 个触发器的上限。"
                              : timerNameDuplicate && !timerEditingName
                                ? "该名称已用于当前云函数。"
                                : timerName && !timerNameValid
                                  ? "名称须以字母开头，只能包含字母、数字、- 和 _，最多 60 个字符。"
                                  : timerSchedule && !timerScheduleValid
                                    ? "Cron 需要 7 个字段：秒 分 时 日 月 星期 年。"
                                    : "每个云函数最多 10 个；Cron 为 7 个字段：秒 分 时 日 月 星期 年。"}
                          </p>
                          {timerError ? (
                            <p className="miniprogram-config-error">{timerError}</p>
                          ) : null}
                          <div className="miniprogram-config-actions">
                            <button type="button" onClick={() => setTimerEditorOpen(false)}>
                              取消
                            </button>
                            <button
                              type="button"
                              disabled={
                                !writable ||
                                serverBusy ||
                                (!timerEditingName && timerLimitReached) ||
                                !timerNameValid ||
                                !timerScheduleValid ||
                                (timerNameDuplicate && timerName.trim() !== timerEditingName)
                              }
                              onClick={() => void saveTimer(timerFunctionName)}
                            >
                              {timerEditingName ? "保存修改" : "创建"}
                            </button>
                          </div>
                        </div>
                      </WorkspaceDialog>
                    ) : null}
                  </WorkspaceDialog>
                ) : null}
                {selectedTimerFunction && timerToDelete ? (
                  <WorkspaceDialog title="删除定时触发器" onClose={() => setTimerToDelete(null)}>
                    <p>
                      删除后，{selectedTimerFunction.name} 将不再按「{timerToDelete}
                      」的规则定时执行。
                    </p>
                    <div className="miniprogram-config-actions">
                      <button type="button" onClick={() => setTimerToDelete(null)}>
                        取消
                      </button>
                      <button
                        type="button"
                        className="miniprogram-danger"
                        disabled={serverBusy}
                        onClick={() => {
                          const triggerName = timerToDelete;
                          setTimerToDelete(null);
                          void disableTimer(selectedTimerFunction.name, triggerName);
                        }}
                      >
                        删除触发器
                      </button>
                    </div>
                  </WorkspaceDialog>
                ) : null}
                <TablePagination
                  page={functionPage}
                  pageSize={functionPageSize}
                  total={visibleFunctions.length}
                  hasNext={functionHasNext}
                  onPageChange={setFunctionPage}
                  onPageSizeChange={(pageSize) => {
                    setFunctionPageSize(pageSize);
                    setFunctionPage(0);
                  }}
                />
              </section>
            </div>
          </section>
        ) : null}

        {tab === "deploy" ? (
          <>
            <section className="miniprogram-panel miniprogram-deploy-panel">
              <header className="miniprogram-panel-head miniprogram-production-head">
                <div>
                  <strong>发布记录</strong>
                  <span className="muted">生产环境</span>
                </div>
                <div className="miniprogram-production-actions">
                  <button
                    type="button"
                    className="miniprogram-preview-icon-button"
                    aria-label="刷新生产发布记录"
                    title="刷新"
                    disabled={releaseBusy !== ""}
                    onClick={() =>
                      void Promise.all([
                        loadReleaseApplications(),
                        loadReleaseFunctions(),
                        loadDeployments(),
                      ])
                    }
                  >
                    <UiIcon name="refresh" size={14} />
                  </button>
                  <button
                    type="button"
                    className="miniprogram-production-create"
                    disabled={!writable || releaseBusy !== ""}
                    onClick={() => {
                      setReleaseError("");
                      setReleaseNotice("");
                      setReleaseSelection([]);
                      setReleaseNote("");
                      setReleaseCreateOpen(true);
                    }}
                  >
                    <UiIcon name="plus" size={13} />
                    新建生产发布
                  </button>
                </div>
              </header>

              <div className="miniprogram-production-table-wrap">
                <table className="miniprogram-production-table">
                  <thead>
                    <tr>
                      <th>状态</th>
                      <th>发布内容</th>
                      <th>发布者</th>
                      <th>提交时间</th>
                      <th>更新时间</th>
                      <th aria-label="操作" />
                    </tr>
                  </thead>
                  <tbody>
                    {releaseApplications.map((application) => (
                      <tr key={application.id}>
                        <td>
                          <span
                            className={`miniprogram-status ${releaseStatusTone(application.status)}`}
                          >
                            {application.statusLabel}
                          </span>
                        </td>
                        <td>
                          <strong className="miniprogram-production-targets">
                            {application.items
                              .map((item) => item.resourceName || item.targetLabel)
                              .join("、")}
                          </strong>
                          {application.releaseNote ? (
                            <small>{application.releaseNote}</small>
                          ) : null}
                        </td>
                        <td title={application.requestedBy}>
                          {application.requestedBy === currentUserId
                            ? "我"
                            : application.requestedByKind === "session"
                              ? `成员 ${application.requestedBy.slice(0, 8)}`
                              : `小祥 ${application.requestedBy.slice(0, 8)}`}
                        </td>
                        <td>{application.createdAt || "—"}</td>
                        <td>{application.updatedAt || "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="miniprogram-production-detail"
                            onClick={() => {
                              setReleaseError("");
                              setReleaseNotice("");
                              setRejectingId("");
                              setRejectReason("");
                              setReleaseDetailId(application.id);
                            }}
                          >
                            <UiIcon name="detail" size={13} />
                            详情
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!releaseApplications.length ? (
                      <tr>
                        <td className="miniprogram-production-empty" colSpan={6}>
                          还没有生产发布记录。
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            {releaseCreateOpen ? (
              <WorkspaceDialog title="新建生产发布" onClose={() => setReleaseCreateOpen(false)}>
                <p className="muted miniprogram-note">
                  选择本次要发布到生产环境的内容，提交后由项目负责人审批。
                </p>
                <div className="miniprogram-release-targets">
                  <label className="miniprogram-release-target">
                    <input
                      type="checkbox"
                      checked={releaseSelection.includes("admin:cloudbase_static")}
                      onChange={(event) =>
                        setReleaseSelection((current) =>
                          event.target.checked
                            ? [...current, "admin:cloudbase_static"]
                            : current.filter((value) => value !== "admin:cloudbase_static"),
                        )
                      }
                    />
                    <span>
                      <strong>Admin 生产版</strong>
                      <small>静态网站托管 · Admin 根目录</small>
                    </span>
                  </label>
                  {releaseFunctions.map((item) => {
                    const key = `function:${item.name}`;
                    return (
                      <label className="miniprogram-release-target" key={key}>
                        <input
                          type="checkbox"
                          checked={releaseSelection.includes(key)}
                          onChange={(event) =>
                            setReleaseSelection((current) =>
                              event.target.checked
                                ? [...current, key]
                                : current.filter((value) => value !== key),
                            )
                          }
                        />
                        <span>
                          <strong>{item.name}</strong>
                          <small>云函数 · {item.runtime || item.status}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {releaseSelection.includes("admin:cloudbase_static") ? (
                  <section className="miniprogram-production-admin-config">
                    <dl className="miniprogram-meta">
                      <div>
                        <dt>发布方式</dt>
                        <dd>静态网站托管</dd>
                      </div>
                      <div>
                        <dt>发布环境</dt>
                        <dd>生产环境</dd>
                      </div>
                      <div>
                        <dt>产物来源</dt>
                        <dd>Admin 根目录</dd>
                      </div>
                    </dl>
                    <label className="miniprogram-field miniprogram-admin-hosting-path">
                      <span>托管路径</span>
                      <input
                        type="text"
                        value={adminProductionPath}
                        placeholder="/admin/"
                        disabled={releaseBusy !== ""}
                        autoComplete="off"
                        onChange={(event) => setAdminProductionPath(event.target.value)}
                      />
                    </label>
                    {adminProductionAddress ? (
                      <a
                        className="miniprogram-admin-production-url"
                        href={adminProductionAddress}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <UiIcon name="globe" size={13} />
                        <span>{adminProductionAddress}</span>
                      </a>
                    ) : null}
                  </section>
                ) : null}
                <label className="miniprogram-field miniprogram-field-column miniprogram-production-note">
                  <span>发布说明</span>
                  <textarea
                    rows={4}
                    value={releaseNote}
                    placeholder="本次生产发布内容（可选）"
                    onChange={(event) => setReleaseNote(event.target.value)}
                  />
                </label>
                {releaseError ? <p className="miniprogram-config-error">{releaseError}</p> : null}
                <div className="miniprogram-dialog-actions">
                  <button
                    type="button"
                    disabled={releaseBusy !== ""}
                    onClick={() => setReleaseCreateOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!writable || !releaseSelection.length || releaseBusy !== ""}
                    onClick={() => void submitReleaseApplication()}
                  >
                    <UiIcon name="upload" size={13} />
                    {releaseBusy === "submit" ? "提交中…" : "提交审批"}
                  </button>
                </div>
              </WorkspaceDialog>
            ) : null}

            {selectedReleaseApplication ? (
              <WorkspaceDialog title="生产发布详情" onClose={() => setReleaseDetailId("")}>
                <div className="miniprogram-production-detail-head">
                  <span
                    className={`miniprogram-status ${releaseStatusTone(selectedReleaseApplication.status)}`}
                  >
                    {selectedReleaseApplication.statusLabel}
                  </span>
                  <code>{selectedReleaseApplication.id}</code>
                </div>
                {selectedReleaseApplication.sourceChanged &&
                selectedReleaseApplication.status === "pending" ? (
                  <p className="miniprogram-approval-alert">源码已变化，不能通过，请重新提交。</p>
                ) : null}
                <dl className="miniprogram-production-detail-meta">
                  <div>
                    <dt>发布者</dt>
                    <dd>
                      {selectedReleaseApplication.requestedBy === currentUserId
                        ? "我"
                        : selectedReleaseApplication.requestedBy}
                    </dd>
                  </div>
                  <div>
                    <dt>提交时间</dt>
                    <dd>{selectedReleaseApplication.createdAt || "—"}</dd>
                  </div>
                  <div>
                    <dt>审批人</dt>
                    <dd>{selectedReleaseApplication.decidedBy || "—"}</dd>
                  </div>
                  <div>
                    <dt>审批时间</dt>
                    <dd>{selectedReleaseApplication.decidedAt || "—"}</dd>
                  </div>
                  <div>
                    <dt>发布说明</dt>
                    <dd>{selectedReleaseApplication.releaseNote || "—"}</dd>
                  </div>
                  <div>
                    <dt>审批说明</dt>
                    <dd>{selectedReleaseApplication.decisionNote || "—"}</dd>
                  </div>
                </dl>
                <section className="miniprogram-production-detail-items">
                  <h5>发布内容</h5>
                  <ul className="miniprogram-release-application-items">
                    {selectedReleaseApplication.items.map((item) => (
                      <li key={item.id}>
                        <div>
                          <strong>{item.resourceName || item.targetLabel}</strong>
                          <small>
                            {item.environment === "production" ? "生产环境" : item.environment}
                            {item.deploymentId ? ` · 部署记录 ${item.deploymentId}` : ""}
                          </small>
                        </div>
                        <span className={`miniprogram-status ${releaseStatusTone(item.status)}`}>
                          {item.statusLabel}
                        </span>
                        {item.lastError ? <p>{item.lastError}</p> : null}
                      </li>
                    ))}
                  </ul>
                </section>
                {releaseError ? <p className="miniprogram-config-error">{releaseError}</p> : null}
                {releaseNotice ? <p className="muted miniprogram-note">{releaseNotice}</p> : null}
                {selectedReleaseApplication.status === "pending" ? (
                  <div className="miniprogram-production-detail-actions">
                    {owner ? (
                      <>
                        <button
                          type="button"
                          className="miniprogram-approve"
                          disabled={releaseBusy !== "" || selectedReleaseApplication.sourceChanged}
                          onClick={() =>
                            void decideReleaseApplication(selectedReleaseApplication, "approve")
                          }
                        >
                          <UiIcon name="check" size={13} />
                          {releaseBusy === `approve:${selectedReleaseApplication.id}`
                            ? "发布中…"
                            : "通过并发布"}
                        </button>
                        <button
                          type="button"
                          className="miniprogram-danger"
                          disabled={releaseBusy !== ""}
                          onClick={() => {
                            setRejectingId(selectedReleaseApplication.id);
                            setRejectReason("");
                          }}
                        >
                          <UiIcon name="reject" size={13} />
                          拒绝
                        </button>
                      </>
                    ) : null}
                    {selectedReleaseApplication.requestedBy === currentUserId ? (
                      <button
                        type="button"
                        className="miniprogram-danger"
                        disabled={releaseBusy !== ""}
                        onClick={() => void cancelReleaseApplication(selectedReleaseApplication)}
                      >
                        <UiIcon name="abandon" size={13} />
                        {releaseBusy === `cancel:${selectedReleaseApplication.id}`
                          ? "放弃中…"
                          : "放弃发布"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {selectedReleaseApplication.status === "pending" &&
                rejectingId === selectedReleaseApplication.id ? (
                  <div className="miniprogram-approval-reject">
                    <label className="miniprogram-field">
                      <span>拒绝理由</span>
                      <input
                        value={rejectReason}
                        placeholder="必填，会记录到本次发布"
                        onChange={(event) => setRejectReason(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="miniprogram-danger"
                      disabled={releaseBusy !== "" || !rejectReason.trim()}
                      onClick={() =>
                        void decideReleaseApplication(selectedReleaseApplication, "reject")
                      }
                    >
                      确认拒绝
                    </button>
                  </div>
                ) : null}
              </WorkspaceDialog>
            ) : null}
          </>
        ) : null}

        {tab === "database" ? (
          <section className="miniprogram-panel miniprogram-database-panel">
            <div
              className="miniprogram-admin-toolbar miniprogram-database-toolbar"
              role="toolbar"
              aria-label="云数据库工具栏"
            >
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                title={`刷新${dbEnvironment === "production" ? "生产" : "开发"}环境集合`}
                aria-label={`刷新${dbEnvironment === "production" ? "生产" : "开发"}环境集合`}
                disabled={browseBusy !== null}
                onClick={() => void loadCollections()}
              >
                <UiIcon name="refresh" size={14} />
              </button>
              <div className="miniprogram-admin-address miniprogram-database-address">
                <UiIcon name="layers" size={13} />
                <select
                  aria-label="集合"
                  value={dbCollection}
                  disabled={browseBusy === "collections" || !collections.length}
                  onChange={(event) => openDocumentCollection(event.target.value)}
                >
                  {collections.length ? null : <option value="">暂无集合</option>}
                  {collections.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div
                className="miniprogram-database-environment"
                role="group"
                aria-label="数据库环境"
              >
                {(["development", "production"] as const).map((environment) => {
                  const info = cbEnvironments.find((item) => item.kind === environment);
                  const selected = dbEnvironment === environment;
                  const label = environment === "production" ? "生产环境" : "开发环境";
                  const unavailable = Boolean(cbEnvironments.length && !info?.configured);
                  const title = info?.inherited
                    ? `${label}（共用开发环境 ${info.envId || ""}）`
                    : info?.envId
                      ? `${label} ${info.envId}`
                      : `${label}未配置`;
                  return (
                    <button
                      type="button"
                      key={environment}
                      className={selected ? "is-selected" : ""}
                      aria-pressed={selected}
                      title={title}
                      disabled={browseBusy !== null || unavailable}
                      onClick={() => switchDatabaseEnvironment(environment)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className={`miniprogram-preview-icon-button ${databaseFilterCount(dbFilter) ? "is-active" : ""}`}
                title={
                  databaseFilterCount(dbFilter) ? `筛选 · ${databaseFilterCount(dbFilter)}` : "筛选"
                }
                aria-label={
                  databaseFilterCount(dbFilter) ? `筛选 · ${databaseFilterCount(dbFilter)}` : "筛选"
                }
                disabled={!dbCollection}
                onClick={() => setDbFilterOpen(true)}
              >
                <UiIcon name="filter" size={14} />
              </button>
            </div>
            <div className="miniprogram-database-content">
              {browseError ? <p className="miniprogram-config-error">{browseError}</p> : null}
              {dbError ? <p className="miniprogram-config-error">{dbError}</p> : null}
              <div className="miniprogram-database-table-wrap">
                <table className="miniprogram-database-table">
                  <thead>
                    <tr>
                      {documentColumns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dbDocs.map((document, index) => (
                      <tr key={String(document._id || index)}>
                        {documentColumns.map((column) => (
                          <td key={column}>{databaseCell(document[column])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={dbPage}
                pageSize={dbLimit}
                total={dbTotal}
                hasNext={dbHasNext}
                onPageChange={(page) => void runDbQuery(dbCollection, dbFilter, page)}
                onPageSizeChange={(pageSize) => {
                  setDbLimit(pageSize);
                  setDbPage(0);
                  void runDbQuery(dbCollection, dbFilter, 0, pageSize);
                }}
              />
            </div>
            {dbFilterOpen ? (
              <WorkspaceDialog
                title="筛选"
                className="miniprogram-filter-dialog"
                onClose={() => setDbFilterOpen(false)}
              >
                <DatabaseFilterBuilder
                  value={dbFilter}
                  fieldOptions={documentColumns}
                  onCancel={() => setDbFilterOpen(false)}
                  onApply={(filter) => {
                    setDbFilter(filter);
                    setDbFilterOpen(false);
                    setDbPage(0);
                    void runDbQuery(dbCollection, filter, 0);
                  }}
                />
              </WorkspaceDialog>
            ) : null}
          </section>
        ) : null}

        {tab === "storage" ? (
          <section className="miniprogram-panel miniprogram-storage-panel">
            <div
              className="miniprogram-admin-toolbar miniprogram-storage-addressbar"
              role="toolbar"
              aria-label="云存储工具栏"
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
                aria-label="云存储环境"
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
                <UiIcon name="plus" size={14} />
              </button>
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                title="上传文件夹"
                aria-label="上传文件夹"
                disabled={!writable || storageActionBusy !== null}
                onClick={() => storageFolderInputRef.current?.click()}
              >
                <UiIcon name="upload" size={14} />
              </button>
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                title="上传文件"
                aria-label="上传文件"
                disabled={!writable || storageActionBusy !== null}
                onClick={() => storageFileInputRef.current?.click()}
              >
                <UiIcon name="detail" size={14} />
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
      </div>
    </div>
  );
}
