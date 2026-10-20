/**
 * 小程序工作区的内部件：类型、存储路径与分页/预览等纯函数，以及若干叶子组件。
 * 主组件 MiniProgramWorkspace 从这里取用，保持原有行为。
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { UiIcon, type UiIconName } from "./ui-icon";
import { DialogClose, ModalBackdrop } from "./dialog-fx";
import { PaginationControl } from "./PaginationControl";
import {
  MiniProgramDeviceShell,
  PREVIEW_DEFAULT_DEVICE_ID,
  PREVIEW_DEVICES,
  PREVIEW_ZOOM_OPTIONS,
  findPreviewDevice,
} from "./MiniProgramDeviceShell";

export const MINIPROGRAM_TABS = [
  { id: "preview", label: "Dimina预览", icon: "smartphone" },
  { id: "admin", label: "Admin预览", icon: "monitor" },
  { id: "database", label: "CloudBase 云数据库", icon: "layers" },
  { id: "storage", label: "CloudBase 云存储", icon: "folder" },
  { id: "server", label: "CloudBase 云函数", icon: "server" },
  { id: "deploy", label: "生产发布", icon: "upload" },
] as const;

/** 只标在绑定 CloudBase 的能力上，不标预览壳和审批流本身。 */
export function CloudBaseTag({ title = "该能力绑定 CloudBase" }: { title?: string }) {
  return (
    <span className="cloudbase-tag" title={title}>
      CloudBase
    </span>
  );
}

export type MiniProgramTabId = (typeof MINIPROGRAM_TABS)[number]["id"];

export type MiniProgramConfig = {
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

export const TAB_STATE_KEY = "cothread-miniprogram-tab";
export const PREVIEW_VIEW_KEY = "cothread-miniprogram-preview-view";
export const ADMIN_VIEW_KEY = "cothread-miniprogram-admin-view";

export type PreviewViewState = { deviceId: string; zoom: string };

export type StorageFile = {
  key: string;
  fileId: string | null;
  size: number;
  lastModified: string | null;
  isDirectory: boolean;
};

export function normalizedStoragePath(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

export function joinStoragePath(...parts: string[]) {
  return parts.map(normalizedStoragePath).filter(Boolean).join("/");
}

export function storageFileName(key: string) {
  const normalized = key.replace(/\/+$/, "");
  return normalized.split("/").pop() || normalized;
}

export function formatStorageSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function fileAsBase64(file: File) {
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
export function readStoredPreviewView(projectId: string): PreviewViewState | null {
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

export function storePreviewView(projectId: string, view: PreviewViewState) {
  try {
    localStorage.setItem(`${PREVIEW_VIEW_KEY}:${projectId}`, JSON.stringify(view));
  } catch {
    /* 忽略：仅退化为不记忆 */
  }
}

export type AdminDeviceMode = "desktop" | "mobile";

export type AdminPreviewViewState = {
  deviceMode: AdminDeviceMode;
  deviceId: string;
  zoom: string;
};

/**
 * Admin 预览的设备模式单独一份（`ADMIN_VIEW_KEY`），与 Dimina 预览互不覆盖：
 * 后台是桌面应用，多数时候要看「电脑模式」，不该被 Dimina 那边的机型选择带走。
 */
export function readStoredAdminView(projectId: string): AdminPreviewViewState | null {
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

export function storeAdminView(projectId: string, view: AdminPreviewViewState) {
  try {
    localStorage.setItem(`${ADMIN_VIEW_KEY}:${projectId}`, JSON.stringify(view));
  } catch {
    /* 忽略：仅退化为不记忆 */
  }
}

export function readStoredTab(projectId: string): MiniProgramTabId {
  try {
    const raw = localStorage.getItem(`${TAB_STATE_KEY}:${projectId}`);
    const known = MINIPROGRAM_TABS.some((tab) => tab.id === raw);
    return known ? (raw as MiniProgramTabId) : "preview";
  } catch {
    return "preview";
  }
}

export function PendingPanel({
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
export function WorkspaceDialog({
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

export type AdminServer = {
  id: string;
  port: number | null;
  status: "starting" | "running" | "failed" | "stopped";
  error: string | null;
  proxyBase: string;
  lastActivityAt: string | null;
};

export type AdminServerList = { servers: AdminServer[]; activeId: string | null };

export const ADMIN_STATUS_LABELS: Record<AdminServer["status"], string> = {
  starting: "启动中",
  running: "运行中",
  failed: "启动失败",
  stopped: "已停止",
};

export const ADMIN_STATUS_TONES: Record<AdminServer["status"], string> = {
  starting: "warning",
  running: "ok",
  failed: "failed",
  stopped: "muted",
};

export type CloudbaseEnvInfo = {
  kind: string;
  label: string;
  envId: string | null;
  region: string | null;
  configured: boolean;
  inherited: boolean;
  agentAllowed: boolean;
};

export type DeploymentRow = {
  id: string;
  target: string;
  environment: string;
  status: string;
  version: string | null;
  url: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  operatorName?: string | null;
  recordKind?: "deployment" | "build";
};

export type CloudbaseTimer = {
  name: string;
  type: "timer";
  schedule: string;
  enabled: boolean;
};

export type CloudbaseFunction = {
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

export const TABLE_PAGE_SIZE = 20;
export const TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function TablePagination({
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
  return (
    <PaginationControl
      className="miniprogram-table-pagination"
      total={total}
      currentPage={page + 1}
      pageSize={pageSize}
      pageSizeOptions={TABLE_PAGE_SIZE_OPTIONS}
      hasNext={hasNext}
      onPageChange={(next) => onPageChange(next - 1)}
      onPageSizeChange={onPageSizeChange}
      ariaLabel="表格分页"
    />
  );
}

export const DEPLOY_TARGET_LABELS: Record<string, string> = {
  app_preview: "Dimina 编译",
  wechat_preview: "开发版预览",
  wechat_upload: "体验版上传",
  cloudbase_static: "CloudBase 静态托管",
  cloudbase_function: "CloudBase 云函数",
};

export const DEVELOPMENT_ENVIRONMENT = "development";
export type DatabaseEnvironment = "development" | "production";

export function databaseCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function adminHostingUrl(row: DeploymentRow): string | null {
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

export function DeploymentRecordList({
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
                className={`miniprogram-status ${
                  row.status === "succeeded" ? "ok" : row.status === "failed" ? "failed" : ""
                }`}
              >
                {row.status === "succeeded"
                  ? "成功"
                  : row.status === "failed"
                    ? "失败"
                    : row.status === "running" || row.status === "queued"
                      ? "进行中"
                      : row.status}
              </span>
              <span className="miniprogram-deploy-target">
                {DEPLOY_TARGET_LABELS[row.target] || row.target}
              </span>
              <span className="miniprogram-deploy-version">{row.version || "—"}</span>
              <span className="muted">{formatRecordTime(row.publishedAt || row.createdAt)}</span>
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
export type ReleaseRequest = {
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

export type ReleaseApplication = {
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

export const RELEASE_STATUS_TONES: Record<string, string> = {
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

export function releaseStatusTone(status: string): string {
  return RELEASE_STATUS_TONES[status] || "muted";
}

export const loadedRuntimeStyles = new Set<string>();

export function ensureRuntimeStyle(href: string) {
  if (!href || loadedRuntimeStyles.has(href)) return;
  loadedRuntimeStyles.add(href);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export type DiminaContainer = {
  openApp?: (options: Record<string, unknown>) => Promise<void> | void;
  closeApp?: () => void;
  destroy?: () => void;
};

export type DiminaRuntimeModule = {
  createContainer: (options: Record<string, unknown>) => DiminaContainer;
};

export type DiminaRuntimeHolder = { url: string; module: DiminaRuntimeModule };

export const RUNTIME_LOADER_URL = "/dimina/loader.js";

/**
 * Dimina 运行时不在 Vite 的模块图里。
 *
 * 它必须放在 `public/`（生产构建原样复制；且容器内部用
 * `new URL("./service.js", import.meta.url)` 推导 worker 路径，必须与
 * service.js / pageFrame.* 同目录）。而 Vite 明确禁止从源码 import() `public/`
 * 里的文件——直接 import 会得到 500「should not be imported from source code」。
 * 所以改为按 URL 加载一个静态 ESM 加载器，由它把运行时挂到全局。
 */
export function loadDiminaRuntime(): Promise<DiminaRuntimeModule> {
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

export type PreviewMeta = {
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

export function formatBuildTime(value: string | null | undefined) {
  if (!value) return "尚未编译";
  const raw = String(value).trim();
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatRecordTime(value: string | null | undefined) {
  if (!value) return "";
  const raw = String(value).trim();
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
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
export function PreviewCanvas({ meta, projectId }: { meta: PreviewMeta; projectId: string }) {
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
      <div className="miniprogram-canvas miniprogram-dimina-canvas" ref={mountRef} />
    </MiniProgramDeviceShell>
  );
}
