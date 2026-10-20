import React, { useCallback, useEffect, useRef, useState } from "react";
import { readJsonResponse } from "../shared/json-response.js";
import { UiIcon } from "./ui-icon";
import { DialogClose, ModalBackdrop } from "./dialog-fx";
import { databaseFilterCount, type DatabaseFilterSpec } from "./DatabaseFilterBuilder";
import { showTip } from "./Tip";
import {
  PREVIEW_DEFAULT_DEVICE_ID,
  PREVIEW_DEVICES,
  PREVIEW_ZOOM_OPTIONS,
} from "./MiniProgramDeviceShell";
import "./miniprogram.css";
import { MiniprogramAdminPanel } from "./MiniprogramAdminPanel";
import { MiniprogramDatabasePanel } from "./MiniprogramDatabasePanel";
import { MiniprogramStoragePanel } from "./MiniprogramStoragePanel";
import { MiniprogramServerPanel } from "./MiniprogramServerPanel";
import { MiniprogramDeployPanel } from "./MiniprogramDeployPanel";
import { MiniprogramPreviewPanel } from "./MiniprogramPreviewPanel";

import {
  MINIPROGRAM_TABS,
  TAB_STATE_KEY,
  normalizedStoragePath,
  joinStoragePath,
  storageFileName,
  fileAsBase64,
  readStoredAdminView,
  storeAdminView,
  readStoredTab,
  ADMIN_STATUS_LABELS,
  ADMIN_STATUS_TONES,
  TABLE_PAGE_SIZE,
  type MiniProgramTabId,
  type MiniProgramConfig,
  type StorageFile,
  type AdminDeviceMode,
  type AdminServer,
  type AdminServerList,
  type CloudbaseEnvInfo,
  type DeploymentRow,
  type CloudbaseFunction,
  type DatabaseEnvironment,
  type ReleaseApplication,
  type PreviewMeta,
} from "./miniprogram-internals";

export function MiniProgramWorkspace({
  projectId,
  request,
  writable,
  currentUserId,
  owner,
  embeddedInSidebar = false,
}: {
  projectId: string;
  request: (path: string, options?: RequestInit) => Promise<Response>;
  writable: boolean;
  currentUserId: string;
  owner: boolean;
  embeddedInSidebar?: boolean;
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
  const [previewBuilds, setPreviewBuilds] = useState<DeploymentRow[]>([]);
  const [openDeploymentId, setOpenDeploymentId] = useState("");
  const [deploymentLog, setDeploymentLog] = useState("");
  const [releaseApplications, setReleaseApplications] = useState<ReleaseApplication[]>([]);
  const [releaseSearch, setReleaseSearch] = useState("");
  const [releasePage, setReleasePage] = useState(0);
  const [releasePageSize, setReleasePageSize] = useState(TABLE_PAGE_SIZE);
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
      const data = (await readJsonResponse(response, "CloudBase 云函数列表")) as {
        functions: CloudbaseFunction[];
      };
      setServerFunctions(data.functions || []);
    } catch (cause) {
      setServerFunctions([]);
      setServerError(cause instanceof Error ? cause.message : "读取 CloudBase 云函数失败");
    } finally {
      setServerBusy(false);
    }
  }, [functionEnvironment, projectId, request]);

  const loadReleaseFunctions = useCallback(async () => {
    try {
      const response = await request(
        `/api/projects/${projectId}/cloudbase/functions?environment=development`,
      );
      const data = (await readJsonResponse(response, "待发布 CloudBase 云函数")) as {
        functions: CloudbaseFunction[];
      };
      setReleaseFunctions(data.functions || []);
    } catch (cause) {
      setReleaseFunctions([]);
      setReleaseError(cause instanceof Error ? cause.message : "读取待发布 CloudBase 云函数失败");
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

  const startAdminServer = async (serverId?: string, force = false) => {
    setAdminBusy(true);
    setAdminError("");
    try {
      const response = await request(`/api/projects/${projectId}/miniprogram/dev-servers/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(serverId ? { serverId } : {}),
          ...(force ? { force: true } : {}),
        }),
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
      const response = await request(
        `/api/projects/${projectId}/miniprogram/deployments?limit=100`,
      );
      const data = (await readJsonResponse(response, "发布记录")) as {
        deployments: DeploymentRow[];
      };
      setDeployments(data.deployments || []);
    } catch {
      setDeployments([]);
    }
    try {
      const response = await request(
        `/api/projects/${projectId}/miniprogram/builds?kind=app_preview&limit=100`,
      );
      const data = (await readJsonResponse(response, "编译记录")) as {
        builds: Array<{
          id: string;
          status: string;
          createdAt: string | null;
          finishedAt: string | null;
          operatorName?: string | null;
        }>;
      };
      setPreviewBuilds(
        (data.builds || []).map((build) => ({
          id: build.id,
          target: "app_preview",
          environment: "development",
          status: build.status,
          version: null,
          url: null,
          publishedAt: build.finishedAt,
          createdAt: build.createdAt,
          operatorName: build.operatorName || null,
          recordKind: "build" as const,
        })),
      );
    } catch {
      setPreviewBuilds([]);
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
      const build = previewBuilds.some((row) => row.id === id);
      const response = await request(
        build
          ? `/api/projects/${projectId}/miniprogram/builds/${id}`
          : `/api/projects/${projectId}/miniprogram/deployments/${id}`,
      );
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
  const selectedReleaseApplication = releaseApplications.find(
    (application) => application.id === releaseDetailId,
  );
  const releaseSearchLower = releaseSearch.trim().toLocaleLowerCase();
  const visibleReleaseApplications = releaseApplications.filter((application) => {
    if (!releaseSearchLower) return true;
    const content = application.items
      .map((item) => item.resourceName || item.targetLabel)
      .join(" ");
    const haystack = [content, application.releaseNote || "", application.statusLabel || ""]
      .join(" ")
      .toLocaleLowerCase();
    return haystack.includes(releaseSearchLower);
  });
  const pagedReleaseApplications = visibleReleaseApplications.slice(
    releasePage * releasePageSize,
    (releasePage + 1) * releasePageSize,
  );
  const releaseHasNext = (releasePage + 1) * releasePageSize < visibleReleaseApplications.length;
  const wechatDeployments = [
    ...previewBuilds,
    ...deployments.filter(
      (row) => row.target === "wechat_preview" || row.target === "wechat_upload",
    ),
  ].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
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
  useEffect(() => {
    setReleasePage(0);
  }, [releaseSearch]);
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
      await loadDeployments();
    } catch (cause) {
      setBuildError(cause instanceof Error ? cause.message : "编译失败");
      try {
        setMeta(await loadMeta());
        await loadDeployments();
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

  const previewPanelProps = {
    tab,
    setTab,
    writable,
    projectId,
    enabled,
    meta,
    setMeta,
    previewRoute,
    buildError,
    setBuildError,
    building,
    setBuilding,
    reloadKey,
    setReloadKey,
    refreshMenuOpen,
    setRefreshMenuOpen,
    refreshMenuRef,
    rebuild,
    openAction,
    setOpenAction,
    wechatBusy,
    setWechatBusy,
    wechatError,
    setWechatError,
    wechatNotice,
    setWechatNotice,
    qrDataUrl,
    setQrDataUrl,
    uploadVersion,
    setUploadVersion,
    uploadDesc,
    setUploadDesc,
    generateWechatPreview,
    uploadWechatVersion,
    wechatDeployments,
    openDeploymentId,
    setOpenDeploymentId,
    deploymentLog,
    setDeploymentLog,
    openDeployment,
  };
  const deployPanelProps = {
    tab,
    setTab,
    writable,
    owner,
    currentUserId,
    releaseBusy,
    releaseError,
    setReleaseError,
    releaseNotice,
    setReleaseNotice,
    releaseSearch,
    setReleaseSearch,
    releaseApplications,
    visibleReleaseApplications,
    pagedReleaseApplications,
    releasePage,
    setReleasePage,
    releasePageSize,
    setReleasePageSize,
    releaseHasNext,
    releaseDetailId,
    setReleaseDetailId,
    selectedReleaseApplication,
    releaseCreateOpen,
    setReleaseCreateOpen,
    releaseSelection,
    setReleaseSelection,
    releaseFunctions,
    setReleaseFunctions,
    releaseNote,
    setReleaseNote,
    rejectingId,
    setRejectingId,
    rejectReason,
    setRejectReason,
    adminProductionPath,
    setAdminProductionPath,
    adminProductionAddress,
    loadReleaseApplications,
    loadReleaseFunctions,
    loadDeployments,
    submitReleaseApplication,
    decideReleaseApplication,
    cancelReleaseApplication,
  };
  const serverPanelProps = {
    tab,
    setTab,
    writable,
    serverBusy,
    serverError,
    setServerError,
    functionSearch,
    setFunctionSearch,
    visibleFunctions,
    functionPage,
    setFunctionPage,
    functionPageSize,
    setFunctionPageSize,
    functionHasNext,
    pagedFunctions,
    cbEnvironments,
    functionEnvironment,
    setFunctionEnvironment,
    loadServerFunctions,
    serverFunctions,
    timerFunctionName,
    setTimerFunctionName,
    selectedTimerFunction,
    timerLimitReached,
    timerEditorOpen,
    setTimerEditorOpen,
    timerEditingName,
    setTimerEditingName,
    timerName,
    setTimerName,
    timerSchedule,
    setTimerSchedule,
    timerError,
    setTimerError,
    timerToDelete,
    setTimerToDelete,
    timerNameValid,
    timerNameDuplicate,
    timerScheduleValid,
    saveTimer,
    disableTimer,
    serverDeployments,
    loadDeployments,
  };
  const storagePanelProps = {
    tab,
    setTab,
    writable,
    projectId,
    browseBusy,
    storageActionBusy,
    browsePath,
    browseError,
    setBrowseError,
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
  };
  const databasePanelProps = {
    tab,
    setTab,
    dbEnvironment,
    setDbEnvironment,
    switchDatabaseEnvironment,
    browseBusy,
    setBrowseBusy,
    loadCollections,
    collections,
    setCollections,
    cbEnvironments,
    dbCollection,
    setDbCollection,
    openDocumentCollection,
    dbFilter,
    setDbFilter,
    dbFilterOpen,
    setDbFilterOpen,
    browseError,
    setBrowseError,
    dbError,
    setDbError,
    dbDocs,
    documentColumns,
    dbPage,
    setDbPage,
    dbLimit,
    setDbLimit,
    dbTotal,
    dbHasNext,
    setDbHasNext,
    runDbQuery,
  };
  const adminPanelProps = {
    tab,
    setTab,
    writable,
    adminPreviewRunning,
    activeAdminServer,
    adminStatusLabel,
    adminStatusTone,
    adminServiceTitle,
    adminServiceDescription,
    adminFrameRef,
    adminFrameKey,
    setAdminFrameKey,
    adminDialogOpen,
    setAdminDialogOpen,
    adminDeviceMode,
    setAdminDeviceMode,
    adminDeviceId,
    setAdminDeviceId,
    adminZoomMode,
    setAdminZoomMode,
    adminError,
    setAdminError,
    adminBusy,
    setAdminBusy,
    startAdminServer,
    stopAdminServer,
    loadAdminServers,
  };
  return (
    <div className="miniprogram-workspace">
      {embeddedInSidebar ? (
        <div className="doc-browser-tabbar miniprogram-embedded-tabbar" aria-label="小程序工作区">
          <div className="doc-browser-tabs" role="tablist">
            {MINIPROGRAM_TABS.map((item) => (
              <div
                key={item.id}
                className={`doc-browser-tab doc-browser-tab-no-close${tab === item.id ? " active" : ""}`}
              >
                <button
                  type="button"
                  role="tab"
                  className="doc-browser-tab-open"
                  aria-selected={tab === item.id}
                  disabled={
                    !devEnv &&
                    (item.id === "admin" ||
                      item.id === "database" ||
                      item.id === "storage" ||
                      item.id === "server" ||
                      item.id === "deploy")
                  }
                  title={
                    !devEnv && item.id !== "preview" ? "需要先配置 CloudBase 开发环境" : undefined
                  }
                  onClick={() => setTab(item.id)}
                >
                  <UiIcon name={item.icon} size={13} />
                  <span className="doc-browser-tab-label">{item.label}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <nav className="miniprogram-tabs" aria-label="小程序工作区" role="tablist">
          {MINIPROGRAM_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={tab === item.id ? "active" : ""}
              aria-selected={tab === item.id}
              disabled={
                !devEnv &&
                (item.id === "admin" ||
                  item.id === "database" ||
                  item.id === "storage" ||
                  item.id === "server" ||
                  item.id === "deploy")
              }
              title={!devEnv && item.id !== "preview" ? "需要先配置 CloudBase 开发环境" : undefined}
              onClick={() => setTab(item.id)}
            >
              <UiIcon name={item.icon} size={13} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}

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
                    : tab === "deploy"
                      ? "miniprogram-deploy-tab-body"
                      : ""
        }`}
        role="tabpanel"
      >
        {error ? <p className="miniprogram-config-error">{error}</p> : null}
        {!enabled ? (
          <p className="miniprogram-workspace-notice">
            请在「项目管理 → 小程序」填写微信 AppID。CloudBase 单独配置；不配时 Admin
            预览、云数据库、云存储、云函数和静态托管不可用。
          </p>
        ) : null}

        <MiniprogramPreviewPanel {...previewPanelProps} />

        <MiniprogramAdminPanel {...adminPanelProps} />

        <MiniprogramServerPanel {...serverPanelProps} />

        <MiniprogramDeployPanel {...deployPanelProps} />

        <MiniprogramDatabasePanel {...databasePanelProps} />

        <MiniprogramStoragePanel {...storagePanelProps} />
      </div>
    </div>
  );
}
