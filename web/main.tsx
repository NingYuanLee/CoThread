import { AgentActivity } from "./AgentActivity";
import { MessageUsage, type UsageStats } from './MessageUsage';
import { useAgentLiveOutput } from "./useAgentLiveOutput";
import { continuesCoordinatorTurn, coordinatorTurnId, isExecutorReply, isLastCoordinatorTurnPost, liveCoordinatorDraft, taskTimeline, usageReplyForMessage } from "./chat-timeline";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { apiFetch, fetchJson } from "./api-fetch";
import {
  AGENT_MEMBER,
  SUMMARY_REQUEST,
  mentionsAgent,
} from "../shared/agent-member.js";
import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import "./style.css";
import { configureMakers, invokeMakers, wakeMakers, useMakersConnection } from "./makers";
import { coordinatorLogButtonLabel, COORDINATOR_LOG_IDLE_LABEL } from "./agent-label";
const Documents = lazy(() =>
  import("./Documents").then((module) => ({ default: module.Documents })),
);
import { MessageNavigator } from "./MessageNavigator";
const loadComposer = () => import("./ChatComposer");
const ChatComposer = lazy(() => loadComposer().then((module) => ({ default: module.ChatComposer })));
import { ContextMeter } from "./ContextMeter";
import { Notifications } from "./Notifications";
import { ThemePicker } from "./ThemePicker";
import { applyUiTheme } from "./apply-ui-theme";
import { DEFAULT_UI_THEME } from "../shared/ui-theme.js";
import { ProjectManagement } from "./ProjectManagement";
import { AgentMonitor } from "./AgentMonitor";
import { AgentLogDialog, AgentTrajectory } from "./AgentLogDialog";
import type { AgentLogScope } from "./agent-trajectory";
import { SystemManagement } from "./SystemManagement";
import { EmailAuth } from "./EmailAuth";
import { EmailBinding } from "./EmailBinding";
import { PasswordField } from "./PasswordField";
import { AuthParticleBackground } from "./AuthParticleBackground";
import { ConnectorPanel, type ConnectorDevice } from "./ConnectorPanel";
import { ConnectorAuthorization } from "./ConnectorAuthorization";
import type { ContextUsage } from "../shared/context.js";
import { createResourceCache } from "../shared/resource-cache.js";
import { IdentityName } from "./Identity";
import {
  ProfileFields,
  prepareAvatar,
  type PersonalProfile,
} from "./ProfileFields";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { labelReasoningEffort, labelWorkflowStatus, labelExecutorType, l3ExecutorName, uniqueActorIds, AGENT_LEVEL_LABELS } from "./ui-labels";
import { UiIcon, workflowIcon, type UiIconName } from "./ui-icon";
import { DialogClose, ModalBackdrop, animateDialogClose, onDialogBackdropClick, onDialogCancel } from "./dialog-fx";

function CoThreadLogo({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden={title ? undefined : true} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <rect width="64" height="64" rx="13" fill="currentColor" />
      <path d="M44 19H29C20.7 19 14 25.7 14 34s6.7 15 15 15h15" stroke="var(--logo-ink, #F3F6EC)" strokeWidth="6" strokeLinecap="round" />
      <path d="M22 15v17c0 7.2 5.8 13 13 13s13-5.8 13-13V22" stroke="var(--logo-accent, #B7D295)" strokeWidth="6" strokeLinecap="round" />
      <path d="M18.5 23.3A15 15 0 0 1 29 19h8" stroke="var(--logo-ink, #F3F6EC)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="48" cy="16" r="3" fill="var(--logo-accent, #B7D295)" />
    </svg>
  );
}

function PanelIcon({ side }: { side: "left" | "right" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={side === "left" ? "M9 4v16" : "M15 4v16"} />
    </svg>
  );
}
function SidebarIcon({ kind }: { kind: "plus" | "monitor" | "project" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "monitor" ? (
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      ) : kind === "project" ? (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      ) : (
        <path d="M12 5v14M5 12h14" />
      )}
    </svg>
  );
}
function localDate(value?: string) {
  return value
    ? new Date(value.replace(" ", "T") + "Z").toLocaleString("zh-CN")
    : "";
}
function relativeActivity(value: string | undefined, now: number) {
  if (!value) return "暂无";
  const elapsed = Math.max(
    0,
    now - new Date(value.replace(" ", "T") + "Z").getTime(),
  );
  if (elapsed < 60000) return "刚刚";
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} 分钟前`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} 小时前`;
  if (elapsed < 604800000) return `${Math.floor(elapsed / 86400000)} 天前`;
  return new Date(value.replace(" ", "T") + "Z").toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

type Project = {
  id: string;
  created_by: string;
  created_at: string;
  name: string;
  description: string;
  role: string;
  active_threads: string;
  tab_visible: number;
  tab_pinned_at: string | null;
};
function ProjectActionIcon({
  action,
}: {
  action: "pin" | "unpin" | "import" | "close";
}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {action === "import" ? (
        <>
          <path d="M3 12h12m-4-4 4 4-4 4" />
          <path d="M10 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-9" />
        </>
      ) : action === "close" ? (
        <path d="m6 6 12 12M6 18 18 6" />
      ) : (
        <>
          <path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v6" />
          {action === "unpin" && <path d="m3 3 18 18" />}
        </>
      )}
    </svg>
  );
}
function ProjectPicker({
  projects,
  busy,
  error,
  onClose,
  onImport,
  onCreate,
}: {
  projects: Project[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onImport: (id: string) => void;
  onCreate: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    searchInput.current?.focus();
  }, []);
  const results = projects.filter(
    (p) =>
      !p.tab_visible &&
      `${p.name} ${p.description}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <dialog
      ref={dialog}
      className="project-picker"
      aria-labelledby="project-picker-title"
      onCancel={onDialogCancel(onClose)}
      onClick={onDialogBackdropClick(onClose, () => !busy)}
    >
      <div className="modal-header">
        <h2 id="project-picker-title">添加项目</h2>
        <DialogClose disabled={busy} onClick={() => animateDialogClose(dialog.current, onClose)} label="关闭项目列表" />
      </div>
      <input
        ref={searchInput}
        autoFocus
        type="search"
        aria-label="搜索项目"
        placeholder="搜索项目名称或简介"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <p className="project-picker-hint">
        选择有权限访问的项目，导入到你的页签区。
      </p>
      <div className="project-picker-list">
        {results.map((p) => (
          <article className="project-picker-card" key={p.id}>
            <div>
              <strong>{p.name}</strong>
              <p>{p.description || "暂无项目简介"}</p>
            </div>
            <button
              disabled={busy}
              title={`导入 ${p.name}`}
              aria-label={`导入 ${p.name}`}
              onClick={() => onImport(p.id)}
            >
              <ProjectActionIcon action="import" />
            </button>
          </article>
        ))}
        {!results.length && (
          <p className="project-picker-empty">
            {search.trim() ? "没有找到匹配的项目" : "暂无可导入的项目"}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="project-picker-footer">
        <button className="primary" disabled={busy} onClick={onCreate}>
          ＋ 新增项目
        </button>
      </div>
    </dialog>
  );
}
type Version = {
  id: string;
  artifact_id: string;
  folder_id?: string | null;
  folder_thread_id?: string | null;
  folder_kind?: string | null;
  deleted_at?: string | null;
  title: string;
  version: number;
  filename: string;
  byte_size: number;
  author: string;
  review: string | null;
  thread_id: string;
};
type Detail = Project & {
  threads: {
    id: string;
    title: string;
    status: string;
    creator: string;
    created_at: string;
    last_active_at: string;
  }[];
  members: {
    id: string;
    user_number?: number;
    username?: string;
    name: string;
    email: string;
    bound_email?: string | null;
    role: string;
    kind?: "human" | "l1";
    avatar?: string | null;
    motto?: string;
    identity_tags?: string[];
  }[];
  folders: { id: string; parent_id: string | null; thread_id?: string | null; folder_kind?: string | null; system_key?: string | null; name: string }[];
  versions: Version[];
  documentOrganizationJobs: { id: string; thread_id?: string | null; scope: "iteration" | "project"; status: string; error?: string | null }[];
  longTermSummary?: { summary: string; updatedAt: string | null; lastThreadTitle: string | null } | null;
};
type MessageQuote = { id: string; thread_id?: string; author: string; body: string; source: string; refs: string[] };
function clipQuote(text: string, max = 72) {
  const value = Array.from(String(text || "").replace(/\s+/g, " ").trim());
  return value.length > max ? `${value.slice(0, max).join("")}…` : value.join("");
}
type LocalTask = {
  id: string;
  status: "awaiting_approval" | "queued" | "running" | "paused" | "stopped_pending_approval" |
    "completed_pending_notification" | "failed_pending_notification" | "completed" | "failed" | "cancelled" | "interrupted";
};
type AvailableConnector = {
  projectId: string;
  id: string;
  name: string;
  platform?: string;
  ownerId: string;
  ownerName: string;
  policy: "unrestricted" | "style_only" | "layout_style";
  allowGitPush: boolean;
};
type AgentTask = {
  id: string;
  origin_thread_id: string | null;
  title: string;
  goal: string;
  task_type: "assist_l2" | "formal";
  status: string;
  source_type: string;
  source_user_id: string | null;
  created_by_type: string;
  created_by_id: string;
  target_type: string | null;
  target_id: string | null;
  claimed_by_type: string | null;
  claimed_by_id: string | null;
  execution_agent_type: string | null;
  execution_agent_id: string | null;
  progress: string | null;
  result_summary: string | null;
  updated_at: string;
};
type AgentTaskDetail = AgentTask & {
  constraints: string | null;
  artifact_refs: unknown[] | string | null;
  assignmentHistory: { id: number; event_type: "assigned" | "transferred" | "rejected" | "acknowledged" | "reopened"; from_target_type: string | null; from_target_id: string | null; to_target_type: string | null; to_target_id: string | null; changed_by_type: string; changed_by_id: string | null; reason: string | null; created_at: string }[];
  questions: { id: string; source_user_id: string | null; question: string; answer: string | null; status: string; created_at: string }[];
  executionRuns: { id: string; executor_type: string; executor_id: string | null; status: string; progress: string | null; result_summary: string | null; error: string | null; created_at: string }[];
  updates: { id: string; body: string; source_type: string; source_id: string; created_at: string }[];
  rejectionReview: { rejected: boolean; resolved: boolean; reviewer_type: string | null; reviewer_id: string | null };
  statusHistory: { id: number; from_status: string | null; to_status: string; actor_type: string; actor_id: string | null; reason: string | null; created_at: string }[];
};
type Thread = {
  page?: { hasMore: boolean; before: string | null; after: string | null };
  contextUsage: ContextUsage;
  id: string;
  title: string;
  status: string;
  messages: {
    sequence: string;
    id: string;
    body: string;
    source: string;
    execution_target?: "cloud" | "local";
    refs: string[];
    author: string;
    author_id: string;
    author_avatar?: string | null;
    author_role?: string | null;
    agent_task_id?: string | null;
    quoteTargetId?: string;
    render_key?: string;
    delivery_status?: "sending" | "failed";
    delivery_error?: string;
    quotes?: MessageQuote[];
    created_at: string;
  }[];
  archive_snapshot: { conclusion: string; versions: Version[] } | null;
  runs: {
    id: string;
    status: string;
    output: string;
    kind: string;
    progress: string | null;
    created_at: string;
  }[];
  replies: {
    message_id: string;
    reply_id: string | null;
    parent_message_id: string | null;
    agent_slot: number | null;
    dispatch_ready: boolean;
    participation: "pending" | "reply" | "silent";
    status: string;
    finished_at?: string | null;
    started_at?: string;
    first_response_at?: string | null;
    usage_stats?: UsageStats | string | null;
    error: string | null;
    progress: string | null;
  }[];
  updates: { message_id: string; task_message_id: string; delivered_at: string | null }[];
  requests: { usage_stats?: UsageStats | string | null; first_response_at?: string | null; message_id: string; status: string; response_id: string | null; error: string | null }[];
  connectorTasks: LocalTask[];
  events: {
    id: string;
    message_id: string;
    tool: string;
    status: string;
    input: string;
    output: string | null;
    created_at: string;
    finished_at: string | null;
  }[];
};
type Modal =
  | "profile"
  | "project"
  | "thread"
  | "settings"
  | "admin-projects"
  | "admin-accounts"
  | "admin-plugins"
  | "archive"
  | "password"
  | "email"
  | "run"
  | null;
async function api(path: string, data?: unknown, method?: string, signal?: AbortSignal, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json");
  const result = await fetchJson(`/api${path}`, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers,
    signal,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const work = path.match(/^\/threads\/([^/]+)\/(?:messages|summary|context\/compact|replies\/[^/]+\/retry)$/);
  if (work && (method || (data === undefined ? "GET" : "POST")) === "POST") wakeMakers(work[1], undefined, true);
  return result;
}
function App() {
  const [user, setUser] = useState<PersonalProfile | null>(null);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState("");
  const bootstrappedUser = useRef<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const visibleProjects = projects.filter((p) => p.tab_visible);
  const [draggedProject, setDraggedProject] = useState("");
  const [projectDrop, setProjectDrop] = useState<{
    id: string;
    after: boolean;
  } | null>(null);
  const projectCache = useRef(createResourceCache<Detail>());
  const threadCache = useRef(createResourceCache<Thread>());
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRequest = useRef<AbortController | null>(null);
  const mergeThread = (previous: Thread | undefined, incoming: Thread, older = false): Thread => {
    if (!previous) return incoming;
    const messageMap = new Map(previous.messages.map((item) => [item.id, item]));
    for (const item of incoming.messages) {
      const optimisticKey = `optimistic:${item.id}`;
      const optimistic = messageMap.get(optimisticKey);
      if (optimistic) {
        messageMap.delete(optimisticKey);
        messageMap.set(item.id, { ...item, render_key: optimisticKey });
        continue;
      }
      const local = messageMap.get(item.id);
      messageMap.set(item.id, local?.render_key ? { ...item, render_key: local.render_key } : item);
    }
    const messages = [...messageMap.values()]
      .sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1);
    return { ...(older ? previous : incoming), messages,
      events: [...new Map([...previous.events, ...incoming.events].map((e) => [e.id, e])).values()],
      page: older ? incoming.page : previous.page };
  };
  const messageAvatar = (m: Thread["messages"][number]) => {
    const member = detail?.members.find((member) => member.id === m.author_id);
    return member ? member.avatar : m.author_avatar;
  };
  const messageMotto = (m: Thread["messages"][number]) => {
    if (m.source !== "assistant")
      return detail?.members.find((member) => member.id === m.author_id)?.motto || "";
    const record = m.agent_task_id
      ? thread?.replies.find((reply) => reply.message_id === m.agent_task_id)
      : thread?.replies.find((reply) => reply.reply_id === m.id)
        || thread?.requests.find((request) => request.response_id === m.id);
    let usage: UsageStats = {};
    try { usage = typeof record?.usage_stats === "string"
      ? JSON.parse(record.usage_stats) : record?.usage_stats || {}; } catch {}
    return usage.model
      ? `${usage.model} · ${labelReasoningEffort(usage.reasoningEffort)}`
      : detail?.members.find((member) => member.id === AGENT_MEMBER.id)?.motto || AGENT_MEMBER.motto;
  };
  const readThread = async (id: string, signal: AbortSignal): Promise<Thread> => {
    const previous = threadCache.current.get(id);
    const after = previous?.messages.at(-1)?.sequence;
    const incoming = await api(`/threads/${id}?view=chat${after ? `&after=${after}` : ""}`, undefined, undefined, signal);
    const merged = mergeThread(threadCache.current.get(id), incoming);
    // Catch up in bounded pages if many messages arrived while away.
    if (after && incoming.page?.hasMore) {
      let page = incoming;
      while (page.page?.hasMore) {
        page = await api(`/threads/${id}?view=chat&after=${page.page.after}`, undefined, undefined, signal);
        Object.assign(merged, mergeThread(merged, page));
      }
    }
    return mergeThread(threadCache.current.get(id), merged);
  };
  const [loadedDetail, setDetail] = useState<Detail | null>(null);
  const detail = loadedDetail?.id === projectId ? loadedDetail : projectCache.current.get(projectId) || null;
  const [threadId, setThreadId] = useState("");
  const [threadView, setThreadView] = useState<"chat" | "trajectory">("chat");
  const makersConnection = useMakersConnection(threadId);
  useEffect(() => { setThreadView("chat"); }, [threadId]);
  const pendingNotification = useRef<{ projectId: string; threadId: string | null } | null>(null);
  const [loadedThread, setThread] = useState<Thread | null>(null);
  const thread = loadedThread?.id === threadId ? loadedThread : threadCache.current.get(threadId) || null;
  const hasPendingWork = (value: Thread | null | undefined) => !!value && (
    value.replies.some((r) => ["queued", "running"].includes(r.status)) ||
    !!value.requests?.some((r) => ["queued", "running"].includes(r.status)) ||
    ["queued", "running"].includes(value.contextUsage?.compactStatus) ||
    value.connectorTasks?.some((task) => ["awaiting_approval", "queued", "running", "paused", "stopped_pending_approval",
      "completed_pending_notification", "failed_pending_notification"].includes(task.status)));
  const pendingWork = hasPendingWork(thread);
  const liveOutput = useAgentLiveOutput(threadId,pendingWork);
  const wakeThreadPoll = useRef<(() => void) | null>(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [quotedMessages, setQuotedMessages] = useState<MessageQuote[]>([]);
  const [quotePreview, setQuotePreview] = useState<MessageQuote | null>(null);
  const [copiedMessage, setCopiedMessage] = useState("");
  const copyMessage = async (m: MessageQuote) => {
    try {
      const files = m.refs.map(id => {
        const v = detail?.versions.find(v => v.id === id);
        return `[${v?.title || id}](${location.origin}/api/versions/${id}/download)`;
      });
      await navigator.clipboard.writeText([m.body, ...files].filter(Boolean).join("\n\n"));
      setCopiedMessage(m.id);
    } catch { setError("复制失败，请检查剪贴板权限。"); }
  };
  useEffect(() => {
    if (!copiedMessage) return;
    const timer = setTimeout(() => setCopiedMessage(""), 2000);
    return () => clearTimeout(timer);
  }, [copiedMessage]);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [projectManagementOpen, setProjectManagementOpen] = useState(false);
  const [agentLogScope, setAgentLogScope] = useState<AgentLogScope | null>(null);
  const connectorAuthorizationParams = new URLSearchParams(location.search);
  const connectorAuthorizationId = connectorAuthorizationParams.get("connectorAuthorization") || "";
  const requestedConnectorConversation = connectorAuthorizationParams.get("connectorConversation") || "";
  const connectorCallbackPort = connectorAuthorizationParams.get("connectorCallbackPort") || "";
  const connectorCallbackSecret = new URLSearchParams(location.hash.slice(1)).get("connectorCallbackSecret") || "";
  const connectorConversationId = /^[0-9a-f-]{36}$/i.test(requestedConnectorConversation)
    ? requestedConnectorConversation : connectorAuthorizationId;
  const connectorAuthorizationApi = useCallback((path: string, data?: unknown, method?: string) =>
    api(path, data, method, undefined, { "Makers-Conversation-Id": connectorConversationId }), [connectorConversationId]);
  const closeConnectorAuthorization = () => {
    const url = new URL(location.href);
    url.searchParams.delete("connectorAuthorization");
    url.searchParams.delete("connectorConversation");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    setClock(Date.now());
  };
  const [connectors, setConnectors] = useState<ConnectorDevice[]>([]);
  const [connectorAvailability, setConnectorAvailability] = useState<AvailableConnector[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [rightPanelWidth, setRightPanelWidth] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const conversationRef = useRef<HTMLDivElement>(null);
  const navigationUntil = useRef(0);
  const navigateMessage = useCallback(() => {
    followConversation.current = false;
    navigationUntil.current = Date.now() + 1500;
  }, []);
  const followConversation = useRef(true);
  const [refs, setRefs] = useState<string[]>([]);
  const uploadTarget = useRef<((files: File[]) => void) | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth > 700);
  const [contextOpen, setContextOpen] = useState(
    () => window.innerWidth > 1100,
  );
  const showDocument = (id?: string) => {
    setQuotePreview(null);
    setDocumentId(id || detail?.versions.find((v) => !v.deleted_at)?.id || "");
    setContextOpen(true);
  };
  const [taskPool, setTaskPool] = useState<AgentTask[]>([]);
  const [taskMine, setTaskMine] = useState(true);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [taskDetail, setTaskDetail] = useState<AgentTaskDetail | null>(null);
  const [taskActionBusy, setTaskActionBusy] = useState(false);
  const [taskActionError, setTaskActionError] = useState("");
  const [taskExecutionMode, setTaskExecutionMode] = useState<"auto" | "human_direct" | "member_connector">("auto");
  const [taskTransferTarget, setTaskTransferTarget] = useState("");
  const [taskProgress, setTaskProgress] = useState("");
  const [taskResult, setTaskResult] = useState("");
  const [taskAnswer, setTaskAnswer] = useState("");
  const [taskReopenGoal, setTaskReopenGoal] = useState("");
  const [taskReopenConstraints, setTaskReopenConstraints] = useState("");
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [taskCreateTitle, setTaskCreateTitle] = useState("");
  const [taskCreateGoal, setTaskCreateGoal] = useState("");
  const [taskCreateConstraints, setTaskCreateConstraints] = useState("");
  const [taskCreateTarget, setTaskCreateTarget] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const threadViewportRef = useRef<HTMLDivElement>(null);
  const archiveToggleRef = useRef<HTMLButtonElement>(null);
  const [threadPaneHeight, setThreadPaneHeight] = useState(0);
  const [copiedThreadId, setCopiedThreadId] = useState("");
  const conversationCopyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => {
    clearTimeout(conversationCopyTimer.current);
  }, []);
  useLayoutEffect(() => {
    const viewport = threadViewportRef.current;
    if (!viewport) return;
    const update = () => {
      const toggle = archiveToggleRef.current;
      if (!toggle) return;
      setThreadPaneHeight(Math.max(0, viewport.clientHeight - toggle.offsetHeight));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(archiveToggleRef.current || viewport);
    return () => observer.disconnect();
  }, [user?.id, leftOpen, loading, showArchived]);
  const [health, setHealth] = useState<{
    dshEnabled: boolean;
    agentEndpoint?: string;
    mcpEndpoint?: string;
  } | null>(null);
  const [history, setHistory] = useState(false);
  const writable = projects.find((p) => p.id === projectId)?.role !== "viewer";
  const owner = projects.find((p) => p.id === projectId)?.role === "owner";
  const creator = projects.find((p) => p.id === projectId)?.created_by === user?.id;
  const projectMember = projects.some((p) => p.id === projectId);
  const active = thread?.status === "active" && writable;
  const localAvailable = connectorAvailability.some((item) => item.projectId === projectId);
  const projectConnectorBound = connectors.some((device) => device.projects?.some((item) => item.projectId === projectId));
  const endedTask = (status: string) => ["completed", "failed", "cancelled", "rejected", "abandoned", "superseded"].includes(status);
  const isMyTask = (task: AgentTask) => task.source_user_id === user?.id || task.created_by_id === user?.id ||
    task.target_id === user?.id || task.claimed_by_id === user?.id || task.execution_agent_id === user?.id;
  const isTrackedTask = (task: AgentTask) => task.task_type !== "assist_l2"
    || !!task.execution_agent_id
    || !endedTask(task.status);
  const myTasks = taskPool.filter((task) => isMyTask(task) && isTrackedTask(task));
  const currentMyTasks = myTasks.filter((task) => task.origin_thread_id === threadId);
  const latestMyTask = [...currentMyTasks].sort((left, right) =>
    new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())[0] || null;
  const visibleTasks = taskPool.filter((task) => task.origin_thread_id === threadId && isTrackedTask(task) && (!taskMine || isMyTask(task)));
  const threadExecutorIds = uniqueActorIds(taskPool.filter((task) => task.origin_thread_id === threadId).map((task) => task.execution_agent_id));
  const memberName = (id: string | null | undefined) => detail?.members.find((member) => member.id === id)?.name
    || (id && id === user?.id ? user.name : "");
  const taskSourceLabel = (task: AgentTask) => memberName(task.source_user_id)
    || (task.source_type === "l2_session" ? "小祥" : labelExecutorType(task.source_type));
  const taskExecutorLabel = (task: AgentTask) => {
    if (task.execution_agent_id && (!task.execution_agent_type || task.execution_agent_type === "dsh_l3")) {
      return l3ExecutorName(task.execution_agent_id, threadExecutorIds) || AGENT_LEVEL_LABELS.l3;
    }
    if (task.execution_agent_type === "human_self") return memberName(task.claimed_by_id || task.target_id) || "成员本人";
    if (task.execution_agent_type === "human_connector") return "本地连接器";
    if (task.created_by_type === "l2_session" || task.target_type === "l2_session") {
      return endedTask(task.status)
        ? "小祥（未交给任务级Agent（L3））"
        : "待任务级Agent（L3）接单";
    }
    return "待选择";
  };
  const statusActorLabel = (event: { actor_type: string; actor_id: string | null }) => {
    if (event.actor_type === "human_member") return memberName(event.actor_id) || "成员";
    if (event.actor_type === "l2_session") return "小祥";
    if (event.actor_type === "dsh_l3") return l3ExecutorName(event.actor_id, threadExecutorIds) || AGENT_LEVEL_LABELS.l3;
    if (event.actor_type === "connector") return "本机连接器";
    return "系统";
  };
  // 指派事件与状态变更合成一条时间线：同一操作（创建 / 拒绝 / 重新发起）两边各有一条时，合并显示，不重复。
  const taskChangeLog = (task: AgentTaskDetail) => {
    const actionLabels: Record<string, string> = { assigned: "创建并指派", transferred: "转交", rejected: "拒绝", acknowledged: "已知晓", reopened: "重新发起" };
    const targetLabel = (type: string | null, id: string | null) => type === "l2_session" ? "小祥" : type === "human_member" ? (memberName(id) || "成员") : "";
    const items = task.assignmentHistory.filter((event) => !(event.event_type === "transferred"
      && event.from_target_type === "l2_session" && event.to_target_type === "l2_session"
      && /L2 会话已更新/.test(event.reason || ""))).map((event) => ({
      key: `assignment-${event.id}`, at: event.created_at, actorType: event.changed_by_type, actorId: event.changed_by_id,
      title: `${actionLabels[event.event_type] || event.event_type}${["assigned", "transferred"].includes(event.event_type) && event.to_target_type ? ` → ${targetLabel(event.to_target_type, event.to_target_id)}` : ""}`,
      transition: "", reason: event.reason,
    }));
    for (const event of task.statusHistory || []) {
      const transition = `${event.from_status ? `${labelWorkflowStatus(event.from_status)} → ` : ""}${labelWorkflowStatus(event.to_status)}`;
      const twin = items.find((item) => !item.transition && item.actorType === event.actor_type && item.actorId === event.actor_id
        && Math.abs(Date.parse(item.at) - Date.parse(event.created_at)) < 2000);
      if (twin) twin.transition = transition;
      else items.push({ key: `status-${event.id}`, at: event.created_at, actorType: event.actor_type, actorId: event.actor_id, title: transition, transition: "", reason: event.reason });
    }
    return items.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  };
  const openTaskDialog = (taskId = "") => {
    setSelectedTaskId(taskId);
    if (!taskId) setTaskDetail(null);
    setTaskDialogOpen(true);
  };
  const openTask = (taskId: string) => openTaskDialog(taskId);
  useEffect(() => {
    setSelectedTaskId("");
    setTaskDetail(null);
  }, [threadId]);
  const refreshConnectors = async () => {
    const [devices, availability] = await Promise.all([api("/connectors"), api("/connectors/availability")]);
    setConnectors(devices);
    setConnectorAvailability(availability);
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
    let selection: { projectId?: string; threadId?: string } = {};
    try { const saved = JSON.parse(sessionStorage.getItem("cothread-selection") || "{}"); if (saved && typeof saved === "object") selection = saved; } catch {}
    const workspaceSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000);
    try {
      const params = new URLSearchParams();
      if (typeof selection.projectId === "string") params.set("projectId", selection.projectId);
      if (typeof selection.threadId === "string") params.set("threadId", selection.threadId);
      const workspace = await api(`/workspace?${params}`, undefined, undefined, workspaceSignal);
      if (signal?.aborted) return;
      projectCache.current.clear();
      threadCache.current.clear();
      if (workspace.project) projectCache.current.update(workspace.project.id, () => workspace.project);
      if (workspace.thread) threadCache.current.update(workspace.thread.id, () => workspace.thread);
      bootstrappedUser.current = workspace.user.id;
      setUser(workspace.user);
      setProjects(workspace.projects);
      setProjectId(workspace.project?.id || "");
      setThreadId(workspace.thread?.id || "");
      setShowArchived(workspace.thread?.status === "archived");
      setDetail(workspace.project);
      setThread(workspace.thread);
      configureMakers(workspace.health, setError);
      setHealth(workspace.health);
    } catch (cause) {
      if (signal?.aborted) return;
      if ((cause as { status?: number }).status === 401) setUser(null);
      else setStartupError((cause as Error).message);
    } finally { if (!signal?.aborted) setLoading(false); }
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
    }
  }, [user?.id]);
  useEffect(() => {
    if (loading) return;
    applyUiTheme(user?.ui_theme || DEFAULT_UI_THEME);
  }, [loading, user?.id, user?.ui_theme]);
  useEffect(() => {
    if (!user) { setConnectors([]); setConnectorAvailability([]); return; }
    let alive = true;
    const load = async () => { try {
      const [devices, availability] = await Promise.all([api("/connectors"), api("/connectors/availability")]);
      if (alive) { setConnectors(devices); setConnectorAvailability(availability); }
    } catch {} };
    void load();
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [user?.id]);
  useEffect(() => {
    if (!user || !projectId) return;
    try { sessionStorage.setItem("cothread-selection", JSON.stringify({ projectId, threadId })); } catch {}
  }, [user?.id, projectId, threadId]);
  useEffect(() => {
    if (!projects.some((p) => p.id === projectId && p.tab_visible))
      setProjectId(projects.find((p) => p.tab_visible)?.id || "");
  }, [projects, projectId]);
  useEffect(() => {
    const cached = projectCache.current.get(projectId);
    setDetail(cached || null);
    setThreadId((current) => cached?.threads.some((t) => t.id === current) ? current : cached?.threads.find((t) => t.status === "active")?.id || cached?.threads[0]?.id || "");
    setRefs([]);
    setQuotedMessages([]);
    setQuotePreview(null);
    setMessage("");
    if (!projectId || !user) return;
    let alive = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      clearTimeout(timer);
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const d = await projectCache.current.read(projectId, (signal) => api(`/projects/${projectId}?view=chat`, undefined, undefined, signal));
        if (!alive) return;
        setDetail(d);
        const target = pendingNotification.current;
        if (target?.projectId === projectId) {
          pendingNotification.current = null;
          setThreadId(target.threadId || d.threads[0]?.id || "");
          setShowArchived(!!d.threads.find((t) => t.id === target.threadId && t.status === "archived"));
        } else {
          setThreadId((t) => d.threads.some((x) => x.id === t) ? t : d.threads.find((x) => x.status === "active")?.id || d.threads[0]?.id || "");
        }
      } catch (e) {
        const error = e as Error & { status?: number };
        if (alive && error.name !== "AbortError") {
          setError(error.message);
          if ([401, 403, 404].includes(error.status || 0)) {
            setDetail(null);
            setThreadId("");
            threadCache.current.clear();
          }
        }
      } finally {
        inFlight = false;
        if (alive) { clearTimeout(timer); timer = setTimeout(load, 30000); }
      }
    };
    if (cached) timer = setTimeout(load, 30000);
    else void load();
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearTimeout(timer);
      projectCache.current.cancel(projectId);
      document.removeEventListener("visibilitychange", load);
    };
  }, [projectId, user?.id]);
  useEffect(() => {
    historyRequest.current?.abort();
    setHistoryLoading(false);
    const cached = threadCache.current.get(threadId);
    setThread(cached || null);
    followConversation.current = true;
    setRefs([]);
    setMessage("");
    if (!threadId || !user) return;
    let alive = true;
    let inFlight = false;
    let idlePolls = 0;
    let latestMessage = cached?.messages.at(-1)?.id;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      clearTimeout(timer);
      if (document.hidden || inFlight) return;
      inFlight = true;
      let active = false;
      try {
        const t = await threadCache.current.read(threadId, (signal) => readThread(threadId, signal));
        if (!alive) return;
        setThread(t);
        const latest = t.messages.at(-1)?.id;
        idlePolls = latest === latestMessage ? idlePolls + 1 : 0;
        latestMessage = latest;
        active = t.replies.some((r) => ["queued", "running"].includes(r.status)) ||
          !!t.requests?.some((r) => ["queued", "running"].includes(r.status)) ||
          ["queued", "running"].includes(t.contextUsage?.compactStatus);
      } catch (e) {
        const error = e as Error & { status?: number };
        if (alive && error.name !== "AbortError") {
          setError(error.message);
          if ([401, 403, 404].includes(error.status || 0)) setThread(null);
        }
      } finally {
        inFlight = false;
        if (alive) { clearTimeout(timer); timer = setTimeout(load, active || hasPendingWork(threadCache.current.get(threadId)) ? 1000 : Math.min(30000, 8000 * 2 ** Math.min(idlePolls, 2))); }
      }
    };
    wakeThreadPoll.current = () => { idlePolls = 0; void load(); };
    if (cached) timer = setTimeout(load, 2500);
    else void load();
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearTimeout(timer);
      wakeThreadPoll.current = null;
      threadCache.current.cancel(threadId);
      historyRequest.current?.abort();
      document.removeEventListener("visibilitychange", load);
    };
  }, [threadId, user?.id]);
  useEffect(() => {
    if (pendingWork) wakeThreadPoll.current?.();
  }, [threadId, pendingWork]);
  useEffect(() => {
    if (!projectId || !user) { setTaskPool([]); return; }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const tasks = await api(`/projects/${projectId}/tasks?limit=200`);
        if (alive) setTaskPool(tasks);
      } catch (e) {
        if (alive && (e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (alive) timer = setTimeout(load, taskDialogOpen ? 5000 : 15000);
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [projectId, user?.id, taskDialogOpen]);
  useEffect(() => {
    if (!selectedTaskId) { setTaskDetail(null); return; }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let primed = false;
    const load = async () => {
      try {
        const value = await api(`/tasks/${selectedTaskId}`);
        if (!alive) return;
        setTaskDetail(value);
        if (!primed) {
          primed = true;
          setTaskProgress(value.progress || "");
          setTaskResult(value.result_summary || "");
          setTaskReopenGoal(value.goal || "");
          setTaskReopenConstraints(value.constraints || "");
          setTaskActionError("");
        }
      } catch (cause) {
        if (alive) setTaskActionError((cause as Error).message);
      } finally {
        if (alive && taskDialogOpen) timer = setTimeout(() => { void load(); }, 5000);
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [selectedTaskId, taskDialogOpen]);
  const performTaskAction = async (action: () => Promise<unknown>) => {
    setTaskActionBusy(true);
    setTaskActionError("");
    try {
      await action();
      const [tasks, nextDetail] = await Promise.all([
        api(`/projects/${projectId}/tasks?limit=200`),
        selectedTaskId ? api(`/tasks/${selectedTaskId}`) : Promise.resolve(null),
      ]);
      setTaskPool(tasks);
      setTaskDetail(nextDetail);
      if (nextDetail) {
        setTaskProgress(nextDetail.progress || "");
        setTaskResult(nextDetail.result_summary || "");
        setTaskReopenGoal(nextDetail.goal || "");
        setTaskReopenConstraints(nextDetail.constraints || "");
      }
    } catch (cause) { setTaskActionError((cause as Error).message); }
    finally { setTaskActionBusy(false); }
  };
  useEffect(() => {
    const container = conversationRef.current;
    if (container && followConversation.current)
      container.scrollTop = container.scrollHeight;
  }, [
    threadId,
    thread?.messages.length,
    thread?.events.length,
    thread?.connectorTasks?.map((task) => `${task.id}:${task.status}`).join(","),
    Object.values(liveOutput).map(o => `${o.message_id}:${o.revision}`).join(","),
    thread?.replies.filter(
      (r) => r.status === "queued" || r.status === "running",
    ).length,
  ]);
  const currentContext = useRef({ projectId, threadId });
  useEffect(() => {
    if (!health?.agentEndpoint || !thread || !writable || thread.status !== "active") return;
    if (thread.replies.some((r) => ["queued", "running"].includes(r.status)) ||
        thread.requests?.some((r) => ["queued", "running"].includes(r.status)) ||
        (["queued", "running"].includes(thread.contextUsage?.compactStatus) ||
          (thread.contextUsage?.compactStatus !== "failed" && thread.contextUsage?.categories.some((c) => c.key === "pending" && c.tokens > 0))))
      wakeMakers(thread.id, setError);
  }, [health, thread, writable]);
  currentContext.current = { projectId, threadId };
  const refresh = async () => {
    await Promise.all([
      projectId ? projectCache.current.read(projectId, (signal) => api(`/projects/${projectId}?view=chat`, undefined, undefined, signal), true)
        .then((value) => { if (currentContext.current.projectId === projectId) setDetail(value); }) : null,
      threadId ? threadCache.current.read(threadId, (signal) => readThread(threadId, signal), true)
        .then((value) => { if (currentContext.current.threadId === threadId) setThread(value); }) : null,
      projectId ? api(`/projects/${projectId}/tasks?limit=200`).then((value) => { if (currentContext.current.projectId === projectId) setTaskPool(value); }) : null,
    ].map((request) => request?.catch((e) => { if (e.name !== "AbortError") throw e; })));
  };
  const loadHistory = async () => {
    if (historyLoading || !thread?.page?.hasMore || !thread.page.before) return;
    const id = threadId, controller = new AbortController();
    historyRequest.current?.abort();
    historyRequest.current = controller;
    setHistoryLoading(true);
    try {
      const older = await api(`/threads/${id}?view=chat&before=${thread.page.before}`, undefined, undefined, controller.signal);
      if (controller.signal.aborted || currentContext.current.threadId !== id) return;
      const container = conversationRef.current;
      const oldHeight = container?.scrollHeight || 0, oldTop = container?.scrollTop || 0;
      const merged = threadCache.current.update(id, (previous) => mergeThread(previous, older, true));
      followConversation.current = false;
      setThread(merged);
      requestAnimationFrame(() => {
        if (container && currentContext.current.threadId === id) container.scrollTop = oldTop + container.scrollHeight - oldHeight;
      });
    } catch (cause) {
      if (!controller.signal.aborted) setError((cause as Error).message);
    } finally { if (!controller.signal.aborted) setHistoryLoading(false); }
  };
  const open = (value: Modal) => {
    if (value === "profile") setProfileAvatar(user?.avatar ?? null);
    setError("");
    setModal(value);
  };
  const copyConversationInfo = async () => {
    if (!threadId || !projectId || thread?.id !== threadId || detail?.id !== projectId) return;
    const info = JSON.stringify(
      {
        server: `${location.origin}${health?.mcpEndpoint || "/mcp"}`,
        project: detail?.name,
        projectId,
        iteration: thread?.title,
        threadId,
        instruction:
          "先调用 get_iteration_context 确认此迭代，再按我的要求调用 post_message 或 submit_document。",
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(info);
      setCopiedThreadId(threadId);
      clearTimeout(conversationCopyTimer.current);
      conversationCopyTimer.current = setTimeout(() => setCopiedThreadId(""), 3000);
    } catch {
      setError("无法自动复制会话信息，请检查剪贴板权限后重试。");
    }
  };
  const updateProjectTab = (
    id: string,
    action: "open" | "close" | "pin" | "unpin",
  ) =>
    void run(async () => {
      const rows = await api(`/projects/${id}/tab`, { action }, "PATCH");
      setProjects(rows);
      if (action === "open") {
        setProjectId(id);
        setProjectPickerOpen(false);
      }
    });
  const showProjectPicker = () =>
    void run(async () => {
      setProjects(await api("/projects"));
      setProjectPickerOpen(true);
    });
  const reorderPinnedProject = (
    source: string,
    target: string,
    after: boolean,
  ) => {
    if (busy || source === target) return;
    const pinnedIds = visibleProjects
      .filter((p) => p.tab_pinned_at)
      .map((p) => p.id);
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
  const submitModal = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (modal?.startsWith("admin-")) return;
    if (modal === "email") return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "");
    void run(async () => {
      if (modal === "profile") {
        setUser(
          await api(
            "/me",
            {
              name: value("name"),
              motto: value("motto"),
              avatar: profileAvatar,
              identity_tags: form.getAll("identity_tags").filter(Boolean),
            },
            "PATCH",
          ),
        );
        await refresh();
      }
      if (modal === "project") {
        const p = await api("/projects", {
          name: value("name"),
          description: value("description"),
        });
        setProjects(await api("/projects"));
        setProjectId(p.id);
      }
      if (modal === "thread") {
        const t = await api(`/projects/${projectId}/threads`, {
          title: value("title"),
        });
        setThreadId(t.id);
        setDetail(await api(`/projects/${projectId}?view=chat`));
      }
      if (modal === "archive") {
        await api(`/threads/${threadId}/archive`, {
          conclusion: value("conclusion"),
        });
        await refresh();
      }
      if (modal === "password")
        await api("/password", {
          currentPassword: value("currentPassword"),
          password: value("password"),
        });
      if (modal === "run") {
        const input = { command: value("command") };
        const result = health?.agentEndpoint
          ? await invokeMakers(threadId, input)
          : await api(`/threads/${threadId}/runs`, input);
        await refresh();
        if (result.status !== "succeeded") throw new Error(result.output);
      }
      if (modal !== "profile" && modal !== "password") setModal(null);
    });
  };
  const time = (text: string) => {
    const value = new Date(text.replace(" ", "T") + (text.endsWith("Z") ? "" : "Z"));
    const today = new Date();
    const calendarDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysAgo = Math.round((calendarDay(today) - calendarDay(value)) / 86400000);
    const clock = value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    if (daysAgo === 0) {
      const secondOfDay = value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
      const period = secondOfDay < 5 * 3600 ? "凌晨"
        : secondOfDay < 8 * 3600 ? "早上"
          : secondOfDay < 11 * 3600 ? "上午"
            : secondOfDay < 14 * 3600 ? "中午"
              : secondOfDay < 18 * 3600 ? "下午"
                : secondOfDay < 23 * 3600 ? "晚上" : "深夜";
      return `${period} ${clock}`;
    }
    if (daysAgo === 1) return `昨天 ${clock}`;
    if (daysAgo === 2) return `前天 ${clock}`;
    const date = value.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
    return `${date} ${clock}`;
  };
  const updateThreadCache = (targetThreadId: string, transform: (current: Thread) => Thread) => {
    const next = threadCache.current.update(targetThreadId, current =>
      transform(current || (loadedThread?.id === targetThreadId ? loadedThread : thread)!));
    if (currentContext.current.threadId === targetThreadId) setThread(next);
  };
  const addVersionToConversation = (id: string) => {
    const name = (detail?.versions || []).find(version => version.id === id)?.filename;
    setRefs(previous => [...new Set([...previous, id])].slice(0, 30));
    if (name) {
      setMessage(text => text.includes(`/${name}`)
        ? text
        : `${text}${text && !/\s$/.test(text) ? " " : ""}/${name} `);
    }
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="发送消息"]')?.focus());
  };
  const persistOptimisticMessage = async (
    targetThreadId: string,
    optimisticId: string,
    payload: { body: string; refs: string[]; quoteIds: string[]; clientMessageId: string },
    quotes: MessageQuote[],
  ) => {
    updateThreadCache(targetThreadId, current => ({ ...current, messages: current.messages.map(item =>
      item.id === optimisticId ? { ...item, delivery_status: "sending", delivery_error: undefined } : item) }));
    try {
      const saved = await api(`/threads/${targetThreadId}/messages`, payload, undefined, AbortSignal.timeout(10000));
      updateThreadCache(targetThreadId, current => {
        const withoutDuplicate = current.messages.filter(item => item.id !== saved.id);
        const found = withoutDuplicate.some(item => item.id === optimisticId);
        const committed = { ...saved, quotes, render_key: optimisticId };
        return { ...current,
          messages: found ? withoutDuplicate.map(item => item.id === optimisticId ? committed : item) : [...withoutDuplicate, committed],
          requests: !saved.request_status || current.requests.some(r => r.message_id === saved.id) ? current.requests : [...current.requests,{message_id:saved.id,status:saved.request_status,response_id:null,error:null}],
          replies: !saved.participation || current.replies.some(r => r.message_id === saved.id) ? current.replies : [...current.replies,{message_id:saved.id,status:'queued',participation:saved.participation,reply_id:null,parent_message_id:null,agent_slot:null,dispatch_ready:false,error:null,progress:null}],
        };
      });
      await refresh();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "消息发送失败";
      updateThreadCache(targetThreadId, current => ({ ...current, messages: current.messages.map(item =>
        item.id === optimisticId ? { ...item, delivery_status: "failed", delivery_error: detail } : item) }));
    }
  };
  const hasAgentActivity = (reply: Thread["replies"][number]) => {
    if (!isExecutorReply(reply)) return reply.status === "failed";
    return (!!reply.dispatch_ready && ["queued", "running"].includes(reply.status)) ||
      reply.status === "running" ||
      !!liveOutput[reply.message_id]?.reasoning || (!!liveOutput[reply.message_id]?.content && !reply.reply_id) ||
      reply.status === "failed" ||
      !!thread?.events.some((event) => event.message_id === reply.message_id &&
        (event.tool !== "thinking" || (reply.status === "running" && event.status === "running")));
  };
  const chatMessages = thread?.messages || [];
  const liveCoordinator = thread?.replies.find((reply) =>
    !isExecutorReply(reply) && ["queued", "running"].includes(reply.status));
  const coordinatorDraft = liveCoordinatorDraft(liveCoordinator, liveCoordinator ? liveOutput[liveCoordinator.message_id] : undefined, chatMessages);
  const timeline = thread ? taskTimeline(chatMessages, thread.replies, thread.requests || [], hasAgentActivity) : [];
  const coordinatorLogLabel = thread ? coordinatorLogButtonLabel({
    replies: thread.replies,
    events: thread.events,
    liveOutput,
    compactStatus: thread.contextUsage?.compactStatus,
  }) : COORDINATOR_LOG_IDLE_LABEL;
  const renderAgentRound = (reply: Thread["replies"][number]) => {
    if (!hasAgentActivity(reply)) return null;
    const stopControl = active && (reply.status === "queued" || reply.status === "running") && (
      <button className="agent-stop" disabled={busy} onClick={() => void run(async () => {
        await api(`/threads/${threadId}/replies/${reply.message_id}/stop`, {});
        await refresh();
      })}>停止</button>
    );
    const failed = reply.status === "failed" && (
      <div className="reply-status failed" role="status">
        <span>{reply.error}</span>
        {active && (
          <button disabled={busy} onClick={() => void run(async () => {
            await api(`/threads/${threadId}/replies/${reply.message_id}/retry`, {});
            await refresh();
          })}>重试回复</button>
        )}
      </div>
    );
    if (!isExecutorReply(reply)) {
      return failed ? <div className="agent-round" data-message-id={reply.message_id}>{failed}</div> : null;
    }
    const events = thread?.events.filter(e => e.message_id === reply.message_id) || [];
    const output = liveOutput[reply.message_id];
    return (
      <div className="agent-round" data-message-id={reply.message_id}>
        <div className="agent-trace-row">
          <AgentActivity threadId={threadId} messageId={reply.message_id} events={events} output={output} status={reply.status} progress={makersConnection==='unavailable'?'助手暂时无法连接，消息已保存。':reply.progress} hasFinal={!!reply.reply_id} versions={detail?.versions} threads={detail?.threads}/>
          {stopControl}
        </div>
        {failed}
      </div>
    );
  };
  const renderRef = (ref: string) => {
    const v = detail?.versions.find((v) => v.id === ref);
    return (
      <button key={ref} type="button" className="ref" onClick={() => showDocument(ref)}>
        ↗ {v ? (
          (v.review === "confirmed"
            || v.review === "draft"
            || v.folder_kind === "project_cache"
            || v.folder_kind === "iteration_cache")
            ? v.title
            : `${v.title} · v${v.version}`
        ) : ref}
      </button>
    );
  };
  if (loading || startupError)
    return (
      <div className="login">
        <div className="brand">
          <CoThreadLogo className="brand-logo" />
          <span>共序 <small>CoThread</small></span>
        </div>
        <p role="status">{startupError || "正在加载工作空间…"}</p>
        {startupError && <button onClick={() => void loadWorkspace()}><UiIcon name="refresh" size={13} />重新加载</button>}
      </div>
    );
  if (!user)
    return (
      <div className="login">
        <AuthParticleBackground />
        <div className="login-story" onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty("--spot-x", `${event.clientX - bounds.left}px`);
          event.currentTarget.style.setProperty("--spot-y", `${event.clientY - bounds.top}px`);
        }}>
          <div className="brand">
            <CoThreadLogo className="brand-logo" />
            <span>共序 <small>CoThread</small></span>
          </div>
          <h1>
            讨论有承接。
            <br />
            决定有出处。
          </h1>
          <p>
            让人和各自的 AI，在同一个项目里接力。
            <br />
            从一条消息，到一个被确认的版本。
          </p>
          <div className="story-tags">
            <span><UiIcon name="chat" size={13} />团队讨论</span>
            <span><UiIcon name="layers" size={13} />版本沉淀</span>
            <span><UiIcon name="checkCircle" size={13} />协作交付</span>
          </div>
        </div>
        <EmailAuth api={api} onLogin={setUser} />
        <a className="login-about" href="/about_us.html" target="_blank" rel="noopener noreferrer">关于我们</a>
      </div>
    );
  const versions =
    detail?.versions.filter(
      (v, i, all) =>
        !v.deleted_at &&
        (history ||
          all.findIndex((x) => x.artifact_id === v.artifact_id) === i),
    ) || [];
  const threads = detail?.threads || [];
  const activeThreads = threads.filter((t) => t.status === "active");
  const archivedThreads = threads.filter((t) => t.status === "archived");
  const renderThreadLink = (t: (typeof threads)[number]) => (
    <button
      key={t.id}
      className={`thread-link ${threadId === t.id ? "selected" : ""}`}
      onClick={() => setThreadId(t.id)}
    >
      <span>{t.status === "archived" ? <UiIcon name="archive" size={14} /> : <UiIcon name="chat" size={14} />}</span>
      <span className="thread-card-body">
        <strong>{t.title}</strong>
        <span className="thread-card-meta">
          <span>{t.creator}</span>
          <time
            dateTime={t.last_active_at?.replace(" ", "T") + "Z"}
            title={localDate(t.last_active_at)}
          >
            活跃于 {relativeActivity(t.last_active_at, clock)}
          </time>
        </span>
      </span>
      {t.status === "archived" && <small className="ui-icon-text"><UiIcon name="archive" size={10} />归档</small>}
    </button>
  );
  const startPanelDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth =
      rightPanelWidth ??
      document.querySelector(".context-panel")?.getBoundingClientRect().width ??
      380;
    const onMove = (move: PointerEvent) => {
      const max = Math.max(320, Math.round(window.innerWidth * 0.6));
      const next = Math.min(Math.max(startWidth + (startX - move.clientX), 220), max);
      setRightPanelWidth(next);
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
  return (
    <div
      className={`app-shell ${leftOpen ? "" : "left-closed"} ${contextOpen ? "" : "right-closed"}`}
      style={
        rightPanelWidth
          ? ({ "--right-panel": `${rightPanelWidth}px` } as React.CSSProperties)
          : undefined
      }
    >
      <header className="workspace-topbar">
        <nav className="project-tabs" aria-label="项目页签">
          {visibleProjects.map((p, index) => (
            <React.Fragment key={p.id}>
              {!p.tab_pinned_at &&
                index > 0 &&
                visibleProjects[index - 1].tab_pinned_at && (
                  <span
                    className="project-tabs-divider"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="固定项目与普通项目分隔"
                  />
                )}
              <div
                className={`project-tab ${projectId === p.id ? "selected" : ""} ${p.tab_pinned_at ? "pinned" : ""} ${draggedProject === p.id ? "dragging" : ""} ${projectDrop?.id === p.id ? (projectDrop.after ? "drop-after" : "drop-before") : ""}`}
                draggable={!!p.tab_pinned_at && !busy}
                onDragStart={(event) => {
                  if (
                    !p.tab_pinned_at ||
                    busy ||
                    (event.target as HTMLElement).closest(
                      ".project-tab-actions",
                    )
                  ) {
                    event.preventDefault();
                    return;
                  }
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    "application/x-cothread-project",
                    p.id,
                  );
                  setDraggedProject(p.id);
                }}
                onDragOver={(event) => {
                  if (!draggedProject || !p.tab_pinned_at || busy) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  const rect = event.currentTarget.getBoundingClientRect();
                  setProjectDrop(
                    p.id === draggedProject
                      ? null
                      : {
                          id: p.id,
                          after: event.clientX > rect.left + rect.width / 2,
                        },
                  );
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  )
                    setProjectDrop(null);
                }}
                onDrop={(event) => {
                  if (!draggedProject || !p.tab_pinned_at) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  reorderPinnedProject(
                    draggedProject,
                    p.id,
                    event.clientX > rect.left + rect.width / 2,
                  );
                  setDraggedProject("");
                  setProjectDrop(null);
                }}
                onDragEnd={() => {
                  setDraggedProject("");
                  setProjectDrop(null);
                }}
              >
                {p.tab_pinned_at && (
                  <span
                    className="project-tab-pin-mark"
                    title="已固定"
                    aria-hidden="true"
                  >
                    <ProjectActionIcon action="pin" />
                  </span>
                )}
                <button
                  aria-current={projectId === p.id ? "page" : undefined}
                  className="project-tab-name"
                  onClick={() => setProjectId(p.id)}
                  title={
                    p.tab_pinned_at
                      ? `${p.name}（拖拽排序，或按 Alt + 左右方向键）`
                      : p.name
                  }
                  onKeyDown={(event) => {
                    if (
                      !p.tab_pinned_at ||
                      !event.altKey ||
                      !["ArrowLeft", "ArrowRight"].includes(event.key)
                    )
                      return;
                    event.preventDefault();
                    const pinned = visibleProjects.filter(
                      (project) => project.tab_pinned_at,
                    );
                    const right = event.key === "ArrowRight";
                    const target =
                      pinned[
                        pinned.findIndex((project) => project.id === p.id) +
                          (right ? 1 : -1)
                      ];
                    if (target) reorderPinnedProject(p.id, target.id, right);
                  }}
                >
                  {p.name}
                </button>
                <div className="project-tab-actions">
                  <button
                    disabled={busy}
                    title={p.tab_pinned_at ? "取消固定" : "固定项目"}
                    aria-label={`${p.tab_pinned_at ? "取消固定" : "固定"} ${p.name}`}
                    onClick={() =>
                      updateProjectTab(p.id, p.tab_pinned_at ? "unpin" : "pin")
                    }
                  >
                    <ProjectActionIcon
                      action={p.tab_pinned_at ? "unpin" : "pin"}
                    />
                  </button>
                  {!p.tab_pinned_at && (
                    <button
                      disabled={busy}
                      title="移出页签区（不删除项目）"
                      aria-label={`移出页签区 ${p.name}`}
                      onClick={() => updateProjectTab(p.id, "close")}
                    >
                      <ProjectActionIcon action="close" />
                    </button>
                  )}
                </div>
              </div>
            </React.Fragment>
          ))}
          <button
            className="new-project-tab"
            title="添加项目"
            aria-label="添加项目"
            disabled={busy}
            onClick={showProjectPicker}
          >
            ＋
          </button>
        </nav>
        <ThemePicker theme={user.ui_theme || DEFAULT_UI_THEME} api={api} onChange={setUser} />
        <Notifications key={user.id} api={api} onOpen={(target) => {
          setProjects(target.projects);
          setProjectPickerOpen(false);
          if (target.projectId === projectId) {
            if (target.threadId) { setThreadId(target.threadId); setShowArchived(true); }
          } else {
            pendingNotification.current = target;
            setProjectId(target.projectId);
          }
        }} />
        <button
          className="sidebar-toggle"
          aria-label={contextOpen ? "收起右侧栏" : "展开右侧栏"}
          title={contextOpen ? "收起右侧栏" : "展开右侧栏"}
          aria-expanded={contextOpen}
          onClick={() => setContextOpen(!contextOpen)}
        >
          <PanelIcon side="right" />
        </button>
      </header>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <CoThreadLogo className="sidebar-logo sidebar-brand-mark" title="共序 LOGO" />
          <span className="sidebar-brand-name">
            共序 <small>CoThread</small>
          </span>
          <button
            className={`sidebar-toggle ${leftOpen ? "sidebar-collapse-toggle" : "sidebar-brand-toggle"}`}
            aria-label={leftOpen ? "收起左侧栏" : "展开左侧栏"}
            title={leftOpen ? "收起左侧栏" : "展开左侧栏"}
            aria-expanded={leftOpen}
            onClick={() => setLeftOpen(!leftOpen)}
          >
            <CoThreadLogo className="sidebar-logo sidebar-rail-logo" aria-hidden="true" />
            <span
              className={
                leftOpen ? "sidebar-collapse-control" : "sidebar-brand-control"
              }
              aria-hidden="true"
            >
              <PanelIcon side="left" />
            </span>
          </button>
        </div>
        <div className="section-label">
          <span className="sidebar-label">迭代讨论</span>
          <button
            className="sidebar-create"
            title="新迭代"
            aria-label="新迭代"
            disabled={!projectId || !writable}
            onClick={() => open("thread")}
          >
            <UiIcon name="send" size={18} />
            <span className="sidebar-create-label">新迭代</span>
          </button>
        </div>
        <div
          ref={threadViewportRef}
          className={`thread-viewport${showArchived ? " is-archived-open" : ""}`}
        >
          <div
            className="thread-track"
            style={{
              transform:
                showArchived && threadPaneHeight
                  ? `translateY(-${threadPaneHeight}px)`
                  : "translateY(0)",
            }}
          >
            <div
              className="thread-pane thread-pane-active"
              style={threadPaneHeight ? { height: threadPaneHeight } : undefined}
              aria-hidden={showArchived}
              inert={showArchived ? true : undefined}
            >
              <nav aria-label="活跃迭代">
                {activeThreads.map(renderThreadLink)}
                {!activeThreads.length && (
                  <p className="muted side-empty">
                    还没有迭代讨论
                    <br />
                    从一次新的需求开始。
                  </p>
                )}
              </nav>
            </div>
            <button
              ref={archiveToggleRef}
              className="archive-toggle"
              type="button"
              aria-expanded={showArchived}
              aria-controls="archived-thread-list"
              onClick={() => setShowArchived(!showArchived)}
            >
              <UiIcon name="archive" size={13} /> {showArchived ? "隐藏已归档" : "查看已归档"}
            </button>
            <div
              className="thread-pane thread-pane-archived"
              id="archived-thread-list"
              style={threadPaneHeight ? { height: threadPaneHeight } : undefined}
              aria-hidden={!showArchived}
              inert={showArchived ? undefined : true}
            >
              <nav aria-label="已归档迭代">
                {archivedThreads.map(renderThreadLink)}
                {!archivedThreads.length && (
                  <p className="muted side-empty">
                    还没有已归档的迭代
                  </p>
                )}
              </nav>
            </div>
          </div>
        </div>
        <div className="sidebar-bottom">
          <button
            className="sidebar-card sidebar-project-management"
            title={`项目基础信息、人类成员、连接器与${AGENT_LEVEL_LABELS.l1}`}
            aria-label="项目管理"
            disabled={!projectId}
            onClick={() => setProjectManagementOpen(true)}
          >
            <span className="sidebar-card-icon"><SidebarIcon kind="project" /></span>
            <span className="sidebar-card-copy">项目管理<small>人类成员、连接器与{AGENT_LEVEL_LABELS.l1}</small></span>
            <span className="sidebar-card-action" aria-hidden="true">›</span>
          </button>
          <button
            className="sidebar-card sidebar-monitor"
            title="查看所有小祥的运行状态"
            aria-label="小祥监控"
            disabled={!projectId}
            onClick={() => setMonitorOpen(true)}
          >
            <span className="sidebar-card-icon"><SidebarIcon kind="monitor" /></span>
            <span className="sidebar-card-copy">小祥监控<small>调度、执行与知识整理</small></span>
            <span className="sidebar-card-action" aria-hidden="true">›</span>
          </button>
          <button
            className="sidebar-card sidebar-profile"
            title={`${user.name} · 设置`}
            aria-label={`${user.name} · 设置`}
            onClick={() => open("profile")}
          >
            <span className="avatar">
              {user.avatar ? <img loading="lazy" decoding="async" src={user.avatar} alt="" /> : user.name[0]}
            </span>
            <span className="sidebar-card-copy">
              {user.name}
              <small>{user.motto || user.username}</small>
            </span>
            <span className="sidebar-card-action" aria-hidden="true">
              <UiIcon name="settings" size={14} />
            </span>
          </button>
        </div>
      </aside>
      <main
        className={`main ${fileDragOver ? "file-drag-over" : ""}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = active ? "copy" : "none";
            setFileDragOver(!!active);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setFileDragOver(false);
        }}
        onDrop={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setFileDragOver(false);
            if (active)
              uploadTarget.current?.(Array.from(e.dataTransfer.files));
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
        <header>
          <div className="conversation-heading">
            {thread && <span className="conversation-log-group">
              <div className="conversation-views" role="tablist" aria-label="会话视图">
                <button
                  type="button"
                  role="tab"
                  className="conversation-view"
                  aria-selected={threadView === "chat"}
                  onClick={() => setThreadView("chat")}
                ><UiIcon name="chat" size={13} />对话</button>
                <button
                  type="button"
                  role="tab"
                  className="conversation-view"
                  aria-selected={threadView === "trajectory"}
                  data-live={coordinatorLogLabel !== COORDINATOR_LOG_IDLE_LABEL || undefined}
                  title={coordinatorLogLabel === COORDINATOR_LOG_IDLE_LABEL ? "查看轨迹" : coordinatorLogLabel}
                  onClick={() => setThreadView("trajectory")}
                >
                  {coordinatorLogLabel !== COORDINATOR_LOG_IDLE_LABEL && <span className="conversation-log-pulse" aria-hidden="true" />}
                  <UiIcon name="trajectory" size={13} />
                  轨迹
                </button>
              </div>
              {coordinatorLogLabel !== COORDINATOR_LOG_IDLE_LABEL && <span className="conversation-view-status" aria-live="polite">{coordinatorLogLabel}</span>}
              {liveCoordinator && active && <button
                type="button"
                className="conversation-log-stop"
                disabled={busy}
                onClick={() => void run(async () => {
                  await api(`/threads/${threadId}/replies/${liveCoordinator.message_id}/stop`, {});
                  await refresh();
                })}
              ><UiIcon name="stop" size={12} />停止</button>}
            </span>}
          </div>
          {thread?.contextUsage && <div className="conversation-header-actions" role="group" aria-label="会话信息">
            <ContextMeter
              key={threadId}
              usage={thread.contextUsage}
              writable={active}
              onCompact={async () => {
                await api(`/threads/${threadId}/context/compact`, {});
                await refresh();
              }}
            />
          </div>}
        </header>
        {error && !modal && (
          <div className="error banner" role="alert">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {!thread && projectId && (!detail || threadId || detail.threads.length > 0) ? (
          <div className="conversation-loading" role="status" aria-live="polite" aria-busy="true">
            <p>{threadId ? "正在加载会话…" : "正在加载项目…"}</p>
            <div className="conversation-skeleton"><i /><span /><span /></div>
            <div className="conversation-skeleton"><i /><span /><span /></div>
            <div className="conversation-skeleton"><i /><span /><span /></div>
          </div>
        ) : !thread ? (
          <div className="welcome">
            <CoThreadLogo className="welcome-logo" title="共序" />
            <span className="eyebrow">一起构建上下文</span>
            <h1>把工作，接在同一条线上。</h1>
            <p>
              {projectId
                ? "为这个项目发起第一次讨论。"
                : "添加已有项目，或新建项目开始讨论。"}
              <br />
              每个人的想法、AI 的产物和最后的决定，都有自己的位置。
            </p>
            <button
              className="primary"
              onClick={() => (projectId ? open("thread") : showProjectPicker())}
            >
              <UiIcon name="plus" size={14} />
              {projectId ? "发起第一次迭代" : "添加项目"}
            </button>
            <div className="welcome-steps">
              <div>
                <b>01</b>
                <strong>一起讨论</strong>
                <span>按迭代组织团队上下文</span>
              </div>
              <div>
                <b>02</b>
                <strong>提交与确认</strong>
                <span>保留每一份文档的版本</span>
              </div>
              <div>
                <b>03</b>
                <strong>归档与接力</strong>
                <span>让下一次迭代有据可循</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="conversation-stage" hidden={threadView !== "chat"}>
            <MessageNavigator key={threadId} messages={chatMessages} container={conversationRef} onNavigate={navigateMessage} />
            <div
              className="conversation"
              aria-live="polite"
              ref={conversationRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                followConversation.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                if (el.scrollTop < 80 && !followConversation.current && Date.now() > navigationUntil.current) void loadHistory();
              }}
            >
              {thread.archive_snapshot && (
                <div className="archive-card">
                  <span className="eyebrow">迭代归档</span>
                  <h3>这一轮，已有结论</h3>
                  <p>{thread.archive_snapshot.conclusion}</p>
                  <small>讨论、审核与引用的历史版本已固定保存。</small>
                </div>
              )}
              {thread.page?.hasMore && <button type="button" disabled={historyLoading} onClick={() => void loadHistory()}><UiIcon name="history" size={13} />{historyLoading ? "正在加载历史消息…" : "加载更早的消息"}</button>}
              <div className="timeline-start">
                <span>一次迭代，一段共同的上下文</span>
              </div>
              {!thread.messages.length && (
                <div className="conversation-empty">
                  <h3>说说这次想解决的问题</h3>
                  <p>分享背景、目标或一个还没有答案的问题。</p>
                </div>
              )}
              {timeline.map((m, index) => {
                const continuesTurn = continuesCoordinatorTurn(m, timeline[index - 1], thread.replies);
                const lastOfTurn = isLastCoordinatorTurnPost(m, timeline, thread.replies);
                const usageReply = m.source === "assistant" ? usageReplyForMessage(m, thread.replies, timeline) : null;
                return (
                <React.Fragment key={m.render_key || m.id}>
                  <article
                    data-message-id={m.id}
                    className={`message ${m.author_id === user.id && m.source !== "assistant" ? "own" : ""} ${continuesTurn ? "turn-continue" : ""}`}
                    key={m.render_key || m.id}
                  >
                    <span
                      className={`avatar ${m.source === "assistant" ? "ai" : ""}`}
                      aria-hidden={continuesTurn || undefined}
                    >
                      {!continuesTurn && (m.source === "assistant" ? (
                        <img loading="lazy" decoding="async" src={AGENT_MEMBER.avatar} alt="" />
                      ) : messageAvatar(m) ? (
                        <img loading="lazy" decoding="async" src={messageAvatar(m) || undefined} alt="" />
                      ) : (
                        m.author[0]
                      ))}
                    </span>
                    <div className="message-content">
                      {!continuesTurn && <div className="message-meta">
                        <span className="message-author">
                          <strong>
                            <IdentityName
                              role={
                                m.source === "assistant"
                                  ? AGENT_MEMBER.identity_tags[0]
                                  : m.author_role
                              }
                              name={
                                m.source === "assistant"
                                  ? AGENT_MEMBER.name
                                  : m.author
                              }
                            />
                          </strong>
                          {messageMotto(m) && <small>{m.source === "assistant"
                            ? messageMotto(m)
                            : Array.from(messageMotto(m)).slice(0, 15).join("")}</small>}
                        </span>
                        {m.source === "local_ai" && (
                          <span className="source-label"><UiIcon name="connector" size={11} />通过本地 AI 提交</span>
                        )}
                        {m.source === "system" && (
                          <span className="source-label"><UiIcon name="list" size={11} />协作记录</span>
                        )}
                      </div>}
                      {m.source === "assistant" &&
                        thread.replies
                          .filter((reply) => {
                            if (isExecutorReply(reply)) return m.agent_task_id === reply.message_id || reply.reply_id === m.id;
                            return reply.status === "failed" && m.id === `agent-task:${reply.message_id}`;
                          })
                          .map((reply) => (
                            <React.Fragment key={reply.message_id}>
                              {renderAgentRound(reply)}
                            </React.Fragment>
                          ))}
                      {!!m.quotes?.length && <div className="message-quotes">{m.quotes.map(q => (
                        <button key={q.id} type="button" className="message-quote" onClick={() => void run(async () => {
                          const result = await api(`/threads/${threadId}/messages/${q.id}`);
                          setQuotePreview(result.message);
                        })}><strong>{q.source === "assistant" ? AGENT_MEMBER.name : q.author}</strong><span title={clipQuote(q.body, 240)}>{clipQuote(q.body)}</span></button>
                      ))}</div>}
                      <div className="message-text">
                        {thread.updates?.filter((update) => update.message_id === m.id).map((update) => (
                          <p className="source-label" key={update.message_id}>
                            {update.delivered_at ? "已更新当前任务" : "已关联到当前任务，等待助手接收"}
                          </p>
                        ))}
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            img: () => <span>（图片链接）</span>,
                            a: ({ href, children }) => {
                              let versionId: string | undefined;
                              try {
                                const url = new URL(href || "", location.origin);
                                if (url.origin === location.origin)
                                  versionId = url.pathname.match(/^\/api\/versions\/([\da-f-]+)(?:\/download)?\/?$/i)?.[1];
                              } catch {}
                              return versionId
                                ? <button type="button" className="ref" onClick={() => showDocument(versionId)}>{children}</button>
                                : <a href={href}>{children}</a>;
                            },
                          }}
                        >
                          {m.body}
                        </Markdown>
                      </div>
                      {!!m.refs.length && (
                        <div className="references">
                          {m.refs.map(renderRef)}
                        </div>
                      )}
                      {!!m.body.trim() && !m.id.startsWith('agent-reception:') && <div className="message-actions">
                        {m.author_id === user.id && m.source !== "assistant" && <time className="message-action-time">{time(m.created_at)}</time>}
                        <button type="button" title={copiedMessage === m.id ? "已复制" : "复制"} aria-label={copiedMessage === m.id ? "已复制" : "复制"} onClick={() => void copyMessage(m)}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{copiedMessage === m.id ? <path d="m4 10 4 4 8-8"/> : <><rect x="3" y="7" width="11" height="11" rx="4"/><path d="M7 4a4 4 0 0 1 4-3h3a4 4 0 0 1 4 4v5a4 4 0 0 1-2 3.5"/></>}</svg></button>
                        <button type="button" title="引用" aria-label="引用" disabled={!active || m.id.startsWith("optimistic:") || (m.id.startsWith("agent-task:") && !m.quoteTargetId)} onClick={() => {
                          const id = m.quoteTargetId || m.id;
                          const original = thread.messages.find(item => item.id === id) || m;
                          setQuotedMessages(previous => previous.some(q => q.id === id) ? previous : [...previous, {...original, id}].slice(0,10));
                          requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="发送消息"]')?.focus());
                        }}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 5H3v6h5V5Zm9 0h-5v6h5V5ZM8 11c0 3-2 4-4 4m13-4c0 3-2 4-4 4"/></svg></button>
                        {usageReply && <MessageUsage record={usageReply} finishedAt={usageReply.finished_at || m.created_at} allowClockFallback={isExecutorReply(usageReply)}/>}
                        {(m.author_id !== user.id || m.source === "assistant") && (!coordinatorTurnId(m, thread.replies) || (lastOfTurn && !continuesCoordinatorTurn({ source: "assistant", agent_task_id: liveCoordinator?.message_id }, m, thread.replies))) && <time className="message-action-time">{time(m.created_at)}</time>}
                      </div>}
                    </div>
                    {m.delivery_status === "sending" && <span className="message-delivery-control sending" role="status" aria-label="正在发送" title="正在发送" />}
                    {m.delivery_status === "failed" && <button type="button" className="message-delivery-control failed" aria-label="重新发送" title={m.delivery_error || "重新发送"} onClick={() => void persistOptimisticMessage(threadId, m.id, {
                      body: m.body, refs: m.refs, quoteIds: (m.quotes || []).map(quote => quote.id), clientMessageId: m.id.slice("optimistic:".length),
                    }, m.quotes || [])}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>
                    </button>}
                  </article>
                </React.Fragment>
              );})}
              {coordinatorDraft && (() => {
                const draftContinues = continuesCoordinatorTurn({ source: "assistant", agent_task_id: liveCoordinator?.message_id }, timeline[timeline.length - 1], thread.replies);
                return (
                <article className={`message${draftContinues ? " turn-continue" : ""}`} data-message-id={`live-coordinator:${liveCoordinator?.message_id}`} aria-live="polite">
                  <span className="avatar ai" aria-hidden={draftContinues || undefined}>
                    {!draftContinues && <img loading="lazy" decoding="async" src={AGENT_MEMBER.avatar} alt="" />}
                  </span>
                  <div className="message-content">
                    {!draftContinues && <div className="message-meta">
                      <span className="message-author">
                        <strong>
                          <IdentityName role={AGENT_MEMBER.identity_tags[0]} name={AGENT_MEMBER.name} />
                        </strong>
                      </span>
                    </div>}
                    <div className="message-text">
                      <StreamingMarkdown active text={coordinatorDraft} />
                    </div>
                  </div>
                </article>
                );
              })()}
              {thread.runs
                .filter((r) => r.status === "running")
                .map((r) => (
                  <div className="run-progress" role="status" key={r.id}>
                    <strong>✧ {r.progress || "正在执行"}</strong>
                    <span>
                      已用时{" "}
                      {Math.max(
                        0,
                        Math.floor(
                          (clock -
                            new Date(
                              r.created_at.replace(" ", "T") + "Z",
                            ).getTime()) /
                            1000,
                        ),
                      )}{" "}
                      秒
                    </span>
                    <small>你可以继续讨论或刷新页面，任务会在后台运行。</small>
                  </div>
                ))}
              {thread.runs[0] &&
                ["failed", "interrupted"].includes(thread.runs[0].status) && (
                  <div className="reply-status failed" role="alert">
                    {thread.runs[0].output} 可重新发起任务。
                  </div>
                )}
            </div>
            </div>
            {threadView === "trajectory" && threadId && (
              <div className="conversation-stage conversation-stage-trajectory">
                <AgentTrajectory key={threadId} scope={{ type: "thread", id: threadId }} api={api} />
              </div>
            )}
            <div className="composer-area" hidden={threadView !== "chat"}>
              <div className="composer-toolbar">
                <div className="conversation-task-pool" role="group" aria-label="本迭代与我有关的任务" onClick={() => {
                  setTaskMine(true); setSelectedTaskId(""); setTaskDetail(null); openTaskDialog();
                }}>
                  <button type="button" className="conversation-task-pool-label"><UiIcon name="task" size={13} />任务</button>
                  {latestMyTask ? <button type="button" className="conversation-task-item" data-status={latestMyTask.status}
                    title={latestMyTask.title} onClick={(event) => { event.stopPropagation(); setTaskMine(true); openTask(latestMyTask.id); }}>
                    <i aria-hidden="true" /><strong>{latestMyTask.title}</strong>
                  </button> : <span className="conversation-task-empty">暂无与我有关的任务</span>}
                </div>
                <div className="composer-actions" role="group" aria-label="迭代操作">
                  {active && (
                    <button
                      disabled={!active || busy}
                      title="基于助手已有上下文梳理讨论"
                      onClick={() => { setMessage(SUMMARY_REQUEST); requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="发送消息"]')?.focus()); }}
                    >
                      <UiIcon name="sparkle" size={13} /> 梳理讨论
                    </button>
                  )}
                  {active && (
                    <button onClick={() => open("archive")}><UiIcon name="archive" size={13} />归档迭代</button>
                  )}
                </div>
              </div>
              {active ? (
                <Suspense fallback={<div className="composer-loading" role="status">正在加载输入框…</div>}>
                {!!quotedMessages.length && <div className="composer-quotes">{quotedMessages.map(q => <div key={q.id}>
                  <span title={clipQuote(q.body, 240)}>引用 {q.source === "assistant" ? AGENT_MEMBER.name : q.author}：{clipQuote(q.body)}</span>
                  <button type="button" aria-label="取消引用" onClick={() => setQuotedMessages(items => items.filter(item => item.id !== q.id))}>×</button>
                </div>)}</div>}
                <ChatComposer
                  key={`${projectId}:${threadId}`}
                  projectId={projectId}
                  threadId={threadId}
                  message={message}
                  setMessage={setMessage}
                  refs={refs}
                  setRefs={setRefs}
                  versions={detail?.versions || []}
                  members={detail?.members || []}
                  busy={busy}
                  uploadTarget={uploadTarget}
                  copyLabel={copiedThreadId === threadId ? "已复制" : "复制会话"}
                  connectorControl={<ConnectorPanel
                    devices={connectors}
                    availability={connectorAvailability}
                    projectId={projectId}
                    currentUserId={user.id}
                    available={localAvailable}
                    api={api}
                    onRefresh={refreshConnectors}
                  />}
                  onCopyConversation={() => void copyConversationInfo()}
                  onRefresh={refresh}
                  onSend={async () => {
                    const targetThreadId = threadId;
                    const body = message;
                    const selectedRefs = [...refs];
                    const selectedQuotes = [...quotedMessages];
                    const optimisticId = `optimistic:${crypto.randomUUID()}`;
                    const optimistic = {
                      id: optimisticId,
                      sequence: ((thread?.messages.reduce((latest, item) => {
                        try { return BigInt(item.sequence) > latest ? BigInt(item.sequence) : latest; }
                        catch { return latest; }
                      }, 0n) || 0n) + 1n).toString(),
                      body,
                      source: "web",
                      refs: selectedRefs,
                      author: user.name,
                      author_id: user.id,
                      author_avatar: user.avatar,
                      author_role: user.identity_tags[0] || null,
                      quotes: selectedQuotes,
                      created_at: new Date().toISOString(),
                      execution_target: "cloud" as const,
                      delivery_status: "sending" as const,
                    };
                    threadCache.current.cancel(targetThreadId);
                    updateThreadCache(targetThreadId, current => ({ ...current, messages: [...current.messages, optimistic] }));
                    setQuotedMessages([]);
                    setMessage("");
                    setRefs([]);
                    followConversation.current = true;
                    void persistOptimisticMessage(targetThreadId, optimisticId, {
                      body, refs: selectedRefs, quoteIds: selectedQuotes.map(q => q.id), clientMessageId: optimisticId.slice("optimistic:".length),
                    }, selectedQuotes);
                    return true;
                  }}
                />
                </Suspense>
              ) : (
                <div className="readonly">
                  {thread.status === "archived"
                    ? "此迭代已归档。历史讨论与文档可以继续查阅，也可以引用到新的迭代。"
                    : "你正在以只读成员身份查看此迭代。"}
                  <div className="composer-tools">
                    <ConnectorPanel
                      devices={connectors}
                      availability={connectorAvailability}
                      projectId={projectId}
                      currentUserId={user.id}
                      available={localAvailable}
                      api={api}
                      onRefresh={refreshConnectors}
                    />
                    <span className="composer-tools-split" aria-hidden="true" />
                    <button type="button" className="composer-connector" onClick={() => void copyConversationInfo()}>
                      <UiIcon name="copy" size={15} />
                      {copiedThreadId === threadId ? "已复制" : "复制会话"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
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
        {projectId && (
          <Suspense fallback={<p className="muted">正在加载文件树…</p>}>
            <Documents
              key={projectId}
              projectId={projectId}
              threadId={threadId || undefined}
              writable={writable}
              iterationWritable={active}
              folders={detail?.folders || []}
              versions={detail?.versions || []}
              organizationJobs={detail?.documentOrganizationJobs || []}
              selected={documentId}
              onSelect={setDocumentId}
              onRefresh={async () =>
                setDetail(await api(`/projects/${projectId}?view=chat`))
              }
              onReference={
                active
                  ? addVersionToConversation
                  : undefined
              }
              onReview={
                active
                  ? async (id, decision, comment) => {
                      await api(`/versions/${id}/reviews`, { decision, comment, threadId }, "POST");
                      await refresh();
                    }
                  : undefined
              }
            />
          </Suspense>
        )}
      </aside>
      {taskDialogOpen && <ModalBackdrop onClose={() => setTaskDialogOpen(false)}>
        {(close) => <section className="task-pool-dialog" role="dialog" aria-modal="true" aria-labelledby="task-pool-dialog-title" onClick={(event) => event.stopPropagation()}>
          <header className="task-pool-dialog-header">
            <div>
              <span>当前迭代</span>
              <h2 id="task-pool-dialog-title">本迭代任务</h2>
              <p>{detail?.threads.find((item) => item.id === threadId)?.title || "未选择迭代"}</p>
            </div>
            <DialogClose autoFocus onClick={close} label="关闭本迭代任务" />
          </header>
          <div className="task-pool-dialog-body">
            <aside className="task-pool-dialog-list">
              <div className="task-pool-heading">
                <label className="task-mine-filter"><input type="checkbox" checked={taskMine} onChange={(event) => setTaskMine(event.target.checked)} />只看我的任务</label>
                {writable && <button type="button" className="task-create-toggle" onClick={() => setTaskCreateOpen((open) => !open)}>{taskCreateOpen ? <><UiIcon name="close" size={12} />取消</> : <><UiIcon name="plus" size={12} />新建任务</>}</button>}
              </div>
              {taskCreateOpen && <form className="task-create-form" onSubmit={(event) => {
                event.preventDefault();
                if (!taskCreateTitle.trim() || !taskCreateGoal.trim() || !taskCreateTarget) return;
                void performTaskAction(async () => {
                  const created = await api(`/projects/${projectId}/tasks`, {
                    title: taskCreateTitle.trim(), goal: taskCreateGoal.trim(),
                    constraints: taskCreateConstraints.trim() || undefined,
                    targetType: "human_member",
                    targetUserId: taskCreateTarget,
                    threadId,
                  });
                  setTaskCreateTitle(""); setTaskCreateGoal(""); setTaskCreateConstraints(""); setTaskCreateTarget(user?.id || ""); setTaskCreateOpen(false);
                  setSelectedTaskId(created.id);
                });
              }}>
                <input value={taskCreateTitle} onChange={(event) => setTaskCreateTitle(event.target.value)} placeholder="任务标题" maxLength={240} />
                <textarea value={taskCreateGoal} onChange={(event) => setTaskCreateGoal(event.target.value)} placeholder="任务目标与验收标准" maxLength={20000} />
                <textarea value={taskCreateConstraints} onChange={(event) => setTaskCreateConstraints(event.target.value)} placeholder="约束（可选）" maxLength={20000} />
                <select value={taskCreateTarget} onChange={(event) => setTaskCreateTarget(event.target.value)}>
                  <option value="">选择指派成员</option>
                  {detail?.members.filter((member) => member.kind !== "l1" && member.id !== AGENT_MEMBER.id && member.role !== "viewer").map((member) => <option key={member.id} value={member.id}>{member.name}{member.id === user?.id ? "（我）" : ""}</option>)}
                </select>
                <button type="submit" className="primary" disabled={taskActionBusy || !taskCreateTitle.trim() || !taskCreateGoal.trim() || !taskCreateTarget}><UiIcon name="plus" size={13} />创建正式任务</button>
              </form>}
              <div className="task-pool-list">
                {visibleTasks.map((task) => {
                  return <button type="button" className="task-pool-item" aria-current={selectedTaskId === task.id ? "true" : undefined} key={task.id} onClick={() => openTask(task.id)}>
                    <span className="task-pool-item-heading"><span><strong>{task.title}</strong><small>来源 {taskSourceLabel(task)} · 执行 {taskExecutorLabel(task)}</small></span><i data-status={task.status}><UiIcon name={workflowIcon(task.status)} size={10} />{labelWorkflowStatus(task.status)}</i></span>
                  </button>;
                })}
                {!visibleTasks.length && <p className="panel-empty">{taskMine ? "暂无与我有关的任务。" : "当前迭代暂无任务。"}</p>}
              </div>
            </aside>
            <div className="task-pool-dialog-detail">
              {selectedTaskId ? (() => {
                const task = taskDetail;
                const isTarget = task?.target_type === "human_member" && task.target_id === user.id;
                const isSource = !!task && ((task.source_user_id === user.id) || (task.created_by_type === "human_member" && task.created_by_id === user.id));
                const canTransfer = !!task && isTarget && ["awaiting_acceptance", "assigned", "pending_assignment", "pending_start", "queued", "waiting", "blocked"].includes(task.status);
                const openQuestion = task?.questions.find((question) => question.status === "open" && question.source_user_id === user.id);
                const canReviewRejection = !!task && task.status === "rejected" && task.rejectionReview.rejected && !task.rejectionReview.resolved &&
                  task.rejectionReview.reviewer_type === "human_member" && task.rejectionReview.reviewer_id === user.id;
                const targetName = detail?.members.find((member) => member.id === task?.target_id)?.name || (task?.target_type === "l2_session" ? "小祥" : "未指派");
                return <div className="task-detail">
                  {!task || task.id !== selectedTaskId ? <p className="muted">正在读取任务详情…</p> : <>
                    <header><div><small>{task.task_type === "assist_l2" ? "辅助任务" : "正式任务"}</small><h3>{task.title}</h3></div><div className="task-detail-header-actions"><button type="button" onClick={() => setAgentLogScope({ type: "task", id: task.id })}><UiIcon name="trajectory" size={11} />轨迹</button><span data-status={task.status}><UiIcon name={workflowIcon(task.status)} size={10} />{labelWorkflowStatus(task.status)}</span></div></header>
                    <dl className="task-detail-meta"><div><dt>任务来源</dt><dd>{taskSourceLabel(task)}</dd></div><div><dt>任务执行</dt><dd>{taskExecutorLabel(task)}</dd></div><div><dt>责任主体</dt><dd>{targetName}</dd></div><div><dt>任务类型</dt><dd>{task.task_type === "assist_l2" ? "辅助任务" : "正式任务"}</dd></div></dl>
                    <section><h4>任务目标</h4><p>{task.goal}</p>{task.constraints && <><h4>约束</h4><p>{task.constraints}</p></>}</section>
                    {openQuestion && <section className="task-question"><h4>需要你回答</h4><p>{openQuestion.question}</p><textarea value={taskAnswer} onChange={(event) => setTaskAnswer(event.target.value)} placeholder="输入回答" /><button type="button" className="primary" disabled={taskActionBusy || !taskAnswer.trim()} onClick={() => void performTaskAction(async () => { await api(`/task-questions/${openQuestion.id}/answer`, { answer: taskAnswer }); setTaskAnswer(""); })}>提交回答</button></section>}
                    {isTarget && task.status === "awaiting_acceptance" && <section className="task-actions-section"><h4>确认任务</h4>{projectConnectorBound
                      ? <select value={taskExecutionMode === "auto" ? "member_connector" : taskExecutionMode} onChange={(event) => setTaskExecutionMode(event.target.value as typeof taskExecutionMode)}><option value="member_connector">下发连接器</option><option value="human_direct">由本人执行</option></select>
                      : <p className="muted">当前账号未连接本项目连接器，确认后由本人执行。</p>}
                    <div className="task-action-buttons"><button type="button" disabled={taskActionBusy} onClick={() => void performTaskAction(() => api(`/tasks/${task.id}/reject`, {}, "POST"))}><UiIcon name="reject" size={13} />拒绝</button><button type="button" className="primary" disabled={taskActionBusy} onClick={() => void performTaskAction(() => api(`/tasks/${task.id}/accept`, { mode: projectConnectorBound ? (taskExecutionMode === "human_direct" ? "human_direct" : "member_connector") : "human_direct" }, "POST"))}><UiIcon name="check" size={13} />确认</button></div></section>}
                    {isSource && task.status === "awaiting_acceptance" && <section className="task-actions-section"><h4>来源操作</h4><button type="button" disabled={taskActionBusy} onClick={() => void performTaskAction(() => api(`/tasks/${task.id}/cancel`, {}, "POST"))}><UiIcon name="close" size={13} />取消</button></section>}
                    {canReviewRejection && <section className="task-actions-section task-rejection-review"><h4>任务已被拒绝</h4><p>{[...task.assignmentHistory].reverse().find((event) => event.event_type === "rejected")?.reason || "目标成员拒绝了这个任务。"}</p><textarea value={taskReopenGoal} onChange={(event) => setTaskReopenGoal(event.target.value)} placeholder="修改任务目标与验收标准" /><textarea value={taskReopenConstraints} onChange={(event) => setTaskReopenConstraints(event.target.value)} placeholder="修改约束（可选）" /><div className="task-action-buttons"><button type="button" disabled={taskActionBusy} onClick={() => void performTaskAction(() => api(`/tasks/${task.id}/acknowledge-rejection`, {}, "POST"))}>知道了</button><button type="button" className="primary" disabled={taskActionBusy || !taskReopenGoal.trim()} onClick={() => void performTaskAction(() => api(`/tasks/${task.id}/reopen`, { goal: taskReopenGoal.trim(), constraints: taskReopenConstraints }, "POST"))}>修改后重新发起</button></div></section>}
                    {canTransfer && <section className="task-actions-section"><h4>转交任务</h4><select value={taskTransferTarget} onChange={(event) => setTaskTransferTarget(event.target.value)}><option value="">选择新的责任主体</option><option value="l2_session">小祥</option>{detail?.members.filter((member) => member.id !== user.id && member.kind !== "l1" && member.id !== AGENT_MEMBER.id && member.role !== "viewer").map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><button type="button" disabled={taskActionBusy || !taskTransferTarget} onClick={() => void performTaskAction(() => api(`/tasks/${task.id}/reassign`, taskTransferTarget === "l2_session" ? { targetType: "l2_session" } : { targetType: "human_member", targetUserId: taskTransferTarget }, "POST"))}><UiIcon name="transfer" size={13} />确认转交</button></section>}
                    {isTarget && task.execution_agent_type === "human_self" && !endedTask(task.status) && task.status !== "awaiting_acceptance" && <section className="task-actions-section"><h4>进度与结果</h4><textarea value={taskResult} onChange={(event) => setTaskResult(event.target.value)} placeholder="结果摘要" /><div className="task-status-actions"><button type="button" disabled={taskActionBusy} onClick={() => void performTaskAction(() => api(`/tasks/${task.id}`, { status: "abandoned", resultSummary: taskResult || "已放弃" }, "PATCH"))}><UiIcon name="abandon" size={13} />放弃</button><button type="button" className="primary" disabled={taskActionBusy} onClick={() => void performTaskAction(() => api(`/tasks/${task.id}`, { status: "completed", resultSummary: taskResult || "已完成" }, "PATCH"))}><UiIcon name="complete" size={13} />完成</button></div></section>}
                    {!!task.executionRuns.length && <section><h4>执行轮次</h4><div className="task-history">{task.executionRuns.map((run) => <div key={run.id}><strong>{run.executor_type === "dsh_l3" ? (l3ExecutorName(run.executor_id, threadExecutorIds) || (run.executor_id ? AGENT_LEVEL_LABELS.l3 : `${AGENT_LEVEL_LABELS.l3}（未绑定）`)) : run.executor_type === "human_self" ? (memberName(run.executor_id) || "成员本人") : labelExecutorType(run.executor_type)}</strong><span>{labelWorkflowStatus(run.status)}</span><small>{run.progress || run.result_summary || run.error || time(run.created_at)}</small></div>)}</div></section>}
                    {(!!task.assignmentHistory.length || !!task.statusHistory?.length) && <section><h4>变更记录</h4><div className="task-history">{taskChangeLog(task).map((item) => <div key={item.key}><strong>{item.title}</strong><span>{statusActorLabel({ actor_type: item.actorType, actor_id: item.actorId })} · {time(item.at)}</span>{item.transition && <small>当时任务状态：{item.transition}</small>}{item.reason && <small>{item.reason}</small>}</div>)}</div></section>}
                  </>}
                  {taskActionError && <p className="project-settings-error" role="alert">{taskActionError}</p>}
                </div>;
              })() : <p className="panel-empty">选择左侧任务，查看详情和操作。</p>}
            </div>
          </div>
        </section>}
      </ModalBackdrop>}
      {quotePreview && <ModalBackdrop onClose={() => setQuotePreview(null)}>
        {(close) => <section className="quoted-message-dialog" role="dialog" aria-modal="true" aria-label="引用消息原文" onClick={e => e.stopPropagation()}>
          <div className="quoted-message-dialog-header"><DialogClose autoFocus onClick={close} label="关闭原文" /></div>
          <strong>{quotePreview.source === "assistant" ? AGENT_MEMBER.name : quotePreview.author}</strong>
          <Markdown remarkPlugins={[remarkGfm]} components={{img: () => <span>（图片链接）</span>}}>{quotePreview.body}</Markdown>
          <div className="references">{quotePreview.refs.map(renderRef)}</div>
        </section>}
      </ModalBackdrop>}
      {projectManagementOpen && projectId && (
        <ProjectManagement
          detail={detail?.id === projectId ? detail : null}
          busy={busy}
          creator={creator}
          projectMember={projectMember}
          api={api}
          localDate={localDate}
          refresh={refresh}
          onProjectRenamed={(updated) => {
            setProjects((rows) => rows.map((project) => project.id === updated.id ? {
              ...project,
              name: updated.name,
              description: updated.description ?? project.description,
            } : project));
            setDetail((previous) => previous && previous.id === updated.id ? {
              ...previous,
              name: updated.name,
              description: updated.description ?? previous.description,
            } : previous);
          }}
          onClose={() => setProjectManagementOpen(false)}
        />
      )}
      {monitorOpen && projectId && (
        <AgentMonitor
          projectId={projectId}
          projectName={detail?.name || "当前项目"}
          api={api}
          onClose={() => setMonitorOpen(false)}
        />
      )}
      {agentLogScope && <AgentLogDialog scope={agentLogScope} api={api} onClose={() => setAgentLogScope(null)} />}
      {connectorAuthorizationId && <ConnectorAuthorization
        id={connectorAuthorizationId}
        callbackPort={connectorCallbackPort}
        callbackSecret={connectorCallbackSecret}
        api={connectorAuthorizationApi}
        onDone={closeConnectorAuthorization}
      />}
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
      {modal && (
        <ModalBackdrop onClose={() => setModal(null)} enabled={!busy}>
          {(close) => <section
            className={`modal ${["profile", "settings", "password", "email", "admin-projects", "admin-accounts", "admin-plugins"].includes(modal) ? "workspace-settings" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-header">
              <h2 id="modal-title">
                {
                  {
                    project: "创建项目",
                    thread: "发起迭代",
                    profile: "个人设置",
                    settings: "个人设置",
                    archive: "归档本次迭代",
                    password: "个人设置",
                    email: "个人设置",
                    "admin-projects": "系统管理",
                    "admin-accounts": "系统管理",
                    "admin-plugins": "系统管理",
                    run: "在沙箱中执行",
                  }[modal]
                }
              </h2>
              <DialogClose disabled={busy} onClick={close} label="关闭" />
            </div>
            <div
              className={
                ["profile", "settings", "password", "email", "admin-projects", "admin-accounts", "admin-plugins"].includes(modal)
                  ? "settings-layout"
                  : undefined
              }
            >
              {["profile", "settings", "password", "email", "admin-projects", "admin-accounts", "admin-plugins"].includes(
                modal,
              ) && (
                <nav className="settings-nav" aria-label="设置项目">
                  {user.is_super_admin && <div className="settings-mode" aria-label="设置模式">
                    <button type="button" className={!modal.startsWith("admin-") ? "active" : ""} onClick={() => open("profile")}><UiIcon name="human" size={12} />个人设置</button>
                    <button type="button" className={modal.startsWith("admin-") ? "active" : ""} onClick={() => open("admin-projects")}><UiIcon name="settings" size={12} />系统管理</button>
                  </div>}
                  {(modal.startsWith("admin-") ? [
                      ["admin-projects", "项目管理", "project"],
                      ["admin-accounts", "成员管理", "members"],
                      ["admin-plugins", "插件管理", "plugin"],
                    ] : [
                      ["profile", "个人资料", "human"],
                      ["password", "修改密码", "lock"],
                      ["email", "绑定邮箱", "email"],
                      ["settings", "退出登录", "logout"],
                    ] as const).map(([value, label, icon]) => (
                    <button
                      key={value}
                      type="button"
                      aria-current={modal === value ? "page" : undefined}
                      disabled={busy}
                      onClick={() => open(value as Modal)}
                    >
                      <UiIcon name={icon as UiIconName} size={14} />
                      {label}
                    </button>
                  ))}
                </nav>
              )}
              <form key={modal} onSubmit={submitModal}>
                {(modal === "admin-projects" || modal === "admin-accounts" || modal === "admin-plugins") && (
                  <SystemManagement
                    section={modal === "admin-projects" ? "projects" : modal === "admin-accounts" ? "accounts" : "plugins"}
                    api={api}
                    currentUserId={user.id}
                    onProjectsChanged={async () => { setProjects(await api("/projects")); }}
                  />
                )}
                {["profile", "settings", "password", "email"].includes(
                  modal,
                ) && (
                  <div className="settings-content-heading">
                    <h3>
                      {modal === "profile"
                        ? "个人资料"
                        : modal === "password"
                          ? "修改密码"
                          : modal === "email"
                            ? "绑定邮箱"
                            : "退出登录"}
                    </h3>
                    <p>
                      {modal === "email"
                        ? "验证邮箱后，可使用邮箱登录和找回密码。"
                        : "管理你的通用账号"}
                    </p>
                  </div>
                )}
                {modal === "profile" && (
                  <ProfileFields
                    user={user}
                    avatar={profileAvatar}
                    busy={busy}
                    onUpload={(file) =>
                      void run(async () => {
                        setProfileAvatar(await prepareAvatar(file));
                      })
                    }
                    onRemove={() => setProfileAvatar(null)}
                  />
                )}
                {modal === "settings" && (
                  <div className="settings-logout-panel">
                    <div className="settings-identity">
                      <strong>{user.name}</strong>
                      <small>账号：{user.username}{user.email ? ` · ${user.email}` : " · 未绑定邮箱"}</small>
                    </div>
                    <p className="muted">
                      退出当前账号后，可重新登录继续访问你的项目。
                    </p>
                    <button
                      type="button"
                      className="settings-logout"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api("/logout", {});
                          setModal(null);
                          setUser(null);
                          setProjects([]);
                          setProjectId("");
                          setThreadId("");
                          setContextOpen(false);
                        })
                      }
                    >
                      <span><UiIcon name="logout" size={14} /></span>
                      <span>退出登录</span>
                    </button>
                  </div>
                )}
                {modal === "project" && (
                  <>
                    <label>
                      项目名称
                      <input
                        name="name"
                        maxLength={120}
                        autoFocus
                        required
                        placeholder="例如：共序产品研发"
                      />
                    </label>
                    <label>
                      项目简介
                      <textarea
                        name="description"
                        maxLength={4000}
                        placeholder="这个项目要达成什么目标？"
                      />
                    </label>
                  </>
                )}
                {modal === "thread" && (
                  <label>
                    这次迭代的主题
                    <input
                      name="title"
                      maxLength={160}
                      autoFocus
                      required
                      placeholder="例如：v0.1 · 协作闭环"
                    />
                  </label>
                )}
                {modal === "archive" && (
                  <>
                    <p>
                      保存这一轮的结论、完整讨论、审核记录和引用版本；本迭代产物文件中已确认的最新版本将自动另存至正式文件（名称后带版本号，不含缓存文件）。归档后不可继续修改。
                    </p>
                    <label>
                      验收与归档结论
                      <textarea
                        name="conclusion"
                        autoFocus
                        required
                        maxLength={20000}
                        placeholder="完成了什么？确认了哪些结果？哪些问题留给下一轮？"
                      />
                    </label>
                  </>
                )}
                {modal === "password" && (
                  <>
                    <div className="settings-identity">
                      <strong>{user.name}</strong>
                      <small>账号：{user.username}{user.email ? ` · ${user.email}` : " · 未绑定邮箱"}</small>
                    </div>
                    <label>
                      当前密码
                      <input
                        name="currentPassword"
                        type="password"
                        required
                        autoComplete="current-password"
                      />
                    </label>
                    <PasswordField label="新密码" autoComplete="new-password" required />
                    <p className="muted">
                      修改后，其他登录会话和 AI 令牌会失效。
                    </p>
                  </>
                )}
                {modal === "email" && <EmailBinding email={user.email} api={api} onBound={(profile) => { setUser(profile); }} />}
                {modal === "run" && (
                  <>
                    <p>
                      使用临时沙箱执行。当前讨论和最近 40
                      个文档版本会复制到沙箱，需要保留的成果请保存到文档库。
                    </p>
                    <label>
                      命令
                      <textarea
                        name="command"
                        required
                        maxLength={8000}
                        defaultValue="pwd && ls -la"
                      />
                    </label>
                    <p className="muted">
                      context.json 保存讨论，manifest.json
                      保存文档目录。运行结果将保留在当前迭代。
                    </p>
                  </>
                )}
                {error && (
                  <div className="error" role="alert">
                    {error}
                  </div>
                )}
                {(modal === "profile" || modal === "password" || modal === "project" || modal === "thread" || modal === "archive" || modal === "run") && (
                <div className="modal-footer">
                  {!["profile", "password"].includes(modal) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={close}
                    >
                      <UiIcon name="close" size={13} />
                      关闭
                    </button>
                  )}
                  <button className="primary" disabled={busy}>
                    <UiIcon name={busy ? "running" : modal === "archive" ? "archive" : "save"} size={13} />
                    {busy
                      ? "正在处理…"
                      : modal === "profile"
                        ? "保存资料"
                        : modal === "archive"
                          ? "确认归档"
                          : "确认"}
                  </button>
                </div>
                )}
              </form>
            </div>
          </section>}
        </ModalBackdrop>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
