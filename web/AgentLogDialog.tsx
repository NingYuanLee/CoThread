import { DialogHeader } from "./DialogHeader";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AGENT_LEVEL_LABELS, formatDurationMs, labelAgentEventStatus } from "./ui-labels";
import { Dialog, animateDialogClose } from "./dialog-fx";
import { useTipError } from "./Tip";
import { laowengTaskLabel } from "../shared/agent-label.js";
import { AgentToolIcon } from "./AgentToolIcon";

import {
  type AgentLogData,
  type AgentLogEvent,
  type AgentLogScope,
  type CompactUsage,
  type TrajectoryModel,
  type TrajectoryStep,
  LANES,
  buildTrajectory,
  compactLine,
  formatClock,
  isCompactEvent,
  parseCompactUsage,
  prettyPayload,
  shortTokens,
  stepKindLabel,
  stepKindText,
  stepTabs,
} from "./trajectory-model";
import "./trajectory-thread.css";

function levelName(type: AgentLogEvent["agentType"]) {
  return type === "laoweng"
    ? AGENT_LEVEL_LABELS.laoweng
    : type === "xiaoxiang"
      ? AGENT_LEVEL_LABELS.xiaoxiang
      : AGENT_LEVEL_LABELS.child_agent;
}

function clip(text: string, max = 220) {
  const value = (text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** 步骤行的主文本：工具显示命令/工具名，其余显示摘要。 */
function stepLead(step: TrajectoryStep) {
  // 工具行写中文动作（如「询问任务进度」），不直接暴露工具 id。
  if (step.kind === "tool" || step.kind === "subtool")
    return step.title || step.event?.tool || "工具";
  return clip(step.summary || step.title);
}

/** 目标词太泛、或者主文本里已经含了这个词，就不再重复写成「→ …」。 */
const GENERIC_TARGETS = new Set([
  "任务",
  "项目目录",
  "children",
  "DSH 子 Agent",
  "命令",
  "文档",
  "会话消息",
  "项目成员",
  "代码仓库",
  "工作区文件",
  "指定消息",
]);
function stepTrail(step: TrajectoryStep) {
  if (step.kind !== "tool" && step.kind !== "subtool") return "";
  const trail = clip(step.summary);
  if (!trail || GENERIC_TARGETS.has(trail) || step.title.endsWith(trail)) return "";
  return trail;
}

/** 工具名 → 图标分类，与消息流里的 AgentToolIcon 用同一套分类。 */
const DOCUMENT_TOOLS = new Set([
  "read_document",
  "publish_artifact",
  "list_documents",
  "manage_document",
  "manage_folder",
]);
const SESSION_TOOLS = new Set([
  "project_context",
  "read_iteration",
  "list_messages",
  "read_message",
  "list_members",
  "read_member",
]);
function toolCategoryOf(step: TrajectoryStep) {
  const tool = step.event?.tool || "";
  if (tool.startsWith("sandbox_")) return "沙箱操作";
  if (DOCUMENT_TOOLS.has(tool)) return "项目文档";
  if (SESSION_TOOLS.has(tool)) return "会话资料";
  // 子 Agent 派发（tool='child_agent'）是工具调用，不是子 Agent 自己执行的工具：
  // 子工具只按 agentType 判定，这里一律按外部工具画派发行。
  return "外部工具";
}

/** 单个工具的状态；未完成不能写成「已完成」。 */
function toolStatusText(status: AgentLogEvent["status"]) {
  return status === "running" ? "进行中" : status === "failed" ? "未完成" : "完成";
}

/** 一轮工具聚合状态：只要还在跑就是进行中，有失败就是未完成。 */

type Detail = { input?: string; output?: string | null; error?: string; screenshotUrl?: string };

/** 事件详情的取数路径：wiki、老翁维护、迭代、任务各一套。 */
function eventDetailPath(scope: AgentLogScope, event: AgentLogEvent) {
  const threadId = event.threadId || (scope.type === "thread" ? scope.id : "");
  if (scope.type === "wiki") return `/wiki-sessions/events/${event.id}`;
  if (event.agentType === "laoweng") return `/projects/${scope.id}/events/${event.id}`;
  if (threadId) return `/threads/${threadId}/events/${event.id}`;
  return `/tasks/${scope.id}/events/${event.id}`;
}

/**
 * 压缩步骤行：和其它步骤一样平铺一行，不伸缩、不用图标。
 * 黄色「压缩」文字标签 + 结果文案；压缩前后用量在右侧详情的「概述」里。
 */
function CompactStep({
  step,
  detail,
  selected,
  turnStart,
  onSelect,
}: {
  step: TrajectoryStep;
  detail: Detail | undefined;
  selected: boolean;
  turnStart: boolean;
  onSelect: () => void;
}) {
  const usage = detail ? parseCompactUsage(detail.input) : null;
  const line = compactLine(step.status, usage, detail?.output);
  return (
    <div className="trajectory-step-wrap" role="listitem" data-kind="compact">
      <button
        type="button"
        className="trajectory-step"
        data-kind="compact"
        data-status={step.status}
        data-current={selected || undefined}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {turnStart && <span className="trajectory-turn-badge">第 {step.turn} 轮</span>}
        <span className="trajectory-compact-tag">压缩</span>
        <span className="trajectory-step-text">{line}</span>
      </button>
    </div>
  );
}

/** 压缩步骤的「概述」：前后用量、是否生成摘要、原因。 */
function CompactOverview({
  step,
  detail,
  onPreview,
}: {
  step: TrajectoryStep;
  detail: Detail | undefined;
  onPreview: () => void;
}) {
  const usage = detail ? parseCompactUsage(detail.input) : null;
  const pending = detail === undefined;
  const amount = (value: number | null | undefined) =>
    value != null ? `${shortTokens(value)} 词元` : pending ? "正在读取…" : "未记录";
  const rows: { label: string; value: string; action?: () => void }[] = [
    { label: "来源", value: "压缩上下文" },
    { label: "状态", value: step.event ? labelAgentEventStatus(step.event.status) : "已完成" },
    { label: "压缩前", value: amount(usage?.before) },
    { label: "压缩后", value: amount(usage?.after) },
    {
      label: "变化",
      value: usage ? (usage.changed ? "已生成摘要" : "未改变") : pending ? "正在读取…" : "未记录",
    },
    { label: "原因", value: usage?.reason || "未记录" },
    {
      label: "预览",
      value: clip(compactLine(step.status, usage, detail?.output), 40),
      action: onPreview,
    },
    { label: "开始时间", value: formatClock(step.createdAt) },
  ];
  return (
    <dl className="trajectory-overview">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {row.action ? (
              <button type="button" className="trajectory-overview-link" onClick={row.action}>
                {row.value}
              </button>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AgentTrajectory({
  scope,
  api,
}: {
  scope: AgentLogScope;
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
}) {
  const [data, setData] = useState<AgentLogData | null>(null);
  const [, setError] = useTipError();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState("概述");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const stepRefs = useRef(new Map<string, HTMLButtonElement>());
  // 轨迹分页：老事件单独留一份；列表打开时贴底，向上滚到顶继续取历史，直到第一轮。
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const stepsRef = useRef<HTMLDivElement | null>(null);
  const olderRef = useRef<AgentLogEvent[]>([]);
  const cursorRef = useRef<{ hasMore: boolean; before: string | null }>({
    hasMore: false,
    before: null,
  });
  const autoScrolled = useRef(false);
  const logBase =
    scope.type === "wiki"
      ? "/wiki-sessions"
      : scope.type === "project"
        ? `/projects/${scope.id}`
        : scope.type === "thread"
          ? `/threads/${scope.id}`
          : `/tasks/${scope.id}`;
  const logQuery = new URLSearchParams();
  if (scope.type === "project") logQuery.set("task", scope.task);
  if (scope.type === "wiki") {
    logQuery.set("scope", scope.room);
    logQuery.set("projectId", scope.id);
  }
  const logSuffix = logQuery.toString() ? `?${logQuery}` : "";

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const base = logBase;
    const suffix = logSuffix;
    const load = async () => {
      try {
        const next = await api(
          `${base}/agent-logs${suffix}`,
          undefined,
          undefined,
          controller.signal,
        );
        // 已翻过的历史页要留住：轮询只替换最新一页，老事件拼在前面。
        const older = olderRef.current;
        const events = older.length
          ? [
              ...older,
              ...next.events.filter(
                (event: AgentLogEvent) => !older.some((item) => item.id === event.id),
              ),
            ]
          : next.events;
        setData({ ...next, events });
        if (!older.length) {
          cursorRef.current = next.page || { hasMore: false, before: null };
          setHasMore(Boolean(cursorRef.current.hasMore));
        }
        setNow(Date.now());
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    scope.type,
    scope.id,
    scope.type === "project" ? scope.task : "",
    scope.type === "wiki" ? scope.room : "",
  ]);

  // 初始加载后贴底：新内容在底部，打开就能看到最近的一轮。
  useEffect(() => {
    const node = stepsRef.current;
    if (!data || !node || autoScrolled.current) return;
    node.scrollTop = node.scrollHeight;
    autoScrolled.current = true;
  }, [data]);

  // 向上滚到顶就继续取更早的一页，直到没有历史（回到第一轮）。
  const loadOlder = async () => {
    const node = stepsRef.current;
    const before = cursorRef.current.before;
    if (!node || loadingOlder || !hasMore || !before) return;
    setLoadingOlder(true);
    const previousHeight = node.scrollHeight;
    const previousTop = node.scrollTop;
    try {
      const separator = logSuffix ? "&" : "?";
      const page = await api(
        `${logBase}/agent-logs${logSuffix}${separator}before=${encodeURIComponent(before)}`,
      );
      olderRef.current = [...page.events, ...olderRef.current];
      cursorRef.current = page.page || { hasMore: false, before: null };
      setHasMore(Boolean(cursorRef.current.hasMore));
      setData((previous) =>
        previous ? { ...previous, events: [...page.events, ...previous.events] } : previous,
      );
      // 老内容插到上面会把视口推走：按插入高度把滚动位置补回来。
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const target = stepsRef.current;
          if (target) target.scrollTop = previousTop + (target.scrollHeight - previousHeight);
        });
      });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  };

  const model = useMemo<TrajectoryModel | null>(
    () => (data ? buildTrajectory(data, now) : null),
    [data, now],
  );
  const selected: TrajectoryStep | null = useMemo(
    () => model?.steps.find((step) => step.id === selectedId) || null,
    [model, selectedId],
  );
  // 每轮都显示系统提示词：cothread 的提示词随补丁/重启变化，同一会话的下一轮可能换版本。
  const visible = useMemo(
    () => (model?.steps || []).filter((step) => !step.hiddenFromList),
    [model],
  );
  const selectedTurn = selected ? model?.turns.find((turn) => turn.turn === selected.turn) : null;

  const select = (step: TrajectoryStep | null) => setSelectedId(step ? step.id : null);

  // 按需取回的事件详情（input/output）：压缩行也靠它拿到压缩前后用量。
  const [eventDetails, setEventDetails] = useState<Record<string, Detail>>({});
  const loadingDetails = useRef(new Set<string>());

  const loadDetails = async (events: AgentLogEvent[]) => {
    const pending = events.filter(
      (event) => eventDetails[event.id] === undefined && !loadingDetails.current.has(event.id),
    );
    if (!pending.length) return;
    for (const event of pending) loadingDetails.current.add(event.id);
    const next: Record<string, Detail> = {};
    await Promise.all(
      pending.map(async (event) => {
        try {
          const value = await api(eventDetailPath(scope, event));
          next[event.id] = {
            input: String(value?.input ?? ""),
            output: String(value?.output ?? ""),
            error: value?.error,
            screenshotUrl: value?.screenshotUrl,
          };
        } catch {
          next[event.id] = { input: "", output: "" };
        }
      }),
    );
    for (const event of pending) loadingDetails.current.delete(event.id);
    setEventDetails((previous) => ({ ...previous, ...next }));
  };

  // 压缩记录的结果文案在事件详情里（input 是 JSON）：进面板就补齐，不等用户点开。
  const compactEvents = useMemo(
    () => (data?.events || []).filter((event) => isCompactEvent(event)),
    [data],
  );
  const compactSignature = compactEvents.map((event) => event.id).join(",");
  useEffect(() => {
    if (!compactEvents.length) return;
    void loadDetails(compactEvents.slice(-30));
  }, [compactSignature, api, scope.type, scope.id, eventDetails]);

  // 群聊轨迹按老翁的形式逐行平铺：每个工具一行，点开在右侧看输入/输出，不再收成折叠组。
  const rows = visible.map((step) => ({ type: "step" as const, step }));

  // 助手预览按「本轮」聚合：老翁的理解（思考）和说明（正文）常在相邻两步里，
  // 只按单步取会各缺一半，所以思考、正文、工具都取这一轮的助手产出。
  const stepPeers = useMemo(
    () =>
      selected?.kind === "assistant" && model
        ? model.steps.filter((step) => step.kind === "assistant" && step.turn === selected.turn)
        : [],
    [selected?.id, model],
  );
  const requestStep = useMemo(
    () =>
      selected?.requestId && model
        ? model.steps.find((step) => step.id === selected.requestId) || null
        : null,
    [selected?.id, model],
  );

  // 「原始内容」按块列出本次返回的内容，只取同轮同一步的事件。
  const stepOwnPeers = useMemo(
    () => stepPeers.filter((step) => step.stepNo === selected?.stepNo),
    [stepPeers, selected?.stepNo],
  );

  // 工具只看「这次模型返回」调用的：与本助手行同轮同一步，整轮聚合会把别的返回算进来。
  const stepTools = useMemo(
    () =>
      selected?.kind === "assistant" && model
        ? model.steps.filter(
            (step) =>
              (step.kind === "tool" || step.kind === "subtool") &&
              step.turn === selected.turn &&
              step.stepNo === selected.stepNo,
          )
        : [],
    [selected?.id, model],
  );

  // 「原始内容」要工具调用的参数：只在打开该标签时补取。
  const [blockRaw, setBlockRaw] = useState<Record<string, Detail>>({});
  const toolSignature = stepTools.map((step) => step.event?.id || step.id).join(",");
  useEffect(() => {
    if (tab !== "原始内容" || selected?.kind !== "assistant" || !stepTools.length) return;
    const missing = stepTools
      .filter((step) => step.event && blockRaw[step.event.id] === undefined)
      .slice(0, 20);
    if (!missing.length) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      const next: Record<string, Detail> = {};
      for (const step of missing) {
        if (!step.event) continue;
        try {
          const value = await api(
            eventDetailPath(scope, step.event),
            undefined,
            undefined,
            controller.signal,
          );
          next[step.event.id] = {
            input: String(value?.input ?? ""),
            output: String(value?.output ?? ""),
          };
        } catch {
          next[step.event.id] = { input: "", output: "" };
        }
      }
      if (!cancelled) setBlockRaw((previous) => ({ ...previous, ...next }));
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tab, toolSignature, api, scope.type, scope.id, blockRaw]);

  // 助手预览要正文与思考全文，列表接口只给预览片段，这里按需补取并缓存。
  const [stepTexts, setStepTexts] = useState<Record<string, string>>({});
  const peerSignature = stepPeers.map((step) => step.event?.id || step.id).join(",");
  useEffect(() => {
    if (!stepPeers.length) return;
    const missing = stepPeers
      .filter((step) => step.event && stepTexts[step.event.id] === undefined)
      .slice(0, 80);
    if (!missing.length) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const step of missing) {
        if (!step.event) continue;
        try {
          const value = await api(
            eventDetailPath(scope, step.event),
            undefined,
            undefined,
            controller.signal,
          );
          next[step.event.id] = String(value?.output ?? value?.input ?? "");
        } catch {
          next[step.event.id] = "";
        }
      }
      if (!cancelled) setStepTexts((previous) => ({ ...previous, ...next }));
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [peerSignature, api, scope.type, scope.id, stepTexts]);

  useEffect(() => {
    if (!selectedId) return;
    const node = stepRefs.current.get(selectedId);
    const list = node?.closest(".trajectory-steps");
    if (!node || !(list instanceof HTMLElement)) return;
    const nodeRect = node.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (nodeRect.top < listRect.top) list.scrollTop -= listRect.top - nodeRect.top;
    else if (nodeRect.bottom > listRect.bottom) list.scrollTop += nodeRect.bottom - listRect.bottom;
  }, [selectedId]);

  useEffect(() => {
    const tabs = selected ? stepTabs(selected.kind) : [];
    if (tabs.length && !tabs.includes(tab)) setTab(tabs[0]);
  }, [selectedId]);

  useEffect(() => {
    const event = selected?.event;
    if (!event) {
      setDetail(null);
      setDetailError("");
      setDetailLoading(false);
      return;
    }
    const path = eventDetailPath(scope, event);
    const controller = new AbortController();
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    api(path, undefined, undefined, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setDetail({
          input: value.input,
          output: value.output,
          error: value.error,
          screenshotUrl: value.screenshotUrl,
        });
        setDetailLoading(false);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setDetailError((cause as Error).message);
        setDetailLoading(false);
      });
    return () => controller.abort();
  }, [
    selected?.event?.id,
    selected?.event?.agentType,
    selected?.event?.threadId,
    scope.type,
    scope.id,
  ]);

  // 三条泳道共用一条轴：全部事件按时间顺序等宽占位，某行没有事件就是空白。
  // 老翁的事件耗时是毫秒级甚至未记录、会话跨度却按天算，真时间轴会把色块压成点。
  const axisSpans = model?.spans || [];
  const axisCount = Math.max(1, axisSpans.length);
  const axisSlot = 100 / axisCount;
  const axisIndex = new Map(axisSpans.map((span, index) => [span.id, index]));
  const placeSpan = (id: string) => ({
    left: `${(axisIndex.get(id) ?? 0) * axisSlot}%`,
    width: `${Math.max(0.4, axisSlot - 0.12)}%`,
  });

  return (
    <div className="trajectory-panel">
      <section className="trajectory-lanes" aria-label="技术数据">
        {LANES.map((lane) => {
          const laneSpans = (model?.spans || []).filter((span) => span.lane === lane.id);
          return (
            <div className="trajectory-lane" data-lane={lane.id} key={lane.id}>
              <span className="trajectory-lane-label">{lane.label}</span>
              <div className="trajectory-lane-track">
                {laneSpans.map((span) => (
                  <button
                    type="button"
                    key={span.id}
                    className="trajectory-span"
                    data-kind={span.kind}
                    data-current={span.id === selectedId || undefined}
                    aria-label={span.label}
                    title={span.label}
                    style={placeSpan(span.id)}
                    onClick={() => select(model?.steps.find((item) => item.id === span.id) || null)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <div className="trajectory-body">
        <div
          className="trajectory-steps"
          role="list"
          aria-label="步骤列表"
          ref={stepsRef}
          onScroll={(event) => {
            if (event.currentTarget.scrollTop < 48) void loadOlder();
          }}
        >
          {loadingOlder ? (
            <p className="trajectory-empty" role="status">
              正在加载更早的记录…
            </p>
          ) : null}
          {rows.map((row) =>
            isCompactEvent(row.step.event) ? (
              <CompactStep
                key={row.step.id}
                step={row.step}
                detail={row.step.event ? eventDetails[row.step.event.id] : undefined}
                selected={row.step.id === selectedId}
                turnStart={row.step.turnStart}
                onSelect={() => select(row.step)}
              />
            ) : (
              <div
                className="trajectory-step-wrap"
                key={row.step.id}
                role="listitem"
                data-kind={row.step.kind}
              >
                {/* 请求圆点独立放在本行与上一行之间：点它选请求，点行选这一步，互不遮挡。 */}
                {row.step.requestId && (
                  <button
                    type="button"
                    className="trajectory-request-dot"
                    data-on={row.step.requestId === selectedId || undefined}
                    aria-label="选择这次模型请求"
                    title="模型请求"
                    onClick={() =>
                      select(model?.steps.find((item) => item.id === row.step.requestId) || null)
                    }
                  />
                )}
                <button
                  type="button"
                  ref={(node) => {
                    if (node) stepRefs.current.set(row.step.id, node);
                    else stepRefs.current.delete(row.step.id);
                  }}
                  className="trajectory-step"
                  data-kind={row.step.kind}
                  data-status={row.step.status}
                  data-error={row.step.isError || undefined}
                  data-current={row.step.id === selectedId || undefined}
                  aria-pressed={row.step.id === selectedId}
                  onClick={() => select(row.step)}
                >
                  {row.step.turnStart && (
                    <span className="trajectory-turn-badge">第 {row.step.turn} 轮</span>
                  )}
                  <span className="trajectory-step-kind">{stepKindText(row.step)}</span>
                  <span className="trajectory-step-text">
                    {stepLead(row.step)}
                    {stepTrail(row.step) && <em> → {stepTrail(row.step)}</em>}
                  </span>
                </button>
              </div>
            ),
          )}
          {data && !visible.length && <p className="trajectory-empty">还没有轨迹记录。</p>}
        </div>

        <aside className="trajectory-detail" aria-label="步骤详情">
          {!selected ? (
            <p className="trajectory-empty">选择左侧步骤查看详情</p>
          ) : (
            <>
              <header className="trajectory-detail-head">
                <strong>{stepKindText(selected)}</strong>
                <small>
                  第 {selected.turn} 轮 ·{" "}
                  {selected.stepNo > 0
                    ? `第 ${selected.stepNo} 步`
                    : selected.kind === "user" || selected.kind === "context"
                      ? "消息"
                      : "不计步"}
                </small>
                <button
                  type="button"
                  className="trajectory-detail-close"
                  aria-label="关闭详情"
                  onClick={() => select(null)}
                >
                  ×
                </button>
              </header>
              <nav className="trajectory-tabs" role="tablist" aria-label="详情标签">
                {stepTabs(selected.kind).map((name) => (
                  <button
                    type="button"
                    role="tab"
                    key={name}
                    aria-selected={tab === name}
                    onClick={() => setTab(name)}
                  >
                    {name}
                  </button>
                ))}
              </nav>
              <div className="trajectory-tab-body">
                {tab === "概述" && isCompactEvent(selected.event) ? (
                  <CompactOverview
                    step={selected}
                    detail={selected.event ? eventDetails[selected.event.id] : undefined}
                    onPreview={() => setTab("预览")}
                  />
                ) : tab === "概述" && selected.kind === "user" ? (
                  <InputOverview
                    step={selected}
                    sourceLabel={selected.input?.from === "coordinator" ? "小祥派活" : "用户"}
                    onSource={() => setTab("来源")}
                    onPreview={() => setTab("预览")}
                  />
                ) : tab === "概述" && selected.kind === "assistant" ? (
                  <AssistantOverview
                    step={selected}
                    request={requestStep}
                    onSelectRequest={select}
                    onPreview={() => setTab("预览")}
                  />
                ) : tab === "预览" && selected.kind === "assistant" ? (
                  <AssistantPreview
                    peers={stepPeers}
                    tools={stepTools}
                    texts={stepTexts}
                    onSelect={select}
                  />
                ) : tab === "原始内容" && selected.kind === "assistant" ? (
                  <AssistantRawBlocks
                    peers={stepOwnPeers}
                    tools={stepTools}
                    texts={stepTexts}
                    raw={blockRaw}
                  />
                ) : (
                  renderTab(selected, tab, detail, detailLoading, detailError, data, setTab)
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function overviewRows(step: TrajectoryStep) {
  // 请求不是工具：它的 event 只是为了拿模型、用量和时长，不能把产出事件当「工具」写出来。
  if (step.kind === "request") {
    const usage = step.event?.usage;
    const rows: [string, string][] = [["类型", "请求"]];
    rows.push(["状态", step.event ? labelAgentEventStatus(step.event.status) : "已完成"]);
    if (usage?.model) rows.push(["模型", usage.model]);
    if (step.event) rows.push(["执行者", levelName(step.event.agentType)]);
    if (usage?.totalTokens != null) rows.push(["词元", `${usage.totalTokens} tokens`]);
    rows.push(["开始时间", formatClock(step.createdAt)]);
    rows.push(["时长", step.durationMs != null ? formatDurationMs(step.durationMs) : "未记录"]);
    return rows;
  }
  const rows: [string, string][] = [["类型", stepKindLabel(step.kind)]];
  rows.push(["状态", step.event ? labelAgentEventStatus(step.event.status) : "已完成"]);
  if (step.event?.tool) rows.push(["工具", step.event.tool]);
  if (step.event) rows.push(["执行者", levelName(step.event.agentType)]);
  if (step.event?.task) rows.push(["维护任务", laowengTaskLabel(step.event.task)]);
  rows.push(["开始时间", formatClock(step.createdAt)]);
  rows.push(["时长", step.durationMs != null ? formatDurationMs(step.durationMs) : "未记录"]);
  if (step.event?.error) rows.push(["错误", step.event.error]);
  return rows;
}

function RowList({ rows }: { rows: [string, string][] }) {
  return (
    <dl>
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 注入来源的中文标签：工作区规则 / 行为提醒 / 轮级上下文。 */
function noticeKindLabel(kind: string) {
  if (kind.startsWith("system-agents-md") || kind === "agents-md") return "工作区规则";
  if (kind === "notice" || kind.endsWith("-notice")) return "行为提醒";
  if (kind.startsWith("cothread")) return "轮级上下文";
  return kind;
}

/** 文件大小：B/KB/MB，够看就行。 */
function fileSize(size?: number | null) {
  if (size == null || !Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: { name: string; mime?: string | null }) {
  return (
    String(file.mime || "").startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || "")
  );
}

/** 用户「预览」：消息正文 + 引用的文件列表。 */
function UserPreview({ step, detail }: { step: TrajectoryStep; detail: Detail | null }) {
  const body = step.input?.body || detail?.input || step.summary || "";
  const files = step.input?.files || [];
  return (
    <div className="trajectory-preview">
      <section className="trajectory-preview-block">
        <h4>消息内容</h4>
        <pre>{body || "没有记录消息正文"}</pre>
      </section>
      <section className="trajectory-preview-block">
        <h4>文件列表 · {files.length}</h4>
        {files.length ? (
          <ul className="trajectory-file-list">
            {files.map((file) => (
              <li key={file.id} data-image={isImageFile(file) || undefined}>
                <span className="trajectory-file-name">{file.name || file.id}</span>
                <span className="trajectory-file-meta">
                  {[isImageFile(file) ? "图片" : file.mime || "文件", fileSize(file.size)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="trajectory-empty">这条消息没有附件</p>
        )}
      </section>
    </div>
  );
}

/** 用户「原始内容」：按块列出图片/文件与正文，块 #1 是图片、块 #2 是文本。 */
function UserRawBlocks({ step, detail }: { step: TrajectoryStep; detail: Detail | null }) {
  const files = step.input?.files || [];
  const body = step.input?.body || detail?.input || step.summary || "";
  const blocks = [
    ...files.map((file) => ({
      id: `file:${file.id}`,
      kind: isImageFile(file) ? "image" : "file",
      name: file.name || file.id,
      body: [
        file.name || file.id,
        [file.mime || "", fileSize(file.size)].filter(Boolean).join(" · "),
      ]
        .filter(Boolean)
        .join("\n"),
    })),
    ...(body || !files.length
      ? [{ id: "text", kind: "text", name: "", body: body || "没有记录消息正文" }]
      : []),
  ];
  if (!blocks.length) return <p className="trajectory-empty">这条消息没有可展示的内容块</p>;
  return (
    <div className="trajectory-blocks">
      {blocks.map((block, at) => (
        <section className="trajectory-block" data-type={block.kind} key={block.id}>
          <div className="trajectory-block-head">
            <span className="trajectory-block-no">块 #{at + 1}</span>
            <span className="trajectory-block-type">{block.kind}</span>
            {block.name ? <span className="trajectory-block-name">{block.name}</span> : null}
          </div>
          <pre>{block.body}</pre>
        </section>
      ))}
    </div>
  );
}

/** 上下文「原始内容」：和用户消息一样按块列出注入的内容块（块 #1 是正文文本）。 */
function ContextRawBlocks({
  step,
  detail,
  loading,
}: {
  step: TrajectoryStep;
  detail: Detail | null;
  loading: boolean;
}) {
  const body = detail?.input || step.summary || "";
  if (loading && !body) return <p className="trajectory-empty">正在读取注入内容…</p>;
  if (!body) return <p className="trajectory-empty">这条上下文没有可展示的内容块</p>;
  return (
    <div className="trajectory-blocks">
      <section className="trajectory-block" data-type="text">
        <div className="trajectory-block-head">
          <span className="trajectory-block-no">块 #1</span>
          <span className="trajectory-block-type">text</span>
        </div>
        <pre>{body}</pre>
      </section>
    </div>
  );
}

/**
 * JSON 彩色展示：键、字符串、数字、布尔/null 用不同颜色。
 * 传入对象或 JSON 字符串；不是合法 JSON 就原样显示（不报错、不吞内容）。
 */
function JsonView({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : (JSON.stringify(value ?? null, null, 2) ?? "");
  let pretty = text;
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    pretty = text;
  }
  const TOKEN =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = TOKEN.exec(pretty))) {
    if (match.index > last) nodes.push(pretty.slice(last, match.index));
    const [whole, str, colon, literal, number] = match;
    if (str) {
      nodes.push(
        <span key={index++} className={colon ? "trajectory-json-key" : "trajectory-json-string"}>
          {str}
        </span>,
      );
      if (colon) nodes.push(colon);
    } else if (literal) {
      nodes.push(
        <span key={index++} className="trajectory-json-literal">
          {literal}
        </span>,
      );
    } else if (number) {
      nodes.push(
        <span key={index++} className="trajectory-json-number">
          {number}
        </span>,
      );
    } else {
      nodes.push(whole);
    }
    last = match.index + whole.length;
  }
  if (last < pretty.length) nodes.push(pretty.slice(last));
  return <pre className="trajectory-json">{nodes}</pre>;
}

/**
 * 上下文「来源」：DSH 的注入来源是一个对象（kind/form/summary…），
 * 逐字段列出来，再附一份原始 JSON 便于核对。
 */
function ContextSource({ detail, loading }: { detail: Detail | null; loading: boolean }) {
  const raw = detail?.output || "";
  if (loading && !raw) return <p className="trajectory-empty">正在读取来源元数据…</p>;
  if (!raw) return <p className="trajectory-empty">这条上下文没有来源元数据</p>;
  // 来源就是注入元数据本身：彩色 JSON，不再拆成字段清单。
  return (
    <div className="trajectory-preview">
      <JsonView value={raw} />
    </div>
  );
}

/**
 * 用户 / 上下文的「概述」：来源（可点进来源页）、状态、预览（可点进预览页）、开始时间。
 * 两种输入行结构一致，只有来源取值不同：用户写「用户」，上下文写注入的 kind。
 */
function InputOverview({
  step,
  sourceLabel,
  onSource,
  onPreview,
}: {
  step: TrajectoryStep;
  sourceLabel: string;
  onSource: () => void;
  onPreview: () => void;
}) {
  const rows: { label: string; value: string; action?: () => void }[] = [
    { label: "来源", value: sourceLabel, action: onSource },
    { label: "状态", value: step.event ? labelAgentEventStatus(step.event.status) : "已完成" },
    { label: "预览", value: clip(step.summary || "无预览", 50), action: onPreview },
    { label: "开始时间", value: formatClock(step.createdAt) },
  ];
  return (
    <dl className="trajectory-overview">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {row.action ? (
              <button type="button" className="trajectory-overview-link" onClick={row.action}>
                {row.value}
              </button>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 毫秒 → 「多少分多少秒」；没记录就直说。 */
function formatSpan(ms?: number | null) {
  if (ms == null || !Number.isFinite(ms)) return "未记录";
  if (ms < 1000) return `${Math.round(ms)} 毫秒`;
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

/** 北京时间，和用户所在时区无关。 */
function beijingClock(value: string) {
  const text = String(value || "");
  const date = new Date(text.includes("T") ? text : text.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "未记录";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** 助手「概述」：请求来源、状态、Token、预览入口、时间与吞吐。 */
function AssistantOverview({
  step,
  request,
  onSelectRequest,
  onPreview,
}: {
  step: TrajectoryStep;
  request: TrajectoryStep | null;
  onSelectRequest: (step: TrajectoryStep) => void;
  onPreview: () => void;
}) {
  const usage = step.event?.usage || null;
  const duration = step.durationMs ?? usage?.executionDurationMs ?? usage?.modelMs ?? null;
  const throughput =
    usage?.decodeMs && usage?.decodeTokens
      ? `${(usage.decodeTokens / (usage.decodeMs / 1000)).toFixed(1)} tok/s`
      : "未记录";
  const rows: { label: string; value: string; action?: () => void }[] = [
    {
      label: "来源",
      value: `请求 #${step.stepNo || "?"}`,
      action: request ? () => onSelectRequest(request) : undefined,
    },
    { label: "状态", value: labelAgentEventStatus(step.status) },
    {
      label: "Token",
      value: usage?.totalTokens != null ? `${usage.totalTokens} tok` : "未记录",
    },
    { label: "预览", value: "查看预览", action: onPreview },
    { label: "开始时间", value: beijingClock(step.createdAt) },
    { label: "总时长", value: formatSpan(duration) },
    { label: "首 token 延迟", value: formatSpan(usage?.ttftMs) },
    { label: "生成耗时", value: formatSpan(usage?.decodeMs) },
    { label: "吞吐量", value: throughput },
  ];
  return (
    <dl className="trajectory-overview">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {row.action ? (
              <button type="button" className="trajectory-overview-link" onClick={row.action}>
                {row.value}
              </button>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 助手「原始内容」：按本次模型返回的内容块列出 thing / text / tool-call。 */
function AssistantRawBlocks({
  peers,
  tools,
  texts,
  raw,
}: {
  peers: TrajectoryStep[];
  tools: TrajectoryStep[];
  texts: Record<string, string>;
  raw: Record<string, Detail>;
}) {
  // 一次返回最多一个 thing、一个 text、一个 tool-call：多个工具收进同一个 tool-call 块。
  const isThing = (step: TrajectoryStep) =>
    step.event?.tool === "thinking" || step.event?.tool === "understanding";
  const collect = (list: TrajectoryStep[]) =>
    list
      .map((step) => (step.event ? texts[step.event.id] : undefined))
      .filter((text): text is string => text !== undefined);
  const hasThing = peers.some(isThing);
  const hasText = peers.some((step) => !isThing(step));
  const blocks: { id: string; kind: string; name: string; body: string }[] = [];
  if (hasThing) {
    const thing = collect(peers.filter(isThing));
    blocks.push({
      id: "thing",
      kind: "thing",
      name: "",
      body: thing.length ? thing.join("\n\n") || "（空块）" : "正在读取…",
    });
  }
  if (hasText) {
    const text = collect(peers.filter((step) => !isThing(step)));
    blocks.push({
      id: "text",
      kind: "text",
      name: "",
      body: text.length ? text.join("\n\n") || "（空块）" : "正在读取…",
    });
  }
  if (tools.length) {
    const calls = tools.map((step) => {
      const value = step.event ? raw[step.event.id] : undefined;
      const input = value ? prettyPayload(value.input) || value.input : "";
      return {
        name: step.event?.tool || step.title,
        args: value === undefined ? null : input || step.event?.target || "（没有参数）",
      };
    });
    blocks.push({
      id: "tool-call",
      kind: "tool-call",
      name: `${tools.length} 个工具`,
      body: calls
        .map((tool) => `${tool.name}\n${tool.args === null ? "正在读取参数…" : tool.args}`)
        .join("\n\n"),
    });
  }
  if (!blocks.length) return <p className="trajectory-empty">这条助手记录没有可展示的内容块</p>;
  return (
    <div className="trajectory-blocks">
      {blocks.map((block, at) => (
        <section className="trajectory-block" data-type={block.kind} key={block.id}>
          <div className="trajectory-block-head">
            <span className="trajectory-block-no">块 #{at + 1}</span>
            <span className="trajectory-block-type">{block.kind}</span>
            {block.name ? <span className="trajectory-block-name">{block.name}</span> : null}
          </div>
          <pre>{block.body}</pre>
        </section>
      ))}
    </div>
  );
}

/**
 * 助手预览：思考（默认收起，点开看全文）→ 正文 → 本步工具清单。
 * 点工具等于选中左侧对应的工具步，右侧随后显示该工具详情。
 */
function AssistantPreview({
  peers,
  tools,
  texts,
  onSelect,
}: {
  peers: TrajectoryStep[];
  tools: TrajectoryStep[];
  texts: Record<string, string>;
  onSelect: (step: TrajectoryStep) => void;
}) {
  const textOf = (step: TrajectoryStep) => (step.event ? texts[step.event.id] || "" : "");
  const pending = (list: TrajectoryStep[]) =>
    list.some((step) => step.event && texts[step.event.id] === undefined);
  // 模型的思考段：DSH 线程记 thinking，问老翁记 understanding（理解）。
  const isThinking = (step: TrajectoryStep) =>
    step.event?.tool === "thinking" || step.event?.tool === "understanding";
  const thinking = peers.filter(isThinking);
  const body = peers.filter((step) => !isThinking(step));
  const thinkReady = !pending(thinking);
  const bodyReady = !pending(body);
  const thinkText = thinkReady ? thinking.map(textOf).filter(Boolean).join("\n\n") : "";
  const bodyText = bodyReady ? body.map(textOf).filter(Boolean).join("\n\n") : "";
  // 有独立「说明」时思考归思考、回答归正文；只在「理解」里作答的轮次，正文直接用这段文本，不重复展示。
  const split = Boolean(thinkText && bodyText);
  const bodyShown = bodyText || thinkText;
  const thinkShown = split
    ? thinkText
    : thinkText
      ? "本轮没有单独的思考段，回答直接写在正文里。"
      : "本轮没有记录思考内容。";
  const thinkDisplay = thinkReady ? thinkShown : "正在读取思考…";
  const bodyDisplay = bodyReady ? bodyShown || "本轮没有正文输出" : "正在读取正文…";
  return (
    <div className="trajectory-assistant-preview">
      <details className="trajectory-think">
        <summary>
          思考
          {split ? <em> · {thinkText.length} 字</em> : null}
        </summary>
        <pre>{thinkDisplay}</pre>
      </details>
      <section className="trajectory-preview-block">
        <h4>正文</h4>
        <pre>{bodyDisplay}</pre>
      </section>
      <section className="trajectory-preview-block">
        <h4>本次工具 · {tools.length}</h4>
        {tools.length ? (
          <ul className="trajectory-step-tools">
            {tools.map((tool) => (
              <li key={tool.id}>
                <button type="button" onClick={() => onSelect(tool)}>
                  <span className="trajectory-step-tools-name">
                    {tool.event?.tool || tool.title}
                  </span>
                  <span className="trajectory-step-tools-meta">
                    {tool.status === "failed"
                      ? "失败"
                      : tool.status === "running"
                        ? "进行中"
                        : "完成"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="trajectory-empty">这次模型返回没有调用工具</p>
        )}
      </section>
    </div>
  );
}

function renderTab(
  step: TrajectoryStep,
  tab: string,
  detail: Detail | null,
  loading: boolean,
  error: string,
  data: AgentLogData | null,
  onTab: (tab: string) => void,
) {
  const rawInput = prettyPayload(detail?.input) || step.input?.preview || "";
  const rawOutput = prettyPayload(detail?.output) || step.summary || "";
  if (tab === "系统提示词") {
    // 每轮系统提示词都可能不同（补丁/重启后会换版本），本轮有落库就用本轮的，否则退回当前版本。
    const turnPrompt = detail?.input || "";
    const sections = turnPrompt ? [] : data?.systemSections || [];
    return (
      <div className="trajectory-preview">
        {sections.length ? (
          <section className="trajectory-preview-block">
            <h4>分段 · {sections.length}</h4>
            <ul className="trajectory-file-list">
              {sections.map((section) => (
                <li key={section.name}>
                  <span className="trajectory-file-name">{section.name}</span>
                  <span className="trajectory-file-meta">
                    顺序 {section.order} · {section.text.length} 字
                    {section.source ? ` · ${section.source}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="trajectory-preview-block">
          <h4>{turnPrompt ? "本轮系统提示词" : "当前系统提示词（本轮未单独落库）"}</h4>
          <pre>{turnPrompt || data?.systemPrompt || "未记录：本轮系统提示词还没有落库。"}</pre>
        </section>
      </div>
    );
  }
  if (tab === "工具" && step.kind === "system")
    return (
      <pre>{data?.tools?.length ? data.tools.join("\n") : "未记录：可用工具清单还没有落库。"}</pre>
    );
  if (tab === "工具" && step.event?.tool) return <pre>{step.event.tool}</pre>;
  if (tab === "概述" && step.kind === "context") {
    const kind =
      step.event?.noticeKind ||
      (step.event?.tool === "context_sync" ? "cothread:turn-context" : step.event?.tool) ||
      "上下文";
    return (
      <InputOverview
        step={step}
        sourceLabel={kind}
        onSource={() => onTab("来源")}
        onPreview={() => onTab("预览")}
      />
    );
  }
  if (tab === "概述") return <RowList rows={overviewRows(step)} />;
  if (tab === "预览" && step.kind === "user") return <UserPreview step={step} detail={detail} />;
  if (tab === "预览" && step.kind === "context")
    return (
      <pre>
        {loading
          ? "正在读取注入内容…"
          : detail?.input || step.summary || "未记录：注入内容还没有落库。"}
      </pre>
    );
  if (tab === "预览") return <pre>{clip(step.summary || rawOutput, 4000) || "无内容"}</pre>;
  if (tab === "原始内容" && step.kind === "user")
    return <UserRawBlocks step={step} detail={detail} />;
  if (tab === "原始内容" && step.kind === "context")
    return <ContextRawBlocks step={step} detail={detail} loading={loading} />;
  if (tab === "原始内容")
    return (
      <pre>
        {loading ? "正在读取原始内容…" : error || rawOutput || "未记录：原始内容还没有落库。"}
      </pre>
    );
  if (tab === "来源" && step.kind === "context")
    return <ContextSource detail={detail} loading={loading} />;
  if (tab === "来源" && step.kind === "user") {
    // 线程里有输入记录；老翁的提问是事件，按事件字段 + 正文拼成同样的 JSON 形状。
    const source = step.input
      ? { ...step.input }
      : step.event
        ? {
            id: step.event.id,
            tool: step.event.tool,
            status: step.event.status,
            createdAt: step.event.createdAt,
            finishedAt: step.event.finishedAt ?? null,
            agentSessionId: step.event.agentSessionId,
            taskId: step.event.taskId,
            messageId: step.event.messageId,
            threadId: step.event.threadId,
            content: loading ? "正在读取…" : detail?.input || step.summary || "",
          }
        : null;
    return source ? <JsonView value={source} /> : <pre>{"未记录：这条用户输入没有落库。"}</pre>;
  }
  if (tab === "来源")
    return (
      <RowList
        rows={[
          ["作用域", step.event?.threadId ? "迭代" : step.event ? "项目 / 任务" : "输入"],
          ["消息", step.event?.messageId || step.input?.messageId || "未记录"],
          ["会话", step.event?.agentSessionId || "未记录"],
          ["任务", step.event?.taskId || "未记录"],
        ]}
      />
    );
  if (tab === "选项") {
    const usage = step.event?.usage;
    if (!usage) return <pre>未记录：请求选项还没有落库。</pre>;
    return (
      <RowList
        rows={[
          ["模型", usage.model || "未记录"],
          ["推理档位", usage.reasoningEffort || "未记录"],
          ["设置版本", usage.settingsVersion != null ? String(usage.settingsVersion) : "未记录"],
          ["模型调用次数", usage.calls != null ? String(usage.calls) : "未记录"],
          ["消息", step.event?.messageId || "未记录"],
          ["会话", step.event?.agentSessionId || "未记录"],
        ]}
      />
    );
  }
  if (tab === "用量") {
    const usage = step.event?.usage;
    const token = (value?: number) => (value != null ? String(value) : "未记录");
    return (
      <RowList
        rows={[
          ["输入 tokens", token(usage?.inputTokens)],
          ["缓存读 tokens", token(usage?.cacheReadTokens)],
          ["缓存写 tokens", token(usage?.cacheWriteTokens)],
          ["输出 tokens", token(usage?.outputTokens)],
          ["总 tokens", token(usage?.totalTokens)],
          ["解码 tokens", token(usage?.decodeTokens)],
        ]}
      />
    );
  }
  if (tab === "计时") {
    const usage = step.event?.usage;
    const span = (value?: number | null) => (value != null ? formatDurationMs(value) : "未记录");
    const durationMs = usage?.executionDurationMs ?? step.durationMs ?? null;
    // 事件表的 finished_at 是写入时刻，和 created_at 同一秒；有实测时长就用「开始 + 总时长」推算结束。
    // 事件表的 finished_at 只是写入时刻（和 created_at 同秒），拿它当结束时间会误导；
    // 这里给开始时间 + 实测总时长，两者相加就是真实的结束时刻。
    return (
      <RowList
        rows={[
          ["开始时间", beijingClock(step.createdAt)],
          ["总时长", span(durationMs)],
          ["首 token", span(usage?.ttftMs)],
          ["生成耗时", span(usage?.decodeMs)],
        ]}
      />
    );
  }
  if (tab === "代码") return <pre>{step.event?.tool || "未记录：工具代码还没有落库。"}</pre>;
  if (tab === "参数")
    return (
      <pre>{loading ? "正在读取参数…" : error || rawInput || step.summary || "未记录参数"}</pre>
    );
  if (tab === "结果")
    return (
      <>
        {detail?.screenshotUrl && (
          <img
            className="agent-screenshot-preview"
            src={detail.screenshotUrl}
            alt="Agent 视觉验收截图"
          />
        )}
        <pre>{loading ? "正在读取结果…" : error || rawOutput || "未记录结果"}</pre>
      </>
    );
  if (tab === "Schema") return <pre>未记录：Schema 还没有落库。</pre>;
  return <pre>无内容</pre>;
}

export function AgentLogDialog({
  scope,
  api,
  onClose,
}: {
  scope: AgentLogScope;
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <Dialog
      onRequestClose={onClose}
      ref={dialog}
      className="agent-log-dialog"
      aria-labelledby="agent-log-dialog-title"
    >
      <DialogHeader
        title={<>轨迹</>}
        titleId="agent-log-dialog-title"
        subtitle={<>DSH 轨迹</>}
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭轨迹"
      />
      <AgentTrajectory scope={scope} api={api} />
    </Dialog>
  );
}
