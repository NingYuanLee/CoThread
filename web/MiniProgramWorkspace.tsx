import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readJsonResponse } from "../shared/json-response.js";
import { UiIcon, type UiIconName } from "./ui-icon";
import "./miniprogram.css";

export const MINIPROGRAM_TABS = [
  { id: "preview", label: "应用预览", icon: "smartphone" },
  { id: "admin", label: "Admin", icon: "monitor" },
  { id: "database", label: "数据库", icon: "layers" },
  { id: "storage", label: "文件存储", icon: "folder" },
  { id: "auth", label: "身份授权", icon: "shield" },
  { id: "stats", label: "数据统计", icon: "trajectory" },
] as const;

export type MiniProgramTabId = (typeof MINIPROGRAM_TABS)[number]["id"];

type MiniProgramConfig = {
  enabled: boolean;
  appId: string | null;
  appName: string | null;
  status: string;
  cloudbaseEnvs: Partial<Record<"development" | "staging" | "production", { envId: string }>>;
  adminDeploy: { target: string; environment: string } | null;
  lastVerifiedAt: string | null;
  secrets: Record<string, { configured: boolean; hint: string | null }>;
};

const STATUS_LABELS: Record<string, string> = {
  unconfigured: "未配置",
  incomplete: "配置不完整",
  verify_failed: "验证失败",
  verified: "已验证",
  credential_expired: "凭据缺失",
};

const TAB_STATE_KEY = "cothread-miniprogram-tab";

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

function SourceSummary({ files }: { files: Array<{ area: string; path: string }> }) {
  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const file of files) {
      const list = map.get(file.area) || [];
      list.push(file.path);
      map.set(file.area, list);
    }
    return map;
  }, [files]);
  if (!grouped.size) {
    return <p className="muted">小程序目录下还没有源码文件。</p>;
  }
  return (
    <ul className="miniprogram-source-list">
      {[...grouped.entries()].map(([area, paths]) => (
        <li key={area}>
          <span className="miniprogram-source-area">{area}</span>
          <span className="miniprogram-source-count">{paths.length} 个文件</span>
          <ul>
            {paths.slice(0, 8).map((path) => (
              <li key={path}>{path}</li>
            ))}
            {paths.length > 8 ? <li className="muted">…还有 {paths.length - 8} 个</li> : null}
          </ul>
        </li>
      ))}
    </ul>
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
  agentAllowed: boolean;
};

type DeploymentRow = {
  id: string;
  target: string;
  status: string;
  version: string | null;
  publishedAt: string | null;
  createdAt: string | null;
};

const DEPLOY_TARGET_LABELS: Record<string, string> = {
  wechat_preview: "微信预览",
  wechat_upload: "微信上传",
  cloudbase_static: "Admin 静态托管",
  cloudbase_hosted: "Admin 云托管",
  cloudbase_function: "云函数",
};

/** `server/release-requests.js` 的 publicRow 形状。 */
type ReleaseRequest = {
  id: string;
  target: string;
  targetLabel: string;
  environment: string;
  version: string | null;
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

type ReleaseRequestList = {
  requests: ReleaseRequest[];
  pendingCount: number;
  currentSourceHash: string | null;
  sourceChanged: boolean;
};

const REQUESTER_KIND_LABELS: Record<string, string> = {
  session: "项目成员（会话提交）",
  agent: "Agent 提交",
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

/**
 * Mounts the vendored Dimina Web container. The runtime module is loaded at
 * runtime (not bundled) because it ships as static assets under /dimina and
 * resolves its logic worker relative to its own module URL.
 */
function PreviewCanvas({ meta }: { meta: PreviewMeta }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<{ destroy?: () => void } | null>(null);
  const [state, setState] = useState<"loading" | "running" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let cancelled = false;
    setState("loading");
    setError("");
    void (async () => {
      try {
        ensureRuntimeStyle(meta.runtime.styleUrl);
        const mod = await import(/* @vite-ignore */ meta.runtime.moduleUrl);
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
    meta.runtime.moduleUrl,
    meta.runtime.pageFrameUrl,
    meta.runtime.resourceBaseUrl,
    meta.runtime.styleUrl,
  ]);

  return (
    <div className="miniprogram-canvas-shell">
      <div className="miniprogram-canvas-bar">
        <span className={`miniprogram-canvas-state ${state}`}>
          {state === "running" ? "运行中" : state === "loading" ? "启动中…" : "启动失败"}
        </span>
        {meta.stale ? (
          <span className="miniprogram-status warning">源码已更新，待重新编译</span>
        ) : null}
      </div>
      {state === "error" ? (
        <p className="miniprogram-config-error">{error || "小程序启动失败"}</p>
      ) : null}
      <div className="miniprogram-canvas" ref={mountRef} />
    </div>
  );
}

export function MiniProgramWorkspace({
  projectId,
  request,
  writable,
}: {
  projectId: string;
  request: (path: string, options?: RequestInit) => Promise<Response>;
  writable: boolean;
}) {
  const [tab, setTab] = useState<MiniProgramTabId>(() => readStoredTab(projectId));
  const [config, setConfig] = useState<MiniProgramConfig | null>(null);
  const [error, setError] = useState("");
  const [sourceFiles, setSourceFiles] = useState<Array<{ area: string; path: string }>>([]);
  const [meta, setMeta] = useState<PreviewMeta | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [adminServers, setAdminServers] = useState<AdminServer[]>([]);
  const [adminActiveId, setAdminActiveId] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminFrameKey, setAdminFrameKey] = useState(0);
  const [cbEnvironments, setCbEnvironments] = useState<CloudbaseEnvInfo[]>([]);
  const [cbEnv, setCbEnv] = useState("development");
  const [dbCollection, setDbCollection] = useState("");
  const [dbWhere, setDbWhere] = useState("");
  const [dbLimit, setDbLimit] = useState(20);
  const [dbDocs, setDbDocs] = useState<Array<Record<string, unknown>>>([]);
  const [dbSelectedId, setDbSelectedId] = useState("");
  const [dbDraft, setDbDraft] = useState("");
  const [dbBusy, setDbBusy] = useState(false);
  const [dbError, setDbError] = useState("");
  const [dbNotice, setDbNotice] = useState("");
  const [stCloudPath, setStCloudPath] = useState("");
  const [stContent, setStContent] = useState("");
  const [stFileList, setStFileList] = useState("");
  const [stResult, setStResult] = useState("");
  const [stBusy, setStBusy] = useState(false);
  const [stError, setStError] = useState("");
  const [wechatBusy, setWechatBusy] = useState<"preview" | "upload" | null>(null);
  const [wechatError, setWechatError] = useState("");
  const [wechatNotice, setWechatNotice] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [uploadVersion, setUploadVersion] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [openDeploymentId, setOpenDeploymentId] = useState("");
  const [deploymentLog, setDeploymentLog] = useState("");
  const [releaseRequests, setReleaseRequests] = useState<ReleaseRequest[]>([]);
  const [releaseSourceChanged, setReleaseSourceChanged] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState("");
  const [releaseError, setReleaseError] = useState("");
  const [releaseNotice, setReleaseNotice] = useState("");
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [collections, setCollections] = useState<string[]>([]);
  const [storageFiles, setStorageFiles] = useState<
    Array<{ key: string; size: number; isDirectory: boolean }>
  >([]);
  const [browseBusy, setBrowseBusy] = useState<"collections" | "files" | null>(null);
  const [browseError, setBrowseError] = useState("");
  const [browsePath, setBrowsePath] = useState("");

  useEffect(() => setTab(readStoredTab(projectId)), [projectId]);

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
        if (alive) setConfig(value as MiniProgramConfig);
      })
      .catch((cause) => {
        if (alive) setError(cause instanceof Error ? cause.message : "小程序配置读取失败");
      });
    return () => {
      alive = false;
    };
  }, [projectId, request]);

  useEffect(() => {
    let alive = true;
    // The workspace snapshot is read from the document library so the source
    // tree mirrors exactly what the compiler will consume.
    void request(`/api/projects/${projectId}/library`)
      .then((response) => readJsonResponse(response, "项目文档库"))
      .then((value: any) => {
        if (!alive) return;
        const folders: Array<{
          id: string;
          parent_id: string | null;
          folder_kind?: string | null;
        }> = value?.folders || [];
        const versions: Array<{
          deleted_at?: string | null;
          folder_id?: string | null;
          filename: string;
        }> = value?.versions || [];
        const byId = new Map(folders.map((folder) => [folder.id, folder]));
        const areas = new Set([
          "miniprogram_source",
          "miniprogram_web",
          "miniprogram_admin",
          "miniprogram_server",
        ]);
        const areaOf = (folderId: string | null) => {
          let current = folderId ? byId.get(folderId) : null;
          const seen = new Set<string>();
          while (current && !seen.has(current.id)) {
            seen.add(current.id);
            if (current.folder_kind && areas.has(current.folder_kind)) return current.folder_kind;
            current = current.parent_id ? byId.get(current.parent_id) : null;
          }
          return null;
        };
        const files: Array<{ area: string; path: string }> = [];
        for (const version of versions) {
          if (version.deleted_at) continue;
          const area = areaOf(version.folder_id ?? null);
          if (!area) continue;
          files.push({ area, path: version.filename });
        }
        setSourceFiles(files);
      })
      .catch(() => {
        if (alive) setSourceFiles([]);
      });
    return () => {
      alive = false;
    };
  }, [projectId, request]);

  const status = config?.status || "unconfigured";
  const enabled = Boolean(config?.enabled);
  const devEnv = config?.cloudbaseEnvs?.development?.envId || null;

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
    } catch (cause) {
      setAdminError(cause instanceof Error ? cause.message : "停止失败");
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
    if (tab !== "database" && tab !== "storage") return undefined;
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

  const runDbQuery = async () => {
    setDbBusy(true);
    setDbError("");
    setDbNotice("");
    try {
      const body: Record<string, unknown> = {
        environment: cbEnv,
        collection: dbCollection,
        limit: dbLimit,
      };
      if (dbWhere.trim()) {
        try {
          body.where = JSON.parse(dbWhere);
        } catch {
          throw new Error("查询条件不是合法 JSON");
        }
      }
      const result = (await cbCall("databases/query", body)) as {
        documents: Array<Record<string, unknown>>;
        count: number;
      };
      setDbDocs(result.documents || []);
      setDbNotice(`返回 ${result.count} 条文档`);
      setDbSelectedId("");
    } catch (cause) {
      setDbError(cause instanceof Error ? cause.message : "查询失败");
      setDbDocs([]);
    } finally {
      setDbBusy(false);
    }
  };

  const runDbWrite = async (action: "add" | "update" | "remove") => {
    setDbBusy(true);
    setDbError("");
    setDbNotice("");
    try {
      let document: unknown;
      if (action !== "remove") {
        try {
          document = JSON.parse(dbDraft || "{}");
        } catch {
          throw new Error("文档内容不是合法 JSON");
        }
      }
      const body: Record<string, unknown> = { environment: cbEnv, collection: dbCollection };
      if (action === "add") body.document = document;
      else {
        body.id = dbSelectedId;
        if (action === "update") body.patch = document;
      }
      const result = (await cbCall(`databases/${action}`, body)) as Record<string, unknown>;
      setDbNotice(
        action === "add"
          ? `已新增文档 ${result.id || ""}`
          : action === "update"
            ? `已更新 ${result.updated || 0} 条`
            : `已删除 ${result.deleted || 0} 条`,
      );
      await runDbQuery();
    } catch (cause) {
      setDbError(cause instanceof Error ? cause.message : "写入失败");
    } finally {
      setDbBusy(false);
    }
  };

  const selectDocument = (doc: Record<string, unknown>) => {
    const id = String(doc._id || doc.id || "");
    setDbSelectedId(id);
    setDbDraft(JSON.stringify(doc, null, 2));
  };

  const uploadToStorage = async () => {
    setStBusy(true);
    setStError("");
    setStResult("");
    try {
      const result = (await cbCall("storage/upload", {
        environment: cbEnv,
        cloudPath: stCloudPath,
        content: stContent,
      })) as Record<string, unknown>;
      setStResult(`已上传：${result.fileID || result.cloudPath}（${result.bytes} 字节）`);
    } catch (cause) {
      setStError(cause instanceof Error ? cause.message : "上传失败");
    } finally {
      setStBusy(false);
    }
  };

  const manageStorage = async (action: "urls" | "delete") => {
    setStBusy(true);
    setStError("");
    setStResult("");
    try {
      let fileList: unknown;
      try {
        fileList = JSON.parse(stFileList || "[]");
      } catch {
        throw new Error("文件 ID 列表不是合法 JSON 数组");
      }
      const result = (await cbCall(`storage/${action}`, { environment: cbEnv, fileList })) as {
        files?: Array<{ fileID: string; tempFileURL?: string }>;
        result?: Array<{ fileID: string; code?: string }>;
      };
      setStResult(JSON.stringify(result.files || result.result || result, null, 2));
    } catch (cause) {
      setStError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setStBusy(false);
    }
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

  const loadReleaseRequests = useCallback(async () => {
    try {
      const response = await request(`/api/projects/${projectId}/miniprogram/release-requests`);
      const data = (await readJsonResponse(response, "发布申请")) as ReleaseRequestList;
      setReleaseRequests(data.requests || []);
      setReleaseSourceChanged(Boolean(data.sourceChanged));
    } catch {
      setReleaseRequests([]);
      setReleaseSourceChanged(false);
    }
  }, [projectId, request]);

  /** 批准即执行；拒绝必须带理由。两者都只对项目负责人开放。 */
  const decideReleaseRequest = async (row: ReleaseRequest, action: "approve" | "reject") => {
    const reason = rejectReason.trim();
    if (action === "reject" && !reason) {
      setReleaseError("拒绝必须填写理由。");
      return;
    }
    setReleaseBusy(`${action}:${row.id}`);
    setReleaseError("");
    setReleaseNotice("");
    try {
      const response = await request(
        `/api/projects/${projectId}/miniprogram/release-requests/${row.id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action === "reject" ? { reason } : {}),
        },
      );
      const data = (await readJsonResponse(
        response,
        action === "approve" ? "批准发布申请" : "拒绝发布申请",
      )) as Partial<ReleaseRequest> | null;
      const label = `${row.targetLabel}${row.version ? ` ${row.version}` : ""}`;
      setReleaseNotice(
        action === "approve"
          ? `已批准并执行：${label}${data?.statusLabel ? `（当前状态：${data.statusLabel}）` : ""}`
          : `已拒绝：${label}`,
      );
      setRejectingId("");
      setRejectReason("");
      await loadReleaseRequests();
      await loadDeployments();
    } catch (cause) {
      setReleaseError(
        cause instanceof Error ? cause.message : action === "approve" ? "批准失败" : "拒绝失败",
      );
      // 失败也可能已经改变了服务端状态（例如源码变更导致作废），所以照常刷新。
      await loadReleaseRequests();
      await loadDeployments();
    } finally {
      setReleaseBusy("");
    }
  };

  useEffect(() => {
    if (tab !== "preview") return undefined;
    void loadDeployments();
    void loadReleaseRequests();
    return undefined;
  }, [tab, loadDeployments, loadReleaseRequests]);

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
        body: JSON.stringify({ version: uploadVersion, desc: uploadDesc, confirm: true }),
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

  const loadCollections = async () => {
    setBrowseBusy("collections");
    setBrowseError("");
    try {
      const response = await request(
        `/api/projects/${projectId}/cloudbase/collections?environment=${encodeURIComponent(cbEnv)}`,
      );
      const data = (await readJsonResponse(response, "集合列表")) as { collections: string[] };
      setCollections(data.collections || []);
    } catch (cause) {
      setBrowseError(cause instanceof Error ? cause.message : "载入集合列表失败");
      setCollections([]);
    } finally {
      setBrowseBusy(null);
    }
  };

  const browseStorage = async () => {
    setBrowseBusy("files");
    setBrowseError("");
    try {
      const params = new URLSearchParams({ environment: cbEnv });
      if (browsePath.trim()) params.set("path", browsePath.trim());
      const response = await request(
        `/api/projects/${projectId}/cloudbase/storage/files?${params.toString()}`,
      );
      const data = (await readJsonResponse(response, "存储目录")) as {
        files: Array<{ key: string; size: number; isDirectory: boolean }>;
      };
      setStorageFiles(data.files || []);
    } catch (cause) {
      setBrowseError(cause instanceof Error ? cause.message : "浏览存储目录失败");
      setStorageFiles([]);
    } finally {
      setBrowseBusy(null);
    }
  };

  const activeAdminServer =
    adminServers.find((row) => row.id === adminActiveId) ||
    adminServers.find((row) => row.status === "running" || row.status === "starting") ||
    adminServers[0] ||
    null;
  const adminStatusLabel = activeAdminServer
    ? ADMIN_STATUS_LABELS[activeAdminServer.status]
    : config?.adminDeploy
      ? "未启动"
      : "未配置";
  const adminStatusTone = activeAdminServer
    ? ADMIN_STATUS_TONES[activeAdminServer.status]
    : "muted";
  const pendingReleaseRequests = releaseRequests.filter((row) => row.status === "pending");
  const decidedReleaseRequests = releaseRequests
    .filter((row) => row.status !== "pending")
    .slice(0, 8);

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

      <div className="miniprogram-tab-body" role="tabpanel">
        {error ? <p className="miniprogram-config-error">{error}</p> : null}
        {!enabled ? (
          <p className="miniprogram-workspace-notice">
            小程序全栈工作区尚未启用。请在「项目管理 → 小程序与云开发」完成配置后启用。
          </p>
        ) : null}

        {tab === "preview" ? (
          <section className="miniprogram-panel">
            <header className="miniprogram-panel-head">
              <h4>应用预览</h4>
              <span className={`miniprogram-status ${status === "verified" ? "ok" : "muted"}`}>
                {STATUS_LABELS[status] || status}
              </span>
            </header>
            <dl className="miniprogram-meta">
              <div>
                <dt>AppID</dt>
                <dd>{config?.appId || "未配置"}</dd>
              </div>
              <div>
                <dt>源码文件</dt>
                <dd>{meta ? `${meta.sourceFileCount} 个` : "—"}</dd>
              </div>
              <div>
                <dt>上次编译</dt>
                <dd>
                  {meta?.build
                    ? `${meta.build.status}${meta.build.finishedAt ? ` · ${meta.build.finishedAt}` : ""}`
                    : "尚未编译"}
                </dd>
              </div>
            </dl>
            <div className="miniprogram-config-actions">
              <button
                type="button"
                disabled={!enabled || building}
                onClick={() => void rebuild(false)}
              >
                {building ? "编译中…" : meta?.runnable ? "重新编译" : "编译并预览"}
              </button>
              <button
                type="button"
                disabled={building}
                onClick={() => setReloadKey((value) => value + 1)}
              >
                刷新状态
              </button>
              {meta?.runnable ? (
                <button type="button" disabled={building} onClick={() => void rebuild(true)}>
                  强制重新编译
                </button>
              ) : null}
            </div>
            {buildError ? <p className="miniprogram-config-error">{buildError}</p> : null}
            {meta?.build?.errorCode ? (
              <p className="miniprogram-config-error">上次编译失败（{meta.build.errorCode}）</p>
            ) : null}
            {!enabled ? (
              <PendingPanel
                icon="smartphone"
                title="工作区未启用"
                detail="在「项目管理 → 小程序与云开发」启用后，这里会编译小程序源文件并运行预览。"
              />
            ) : meta?.runnable && meta.appId ? (
              <PreviewCanvas key={`${meta.build?.id}-${meta.runtime.moduleUrl}`} meta={meta} />
            ) : (
              <PendingPanel
                icon="smartphone"
                title={meta?.build ? "源码已变更，需要重新编译" : "还没有可运行的编译产物"}
                detail="点击「编译并预览」把「小程序源文件」编译为 Dimina 资源包，随后在此运行。源码仍可在文档树中直接预览。"
              />
            )}
            <h5>小程序源文件</h5>
            <SourceSummary
              files={sourceFiles.filter((file) => file.area === "miniprogram_source")}
            />

            <h5>待审批发布申请</h5>
            {releaseError ? <p className="miniprogram-config-error">{releaseError}</p> : null}
            {releaseNotice ? <p className="muted miniprogram-note">{releaseNotice}</p> : null}
            {pendingReleaseRequests.length ? (
              <>
                {releaseSourceChanged ? (
                  <p className="miniprogram-approval-alert">
                    源码已变更，该申请已无法批准。请让提交人基于最新源码重新提交发布申请。
                  </p>
                ) : null}
                {writable ? null : (
                  <p className="muted miniprogram-note">
                    当前账号对该项目只读，无法批准或拒绝发布申请。
                  </p>
                )}
                <ul className="miniprogram-approval-list">
                  {pendingReleaseRequests.map((row) => (
                    <li key={row.id}>
                      <div className="miniprogram-approval-head">
                        <span className="miniprogram-status warning">
                          {row.statusLabel || "待审批"}
                        </span>
                        <span className="miniprogram-approval-target">{row.targetLabel}</span>
                        <span className="miniprogram-approval-version">{row.version || "—"}</span>
                      </div>
                      {row.releaseNote ? (
                        <p className="miniprogram-approval-note">{row.releaseNote}</p>
                      ) : null}
                      <p className="muted miniprogram-note">
                        环境 {row.environment} · 申请人{" "}
                        {REQUESTER_KIND_LABELS[row.requestedByKind] || row.requestedByKind} ·{" "}
                        {row.createdAt || "—"}
                      </p>
                      {writable ? (
                        <div className="miniprogram-config-actions">
                          <button
                            type="button"
                            disabled={releaseBusy !== "" || releaseSourceChanged}
                            onClick={() => void decideReleaseRequest(row, "approve")}
                          >
                            {releaseBusy === `approve:${row.id}` ? "批准中…" : "批准并执行"}
                          </button>
                          <button
                            type="button"
                            className="miniprogram-danger"
                            disabled={releaseBusy !== ""}
                            onClick={() => {
                              setRejectingId(row.id);
                              setRejectReason("");
                            }}
                          >
                            拒绝
                          </button>
                        </div>
                      ) : null}
                      {writable && rejectingId === row.id ? (
                        <div className="miniprogram-approval-reject">
                          <label className="miniprogram-field">
                            <span>拒绝理由</span>
                            <input
                              type="text"
                              value={rejectReason}
                              placeholder="必填，会记录在申请上"
                              autoComplete="off"
                              onChange={(event) => setRejectReason(event.target.value)}
                            />
                          </label>
                          <div className="miniprogram-config-actions">
                            <button
                              type="button"
                              className="miniprogram-danger"
                              disabled={releaseBusy !== "" || !rejectReason.trim()}
                              onClick={() => void decideReleaseRequest(row, "reject")}
                            >
                              {releaseBusy === `reject:${row.id}` ? "提交中…" : "确认拒绝"}
                            </button>
                            <button
                              type="button"
                              disabled={releaseBusy !== ""}
                              onClick={() => {
                                setRejectingId("");
                                setRejectReason("");
                              }}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted miniprogram-note">没有待审批的发布申请。</p>
            )}
            {decidedReleaseRequests.length ? (
              <>
                <p className="muted miniprogram-note">最近处理结果</p>
                <ul className="miniprogram-approval-history">
                  {decidedReleaseRequests.map((row) => (
                    <li key={row.id}>
                      <span className={`miniprogram-status ${releaseStatusTone(row.status)}`}>
                        {row.statusLabel || row.status}
                      </span>
                      <span className="miniprogram-approval-target">{row.targetLabel}</span>
                      <span className="miniprogram-approval-version">{row.version || "—"}</span>
                      <span className="muted">{row.decidedAt || row.updatedAt || ""}</span>
                      {row.lastError || row.decisionNote ? (
                        <span className="miniprogram-approval-detail">
                          {row.lastError || row.decisionNote}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <h5>微信发布</h5>
            <div className="miniprogram-config-actions">
              <button
                type="button"
                disabled={!enabled || wechatBusy !== null}
                onClick={() => void generateWechatPreview()}
              >
                {wechatBusy === "preview" ? "生成中…" : "生成开发版预览二维码"}
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
            ) : null}

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
                  上传是发布动作：会写入微信后台的开发版本，提交审核仍需在微信后台完成。微信还要求调用方
                  IP 在白名单内。
                </p>
              </>
            ) : (
              <p className="muted miniprogram-note">当前账号对该项目只读，无法上传版本。</p>
            )}

            <h5>发布记录</h5>
            {deployments.length ? (
              <ul className="miniprogram-deploy-list">
                {deployments.map((row) => (
                  <li key={row.id}>
                    <button type="button" onClick={() => void openDeployment(row.id)}>
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
                    {openDeploymentId === row.id ? (
                      <pre className="miniprogram-doc-result">{deploymentLog}</pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted miniprogram-note">还没有发布记录。</p>
            )}
          </section>
        ) : null}

        {tab === "admin" ? (
          <section className="miniprogram-panel">
            <header className="miniprogram-panel-head">
              <h4>Admin</h4>
              <span className={`miniprogram-status ${adminStatusTone}`}>{adminStatusLabel}</span>
            </header>
            <div className="miniprogram-config-actions">
              <button type="button" disabled={adminBusy} onClick={() => void loadAdminServers()}>
                <UiIcon name="refresh" size={13} /> 刷新状态
              </button>
              {activeAdminServer ? (
                <button
                  type="button"
                  className="miniprogram-danger"
                  disabled={adminBusy}
                  onClick={() => void stopAdminServer(activeAdminServer.id)}
                >
                  停止服务
                </button>
              ) : null}
            </div>
            {adminError ? <p className="miniprogram-config-error">{adminError}</p> : null}
            {activeAdminServer ? (
              <>
                <dl className="miniprogram-meta">
                  <div>
                    <dt>端口</dt>
                    <dd>{activeAdminServer.port || "—"}</dd>
                  </div>
                  <div>
                    <dt>代理路径</dt>
                    <dd>{activeAdminServer.proxyBase}</dd>
                  </div>
                  <div>
                    <dt>最近活动</dt>
                    <dd>{activeAdminServer.lastActivityAt || "—"}</dd>
                  </div>
                </dl>
                {activeAdminServer.status === "running" ? (
                  <div className="miniprogram-canvas-shell">
                    <div className="miniprogram-canvas-bar">
                      <span className="miniprogram-canvas-state running">运行中</span>
                      <button type="button" onClick={() => setAdminFrameKey((value) => value + 1)}>
                        重新加载
                      </button>
                    </div>
                    <iframe
                      key={adminFrameKey}
                      className="miniprogram-admin-frame"
                      title="PC 管理后台预览"
                      src={activeAdminServer.proxyBase}
                    />
                  </div>
                ) : (
                  <PendingPanel
                    icon="monitor"
                    title={
                      activeAdminServer.status === "failed"
                        ? "开发服务器启动失败"
                        : "开发服务器启动中"
                    }
                    detail={
                      activeAdminServer.error ||
                      `L3 需用 --base=${activeAdminServer.proxyBase} 启动开发服务器，再标记为 running。`
                    }
                  />
                )}
              </>
            ) : (
              <PendingPanel
                icon="monitor"
                title="还没有 Admin 开发服务器"
                detail={
                  config?.adminDeploy
                    ? "L3 在任务中用 miniprogram_register_admin_preview 登记端口并启动开发服务器后，这里会实时显示管理后台。"
                    : "请先在「项目管理 → 小程序与云开发」配置 Admin 发布目标。"
                }
              />
            )}
            {writable ? null : <p className="muted">当前账号对该项目只读，无法停止服务。</p>}
          </section>
        ) : null}

        {tab === "database" ? (
          <section className="miniprogram-panel">
            <header className="miniprogram-panel-head">
              <h4>数据库</h4>
              <span className="miniprogram-status muted">{cbEnv}</span>
            </header>
            <label className="miniprogram-field">
              <span>环境</span>
              <select value={cbEnv} onChange={(event) => setCbEnv(event.target.value)}>
                {cbEnvironments
                  .filter((item) => item.configured)
                  .map((item) => (
                    <option key={item.kind} value={item.kind}>
                      {item.label}（{item.envId}）
                    </option>
                  ))}
                {cbEnvironments.some((item) => item.configured) ? null : (
                  <option value="development">未配置环境</option>
                )}
              </select>
            </label>
            <label className="miniprogram-field">
              <span>集合名</span>
              <input
                type="text"
                value={dbCollection}
                placeholder="orders"
                list="miniprogram-collection-options"
                autoComplete="off"
                onChange={(event) => setDbCollection(event.target.value)}
              />
              <datalist id="miniprogram-collection-options">
                {collections.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="miniprogram-field">
              <span>查询条件</span>
              <input
                type="text"
                value={dbWhere}
                placeholder='{"status":"open"}（可留空）'
                autoComplete="off"
                onChange={(event) => setDbWhere(event.target.value)}
              />
            </label>
            <label className="miniprogram-field">
              <span>条数上限</span>
              <input
                type="number"
                min={1}
                max={200}
                value={dbLimit}
                onChange={(event) => setDbLimit(Number(event.target.value) || 20)}
              />
            </label>
            <div className="miniprogram-config-actions">
              <button
                type="button"
                disabled={dbBusy || !dbCollection}
                onClick={() => void runDbQuery()}
              >
                {dbBusy ? "处理中…" : "查询"}
              </button>
            </div>
            <div className="miniprogram-config-actions">
              <button
                type="button"
                disabled={browseBusy !== null}
                onClick={() => void loadCollections()}
              >
                {browseBusy === "collections"
                  ? "载入中…"
                  : `载入集合列表${collections.length ? `（${collections.length}）` : ""}`}
              </button>
            </div>
            {browseError ? <p className="miniprogram-config-error">{browseError}</p> : null}
            <p className="muted miniprogram-note">
              集合列表通过 CloudBase 管理面接口载入；载入后集合名输入框可直接补全。
            </p>
            {dbError ? <p className="miniprogram-config-error">{dbError}</p> : null}
            {dbNotice ? <p className="muted miniprogram-note">{dbNotice}</p> : null}
            {dbDocs.length ? (
              <ul className="miniprogram-doc-list">
                {dbDocs.map((doc, index) => (
                  <li key={String(doc._id || index)}>
                    <button type="button" onClick={() => selectDocument(doc)}>
                      {String(doc._id || `文档 ${index + 1}`)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {dbSelectedId || dbDraft ? (
              <div className="miniprogram-doc-editor">
                <div className="miniprogram-doc-editor-head">
                  <strong>{dbSelectedId ? `文档 ${dbSelectedId}` : "新增文档"}</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setDbSelectedId("");
                      setDbDraft("");
                    }}
                  >
                    清空
                  </button>
                </div>
                <textarea
                  className="miniprogram-doc-textarea"
                  value={dbDraft}
                  spellCheck={false}
                  onChange={(event) => setDbDraft(event.target.value)}
                />
                <div className="miniprogram-config-actions">
                  <button
                    type="button"
                    disabled={dbBusy || !dbCollection}
                    onClick={() => void runDbWrite("add")}
                  >
                    新增
                  </button>
                  <button
                    type="button"
                    disabled={dbBusy || !dbCollection || !dbSelectedId}
                    onClick={() => void runDbWrite("update")}
                  >
                    保存修改
                  </button>
                  <button
                    type="button"
                    className="miniprogram-danger"
                    disabled={dbBusy || !dbCollection || !dbSelectedId}
                    onClick={() => void runDbWrite("remove")}
                  >
                    删除
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "storage" ? (
          <section className="miniprogram-panel">
            <header className="miniprogram-panel-head">
              <h4>文件存储</h4>
              <span className="miniprogram-status muted">{cbEnv}</span>
            </header>
            <label className="miniprogram-field">
              <span>环境</span>
              <select value={cbEnv} onChange={(event) => setCbEnv(event.target.value)}>
                {cbEnvironments
                  .filter((item) => item.configured)
                  .map((item) => (
                    <option key={item.kind} value={item.kind}>
                      {item.label}（{item.envId}）
                    </option>
                  ))}
              </select>
            </label>
            <label className="miniprogram-field">
              <span>存储路径</span>
              <input
                type="text"
                value={stCloudPath}
                placeholder="uploads/note.txt"
                autoComplete="off"
                onChange={(event) => setStCloudPath(event.target.value)}
              />
            </label>
            <label className="miniprogram-field miniprogram-field-column">
              <span>文本内容</span>
              <textarea
                className="miniprogram-doc-textarea"
                value={stContent}
                spellCheck={false}
                placeholder="要上传的文本内容"
                onChange={(event) => setStContent(event.target.value)}
              />
            </label>
            <div className="miniprogram-config-actions">
              <button
                type="button"
                disabled={stBusy || !stCloudPath || !stContent}
                onClick={() => void uploadToStorage()}
              >
                上传文本
              </button>
            </div>
            <label className="miniprogram-field miniprogram-field-column">
              <span>文件 ID 列表</span>
              <textarea
                className="miniprogram-doc-textarea"
                value={stFileList}
                spellCheck={false}
                placeholder='["cloud://env.xxx/uploads/note.txt"]'
                onChange={(event) => setStFileList(event.target.value)}
              />
            </label>
            <div className="miniprogram-config-actions">
              <button
                type="button"
                disabled={stBusy || !stFileList}
                onClick={() => void manageStorage("urls")}
              >
                获取临时地址
              </button>
              <button
                type="button"
                className="miniprogram-danger"
                disabled={stBusy || !stFileList}
                onClick={() => void manageStorage("delete")}
              >
                删除文件
              </button>
            </div>
            <div className="miniprogram-field">
              <span>浏览路径</span>
              <input
                type="text"
                value={browsePath}
                placeholder="uploads（留空为整桶）"
                autoComplete="off"
                onChange={(event) => setBrowsePath(event.target.value)}
              />
            </div>
            <div className="miniprogram-config-actions">
              <button
                type="button"
                disabled={browseBusy !== null}
                onClick={() => void browseStorage()}
              >
                {browseBusy === "files" ? "载入中…" : "浏览远端目录"}
              </button>
            </div>
            {storageFiles.length ? (
              <ul className="miniprogram-doc-list">
                {storageFiles.map((file) => (
                  <li key={file.key}>
                    <button
                      type="button"
                      title="填入上传路径"
                      onClick={() => setStCloudPath(file.key)}
                    >
                      {file.key}
                      {file.isDirectory ? "" : ` · ${file.size} B`}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="muted miniprogram-note">
              目录内容通过 CloudBase
              管理面接口列举，点选可填入上传路径。注意：管理器返回的是对象键，
              而获取临时地址与删除需要 cloud:// 文件 ID，两者不可混用，所以下载与删除仍需粘贴文件
              ID。
            </p>
            {stError ? <p className="miniprogram-config-error">{stError}</p> : null}
            {stResult ? <pre className="miniprogram-doc-result">{stResult}</pre> : null}
          </section>
        ) : null}

        {tab === "auth" || tab === "stats" ? (
          <section className="miniprogram-panel">
            <header className="miniprogram-panel-head">
              <h4>{MINIPROGRAM_TABS.find((item) => item.id === tab)?.label}</h4>
              <span className="miniprogram-status muted">{devEnv || "未配置环境"}</span>
            </header>
            <PendingPanel
              icon={MINIPROGRAM_TABS.find((item) => item.id === tab)?.icon || "shield"}
              title="该面板尚未接入"
              detail={
                devEnv
                  ? `已配置开发环境 ${devEnv}。接入后本页通过 CoThread 后端代理访问 CloudBase，浏览器不会持有管理凭据。`
                  : "请先在「项目管理 → 小程序与云开发」配置 CloudBase 开发环境。"
              }
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
