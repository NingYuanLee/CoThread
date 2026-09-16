import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AgentActivity } from "./AgentActivity";
import { AgentLogDialog } from "./AgentLogDialog";
import type { AgentLogScope } from "./agent-trajectory";
import { l1TaskLabel } from "../shared/agent-label.js";
import type { ContextUsage } from "../shared/context.js";
import { contextUsage } from "../shared/context.js";
import { ContextMeter } from "./ContextMeter";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { useAgentLiveOutput } from "./useAgentLiveOutput";
import {
  formatActorRef,
  formatDurationMs,
  labelAgentEventStatus,
  labelExecutorType,
  labelWorkflowStatus,
} from "./ui-labels";

type L1Run = {
  id: string;
  task: string;
  thread_id?: string | null;
  trigger_source: "schedule" | "user";
  status: string;
  agent_called: boolean;
  had_updates: boolean;
  item_count: number | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type L1Session = {
  id: string;
  task: string;
  threadId: string | null;
  threadTitle: string | null;
  sessionId: string | null;
  sessionStatus: "idle" | "running" | "failed";
  lastError: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  contextUsage: ContextUsage;
};

type HistoryColumn = { key: string; label: string };
type HistoryRow = {
  id: string;
  tone?: "idle" | "running" | "waiting" | "failed";
  cells: Record<string, string>;
  actions?: React.ReactNode;
};

type MonitorData = {
  generatedAt: string;
  models: Record<"knowledge" | "coordinator" | "executor", {
    model: string;
    reasoningEffort: string;
  }>;
  knowledge: {
    sessionId: string | null;
    sessionStatus: "idle" | "running" | "failed";
    lastTask: string | null;
    lastError: string | null;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    memberPending: number;
    documentPending: number;
    ready: number;
    nextAt: string | null;
    lastUpdatedAt: string | null;
    memberLastAt: string | null;
    memberNextAt: string | null;
    documentLastAt: string | null;
    documentNextAt: string | null;
    projectDocumentPending: number;
    projectDocumentLastAt: string | null;
    projectDocumentNextAt: string | null;
    iterationDocumentPending: number;
    iterationDocumentLastAt: string | null;
    iterationDocumentNextAt: string | null;
    memberRuns: L1Run[];
    projectDocumentRuns: L1Run[];
    iterationDocumentRuns: L1Run[];
    documentRuns: L1Run[];
    sessions: L1Session[];
    organizationLastAt: string | null;
    organizationJobs: {
      id: string;
      thread_id: string | null;
      thread_title: string | null;
      scope: "iteration" | "project";
      status: string;
      error: string | null;
      document_count: number | null;
      created_at: string;
      started_at: string | null;
      finished_at: string | null;
    }[];
    archiveLastAt: string | null;
    archives: {
      id: string;
      title: string;
      archived_at: string;
      conclusion: string;
      contextUsage?: ContextUsage;
      sessionStatus?: string;
      runs?: L1Run[];
    }[];
  };
  coordinators: {
    id: string;
    title: string;
    status: string;
    queued_requests: number;
    running_requests: number;
    active_executors: number;
    convergence_state: string;
    steering_epoch: number;
    wait_reason: string | null;
    current_action: string | null;
    react_phase: string | null;
    recent_message: string | null;
    last_activity_at: string;
    contextUsage?: ContextUsage;
  }[];
  executors: {
    task_id: string;
    thread_id: string;
    thread_title: string;
    requested_by: string;
    goal: string;
    status: string;
    progress: string | null;
    agent_slot: number | null;
    execution_active: number;
    started_at: string;
    finished_at: string | null;
    last_action: string | null;
    last_action_status: string | null;
    last_action_at: string | null;
    update_count: number;
    contextUsage?: ContextUsage;
    executor_type?: "dsh_l3" | "human_self" | "human_connector";
    executor_id?: string | null;
    target_type?: string | null;
    target_id?: string | null;
    task_type?: "assist_l2" | "formal";
    source_type?: string;
    created_by_type?: string;
    created_by_id?: string;
    claimed_by_type?: string | null;
    claimed_by_id?: string | null;
    result_summary?: string | null;
    artifact_refs?: unknown[] | string | null;
  }[];
  taskPool: {
    task_id: string;
    origin_thread_id?: string | null;
    title: string;
    goal: string;
    task_type: "assist_l2" | "formal";
    task_status: string;
    run_status: string | null;
    source_type: string;
    source_user_id: string | null;
    target_type: string | null;
    target_id: string | null;
    claimed_by_type: string | null;
    claimed_by_id: string | null;
    created_by_type: string;
    created_by_id: string;
    executor_type: "dsh_l3" | "human_self" | "human_connector" | null;
    executor_id: string | null;
    progress: string | null;
    result_summary: string | null;
    artifact_refs: unknown[] | string | null;
    started_at?: string | null;
    finished_at?: string | null;
  }[];
  eventLog: {
    id: string;
    message_id: string;
    thread_id: string;
    thread_title: string;
    agent_session_id: string | null;
    agent_type: "l2" | "dsh_l3";
    tool: string;
    action: string;
    status: "running" | "completed" | "failed";
    created_at: string;
    finished_at: string | null;
    duration_ms: number | null;
  }[];
};

const EXECUTORS = [
  { name: "大娃", avatar: "dawa.png", color: "#b83f3a", tint: "#f8e8e6" },
  { name: "二娃", avatar: "erwa.png", color: "#d97828", tint: "#fbefe2" },
  { name: "三娃", avatar: "sanwa.png", color: "#b88a18", tint: "#faf4dc" },
  { name: "四娃", avatar: "siwa.png", color: "#39804a", tint: "#e7f3e9" },
  { name: "五娃", avatar: "wuwa.png", color: "#278b94", tint: "#e3f3f4" },
  { name: "六娃", avatar: "liuwa.png", color: "#4168ad", tint: "#e8edf7" },
  { name: "七娃", avatar: "qiwa.png", color: "#7652a0", tint: "#eee8f5" },
];

function date(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
}

function time(value: string | null | undefined) {
  const parsed = date(value);
  return parsed?.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) || "暂无";
}

function nextTime(value: string | null | undefined, pending: number) {
  if (!pending) return "无待处理";
  const parsed = date(value);
  if (!parsed || parsed.getTime() <= Date.now()) return "现在可处理";
  return time(value);
}

function pendingLine(kind: "member" | "document", pending: number) {
  if (!pending) return kind === "member" ? "新发言：暂无" : "新文档：暂无";
  return kind === "member" ? `新发言：有（${pending} 人待整理）` : `新文档：有（${pending} 份待整理）`;
}

function runTone(status: string): "idle" | "running" | "waiting" | "failed" {
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  if (status === "queued") return "waiting";
  return "idle";
}

function runStatusLabel(status: string) {
  if (status === "failed") return "失败";
  if (status === "running") return "进行中";
  if (status === "queued") return "排队中";
  return "已完成";
}

const L1_RUN_COLUMNS: HistoryColumn[] = [
  { key: "time", label: "时间" },
  { key: "trigger", label: "触发" },
  { key: "updates", label: "新内容" },
  { key: "agent", label: "调用Agent" },
  { key: "status", label: "状态" },
  { key: "note", label: "说明" },
];

function l1RunRows(runs: L1Run[] | undefined, unit: string): HistoryRow[] {
  return (runs || []).map((run) => {
    const pending = run.status === "queued" || run.status === "running";
    return {
      id: run.id,
      tone: runTone(run.status),
      cells: {
        time: time(run.finished_at || run.started_at || run.created_at),
        trigger: run.trigger_source === "user" ? "手动" : "定时",
        updates: pending ? "—" : run.had_updates ? (run.item_count ? `有（${run.item_count}${unit}）` : "有") : "暂无",
        agent: pending ? "—" : run.agent_called ? "是" : "否",
        status: runStatusLabel(run.status),
        note: run.error || (run.status === "queued" ? "已排队" : run.status === "running" ? "整理中" : ""),
      },
    };
  });
}

function artifactCount(value: unknown[] | string | null | undefined) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.length : 0; }
    catch { return 0; }
  }
  return 0;
}

function State({ tone, children }: { tone: "idle" | "running" | "waiting" | "failed"; children: React.ReactNode }) {
  return <span className={`monitor-state ${tone}`}><i aria-hidden="true" />{children}</span>;
}

const ENDED = new Set(["completed", "failed", "cancelled", "superseded"]);

const taskState = (task: MonitorData["executors"][number]) => {
  if (task.execution_active || task.status === "running") return { label: "执行中", tone: "running" as const };
  if (task.status === "queued") return { label: "等待开始", tone: "waiting" as const };
  if (task.status === "completed") return { label: "空闲", tone: "idle" as const };
  if (task.status === "cancelled") return { label: "空闲", tone: "idle" as const };
  return { label: "执行失败", tone: "failed" as const };
};

function poolTone(task: MonitorData["taskPool"][number]) {
  const status = task.run_status || task.task_status;
  if (status === "failed") return "failed" as const;
  if (["running", "queued"].includes(status)) return "running" as const;
  if (status === "waiting") return "waiting" as const;
  return "idle" as const;
}

type L3Detail = {
  id: string;
  title: string;
  typeLabel: string;
  statusLabel: string;
  tone: "idle" | "running" | "waiting" | "failed";
  goal: string;
  progress: string | null;
  result: string | null;
  artifacts: number;
  source: string;
  target: string;
  executor: string;
  time: string;
};

function L3TaskCard({ title, meta, tone, status, style, onDetail, onTrace, onSession }: {
  title: string;
  meta: string;
  tone: "idle" | "running" | "waiting" | "failed";
  status: string;
  style?: React.CSSProperties;
  onDetail: () => void;
  onTrace: () => void;
  onSession?: () => void;
}) {
  return <article className="executor-row l3-task-card" style={style}>
    <div className="executor-title">
      <span className="executor-name"><strong title={title}>{title}</strong><small>{meta}</small></span>
      <State tone={tone}>{status}</State>
    </div>
    <div className="l3-task-actions">
      <button type="button" onClick={onDetail}>详情</button>
      <button type="button" onClick={onTrace}>轨迹</button>
      {onSession ? <button type="button" onClick={onSession}>会话</button> : null}
    </div>
  </article>;
}

function OverflowTitle({ text }: { text: string }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const measure = () => {
    const box = wrap.current;
    const label = inner.current;
    if (!box || !label) return;
    const maxWidth = label.style.maxWidth;
    label.style.maxWidth = "none";
    const extra = Math.ceil(label.scrollWidth - box.clientWidth);
    label.style.maxWidth = maxWidth;
    setOverflow(extra > 1 ? extra : 0);
  };
  useLayoutEffect(measure, [text]);
  return <strong
    ref={wrap}
    className={`coordinator-title${overflow ? " is-overflow" : ""}`}
    style={overflow ? {
      "--scroll-distance": `-${overflow}px`,
      "--scroll-duration": `${Math.min(8, Math.max(1.2, overflow / 42))}s`,
    } as React.CSSProperties : undefined}
    onMouseEnter={measure}
  >
    <span ref={inner}>{text}</span>
  </strong>;
}

function pendingDetail(task: MonitorData["taskPool"][number]): L3Detail {
  return {
    id: task.task_id,
    title: task.title,
    typeLabel: task.task_type === "assist_l2" ? "辅助 L2" : "正式任务",
    statusLabel: labelWorkflowStatus(task.run_status || task.task_status),
    tone: poolTone(task),
    goal: task.goal,
    progress: task.progress,
    result: task.result_summary,
    artifacts: artifactCount(task.artifact_refs),
    source: task.source_user_id || labelExecutorType(task.source_type),
    target: formatActorRef(task.target_type, task.target_id),
    executor: task.executor_type ? formatActorRef(task.executor_type, task.executor_id || "待绑定") : "未选择",
    time: time(task.started_at),
  };
}

function claimedDetail(task: MonitorData["executors"][number], poolTitle?: string): L3Detail {
  const state = taskState(task);
  const active = !!task.execution_active || task.status === "running" || task.status === "queued";
  return {
    id: task.task_id,
    title: poolTitle || task.progress || (task.task_type === "assist_l2" ? "辅助任务" : "执行任务"),
    typeLabel: active ? "正在执行" : "已接过",
    statusLabel: state.label,
    tone: state.tone,
    goal: task.goal,
    progress: task.progress,
    result: task.result_summary || null,
    artifacts: artifactCount(task.artifact_refs),
    source: task.requested_by || labelExecutorType(task.source_type),
    target: formatActorRef(task.target_type, task.target_id),
    executor: task.executor_type ? formatActorRef(task.executor_type, task.executor_id || "待绑定") : "未选择",
    time: time(task.last_action_at || task.finished_at || task.started_at),
  };
}

function L3TaskDetailDialog({ detail, onClose }: { detail: L3Detail; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="l3-task-detail-dialog" aria-labelledby="l3-task-detail-title" onCancel={onClose}>
    <header className="agent-monitor-header">
      <div>
        <span>任务详情</span>
        <h2 id="l3-task-detail-title">{detail.title}</h2>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭详情" title="关闭">×</button>
    </header>
    <div className="l3-task-detail-body task-detail">
      <header>
        <div>
          <small>{detail.typeLabel}</small>
          <h3>{detail.title}</h3>
        </div>
        <State tone={detail.tone}>{detail.statusLabel}</State>
      </header>
      <dl className="task-detail-meta">
        <div><dt>来源</dt><dd>{detail.source}</dd></div>
        <div><dt>责任</dt><dd>{detail.target}</dd></div>
        <div><dt>执行</dt><dd>{detail.executor}</dd></div>
        <div><dt>时间</dt><dd>{detail.time}</dd></div>
        {detail.artifacts ? <div><dt>产物</dt><dd>{detail.artifacts} 项</dd></div> : null}
      </dl>
      <section><h4>目标</h4><p>{detail.goal || "暂无"}</p></section>
      {detail.progress ? <section><h4>进展</h4><p>{detail.progress}</p></section> : null}
      {detail.result ? <section><h4>结果</h4><p>{detail.result}</p></section> : null}
    </div>
  </dialog>;
}

function L1HistoryDialog({ title, columns, rows, empty, onClose }: {
  title: string;
  columns: HistoryColumn[];
  rows: HistoryRow[];
  empty: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const hasActions = rows.some((row) => row.actions);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="l3-task-detail-dialog l1-history-dialog" aria-labelledby="l1-history-title" onCancel={onClose}>
    <header className="agent-monitor-header">
      <div>
        <span>历史记录</span>
        <h2 id="l1-history-title">{title}</h2>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭历史记录" title="关闭">×</button>
    </header>
    <div className="l1-history-body">
      <table className="l1-history-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            {hasActions ? <th>操作</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <tr key={row.id}>
            {columns.map((column) => <td key={column.key}>
              {column.key === "status" && row.tone
                ? <State tone={row.tone}>{row.cells[column.key]}</State>
                : row.cells[column.key] || ""}
            </td>)}
            {hasActions ? <td className="l1-history-actions">{row.actions}</td> : null}
          </tr>)}
          {!rows.length && <tr><td className="monitor-empty" colSpan={columns.length + (hasActions ? 1 : 0)}>{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  </dialog>;
}

type TaskSessionData = {
  status?: string;
  progress?: string | null;
  running?: boolean;
  error?: string | null;
  contextUsage: ContextUsage;
  messages: { id: string; role: string; source: string | null; text: string }[];
  events?: { id: string; tool: string; status: string; input: string; finished_at: string | null }[];
  pending?: { id: string; author: string; body: string; createdAt: string }[];
};

type SessionTarget =
  | { kind: "l1"; task: string }
  | { kind: "l3"; title: string; threadId: string; messageId: string };

function TaskSessionDialog({
  kicker,
  title,
  emptyIdle,
  roleLabel,
  path,
  compactPath,
  compactBody,
  live,
  api,
  onClose,
}: {
  kicker: string;
  title: string;
  emptyIdle: string;
  roleLabel: (role: string) => string;
  path: string;
  compactPath: string;
  compactBody?: Record<string, string>;
  live?: { threadId: string; messageId: string };
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<TaskSessionData | null>(null);
  const [error, setError] = useState("");
  const liveRows = useAgentLiveOutput(live?.threadId || "", !!live);
  const liveOutput = live ? liveRows[live.messageId] : undefined;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        setData(await api(path, undefined, undefined, controller.signal));
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 4000);
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [path]);
  useEffect(() => {
    const box = list.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [data?.messages.length, data?.pending?.length, data?.events?.length, liveOutput?.revision]);
  const usage = data?.contextUsage || contextUsage(null, [], []);
  const pending = data?.pending || [];
  const events = data?.events || [];
  return <dialog
    ref={dialog}
    className="l3-task-detail-dialog l3-task-session-dialog"
    aria-labelledby="l3-task-session-title"
    onCancel={(event) => {
      if (event.target !== event.currentTarget) {
        event.preventDefault();
        return;
      }
      onClose();
    }}
  >
    <header className="agent-monitor-header l3-task-session-header">
      <div>
        <span>{kicker}</span>
        <h2 id="l3-task-session-title">{title}</h2>
        {data?.progress ? <small>{data.progress}</small> : null}
      </div>
      <div className="l3-task-session-tools">
        <ContextMeter
          usage={usage}
          writable={!data?.running}
          onCompact={async () => {
            await api(compactPath, compactBody || {});
            setData(await api(path));
          }}
        />
        <button type="button" onClick={onClose} aria-label="关闭任务会话" title="关闭">×</button>
      </div>
    </header>
    <div className="l3-task-session-body" ref={list}>
      {!data?.messages.length && !pending.length && !events.length && !liveOutput?.content && !liveOutput?.reasoning &&
        <p className="monitor-empty">{data?.running ? "正在写入原生会话…" : emptyIdle}</p>}
      {data?.messages.map((message) => <article key={message.id} className={`l3-task-session-msg ${message.role}`}>
        <small>{roleLabel(message.role)}</small>
        <div className="message-text">
          <StreamingMarkdown active={false} text={message.text} />
        </div>
      </article>)}
      {pending.map((item) => <article key={item.id} className="l3-task-session-msg pending">
        <small>{item.author} · 待纳入</small>
        <pre>{item.body}</pre>
      </article>)}
      {data && (events.length || liveOutput?.content || liveOutput?.reasoning) ? <div className="l3-task-session-live">
        <AgentActivity
          threadId={live?.threadId || ""}
          messageId={live?.messageId || ""}
          events={events}
          output={liveOutput}
          status={data.status || "running"}
          progress={data.progress}
          hasFinal={data.status === "completed"}
        />
      </div> : null}
      {data?.error && <p className="error" role="alert">{data.error}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  </dialog>;
}

function EventLogDialog({ events, onClose }: { events: MonitorData["eventLog"]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="agent-log-dialog l3-event-log-dialog" aria-labelledby="l3-event-log-title" onCancel={onClose}>
    <header className="agent-monitor-header">
      <div>
        <span>DSH 轨迹</span>
        <h2 id="l3-event-log-title">轨迹</h2>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭轨迹" title="关闭">×</button>
    </header>
    <div className="monitor-log-list l3-event-log-body">
      {events.map((event) => <article className="monitor-log-row" key={event.id}>
        <span className={`monitor-log-icon ${event.status}`} aria-hidden="true" />
        <span className="monitor-log-main">
          <strong>{event.action}</strong>
          <small>{event.thread_title} · {event.tool}</small>
        </span>
        <span className="monitor-log-meta">
          <State tone={event.status === "failed" ? "failed" : event.status === "running" ? "running" : "idle"}>{labelAgentEventStatus(event.status)}</State>
          <time>{time(event.created_at)}</time>
          {event.duration_ms != null ? <small>{formatDurationMs(event.duration_ms)}</small> : null}
        </span>
      </article>)}
      {!events.length && <p className="monitor-empty">这个任务还没有轨迹。</p>}
    </div>
  </dialog>;
}

export function AgentMonitor({ projectId, projectName, api, onClose }: {
  projectId: string;
  projectName: string;
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<MonitorData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [taskDetail, setTaskDetail] = useState<L3Detail | null>(null);
  const [logScope, setLogScope] = useState<AgentLogScope | null>(null);
  const [eventLogs, setEventLogs] = useState<MonitorData["eventLog"] | null>(null);
  const [historyKind, setHistoryKind] = useState<"member" | "document" | "organization" | "archive" | null>(null);
  const [sessionTarget, setSessionTarget] = useState<SessionTarget | null>(null);
  const [refreshing, setRefreshing] = useState<"member" | "document" | "organization" | "archive" | null>(null);
  const activeTasks = useMemo(() => data?.executors.filter((task) => task.execution_active || task.status === "running").length || 0, [data]);
  const selectedCoordinator = data?.coordinators.find((item) => item.id === selectedThreadId);
  const threadPool = useMemo(() => (data?.taskPool || []).filter((task) =>
    task.origin_thread_id === selectedThreadId && (!task.executor_type || task.executor_type === "dsh_l3")), [data, selectedThreadId]);
  const selectedTasks = useMemo(() => data?.executors.filter((task) => task.thread_id === selectedThreadId && task.executor_type === "dsh_l3") || [], [data, selectedThreadId]);
  const slots = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const slot = index + 1;
    const explicit = selectedTasks.find((item) => item.agent_slot === slot);
    const unassigned = selectedTasks.filter((item) => item.agent_slot == null && !selectedTasks.some((candidate) => candidate.agent_slot != null && candidate.task_id === item.task_id));
    const occupiedBefore = Array.from({ length: index }, (_, previous) => selectedTasks.find((item) => item.agent_slot === previous + 1)).filter(Boolean).length;
    return { slot, agent: EXECUTORS[index], task: explicit || unassigned[index - occupiedBefore] || null };
  }), [selectedTasks]);
  const selectedAgent = slots.find((item) => item.slot === selectedSlot) || slots[0];
  const pendingTasks = useMemo(() => threadPool.filter((task) => !task.executor_id && !ENDED.has(task.task_status)), [threadPool]);
  const claimedTasks = useMemo(() => {
    const current = selectedAgent?.task || null;
    const listed = selectedTasks.filter((task) => task.agent_slot === selectedSlot || (current && task.task_id === current.task_id));
    const unique: MonitorData["executors"] = [];
    const seen = new Set<string>();
    for (const task of [current, ...listed]) {
      if (!task || seen.has(task.task_id)) continue;
      seen.add(task.task_id);
      unique.push(task);
    }
    for (const task of threadPool) {
      if (!task.executor_id || seen.has(task.task_id)) continue;
      if (task.executor_id !== current?.executor_id && current?.task_id !== task.task_id) continue;
      seen.add(task.task_id);
      unique.push({
        task_id: task.task_id, thread_id: selectedThreadId, thread_title: selectedCoordinator?.title || "",
        requested_by: task.source_user_id || "", goal: task.goal, status: task.run_status || task.task_status,
        progress: task.progress, agent_slot: selectedSlot, execution_active: ["queued", "running"].includes(task.run_status || "") ? 1 : 0,
        started_at: task.started_at || "", finished_at: task.finished_at || null, last_action: null, last_action_status: null,
        last_action_at: null, update_count: 0, executor_type: "dsh_l3", executor_id: task.executor_id,
        target_type: task.target_type, target_id: task.target_id, task_type: task.task_type, source_type: task.source_type,
        created_by_type: task.created_by_type, created_by_id: task.created_by_id, claimed_by_type: task.claimed_by_type,
        claimed_by_id: task.claimed_by_id, result_summary: task.result_summary, artifact_refs: task.artifact_refs,
      });
    }
    return unique;
  }, [selectedAgent, selectedSlot, selectedTasks, threadPool, selectedThreadId, selectedCoordinator]);

  const openTaskTrace = (taskId: string) => {
    if ((data?.taskPool || []).some((task) => task.task_id === taskId)) {
      setEventLogs(null);
      setLogScope({ type: "task", id: taskId });
      return;
    }
    setLogScope(null);
    setEventLogs((data?.eventLog || []).filter((event) => event.agent_type === "dsh_l3" && event.message_id === taskId));
  };

  const reloadMonitor = async () => {
    const next = await api(`/projects/${projectId}/agent-monitor`);
    setData(next);
    setError("");
  };

  const triggerMemory = async (kind: "member" | "document") => {
    setRefreshing(kind);
    try {
      const path = kind === "member" ? "member-memory" : "project-document-memory";
      await api(`/projects/${projectId}/${path}`, {});
      await reloadMonitor();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setRefreshing(null);
    }
  };

  const triggerOrganization = async () => {
    setRefreshing("organization");
    try {
      await api(`/projects/${projectId}/documents/organize`, {});
      await reloadMonitor();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setRefreshing(null);
    }
  };

  const triggerArchive = async (threadId?: string) => {
    setRefreshing("archive");
    try {
      await api(`/projects/${projectId}/iteration-archive`, threadId ? { threadId } : {});
      await reloadMonitor();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setRefreshing(null);
    }
  };

  useEffect(() => {
    dialog.current?.showModal();
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await api(`/projects/${projectId}/agent-monitor`);
        if (alive) {
          setData(next);
          setSelectedThreadId((current) => next.coordinators.some((item: MonitorData["coordinators"][number]) => item.id === current)
            ? current
            : next.coordinators.find((item: MonitorData["coordinators"][number]) => item.status === "active")?.id || next.coordinators[0]?.id || "");
          setError("");
        }
      } catch (cause) {
        if (alive) setError((cause as Error).message);
      } finally {
        if (alive) { setLoading(false); timer = setTimeout(load, 5000); }
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [projectId]);

  useEffect(() => {
    const busy = slots.find((item) => item.task && (item.task.execution_active || item.task.status === "running" || item.task.status === "queued"));
    setSelectedSlot(busy?.slot || 1);
  }, [selectedThreadId]);

  const knowledge = data?.knowledge;
  const openL1Logs = (task: string) =>
    setLogScope({ type: "project", id: projectId, task });
  const sessionButton = (task: string) => (
    <button type="button" className="monitor-trace-btn" onClick={() => setSessionTarget({ kind: "l1", task })}>会话</button>
  );
  const latestArchive = knowledge?.archives?.[0];
  const activeIterations = (data?.coordinators || []).filter((item) => item.status === "active").length;
  const projectOrgJobs = (knowledge?.organizationJobs || []).filter((job) => job.scope === "project");
  const projectOrgBusy = projectOrgJobs.some((job) => ["queued", "running"].includes(job.status));
  const projectOrgLastAt = projectOrgJobs
    .map((job) => job.finished_at || job.started_at || job.created_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || knowledge?.organizationLastAt || null;
  const knowledgeLast = (() => {
    if (!knowledge) return { label: "暂无", tone: "idle" as const };
    if (knowledge.sessionStatus === "running") {
      const started = time(knowledge.lastStartedAt);
      return { label: started === "暂无" ? "正在整理" : `正在整理 · ${started}`, tone: "running" as const };
    }
    const at = time(knowledge.lastFinishedAt || knowledge.lastUpdatedAt);
    const failed = knowledge.sessionStatus === "failed" || !!knowledge.lastError;
    const task = l1TaskLabel(knowledge.lastTask);
    if (at === "暂无" && !task) return { label: "暂无", tone: "idle" as const };
    const outcome = failed ? "上次失败" : "上次成功";
    const label = [task, outcome, at === "暂无" ? "" : at].filter(Boolean).join(" · ");
    return { label, tone: failed ? "failed" as const : "idle" as const };
  })();

  return <>
  <dialog ref={dialog} className="agent-monitor" aria-labelledby="agent-monitor-title" onCancel={onClose}>
    <header className="agent-monitor-header">
      <div>
        <span>项目运行状态</span>
        <h2 id="agent-monitor-title">小祥监控</h2>
        <p>{projectName}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭小祥监控" title="关闭">×</button>
    </header>

    {loading && !data ? <div className="monitor-loading" role="status">正在读取运行状态…</div> : <>
      <div className="monitor-overview" aria-label="运行概览">
        <div><strong>{data?.coordinators.filter((item) => item.status === "active").length || 0}</strong><span>活跃迭代</span></div>
        <div><strong>{activeTasks}</strong><span>执行中</span></div>
        <div><strong>{(knowledge?.memberPending || 0) + (knowledge?.documentPending || 0)}</strong><span>待整理知识</span></div>
        <time dateTime={data?.generatedAt}>更新于 {time(data?.generatedAt)}</time>
      </div>

      <section className="monitor-section">
        <div className="monitor-section-heading">
          <div>
            <span className="monitor-level">项目级Agents</span>
            <img className="monitor-avatar" src="/agent-avatars/grandpa.jpg" alt="" />
            <span className="monitor-agent-copy">
              <span className="monitor-agent-title">老翁（项目知识库管理员）</span>
              <small className={knowledgeLast.tone}>{knowledgeLast.label}</small>
            </span>
          </div>
        </div>
        <div className="l1-task-grid">
          <article className="l1-task-card">
            <h4>成员发言</h4>
            <p>说话风格、习惯与本人发言浓缩；同项目多次整理共用一套上下文</p>
            <p>{pendingLine("member", knowledge?.memberPending || 0)}</p>
            <p>最近整理：{time(knowledge?.memberLastAt)}</p>
            <p>预计下次：{nextTime(knowledge?.memberNextAt, knowledge?.memberPending || 0)}</p>
            <div className="l1-task-actions">
              {sessionButton("member_memory")}
              <button type="button" className="monitor-trace-btn" onClick={() => openL1Logs("member_memory")}>轨迹</button>
              <button type="button" className="monitor-trace-btn" onClick={() => setHistoryKind("member")}>历史记录</button>
              <button type="button" className="monitor-trace-btn" disabled={refreshing === "member"} onClick={() => void triggerMemory("member")}>
                {refreshing === "member" ? "排队中…" : "立即整理"}
              </button>
            </div>
          </article>
          <article className="l1-task-card">
            <h4>文档摘要</h4>
            <p>正式、产物与缓存文件的事实摘要；同项目多次整理共用一套上下文</p>
            <p>{pendingLine("document", knowledge?.documentPending ?? knowledge?.projectDocumentPending ?? 0)}</p>
            <p>最近整理：{time(knowledge?.documentLastAt ?? knowledge?.projectDocumentLastAt)}</p>
            <p>预计下次：{nextTime(knowledge?.documentNextAt ?? knowledge?.projectDocumentNextAt, knowledge?.documentPending ?? knowledge?.projectDocumentPending ?? 0)}</p>
            <div className="l1-task-actions">
              {sessionButton("document_memory")}
              <button type="button" className="monitor-trace-btn" onClick={() => openL1Logs("document_memory")}>轨迹</button>
              <button type="button" className="monitor-trace-btn" onClick={() => setHistoryKind("document")}>历史记录</button>
              <button type="button" className="monitor-trace-btn" disabled={refreshing === "document"} onClick={() => void triggerMemory("document")}>
                {refreshing === "document" ? "排队中…" : "立即整理"}
              </button>
            </div>
          </article>
          <article className="l1-task-card">
            <h4>文档整理</h4>
            <p>归类与命名正式文件区文档；同项目多次整理共用一套上下文</p>
            <p>最近整理：{time(projectOrgLastAt)}</p>
            <div className="l1-task-actions">
              {sessionButton("document_organization")}
              <button type="button" className="monitor-trace-btn" onClick={() => openL1Logs("document_organization")}>轨迹</button>
              <button type="button" className="monitor-trace-btn" onClick={() => setHistoryKind("organization")}>历史记录</button>
              <button
                type="button"
                className="monitor-trace-btn"
                disabled={projectOrgBusy || refreshing === "organization"}
                onClick={() => void triggerOrganization()}
              >
                {refreshing === "organization" || projectOrgBusy ? "排队中…" : "立即整理"}
              </button>
            </div>
          </article>
          <article className="l1-task-card">
            <h4>迭代归档</h4>
            <p>总结本次迭代并更新项目长期记忆；同项目多次归档共用一套上下文</p>
            <p>最近整理：{time(knowledge?.archiveLastAt)}</p>
            <div className="l1-task-actions">
              {sessionButton("iteration_archive")}
              <button type="button" className="monitor-trace-btn" onClick={() => openL1Logs("iteration_archive")}>轨迹</button>
              <button type="button" className="monitor-trace-btn" onClick={() => setHistoryKind("archive")}>历史记录</button>
              <button type="button" className="monitor-trace-btn" disabled={!latestArchive || refreshing === "archive"} onClick={() => void triggerArchive(latestArchive?.id)}>
                {refreshing === "archive" ? "排队中…" : "立即整理"}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section className="monitor-section monitor-coordinators">
        <div className="monitor-section-heading">
          <div>
            <span className="monitor-level">迭代级Agents</span>
            <img className="monitor-avatar" src="/agent-avatars/xiaojingang.jpg" alt="" />
            <span className="monitor-agent-title">小祥（任务调度员）</span>
          </div>
          <span className="monitor-count">{data?.coordinators.length || 0} 个</span>
        </div>
        <div className="coordinator-list">
          {data?.coordinators.map((item) => {
            const busy = item.running_requests + item.queued_requests > 0;
            const status = item.status === "archived" ? "已归档" : busy ? "调度中" : "待命";
            return <article className={`coordinator-row ${selectedThreadId === item.id ? "selected" : ""}`} key={item.id}>
              <button type="button" className="coordinator-select" aria-label={`${item.title} ${status}`} aria-pressed={selectedThreadId === item.id} onClick={() => setSelectedThreadId(item.id)}>
                <span className="coordinator-copy">
                  <OverflowTitle text={item.title} />
                  <small>{status}</small>
                </span>
              </button>
            </article>;
          })}
          {!data?.coordinators.length && <p className="monitor-empty">项目还没有迭代。</p>}
        </div>
      </section>

      <section className="monitor-section monitor-executors">
        <div className="monitor-section-heading">
          <div>
            <span className="monitor-level">任务级Agents</span>
            {selectedAgent ? <img className="monitor-avatar" src={`/agent-avatars/${selectedAgent.agent.avatar}`} alt="" /> : null}
            <span className="monitor-agent-title">{selectedAgent ? `${selectedAgent.agent.name}（任务执行者）` : "任务执行者"}</span>
          </div>
          <span className="monitor-count">{selectedCoordinator?.active_executors || 0}/7 工作中</span>
        </div>
        <div className="l3-workspace">
          <div className="l3-agent-list" role="listbox" aria-label="任务级Agents">
            {slots.map(({ slot, agent, task }) => {
              const state = task ? taskState(task) : { label: "空闲", tone: "idle" as const };
              const activeAt = time(task?.last_action_at || task?.finished_at || task?.started_at);
              return <button type="button" role="option" aria-selected={selectedSlot === slot} aria-label={`${agent.name} ${state.label} ${activeAt}`} className={selectedSlot === slot ? "selected" : ""} key={slot} style={{ "--agent-color": agent.color } as React.CSSProperties} onClick={() => setSelectedSlot(slot)}>
                <img className="monitor-avatar" src={`/agent-avatars/${agent.avatar}`} alt="" />
                <span className="l3-agent-copy"><strong>{agent.name}</strong><small>{activeAt}</small></span>
              </button>;
            })}
          </div>
          <div className="l3-agent-pane">
            <div className="l3-agent-pane-head">
              <p>{selectedAgent ? `${selectedAgent.agent.name} 的每个任务使用独立 DSH 会话。打开会话可查看原生上下文。` : "选择一个执行 Agent 查看任务。"}</p>
            </div>
            <div className="l3-agent-pane-body">
              <div className="l3-task-group">
                <h4>待处理 {pendingTasks.length} 项</h4>
                <div className="executor-list">
                  {pendingTasks.map((task) => <L3TaskCard
                    key={task.task_id}
                    title={task.title}
                    meta={`${task.task_type === "assist_l2" ? "辅助 L2" : "正式任务"} · 来源 ${task.source_user_id || labelExecutorType(task.source_type)}`}
                    tone={poolTone(task)}
                    status={labelWorkflowStatus(task.run_status || task.task_status)}
                    onDetail={() => setTaskDetail(pendingDetail(task))}
                    onTrace={() => openTaskTrace(task.task_id)}
                  />)}
                  {!pendingTasks.length && <p className="monitor-empty">没有待处理任务。</p>}
                </div>
              </div>
              <div className="l3-task-group">
                <h4>已接过 {claimedTasks.length} 项</h4>
                <div className="executor-list">
                  {claimedTasks.map((task) => {
                    const state = taskState(task);
                    const active = !!task.execution_active || task.status === "running" || task.status === "queued";
                    const title = threadPool.find((item) => item.task_id === task.task_id)?.title
                      || task.progress
                      || (task.task_type === "assist_l2" ? "辅助任务" : "执行任务");
                    return <L3TaskCard
                      key={task.task_id}
                      title={title}
                      meta={`${active ? "正在执行" : "已接过"} · ${task.requested_by || labelExecutorType(task.source_type)}`}
                      tone={state.tone}
                      status={state.label}
                      style={{ "--agent-color": selectedAgent?.agent.color, "--agent-tint": selectedAgent?.agent.tint } as React.CSSProperties}
                      onDetail={() => setTaskDetail(claimedDetail(task, threadPool.find((item) => item.task_id === task.task_id)?.title))}
                      onTrace={() => openTaskTrace(task.task_id)}
                      onSession={() => setSessionTarget({
                        kind: "l3",
                        threadId: selectedThreadId,
                        messageId: task.task_id,
                        title,
                      })}
                    />;
                  })}
                  {!claimedTasks.length && <p className="monitor-empty">还没有接过任务。</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>}
    {error && <p className="monitor-error" role="alert">{error}</p>}
  </dialog>
  {taskDetail ? <L3TaskDetailDialog detail={taskDetail} onClose={() => setTaskDetail(null)} /> : null}
  {logScope ? <AgentLogDialog scope={logScope} api={api} onClose={() => setLogScope(null)} /> : null}
  {sessionTarget ? <TaskSessionDialog
    kicker={sessionTarget.kind === "l1" ? "维护会话" : "任务会话"}
    title={sessionTarget.kind === "l1" ? l1TaskLabel(sessionTarget.task) : sessionTarget.title}
    emptyIdle={sessionTarget.kind === "l1" ? "这个维护 Agent 还没有会话内容。" : "这个任务还没有会话内容。"}
    roleLabel={(role) => role === "assistant"
      ? (sessionTarget.kind === "l1" ? "维护 Agent" : "执行 Agent")
      : role === "system" ? "系统" : sessionTarget.kind === "l1" ? "任务输入" : "成员 / 上下文"}
    path={sessionTarget.kind === "l1"
      ? `/projects/${projectId}/l1-sessions/${sessionTarget.task}`
      : `/threads/${sessionTarget.threadId}/replies/${sessionTarget.messageId}/session`}
    compactPath={sessionTarget.kind === "l1"
      ? `/projects/${projectId}/l1-context/compact`
      : `/threads/${sessionTarget.threadId}/replies/${sessionTarget.messageId}/context/compact`}
    compactBody={sessionTarget.kind === "l1" ? { task: sessionTarget.task } : undefined}
    live={sessionTarget.kind === "l3"
      ? { threadId: sessionTarget.threadId, messageId: sessionTarget.messageId }
      : undefined}
    api={api}
    onClose={() => setSessionTarget(null)}
  /> : null}
  {eventLogs ? <EventLogDialog events={eventLogs} onClose={() => setEventLogs(null)} /> : null}
  {historyKind === "member" ? <L1HistoryDialog
    title="成员发言"
    empty="还没有成员整理记录。"
    columns={L1_RUN_COLUMNS}
    rows={l1RunRows(knowledge?.memberRuns, " 人")}
    onClose={() => setHistoryKind(null)}
  /> : null}
  {historyKind === "document" ? <L1HistoryDialog
    title="文档摘要"
    empty="还没有文档摘要记录。"
    columns={L1_RUN_COLUMNS}
    rows={l1RunRows(knowledge?.documentRuns?.length ? knowledge.documentRuns : knowledge?.projectDocumentRuns, " 份")}
    onClose={() => setHistoryKind(null)}
  /> : null}
  {historyKind === "organization" ? <L1HistoryDialog
    title="文档整理"
    empty="还没有文档整理记录。"
    onClose={() => setHistoryKind(null)}
    columns={[
      { key: "time", label: "时间" },
      { key: "scope", label: "范围" },
      { key: "count", label: "文档数" },
      { key: "status", label: "状态" },
      { key: "note", label: "说明" },
    ]}
    rows={projectOrgJobs.map((job) => ({
      id: job.id,
      tone: job.status === "failed" ? "failed" as const
        : job.status === "running" ? "running" as const
        : job.status === "queued" ? "waiting" as const
        : "idle" as const,
      cells: {
        time: time(job.finished_at || job.started_at || job.created_at),
        scope: job.scope === "project" ? "正式文件" : (job.thread_title || "迭代文档"),
        count: job.document_count != null ? `${job.document_count} 份` : "—",
        status: runStatusLabel(job.status),
        note: job.error || "",
      },
    }))}
  /> : null}
  {historyKind === "archive" ? <L1HistoryDialog
    title="迭代归档"
    empty="还没有迭代归档记录。"
    onClose={() => setHistoryKind(null)}
    columns={[
      { key: "time", label: "时间" },
      { key: "title", label: "迭代" },
      { key: "note", label: "结论" },
      { key: "status", label: "状态" },
    ]}
    rows={(knowledge?.archives || []).map((item) => {
      const latestRun = item.runs?.[0];
      return {
        id: item.id,
        tone: latestRun ? runTone(latestRun.status) : "idle" as const,
        cells: {
          time: time(latestRun?.finished_at || latestRun?.started_at || item.archived_at),
          title: item.title,
          note: item.conclusion || "无结论",
          status: latestRun ? runStatusLabel(latestRun.status) : "已归档",
        },
      };
    })}
  /> : null}
  </>;
}
