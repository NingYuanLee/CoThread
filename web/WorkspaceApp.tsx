import { DialogBody } from "./DialogBody";
import { DialogHeader } from "./DialogHeader";
import { useComposerStageMetrics } from "./use-composer-stage";
import { useConversationSelection } from "./use-conversation-selection";
import { useAccountSession } from "./use-account-session";
import { useProjectTasks } from "./use-project-tasks";
import { useThreadTaskStats } from "./use-thread-task-stats";
import React, {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import "./workspace.css";
import { type UsageStats } from "./MessageUsage";
import { useAgentLiveOutput } from "./useAgentLiveOutput";
import { isExecutorReply, liveCoordinatorDraft, taskTimeline } from "./chat-timeline";
import { bindMessageMarkdownOpener } from "./message-markdown-opener";
const QuoteMarkdown = lazy(() =>
  import("./QuoteMarkdown").then((module) => ({ default: module.QuoteMarkdown })),
);
import type { ComposerController } from "./ChatComposer";

import { AGENT_XIAOXIANG_MEMBER, AGENT_MEMBER } from "../shared/agent-member.js";
import { formatMcpCopyPayload } from "../shared/mcp-guide.js";
import { WorkspaceModals } from "./WorkspaceModals";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceTopbar } from "./WorkspaceTopbar";
import { TaskListDialog } from "./TaskListDialog";

import { AgentRoundView } from "./AgentRoundView";
import { useProjectActivity } from "./use-project-activity";
import { useThreadActivity } from "./use-thread-activity";
import { useThreadReadReceipt } from "./use-thread-read-receipt";
import { submitWorkspaceModal } from "./workspace-modal-submit";
import { ThreadRow } from "./ThreadRow";
import { WorkspaceWelcome } from "./WorkspaceWelcome";
import { ConversationHeader } from "./ConversationHeader";
import { TaskCreateDialog } from "./TaskCreateDialog";
import { ConversationStage } from "./ConversationStage";
import { ElderChat } from "./ElderChat";
import { CitationSources } from "./CitationSources";
import { citeGroupId, webCitationsInBody } from "../shared/citations.js";
import { coordinatorLogButtonLabel, COORDINATOR_LOG_IDLE_LABEL } from "./agent-label";
const Documents = lazy(() =>
  import("./Documents").then((module) => ({ default: module.Documents })),
);
const MiniProgramWorkspace = lazy(() =>
  import("./MiniProgramWorkspace").then((module) => ({ default: module.MiniProgramWorkspace })),
);
import { ContextPanelModeSwitch } from "./ContextPanelModeSwitch";
import {
  readThreadDialogueMode,
  writeThreadDialogueMode,
  type DialogueMode,
} from "./dialogue-mode-storage";

const ProjectManagement = lazy(() =>
  import("./ProjectManagement").then((module) => ({ default: module.ProjectManagement })),
);
const ProjectMemory = lazy(() =>
  import("./ProjectMemory").then((module) => ({ default: module.ProjectMemory })),
);
import type { MemoryCounts } from "./ProjectMemory";
const AgentMonitor = lazy(() =>
  import("./AgentMonitor").then((module) => ({ default: module.AgentMonitor })),
);
const LocalExecutorAuthorization = lazy(() =>
  import("./LocalExecutorAuthorization").then((module) => ({
    default: module.LocalExecutorAuthorization,
  })),
);
import { applyUiTheme } from "./apply-ui-theme";
import { DEFAULT_UI_THEME } from "../shared/ui-theme.js";
import type { AgentLogScope } from "./trajectory-model";
const AgentTrajectory = lazy(() =>
  import("./AgentLogDialog").then((module) => ({ default: module.AgentTrajectory })),
);
const AgentLogDialog = lazy(() =>
  import("./AgentLogDialog").then((module) => ({ default: module.AgentLogDialog })),
);
import type { LocalExecutorDevice } from "./LocalExecutorPanel";
import { createResourceCache } from "../shared/resource-cache.js";
import { mergeThread } from "../shared/thread-window.js";
import { readThreadPages } from "../shared/thread-reader.js";
import { sameSnapshot } from "../shared/poll-signature.js";

import { MessageContextMenu } from "./thread-menus";
import { labelReasoningEffort } from "./ui-labels";
import { UiIcon } from "./ui-icon";
import { ModalBackdrop } from "./dialog-fx";
import { showTip, useTipError } from "./Tip";
const DeleteConfirmDialog = lazy(() =>
  import("./DeleteConfirmDialog").then((module) => ({ default: module.DeleteConfirmDialog })),
);
const ThreadArchiveDialog = lazy(() =>
  import("./ThreadArchiveDialog").then((module) => ({ default: module.ThreadArchiveDialog })),
);
const ThreadBriefDialog = lazy(() =>
  import("./ThreadBriefDialog").then((module) => ({ default: module.ThreadBriefDialog })),
);
const ImagePreviewDialog = lazy(() =>
  import("./ImagePreview").then((module) => ({ default: module.ImagePreviewDialog })),
);
import { fileDisplayName, isImageFile } from "../shared/document-name.js";
import { libraryFolderPath, folderDisplayName } from "./document-library";
import { api } from "./workspace-api";
import {
  persistOptimisticMessage as persistOptimisticMessageImpl,
  sendOptimisticMessage as sendOptimisticMessageImpl,
  type OptimisticMessagePayload,
} from "./optimistic-messages";
import { apiFetch } from "./api-fetch";
import {
  ELDER_SPLIT_RATIO_KEY,
  LEFT_SIDEBAR_STATE_KEY,
  RIGHT_SIDEBAR_STATE_KEY,
  clampElderSplitRatio,
  localDate,
  readStoredBoolean,
  readStoredElderSplitRatio,
} from "./workspace-format";

import { ProjectPicker } from "./ProjectPicker";
import { BootScreen } from "./BootScreen";
const LoginScreen = lazy(() =>
  import("./LoginScreen").then((module) => ({ default: module.LoginScreen })),
);
import { useActionTooltips } from "./use-action-tooltips";
import type { Detail, MessageQuote, Modal, Project, Thread, Version } from "./workspace-types";

import {
  type ThreadMessage,
  EMPTY_FOLDERS,
  EMPTY_VERSIONS,
  EMPTY_JOBS,
  selectionTextInside,
  resolveProjectThreadId,
} from "./workspace-helpers";
export function WorkspaceApp() {
  useActionTooltips();

  const {
    user,
    savedAccounts,
    acceptProfile,
    revision: sessionRevision,
    forgetSavedLogin,
    logoutCurrent,
    loginAnother,
    switchSavedAccount,
  } = useAccountSession();
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [projectImage, setProjectImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState("");
  const bootstrappedUser = useRef<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const visibleProjects = projects.filter((p) => p.tab_visible);
  const currentProject = projects.find((item) => item.id === projectId);
  const availableProjects = projects
    .filter((p) => !p.tab_visible)
    .sort(
      (left, right) =>
        Date.parse(right.joined_at || right.created_at) -
        Date.parse(left.joined_at || left.created_at),
    );
  const [draggedProject, setDraggedProject] = useState("");
  const [projectDrop, setProjectDrop] = useState<{
    id: string;
    after: boolean;
  } | null>(null);
  const projectCache = useRef(createResourceCache<Detail>());
  const threadCache = useRef(createResourceCache<Thread>());
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRequest = useRef<AbortController | null>(null);
  const messageAvatar = (m: Thread["messages"][number]) => {
    const member = detail?.members.find((member) => member.id === m.author_id);
    return member ? member.avatar : m.author_avatar;
  };
  const messageMotto = (m: Thread["messages"][number]) => {
    if (m.source !== "assistant")
      return detail?.members.find((member) => member.id === m.author_id)?.motto || "";
    const record = m.agent_task_id
      ? thread?.replies.find((reply) => reply.message_id === m.agent_task_id)
      : thread?.replies.find((reply) => reply.reply_id === m.id) ||
        thread?.requests.find((request) => request.response_id === m.id);
    let usage: UsageStats = {};
    try {
      usage =
        typeof record?.usage_stats === "string"
          ? JSON.parse(record.usage_stats)
          : record?.usage_stats || {};
    } catch {}
    return usage.model
      ? `${usage.model} · ${labelReasoningEffort(usage.reasoningEffort)}`
      : detail?.members.find((member) => member.id === AGENT_XIAOXIANG_MEMBER.id)?.motto || "";
  };
  const readThread = (id: string, signal: AbortSignal): Promise<Thread> =>
    readThreadPages<Thread>(
      () => threadCache.current.get(id),
      (after, sideState) => {
        const revision = threadCache.current.get(id)?.side_revision;
        const revisionQuery =
          revision == null || sideState === "initial"
            ? ""
            : `&sideRevision=${encodeURIComponent(String(revision))}`;
        return api(
          `/threads/${id}?view=chat&sideState=${encodeURIComponent(sideState)}${revisionQuery}${after ? `&after=${after}` : ""}`,
          undefined,
          undefined,
          signal,
        );
      },
    );
  const [loadedDetail, setDetail] = useState<Detail | null>(null);
  const detail =
    loadedDetail?.id === projectId ? loadedDetail : projectCache.current.get(projectId) || null;
  const [threadId, setThreadId] = useState("");
  const [threadView, setThreadView] = useState<"chat" | "trajectory">("chat");
  const [elderOpen, setElderOpen] = useState(false);
  const [elderView, setElderView] = useState<"chat" | "trajectory">("chat");
  useEffect(() => {
    setThreadView("chat");
  }, [threadId]);
  const pendingNotification = useRef<{ projectId: string; threadId: string | null } | null>(null);
  const [loadedThread, setThread] = useState<Thread | null>(null);
  const thread =
    loadedThread?.id === threadId ? loadedThread : threadCache.current.get(threadId) || null;
  const hasPendingWork = (value: Thread | null | undefined) =>
    !!value &&
    (value.replies.some((r) => ["queued", "running"].includes(r.status)) ||
      !!value.requests?.some((r) => ["queued", "running"].includes(r.status)) ||
      ["queued", "running"].includes(value.contextUsage?.compactStatus) ||
      value.localExecutorTasks?.some((task) =>
        [
          "awaiting_approval",
          "queued",
          "running",
          "paused",
          "stopped_pending_approval",
          "completed_pending_notification",
          "failed_pending_notification",
        ].includes(task.status),
      ));
  const pendingWork = hasPendingWork(thread);
  const liveOutput = useAgentLiveOutput(threadId, pendingWork);
  const wakeThreadPoll = useRef<(() => void) | null>(null);
  const [error, setError] = useTipError();
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const composerApi = useRef<ComposerController | null>(null);
  const pendingDraftOps = useRef<Array<{ threadId: string; updater: (text: string) => string }>>(
    [],
  );
  const draftScope = projectId + ":" + threadId;
  const draftScopeRef = useRef(draftScope);
  if (draftScopeRef.current !== draftScope) {
    draftScopeRef.current = draftScope;
    pendingDraftOps.current = [];
  }
  const updateDraft = (updater: (text: string) => string) => {
    const api = composerApi.current;
    if (api) {
      api.updateDraft(updater);
      return;
    }
    pendingDraftOps.current.push({ threadId, updater });
  };
  const registerComposer = useCallback(
    (controller: ComposerController | null, mountedThreadId = "") => {
      composerApi.current = controller;
      if (!controller) return;
      const pending = pendingDraftOps.current.splice(0);
      for (const op of pending) {
        if (op.threadId === mountedThreadId) controller.updateDraft(op.updater);
      }
    },
    [],
  );
  const selection = useConversationSelection(`${user?.id || ""}:${projectId}:${threadId}`);
  const {
    preview: quotePreview,
    updateFiles: setRefs,
    updateFolders: setFolderRefs,
    showQuote: setQuotePreview,
  } = selection;
  const [copiedMessage, setCopiedMessage] = useState("");
  const [messageMenu, setMessageMenu] = useState<{
    x: number;
    y: number;
    message: ThreadMessage;
    selectedText: string;
  } | null>(null);
  useEffect(() => {
    setMessageMenu(null);
  }, [threadId]);
  const [threadRowMenuId, setThreadRowMenuId] = useState<string | null>(null);
  const [threadDeleteConfirm, setThreadDeleteConfirm] = useState<{
    id: string;
    title: string;
  } | null>(null);
  useEffect(() => {
    setThreadRowMenuId(null);
  }, [threadId]);
  const focusComposer = () => {
    requestAnimationFrame(() => {
      if (composerApi.current) composerApi.current.focus();
      else document.querySelector<HTMLTextAreaElement>('textarea[aria-label="发送消息"]')?.focus();
    });
  };
  const copyMessage = async (m: MessageQuote, selectedText = "") => {
    try {
      const text = selectedText.trim()
        ? selectedText
        : [
            m.body,
            ...(m.folder_refs || []).map((id) => {
              const folder = detail?.folders.find((item) => item.id === id);
              return folder
                ? `📁 ${libraryFolderPath(id, detail?.folders || []) || folderDisplayName(folder)}`
                : `📁 ${id}`;
            }),
            ...m.refs.map((id) => {
              const v = detail?.versions.find((item) => item.id === id);
              return `[${v?.title || id}](${location.origin}/api/versions/${id}/download)`;
            }),
          ]
            .filter(Boolean)
            .join("\n\n");
      await navigator.clipboard.writeText(text);
      setCopiedMessage(m.id);
      showTip(selectedText.trim() ? "已复制选中文本" : "消息已复制");
    } catch {
      setError("复制失败，请检查剪贴板权限。");
    }
  };
  useEffect(() => {
    if (!copiedMessage) return;
    const timer = setTimeout(() => setCopiedMessage(""), 2000);
    return () => clearTimeout(timer);
  }, [copiedMessage]);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [projectManagementOpen, setProjectManagementOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryCounts, setMemoryCounts] = useState<MemoryCounts | null>(null);
  const [codeSourcesTick, setCodeSourcesTick] = useState(0);
  const [agentLogScope, setAgentLogScope] = useState<AgentLogScope | null>(null);
  const [urlRevision, setUrlRevision] = useState(0);
  const localExecutorAuthorizationParams = new URLSearchParams(location.search);
  const localExecutorAuthorizationId =
    urlRevision >= 0
      ? localExecutorAuthorizationParams.get("localExecutorAuthorization") || ""
      : "";
  const localExecutorCallbackPort =
    localExecutorAuthorizationParams.get("localExecutorCallbackPort") || "";
  const connectorCallbackSecret =
    new URLSearchParams(location.hash.slice(1)).get("connectorCallbackSecret") || "";
  const localExecutorAuthorizationApi = useCallback(
    (path: string, data?: unknown, method?: string) => api(path, data, method),
    [],
  );
  const closeLocalExecutorAuthorization = () => {
    const url = new URL(location.href);
    url.searchParams.delete("localExecutorAuthorization");
    url.searchParams.delete("localExecutorCallbackPort");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    setUrlRevision((value) => value + 1);
  };
  const [localExecutors, setConnectors] = useState<LocalExecutorDevice[]>([]);
  const [connectorsReady, setConnectorsReady] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const [documentFocus, setDocumentFocus] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const panelWidthRef = useRef<number | null>(null);
  const [elderSplitRatio, setElderSplitRatio] = useState<number | null>(readStoredElderSplitRatio);
  const elderSplitRef = useRef(elderSplitRatio);
  const documentActions = useRef({
    refresh: async () => {},
    review: async (_id: string, _decision: string, _comment?: string) => {},
    reference: (_id: string) => {},
    requestRevision: async (_id: string, _target: "current" | "new", _title?: string) => {},
    addSelection: (_text: string, _id: string) => {},
    referenceFolder: (_id: string) => {},
    addToTask: (_id: string) => {},
    addFolderToTask: (_id: string) => {},
  });
  const refreshDocuments = useCallback(() => documentActions.current.refresh(), []);
  const reviewDocument = useCallback(
    (id: string, decision: string, comment?: string) =>
      documentActions.current.review(id, decision, comment),
    [],
  );
  const referenceDocument = useCallback((id: string) => documentActions.current.reference(id), []);
  const requestRevisionDocument = useCallback(
    (id: string, target: "current" | "new", title?: string) =>
      documentActions.current.requestRevision(id, target, title),
    [],
  );
  const addSelectionDocument = useCallback(
    (text: string, id: string) => documentActions.current.addSelection(text, id),
    [],
  );
  const referenceFolderDocument = useCallback(
    (id: string) => documentActions.current.referenceFolder(id),
    [],
  );
  const addDocumentToTask = useCallback((id: string) => documentActions.current.addToTask(id), []);
  const addFolderDocumentToTask = useCallback(
    (id: string) => documentActions.current.addFolderToTask(id),
    [],
  );
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const width = panelWidthRef.current;
    if (width) shell.style.setProperty("--right-panel", width + "px");
    else shell.style.removeProperty("--right-panel");
    const split = elderSplitRef.current;
    if (split == null) shell.style.removeProperty("--chat-elder-split");
    else {
      const main = shell.querySelector(":scope > main");
      const mainWidth = main?.getBoundingClientRect().width ?? 0;
      const ratio = mainWidth > 0 ? clampElderSplitRatio(split, mainWidth) : split;
      elderSplitRef.current = ratio;
      shell.style.setProperty("--chat-elder-split", `${ratio * 100}%`);
    }
  });
  const conversationRef = useRef<HTMLDivElement>(null);
  const composerAreaRef = useRef<HTMLDivElement>(null);
  useComposerStageMetrics(
    composerAreaRef,
    conversationRef,
    `${threadId}:${threadView}:${thread ? 1 : 0}`,
  );
  const navigationUntil = useRef(0);
  const navigateMessage = useCallback(() => {
    followConversation.current = false;
    navigationUntil.current = Date.now() + 1500;
  }, []);
  const followConversation = useRef(true);
  const followedThread = useRef(threadId);
  if (followedThread.current !== threadId) {
    followedThread.current = threadId;
    followConversation.current = true;
  }
  const uploadTarget = useRef<((files: File[]) => void) | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [leftOpen, setLeftOpen] = useState(() => readStoredBoolean(LEFT_SIDEBAR_STATE_KEY, false));
  const [contextOpen, setContextOpen] = useState(() =>
    readStoredBoolean(RIGHT_SIDEBAR_STATE_KEY, false),
  );
  const [dialogueMode, setDialogueMode] = useState<DialogueMode>("default");
  const [memoryFocusId, setMemoryFocusId] = useState("");
  const [documentFullscreen, setDocumentFullscreen] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(LEFT_SIDEBAR_STATE_KEY, String(leftOpen));
    } catch {}
  }, [leftOpen]);
  useEffect(() => {
    try {
      localStorage.setItem(RIGHT_SIDEBAR_STATE_KEY, String(contextOpen));
    } catch {}
  }, [contextOpen]);
  useEffect(() => {
    if (!threadId) {
      setDialogueMode("default");
      return;
    }
    setDialogueMode(readThreadDialogueMode(threadId));
  }, [threadId]);
  const applyDialogueMode = useCallback(
    (mode: DialogueMode) => {
      setDialogueMode(mode);
      if (threadId) writeThreadDialogueMode(threadId, mode);
      if (mode === "cloudbase" || mode === "miniprogram") setContextOpen(true);
    },
    [threadId],
  );
  const applyContextPanelMode = useCallback(
    (panelMode: "standard" | "cloudbase") => {
      if (panelMode === "cloudbase") {
        setDialogueMode((current) => {
          if (current === "miniprogram") return current;
          if (threadId) writeThreadDialogueMode(threadId, "cloudbase");
          return "cloudbase";
        });
        setContextOpen(true);
        return;
      }
      setDialogueMode((current) => {
        if (current !== "cloudbase" && current !== "miniprogram") return current;
        if (threadId) writeThreadDialogueMode(threadId, "default");
        return "default";
      });
    },
    [applyDialogueMode, threadId],
  );
  const handleDocumentFullscreenChange = useCallback((fullscreen: boolean) => {
    setDocumentFullscreen(fullscreen);
    if (fullscreen) {
      setContextOpen(true);
      setLeftOpen(false);
    }
  }, []);

  const [imagePreview, setImagePreview] = useState<{
    id: string;
    title: string;
    filename?: string;
  } | null>(null);
  const showDocument = (id?: string) => {
    setQuotePreview(null);
    setDocumentId(id || detail?.versions.find((v) => !v.deleted_at)?.id || "");
    setContextOpen(true);
    setDocumentFocus((value) => value + 1);
  };
  const versionRefLabel = (ref: string, version?: Version) => {
    if (!version) return ref;
    return version.review === "confirmed" ||
      version.review === "draft" ||
      version.folder_kind === "project_cache" ||
      version.folder_kind === "iteration_cache"
      ? version.title
      : `${version.title} · v${version.version}`;
  };
  const openConversationFile = (id: string) => {
    const version = detail?.versions.find((item) => item.id === id);
    if (version && isImageFile(version)) {
      setImagePreview({ id, title: versionRefLabel(id, version), filename: version.filename });
      return;
    }
    showDocument(id);
  };
  const revealSidebar = () => {
    if (dialogueMode === "cloudbase" || dialogueMode === "miniprogram")
      applyDialogueMode("default");
    setContextOpen(true);
  };
  const openCitedDocument = (id: string) => {
    revealSidebar();
    const version =
      detail?.versions.find((item) => item.id === id) ||
      detail?.versions.find((item) => item.artifact_id === id && !item.deleted_at);
    if (version) showDocument(version.id);
  };
  /* 引用不再跳右侧知识页，改为打开项目记忆并聚焦该条详情。 */
  const openCitedWiki = (id: string) => {
    if (!id) return;
    setQuotePreview(null);
    setMemoryFocusId(id);
    setMemoryOpen(true);
  };
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [briefDialogOpen, setBriefDialogOpen] = useState(false);
  const [taskSelection, setTaskSelection] = useState({ id: 0, taskId: "" });
  const { tasks: taskPool, refresh: refreshProjectTasks } = useProjectTasks(
    projectId,
    user?.id,
    taskDialogOpen,
    setError,
  );
  const taskCreateSequence = useRef(0);
  const [taskCreateRequest, setTaskCreateRequest] = useState<{
    id: number;
    refId?: string;
    folderId?: string;
  } | null>(null);
  const taskCreateOpen = taskCreateRequest !== null;
  const [threadListPane, setThreadListPane] = useState<"active" | "archived" | "create">("active");
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [newThreadBackground, setNewThreadBackground] = useState("");
  const [newThreadGoal, setNewThreadGoal] = useState("");
  const [archiveDialog, setArchiveDialog] = useState<{ id: string; title: string } | null>(null);
  const newThreadInputRef = useRef<HTMLInputElement>(null);
  const railCreateRef = useRef<HTMLButtonElement>(null);
  const [copiedThreadId, setCopiedThreadId] = useState("");
  const conversationCopyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(conversationCopyTimer.current);
    },
    [],
  );
  const [health, setHealth] = useState<{
    dshEnabled: boolean;
    mcpEndpoint?: string;
  } | null>(null);
  const [history, setHistory] = useState(false);
  const writable = projects.find((p) => p.id === projectId)?.role !== "viewer";
  const selectedProject = projects.find((p) => p.id === projectId);
  const owner =
    selectedProject?.project_leader_id === user?.id || selectedProject?.role === "project_admin";
  const projectLeader = selectedProject?.project_leader_id === user?.id;
  const active = thread?.status === "active" && writable;
  const quoteMessage = (m: ThreadMessage, selectedText = "") => {
    const id = m.quoteTargetId || m.id;
    if (
      !active ||
      m.id.startsWith("optimistic:") ||
      (m.id.startsWith("agent-task:") && !m.quoteTargetId)
    )
      return;
    const original = thread?.messages.find((item) => item.id === id) || m;
    const excerpt = selectedText.trim();
    selection.quote({ ...original, id }, excerpt);
    focusComposer();
  };
  const mentionAuthor = (m: ThreadMessage) => {
    if (!active) return;
    const isAssistant = m.source === "assistant";
    if (!isAssistant && m.author_id === user?.id) return;
    let label = isAssistant ? AGENT_MEMBER.name : m.author;
    if (!isAssistant) {
      const mentionMembers = (detail?.members || []).filter(
        (member) => member.kind !== "laoweng" && member.id !== AGENT_MEMBER.id,
      );
      const selectedMember = mentionMembers.find((member) => member.id === m.author_id);
      if (
        selectedMember &&
        selectedMember.id !== AGENT_XIAOXIANG_MEMBER.id &&
        mentionMembers.filter((member) => member.name === selectedMember.name).length > 1
      ) {
        label = selectedMember.email;
      } else if (selectedMember) {
        label = selectedMember.name;
      }
    }
    const mention = "@" + label + " ";
    updateDraft((text) => {
      if (!text) return mention;
      return /\s$/.test(text) ? text + mention : text + " " + mention;
    });
    focusComposer();
  };
  const openMessageMenu = (event: React.MouseEvent, m: ThreadMessage) => {
    event.preventDefault();
    event.stopPropagation();
    const root = (event.currentTarget as HTMLElement).closest(".message");
    setMessageMenu({
      x: event.clientX,
      y: event.clientY,
      message: m,
      selectedText: selectionTextInside(root),
    });
  };
  const canQuoteMessage = (m: ThreadMessage) =>
    !!active &&
    !m.id.startsWith("optimistic:") &&
    !(m.id.startsWith("agent-task:") && !m.quoteTargetId);
  const projectConnectorBound = localExecutors.some((device) =>
    device.projects?.some((item) => item.projectId === projectId),
  );
  const taskStats = useThreadTaskStats(projectId, threadId);
  const openTaskDialog = (taskId = "") => {
    setTaskSelection((current) => ({ id: current.id + 1, taskId }));
    setTaskDialogOpen(true);
  };
  const openTask = (taskId: string) => openTaskDialog(taskId);
  const openTaskCreate = (seed?: { refId?: string; folderId?: string }) => {
    if (!active) {
      showTip("当前迭代只读，暂不能创建任务", "error");
      return;
    }
    setTaskCreateRequest({ ...seed, id: ++taskCreateSequence.current });
  };
  const closeTaskCreate = () => {
    setTaskCreateRequest(null);
  };
  useEffect(() => {
    setTaskSelection((current) => ({ id: current.id + 1, taskId: "" }));
    setTaskDialogOpen(false);
    setTaskCreateRequest(null);
  }, [threadId, projectId, user?.id]);
  const refreshConnectors = async () => {
    setConnectors(await api("/local-executors"));
    setConnectorsReady(true);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const loadWorkspace = async (signal?: AbortSignal) => {
    setLoading(true);
    setStartupError("");
    const revision = sessionRevision.current;
    let selection: { projectId?: string; threadId?: string } = {};
    try {
      const saved = JSON.parse(sessionStorage.getItem("cothread-selection") || "{}");
      if (saved && typeof saved === "object") selection = saved;
    } catch {}
    const workspaceSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000);
    try {
      const params = new URLSearchParams();
      if (typeof selection.projectId === "string") params.set("projectId", selection.projectId);
      if (typeof selection.threadId === "string") params.set("threadId", selection.threadId);
      const workspace = await api(`/workspace?${params}`, undefined, undefined, workspaceSignal);
      if (signal?.aborted || sessionRevision.current !== revision) return;
      projectCache.current.clear();
      threadCache.current.clear();
      if (workspace.project)
        projectCache.current.update(workspace.project.id, () => workspace.project);
      if (workspace.thread) threadCache.current.update(workspace.thread.id, () => workspace.thread);
      bootstrappedUser.current = workspace.user.id;
      acceptProfile(workspace.user);
      setProjects(workspace.projects);
      setProjectId(workspace.project?.id || "");
      setThreadId(workspace.thread?.id || "");
      setThreadListPane(workspace.thread?.status === "archived" ? "archived" : "active");
      setDetail(workspace.project);
      setThread(workspace.thread);
      setHealth(workspace.health);
    } catch (cause) {
      if (signal?.aborted || sessionRevision.current !== revision) return;
      if ((cause as { status?: number }).status === 401) acceptProfile(null);
      else setStartupError((cause as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (user && bootstrappedUser.current !== user.id) void loadWorkspace();
    if (!user) {
      bootstrappedUser.current = null;
      projectCache.current.clear();
      threadCache.current.clear();
      setDetail(null);
      setThread(null);
      setProjects([]);
      setProjectId("");
      setThreadId("");
      setContextOpen(false);
      if (sessionRevision.current > 0) setLoading(false);
    }
    setModal(null);
  }, [user?.id]);
  useEffect(() => {
    if (loading) return;
    applyUiTheme(user?.ui_theme || DEFAULT_UI_THEME);
  }, [loading, user?.id, user?.ui_theme]);
  useEffect(() => {
    if (!user) {
      setConnectors([]);
      setConnectorsReady(false);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const devices = await api("/local-executors");
        if (alive) {
          setConnectors((current) => (sameSnapshot(current, devices) ? current : devices));
          setConnectorsReady(true);
        }
      } catch {}
    };
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user || !projectId) return;
    try {
      sessionStorage.setItem("cothread-selection", JSON.stringify({ projectId, threadId }));
    } catch {}
  }, [user?.id, projectId, threadId]);
  useEffect(() => {
    if (!projects.some((p) => p.id === projectId && p.tab_visible))
      setProjectId(projects.find((p) => p.tab_visible)?.id || "");
  }, [projects, projectId]);
  /* 左侧入口小点：接口不可用时静默降级为无小点，不打扰主流程。 */
  const refreshMemoryCounts = useCallback(() => {
    if (!projectId) {
      setMemoryCounts(null);
      return;
    }
    void api(`/projects/${projectId}/memory/counts`)
      .then((counts: Partial<MemoryCounts> | null) => {
        if (!counts || typeof counts !== "object") {
          setMemoryCounts(null);
          return;
        }
        setMemoryCounts({
          drafts: Number(counts.drafts) || 0,
          disputes: Number(counts.disputes) || 0,
          updatedSinceEntry: Number(counts.updatedSinceEntry) || 0,
        });
      })
      .catch(() => setMemoryCounts(null));
  }, [projectId]);
  useEffect(() => {
    refreshMemoryCounts();
  }, [refreshMemoryCounts, user?.id]);
  const projectActivityContext = {
    projectId,
    user,
    projectCache,
    threadCache,
    pendingNotification,
    setDetail,
    setThreadId,
    setThreadListPane,
    setError,
  };
  useProjectActivity(projectActivityContext);
  const threadActivityContext = {
    threadId,
    user,
    threadCache,
    historyRequest,
    wakeThreadPoll,
    followConversation,
    readThread,
    hasPendingWork,
    setThread,
    setHistoryLoading,
    setError,
  };
  useThreadActivity(threadActivityContext);
  const readReceiptContext = {
    user,
    threadId,
    thread,
    historyLoading,
    projectId,
    projectCache,
    threadCache,
    setThread,
    setDetail,
  };
  useThreadReadReceipt(readReceiptContext);
  useEffect(() => {
    if (pendingWork) wakeThreadPoll.current?.();
  }, [threadId, pendingWork]);
  const currentContext = useRef({ projectId, threadId });
  currentContext.current = { projectId, threadId };
  const refresh = async () => {
    await Promise.all(
      [
        projectId
          ? projectCache.current
              .read(
                projectId,
                (signal) => api(`/projects/${projectId}?view=chat`, undefined, undefined, signal),
                true,
              )
              .then((value) => {
                if (currentContext.current.projectId === projectId) setDetail(value);
              })
          : null,
        threadId
          ? threadCache.current
              .read(threadId, (signal) => readThread(threadId, signal), true)
              .then((value) => {
                if (currentContext.current.threadId === threadId) setThread(value);
              })
          : null,
        projectId ? refreshProjectTasks() : null,
        api("/projects").then((value) => {
          if (currentContext.current.projectId === projectId) setProjects(value);
        }),
      ].map((request) =>
        request?.catch((e) => {
          if (e.name !== "AbortError") throw e;
        }),
      ),
    );
  };
  const loadHistory = async () => {
    if (historyLoading || !thread?.page?.hasMore || !thread.page.before) return;
    const id = threadId,
      controller = new AbortController();
    historyRequest.current?.abort();
    historyRequest.current = controller;
    setHistoryLoading(true);
    try {
      const older = await api(
        `/threads/${id}?view=chat&before=${thread.page.before}`,
        undefined,
        undefined,
        controller.signal,
      );
      if (controller.signal.aborted || currentContext.current.threadId !== id) return;
      const container = conversationRef.current;
      const oldHeight = container?.scrollHeight || 0,
        oldTop = container?.scrollTop || 0;
      const merged = threadCache.current.update(id, (previous) =>
        mergeThread(previous, older, true),
      );
      followConversation.current = false;
      setThread(merged);
      requestAnimationFrame(() => {
        if (container && currentContext.current.threadId === id)
          container.scrollTop = oldTop + container.scrollHeight - oldHeight;
      });
    } catch (cause) {
      if (!controller.signal.aborted) setError((cause as Error).message);
    } finally {
      if (!controller.signal.aborted) setHistoryLoading(false);
    }
  };
  const open = (value: Modal) => {
    if (value === "profile") setProfileAvatar(user?.avatar ?? null);
    if (value === "project") setProjectImage(null);
    if (value === "mcp") void refreshConnectors().catch(() => {});
    setError("");
    setModal(value);
  };
  const focusNewThreadInput = () => {
    railCreateRef.current?.blur();
    newThreadInputRef.current?.focus({ preventScroll: true });
  };
  const openNewThreadPane = () => {
    setNewThreadTitle("");
    setNewThreadBackground("");
    setNewThreadGoal("");
    setThreadListPane("create");
    setLeftOpen(true);
  };
  const cancelNewThread = () => {
    setNewThreadTitle("");
    setThreadListPane("active");
  };
  const submitNewThread = () =>
    void run(async () => {
      const title = newThreadTitle.trim();
      if (!title) {
        newThreadInputRef.current?.focus();
        return;
      }
      if (!projectId) {
        showTip("请先选择或导入项目", "error");
        return;
      }
      if (!writable) {
        showTip("当前项目无创建迭代权限", "error");
        return;
      }
      const t = await api(`/projects/${projectId}/threads`, {
        title,
        background: newThreadBackground.trim(),
        goal: newThreadGoal.trim(),
      });
      setNewThreadTitle("");
      setThreadListPane("active");
      setThreadId(t.id);
      setDetail(await api(`/projects/${projectId}?view=chat`));
      showTip("迭代已创建");
    });
  useLayoutEffect(() => {
    if (!leftOpen || threadListPane !== "create") return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusNewThreadInput());
    });
    return () => window.cancelAnimationFrame(id);
  }, [leftOpen, threadListPane]);
  const copyConversationInfo = async (target?: { id: string; title: string }) => {
    const copyThreadId = target?.id ?? threadId;
    if (!copyThreadId || !projectId || detail?.id !== projectId) return;
    const info = formatMcpCopyPayload({
      server: `${location.origin}${health?.mcpEndpoint || "/mcp"}`,
      projectId,
      threadId: copyThreadId,
    });
    try {
      await navigator.clipboard.writeText(info);
      setCopiedThreadId(copyThreadId);
      clearTimeout(conversationCopyTimer.current);
      conversationCopyTimer.current = setTimeout(() => setCopiedThreadId(""), 3000);
      showTip("会话信息已复制");
    } catch {
      setError("无法自动复制会话信息，请检查剪贴板权限后重试。");
    }
  };
  const archiveActiveThread = (target: { id: string; title: string }) =>
    void run(async () => {
      await api(`/threads/${target.id}/archive`, {});
      setThreadListPane("active");
      setThreadId(target.id);
      threadCache.current.clear();
      const nextDetail = await projectCache.current.read(
        projectId,
        (signal) => api(`/projects/${projectId}?view=chat`, undefined, undefined, signal),
        true,
      );
      setDetail(nextDetail);
      setThreadId((current) => resolveProjectThreadId(nextDetail.threads, current));
      await refresh();
      setArchiveDialog(target);
      showTip("已进入归档中，老翁正在梳理");
    });
  const restoreArchivedThread = (target: { id: string }) =>
    void run(async () => {
      await api(`/threads/${target.id}/restore`, {});
      if (threadId === target.id) setThreadListPane("active");
      threadCache.current.clear();
      const nextDetail = await projectCache.current.read(
        projectId,
        (signal) => api(`/projects/${projectId}?view=chat`, undefined, undefined, signal),
        true,
      );
      setDetail(nextDetail);
      setThreadId((current) => resolveProjectThreadId(nextDetail.threads, current));
      await refresh();
      showTip("迭代已恢复");
    });
  const confirmDeleteArchivedThread = () => {
    if (!threadDeleteConfirm) return;
    const target = threadDeleteConfirm;
    void run(async () => {
      await api(`/threads/${target.id}`, undefined, "DELETE");
      setThreadDeleteConfirm(null);
      threadCache.current.clear();
      const nextDetail = await projectCache.current.read(
        projectId,
        (signal) => api(`/projects/${projectId}?view=chat`, undefined, undefined, signal),
        true,
      );
      setDetail(nextDetail);
      setThreadId((current) =>
        resolveProjectThreadId(nextDetail.threads, current === target.id ? "" : current),
      );
      await refresh();
      showTip("迭代已删除");
    });
  };
  const updateProjectTab = (id: string, action: "open" | "close" | "pin" | "unpin") =>
    void run(async () => {
      const rows = await api(`/projects/${id}/tab`, { action }, "PATCH");
      setProjects(rows);
      if (action === "open") {
        setProjectId(id);
        setProjectPickerOpen(false);
      }
    });
  /* 组织主页直达与首次进入共用同一个标记，避免同一次启动重复打开。 */
  const autoOpenedMemory = useRef(new Set<string>());
  const memoryRequestHandled = useRef(false);
  /* /?projectId=<id>&memory=1：切到该项目、按需打开页签，然后清掉 URL 参数。 */
  useEffect(() => {
    if (memoryRequestHandled.current || loading || !user) return;
    if (!projects.length) return;
    memoryRequestHandled.current = true;
    const params = new URLSearchParams(location.search);
    const requestedProjectId = params.get("projectId") || "";
    const wantsMemory = params.get("memory") === "1";
    if (!requestedProjectId && !wantsMemory) return;
    const target = requestedProjectId
      ? projects.find((item) => item.id === requestedProjectId)
      : null;
    if (target) {
      autoOpenedMemory.current.add(target.id);
      if (target.tab_visible) setProjectId(target.id);
      else updateProjectTab(target.id, "open");
    }
    if (wantsMemory && (target || !requestedProjectId)) setMemoryOpen(true);
    const url = new URL(location.href);
    url.searchParams.delete("projectId");
    url.searchParams.delete("memory");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    setUrlRevision((value) => value + 1);
  }, [loading, user?.id, projects, projectId]);
  /* 新人首次进入：该项目 tab_opened_at 为空时自动打开记忆，并记为已打开。 */
  useEffect(() => {
    if (loading || !user || !projectId) return;
    const project = projects.find((item) => item.id === projectId) as
      (Project & { tab_opened_at?: string | null }) | undefined;
    if (!project || project.tab_opened_at) return;
    if (autoOpenedMemory.current.has(projectId)) return;
    autoOpenedMemory.current.add(projectId);
    setMemoryOpen(true);
    updateProjectTab(projectId, "open");
  }, [loading, user?.id, projectId, projects]);
  const showProjectPicker = () =>
    void run(async () => {
      setProjects(await api("/projects"));
      setProjectPickerOpen(true);
    });
  const reorderPinnedProject = (source: string, target: string, after: boolean) => {
    if (busy || source === target) return;
    const pinnedIds = visibleProjects.filter((p) => p.tab_pinned_at).map((p) => p.id);
    if (!pinnedIds.includes(source) || !pinnedIds.includes(target)) return;
    const projectIds = pinnedIds.filter((id) => id !== source);
    projectIds.splice(projectIds.indexOf(target) + Number(after), 0, source);
    if (projectIds.every((id, index) => id === pinnedIds[index])) return;
    void run(async () => {
      try {
        setProjects(await api("/project-tabs/order", { projectIds }, "PATCH"));
      } catch (error) {
        setProjects(await api("/projects"));
        throw error;
      }
    });
  };
  const modalSubmitContext = {
    modal,
    run,
    refresh,
    profileAvatar,
    projectImage,
    threadId,
    acceptProfile,
    setProjects,
    setProjectId,
    setModal,
  };
  const submitModal = (event: React.FormEvent<HTMLFormElement>) =>
    submitWorkspaceModal(modalSubmitContext, event);
  const time = (text: string) => {
    const value = new Date(text.replace(" ", "T") + (text.endsWith("Z") ? "" : "Z"));
    const today = new Date();
    const calendarDay = (date: Date) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysAgo = Math.round((calendarDay(today) - calendarDay(value)) / 86400000);
    const clock = value.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    if (daysAgo === 0) {
      const secondOfDay = value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
      const period =
        secondOfDay < 5 * 3600
          ? "凌晨"
          : secondOfDay < 8 * 3600
            ? "早上"
            : secondOfDay < 11 * 3600
              ? "上午"
              : secondOfDay < 14 * 3600
                ? "中午"
                : secondOfDay < 18 * 3600
                  ? "下午"
                  : secondOfDay < 23 * 3600
                    ? "晚上"
                    : "深夜";
      return `${period} ${clock}`;
    }
    if (daysAgo === 1) return `昨天 ${clock}`;
    if (daysAgo === 2) return `前天 ${clock}`;
    const date = value.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
    return `${date} ${clock}`;
  };
  const updateThreadCache = (targetThreadId: string, transform: (current: Thread) => Thread) => {
    const next = threadCache.current.update(targetThreadId, (current) => ({
      ...transform(current || (loadedThread?.id === targetThreadId ? loadedThread : thread)!),
      sideState: undefined,
    }));
    if (currentContext.current.threadId === targetThreadId) setThread(next);
  };
  const addVersionToConversation = (id: string) => {
    const version = (detail?.versions || []).find((item) => item.id === id);
    const name = version ? fileDisplayName(version) : undefined;
    setRefs((previous) => [...new Set([...previous, id])].slice(0, 30));
    if (name) {
      const token = "/" + name + " ";
      updateDraft((text) =>
        text.includes("/" + name) ? text : (text && !/\s$/.test(text) ? text + " " : text) + token,
      );
    }
    focusComposer();
  };
  const addSelectionToConversation = (selectedText: string, versionId: string) => {
    const excerpt = selectedText.trim();
    if (!excerpt) return;
    addVersionToConversation(versionId);
    updateDraft((text) => (text ? text + "\n" : "") + "“" + excerpt + "”");
    showTip("已引用当前文件并添加选中内容");
    focusComposer();
  };
  const addFolderToConversation = (folderId: string) => {
    const folders = detail?.folders || [];
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) {
      showTip("文件夹不存在", "info");
      return;
    }
    setFolderRefs((previous) => {
      if (previous.includes(folderId)) return previous;
      if (previous.length >= 30) {
        showTip("每条消息最多引用 30 个文件夹", "info");
        return previous;
      }
      return [...previous, folderId];
    });
    const name = folderDisplayName(folder);
    if (name) {
      const token = "/" + name + " ";
      updateDraft((text) =>
        text.includes("/" + name) ? text : (text && !/\s$/.test(text) ? text + " " : text) + token,
      );
    }
    focusComposer();
  };
  const optimisticMessageCtx = {
    updateThreadCache,
    cancelThreadCache: (id: string) => threadCache.current.cancel(id),
    followConversation,
    refresh,
    user,
    thread,
    dialogueMode,
  };
  const persistOptimisticMessage = (
    targetThreadId: string,
    optimisticId: string,
    payload: OptimisticMessagePayload,
    quotes: MessageQuote[],
  ) =>
    persistOptimisticMessageImpl(
      optimisticMessageCtx,
      targetThreadId,
      optimisticId,
      payload,
      quotes,
    );
  const sendOptimisticMessage = (
    targetThreadId: string,
    body: string,
    selectedRefs: string[],
    selectedFolderRefs: string[] = [],
    selectedQuotes: MessageQuote[] = [],
  ) =>
    sendOptimisticMessageImpl(
      optimisticMessageCtx,
      targetThreadId,
      body,
      selectedRefs,
      selectedFolderRefs,
      selectedQuotes,
    );
  const requestDocumentRevision = async (
    versionId: string,
    target: "current" | "new",
    title?: string,
  ) => {
    const targetThreadId = threadId;
    if (!targetThreadId || !active) throw new Error("当前没有可用迭代");
    const version = (detail?.versions || []).find((item) => item.id === versionId);
    const label = version ? fileDisplayName(version) : versionId;
    const targetText =
      target === "current" ? "当前文档新增版本" : `新建文档${title ? `「${title}」` : ""}`;
    const body = [
      "@小祥",
      `请基于文档版本 /${label} 修改新版。`,
      `目标：${targetText}。`,
      target === "new" ? "如果新文档名称已存在，请由你处理重名，不要覆盖现有文档。" : "",
      "请由你负责修改文件内容，并在完成后通过 Agent 工具发布新版，不要由用户端直接创建版本。",
    ]
      .filter(Boolean)
      .join("\n");
    await sendOptimisticMessage(targetThreadId, body, [versionId]);
  };
  const hasAgentActivity = (reply: Thread["replies"][number]) => {
    if (!isExecutorReply(reply)) return reply.status === "failed";
    return (
      (!!reply.dispatch_ready && ["queued", "running"].includes(reply.status)) ||
      reply.status === "running" ||
      !!liveOutput[reply.message_id]?.reasoning ||
      (!!liveOutput[reply.message_id]?.content && !reply.reply_id) ||
      reply.status === "failed" ||
      !!thread?.events.some(
        (event) =>
          event.message_id === reply.message_id &&
          (event.tool !== "thinking" || (reply.status === "running" && event.status === "running")),
      )
    );
  };
  const chatMessages = thread?.messages || [];
  const liveCoordinator = thread?.replies.find(
    (reply) => !isExecutorReply(reply) && ["queued", "running"].includes(reply.status),
  );
  const coordinatorDraft = liveCoordinatorDraft(
    liveCoordinator,
    liveCoordinator ? liveOutput[liveCoordinator.message_id] : undefined,
    chatMessages,
  );
  const timeline = thread
    ? taskTimeline(chatMessages, thread.replies, thread.requests || [], hasAgentActivity)
    : [];
  const coordinatorLogLabel = thread
    ? coordinatorLogButtonLabel({
        replies: thread.replies,
        events: thread.events,
        liveOutput,
        compactStatus: thread.contextUsage?.compactStatus,
      })
    : COORDINATOR_LOG_IDLE_LABEL;
  const agentRoundProps = {
    hasAgentActivity,
    active,
    busy,
    threadId,
    thread,
    detail,
    liveOutput,
    run,
    refresh,
  };
  const renderAgentRound = (reply: Thread["replies"][number]) => (
    <AgentRoundView {...agentRoundProps} reply={reply} />
  );
  const renderMessageAttachments = (message: {
    refs?: string[];
    folder_refs?: string[];
    body?: string;
    source?: string;
  }) => {
    const folders = message.folder_refs || [];
    const files = message.refs || [];
    const images = files.filter((id) => {
      const version = detail?.versions.find((item) => item.id === id);
      return version && isImageFile(version);
    });
    const docs = files.filter((id) => !images.includes(id));
    const items = [
      ...folders.map((id) => {
        const folder = detail?.folders.find((item) => item.id === id);
        const label = folder
          ? libraryFolderPath(id, detail?.folders || []) || folderDisplayName(folder)
          : id;
        return {
          id: "folder:" + id,
          kind: "folder",
          label,
          title: label,
          target: id,
          pageId: null,
        };
      }),
      ...docs.map((id) => {
        const version = detail?.versions.find((item) => item.id === id);
        const label = versionRefLabel(id, version);
        return { id, kind: "document", label, title: label, target: id, pageId: null };
      }),
      ...(message.source === "assistant" ? webCitationsInBody(message.body || "") : []),
    ];
    if (!images.length && !items.length) return null;
    return (
      <>
        {!!images.length && <div className="references">{images.map(renderRef)}</div>}
        <CitationSources
          items={items}
          onActivate={(item) => {
            const group = citeGroupId(item.kind);
            if (group === "web" && item.target)
              window.open(item.target, "_blank", "noopener,noreferrer");
            else if (group === "document" && item.target) openCitedDocument(item.target);
            else if (group === "folder") revealSidebar();
            else if (group === "thread" && item.target) setThreadId(item.target);
            else if (group === "wiki") openCitedWiki(item.pageId || item.target || "");
          }}
        />
      </>
    );
  };
  const renderRef = (ref: string) => {
    const v = detail?.versions.find((v) => v.id === ref);
    const label = versionRefLabel(ref, v);
    if (v && isImageFile(v)) {
      return (
        <button
          key={ref}
          type="button"
          className="ref ref-thumb"
          title={label}
          onClick={() => openConversationFile(ref)}
        >
          <img src={`/api/versions/${ref}/source`} alt={label} />
          <span>{label}</span>
        </button>
      );
    }
    return (
      <button key={ref} type="button" className="ref" onClick={() => openConversationFile(ref)}>
        ↗ {label}
      </button>
    );
  };
  if (loading || startupError || (user && bootstrappedUser.current !== user.id))
    return <BootScreen error={startupError} onRetry={() => void loadWorkspace()} />;
  if (!user)
    return (
      <Suspense fallback={<BootScreen error="" onRetry={() => void loadWorkspace()} />}>
        <LoginScreen onLogin={acceptProfile} />
      </Suspense>
    );
  const versions =
    detail?.versions.filter(
      (v, i, all) =>
        !v.deleted_at && (history || all.findIndex((x) => x.artifact_id === v.artifact_id) === i),
    ) || [];
  const threads = detail?.threads || [];
  const activeThreads = threads.filter((t) => t.status === "active" || t.status === "archiving");
  const archivedThreads = threads.filter((t) => t.status === "archived");
  const elderSplitWidth = () =>
    shellRef.current?.querySelector(":scope > main")?.getBoundingClientRect().width ?? 0;
  const persistElderSplit = (ratio: number) => {
    elderSplitRef.current = ratio;
    setElderSplitRatio(ratio);
    shellRef.current?.style.setProperty("--chat-elder-split", `${ratio * 100}%`);
    try {
      localStorage.setItem(ELDER_SPLIT_RATIO_KEY, String(Math.round(ratio * 1000) / 10));
    } catch {}
  };
  const startElderSplitDrag = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const shell = shellRef.current;
    const width = elderSplitWidth();
    if (!shell || width <= 0) return;
    const startX = event.clientX;
    const startRatio = elderSplitRef.current ?? 0.5;
    let ratio = startRatio;
    const separator = shell.querySelector(".conversation-split-divider");
    const onMove = (move: PointerEvent) => {
      ratio = clampElderSplitRatio(startRatio + (move.clientX - startX) / width, width);
      elderSplitRef.current = ratio;
      shell.style.setProperty("--chat-elder-split", `${ratio * 100}%`);
      separator?.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("col-resizing");
      if (ratio !== startRatio) persistElderSplit(ratio);
    };
    document.body.classList.add("col-resizing");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const nudgeElderSplit = (delta: number) => {
    const width = elderSplitWidth();
    persistElderSplit(clampElderSplitRatio((elderSplitRef.current ?? 0.5) + delta, width));
  };
  const conversationHeaderProps = {
    thread,
    threadView,
    setThreadView,
    coordinatorLogLabel,
    liveCoordinator,
    active,
    busy,
    threadId,
    run,
    refresh,
    elderOpen,
    setElderOpen,
    elderView,
    setElderView,
    onElderSplitPointerDown: startElderSplitDrag,
  };
  const welcomeProps = {
    projectId,
    busy,
    availableProjects,
    open,
    openNewThreadPane,
    showProjectPicker,
    updateProjectTab,
  };
  const threadRowProps = {
    threadId,
    user,
    writable,
    projectLeader,
    busy,
    copiedThreadId,
    threadRowMenuId,
    setThreadId,
    setThreadListPane,
    setThreadRowMenuId,
    setThreadDeleteConfirm,
    setArchiveDialog,
    archiveActiveThread,
    copyConversationInfo,
    restoreArchivedThread,
  };
  const renderThreadLink = (t: (typeof threads)[number]) => (
    <ThreadRow key={t.id} {...threadRowProps} t={t} />
  );
  const startPanelDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth =
      panelWidthRef.current ??
      document.querySelector(".context-panel")?.getBoundingClientRect().width ??
      420;
    const onMove = (move: PointerEvent) => {
      const max = Math.max(320, Math.round(window.innerWidth * 0.6));
      const next = Math.min(Math.max(startWidth + (startX - move.clientX), 220), max);
      panelWidthRef.current = next;
      shellRef.current?.style.setProperty("--right-panel", next + "px");
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("col-resizing");
    };
    document.body.classList.add("col-resizing");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  documentActions.current = {
    refresh: async () => {
      const library = await api(`/projects/${projectId}/library`);
      const applyLibrary = (previous: Detail | undefined | null) => {
        if (!previous || previous.id !== projectId) return previous;
        return {
          ...previous,
          folders: library.folders,
          versions: library.versions,
          documentOrganizationJobs: library.documentOrganizationJobs,
          libraryRevision: library.libraryRevision || previous.libraryRevision,
        };
      };
      const cached = applyLibrary(projectCache.current.get(projectId));
      if (cached) projectCache.current.update(projectId, () => cached);
      setDetail((previous) => applyLibrary(previous) || previous);
    },
    review: async (id, decision, comment) => {
      await api(`/versions/${id}/reviews`, { decision, comment, threadId }, "POST");
      if (threadId) {
        const nextThread = await threadCache.current.read(
          threadId,
          (signal) => readThread(threadId, signal),
          true,
        );
        if (currentContext.current.threadId === threadId) setThread(nextThread);
      }
      showTip(decision === "changes_requested" ? "已发送修改意见" : "已确认该版本");
    },
    reference: addVersionToConversation,
    requestRevision: requestDocumentRevision,
    addSelection: addSelectionToConversation,
    referenceFolder: addFolderToConversation,
    addToTask: (id) => openTaskCreate({ refId: id }),
    addFolderToTask: (id) => openTaskCreate({ folderId: id }),
  };
  bindMessageMarkdownOpener(openConversationFile);
  const stageProps = {
    selection,
    onOpenTasks: () => openTaskDialog(),
    onOpenBrief: () => setBriefDialogOpen(true),
    briefDialogOpen,
    onOpenArchive: setArchiveDialog,
    threadView,
    threadId,
    historyLoading,
    user,
    copiedMessage,
    taskDialogOpen,
    projectId,
    busy,
    dialogueMode,
    setMessageMenu,
    chatMessages,
    conversationRef,
    followConversation,
    navigationUntil,
    composerAreaRef,
    navigateMessage,
    loadHistory,
    registerComposer,
    thread,
    timeline,
    detail,
    liveCoordinator,
    taskStats,
    active,
    coordinatorDraft,
    openMessageMenu,
    mentionAuthor,
    messageAvatar,
    messageMotto,
    renderAgentRound,
    renderRef,
    renderMessageAttachments,
    time,
    copyMessage,
    canQuoteMessage,
    quoteMessage,
    run,
    persistOptimisticMessage,
    uploadTarget,
    refresh,
    applyDialogueMode,
    sendOptimisticMessage,
  };
  const topbarProps = {
    visibleProjects,
    projectId,
    setProjectId,
    draggedProject,
    setDraggedProject,
    projectDrop,
    setProjectDrop,
    reorderPinnedProject,
    updateProjectTab,
    showProjectPicker,
    busy,
    mcpEndpoint: health?.mcpEndpoint || "/mcp",
    user,
    acceptProfile,
    setProjects,
    setProjectPickerOpen,
    setThreadId,
    setThreadListPane,
    pendingNotification,
    contextOpen,
    setContextOpen,
    setDocumentFullscreen,
  };
  const sidebarProps = {
    leftOpen,
    setLeftOpen,
    threadListPane,
    setThreadListPane,
    openNewThreadPane,
    railCreateRef,
    activeThreads,
    renderThreadLink,
    archivedThreads,
    newThreadInputRef,
    newThreadTitle,
    setNewThreadTitle,
    submitNewThread,
    cancelNewThread,
    busy,
    newThreadBackground,
    setNewThreadBackground,
    newThreadGoal,
    setNewThreadGoal,
    projectId,
    open,
    setProjectManagementOpen,
    setMemoryOpen,
    memoryCounts,
    setMonitorOpen,
    user,
  };
  const modalsProps = {
    modal,
    setModal,
    open,
    error,
    projectId,
    refreshConnectors,
    busy,
    submitModal,
    user,
    acceptProfile,
    profileAvatar,
    setProfileAvatar,
    savedAccounts,
    projectImage,
    setProjectImage,
    health,
    localExecutors,
    connectorsReady,
    run,
    switchSavedAccount,
    logoutCurrent,
    forgetSavedLogin,
    loginAnother,
  };
  // 老翁打开时，群聊/轨迹视图都留在左半区，右侧始终是问老翁。
  const threadTrajectoryView =
    threadView === "trajectory" && threadId ? (
      <div className="conversation-stage conversation-stage-trajectory">
        <Suspense fallback={<p className="muted">正在加载轨迹…</p>}>
          <AgentTrajectory key={threadId} scope={{ type: "thread", id: threadId }} api={api} />
        </Suspense>
      </div>
    ) : null;
  const elderPane =
    projectId && user ? (
      <ElderChat
        api={api}
        projectId={projectId}
        threadId={threadId}
        user={user}
        members={detail?.members || []}
        versions={detail?.versions || []}
        folders={detail?.folders || []}
        view={elderView}
        onOpenThread={setThreadId}
        onOpenDocument={openCitedDocument}
        onOpenWiki={openCitedWiki}
      />
    ) : null;
  return (
    <div
      ref={shellRef}
      className={
        "app-shell " +
        (leftOpen ? "" : "left-closed ") +
        (contextOpen ? "" : "right-closed ") +
        (documentFullscreen ? "document-fullscreen" : "")
      }
    >
      <WorkspaceTopbar {...topbarProps} />
      <WorkspaceSidebar {...sidebarProps} />
      <main
        className={`main ${fileDragOver ? "file-drag-over" : ""}${elderOpen && thread ? " elder-split" : ""}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = active ? "copy" : "none";
            setFileDragOver(!!active);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileDragOver(false);
        }}
        onDrop={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setFileDragOver(false);
            if (active) uploadTarget.current?.(Array.from(e.dataTransfer.files));
          }
        }}
        onPaste={(e) => {
          if (active && e.clipboardData.files.length) {
            e.preventDefault();
            uploadTarget.current?.(Array.from(e.clipboardData.files));
          }
        }}
      >
        {fileDragOver && (
          <div className="chat-drop-hint">松开以上传至项目缓存（今日日期文件夹）</div>
        )}
        <header className="workspace-top-strip">
          <ConversationHeader {...conversationHeaderProps} />
        </header>
        {!thread && projectId && (!detail || threadId) ? (
          <div className="conversation-loading" role="status" aria-live="polite" aria-busy="true">
            <p>{threadId ? "正在加载会话…" : "正在加载项目…"}</p>
            <div className="conversation-skeleton">
              <i />
              <span />
              <span />
            </div>
            <div className="conversation-skeleton">
              <i />
              <span />
              <span />
            </div>
            <div className="conversation-skeleton">
              <i />
              <span />
              <span />
            </div>
          </div>
        ) : !thread ? (
          <WorkspaceWelcome {...welcomeProps} />
        ) : (
          <>
            {elderOpen && thread ? (
              <div className="conversation-split">
                <div className="conversation-split-left">
                  <div className="conversation-body" hidden={threadView !== "chat"}>
                    <ConversationStage {...stageProps} />
                  </div>
                  {threadTrajectoryView}
                </div>
                <div
                  className="conversation-split-divider"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="拖拽调整群聊与问老翁宽度"
                  aria-valuemin={10}
                  aria-valuemax={90}
                  aria-valuenow={Math.round((elderSplitRatio ?? 0.5) * 100)}
                  tabIndex={0}
                  title="拖拽调整宽度"
                  onPointerDown={startElderSplitDrag}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    nudgeElderSplit(event.key === "ArrowLeft" ? -0.02 : 0.02);
                  }}
                />
                {elderPane}
              </div>
            ) : (
              <>
                <div className="conversation-body" hidden={threadView !== "chat"}>
                  <ConversationStage {...stageProps} />
                </div>
                {threadTrajectoryView}
              </>
            )}
          </>
        )}
      </main>
      {archiveDialog && (
        <Suspense fallback={null}>
          <ThreadArchiveDialog
            key={archiveDialog.id}
            threadId={archiveDialog.id}
            title={archiveDialog.title}
            onClose={() => setArchiveDialog(null)}
            onChanged={async (status, nextThreadId) => {
              threadCache.current.clear();
              await refresh();
              if (nextThreadId) setThreadId(nextThreadId);
              setThreadListPane(nextThreadId || status === "active" ? "active" : "archived");
              showTip(
                status === "active"
                  ? "归档已撤回，可以继续协作"
                  : nextThreadId
                    ? "迭代已归档，承接迭代已创建"
                    : "迭代已归档",
              );
            }}
          />
        </Suspense>
      )}
      <aside
        className={`context-panel context-doc-browser ${contextOpen ? "context-open" : ""}`}
        aria-hidden={!contextOpen}
        inert={!contextOpen}
      >
        <div
          className="panel-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拽调整对话区与右侧栏宽度"
          title="拖拽调整宽度"
          onPointerDown={startPanelDrag}
        />
        <button
          className="panel-close"
          aria-label="关闭项目侧栏"
          onClick={() => setContextOpen(false)}
        >
          <UiIcon name="close" size={12} />
        </button>
        {projectId && threadId && (
          <ContextPanelModeSwitch
            dialogueMode={dialogueMode}
            onSelect={applyContextPanelMode}
            documentFullscreen={documentFullscreen}
            onDocumentFullscreenChange={handleDocumentFullscreenChange}
          />
        )}
        {projectId && (dialogueMode === "cloudbase" || dialogueMode === "miniprogram") ? (
          <Suspense fallback={<p className="muted">正在加载 CloudBase…</p>}>
            <div className="library-embedded miniprogram-sidebar-embedded doc-browser-shell">
              <MiniProgramWorkspace
                projectId={projectId}
                request={apiFetch}
                writable={writable}
                currentUserId={user.id}
                owner={owner}
                embeddedInSidebar
              />
            </div>
          </Suspense>
        ) : projectId ? (
          <Suspense fallback={<p className="muted">正在加载文件树…</p>}>
            <Documents
              key={projectId}
              projectId={projectId}
              threadId={threadId || undefined}
              writable={writable}
              currentUserId={user.id}
              owner={owner}
              iterationWritable={active}
              folders={detail?.folders || EMPTY_FOLDERS}
              versions={detail?.versions || EMPTY_VERSIONS}
              organizationJobs={detail?.documentOrganizationJobs || EMPTY_JOBS}
              codeSourcesTick={codeSourcesTick}
              selected={documentId}
              documentFocus={documentFocus}
              onSelect={setDocumentId}
              documentFullscreen={documentFullscreen}
              onDocumentFullscreenChange={handleDocumentFullscreenChange}
              onRefresh={refreshDocuments}
              onReference={active ? referenceDocument : undefined}
              onRequestRevision={active ? requestRevisionDocument : undefined}
              onAddSelectionToConversation={active ? addSelectionDocument : undefined}
              onReferenceFolder={active ? referenceFolderDocument : undefined}
              onAddToTask={active ? addDocumentToTask : undefined}
              onAddFolderToTask={active ? addFolderDocumentToTask : undefined}
              onReview={active ? reviewDocument : undefined}
            />
          </Suspense>
        ) : null}
      </aside>
      {taskDialogOpen && (
        <TaskListDialog
          key={`${user.id}:${projectId}:${threadId}`}
          selection={taskSelection}
          tasks={taskPool}
          taskCreateOpen={taskCreateOpen}
          onClose={() => {
            closeTaskCreate();
            setTaskDialogOpen(false);
          }}
          onChanged={refreshProjectTasks}
          detail={detail}
          projectId={projectId}
          threadId={threadId}
          user={user}
          active={!!active}
          openTaskCreate={openTaskCreate}
          renderRef={renderRef}
          projectConnectorBound={projectConnectorBound}
          time={time}
          mcpEndpoint={health?.mcpEndpoint || "/mcp"}
        />
      )}
      {briefDialogOpen && thread && (
        <Suspense fallback={null}>
          <ThreadBriefDialog
            key={thread.id}
            thread={thread}
            writable={!!active}
            onClose={() => setBriefDialogOpen(false)}
            onSaved={refresh}
          />
        </Suspense>
      )}
      {taskCreateRequest && (
        <TaskCreateDialog
          key={`${user.id}:${projectId}:${threadId}:${taskCreateRequest.id}`}
          projectId={projectId}
          threadId={threadId}
          writable={!!active}
          user={user}
          detail={detail}
          initialRefId={taskCreateRequest.refId}
          initialFolderId={taskCreateRequest.folderId}
          onClose={closeTaskCreate}
          onCreated={(taskId) => {
            if (
              currentContext.current.projectId !== projectId ||
              currentContext.current.threadId !== threadId
            )
              return;
            setTaskCreateRequest((current) =>
              current?.id === taskCreateRequest.id ? null : current,
            );
            setTaskSelection((current) => ({ id: current.id + 1, taskId }));
            void refreshProjectTasks().catch(() =>
              showTip("任务已创建，列表刷新失败，请稍后重试", "error"),
            );
          }}
        />
      )}
      {quotePreview && (
        <ModalBackdrop onClose={() => setQuotePreview(null)} enabled={!imagePreview}>
          {(close) => (
            <section
              className="quoted-message-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="引用消息原文"
              onClick={(e) => e.stopPropagation()}
            >
              <DialogHeader
                title={
                  quotePreview.source === "assistant" ? AGENT_MEMBER.name : quotePreview.author
                }
                subtitle="引用消息原文"
                onClose={close}
                autoFocusClose
                closeLabel="关闭原文"
              />
              <DialogBody>
                <Suspense fallback={quotePreview.body}>
                  <QuoteMarkdown body={quotePreview.body} />
                </Suspense>
                {renderMessageAttachments(quotePreview)}
              </DialogBody>
            </section>
          )}
        </ModalBackdrop>
      )}
      {messageMenu && (
        <MessageContextMenu
          x={messageMenu.x}
          y={messageMenu.y}
          canQuote={canQuoteMessage(messageMenu.message)}
          onCopy={() => void copyMessage(messageMenu.message, messageMenu.selectedText)}
          onQuote={() => quoteMessage(messageMenu.message, messageMenu.selectedText)}
          onDismiss={() => setMessageMenu(null)}
        />
      )}
      {imagePreview && (
        <Suspense fallback={null}>
          <ImagePreviewDialog
            id={imagePreview.id}
            title={imagePreview.title}
            filename={imagePreview.filename}
            onClose={() => setImagePreview(null)}
          />
        </Suspense>
      )}
      {projectManagementOpen && projectId && (
        <Suspense fallback={null}>
          <ProjectManagement
            detail={detail?.id === projectId ? detail : null}
            busy={busy}
            projectLeader={projectLeader}
            canManage={owner}
            mcpEndpoint={health?.mcpEndpoint || "/mcp"}
            api={api}
            localDate={localDate}
            refresh={refresh}
            onProjectRenamed={(updated) => {
              setProjects((rows) =>
                rows.map((project) =>
                  project.id === updated.id
                    ? {
                        ...project,
                        name: updated.name,
                        description: updated.description ?? project.description,
                        image: updated.image === undefined ? project.image : updated.image,
                      }
                    : project,
                ),
              );
              setDetail((previous) =>
                previous && previous.id === updated.id
                  ? {
                      ...previous,
                      name: updated.name,
                      description: updated.description ?? previous.description,
                      image: updated.image === undefined ? previous.image : updated.image,
                    }
                  : previous,
              );
            }}
            onClose={() => {
              setProjectManagementOpen(false);
              setCodeSourcesTick((value) => value + 1);
            }}
          />
        </Suspense>
      )}
      {monitorOpen && projectId && (
        <Suspense fallback={null}>
          <AgentMonitor
            projectId={projectId}
            projectName={detail?.name || currentProject?.name || "当前项目"}
            projectImage={detail?.image || currentProject?.image}
            threadId={threadId}
            api={api}
            onClose={() => setMonitorOpen(false)}
          />
        </Suspense>
      )}
      {memoryOpen && projectId && user ? (
        <Suspense fallback={null}>
          <ProjectMemory
            projectId={projectId}
            api={api}
            canWrite={writable}
            focusId={memoryFocusId}
            onCountsChange={setMemoryCounts}
            onClose={() => {
              setMemoryOpen(false);
              setMemoryFocusId("");
              refreshMemoryCounts();
            }}
          />
        </Suspense>
      ) : null}
      {agentLogScope && (
        <Suspense fallback={null}>
          <AgentLogDialog scope={agentLogScope} api={api} onClose={() => setAgentLogScope(null)} />
        </Suspense>
      )}
      {localExecutorAuthorizationId && (
        <Suspense fallback={null}>
          <LocalExecutorAuthorization
            id={localExecutorAuthorizationId}
            callbackPort={localExecutorCallbackPort}
            callbackSecret={connectorCallbackSecret}
            api={localExecutorAuthorizationApi}
            onDone={closeLocalExecutorAuthorization}
          />
        </Suspense>
      )}
      {projectPickerOpen && (
        <ProjectPicker
          projects={projects}
          busy={busy}
          error={error}
          onClose={() => setProjectPickerOpen(false)}
          onImport={(id) => updateProjectTab(id, "open")}
          onCreate={() => {
            setProjectPickerOpen(false);
            open("project");
          }}
        />
      )}
      <WorkspaceModals {...modalsProps} />
      {threadDeleteConfirm ? (
        <Suspense fallback={null}>
          <DeleteConfirmDialog
            title="删除已归档迭代"
            body={`将永久删除「${threadDeleteConfirm.title}」及其讨论、文档与执行记录，且无法恢复。`}
            confirmLabel="确认删除"
            danger
            confirmDisabled={busy}
            onClose={() => setThreadDeleteConfirm(null)}
            onConfirm={confirmDeleteArchivedThread}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
