/**
 * 项目记忆：全屏六四布局弹窗。左栏导读（Markdown），右栏可搜索的记忆时间轴；
 * 单条记忆点开二级详情弹窗看正文、出处、所属迭代与确认/纠错。
 * 数据契约见 docs/engineering/12-project-memory.md §3.1。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DialogHeader } from "./DialogHeader";
import { MarkdownDocumentPreview } from "./MarkdownDocumentPreview";
import { SelectField } from "./SelectField";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";
import { animateDialogClose, Dialog } from "./dialog-fx";
import { showTip } from "./Tip";
import { UiIcon } from "./ui-icon";
import { relativeActivity } from "./workspace-format";
import { AgentLogDialog } from "./AgentLogDialog";
import type { AgentLogScope } from "./trajectory-model";
import { LaowengHistoryDialog } from "./agent-monitor-history";
import { LAOWENG_RUN_COLUMNS, laowengRunRows } from "./agent-monitor-model";
import { TaskSessionDialog } from "./agent-monitor-session";
import type { LaowengRun } from "./agent-monitor-types";

export type MemoryCounts = { drafts: number; disputes: number; updatedSinceEntry: number };

type MemorySource = { sourceKind?: string; sourceId?: string; label?: string };
type MemoryRelation = {
  id: string;
  relation?: string;
  direction?: "in" | "out";
  otherPageId?: string;
  otherTitle?: string;
  note?: string;
};
type MemoryEntry = {
  id: string;
  kind?: string;
  title?: string;
  body?: string;
  status?: string;
  updatedAt?: string | null;
  createdBy?: string;
  /** 老翁标了未裁决的争议（服务端由纠错日志推导）。 */
  disputed?: boolean;
  /** 五类记忆对象；历史条目可能为空。 */
  subject?: string | null;
  aboutUserId?: string | null;
  relations?: MemoryRelation[];
  sources?: MemorySource[];
};
type MemoryJobRun = {
  status?: string;
  createdAt?: string;
  error?: string;
  itemCount?: number;
};
type MemoryJob = {
  key: string;
  label: string;
  subject?: string;
  trigger: string;
  prompt: string;
  tools: string[];
  completion: string;
  failure: string;
  batch?: number;
  backlog?: number | null;
  backlogNote?: string;
  enabled?: boolean;
  triggerThreshold?: number | null;
  promptOverridden?: boolean;
  settingsUpdatedAt?: string | null;
  lastRun?: MemoryJobRun | null;
  recentRuns?: LaowengRun[];
  archivedThread?: { id: string; title?: string } | null;
};
type MemoryTaskDecision = {
  taskId?: string;
  title?: string;
  disposition?: string;
  reason?: string;
};
type MemoryKeyVersion = {
  versionId?: string;
  artifactId?: string;
  title?: string;
  version?: number;
};
type MemoryTimelineCard = {
  iterationId: string;
  title?: string;
  archivedAt?: string | null;
  conclusion?: string;
  memoryChanges?: { added?: number; updated?: number; superseded?: number };
  taskDecisions?: MemoryTaskDecision[];
  keyVersions?: MemoryKeyVersion[];
  pageIds?: string[];
};
type MemoryGuide = {
  text?: string;
  updatedAt?: string | null;
  basedOn?: { iterationId?: string; title?: string; archivedAt?: string | null } | null;
};
type MemoryData = {
  /** viewer 为 false；以服务端为准，父组件的项目角色只作兜底。 */
  canWrite?: boolean;
  /** 项目已归档：记忆封存，只读。 */
  frozen?: boolean;
  guide?: MemoryGuide | null;
  counts?: Partial<MemoryCounts> | null;
  timeline?: MemoryTimelineCard[] | null;
  members?: { id: string; name?: string }[] | null;
  entries?: MemoryEntry[] | null;
};
type MemoryApi = (
  path: string,
  data?: unknown,
  method?: string,
  signal?: AbortSignal,
) => Promise<any>;
type MemoryPendingAction = { kind: "confirm" | "flag"; entry: MemoryEntry };

const ZERO_COUNTS: MemoryCounts = { drafts: 0, disputes: 0, updatedSinceEntry: 0 };
const KIND_LABEL: Record<string, string> = {
  status: "当前状态",
  decision: "决策",
  guide: "指南",
  glossary: "术语",
  retro: "复盘",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  current: "现行",
  superseded: "被替代",
};
const STATUS_KEYS = ["draft", "current", "superseded"] as const;
const DEFAULT_STATUS_FILTER = ["draft", "current"];
const SUBJECT_LABEL: Record<string, string> = {
  utterance: "发言",
  document: "文档",
  task: "任务",
  discussion: "讨论",
  project: "整体",
};
const SUBJECT_KEYS = ["utterance", "document", "task", "discussion", "project"] as const;
const RELATION_LABEL: Record<string, string> = {
  relates: "关联",
  derives: "继承",
  supersedes: "替代",
};
const SOURCE_LABEL: Record<string, string> = {
  message: "消息",
  document_version: "文档版本",
  task: "任务",
  archive: "归档",
  manual: "手动",
};

/** 只接受契约里的三个计数字段，缺字段按 0，避免计数小点因脏数据常亮。 */
function normalizeCounts(value: unknown): MemoryCounts | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const read = (field: string) => {
    const raw = source[field];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  };
  return {
    drafts: read("drafts"),
    disputes: read("disputes"),
    updatedSinceEntry: read("updatedSinceEntry"),
  };
}

function timeOf(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function agoOf(value: string | null | undefined) {
  return value ? relativeActivity(value, Date.now()) : "";
}

/** 时间轴上的完整时间：年-月-日 时:分:秒（数据库时间是 UTC，这里按本地时区展示）。 */
function stampOf(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()),
    pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds()),
  ].join(" ");
}

export function ProjectMemory({
  projectId,
  api,
  canWrite,
  onClose,
  onCountsChange,
  focusId,
}: {
  projectId: string;
  api: MemoryApi;
  canWrite: boolean;
  onClose: () => void;
  onCountsChange?: (counts: MemoryCounts) => void;
  /** 从引用/引用分组进来时要聚焦的条目 id：打开后自动选中该条详情。 */
  focusId?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<MemoryData | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [counts, setCounts] = useState<MemoryCounts>(ZERO_COUNTS);
  const [busyId, setBusyId] = useState("");
  const [flagEntryId, setFlagEntryId] = useState("");
  const [flagNote, setFlagNote] = useState("");
  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);
  const [serverCanWrite, setServerCanWrite] = useState<boolean | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<MemoryJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [logScope, setLogScope] = useState<AgentLogScope | null>(null);
  const [historyJob, setHistoryJob] = useState<MemoryJob | null>(null);
  const [sessionJob, setSessionJob] = useState<MemoryJob | null>(null);
  const [runningJob, setRunningJob] = useState("");
  const [savingJob, setSavingJob] = useState("");
  const [editingJob, setEditingJob] = useState<{
    key: string;
    enabled: boolean;
    threshold: string;
    prompt: string;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>(DEFAULT_STATUS_FILTER);
  const [subjectFilter, setSubjectFilter] = useState<string[]>([]);
  const [memberFilter, setMemberFilter] = useState("");
  const [pendingAction, setPendingAction] = useState<MemoryPendingAction | null>(null);
  const appliedFocus = useRef("");
  const editable = serverCanWrite ?? canWrite;

  const publishCounts = useCallback(
    (next: MemoryCounts) => {
      setCounts(next);
      onCountsChange?.(next);
    },
    [onCountsChange],
  );

  const load = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (!silent) setPhase("loading");
      setError("");
      try {
        const payload = await api(`/projects/${projectId}/memory`, undefined, undefined, signal);
        if (signal?.aborted) return;
        const next: MemoryData =
          payload && typeof payload === "object" ? (payload as MemoryData) : {};
        setData(next);
        setServerCanWrite(typeof next.canWrite === "boolean" ? next.canWrite : null);
        setFrozen(next.frozen === true);
        publishCounts(normalizeCounts(next.counts) ?? ZERO_COUNTS);
        setPhase("ready");
      } catch (cause) {
        if (signal?.aborted) return;
        if (silent) {
          showTip(cause instanceof Error ? cause.message : "项目记忆刷新失败", "error");
          return;
        }
        setError(cause instanceof Error ? cause.message : "项目记忆读取失败");
        setPhase("error");
      }
    },
    [api, projectId, publishCounts],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    setBusyId("");
    setFlagEntryId("");
    setFlagNote("");
    setFlaggedIds([]);
    setServerCanWrite(null);
    setQuery("");
    setSelectedId("");
    setStatusFilter(DEFAULT_STATUS_FILTER);
    setSubjectFilter([]);
    setMemberFilter("");
    setPendingAction(null);
  }, [projectId]);

  const entries = useMemo(
    () =>
      (Array.isArray(data?.entries) ? data.entries : [])
        .filter((entry) => Boolean(entry) && typeof entry.id === "string")
        .slice()
        .sort((left, right) => timeOf(right.updatedAt) - timeOf(left.updatedAt)),
    [data],
  );
  const members = useMemo(
    () => (Array.isArray(data?.members) ? data.members : []).filter((item) => item?.id),
    [data],
  );
  const timeline = useMemo(
    () =>
      (Array.isArray(data?.timeline) ? data.timeline : []).filter(
        (card) => Boolean(card) && typeof card.iterationId === "string",
      ),
    [data],
  );
  /* 条目没有迭代外键，靠时间线卡的 pageIds 反查它属于哪一轮。 */
  const iterationByEntry = useMemo(() => {
    const map = new Map<string, MemoryTimelineCard>();
    for (const card of timeline) {
      for (const pageId of card.pageIds || []) if (!map.has(pageId)) map.set(pageId, card);
    }
    return map;
  }, [timeline]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return entries.filter((entry) => {
      /* 状态复选框与搜索词同时生效（AND）。 */
      if (!statusFilter.includes(entry.status || "draft")) return false;
      if (subjectFilter.length && !subjectFilter.includes(entry.subject || "")) return false;
      if (memberFilter && entry.aboutUserId !== memberFilter) return false;
      if (!keyword) return true;
      return [entry.title || "", KIND_LABEL[entry.kind || ""] || "", entry.kind || ""].some(
        (value) => value.toLowerCase().includes(keyword),
      );
    });
  }, [entries, query, statusFilter, subjectFilter, memberFilter]);

  /* 引用进来时聚焦单条详情：同一次打开只自动弹出一次，手动关掉详情不再弹。
     focusId 清空（关掉整个记忆弹窗）时重置去重，保证再点同一条引用能重新打开。 */
  useEffect(() => {
    if (!focusId) {
      appliedFocus.current = "";
      return;
    }
    if (appliedFocus.current === focusId) return;
    if (!entries.some((entry) => entry.id === focusId)) return;
    appliedFocus.current = focusId;
    setSelectedId(focusId);
  }, [focusId, entries]);

  const toggleStatusFilter = (status: string) => {
    setStatusFilter((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status],
    );
  };

  const guideText = typeof data?.guide?.text === "string" ? data.guide.text.trim() : "";
  const guideSource = data?.guide?.basedOn?.title || "";
  const guideMeta = [
    guideSource ? `来源迭代「${guideSource}」` : "",
    data?.guide?.updatedAt ? `更新于 ${agoOf(data.guide.updatedAt)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const signals = [
    counts.drafts ? { key: "draft", label: `待确认 ${counts.drafts}` } : null,
    counts.disputes ? { key: "dispute", label: `待裁决 ${counts.disputes}` } : null,
    counts.updatedSinceEntry
      ? { key: "updated", label: `进入后更新 ${counts.updatedSinceEntry}` }
      : null,
  ].filter((item): item is { key: string; label: string } => Boolean(item));

  const refreshGuide = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await api(`/projects/${projectId}/memory/refresh`, undefined, "POST");
      showTip("已交给老翁整理，整理完成后重新打开可见最新记忆");
      await load(undefined, true);
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "刷新失败，请稍后重试", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const jobRunPath: Record<string, string> = useMemo(
    () => ({
      member_memory: "member-memory",
      document_memory: "document-memory",
      project_memory: "memory/refresh",
    }),
    [],
  );

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsError("");
    try {
      setJobs(await api(`/projects/${projectId}/memory/jobs`));
    } catch (cause) {
      setJobsError(cause instanceof Error ? cause.message : "记忆作业读取失败");
    } finally {
      setJobsLoading(false);
    }
  }, [api, projectId]);

  useEffect(() => {
    if (phase === "ready") void loadJobs();
  }, [phase, loadJobs]);

  const backfillMemory = async () => {
    if (backfilling) return;
    setBackfilling(true);
    try {
      const result = await api(`/projects/${projectId}/memory/backfill`, {}, "POST");
      showTip(
        `回填完成：发言 ${result?.utterancePages || 0}、文档 ${result?.documentPages || 0}、任务 ${result?.taskPages || 0}、讨论 ${result?.discussionPages || 0}`,
      );
      await Promise.all([load(), loadJobs()]);
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "回填失败", "error");
    } finally {
      setBackfilling(false);
    }
  };

  const saveJobSettings = async () => {
    if (!editingJob || savingJob) return;
    setSavingJob(editingJob.key);
    try {
      await api(
        `/projects/${projectId}/memory/jobs/${editingJob.key}`,
        {
          enabled: editingJob.enabled,
          triggerThreshold: editingJob.threshold === "" ? null : Number(editingJob.threshold),
          prompt: editingJob.prompt,
        },
        "PATCH",
      );
      showTip("口径已保存");
      setEditingJob(null);
      await loadJobs();
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "保存失败，请稍后重试", "error");
    } finally {
      setSavingJob("");
    }
  };

  const resetJobSettings = async (key: string) => {
    if (savingJob) return;
    setSavingJob(key);
    try {
      await api(`/projects/${projectId}/memory/jobs/${key}`, undefined, "DELETE");
      showTip("已回滚到默认口径");
      setEditingJob(null);
      await loadJobs();
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "回滚失败，请稍后重试", "error");
    } finally {
      setSavingJob("");
    }
  };

  const retryJob = async (job: MemoryJob) => {
    if (runningJob) return;
    setRunningJob(job.key);
    try {
      await api(`/projects/${projectId}/memory/jobs/${job.key}/retry`, undefined, "POST");
      showTip(`已重新排队「${job.label}」`);
      await loadJobs();
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "重试失败，请稍后重试", "error");
    } finally {
      setRunningJob("");
    }
  };

  const createRelation = async (input: {
    fromPageId: string;
    toPageId: string;
    relation: string;
    note: string;
  }) => {
    try {
      await api(`/projects/${projectId}/memory/relations`, input, "POST");
      showTip("关系已建立");
      await load();
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "建立关系失败", "error");
    }
  };

  const deleteRelation = async (relationId: string) => {
    try {
      await api(`/projects/${projectId}/memory/relations/${relationId}`, undefined, "DELETE");
      showTip("关系已删除");
      await load();
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "删除关系失败", "error");
    }
  };

  const changeSubject = async (entryId: string, subject: string | null) => {
    try {
      await api(`/projects/${projectId}/memory/entries/${entryId}`, { subject }, "PATCH");
      showTip("对象类型已更新");
      await load();
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "更新对象类型失败", "error");
    }
  };

  const runDiscussionJob = async (job: MemoryJob) => {
    if (runningJob || !job.archivedThread) return;
    setRunningJob(job.key);
    try {
      await api(`/projects/${projectId}/memory/discussion/${job.archivedThread.id}`, {}, "POST");
      showTip("已补跑最近归档迭代的讨论记忆");
      await Promise.all([loadJobs(), load()]);
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "补跑失败，请稍后重试", "error");
    } finally {
      setRunningJob("");
    }
  };

  const runJob = async (job: MemoryJob) => {
    const path = jobRunPath[job.key];
    if (!path || runningJob) return;
    setRunningJob(job.key);
    try {
      await api(`/projects/${projectId}/${path}`, undefined, "POST");
      showTip(`已交给老翁执行「${job.label}」`);
      await loadJobs();
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "提交失败，请稍后重试", "error");
    } finally {
      setRunningJob("");
    }
  };

  const confirmEntry = async (entry: MemoryEntry) => {
    if (!editable || busyId) return false;
    setBusyId(entry.id);
    try {
      const response = await api(
        `/projects/${projectId}/memory/entries/${entry.id}/confirm`,
        undefined,
        "POST",
      );
      const payload: { id?: string; entry?: MemoryEntry; counts?: unknown } =
        response && typeof response === "object" ? response : {};
      const updated = payload.entry || (payload.id ? (response as MemoryEntry) : null);
      setData((previous) =>
        previous
          ? {
              ...previous,
              entries: (previous.entries || []).map((item) =>
                item.id === entry.id
                  ? { ...item, ...(updated || {}), status: updated?.status || "current" }
                  : item,
              ),
            }
          : previous,
      );
      publishCounts(
        normalizeCounts(payload.counts) ?? {
          ...counts,
          drafts: Math.max(0, counts.drafts - 1),
        },
      );
      showTip("已确认，这条记忆开始作为现行结论");
      return true;
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "确认失败，请稍后重试", "error");
      return false;
    } finally {
      setBusyId("");
    }
  };

  const submitFlag = async (entry: MemoryEntry) => {
    const note = flagNote.trim();
    if (!editable || !note || busyId) return false;
    setBusyId(entry.id);
    try {
      const response = await api(
        `/projects/${projectId}/memory/entries/${entry.id}/flag`,
        { note },
        "POST",
      );
      const payload: { counts?: unknown } =
        response && typeof response === "object" ? response : {};
      /* 接口只把条目标成争议并回带备注，正文不改；这里同步成「有争议」徽标。 */
      setData((previous) =>
        previous
          ? {
              ...previous,
              entries: (previous.entries || []).map((item) =>
                item.id === entry.id
                  ? { ...item, ...(payload as MemoryEntry), disputed: true }
                  : item,
              ),
            }
          : previous,
      );
      setFlaggedIds((current) => (current.includes(entry.id) ? current : [...current, entry.id]));
      setFlagEntryId("");
      setFlagNote("");
      publishCounts(
        normalizeCounts(payload.counts) ?? { ...counts, disputes: counts.disputes + 1 },
      );
      showTip("纠错已提交，老翁下次结算会参考这条备注");
      return true;
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "纠错提交失败，请稍后重试", "error");
      return false;
    } finally {
      setBusyId("");
    }
  };

  /* 二次确认后才真正调接口；成功与失败都关掉确认弹窗（失败已由各 handler showTip）。 */
  const pendingBusyRef = useRef(false);
  const runPendingAction = async () => {
    const pending = pendingAction;
    if (!pending || busyId || pendingBusyRef.current) return;
    pendingBusyRef.current = true;
    try {
      if (pending.kind === "confirm") await confirmEntry(pending.entry);
      else await submitFlag(pending.entry);
    } finally {
      pendingBusyRef.current = false;
      setPendingAction(null);
    }
  };

  const selected = selectedId ? entries.find((entry) => entry.id === selectedId) || null : null;
  const selectedDisputed =
    Boolean(selected?.disputed) || (selected ? flaggedIds.includes(selected.id) : false);

  return (
    <>
      <Dialog
        onRequestClose={onClose}
        ref={dialog}
        className="project-memory-dialog dialog-fullscreen"
        aria-labelledby="project-memory-title"
      >
        <DialogHeader
          title={<>项目记忆</>}
          titleId="project-memory-title"
          icon={<UiIcon name="book" size={16} />}
          subtitle={<>老翁整理 · 人确认与纠错</>}
          onClose={() => animateDialogClose(dialog.current, onClose)}
          closeLabel="关闭项目记忆"
          fullscreen={true}
        />
        <div className="project-memory-body">
          {phase === "error" ? (
            <div className="project-memory-error" role="alert">
              <p>项目记忆还没能读出来：{error || "接口暂时不可用"}</p>
              <button type="button" className="wiki-action" onClick={() => void load()}>
                <UiIcon name="refresh" size={12} />
                重试
              </button>
            </div>
          ) : phase === "loading" ? (
            <p className="project-memory-state" role="status" aria-live="polite">
              正在读取项目记忆…
            </p>
          ) : (
            <>
              <section className="project-memory-main" aria-labelledby="project-memory-guide">
                <div className="project-memory-guide-head">
                  <h3 className="project-memory-section-title" id="project-memory-guide">
                    导读
                  </h3>
                  {signals.length ? (
                    <p className="project-memory-signals">
                      {signals.map((signal) => (
                        <span
                          key={signal.key}
                          className="project-memory-signal"
                          data-kind={signal.key}
                        >
                          {signal.label}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="wiki-action project-memory-refresh"
                    disabled={refreshing}
                    onClick={() => void refreshGuide()}
                  >
                    <UiIcon name="refresh" size={12} />
                    {refreshing ? "提交中…" : "让老翁刷新"}
                  </button>
                </div>
                {guideMeta ? <p className="project-memory-guide-meta">{guideMeta}</p> : null}
                {guideText ? (
                  <div className="project-memory-guide">
                    <MarkdownDocumentPreview
                      mode="preview"
                      text={guideText}
                      selected={null}
                      nativeSourceFrame={null}
                    />
                  </div>
                ) : (
                  <p className="project-memory-state">
                    老翁还没整理出导读。积累一轮迭代讨论或归档后，这里会先给出结论。
                  </p>
                )}
                <p className="project-memory-guide-hint">
                  导读取自最近一轮归档的结论。右侧时间轴列出全部记忆条目，点一条看正文、出处和所属迭代。
                </p>
                <div className="project-memory-jobs">
                  <div className="project-memory-guide-head">
                    <h3 className="project-memory-section-title">记忆作业</h3>
                    <button
                      type="button"
                      className="wiki-action project-memory-refresh"
                      disabled={jobsLoading}
                      onClick={() => void loadJobs()}
                    >
                      <UiIcon name="refresh" size={12} />
                      {jobsLoading ? "读取中…" : "刷新"}
                    </button>
                    <button
                      type="button"
                      className="wiki-action"
                      disabled={backfilling}
                      onClick={() => void backfillMemory()}
                    >
                      {backfilling ? "回填中…" : "回填历史"}
                    </button>
                  </div>
                  {jobs.length ? (
                    <ul className="memory-job-list">
                      {jobs.map((job) => (
                        <li
                          key={job.key}
                          className="memory-job"
                          data-enabled={job.enabled === false ? "false" : "true"}
                        >
                          <details>
                            <summary>
                              <strong>{job.label}</strong>
                              {job.enabled === false ? (
                                <small className="memory-job-off">已停用</small>
                              ) : null}
                              <small>
                                {job.backlog == null ? job.backlogNote : `积压 ${job.backlog}`}
                              </small>
                              {job.promptOverridden ? <small>口径已改</small> : null}
                              <span data-run={job.lastRun?.status || "never"}>
                                {job.lastRun
                                  ? `${job.lastRun.status || "未知"}${job.lastRun.createdAt ? " · " + relativeActivity(job.lastRun.createdAt, Date.now()) : ""}`
                                  : "从未运行"}
                              </span>
                            </summary>
                            <dl className="memory-job-detail">
                              <dt>触发</dt>
                              <dd>{job.trigger}</dd>
                              <dt>完成标准</dt>
                              <dd>{job.completion}</dd>
                              <dt>失败补救</dt>
                              <dd>{job.failure}</dd>
                              <dt>可用工具</dt>
                              <dd>{job.tools.join("、")}</dd>
                              <dt>提示词</dt>
                              <dd>{job.prompt}</dd>
                            </dl>
                            {editingJob?.key === job.key ? (
                              <div className="memory-job-edit">
                                <label className="memory-job-toggle">
                                  <input
                                    type="checkbox"
                                    checked={editingJob.enabled}
                                    onChange={(event) =>
                                      setEditingJob({
                                        ...editingJob,
                                        enabled: event.target.checked,
                                      })
                                    }
                                  />
                                  启用
                                </label>
                                <TextField
                                  containerClassName="memory-job-threshold"
                                  label="触发阈值"
                                  type="number"
                                  min={0}
                                  max={1000}
                                  flush
                                  value={editingJob.threshold}
                                  onChange={(event) =>
                                    setEditingJob({ ...editingJob, threshold: event.target.value })
                                  }
                                />
                                <TextAreaField
                                  containerClassName="memory-job-prompt"
                                  label="提示词覆盖"
                                  rows={4}
                                  dense
                                  value={editingJob.prompt}
                                  placeholder="留空表示使用默认提示词"
                                  onChange={(event) =>
                                    setEditingJob({ ...editingJob, prompt: event.target.value })
                                  }
                                />
                                <div className="memory-job-edit-actions">
                                  <button
                                    type="button"
                                    className="wiki-action"
                                    disabled={savingJob !== ""}
                                    onClick={() => void saveJobSettings()}
                                  >
                                    {savingJob === job.key ? "保存中…" : "保存"}
                                  </button>
                                  <button
                                    type="button"
                                    className="wiki-action"
                                    disabled={savingJob !== ""}
                                    onClick={() => void resetJobSettings(job.key)}
                                  >
                                    回滚默认
                                  </button>
                                  <button
                                    type="button"
                                    className="wiki-action"
                                    onClick={() => setEditingJob(null)}
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="memory-job-edit-actions">
                                <button
                                  type="button"
                                  className="wiki-action"
                                  onClick={() =>
                                    setEditingJob({
                                      key: job.key,
                                      enabled: job.enabled !== false,
                                      threshold:
                                        job.triggerThreshold == null
                                          ? ""
                                          : String(job.triggerThreshold),
                                      prompt: job.promptOverridden ? job.prompt : "",
                                    })
                                  }
                                >
                                  调整口径
                                </button>
                                <button
                                  type="button"
                                  className="wiki-action"
                                  disabled={runningJob !== "" || !jobRunPath[job.key]}
                                  onClick={() => void runJob(job)}
                                >
                                  {jobRunPath[job.key]
                                    ? runningJob === job.key
                                      ? "提交中…"
                                      : "立即运行"
                                    : "随结算触发"}
                                </button>
                                {job.key === "discussion_memory" ? (
                                  <button
                                    type="button"
                                    className="wiki-action"
                                    disabled={runningJob !== "" || !job.archivedThread}
                                    onClick={() => void runDiscussionJob(job)}
                                  >
                                    {job.archivedThread ? "补跑最近归档迭代" : "暂无已归档迭代"}
                                  </button>
                                ) : null}
                                {[
                                  "member_memory",
                                  "document_memory",
                                  "iteration_archive",
                                  "project_memory",
                                ].includes(job.key) ? (
                                  <>
                                    <button
                                      type="button"
                                      className="wiki-action"
                                      onClick={() =>
                                        setLogScope({
                                          type: "project",
                                          id: projectId,
                                          task: job.key,
                                        })
                                      }
                                    >
                                      轨迹
                                    </button>
                                    <button
                                      type="button"
                                      className="wiki-action"
                                      onClick={() => setHistoryJob(job)}
                                    >
                                      历史记录
                                    </button>
                                    <button
                                      type="button"
                                      className="wiki-action"
                                      disabled={runningJob !== ""}
                                      onClick={() => setSessionJob(job)}
                                    >
                                      会话
                                    </button>
                                  </>
                                ) : null}
                                {job.lastRun?.status === "failed" ? (
                                  <button
                                    type="button"
                                    className="wiki-action"
                                    disabled={runningJob !== "" || !jobRunPath[job.key]}
                                    onClick={() => void retryJob(job)}
                                  >
                                    重试失败运行
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </details>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="project-memory-state">{jobsError || "正在读取记忆作业…"}</p>
                  )}
                </div>
              </section>
              <aside className="project-memory-side" aria-labelledby="project-memory-timeline">
                <div className="project-memory-side-head">
                  <h3 className="project-memory-section-title" id="project-memory-timeline">
                    时间轴
                  </h3>
                  <small>
                    {filtered.length} / {entries.length}
                  </small>
                </div>
                <div className="project-memory-filters" role="group" aria-label="按状态筛选">
                  {STATUS_KEYS.map((status) => (
                    <label key={status} className="project-memory-filter" data-status={status}>
                      <input
                        type="checkbox"
                        checked={statusFilter.includes(status)}
                        onChange={() => toggleStatusFilter(status)}
                      />
                      <span>{STATUS_LABEL[status]}</span>
                    </label>
                  ))}
                </div>
                <div className="project-memory-filters" role="group" aria-label="按记忆类型筛选">
                  {[...SUBJECT_KEYS, ""].map((subject) => (
                    <label key={subject} className="project-memory-filter" data-subject={subject}>
                      <input
                        type="checkbox"
                        checked={subjectFilter.includes(subject)}
                        onChange={() =>
                          setSubjectFilter((current) =>
                            current.includes(subject)
                              ? current.filter((value) => value !== subject)
                              : [...current, subject],
                          )
                        }
                      />
                      <span>{SUBJECT_LABEL[subject] || "未分类"}</span>
                    </label>
                  ))}
                </div>
                {members.length ? (
                  <select
                    className="project-memory-member-filter"
                    aria-label="按成员查看发言记忆"
                    value={memberFilter}
                    onChange={(event) => setMemberFilter(event.target.value)}
                  >
                    <option value="">全部成员</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name || member.id}
                      </option>
                    ))}
                  </select>
                ) : null}
                <TextField
                  dense
                  icon={<UiIcon name="search" size={13} />}
                  containerClassName="project-memory-search"
                  value={query}
                  aria-label="搜索记忆条目"
                  placeholder="搜索标题或类型"
                  onChange={(event) => setQuery(event.target.value)}
                />
                {filtered.length ? (
                  <ul className="project-memory-list">
                    {filtered.map((entry) => {
                      const status = entry.status || "draft";
                      const disputed = Boolean(entry.disputed) || flaggedIds.includes(entry.id);
                      return (
                        <li key={entry.id} className="project-memory-node">
                          <span className="project-memory-spine" aria-hidden="true">
                            <span
                              className="project-memory-status-dot"
                              data-status={status}
                              data-disputed={disputed ? "true" : undefined}
                              title={`${STATUS_LABEL[status] || status}${disputed ? " · 有争议" : ""}`}
                            />
                          </span>
                          <button
                            type="button"
                            className={`project-memory-row${selectedId === entry.id ? " is-selected" : ""}`}
                            title={entry.title || "未命名条目"}
                            onClick={() => setSelectedId(entry.id)}
                          >
                            <span className="project-memory-row-meta">
                              <span className="project-memory-row-time">
                                {stampOf(entry.updatedAt) || "时间未知"}
                              </span>
                              <span className="wiki-kind">
                                {KIND_LABEL[entry.kind || ""] || entry.kind || "条目"}
                              </span>
                              <span className="project-memory-row-state" data-status={status}>
                                {STATUS_LABEL[status] || status}
                              </span>
                            </span>
                            <span className="project-memory-row-title">
                              {entry.title || "未命名条目"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="project-memory-state">
                    {entries.length
                      ? "当前筛选下没有条目，换个状态或关键词试试。"
                      : "还没有沉淀出记忆条目。日常结算会先生成草稿，确认后成为现行结论。"}
                  </p>
                )}
                {!editable ? (
                  <p className="project-memory-readonly">
                    {frozen ? "项目已归档，项目记忆已封存，只能查看。" : "只读成员只能查看。"}
                  </p>
                ) : null}
              </aside>
            </>
          )}
        </div>
      </Dialog>
      {selected ? (
        <MemoryDetail
          entry={selected}
          iteration={iterationByEntry.get(selected.id) || null}
          editable={editable}
          entries={entries}
          canWrite={editable}
          onCreateRelation={createRelation}
          onDeleteRelation={deleteRelation}
          onChangeSubject={changeSubject}
          busy={busyId === selected.id}
          disputed={selectedDisputed}
          flagOpen={flagEntryId === selected.id}
          flagNote={flagNote}
          onFlagNote={setFlagNote}
          onOpenFlag={() => {
            setFlagEntryId(selected.id);
            setFlagNote("");
          }}
          onCancelFlag={() => {
            setFlagEntryId("");
            setFlagNote("");
          }}
          onSubmitFlag={() => setPendingAction({ kind: "flag", entry: selected })}
          onConfirm={() => setPendingAction({ kind: "confirm", entry: selected })}
          onClose={() => setSelectedId("")}
        />
      ) : null}
      {logScope ? (
        <AgentLogDialog scope={logScope} api={api} onClose={() => setLogScope(null)} />
      ) : null}
      {historyJob ? (
        <LaowengHistoryDialog
          title={historyJob.label}
          empty="还没有运行记录。"
          columns={LAOWENG_RUN_COLUMNS}
          rows={laowengRunRows(historyJob.recentRuns, " 项")}
          onClose={() => setHistoryJob(null)}
        />
      ) : null}
      {sessionJob ? (
        <TaskSessionDialog
          kicker="维护会话"
          title={sessionJob.label}
          emptyIdle="这个维护 Agent 还没有会话内容。"
          roleLabel={(role) =>
            role === "assistant" ? "维护 Agent" : role === "system" ? "系统" : "任务输入"
          }
          path={`/projects/${projectId}/laoweng-sessions/${sessionJob.key}`}
          compactPath={`/projects/${projectId}/laoweng-context/compact`}
          compactBody={{ task: sessionJob.key }}
          api={api}
          onClose={() => setSessionJob(null)}
        />
      ) : null}
      {pendingAction ? (
        <MemoryActionConfirm
          kind={pendingAction.kind}
          name={pendingAction.entry.title || ""}
          note={pendingAction.kind === "flag" ? flagNote.trim() : ""}
          busy={busyId === pendingAction.entry.id}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void runPendingAction()}
        />
      ) : null}
    </>
  );
}

/** 二级弹窗：单条记忆的正文、出处、所属迭代与确认/纠错。 */
function MemoryDetail({
  entry,
  iteration,
  editable,
  entries,
  canWrite,
  onCreateRelation,
  onDeleteRelation,
  onChangeSubject,
  busy,
  disputed,
  flagOpen,
  flagNote,
  onFlagNote,
  onOpenFlag,
  onCancelFlag,
  onSubmitFlag,
  onConfirm,
  onClose,
}: {
  entry: MemoryEntry;
  iteration: MemoryTimelineCard | null;
  editable: boolean;
  entries: MemoryEntry[];
  canWrite: boolean;
  onCreateRelation: (input: {
    fromPageId: string;
    toPageId: string;
    relation: string;
    note: string;
  }) => Promise<void>;
  onDeleteRelation: (relationId: string) => Promise<void>;
  onChangeSubject: (entryId: string, subject: string | null) => Promise<void>;
  busy: boolean;
  disputed: boolean;
  flagOpen: boolean;
  flagNote: string;
  onFlagNote: (value: string) => void;
  onOpenFlag: () => void;
  onCancelFlag: () => void;
  onSubmitFlag: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const status = entry.status || "draft";
  const statusLabel = STATUS_LABEL[status] || status;
  const kindLabel = KIND_LABEL[entry.kind || ""] || entry.kind || "记忆条目";
  const sources = (entry.sources || []).filter((source) => source?.label);
  const relations = entry.relations || [];
  const [relationKind, setRelationKind] = useState("relates");
  const [relationTarget, setRelationTarget] = useState("");
  const [relationNote, setRelationNote] = useState("");
  const [relationOpen, setRelationOpen] = useState(false);
  const [relationBusy, setRelationBusy] = useState(false);
  const decisions = iteration?.taskDecisions || [];

  return (
    <Dialog
      onRequestClose={onClose}
      ref={dialog}
      className="project-memory-detail-dialog"
      aria-labelledby="project-memory-detail-title"
      style={{ width: "min(880px, 92vw)", maxHeight: "min(86vh, 900px)" }}
    >
      <DialogHeader
        title={entry.title || "记忆详情"}
        titleId="project-memory-detail-title"
        subtitle={
          <span className="project-memory-detail-meta">
            <span className="wiki-kind">{kindLabel}</span>
            {canWrite ? (
              <SelectField
                containerClassName="project-memory-subject-select"
                aria-label="记忆对象类型"
                flush
                value={entry.subject || ""}
                options={[
                  { value: "", label: "未分类" },
                  ...SUBJECT_KEYS.map((subject) => ({
                    value: subject,
                    label: SUBJECT_LABEL[subject],
                  })),
                ]}
                onChange={(value) => void onChangeSubject(entry.id, value || null)}
              />
            ) : entry.subject ? (
              <span className="wiki-kind">{SUBJECT_LABEL[entry.subject] || entry.subject}</span>
            ) : null}
            <span className="wiki-status" data-status={status}>
              {statusLabel}
            </span>
            {disputed ? (
              <span
                className="project-memory-dispute-badge"
                title="老翁标了争议，等人裁决后再改结论"
              >
                有争议
              </span>
            ) : null}
            <span>{entry.updatedAt ? `${agoOf(entry.updatedAt)}更新` : "时间未知"}</span>
          </span>
        }
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭记忆详情"
        fullscreen={true}
      />
      <div className="project-memory-detail-body">
        <section className="project-memory-detail-card" aria-label="所属迭代">
          <h4 className="project-memory-detail-card-title">所属迭代</h4>
          {iteration ? (
            <>
              <p className="project-memory-detail-iteration-head">
                {iteration.title || "未命名迭代"}
                {iteration.archivedAt ? ` · 归档于 ${agoOf(iteration.archivedAt)}` : ""}
              </p>
              {iteration.conclusion ? (
                <p className="project-memory-detail-quote">{iteration.conclusion}</p>
              ) : (
                <p className="project-memory-detail-muted">这一轮没有留下结论。</p>
              )}
              {decisions.length ? (
                <ul className="project-memory-detail-decisions">
                  {decisions.slice(0, 4).map((decision, index) => (
                    <li key={decision.taskId || index} title={decision.reason || undefined}>
                      <span className="project-memory-detail-decision-title">
                        {decision.title || "未命名任务"}
                      </span>
                      <span className="project-memory-detail-sep">·</span>
                      <span>{decision.disposition || "未记录去向"}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {decisions.length > 4 ? (
                <p className="project-memory-detail-muted">另 {decisions.length - 4} 项任务去向</p>
              ) : null}
            </>
          ) : (
            <p className="project-memory-detail-muted">这条记忆还没有关联到某一轮归档迭代。</p>
          )}
        </section>
        <section className="project-memory-detail-card" aria-label="出处">
          <h4 className="project-memory-detail-card-title">出处</h4>
          {sources.length ? (
            <ul className="project-memory-detail-sources">
              {sources.map((source, index) => (
                <li key={source.sourceId || index}>
                  <span className="project-memory-source-chip">
                    {SOURCE_LABEL[source.sourceKind || ""] || source.sourceKind || "来源"}
                  </span>
                  <span className="project-memory-source-label">{source.label || ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="project-memory-detail-muted">还没有登记出处。</p>
          )}
        </section>
        <section className="project-memory-detail-card" aria-label="关系">
          <h4 className="project-memory-detail-card-title">关系</h4>
          {relations.length ? (
            <ul className="project-memory-relations">
              {relations.map((relation) => (
                <li key={relation.id}>
                  <span
                    className="project-memory-relation-chip"
                    data-relation={relation.relation || ""}
                  >
                    {RELATION_LABEL[relation.relation || ""] || relation.relation || "关联"}
                  </span>
                  <span className="project-memory-relation-dir">
                    {relation.direction === "out" ? "指向" : "来自"}
                  </span>
                  <span className="project-memory-relation-target">
                    {relation.otherTitle || relation.otherPageId || "未命名"}
                  </span>
                  {relation.note ? (
                    <span className="project-memory-detail-muted">{relation.note}</span>
                  ) : null}
                  {canWrite ? (
                    <button
                      type="button"
                      className="project-memory-relation-remove"
                      title="删除这条关系"
                      onClick={() => void onDeleteRelation(relation.id)}
                    >
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="project-memory-detail-muted">还没有关联其他记忆。</p>
          )}
          {canWrite ? (
            relationOpen ? (
              <div className="project-memory-relation-form">
                <SelectField
                  aria-label="关系类型"
                  flush
                  value={relationKind}
                  options={[
                    { value: "relates", label: "关联" },
                    { value: "derives", label: "继承" },
                    { value: "supersedes", label: "替代" },
                  ]}
                  onChange={setRelationKind}
                />
                <SelectField
                  aria-label="关联到哪条记忆"
                  flush
                  value={relationTarget}
                  options={[
                    { value: "", label: "选择另一条记忆" },
                    ...entries
                      .filter((item) => item.id !== entry.id)
                      .map((item) => ({
                        value: item.id,
                        label:
                          (SUBJECT_LABEL[item.subject || ""] || "未分类") +
                          " · " +
                          (item.title || item.id),
                      })),
                  ]}
                  onChange={setRelationTarget}
                />
                <TextField
                  containerClassName="project-memory-relation-note"
                  aria-label="关系备注"
                  flush
                  value={relationNote}
                  placeholder="备注（可选）"
                  onChange={(event) => setRelationNote(event.target.value)}
                />
                <button
                  type="button"
                  className="wiki-action"
                  disabled={!relationTarget || relationBusy}
                  onClick={async () => {
                    setRelationBusy(true);
                    await onCreateRelation({
                      fromPageId: entry.id,
                      toPageId: relationTarget,
                      relation: relationKind,
                      note: relationNote.trim(),
                    });
                    setRelationBusy(false);
                    setRelationOpen(false);
                    setRelationTarget("");
                    setRelationNote("");
                  }}
                >
                  {relationBusy ? "建立中…" : "建立"}
                </button>
                <button
                  type="button"
                  className="wiki-action"
                  onClick={() => setRelationOpen(false)}
                >
                  取消
                </button>
              </div>
            ) : (
              <button type="button" className="wiki-action" onClick={() => setRelationOpen(true)}>
                添加关系
              </button>
            )
          ) : null}
        </section>
        <div className="project-memory-detail-text">
          {entry.body ? (
            <MarkdownDocumentPreview
              mode="preview"
              text={entry.body}
              selected={null}
              nativeSourceFrame={null}
            />
          ) : (
            <p className="project-memory-detail-muted">这条记忆还没有正文。</p>
          )}
        </div>
        {flagOpen ? (
          <form
            className="project-memory-flag-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitFlag();
            }}
          >
            <TextAreaField
              label="纠错备注"
              rows={3}
              maxLength={500}
              value={flagNote}
              disabled={busy}
              placeholder="哪里不对？老翁下次结算会参考这条备注。"
              onChange={(event) => onFlagNote(event.target.value)}
            />
            <div className="project-memory-flag-actions">
              <button type="button" className="wiki-action" onClick={onCancelFlag}>
                取消
              </button>
              <button
                type="submit"
                className="wiki-action primary"
                disabled={!flagNote.trim() || busy}
              >
                提交纠错
              </button>
            </div>
          </form>
        ) : null}
      </div>
      {editable && (status === "draft" || (!disputed && status !== "superseded")) ? (
        <div className="project-memory-detail-actions">
          {!disputed && status !== "superseded" && !flagOpen ? (
            <button type="button" className="wiki-action" disabled={busy} onClick={onOpenFlag}>
              <UiIcon name="edit" size={12} />
              纠错
            </button>
          ) : null}
          {status === "draft" ? (
            <button
              type="button"
              className="wiki-action primary"
              disabled={busy}
              onClick={onConfirm}
            >
              <UiIcon name="check" size={12} />
              确认这条记忆
            </button>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/** 二次确认小弹窗：确认记忆 / 提交纠错前先确认，执行期间禁用按钮。 */
function MemoryActionConfirm({
  kind,
  name,
  note,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: "confirm" | "flag";
  name: string;
  note: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const confirming = kind === "confirm";

  return (
    <Dialog
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
      ref={dialog}
      className="project-memory-confirm-dialog"
      aria-labelledby="project-memory-confirm-title"
      style={{ width: "min(420px, 92vw)" }}
    >
      <DialogHeader
        title={confirming ? "确认这条记忆？" : "提交纠错？"}
        titleId="project-memory-confirm-title"
        onClose={() => animateDialogClose(dialog.current, onCancel)}
        closeLabel="关闭确认"
        fullscreen={false}
        disabled={busy}
      />
      <div className="project-memory-confirm-body">
        {name ? <p className="project-memory-confirm-name">{name}</p> : null}
        <p className="project-memory-confirm-text">
          {confirming
            ? "确认后这条记忆会转为现行，问老翁时会被用来回答。"
            : "纠错会把它标成待裁决，老翁下次结算会参考这条备注。"}
        </p>
        {!confirming && note ? <p className="project-memory-confirm-note">{note}</p> : null}
      </div>
      <div className="project-memory-confirm-actions">
        <button type="button" className="wiki-action" disabled={busy} onClick={onCancel}>
          取消
        </button>
        <button type="button" className="wiki-action primary" disabled={busy} onClick={onConfirm}>
          {busy ? "处理中…" : "确定"}
        </button>
      </div>
    </Dialog>
  );
}
