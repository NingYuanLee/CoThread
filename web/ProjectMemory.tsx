/**
 * 项目记忆：六四布局弹窗。左栏导读（Markdown），右栏可搜索的记忆时间轴；
 * 单条记忆点开二级详情弹窗看正文、出处、所属迭代与确认/纠错。
 * 数据契约见 docs/engineering/12-project-memory.md §3.1。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DialogFilters } from "./DialogFilters";
import { DialogFooter } from "./DialogFooter";
import { PaginationControl } from "./PaginationControl";
import { DialogHeader } from "./DialogHeader";
import { Field } from "./Field";
import { MarkdownDocumentPreview } from "./MarkdownDocumentPreview";
import { SelectField } from "./SelectField";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";
import { animateDialogClose, Dialog } from "./dialog-fx";
import { showTip } from "./Tip";
import { UiIcon } from "./ui-icon";
import { localDate, relativeActivity } from "./workspace-format";
import { DocumentChangeDateRangePicker } from "./DocumentChangeDateRangePicker";
import { LaowengHistoryDialog } from "./agent-monitor-history";
import {
  LAOWENG_RUN_COLUMNS,
  fullTime,
  laowengRunRows,
  runStatusLabel,
} from "./agent-monitor-model";
import { MemoryJobSessionDialog } from "./MemoryJobSessionDialog";
import { MemoryObservations } from "./MemoryObservations";
import { IconButton, RefreshButton } from "./IconButton";
import type { LaowengRun } from "./agent-monitor-types";
import { SlideSwitch } from "./SlideSwitch";
import { MemoryHistoryPanel } from "./MemoryHistoryPanel";

export type MemoryCounts = { disputes: number; updatedSinceEntry: number; entries?: number };

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
  title?: string;
  body?: string;
  status?: string;
  sourceFamily?: string | null;
  updatedAt?: string | null;
  createdBy?: string;
  /** 老翁标了未裁决的争议（服务端由纠错日志推导）。 */
  disputed?: boolean;
  /** 五类记忆对象；历史条目可能为空。 */
  subject?: string | null;
  subtype?: string | null;
  aboutUserId?: string | null;
  relations?: MemoryRelation[];
  sources?: MemorySource[];
  sourceNeedsReview?: boolean;
  fileArtifactId?: string | null;
  fileGroup?: {
    id: string;
    evidence: string;
    origin: string;
    members: { artifactId: string; description?: string }[];
  } | null;
};
type MemoryEntryPage = {
  items?: MemoryEntry[];
  page?: number;
  total?: number;
  hasMore?: boolean;
};
/** 右侧时间线的分页状态：key 是「一级+二级+状态+关键词」组合，用来按条件复用已加载页。 */
type MemoryEntryList = {
  key: string;
  items: MemoryEntry[];
  page: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string;
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
  backlogDetail?: { statements?: number; discussions?: number; queued?: number } | null;
  lastRun?: MemoryJobRun | null;
  recentRuns?: LaowengRun[];
  fileCoverage?: {
    total: number;
    recognized: number;
    partial: number;
    unrecognized: number;
    pending: number;
  } | null;
  fileIssues?: {
    artifactId: string;
    title: string;
    filename: string;
    version: number;
    pageId?: string | null;
    recognitionStatus: string;
    recognitionNote?: string | null;
    availableAt?: string | null;
    pending?: boolean | number;
    processingState?: "processing" | "failed" | "pending" | "success" | null;
    operation?: "create" | "update" | null;
    triggerOrigin?: "discovery" | "manual" | "legacy" | null;
    summaryVersionId?: string | null;
    previousSummary?: string | null;
    previousSummaryVersion?: number | null;
    versionId?: string;
  }[];
  projectCandidates?: {
    id: string;
    sourceKind: string;
    hint: string;
    retryCount: number;
    lastError?: string | null;
    lastAttemptAt?: string | null;
    availableAt?: string | null;
  }[];
  archivedThread?: { id: string; title?: string } | null;
  conversationWindows?: {
    id: string;
    threadTitle: string;
    firstSequence: string;
    lastSequence: string;
    previousCompletedSequence?: string | null;
    statementStatus: string;
    discussionStatus: string;
    responseSaved: boolean;
    results: {
      id: string;
      kind: string;
      status: string;
      title: string;
      action: string;
      pageId?: string | null;
      error?: string | null;
    }[];
    attempts: number;
    invalidatedAt?: string | null;
    statementCount: number;
    discussionCount: number;
    lastAttemptAt?: string | null;
    error?: string | null;
  }[];
  observations?: {
    id: string;
    question: string;
    status: string;
    reviewAfter: string;
    reviewAttempts: number;
    reviewNote?: string | null;
  }[];
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
type MemoryEntryIdentity = {
  id: string;
  subject?: string | null;
  subtype?: string | null;
  title?: string;
  status?: string;
  updatedAt?: string | null;
  fileArtifactId?: string | null;
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
  /** 轻量条目索引：不含正文与出处；详情按条拉取。 */
  entryIndex?: MemoryEntryIdentity[] | null;
  entries?: MemoryEntry[] | null;
};
type MemoryApi = (
  path: string,
  data?: unknown,
  method?: string,
  signal?: AbortSignal,
) => Promise<any>;
function FileCoverageDialog({
  job,
  projectId,
  api,
  editable,
  runningJob,
  refreshVersion,
  onRetry,
  onOpen,
  onClose,
}: {
  job: MemoryJob;
  projectId: string;
  api: MemoryApi;
  editable: boolean;
  runningJob: string;
  refreshVersion: number;
  onRetry: (id: string) => Promise<void>;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [queue, setQueue] = useState("");
  const [filters, setFilters] = useState({ keyword: "", status: "", queue: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<NonNullable<MemoryJob["fileIssues"]>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...filters,
    });
    api(
      `/projects/${projectId}/memory/file-index/issues?${params}`,
      undefined,
      "GET",
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result.rows);
          setTotal(result.total);
          if (result.page !== page) setPage(result.page);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "文件列表读取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, projectId, page, pageSize, filters, revision, refreshVersion]);
  const coverage = job.fileCoverage;
  // 识别结果只表达内容结论；排队、处理中、处理出错都属于处理状态。
  const labels: Record<string, string> = {
    recognized: "识别完整",
    partial: "识别部分",
    unrecognized: "暂不支持",
    pending: "等待识别",
  };
  return (
    <Dialog
      ref={dialog}
      onRequestClose={onClose}
      className="l1-history-dialog dialog-list"
      aria-labelledby="file-coverage-title"
    >
      <DialogHeader
        title="文件索引"
        titleId="file-coverage-title"
        subtitle={
          coverage
            ? `当前可访问 ${coverage.total} 个 · 识别完整 ${coverage.recognized} · 识别部分 ${coverage.partial} · 暂不支持 ${coverage.unrecognized} · 等待识别 ${coverage.pending}`
            : undefined
        }
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭文件索引"
      />
      <DialogFilters
        label="文件筛选"
        keyword={{ value: keyword, onChange: setKeyword, placeholder: "搜索文件名或识别说明" }}
        onQuery={() => {
          setPage(1);
          setFilters({ keyword: keyword.trim(), status, queue });
        }}
        onReset={() => {
          setKeyword("");
          setStatus("");
          setQueue("");
          setPage(1);
          setFilters({ keyword: "", status: "", queue: "" });
        }}
      >
        <SelectField
          label="识别结果"
          value={status}
          onChange={setStatus}
          allOption="全部识别结果"
          options={Object.entries(labels).map(([value, label]) => ({ value, label }))}
        />
        <SelectField
          label="处理状态"
          value={queue}
          onChange={setQueue}
          allOption="全部处理状态"
          options={[
            { value: "success", label: "处理成功" },
            { value: "processing", label: "处理中" },
            { value: "pending", label: "排队中" },
            { value: "failed", label: "处理失败" },
          ]}
        />
      </DialogFilters>
      <div className="l1-history-content">
        <div className="l1-history-body admin-table-wrap dialog-scroll-region">
          <table className="admin-table">
            <thead>
              <tr>
                <th>文件</th>
                <th>版本</th>
                <th>识别结果</th>
                <th>处理状态</th>
                <th>识别说明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                !error &&
                rows.map((file) => (
                  <tr key={file.artifactId}>
                    <td>
                      <span className="memory-file-name" title={file.filename || file.title || ""}>
                        {file.filename || file.title}
                      </span>
                      {file.previousSummary ? (
                        <details>
                          <summary>
                            查看上次摘要
                            {file.previousSummaryVersion
                              ? ` · v${file.previousSummaryVersion}`
                              : ""}
                          </summary>
                          <p>{file.previousSummary}</p>
                        </details>
                      ) : null}
                    </td>
                    <td>v{file.version}</td>
                    <td>{labels[file.recognitionStatus] || file.recognitionStatus}</td>
                    <td>
                      {file.processingState === "processing"
                        ? "处理中"
                        : file.processingState === "failed"
                          ? "处理失败"
                          : file.processingState === "success"
                            ? "处理成功"
                            : "排队中"}
                    </td>
                    <td>
                      {file.recognitionNote || "—"}
                      {file.processingState === "failed" && file.availableAt
                        ? ` · 将于 ${localDate(file.availableAt)} 自动重试`
                        : ""}
                    </td>
                    <td>
                      <div className="memory-file-actions">
                        <button
                          type="button"
                          className="wiki-action"
                          disabled={!file.pageId}
                          onClick={() => {
                            if (file.pageId) onOpen(file.pageId);
                          }}
                        >
                          看记忆
                        </button>
                        {editable ? (
                          <button
                            type="button"
                            className="wiki-action"
                            disabled={!!runningJob}
                            onClick={() =>
                              void onRetry(file.artifactId).then(() =>
                                setRevision((value) => value + 1),
                              )
                            }
                          >
                            重新识别
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              {(loading || error || !rows.length) && (
                <tr>
                  <td className="monitor-empty" colSpan={6}>
                    {loading ? "正在读取文件…" : error || "没有符合条件的文件"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <DialogFooter pagination>
        <PaginationControl
          total={total}
          currentPage={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          disabled={loading || !!error}
          ariaLabel="文件识别覆盖分页"
        />
      </DialogFooter>
    </Dialog>
  );
}
function FileRepairDialog({
  entries,
  editable,
  onOpen,
  onDismiss,
  onClose,
}: {
  entries: MemoryEntry[];
  editable: boolean;
  onOpen: (entry: MemoryEntry) => void;
  onDismiss: (entry: MemoryEntry) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busyId, setBusyId] = useState("");
  return (
    <Dialog
      ref={dialog}
      onRequestClose={onClose}
      className="l1-history-dialog dialog-list"
      aria-labelledby="file-repair-title"
    >
      <DialogHeader
        title="待修复关联"
        titleId="file-repair-title"
        subtitle="关联索引已不可展示；修正后会重新可用，移除展示会停止自动恢复"
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭待修复关联"
      />
      <div className="l1-history-content">
        <div className="l1-history-body admin-table-wrap dialog-scroll-region">
          <table className="admin-table">
            <thead>
              <tr>
                <th>关联索引</th>
                <th>来源</th>
                <th>仍可用文件</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.title || "关联文件"}</td>
                  <td>{entry.fileGroup?.origin === "automatic" ? "自动发现" : "人工指定"}</td>
                  <td>{entry.fileGroup?.members.length || 0} 个</td>
                  <td>
                    <div className="memory-file-actions">
                      <button
                        type="button"
                        className="wiki-action"
                        disabled={busyId === entry.id}
                        onClick={() => onOpen(entry)}
                      >
                        修正关联
                      </button>
                      {editable ? (
                        <button
                          type="button"
                          className="wiki-action"
                          disabled={busyId === entry.id}
                          onClick={async () => {
                            setBusyId(entry.id);
                            try {
                              await onDismiss(entry);
                            } finally {
                              setBusyId("");
                            }
                          }}
                        >
                          {busyId === entry.id ? "移除中…" : "移除展示"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!entries.length && (
                <tr>
                  <td className="monitor-empty" colSpan={4}>
                    没有待修复的关联。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}
const SCAN_OPERATION_LABELS: Record<string, string> = {
  create: "新增",
  update: "更新",
  delete: "删除并作废",
};
const SCAN_TRIGGER_LABELS: Record<string, string> = {
  schedule: "定时扫描",
  manual: "手动扫描",
  change: "变更触发",
  log: "日志触发",
};
const SCAN_BATCH_STATUS_LABELS: Record<string, string> = {
  running: "进行中",
  completed: "已完成",
  failed: "失败",
};
type ScanBatchRow = {
  id: string;
  triggerType: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  changes: number;
  created: number;
  updated: number;
  deleted: number;
};
function ScanBatchItemsDialog({
  projectId,
  api,
  batch,
  onClose,
}: {
  projectId: string;
  api: MemoryApi;
  batch: ScanBatchRow;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [keyword, setKeyword] = useState("");
  const [operation, setOperation] = useState("");
  const [filters, setFilters] = useState({ keyword: "", operation: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<
    { id: string; title: string; operation: string; createdAt: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      batchId: batch.id,
      ...filters,
      page: String(page),
      pageSize: String(pageSize),
    });
    api(
      `/projects/${projectId}/memory/file-index/discoveries?${params}`,
      undefined,
      "GET",
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result.rows);
          setTotal(result.total);
          if (result.page !== page) setPage(result.page);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "读取批次明细失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, batch.id, filters, page, pageSize, projectId]);
  return (
    <Dialog
      ref={dialog}
      onRequestClose={onClose}
      className="l1-history-dialog dialog-list"
      aria-labelledby="scan-batch-items-title"
    >
      <DialogHeader
        title="批次明细"
        titleId="scan-batch-items-title"
        subtitle={`${SCAN_TRIGGER_LABELS[batch.triggerType] || batch.triggerType} · ${localDate(batch.startedAt)}`}
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭批次明细"
      />
      <DialogFilters
        label="批次明细筛选"
        keyword={{ value: keyword, onChange: setKeyword, placeholder: "搜索文件名" }}
        onQuery={() => {
          setPage(1);
          setFilters({ keyword: keyword.trim(), operation });
        }}
        onReset={() => {
          setKeyword("");
          setOperation("");
          setPage(1);
          setFilters({ keyword: "", operation: "" });
        }}
      >
        <SelectField
          label="处理类型"
          value={operation}
          onChange={setOperation}
          allOption="全部类型"
          options={Object.entries(SCAN_OPERATION_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </DialogFilters>
      <div className="l1-history-content">
        <div className="l1-history-body admin-table-wrap dialog-scroll-region">
          <table className="admin-table">
            <thead>
              <tr>
                <th>文件</th>
                <th>处理类型</th>
                <th>扫描时间</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                !error &&
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>{SCAN_OPERATION_LABELS[row.operation] || row.operation}</td>
                    <td>{localDate(row.createdAt)}</td>
                  </tr>
                ))}
              {(loading || error || !rows.length) && (
                <tr>
                  <td className="monitor-empty" colSpan={3}>
                    {loading
                      ? "正在读取批次明细…"
                      : error ||
                        (filters.keyword || filters.operation
                          ? "没有符合条件的记录"
                          : "该批次没有文件变化")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <DialogFooter pagination>
        <PaginationControl
          total={total}
          currentPage={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPage(1);
            setPageSize(size);
          }}
          disabled={loading || !!error}
          ariaLabel="批次明细分页"
        />
      </DialogFooter>
    </Dialog>
  );
}
function FileDiscoveryHistory({
  projectId,
  api,
  refreshVersion,
  onClose,
}: {
  projectId: string;
  api: MemoryApi;
  refreshVersion: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [batches, setBatches] = useState<ScanBatchRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const [scanVersion, setScanVersion] = useState(0);
  const [detail, setDetail] = useState<ScanBatchRow | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api(
      `/projects/${projectId}/memory/file-index/scan-batches?page=${page}&pageSize=${pageSize}`,
      undefined,
      "GET",
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setBatches(result.rows);
          setTotal(result.total);
          if (result.page !== page) setPage(result.page);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "读取扫描批次失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, projectId, page, pageSize, refreshVersion, scanVersion]);
  const startScan = () => {
    if (scanBusy) return;
    setScanBusy(true);
    setScanNote("");
    api(`/projects/${projectId}/memory/file-index/scan`, undefined, "POST")
      .then((result) => {
        setScanNote(result?.queued ? "已开始扫描，正在排队" : "已有扫描在排队，无需重复");
        setPage(1);
        setScanVersion((value) => value + 1);
      })
      .catch((cause) => setScanNote(cause instanceof Error ? cause.message : "启动扫描失败"))
      .finally(() => setScanBusy(false));
  };
  return (
    <>
      <Dialog
        ref={dialog}
        onRequestClose={onClose}
        className="l1-history-dialog dialog-list"
        aria-labelledby="file-discovery-title"
      >
        <DialogHeader
          title="文件扫描记录"
          titleId="file-discovery-title"
          subtitle="扫描批次；点“明细”查看该批次的文件变化"
          onClose={() => animateDialogClose(dialog.current, onClose)}
          closeLabel="关闭扫描记录"
        />
        <DialogFilters
          label="扫描记录筛选"
          onQuery={() => setScanVersion((value) => value + 1)}
          onReset={() => {
            setScanNote("");
            setPage(1);
            setScanVersion((value) => value + 1);
          }}
          showActions={false}
        >
          <button type="button" className="wiki-action" disabled={scanBusy} onClick={startScan}>
            {scanBusy ? "正在排队…" : "立即扫描"}
          </button>
          {scanNote ? <small>{scanNote}</small> : null}
        </DialogFilters>
        <div className="l1-history-content">
          <div className="l1-history-body admin-table-wrap dialog-scroll-region">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>开始时间</th>
                  <th>来源</th>
                  <th>状态</th>
                  <th>合计</th>
                  <th>新增</th>
                  <th>更新</th>
                  <th>删除</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  !error &&
                  batches.map((batch) => (
                    <tr key={batch.id}>
                      <td>{localDate(batch.startedAt)}</td>
                      <td>{SCAN_TRIGGER_LABELS[batch.triggerType] || batch.triggerType}</td>
                      <td>{SCAN_BATCH_STATUS_LABELS[batch.status] || batch.status}</td>
                      <td>{batch.changes}</td>
                      <td>{batch.created}</td>
                      <td>{batch.updated}</td>
                      <td>{batch.deleted}</td>
                      <td>
                        <button
                          type="button"
                          className="wiki-action"
                          onClick={() => setDetail(batch)}
                        >
                          明细
                        </button>
                      </td>
                    </tr>
                  ))}
                {(loading || error || !batches.length) && (
                  <tr>
                    <td className="monitor-empty" colSpan={8}>
                      {loading ? "正在读取扫描批次…" : error || "没有扫描批次"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter pagination>
          <PaginationControl
            total={total}
            currentPage={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPage(1);
              setPageSize(size);
            }}
            disabled={loading || !!error}
            ariaLabel="文件扫描记录分页"
          />
        </DialogFooter>
      </Dialog>
      {detail ? (
        <ScanBatchItemsDialog
          projectId={projectId}
          api={api}
          batch={detail}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </>
  );
}

const CONVERSATION_PROGRESS_STATE_LABELS: Record<string, string> = {
  done: "已完成",
  processing: "处理中",
  waiting: "等待中",
  failed: "有失败",
  pending: "待处理",
  unbackfilled: "未入队",
  empty: "无消息",
};
type ConversationProgressRow = {
  id: string;
  title: string;
  status: string;
  archivedAt?: string | null;
  lastMessageAt?: string | null;
  messageCount: number;
  latestSequence: number | null;
  processedThrough: number | null;
  processingThrough: number | null;
  pendingWindows: number;
  queued: number;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  state: string;
};
function ConversationProgressDialog({
  projectId,
  api,
  refreshVersion,
  onClose,
}: {
  projectId: string;
  api: MemoryApi;
  refreshVersion: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<ConversationProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      keyword: filters,
      page: String(page),
      pageSize: String(pageSize),
    });
    api(
      `/projects/${projectId}/memory/conversation-progress?${params}`,
      undefined,
      "GET",
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result.rows);
          setTotal(result.total);
          if (result.page !== page) setPage(result.page);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "读取消息记忆进度失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, projectId, filters, page, pageSize, refreshVersion, revision]);
  return (
    <Dialog
      ref={dialog}
      onRequestClose={onClose}
      className="l1-history-dialog dialog-list"
      aria-labelledby="conversation-progress-title"
    >
      <DialogHeader
        title="消息记忆进度"
        titleId="conversation-progress-title"
        subtitle="按迭代查看消息处理到哪一步；打开或点刷新时读取最新数据。序号是全项目递增编号，通常大于该迭代的消息条数。“未入队”表示有历史消息还没进入记忆窗口，点“立即扫描并运行”会补入队。"
        actions={
          <RefreshButton
            pending={loading}
            onClick={() => {
              setPage(1);
              setRevision((value) => value + 1);
            }}
          />
        }
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭消息记忆进度"
      />
      <DialogFilters
        label="消息记忆进度筛选"
        keyword={{ value: keyword, onChange: setKeyword, placeholder: "搜索迭代标题" }}
        onQuery={() => {
          setPage(1);
          setFilters(keyword.trim());
        }}
        onReset={() => {
          setKeyword("");
          setFilters("");
          setPage(1);
        }}
      />
      <div className="l1-history-content">
        <div className="l1-history-body admin-table-wrap dialog-scroll-region">
          <table className="admin-table">
            <thead>
              <tr>
                <th>迭代</th>
                <th>迭代状态</th>
                <th>记忆状态</th>
                <th>可见消息数</th>
                <th>最新序号</th>
                <th>已处理到序号</th>
                <th>正在处理序号</th>
                <th>待处理窗口</th>
                <th>最近尝试</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                !error &&
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>{row.status === "archived" ? "已归档" : "进行中"}</td>
                    <td>{CONVERSATION_PROGRESS_STATE_LABELS[row.state] || row.state}</td>
                    <td>{row.messageCount}</td>
                    <td>{row.latestSequence ?? "—"}</td>
                    <td>{row.processedThrough ?? "—"}</td>
                    <td>{row.processingThrough ?? "—"}</td>
                    <td>
                      {row.pendingWindows}
                      {row.queued ? ` · 排队 ${row.queued}` : ""}
                    </td>
                    <td>
                      {row.lastAttemptAt ? localDate(row.lastAttemptAt) : "—"}
                      {row.lastError ? " · 失败" : ""}
                    </td>
                  </tr>
                ))}
              {(loading || error || !rows.length) && (
                <tr>
                  <td className="monitor-empty" colSpan={9}>
                    {loading ? "正在读取消息记忆进度…" : error || "没有迭代"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <DialogFooter pagination>
        <PaginationControl
          total={total}
          currentPage={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPage(1);
            setPageSize(size);
          }}
          disabled={loading || !!error}
          ariaLabel="消息记忆进度分页"
        />
      </DialogFooter>
    </Dialog>
  );
}
function MemoryJobHistory({
  job,
  projectId,
  api,
  refreshVersion,
  onClose,
}: {
  job: MemoryJob;
  projectId: string;
  api: MemoryApi;
  refreshVersion: number;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<
    (LaowengRun & {
      projectPhases?: {
        phase: string;
        statusUpdated: boolean;
        changes: { id: string; action: string; title?: string; subject?: string }[];
      }[];
      conversationWindows?: RunConversationWindow[];
      documentItems?: FileRunItem[];
    })[]
  >([]);
  const [detail, setDetail] = useState<(typeof runs)[number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [from, setFrom] = useState("");
  const [fromDraft, setFromDraft] = useState("");
  const [to, setTo] = useState("");
  const [toDraft, setToDraft] = useState("");
  const [trigger, setTrigger] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      status,
      from,
      to,
      trigger,
    });
    api(
      `/projects/${projectId}/memory/jobs/${job.key}/history?${params}`,
      undefined,
      "GET",
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setRuns(data.rows);
        setDetail((previous) =>
          previous ? data.rows.find((row: LaowengRun) => row.id === previous.id) || previous : null,
        );
        setTotal(data.total);
        if (data.page !== page) setPage(data.page);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "历史记录读取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, projectId, job.key, page, pageSize, status, from, to, trigger, refreshVersion]);
  return (
    <>
      <LaowengHistoryDialog
        title={job.label}
        empty="还没有运行记录。"
        columns={LAOWENG_RUN_COLUMNS}
        rows={laowengRunRows(runs, " 项").map((row, index) => ({
          ...row,
          cells: {
            ...row.cells,
            time: fullTime(
              runs[index].finished_at || runs[index].started_at || runs[index].created_at,
            ),
          },
          actions: ["member_memory", "project_memory", "document_memory"].includes(job.key) ? (
            <button type="button" className="wiki-action" onClick={() => setDetail(runs[index])}>
              详情
            </button>
          ) : undefined,
        }))}
        loading={loading}
        error={error}
        total={total}
        page={page}
        pageSize={pageSize}
        search=""
        showSearch={false}
        filters={
          <>
            <SelectField
              label="状态"
              value={statusDraft}
              onChange={setStatusDraft}
              options={[
                { value: "completed", label: "已完成" },
                { value: "failed", label: "失败" },
                { value: "running", label: "进行中" },
                { value: "queued", label: "排队中" },
              ]}
              allOption="全部状态"
            />
            <DocumentChangeDateRangePicker
              label="时间段"
              value={{ from: fromDraft, to: toDraft }}
              onChange={(range) => {
                setFromDraft(range.from);
                setToDraft(range.to);
              }}
            />
          </>
        }
        onQuery={() => {
          setStatus(statusDraft);
          setFrom(fromDraft);
          setTo(toDraft);
          setPage(1);
        }}
        onReset={() => {
          setStatus("");
          setStatusDraft("");
          setFrom("");
          setFromDraft("");
          setTo("");
          setToDraft("");
          setPage(1);
        }}
        onSearch={() => {}}
        triggerFilter={{
          value: trigger,
          onChange: (value) => {
            setTrigger(value);
            setPage(1);
          },
        }}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onClose={onClose}
      />
      {detail ? (
        job.key === "project_memory" ? (
          <ProjectRunDetail run={detail} onClose={() => setDetail(null)} />
        ) : job.key === "document_memory" ? (
          <FileRunDetail run={detail} onClose={() => setDetail(null)} />
        ) : (
          <ConversationRunDetail run={detail} onClose={() => setDetail(null)} />
        )
      ) : null}
    </>
  );
}

type FileRunItem = {
  versionId: string;
  title: string;
  filename: string;
  version: number;
  operation: string;
  triggerOrigin: string;
  status: string;
  error?: string | null;
};
function FileRunDetail({
  run,
  onClose,
}: {
  run: LaowengRun & { documentItems?: FileRunItem[] };
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const statuses: Record<string, string> = {
    queued: "排队中",
    processing: "处理中",
    recognized: "识别完整",
    partial: "识别部分",
    failed: "处理失败",
    postponed: "延后处理",
    skipped: "未处理",
  };
  return (
    <Dialog
      ref={dialog}
      onRequestClose={onClose}
      className="l1-history-dialog dialog-list"
      aria-labelledby="file-run-detail-title"
    >
      <DialogHeader
        title="文件识别运行详情"
        titleId="file-run-detail-title"
        subtitle={`运行状态：${runStatusLabel(run.status)}`}
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭运行详情"
      />
      <div className="l1-history-content">
        <div className="l1-history-body admin-table-wrap dialog-scroll-region">
          <table className="admin-table">
            <thead>
              <tr>
                <th>文件</th>
                <th>版本</th>
                <th>处理类型</th>
                <th>触发来源</th>
                <th>结果</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {run.documentItems?.length ? (
                run.documentItems.map((item) => (
                  <tr key={item.versionId}>
                    <td>{item.title || item.filename}</td>
                    <td>v{item.version}</td>
                    <td>{item.operation === "create" ? "新增" : "更新"}</td>
                    <td>
                      {item.triggerOrigin === "manual"
                        ? "人工重新识别"
                        : item.triggerOrigin === "discovery"
                          ? "自动发现"
                          : "历史任务"}
                    </td>
                    <td>{statuses[item.status] || item.status}</td>
                    <td>{item.error || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="monitor-empty" colSpan={6}>
                    没有文件明细（可能是旧记录或本次没有待处理文件）。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}

function ProjectRunDetail({
  run,
  onClose,
}: {
  run: LaowengRun & {
    projectPhases?: {
      phase: string;
      statusUpdated: boolean;
      changes: { id: string; action: string; title?: string; subject?: string }[];
    }[];
  };
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <Dialog
      ref={dialog}
      onRequestClose={onClose}
      className="l1-history-dialog dialog-list"
      aria-labelledby="project-run-detail-title"
    >
      <DialogHeader
        title="运行详情"
        titleId="project-run-detail-title"
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭运行详情"
      />
      <div className="l1-history-content dialog-scroll-region">
        <div className="dialog-plain-body memory-job-detail">
          <p>
            运行状态：{runStatusLabel(run.status)}
            {run.error ? ` · ${run.error}` : ""}
          </p>
          {run.projectPhases?.length ? (
            run.projectPhases.map((phase) => (
              <section key={phase.phase}>
                <strong>项目进程与主要任务：已提交</strong>
                {phase.changes.map((change) => (
                  <p key={`${change.action}-${change.id}`}>
                    {(
                      { create: "新增", update: "更新", dispute: "标记争议" } as Record<
                        string,
                        string
                      >
                    )[change.action] || change.action}
                    {change.subject === "task"
                      ? "主要任务"
                      : change.subject === "project"
                        ? "项目进程"
                        : "记忆"}
                    ：{change.title || change.id}
                  </p>
                ))}
                {!phase.changes.length ? <p>没有新增或更新条目。</p> : null}
                {phase.statusUpdated ? <p>项目现状已更新。</p> : null}
              </section>
            ))
          ) : (
            <p>没有已记录的提交详情（可能是旧记录、无待处理内容或提交前失败）。</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

type RunConversationWindow = {
  windowId?: string | null;
  threadTitle: string;
  firstSequence: string | null;
  lastSequence: string | null;
  createdDiscussions: number;
  updatedDiscussions: number;
  statements: number;
};
function ConversationRunDetail({
  run,
  onClose,
}: {
  run: LaowengRun & {
    conversationWindows?: RunConversationWindow[];
  };
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <Dialog
      ref={dialog}
      onRequestClose={onClose}
      className="l1-history-dialog dialog-list"
      aria-labelledby="conversation-run-detail-title"
    >
      <DialogHeader
        title="运行详情"
        titleId="conversation-run-detail-title"
        subtitle={`运行状态：${runStatusLabel(run.status)}${run.error ? ` · ${run.error}` : ""}`}
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭运行详情"
      />
      <div className="l1-history-content">
        <div className="l1-history-body admin-table-wrap dialog-scroll-region">
          <table className="admin-table">
            <thead>
              <tr>
                <th>迭代</th>
                <th>消息范围</th>
                <th>更新议题数</th>
                <th>新增议题数</th>
                <th>关键发言数</th>
              </tr>
            </thead>
            <tbody>
              {run.conversationWindows?.length ? (
                run.conversationWindows.map((window, index) => (
                  <tr key={window.windowId || `extra-${index}`}>
                    <td>{window.threadTitle}</td>
                    <td>
                      {window.firstSequence && window.lastSequence
                        ? `消息 ${window.firstSequence}–${window.lastSequence}`
                        : "—"}
                    </td>
                    <td>{window.updatedDiscussions}</td>
                    <td>{window.createdDiscussions}</td>
                    <td>{window.statements}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="monitor-empty" colSpan={5}>
                    没有关联的消息范围（可能是旧记录或本次未处理消息）。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}

type MemoryPendingAction = { kind: "supersede" | "flag"; entry: MemoryEntry };

const ZERO_COUNTS: MemoryCounts = { disputes: 0, updatedSinceEntry: 0, entries: 0 };
const STATUS_LABEL: Record<string, string> = {
  current: "现行",
  superseded: "作废",
};
const STATUS_KEYS = ["current", "superseded"] as const;
const DEFAULT_STATUS_FILTER = ["current"];
/** 右侧时间线每页条数：首屏一页，上滑再取下一页。 */
const ENTRY_PAGE_SIZE = 20;
const SUBJECT_LABEL: Record<string, string> = {
  utterance: "发言",
  document: "文档",
  task: "任务",
  discussion: "讨论",
  project: "整体",
};
const SUBJECT_KEYS = ["utterance", "document", "task", "discussion", "project"] as const;
const SUBTYPE_LABEL: Record<string, string> = {
  project_origin: "项目初创",
  member_change: "成员调整",
  iteration_created: "迭代创建",
  iteration_context_changed: "目标背景变更",
  iteration_archived: "迭代归档",
  phase_change: "阶段切换",
  requirements: "需求讨论",
  technical_decision: "技术决策",
  product_decision: "产品决策",
  risk_dispute: "风险争议",
  problem_review: "问题复盘",
  cross_iteration_topic: "跨迭代议题",
  critical_delivery: "关键交付",
  difficult_task: "困难任务",
  blocked_task: "阻塞任务",
  rework_task: "返工任务",
  failed_task: "失败任务",
  special_task: "专项任务",
  key_judgment: "关键判断",
  decision: "重要决策",
  risk_alert: "风险提醒",
  requirement_clarification: "需求澄清",
  commitment: "承诺与分工",
  experience: "经验分享",
  requirements_document: "需求文档",
  design_document: "设计文档",
  technical_document: "技术方案",
  api_document: "接口文档",
  test_material: "测试材料",
  operations_material: "运营材料",
  reference_material: "参考资料",
  resource_package: "资源包",
  image_material: "图片资料",
};
const SUBTYPE_KEYS: Record<string, string[]> = {
  project: [
    "project_origin",
    "member_change",
    "iteration_created",
    "iteration_context_changed",
    "iteration_archived",
    "phase_change",
  ],
  discussion: [
    "requirements",
    "technical_decision",
    "product_decision",
    "risk_dispute",
    "problem_review",
    "cross_iteration_topic",
  ],
  task: [
    "critical_delivery",
    "difficult_task",
    "blocked_task",
    "rework_task",
    "failed_task",
    "special_task",
  ],
  utterance: [
    "key_judgment",
    "decision",
    "risk_alert",
    "requirement_clarification",
    "commitment",
    "experience",
  ],
  document: [
    "requirements_document",
    "design_document",
    "technical_document",
    "api_document",
    "test_material",
    "operations_material",
    "reference_material",
    "resource_package",
    "image_material",
  ],
};
const SUBJECT_FILTER_ITEMS = [
  { value: "all", label: "全部" },
  { value: "project", label: "项目进程" },
  { value: "task", label: "主要任务" },
  { value: "discussion", label: "核心议题" },
  { value: "utterance", label: "关键发言" },
  { value: "document", label: "文件索引" },
  { value: "", label: "其它记忆" },
] as const;
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
  thread: "迭代",
  milestone: "项目变更",
  iteration_context: "迭代目标背景变更",
  memory_page: "关联项目记忆",
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
    disputes: read("disputes"),
    updatedSinceEntry: read("updatedSinceEntry"),
    entries: read("entries"),
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
  /** 当前选中的完整条目；弹窗不再一次性拉全量，详情按条读取后放这里。 */
  const [selectedEntry, setSelectedEntry] = useState<MemoryEntry | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState<MemoryJob[]>([]);
  const displayJobs = useMemo(() => {
    const project = jobs.find((job) => job.key === "project_memory");
    const task = jobs.find((job) => job.key === "task_memory");
    if (!project || !task) return jobs;
    const merge = (first: MemoryJob, second: MemoryJob, label: string) => ({
      ...first,
      label,
      trigger: `${first.trigger} ${second.trigger}`,
      prompt: `${first.label}：${first.prompt} ${second.label}：${second.prompt}`,
      completion: `${first.label}：${first.completion} ${second.label}：${second.completion}`,
      failure: `${first.label}：${first.failure} ${second.label}：${second.failure}`,
      tools: [...new Set([...first.tools, ...second.tools])],
    });
    // 核心议题与关键发言已在作业定义里合并，这里只合并同为记忆产物的项目进程与主要任务。
    return jobs
      .filter((job) => job.key !== "task_memory")
      .map((job) =>
        job.key === "project_memory" ? merge(project, task, "项目进程与主要任务") : job,
      );
  }, [jobs]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState("");
  const [repairGroups, setRepairGroups] = useState<MemoryEntry[] | null>(null);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const repairProjectRef = useRef(projectId);
  repairProjectRef.current = projectId;
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [discoveryHistoryOpen, setDiscoveryHistoryOpen] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [historyJob, setHistoryJob] = useState<MemoryJob | null>(null);
  const [sessionJob, setSessionJob] = useState<MemoryJob | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [runningJob, setRunningJob] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(DEFAULT_STATUS_FILTER);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [subtypeFilter, setSubtypeFilter] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<MemoryPendingAction | null>(null);
  const appliedFocus = useRef("");
  const editable = serverCanWrite ?? canWrite;

  /* 右侧时间线走分页接口：每个「一级类型 + 二级类型 + 状态 + 关键词」组合各自缓存
     已加载页，第一次切到新条件时取第一页，切回看过的条件直接复用、不重复请求；
     滚到底部再取下一页。 */
  const [queryApplied, setQueryApplied] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQueryApplied(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const [listEpoch, setListEpoch] = useState(0);
  const [entryList, setEntryList] = useState<MemoryEntryList>({
    key: "",
    items: [],
    page: 0,
    total: 0,
    hasMore: false,
    loading: false,
    loadingMore: false,
    error: "",
  });
  const entryPages = useRef(
    new Map<string, { items: MemoryEntry[]; page: number; total: number; hasMore: boolean }>(),
  );
  const listRequest = useRef(0);
  const listEl = useRef<HTMLUListElement | null>(null);
  const entryFilterKey = useMemo(
    () =>
      JSON.stringify([
        subjectFilter,
        [...subtypeFilter].sort(),
        [...statusFilter].sort(),
        queryApplied,
      ]),
    [subjectFilter, subtypeFilter, statusFilter, queryApplied],
  );
  const filterKeyRef = useRef(entryFilterKey);
  filterKeyRef.current = entryFilterKey;
  const listStateRef = useRef(entryList);
  listStateRef.current = entryList;
  const entryPagePath = useCallback(
    (page: number) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(ENTRY_PAGE_SIZE),
      });
      if (subjectFilter !== "all") params.set("subject", subjectFilter);
      if (subtypeFilter.length) params.set("subtypes", subtypeFilter.join(","));
      if (statusFilter.length) params.set("statuses", statusFilter.join(","));
      if (queryApplied) params.set("q", queryApplied);
      return `/projects/${projectId}/memory/entries?${params.toString()}`;
    },
    [projectId, subjectFilter, subtypeFilter, statusFilter, queryApplied],
  );
  const entryPagePathRef = useRef(entryPagePath);
  entryPagePathRef.current = entryPagePath;

  const loadEntryPage = useCallback(
    async (page: number) => {
      const key = filterKeyRef.current;
      const requestId = ++listRequest.current;
      setEntryList((current) => ({
        ...(current.key === key
          ? current
          : { ...current, items: [], page: 0, total: 0, hasMore: false }),
        key,
        loading: page === 1,
        loadingMore: page > 1,
        error: "",
      }));
      try {
        const payload = await api(entryPagePathRef.current(page));
        /* 条件已经切走（或又有新请求）时丢弃这次结果，避免旧条件覆盖新列表。 */
        if (requestId !== listRequest.current || filterKeyRef.current !== key) return;
        const pageData: MemoryEntryPage =
          payload && typeof payload === "object" ? (payload as MemoryEntryPage) : {};
        const incoming = (Array.isArray(pageData.items) ? pageData.items : []).filter(
          (entry) => Boolean(entry) && typeof entry.id === "string",
        );
        setEntryList((current) => {
          const base = page === 1 || current.key !== key ? [] : current.items;
          const seen = new Set(base.map((entry) => entry.id));
          const next: MemoryEntryList = {
            key,
            items: [...base, ...incoming.filter((entry) => !seen.has(entry.id))],
            page,
            total: Number.isFinite(pageData.total) ? Number(pageData.total) : incoming.length,
            hasMore: pageData.hasMore === true,
            loading: false,
            loadingMore: false,
            error: "",
          };
          entryPages.current.set(key, next);
          return next;
        });
      } catch (cause) {
        if (requestId !== listRequest.current || filterKeyRef.current !== key) return;
        setEntryList((current) => ({
          ...current,
          loading: false,
          loadingMore: false,
          error: cause instanceof Error ? cause.message : "记忆条目读取失败",
        }));
      }
    },
    [api],
  );

  useEffect(() => {
    const cached = entryPages.current.get(entryFilterKey);
    if (cached) {
      setEntryList({
        ...cached,
        key: entryFilterKey,
        loading: false,
        loadingMore: false,
        error: "",
      });
      if (listEl.current) listEl.current.scrollTop = 0;
      return;
    }
    void loadEntryPage(1);
  }, [entryFilterKey, listEpoch, loadEntryPage]);

  const loadMoreEntries = useCallback(() => {
    const state = listStateRef.current;
    if (state.loading || state.loadingMore || !state.hasMore || state.page < 1) return;
    void loadEntryPage(state.page + 1);
  }, [loadEntryPage]);

  const handleListScroll = (element: HTMLElement | null) => {
    if (!element) return;
    if (element.scrollHeight - element.scrollTop - element.clientHeight > 240) return;
    loadMoreEntries();
  };

  /** 丢弃分页缓存并重新取当前条件的第一页（刷新手、编辑后列表失配时用）。 */
  const resetEntryPages = useCallback(() => {
    entryPages.current.clear();
    setListEpoch((value) => value + 1);
  }, []);

  /** 就地更新已渲染条目的字段，避免一次纠错/作废把整列滚动位置重置。 */
  const patchEntryInList = (entryId: string, patch: Partial<MemoryEntry>) => {
    setEntryList((current) => {
      const next = {
        ...current,
        items: current.items.map((entry) =>
          entry.id === entryId ? { ...entry, ...patch } : entry,
        ),
      };
      entryPages.current.set(next.key, next);
      return next;
    });
  };

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
        const payload = await api(
          /* entries=0：打开弹窗不再拉全量条目与水合出处，详情按条读取。 */
          `/projects/${projectId}/memory?entries=0`,
          undefined,
          undefined,
          signal,
        );
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
    setRepairGroups(null);
    setRepairOpen(false);
    setStatusFilter(DEFAULT_STATUS_FILTER);
    setSubjectFilter("all");
    setSubtypeFilter([]);
    setPendingAction(null);
    setQueryApplied("");
    entryPages.current.clear();
    setListEpoch((value) => value + 1);
  }, [projectId]);

  /* 弹窗只拿轻量条目索引（无正文）；detail 打开的单条内容按需读取。 */
  const entries = useMemo<MemoryEntry[]>(() => {
    const indexed = Array.isArray(data?.entryIndex) ? data.entryIndex : null;
    if (indexed)
      return indexed
        .filter((entry) => Boolean(entry) && typeof entry.id === "string")
        .slice()
        .sort((left, right) => timeOf(right.updatedAt) - timeOf(left.updatedAt));
    return (Array.isArray(data?.entries) ? data.entries : [])
      .filter((entry) => Boolean(entry) && typeof entry.id === "string")
      .slice()
      .sort((left, right) => timeOf(right.updatedAt) - timeOf(left.updatedAt));
  }, [data]);
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
  /* 条目正文按需读取：列表里已加载的直接用；引用聚焦、关系跳转等再拉单条详情。 */
  useEffect(() => {
    if (!selectedId) {
      setSelectedEntry(null);
      return;
    }
    const listed = entryList.items.find((entry) => entry.id === selectedId);
    if (listed) {
      setSelectedEntry(listed);
      return;
    }
    const controller = new AbortController();
    api(`/projects/${projectId}/memory/entries/${selectedId}`, undefined, "GET", controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (payload && typeof payload === "object" && typeof payload.id === "string")
          setSelectedEntry(payload as MemoryEntry);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          showTip(cause instanceof Error ? cause.message : "记忆详情读取失败", "error");
      });
    return () => controller.abort();
  }, [api, entryList.items, projectId, selectedId]);
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

  const changeSubjectFilter = (value: string) => {
    setSubjectFilter(value);
    if (value !== "all") {
      const available = SUBTYPE_KEYS[value] || [];
      setSubtypeFilter((current) => current.filter((subtype) => available.includes(subtype)));
    } else {
      setSubtypeFilter([]);
    }
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
    counts.disputes ? { key: "dispute", label: `独立反馈 ${counts.disputes}` } : null,
  ].filter((item): item is { key: string; label: string } => Boolean(item));

  const refreshDialog = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      /* 右上角刷新回到默认「全部」条件，并从第一页重取时间线。 */
      setSubjectFilter("all");
      setSubtypeFilter([]);
      setStatusFilter(DEFAULT_STATUS_FILTER);
      setQuery("");
      setQueryApplied("");
      entryPages.current.clear();
      setListEpoch((value) => value + 1);
      await Promise.all([load(undefined, true), loadJobs()]);
      showTip("项目记忆已刷新");
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

  const retryFile = async (artifactId: string) => {
    if (runningJob) return;
    setRunningJob(artifactId);
    try {
      await api(`/projects/${projectId}/memory/files/${artifactId}/retry`, undefined, "POST");
      showTip("文件已重新排队");
      await loadJobs();
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "文件重试失败", "error");
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

  const openRepair = async () => {
    if (repairLoading) return;
    const requestedProject = projectId;
    setRepairLoading(true);
    try {
      const result = await api(`/projects/${requestedProject}/memory/file-groups/needs-repair`);
      if (repairProjectRef.current !== requestedProject) return;
      setRepairGroups(Array.isArray(result?.entries) ? result.entries : []);
      setRepairOpen(true);
    } catch (cause) {
      if (repairProjectRef.current === requestedProject)
        showTip(cause instanceof Error ? cause.message : "无法读取待修复关联", "error");
    } finally {
      if (repairProjectRef.current === requestedProject) setRepairLoading(false);
    }
  };

  const saveFileGroup = async (
    groupId: string | undefined,
    input: {
      title: string;
      evidence: string;
      members: { artifactId: string; description: string }[];
    },
  ) => {
    try {
      const result = await api(
        `/projects/${projectId}/memory/file-groups${groupId ? `/${groupId}` : ""}`,
        input,
        groupId ? "PATCH" : "POST",
      );
      await load();
      setRepairGroups(
        (current) => current?.filter((entry) => entry.fileGroup?.id !== groupId) || null,
      );
      setRefreshVersion((value) => value + 1);
      setSelectedId(result.pageId);
      showTip("关联文件索引已保存");
      return true;
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "保存失败", "error");
      return false;
    }
  };

  const dismissFileGroup = async (groupId: string) => {
    try {
      await api(`/projects/${projectId}/memory/file-groups/${groupId}`, undefined, "DELETE");
      await load();
      setRepairGroups(
        (current) => current?.filter((entry) => entry.fileGroup?.id !== groupId) || null,
      );
      setRefreshVersion((value) => value + 1);
      setSelectedId("");
      showTip("关联展示已移除，原记忆及历史仍保留");
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "移除失败", "error");
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
      /* 一级类型变了会影响当前筛选的命中集合，重新取当前条件的第一页。 */
      resetEntryPages();
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "更新对象类型失败", "error");
    }
  };

  const changeSubtype = async (entryId: string, subtype: string | null) => {
    try {
      await api(`/projects/${projectId}/memory/entries/${entryId}`, { subtype }, "PATCH");
      showTip("二级类型已更新");
      await load();
      resetEntryPages();
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "更新二级类型失败", "error");
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

  const supersedeEntry = async (entry: MemoryEntry) => {
    if (!editable || busyId) return false;
    setBusyId(entry.id);
    try {
      const response = await api(
        `/projects/${projectId}/memory/entries/${entry.id}/supersede`,
        { reason: flagNote.trim() },
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
                  ? { ...item, ...(updated || {}), status: updated?.status || "superseded" }
                  : item,
              ),
            }
          : previous,
      );
      publishCounts(
        normalizeCounts(payload.counts) ?? {
          ...counts,
        },
      );
      /* 时间线就地更新状态；当前状态筛选不含作废时把它从列表移走。 */
      setEntryList((current) => {
        const next = {
          ...current,
          items: current.items
            .map((item) =>
              item.id === entry.id
                ? { ...item, ...(updated || {}), status: updated?.status || "superseded" }
                : item,
            )
            .filter((item) => statusFilter.includes(item.status || "current")),
        };
        entryPages.current.set(next.key, next);
        return next;
      });
      setSelectedEntry((current) =>
        current && current.id === entry.id
          ? { ...current, ...(updated || {}), status: updated?.status || "superseded" }
          : current,
      );
      showTip("已作废，原内容与历史出处保留");
      return true;
    } catch (cause) {
      showTip(cause instanceof Error ? cause.message : "作废失败，请稍后重试", "error");
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
      /* 接口只把条目标成争议并回带备注，正文不改；这里同步成「有反馈」徽标。 */
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
      patchEntryInList(entry.id, { disputed: true });
      setSelectedEntry((current) =>
        current && current.id === entry.id ? { ...current, disputed: true } : current,
      );
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
      if (pending.kind === "supersede") await supersedeEntry(pending.entry);
      else await submitFlag(pending.entry);
    } finally {
      pendingBusyRef.current = false;
      setPendingAction(null);
    }
  };

  const selected = selectedId
    ? repairGroups?.find((entry) => entry.id === selectedId) ||
      entryList.items.find((entry) => entry.id === selectedId) ||
      (selectedEntry?.id === selectedId ? selectedEntry : null)
    : null;
  const selectedDisputed =
    Boolean(selected?.disputed) || (selected ? flaggedIds.includes(selected.id) : false);

  return (
    <>
      <Dialog
        onRequestClose={onClose}
        ref={dialog}
        className="project-memory-dialog"
        aria-labelledby="project-memory-title"
      >
        <DialogHeader
          title={<>项目记忆</>}
          titleId="project-memory-title"
          icon={<UiIcon name="book" size={16} />}
          subtitle={<>老翁整理 · 人确认与纠错</>}
          actions={
            <IconButton
              label="刷新项目记忆"
              icon={<UiIcon name="refresh" size={16} />}
              className="dialog-header-control"
              aria-label="刷新项目记忆"
              title="刷新项目记忆"
              disabled={refreshing || jobsLoading}
              onClick={() => void refreshDialog()}
            />
          }
          onClose={() => animateDialogClose(dialog.current, onClose)}
          closeLabel="关闭项目记忆"
          fullscreen={true}
        />
        <div
          className="project-memory-body"
          onScroll={(event) => handleListScroll(event.currentTarget)}
        >
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
                <div className="project-memory-main-scroll">
                  <div className="project-memory-guide-head">
                    <h3 className="project-memory-section-title" id="project-memory-guide">
                      项目现状
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
                    {guideMeta ? <p className="project-memory-guide-meta">{guideMeta}</p> : null}
                  </div>
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
                    <p className="project-memory-state">暂无项目现状。</p>
                  )}
                </div>
                <div className="project-memory-jobs">
                  <div className="project-memory-guide-head">
                    <h3 className="project-memory-section-title">记忆作业</h3>
                  </div>
                  {jobs.length ? (
                    <ul className="memory-job-list">
                      {displayJobs.map((job) => (
                        <li key={job.key} className="memory-job">
                          <details>
                            <summary>
                              <strong>{job.label}</strong>
                              <small>
                                {job.key === "member_memory" && job.backlogDetail
                                  ? `待处理：议题 ${job.backlogDetail.discussions ?? "—"} · 发言 ${job.backlogDetail.statements ?? "—"}（共同队列 ${job.backlogDetail.queued ?? "—"}）`
                                  : job.backlog == null
                                    ? job.backlogNote
                                    : `积压 ${job.backlog}`}
                              </small>
                              <span data-run={job.lastRun?.status || "never"}>
                                {job.lastRun
                                  ? `${job.lastRun.status ? runStatusLabel(job.lastRun.status) : "未知"}${job.lastRun.createdAt ? " · " + relativeActivity(job.lastRun.createdAt, Date.now()) : ""}`
                                  : "从未运行"}
                              </span>
                            </summary>
                            <dl className="memory-job-detail">
                              {job.fileCoverage ? (
                                <>
                                  <dt>识别结果</dt>
                                  <dd>
                                    文件 {job.fileCoverage.total} · 识别完整{" "}
                                    {job.fileCoverage.recognized} · 识别部分{" "}
                                    {job.fileCoverage.partial} · 暂不支持{" "}
                                    {job.fileCoverage.unrecognized} · 等待识别{" "}
                                    {job.fileCoverage.pending}
                                  </dd>
                                </>
                              ) : null}
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
                            {job.projectCandidates?.length ? (
                              <div className="memory-job-detail">
                                <strong>待处理的项目进程信号</strong>
                                {job.projectCandidates.map((item) => (
                                  <p key={item.id}>
                                    {item.hint || item.sourceKind} · 重试 {item.retryCount} 次
                                    {item.lastAttemptAt ? ` · 最近尝试 ${item.lastAttemptAt}` : ""}
                                    {item.lastError ? ` · ${item.lastError}` : ""}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                            <div className="memory-job-edit-actions">
                              <button
                                type="button"
                                className="wiki-action"
                                disabled={runningJob !== "" || !jobRunPath[job.key]}
                                onClick={() => void runJob(job)}
                              >
                                {jobRunPath[job.key]
                                  ? runningJob === job.key
                                    ? "提交中…"
                                    : job.key === "member_memory"
                                      ? "立即扫描并运行"
                                      : "立即运行"
                                  : "随结算触发"}
                              </button>
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
                                    onClick={() => setHistoryJob(job)}
                                  >
                                    运行历史
                                  </button>
                                  <button
                                    type="button"
                                    className="wiki-action"
                                    onClick={() => setSessionJob(job)}
                                  >
                                    会话
                                  </button>
                                  {job.observations?.length ? (
                                    <MemoryObservations job={job} />
                                  ) : null}
                                  {job.key === "member_memory" ? (
                                    <button
                                      type="button"
                                      className="wiki-action"
                                      onClick={() => setProgressOpen(true)}
                                    >
                                      消息进度
                                    </button>
                                  ) : null}
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
                              {job.fileCoverage ? (
                                <>
                                  <button
                                    type="button"
                                    className="wiki-action"
                                    onClick={() => setCoverageOpen(true)}
                                  >
                                    已扫描文件
                                  </button>
                                  <button
                                    type="button"
                                    className="wiki-action"
                                    onClick={() => setDiscoveryHistoryOpen(true)}
                                  >
                                    扫描记录
                                  </button>
                                </>
                              ) : null}
                              {job.key === "document_memory" ? (
                                <button
                                  type="button"
                                  className="wiki-action"
                                  disabled={repairLoading}
                                  onClick={() => void openRepair()}
                                >
                                  {repairLoading ? "读取中…" : "待修复关联"}
                                </button>
                              ) : null}
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="project-memory-state">{jobsError || "正在读取记忆作业…"}</p>
                  )}
                </div>
              </section>
              <aside className="project-memory-side" aria-label="项目记忆条目">
                <div className="project-memory-subject-row">
                  <SlideSwitch
                    label="按记忆种类筛选"
                    value={subjectFilter}
                    items={SUBJECT_FILTER_ITEMS}
                    onChange={changeSubjectFilter}
                    size="dense"
                    className="project-memory-subject-switch"
                  />
                  <small>
                    {entryList.loading && !entryList.items.length
                      ? "加载中…"
                      : `已加载 ${entryList.items.length} / ${entryList.total}`}
                  </small>
                </div>
                <div className="project-memory-filter-row">
                  <Field
                    label="二级类型"
                    hasValue
                    state={subjectFilter === "all" ? "disabled" : "idle"}
                    dense
                    className="project-memory-filter-control project-memory-filter-field"
                  >
                    <MemorySubtypeFilter
                      value={subtypeFilter}
                      options={SUBTYPE_KEYS[subjectFilter] || []}
                      disabled={subjectFilter === "all"}
                      onChange={setSubtypeFilter}
                    />
                  </Field>
                  <div className="project-memory-filter-control project-memory-search">
                    <TextField
                      label="关键词"
                      dense
                      icon={<UiIcon name="search" size={13} />}
                      value={query}
                      aria-label="搜索记忆条目"
                      placeholder="搜索标题或类型"
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                </div>
                <div className="project-memory-filter-row project-memory-filter-row-secondary">
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
                </div>
                {entryList.items.length ? (
                  <ul
                    className="project-memory-list"
                    ref={listEl}
                    onScroll={(event) => handleListScroll(event.currentTarget)}
                  >
                    {entryList.items.map((entry) => {
                      const status = entry.status || "current";
                      const disputed = Boolean(entry.disputed) || flaggedIds.includes(entry.id);
                      return (
                        <li key={entry.id} className="project-memory-node">
                          <span className="project-memory-spine" aria-hidden="true">
                            <span
                              className="project-memory-status-dot"
                              data-status={status}
                              data-disputed={disputed ? "true" : undefined}
                              title={`${STATUS_LABEL[status] || status}${disputed ? " · 有反馈" : ""}`}
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
                                {entry.subtype
                                  ? SUBTYPE_LABEL[entry.subtype] || entry.subtype
                                  : "未细分"}
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
                ) : entryList.error ? (
                  <p className="project-memory-state" role="alert">
                    {entryList.error}
                  </p>
                ) : entryList.loading ? (
                  <p className="project-memory-state" role="status" aria-live="polite">
                    正在读取记忆条目…
                  </p>
                ) : (
                  <p className="project-memory-state">
                    {counts.entries
                      ? "当前筛选下没有条目，换个状态或关键词试试。"
                      : "还没有沉淀出记忆条目。记忆按来源自动维护，现行不代表内容真实。"}
                  </p>
                )}
                {entryList.items.length ? (
                  <p
                    className="project-memory-state project-memory-list-more"
                    role="status"
                    aria-live="polite"
                  >
                    {entryList.loadingMore
                      ? "正在加载下一页…"
                      : entryList.hasMore
                        ? "上滑加载更多"
                        : "没有更多了"}
                  </p>
                ) : null}
                {entryList.items.length && entryList.error ? (
                  <p className="project-memory-state" role="alert">
                    {entryList.error}
                  </p>
                ) : null}
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
          key={selected.id}
          projectId={projectId}
          entry={selected}
          iteration={iterationByEntry.get(selected.id) || null}
          editable={editable}
          entries={entries}
          canWrite={editable}
          onSaveFileGroup={saveFileGroup}
          onDismissFileGroup={dismissFileGroup}
          onNavigateMemory={setSelectedId}
          onCreateRelation={createRelation}
          onDeleteRelation={deleteRelation}
          onChangeSubject={changeSubject}
          onChangeSubtype={changeSubtype}
          onRecheck={async () => {
            if (busyId) return;
            setBusyId(selected.id);
            try {
              await api(`/projects/${projectId}/memory/entries/${selected.id}/recheck`, {}, "POST");
              showTip("已排队重新核对来源，原话与历史依据继续保留");
              await loadJobs();
            } catch (cause) {
              showTip(cause instanceof Error ? cause.message : "无法重新核对", "error");
            } finally {
              setBusyId("");
            }
          }}
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
          onConfirm={() => setPendingAction({ kind: "supersede", entry: selected })}
          onClose={() => setSelectedId("")}
        />
      ) : null}
      {coverageOpen && jobs.find((job) => job.key === "document_memory") ? (
        <FileCoverageDialog
          job={jobs.find((job) => job.key === "document_memory")!}
          projectId={projectId}
          api={api}
          editable={editable}
          runningJob={runningJob}
          refreshVersion={refreshVersion}
          onRetry={retryFile}
          onOpen={setSelectedId}
          onClose={() => setCoverageOpen(false)}
        />
      ) : null}
      {repairOpen && repairGroups ? (
        <FileRepairDialog
          entries={repairGroups}
          editable={editable}
          onOpen={(entry) => setSelectedId(entry.id)}
          onDismiss={async (entry) => {
            if (entry.fileGroup) await dismissFileGroup(entry.fileGroup.id);
          }}
          onClose={() => setRepairOpen(false)}
        />
      ) : null}
      {discoveryHistoryOpen ? (
        <FileDiscoveryHistory
          refreshVersion={refreshVersion}
          projectId={projectId}
          api={api}
          onClose={() => setDiscoveryHistoryOpen(false)}
        />
      ) : null}
      {historyJob ? (
        <MemoryJobHistory
          refreshVersion={refreshVersion}
          job={historyJob}
          projectId={projectId}
          api={api}
          onClose={() => setHistoryJob(null)}
        />
      ) : null}
      {progressOpen ? (
        <ConversationProgressDialog
          refreshVersion={refreshVersion}
          projectId={projectId}
          api={api}
          onClose={() => setProgressOpen(false)}
        />
      ) : null}
      {sessionJob ? (
        <MemoryJobSessionDialog
          title={sessionJob.label}
          projectId={projectId}
          task={sessionJob.key}
          api={api}
          onClose={() => setSessionJob(null)}
        />
      ) : null}
      {pendingAction ? (
        <MemoryActionConfirm
          kind={pendingAction.kind}
          name={pendingAction.entry.title || ""}
          note={flagNote.trim()}
          onNoteChange={setFlagNote}
          busy={busyId === pendingAction.entry.id}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void runPendingAction()}
        />
      ) : null}
    </>
  );
}

function MemorySubtypeFilter({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string[];
  options: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const filterRef = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (disabled) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const details = filterRef.current;
      if (!details?.open || details.contains(event.target as Node)) return;
      details.open = false;
      onChange(draft);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [disabled, draft, onChange]);

  const commitDraft = () => onChange(draft);
  const toggle = (subtype: string) =>
    setDraft((current) =>
      current.includes(subtype)
        ? current.filter((item) => item !== subtype)
        : [...current, subtype],
    );
  return (
    <details
      ref={filterRef}
      className={`project-memory-subtype-filter project-memory-multi-filter${disabled ? " is-disabled" : ""}`}
      onToggle={(event) => {
        if (event.currentTarget.open) setDraft(value);
        else commitDraft();
      }}
    >
      <summary
        className="project-memory-multi-filter-input"
        aria-label="按二级类型筛选"
        aria-disabled={disabled}
      >
        <span className="project-memory-multi-filter-value">
          {value.length ? `已选 ${value.length} 项` : "全部"}
        </span>
        <UiIcon name="chevronDown" size={16} className="project-memory-multi-filter-arrow" />
      </summary>
      {!disabled ? (
        <div className="project-memory-subtype-options" role="group" aria-label="按二级类型筛选">
          <div className="project-memory-subtype-batch-actions">
            <label>
              <input type="checkbox" checked={draft.length === 0} onChange={() => setDraft([])} />
              <span>全部</span>
            </label>
            <button
              type="button"
              className="project-memory-subtype-action"
              onClick={() =>
                setDraft(
                  draft.length === 0
                    ? options
                    : options.filter((subtype) => !draft.includes(subtype)),
                )
              }
            >
              <span aria-hidden="true">⇄</span>
              <span>反选</span>
            </button>
          </div>
          {options.map((subtype) => (
            <label key={subtype}>
              <input
                type="checkbox"
                checked={draft.includes(subtype)}
                onChange={() => toggle(subtype)}
              />
              <span>{SUBTYPE_LABEL[subtype] || subtype}</span>
            </label>
          ))}
        </div>
      ) : null}
    </details>
  );
}

/** 二级弹窗：单条记忆的正文、出处、所属迭代与确认/纠错。 */
function MemoryDetail({
  projectId,
  entry,
  iteration,
  editable,
  entries,
  canWrite,
  onSaveFileGroup,
  onDismissFileGroup,
  onNavigateMemory,
  onCreateRelation,
  onDeleteRelation,
  onChangeSubject,
  onChangeSubtype,
  onRecheck,
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
  projectId: string;
  entry: MemoryEntry;
  iteration: MemoryTimelineCard | null;
  editable: boolean;
  entries: MemoryEntry[];
  canWrite: boolean;
  onSaveFileGroup: (
    groupId: string | undefined,
    input: {
      title: string;
      evidence: string;
      members: { artifactId: string; description: string }[];
    },
  ) => Promise<boolean>;
  onDismissFileGroup: (groupId: string) => Promise<void>;
  onNavigateMemory: (pageId: string) => void;
  onCreateRelation: (input: {
    fromPageId: string;
    toPageId: string;
    relation: string;
    note: string;
  }) => Promise<void>;
  onDeleteRelation: (relationId: string) => Promise<void>;
  onChangeSubject: (entryId: string, subject: string | null) => Promise<void>;
  onChangeSubtype: (entryId: string, subtype: string | null) => Promise<void>;
  onRecheck: () => Promise<void>;
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
  const status = entry.status || "current";
  const statusLabel = STATUS_LABEL[status] || status;
  const sources = (entry.sources || []).filter((source) => source?.label);
  const relations = entry.relations || [];
  const [relationKind, setRelationKind] = useState("relates");
  const [relationTarget, setRelationTarget] = useState("");
  const [relationNote, setRelationNote] = useState("");
  const [relationOpen, setRelationOpen] = useState(false);
  const [relationBusy, setRelationBusy] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState(entry.fileGroup ? entry.title || "" : "");
  const [groupEvidence, setGroupEvidence] = useState(entry.fileGroup?.evidence || "");
  const [groupMembers, setGroupMembers] = useState<string[]>(
    entry.fileGroup?.members.map((member) => member.artifactId) ||
      (entry.fileArtifactId ? [entry.fileArtifactId] : []),
  );
  const [groupDescriptions, setGroupDescriptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (entry.fileGroup?.members || []).map((member) => [
        member.artifactId,
        member.description || "",
      ]),
    ),
  );
  const [groupBusy, setGroupBusy] = useState(false);
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
            {canWrite ? (
              <SelectField
                allOption={false}
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
            {entry.subject && canWrite ? (
              <SelectField
                allOption={false}
                containerClassName="project-memory-subject-select"
                aria-label="记忆二级类型"
                flush
                value={entry.subtype || ""}
                options={[
                  { value: "", label: "未细分" },
                  ...(SUBTYPE_KEYS[entry.subject] || []).map((subtype) => ({
                    value: subtype,
                    label: SUBTYPE_LABEL[subtype] || subtype,
                  })),
                ]}
                onChange={(value) => void onChangeSubtype(entry.id, value || null)}
              />
            ) : entry.subtype ? (
              <span className="wiki-kind">{SUBTYPE_LABEL[entry.subtype] || entry.subtype}</span>
            ) : null}
            <span className="wiki-status" data-status={status}>
              {statusLabel}
            </span>
            <span>
              {entry.sourceFamily === "conversation"
                ? "群消息来源"
                : entry.sourceFamily === "project_activity"
                  ? "项目—迭代—任务来源"
                  : entry.sourceFamily === "project_file"
                    ? "项目文件来源"
                    : "来源尚未确定"}
            </span>
            {disputed ? (
              <span
                className="project-memory-dispute-badge"
                title="此条记忆附有判断或反馈，原文与生命周期独立"
              >
                有反馈
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
                  allOption={false}
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
                  allOption={false}
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
        {editable && (entry.fileGroup || entry.fileArtifactId) ? (
          <section className="project-memory-relations">
            {groupOpen ? (
              <div className="project-memory-relation-form">
                <TextField
                  aria-label="关联索引标题"
                  flush
                  value={groupTitle}
                  placeholder="关联索引标题"
                  onChange={(event) => setGroupTitle(event.target.value)}
                />
                <TextAreaField
                  label="关联依据"
                  rows={2}
                  value={groupEvidence}
                  onChange={(event) => setGroupEvidence(event.target.value)}
                />
                <p>选择相关文件（2 至 50 项）</p>
                {entries
                  .filter((item) => item.fileArtifactId && item.status === "current")
                  .map((item) => (
                    <div key={item.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={groupMembers.includes(item.fileArtifactId!)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setGroupMembers((current) =>
                              checked
                                ? [...current, item.fileArtifactId!]
                                : current.filter((id) => id !== item.fileArtifactId),
                            );
                          }}
                        />
                        {item.title || item.id}
                      </label>
                      {groupMembers.includes(item.fileArtifactId!) ? (
                        <TextField
                          aria-label={`文件作用：${item.title || item.id}`}
                          flush
                          maxLength={500}
                          placeholder="这份文件在组合中的作用（可选）"
                          value={groupDescriptions[item.fileArtifactId!] || ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setGroupDescriptions((current) => ({
                              ...current,
                              [item.fileArtifactId!]: value,
                            }));
                          }}
                        />
                      ) : null}
                    </div>
                  ))}
                <button
                  type="button"
                  className="wiki-action primary"
                  disabled={
                    groupBusy ||
                    !groupTitle.trim() ||
                    !groupEvidence.trim() ||
                    groupMembers.length < 2 ||
                    groupMembers.length > 50
                  }
                  onClick={async () => {
                    setGroupBusy(true);
                    const saved = await onSaveFileGroup(entry.fileGroup?.id, {
                      title: groupTitle.trim(),
                      evidence: groupEvidence.trim(),
                      members: groupMembers.map((artifactId) => ({
                        artifactId,
                        description: (groupDescriptions[artifactId] || "").trim(),
                      })),
                    });
                    setGroupBusy(false);
                    if (saved) setGroupOpen(false);
                  }}
                >
                  保存关联索引
                </button>
                <button type="button" className="wiki-action" onClick={() => setGroupOpen(false)}>
                  取消
                </button>
              </div>
            ) : (
              <>
                <button type="button" className="wiki-action" onClick={() => setGroupOpen(true)}>
                  {entry.fileGroup ? "修正关联文件" : "创建关联文件索引"}
                </button>
                {entry.fileGroup ? (
                  <button
                    type="button"
                    className="wiki-action"
                    onClick={() => void onDismissFileGroup(entry.fileGroup!.id)}
                  >
                    移除关联展示
                  </button>
                ) : null}
              </>
            )}
          </section>
        ) : null}
        <div className="project-memory-detail-text">
          {entry.sourceNeedsReview ? (
            <div role="alert">
              <p>原出处后来发生变化。这里保留当时记录的内容，发言本身不代表说法真实。</p>
              {editable ? (
                <button
                  type="button"
                  className="wiki-action"
                  disabled={busy}
                  onClick={() => void onRecheck()}
                >
                  重新核对来源
                </button>
              ) : null}
            </div>
          ) : null}
          {entry.body ? (
            <MarkdownDocumentPreview
              mode="preview"
              text={entry.body}
              selected={null}
              nativeSourceFrame={null}
              onMemoryNavigate={onNavigateMemory}
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
        <MemoryHistoryPanel projectId={projectId} pageId={entry.id} />
      </div>
      {editable && status !== "superseded" ? (
        <div className="project-memory-detail-actions">
          {!disputed && status !== "superseded" && !flagOpen ? (
            <button type="button" className="wiki-action" disabled={busy} onClick={onOpenFlag}>
              <UiIcon name="edit" size={12} />
              纠错
            </button>
          ) : null}
          {entry.sourceFamily === "conversation" && status === "current" ? (
            <button
              type="button"
              className="wiki-action primary"
              disabled={busy}
              onClick={onConfirm}
            >
              <UiIcon name="check" size={12} />
              作废这条记忆
            </button>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/** 人工停用和提交反馈前核对原因，执行期间禁用按钮。 */
function MemoryActionConfirm({
  kind,
  name,
  note,
  onNoteChange,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: "supersede" | "flag";
  name: string;
  note: string;
  onNoteChange: (value: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const confirming = kind === "supersede";

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
        title={confirming ? "作废这条记忆？" : "提交纠错？"}
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
            ? "作废后退出当前使用，原文、疑点和历史决定出处保留。"
            : "纠错会把它标成独立反馈，老翁下次结算会参考这条备注。"}
        </p>
        {confirming ? (
          <TextAreaField
            aria-label="作废原因"
            placeholder="请说明作废原因"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
          />
        ) : null}
        {!confirming && note ? <p className="project-memory-confirm-note">{note}</p> : null}
      </div>
      <div className="project-memory-confirm-actions">
        <button type="button" className="wiki-action" disabled={busy} onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="wiki-action primary"
          disabled={busy || (confirming && !note.trim())}
          onClick={onConfirm}
        >
          {busy ? "处理中…" : "确定"}
        </button>
      </div>
    </Dialog>
  );
}
