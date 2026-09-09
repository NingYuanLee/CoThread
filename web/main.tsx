import { taskTimeline } from "./chat-timeline";
import { apiFetch, fetchJson } from "./api-fetch";
import {
  AGENT_MEMBER,
  SUMMARY_REQUEST,
  mentionsAgent,
} from "../shared/agent-member.js";
import React, { lazy, Suspense, useEffect, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { createMcpInstallGuide } from "../shared/mcp-guide.js";
import { configureMakers, invokeMakers, wakeMakers, useMakersConnection } from "./makers";
const Documents = lazy(() =>
  import("./Documents").then((module) => ({ default: module.Documents })),
);
import { MessageNavigator } from "./MessageNavigator";
const loadComposer = () => import("./ChatComposer");
const ChatComposer = lazy(() => loadComposer().then((module) => ({ default: module.ChatComposer })));
import { ContextMeter } from "./ContextMeter";
import { Notifications } from "./Notifications";
import { ProjectSettings } from "./ProjectSettings";
import type { ContextUsage } from "../shared/context.js";
import { agentLabel } from "./agent-label";
import { AgentEvent } from "./AgentEvent";
import { createResourceCache } from "../shared/resource-cache.js";
import { IdentityName, RoleBadge } from "./Identity";
import {
  ProfileFields,
  prepareAvatar,
  type PersonalProfile,
} from "./ProfileFields";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
function SidebarIcon({ kind }: { kind: "plus" | "document" }) {
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
      {kind === "plus" ? (
        <path d="M12 5v14M5 12h14" />
      ) : (
        <>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6M8 13h8M8 17h5" />
        </>
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
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-header">
        <h2 id="project-picker-title">添加项目</h2>
        <button disabled={busy} onClick={onClose} aria-label="关闭项目列表">
          ×
        </button>
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
    name: string;
    email: string;
    role: string;
    avatar?: string | null;
    motto?: string;
    identity_tags?: string[];
  }[];
  folders: { id: string; parent_id: string | null; name: string }[];
  versions: Version[];
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
    refs: string[];
    author: string;
    author_id: string;
    author_avatar?: string | null;
    author_role?: string | null;
    agent_task_id?: string | null;
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
    error: string | null;
    progress: string | null;
  }[];
  updates: { message_id: string; task_message_id: string; delivered_at: string | null }[];
  requests: { message_id: string; status: string; response_id: string | null; error: string | null }[];
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
  | "document"
  | "settings"
  | "account"
  | "member"
  | "archive"
  | "tokens"
  | "password"
  | "run"
  | null;
async function api(path: string, data?: unknown, method?: string, signal?: AbortSignal) {
  const result = await fetchJson(`/api${path}`, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json" },
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
    const messages = [...new Map([...previous.messages, ...incoming.messages].map((m) => [m.id, m])).values()]
      .sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1);
    return { ...(older ? previous : incoming), messages,
      events: [...new Map([...previous.events, ...incoming.events].map((e) => [e.id, e])).values()],
      page: older ? incoming.page : previous.page };
  };
  const messageAvatar = (m: Thread["messages"][number]) => {
    const member = detail?.members.find((member) => member.id === m.author_id);
    return member ? member.avatar : m.author_avatar;
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
  const makersConnection = useMakersConnection(threadId);
  const pendingNotification = useRef<{ projectId: string; threadId: string | null } | null>(null);
  const [loadedThread, setThread] = useState<Thread | null>(null);
  const thread = loadedThread?.id === threadId ? loadedThread : threadCache.current.get(threadId) || null;
  const hasPendingWork = (value: Thread | null | undefined) => !!value && (
    value.replies.some((r) => ["queued", "running"].includes(r.status)) ||
    !!value.requests?.some((r) => ["queued", "running"].includes(r.status)) ||
    ["queued", "running"].includes(value.contextUsage?.compactStatus));
  const pendingWork = hasPendingWork(thread);
  const wakeThreadPoll = useRef<(() => void) | null>(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const showDocument = (id?: string) => {
    setDocumentId(id || detail?.versions.find((v) => !v.deleted_at)?.id || "");
    setLibraryOpen(true);
  };
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
  const [memberScope, setMemberScope] = useState<"project" | "all">("project");
  const [accounts, setAccounts] = useState<
    { id: string; name: string; email: string }[]
  >([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [tab, setTab] = useState<"documents" | "members" | "project-settings">("documents");
  const [showArchived, setShowArchived] = useState(false);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [copiedThreadId, setCopiedThreadId] = useState("");
  const [installGuideCopied, setInstallGuideCopied] = useState(false);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const conversationCopyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const installCopyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => {
    clearTimeout(conversationCopyTimer.current);
    clearTimeout(installCopyTimer.current);
  }, []);
  const [tokens, setTokens] = useState<
    { id: string; label: string; project_id: string | null; expires_at: string; token: string | null }[]
  >([]);
  const [health, setHealth] = useState<{
    acsConfigured: boolean;
    dshEnabled: boolean;
    agentEndpoint?: string;
    mcpEndpoint?: string;
  } | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState("");
  const [history, setHistory] = useState(false);
  const writable = projects.find((p) => p.id === projectId)?.role !== "viewer";
  const owner = projects.find((p) => p.id === projectId)?.role === "owner";
  const creator = projects.find((p) => p.id === projectId)?.created_by === user?.id;
  const projectMember = projects.some((p) => p.id === projectId);
  const canCreateAccount = projects.some((p) => p.role === "owner");
  useEffect(() => {
    if (tab !== "members" || memberScope !== "all") return;
    let alive = true;
    api("/users")
      .then((rows) => {
        if (alive) setAccounts(rows);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [tab, memberScope]);
  const active = thread?.status === "active" && writable;
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
    void loadComposer().catch(() => {});
    let selection: { projectId?: string; threadId?: string } = {};
    try { const saved = JSON.parse(sessionStorage.getItem("cothread-selection") || "{}"); if (saved && typeof saved === "object") selection = saved; } catch {}
    try {
      const params = new URLSearchParams();
      if (typeof selection.projectId === "string") params.set("projectId", selection.projectId);
      if (typeof selection.threadId === "string") params.set("threadId", selection.threadId);
      const workspace = await api(`/workspace?${params}`, undefined, undefined, signal);
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
    const container = conversationRef.current;
    if (container && followConversation.current)
      container.scrollTop = container.scrollHeight;
  }, [
    threadId,
    thread?.messages.length,
    thread?.events.length,
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
    setToken("");
    setShowToken(false);
    setInstallGuideCopied(false);
    setInstallGuideOpen(false);
    setModal(value);
    if (value === "tokens")
      void api("/tokens")
        .then((rows) => { setTokens(rows); setToken(rows[0]?.token || ""); })
        .catch((e) => setError(e.message));
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
      setModal("tokens");
    }
  };
  const installGuide = (currentToken: string) => createMcpInstallGuide({
    url: `${location.origin}${health?.mcpEndpoint || "/mcp"}`,
    token: currentToken,
    conversationId: health?.mcpEndpoint ? user?.id : undefined,
  });
  const copyInstallGuide = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("/tokens/ensure", {});
      setToken(result.token);
      setTokens(await api("/tokens"));
      await navigator.clipboard.writeText(installGuide(result.token));
      setInstallGuideCopied(true);
      clearTimeout(installCopyTimer.current);
      installCopyTimer.current = setTimeout(() => setInstallGuideCopied(false), 3000);
    } catch (error) {
      setError(error instanceof Error ? `${error.message}。如令牌已就绪，可点击小眼睛后展开文档手动复制。` : "复制失败，请重试。");
    } finally {
      setBusy(false);
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
        if (tab === "members" && memberScope === "all")
          setAccounts(await api("/users"));
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
      if (modal === "account") {
        await api("/users", {
          name: value("name"),
          email: value("email"),
          password: value("password"),
        });
        setAccounts(await api("/users"));
      }
      if (modal === "member") {
        await api(`/projects/${projectId}/members`, {
          name: value("name"),
          email: value("email"),
          password: value("password") || undefined,
          role: "member",
        });
        await refresh();
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
      if (modal === "tokens") {
        const result = await api("/tokens", {});
        setToken(result.token);
        setShowToken(false);
        setInstallGuideCopied(false);
        setTokens(await api("/tokens"));
        return;
      }
      if (modal === "document") {
        const file = form.get("file") as File;
        if (!file?.size) throw new Error("请选择一个非空文件");
        if (file.size > 5 * 1024 * 1024) throw new Error("文件不能超过 5 MiB");
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await api(`/threads/${threadId}/versions`, {
          title: value("title"),
          artifactId: value("artifactId") || undefined,
          filename: file.name,
          mime: file.type || "application/octet-stream",
          contentBase64: base64,
          note: value("note"),
        });
        await refresh();
      }
      setModal(null);
    });
  };
  const time = (text: string) =>
    new Date(
      text.replace(" ", "T") + (text.endsWith("Z") ? "" : "Z"),
    ).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const hasAgentActivity = (reply: Thread["replies"][number]) =>
    reply.status === "failed" ||
    (reply.status === "queued" && makersConnection === "unavailable") ||
    !!thread?.events.some((event) => event.message_id === reply.message_id &&
      (event.tool !== "thinking" || (reply.status === "running" && event.status === "running")));
  const timeline = thread ? taskTimeline(thread.messages, thread.replies, thread.requests || [], hasAgentActivity) : [];
  const renderAgentRound = (reply: Thread["replies"][number]) => {
    if (!hasAgentActivity(reply)) return null;
    const events =
      thread?.events.filter((event) => event.message_id === reply.message_id && event.tool !== "thinking") ||
      [];
    const runningStep = reply.status === "running"
      ? [...events].reverse().find((event) => event.status === "running") : undefined;
    const thinking = reply.status === "running" && !!thread?.events.some((event) =>
      event.message_id === reply.message_id && event.tool === "thinking" && event.status === "running");
    const lastStep = events[events.length - 1];
    const stepLabel = (event: (typeof events)[number]) => {
      const label = agentLabel(event, detail?.versions, detail?.threads);
      return `${label.action}${label.target ? ` ${label.target}` : ""}`;
    };
    const currentLabel = runningStep ? stepLabel(runningStep)
      : thinking ? "正在思考下一步…"
        : reply.status === "running" && lastStep
          ? `${stepLabel(lastStep)} · ${lastStep.status === "failed" ? "失败" : "完成"}`
          : `${{ queued: "操作记录", running: "执行中", completed: "已完成", failed: "未完成", cancelled: "已停止" }[reply.status]} · ${events.length} 项操作`;
    const stopControl = active && (reply.status === "queued" || reply.status === "running") && (
      <button className="agent-stop" disabled={busy} onClick={() => void run(async () => {
        await api(`/threads/${threadId}/replies/${reply.message_id}/stop`, {});
        await refresh();
      })}>停止</button>
    );
    return (
      <div className="agent-round" data-message-id={reply.message_id}>
        {[reply]
          ?.filter((r) => !events.length && (r.status === "queued" || r.status === "running"))
          .map((r) => (
            <div
              className="reply-status agent-status"
              role="status"
              key={r.message_id}
            >
              <span className={thinking ? "agent-step-active" : undefined}>
                {r.status === "queued"
                  ? makersConnection === "unavailable"
                    ? "助手暂时无法连接，消息已保存。"
                    : "消息已收到。"
                  : "正在思考…"}
              </span>
              {stopControl}
            </div>
          ))}
        {events.length > 0 && (
          <div className="agent-trace-row">
          <details className="agent-trace">
            <summary title={`${currentLabel}；点击展开或收起全部步骤`}>
              <span className={`agent-current-step${runningStep || thinking ? " agent-step-active" : ""}`} aria-live="polite" aria-atomic="true">
                {currentLabel}
              </span>
              <svg className="agent-trace-toggle" width="22" height="20" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3C2 6 2 14 6 17M16 3C20 6 20 14 16 17" />
                <path className="agent-trace-chevron" d="m8 9 3 3 3-3" />
              </svg>
            </summary>
            {events.map((e) => {
              const label = agentLabel(e, detail?.versions, detail?.threads);
              return (
                <AgentEvent key={e.id} threadId={threadId} event={e}>
                  <summary>
                    <span className={`event-dot ${e.status}`} />
                    <span className="agent-action-label" title={label.full}>
                      <span className="agent-action-verb">{label.action}</span>
                      {label.target && (
                        <span className="agent-action-object">
                          {label.target}
                        </span>
                      )}
                    </span>
                    <small>
                      {
                        {
                          running: "进行中",
                          completed: "完成",
                          failed: "失败",
                        }[e.status]
                      }
                    </small>
                  </summary>
                </AgentEvent>
              );
            })}
          </details>
          {stopControl}
          </div>
        )}
        {[reply]
          ?.filter((r) => r.status === "failed")
          .map((r) => (
            <div
              className="reply-status failed"
              key={r.message_id}
              role="status"
            >
              <span>{r.error}</span>
              {active && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(
                        `/threads/${threadId}/replies/${r.message_id}/retry`,
                        {},
                      );
                      await refresh();
                    })
                  }
                >
                  重试回复
                </button>
              )}
            </div>
          ))}
      </div>
    );
  };
  const renderRef = (ref: string) => {
    const v = detail?.versions.find((v) => v.id === ref);
    return (
      <button key={ref} type="button" className="ref" onClick={() => showDocument(ref)}>
        ↗ {v ? `${v.title} · v${v.version}` : ref}
      </button>
    );
  };
  if (loading || startupError)
    return (
      <div className="login">
        <div className="brand">
          共序 <small>CoThread</small>
        </div>
        <p role="status">{startupError || "正在加载工作空间…"}</p>
        {startupError && <button onClick={() => void loadWorkspace()}>重新加载</button>}
      </div>
    );
  if (!user)
    return (
      <div className="login">
        <div className="login-story">
          <div className="brand">
            ◈ 共序 <small>CoThread</small>
          </div>
          <span className="eyebrow">A SHARED THREAD OF WORK</span>
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
            <span>团队讨论</span>
            <span>版本沉淀</span>
            <span>协作交付</span>
          </div>
        </div>
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () =>
              setUser(
                await api("/login", {
                  email: f.get("email"),
                  password: f.get("password"),
                }),
              ),
            );
          }}
        >
          <span className="eyebrow">WORKSPACE</span>
          <h2>回到共同的上下文</h2>
          <p>登录你的共序工作空间</p>
          <label>
            邮箱
            <input
              name="email"
              type="email"
              defaultValue="admin@cothread.local"
              autoComplete="username"
              required
            />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "正在登录…" : "进入工作空间 →"}
          </button>
          <small>请使用已有账号登录；新账号请联系项目负责人。</small>
        </form>
      </div>
    );
  const versions =
    detail?.versions.filter(
      (v, i, all) =>
        !v.deleted_at &&
        (history ||
          all.findIndex((x) => x.artifact_id === v.artifact_id) === i),
    ) || [];
  const visibleThreads =
    detail?.threads.filter((t) => showArchived || t.status === "active") || [];
  return (
    <div
      className={`app-shell ${leftOpen ? "" : "left-closed"} ${contextOpen ? "" : "right-closed"}`}
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
        <Notifications key={user.id} api={api} onOpen={(target) => {
          setProjects(target.projects);
          setLibraryOpen(false);
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
          {leftOpen ? (
            <>
              <img
                className="sidebar-logo"
                src="/cothread-logo.svg"
                alt="共序 LOGO"
              />
              <span className="sidebar-brand-name">
                共序 <small>CoThread</small>
              </span>
            </>
          ) : null}
          <button
            className={`sidebar-toggle ${leftOpen ? "sidebar-collapse-toggle" : "sidebar-brand-toggle"}`}
            aria-label={leftOpen ? "收起左侧栏" : "展开左侧栏"}
            title={leftOpen ? "收起左侧栏" : "展开左侧栏"}
            aria-expanded={leftOpen}
            onClick={() => setLeftOpen(!leftOpen)}
          >
            {!leftOpen && (
              <img className="sidebar-logo" src="/cothread-logo.svg" alt="" />
            )}
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
            title="创建迭代"
            aria-label="创建迭代"
            disabled={!projectId || !writable}
            onClick={() => open("thread")}
          >
            <SidebarIcon kind="plus" />
          </button>
        </div>
        <nav>
          {visibleThreads.map((t) => (
            <button
              key={t.id}
              className={`thread-link ${threadId === t.id ? "selected" : ""}`}
              onClick={() => setThreadId(t.id)}
            >
              <span>{t.status === "archived" ? "▤" : "◌"}</span>
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
              {t.status === "archived" && <small>归档</small>}
            </button>
          ))}
          {!visibleThreads.length && (
            <p className="muted side-empty">
              还没有迭代讨论
              <br />
              从一次新的需求开始。
            </p>
          )}
        </nav>
        <button
          className="archive-toggle"
          onClick={() => setShowArchived(!showArchived)}
        >
          ▤ {showArchived ? "隐藏已归档" : "查看已归档"}
        </button>
        <div className="sidebar-bottom">
          <button
            className="sidebar-card sidebar-library"
            title="项目文档库"
            aria-label="项目文档库"
            disabled={!projectId}
            onClick={() => showDocument()}
          >
            <span className="sidebar-card-icon">
              <SidebarIcon kind="document" />
            </span>
            <span className="sidebar-card-copy">
              项目文档库<small>文件与历史版本</small>
            </span>
            <span className="sidebar-card-action" aria-hidden="true">
              ↗
            </span>
          </button>
          <button
            className="sidebar-card sidebar-profile"
            title={`${user.name} · 个人设置`}
            aria-label={`${user.name} · 个人设置`}
            onClick={() => open("profile")}
          >
            <span className="avatar">
              {user.avatar ? <img loading="lazy" decoding="async" src={user.avatar} alt="" /> : user.name[0]}
            </span>
            <span className="sidebar-card-copy">
              {user.name}
              <small>{user.motto || user.email}</small>
            </span>
            <span className="sidebar-card-action" aria-hidden="true">
              ⚙
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
          <div className="chat-drop-hint">松开以上传至对话临时文件</div>
        )}
        <header>
          <nav className="breadcrumb" aria-label="当前位置">
            <span className="breadcrumb-project" title={detail?.name}>
              {detail?.name || "工作空间"}
            </span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-thread" title={thread?.title}>
              {thread?.title || "未选择迭代"}
            </span>
          </nav>
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
            <div className="welcome-icon">◈</div>
            <span className="eyebrow">BUILD CONTEXT TOGETHER</span>
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
              {projectId ? "发起第一次迭代" : "添加项目"} ＋
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
            <div className="conversation-stage">
            <MessageNavigator key={threadId} messages={thread.messages} container={conversationRef} onNavigate={navigateMessage} />
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
                  <span className="eyebrow">ITERATION ARCHIVE</span>
                  <h3>这一轮，已有结论</h3>
                  <p>{thread.archive_snapshot.conclusion}</p>
                  <small>讨论、审核与引用的历史版本已固定保存。</small>
                </div>
              )}
              {thread.page?.hasMore && <button type="button" disabled={historyLoading} onClick={() => void loadHistory()}>{historyLoading ? "正在加载历史消息…" : "加载更早的消息"}</button>}
              <div className="timeline-start">
                <span>一次迭代，一段共同的上下文</span>
              </div>
              {!thread.messages.length && (
                <div className="conversation-empty">
                  <h3>说说这次想解决的问题</h3>
                  <p>分享背景、目标或一个还没有答案的问题。</p>
                </div>
              )}
              {timeline.map((m) => (
                <React.Fragment key={m.id}>
                  <article
                    data-message-id={m.id}
                    className={`message ${m.source === "system" ? "system" : ""} ${m.author_id === user.id && ["human", "local_ai"].includes(m.source) ? "own" : ""}`}
                    key={m.id}
                  >
                    <span
                      className={`avatar ${m.source === "assistant" ? "ai" : ""}`}
                    >
                      {m.source === "assistant" ? (
                        <img loading="lazy" decoding="async" src={AGENT_MEMBER.avatar} alt="" />
                      ) : messageAvatar(m) ? (
                        <img loading="lazy" decoding="async" src={messageAvatar(m) || undefined} alt="" />
                      ) : (
                        m.author[0]
                      )}
                    </span>
                    <div className="message-content">
                      <div className="message-meta">
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
                        {m.source === "assistant" && (
                          <span className="agent-badge">
                            {thread.replies.find((reply) => reply.message_id === m.agent_task_id || reply.reply_id === m.id)?.agent_slot
                              ? `子 Agent ${thread.replies.find((reply) => reply.message_id === m.agent_task_id || reply.reply_id === m.id)?.agent_slot}`
                              : "主助手"}
                          </span>
                        )}
                        {m.source === "local_ai" && (
                          <span className="source-label">通过本地 AI 提交</span>
                        )}
                        {m.source === "system" && (
                          <span className="source-label">协作记录</span>
                        )}
                        <time>{time(m.created_at)}</time>
                      </div>
                      {m.source === "assistant" &&
                        thread.replies
                          .filter((reply) => m.agent_task_id === reply.message_id || reply.reply_id === m.id)
                          .map((reply) => (
                            <React.Fragment key={reply.message_id}>
                              {renderAgentRound(reply)}
                            </React.Fragment>
                          ))}
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
                    </div>
                  </article>
                </React.Fragment>
              ))}
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
            <div className="composer-area">
              {
                <div
                  className="composer-actions"
                  role="group"
                  aria-label="迭代操作"
                >
                  {threadId && (
                    <button
                      type="button"
                      onClick={() => void copyConversationInfo()}
                    >
                      {copiedThreadId === threadId
                        ? "已复制会话信息"
                        : "复制会话信息"}
                    </button>
                  )}
                  {thread.contextUsage && (
                    <ContextMeter
                      key={threadId}
                      usage={thread.contextUsage}
                      writable={active}
                      onCompact={async () => {
                        await api(`/threads/${threadId}/context/compact`, {});
                        await refresh();
                      }}
                    />
                  )}
                  {active && (
                    <button
                      disabled={!active || busy}
                      title="基于助手已有上下文梳理讨论"
                      onClick={() => { setMessage(SUMMARY_REQUEST); requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="发送消息"]')?.focus()); }}
                    >
                      ✧ 梳理讨论
                    </button>
                  )}
                  {active && (
                    <button onClick={() => open("archive")}>归档迭代 ↗</button>
                  )}
                </div>
              }
              {active ? (
                <Suspense fallback={<div className="composer-loading" role="status">正在加载输入框…</div>}>
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
                  onRefresh={refresh}
                  onSend={async () => {
                    let sent = false;
                    await run(async () => {
                      await api(`/threads/${threadId}/messages`, {
                        body: message,
                        refs,
                      });
                      sent = true;
                      setMessage("");
                      setRefs([]);
                      followConversation.current = true;
                      await refresh();
                    });
                    return sent;
                  }}
                />
                </Suspense>
              ) : (
                <div className="readonly">
                  {thread.status === "archived"
                    ? "此迭代已归档。历史讨论与文档可以继续查阅，也可以引用到新的迭代。"
                    : "你正在以只读成员身份查看此迭代。"}
                </div>
              )}
              <small className="composer-note">
                共同事实由团队确认 · AI 提交有身份，文档修改留版本
              </small>
            </div>
          </>
        )}
      </main>
      <aside className={`context-panel ${contextOpen ? "context-open" : ""}`}>
        <button
          className="panel-close"
          aria-label="关闭项目侧栏"
          onClick={() => setContextOpen(false)}
        >
          ×
        </button>
        <div className="panel-tabs">
          <button
            className={tab === "documents" ? "active" : ""}
            onClick={() => setTab("documents")}
          >
            项目文档{" "}
            <small>
              {
                new Set(
                  detail?.versions
                    .filter((v) => !v.deleted_at)
                    .map((v) => v.artifact_id),
                ).size
              }
            </small>
          </button>
          <button
            className={tab === "members" ? "active" : ""}
            onClick={() => setTab("members")}
          >
            成员
          </button>
          <button
            className={tab === "project-settings" ? "active" : ""}
            onClick={() => setTab("project-settings")}
          >
            项目设置
          </button>
        </div>
        {tab === "documents" ? (
          projectId && (
            <Suspense fallback={<p className="muted">正在加载文件树…</p>}>
              <Documents
                embedded
                key={projectId}
                projectId={projectId}
                threadId={active ? threadId : undefined}
                writable={writable}
                folders={detail?.folders || []}
                versions={detail?.versions || []}
                selected={documentId}
                onSelect={setDocumentId}
                onOpen={showDocument}
                onClose={() => {}}
                onRefresh={async () =>
                  setDetail(await api(`/projects/${projectId}?view=chat`))
                }
                onReference={
                  active
                    ? (id) =>
                        setRefs((previous) =>
                          [...new Set([...previous, id])].slice(0, 30),
                        )
                    : undefined
                }
              />
            </Suspense>
          )
        ) : tab === "project-settings" ? (
          detail?.id === projectId ? (
            <ProjectSettings
              key={projectId}
              name={detail.name}
              createdAt={localDate(detail.created_at)}
              creator={creator}
              onSave={async (name) => {
                const updated = await api(`/projects/${projectId}`, { name }, "PATCH");
                setProjects((rows) => rows.map((p) => p.id === updated.id ? { ...p, name: updated.name } : p));
                setDetail((previous) => previous && previous.id === updated.id ? { ...previous, name: updated.name } : previous);
              }}
            />
          ) : <p className="muted">{projectId ? "正在加载项目设置…" : "请先选择项目"}</p>
        ) : (
          <>
            <div className="member-scope">
              <button
                className={memberScope === "project" ? "active" : ""}
                onClick={() => setMemberScope("project")}
              >
                项目成员 <small>{detail?.members.length || 0}</small>
              </button>
              <button
                className={memberScope === "all" ? "active" : ""}
                onClick={() => setMemberScope("all")}
              >
                全部成员
              </button>
            </div>
            <input
              className="member-search"
              aria-label="搜索成员"
              placeholder="搜索姓名或邮箱"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
            <div className="panel-heading">
              <span>
                {memberScope === "all" ? "账号全局通用" : "参与此项目的成员"}
              </span>
              {memberScope === "project" && projectMember && (
                <button onClick={() => setMemberScope("all")}>＋ 添加</button>
              )}
              {memberScope === "all" && canCreateAccount && (
                <button onClick={() => open("account")}>＋ 新建账号</button>
              )}
            </div>
            {(memberScope === "all"
              ? [...accounts, AGENT_MEMBER]
              : detail?.members || []
            )
              .filter((m) =>
                `${m.name} ${m.email}`
                  .toLowerCase()
                  .includes(memberSearch.toLowerCase()),
              )
              .map((m) => {
                const membership = detail?.members.find((p) => p.id === m.id);
                return (
                  <div className="member" key={m.id}>
                    <span className="avatar">
                      {"avatar" in m &&
                      typeof m.avatar === "string" &&
                      m.avatar ? (
                        <img loading="lazy" decoding="async" src={m.avatar} alt="" />
                      ) : (
                        m.name[0]
                      )}
                    </span>
                    <div>
                      <strong>{m.name}</strong>
                      <small>{m.email}</small>
                      {"motto" in m &&
                        typeof m.motto === "string" &&
                        m.motto && <small>{m.motto}</small>}
                      {"identity_tags" in m &&
                        Array.isArray(m.identity_tags) && (
                          <div className="member-identity-tags">
                            {m.identity_tags.map((tag: string) => (
                              <RoleBadge key={tag} role={tag} />
                            ))}
                          </div>
                        )}
                    </div>
                    {membership && creator && m.id !== detail?.created_by && m.id !== AGENT_MEMBER.id && (
                      <button disabled={busy} onClick={() => {
                        if (window.confirm(`确定将 ${m.name} 移出该项目？`)) void run(async () => {
                          await api(`/projects/${projectId}/members/${m.id}`, undefined, "DELETE");
                          await refresh();
                        });
                      }}>移出项目</button>
                    )}
                    {membership ? (
                      <span className="role">
                        {
                          {
                            owner: "创建人",
                            member: "成员",
                            viewer: "只读",
                            agent: "助理",
                          }[membership.role]
                        }
                      </span>
                    ) : projectMember && m.id !== AGENT_MEMBER.id ? (
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(`/projects/${projectId}/members`, {
                              userId: m.id,
                              role: "member",
                            });
                            await refresh();
                          })
                        }
                      >
                        加入项目
                      </button>
                    ) : (
                      <span className="role">未加入</span>
                    )}
                  </div>
                );
              })}
          </>
        )}
        <div className="panel-tip">
          <span>↗</span>
          <p>
            下一次迭代，也能引用今天的版本。
            <br />
            <strong>资料属于项目，不随沙箱消失。</strong>
          </p>
        </div>
      </aside>
      {libraryOpen && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <div className="library-loading" role="status">
                正在打开文档库…
              </div>
            </div>
          }
        >
          <Documents
            key={projectId}
            projectId={projectId}
            threadId={active ? threadId : undefined}
            writable={writable}
            folders={detail?.folders || []}
            onRefresh={async () => {
              setDetail(await api(`/projects/${projectId}?view=chat`));
            }}
            versions={detail?.versions || []}
            selected={documentId}
            onSelect={setDocumentId}
            onClose={() => setLibraryOpen(false)}
            onReference={
              active
                ? (id) => {
                    setRefs([...new Set([...refs, id])].slice(0, 30));
                    setLibraryOpen(false);
                  }
                : undefined
            }
            onNewVersion={
              active
                ? (artifactId) => {
                    setLibraryOpen(false);
                    setSelectedArtifact(artifactId);
                    open("document");
                  }
                : undefined
            }
            onReview={
              active
                ? async (id, decision) => {
                    await api(`/versions/${id}/reviews`, { decision });
                    await refresh();
                  }
                : undefined
            }
            onUpload={
              active
                ? () => {
                    setLibraryOpen(false);
                    setSelectedArtifact("");
                    open("document");
                  }
                : undefined
            }
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
      {modal && (
        <div className="modal-backdrop">
          <section
            className={`modal ${["profile", "settings", "tokens", "password"].includes(modal) ? "workspace-settings" : ""}`}
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
                    document: "提交文档版本",
                    member: "添加项目成员",
                    account: "新建通用账号",
                    profile: "个人设置",
                    settings: "个人设置",
                    archive: "归档本次迭代",
                    tokens: "个人设置",
                    password: "个人设置",
                    run: "在沙箱中执行",
                  }[modal]
                }
              </h2>
              <button
                disabled={busy}
                onClick={() => setModal(null)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <div
              className={
                ["profile", "settings", "tokens", "password"].includes(modal)
                  ? "settings-layout"
                  : undefined
              }
            >
              {["profile", "settings", "tokens", "password"].includes(
                modal,
              ) && (
                <nav className="settings-nav" aria-label="设置项目">
                  {(
                    [
                      ["profile", "个人资料"],
                      ["password", "账号设置"],
                      ["tokens", "连接本地Agent"],
                      ["settings", "退出登录"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-current={modal === value ? "page" : undefined}
                      disabled={busy}
                      onClick={() => open(value)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
              )}
              <form key={modal} onSubmit={submitModal}>
                {["profile", "settings", "tokens", "password"].includes(
                  modal,
                ) && (
                  <div className="settings-content-heading">
                    <h3>
                      {modal === "profile"
                        ? "个人资料"
                        : modal === "tokens"
                          ? "连接本地Agent"
                          : modal === "password"
                            ? "账号设置"
                            : "退出登录"}
                    </h3>
                    <p>
                      {modal === "tokens"
                        ? "复制安装文档，交给本地 Agent 完成连接。"
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
                      <small>{user.email}</small>
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
                      <span>↪</span>
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
                {modal === "document" && (
                  <>
                    <label>
                      所属文档
                      <select
                        name="artifactId"
                        value={selectedArtifact}
                        onChange={(e) => setSelectedArtifact(e.target.value)}
                      >
                        <option value="">创建新文档</option>
                        {detail?.versions
                          .filter((v) => !v.deleted_at)
                          .filter(
                            (v, i, a) =>
                              a.findIndex(
                                (x) => x.artifact_id === v.artifact_id,
                              ) === i,
                          )
                          .map((v) => (
                            <option key={v.artifact_id} value={v.artifact_id}>
                              {v.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      文档标题
                      <input
                        key={selectedArtifact}
                        name="title"
                        maxLength={160}
                        defaultValue={
                          detail?.versions.find(
                            (v) => v.artifact_id === selectedArtifact,
                          )?.title || ""
                        }
                        required
                      />
                    </label>
                    <label>
                      选择文件（不超过 5 MiB）
                      <input name="file" type="file" required />
                    </label>
                    <label>
                      本次提交说明
                      <textarea name="note" maxLength={4000} />
                    </label>
                    <p className="muted">
                      提交后会生成不可覆盖的新版本，等待人工审核。
                    </p>
                  </>
                )}
                {(modal === "member" || modal === "account") && (
                  <>
                    <label>
                      姓名
                      <input name="name" maxLength={80} required />
                    </label>
                    <label>
                      邮箱
                      <input name="email" type="email" required />
                    </label>
                    <label>
                      {modal === "account"
                        ? "初始密码"
                        : "初始密码（已有账号可留空）"}
                      <input
                        name="password"
                        type="password"
                        required={modal === "account"}
                        minLength={12}
                        maxLength={200}
                        autoComplete="new-password"
                      />
                    </label>
                    <p className="muted">
                      {modal === "account" &&
                        "账号可用于所有项目；创建后需从全部成员中加入指定项目。"}
                      将初始登录信息交给成员；成员可在账号设置中修改密码。
                    </p>
                  </>
                )}
                {modal === "archive" && (
                  <>
                    <p>
                      保存这一轮的结论、完整讨论、审核记录和引用版本。归档后不可继续修改。
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
                      <small>{user.email}</small>
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
                    <label>
                      新密码
                      <input
                        name="password"
                        type="password"
                        required
                        minLength={12}
                        maxLength={200}
                        autoComplete="new-password"
                      />
                    </label>
                    <p className="muted">
                      修改后，其他登录会话和 AI 令牌会失效。
                    </p>
                  </>
                )}
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
                {modal === "tokens" && (
                  <>
                      <div className="token-result">
                        <strong>账号令牌</strong>
                        <div className="token-field">
                        <button className="token-eye" type="button" disabled={!token} aria-label={showToken ? "隐藏令牌" : "显示令牌"} aria-pressed={showToken} title={showToken ? "隐藏令牌" : "显示令牌"} onClick={() => setShowToken(!showToken)}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                            <circle cx="12" cy="12" r="3" />
                            {showToken && <path d="m3 3 18 18" />}
                          </svg>
                        </button>
                        <input
                          aria-label="账号令牌"
                          type={showToken ? "text" : "password"}
                          autoComplete="off"
                          readOnly
                          value={token}
                          placeholder={tokens.length ? "旧版令牌，复制文档时自动更新" : "复制安装文档时自动创建"}
                        />
                        <button className="token-action" disabled={busy}>
                          {busy ? "处理中…" : tokens.length ? "重置" : "创建"}
                        </button>
                        </div>
                        <p className="token-caption">
                          {tokens.length ? `有效期至 ${tokens[0].expires_at.slice(0, 10)} · 重置后旧令牌失效` : "复制文档时自动创建，有效期 30 天"}
                        </p>
                      </div>
                    <div className="agent-connection-guide">
                      <p>已自动填入令牌，无需手动配置。仅分享给可信的 Agent。</p>
                      <div className="agent-connection-actions">
                        <button className="primary" type="button" disabled={busy} onClick={() => void copyInstallGuide()}>
                          {installGuideCopied ? "已复制安装文档" : "复制安装文档"}
                        </button>
                        <button type="button" aria-expanded={installGuideOpen} aria-controls="mcp-install-guide" onClick={() => setInstallGuideOpen(!installGuideOpen)}>
                          {installGuideOpen ? "收起安装文档" : "查看安装文档"}
                        </button>
                      </div>
                      <div id="mcp-install-guide" hidden={!installGuideOpen}>
                        {token ? <textarea aria-label="MCP 安装文档" readOnly value={installGuide(showToken ? token : "••••••••（复制按钮会自动填入真实令牌）")} /> : <p>点击“复制安装文档”后生成完整配置。</p>}
                      </div>
                    </div>
                  </>
                )}
                {error && (
                  <div className="error" role="alert">
                    {error}
                  </div>
                )}
                <div className="modal-footer">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    关闭
                  </button>
                  {modal !== "settings" && modal !== "tokens" && (
                    <button className="primary" disabled={busy}>
                      {busy
                        ? "正在处理…"
                        : modal === "profile"
                          ? "保存资料"
                          : modal === "archive"
                            ? "确认归档"
                            : "确认"}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
