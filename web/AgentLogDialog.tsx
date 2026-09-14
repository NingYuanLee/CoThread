import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatDurationMs, labelAgentEventStatus } from "./ui-labels";

type AgentLogScope = { type: "project" | "thread" | "task"; id: string };
type AgentLogEvent = {
  id: string;
  agentType: "l1" | "l2" | "dsh_l3";
  agentSessionId: string | null;
  taskId: string | null;
  tool: string;
  action: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error?: string;
};
type AgentLogData = { title: string; events: AgentLogEvent[] };
type TimelineKind = "user" | "message" | "tool";
type TimelineSpan = {
  event: AgentLogEvent;
  start: number;
  end: number;
  kind: TimelineKind;
  lane: 0 | 1 | 2;
  isError: boolean;
};
type TimelineModel = { start: number; end: number; spans: TimelineSpan[] };

function formatTime(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z")
    .toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function timestamp(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").getTime();
}

function levelName(type: AgentLogEvent["agentType"]) {
  return type === "l1" ? "一级小祥" : type === "l2" ? "二级小祥" : "三级小祥";
}

function eventKind(event: AgentLogEvent): TimelineKind {
  if (event.agentType === "l1") return "message";
  return ["thinking", "assistant_text", "assistant_final"].includes(event.tool) ? "message" : "tool";
}

function buildTimeline(events: AgentLogEvent[], now: number): TimelineModel | null {
  const raw = events.map((event) => {
    const start = timestamp(event.createdAt);
    const finished = event.finishedAt ? timestamp(event.finishedAt) : (event.status === "running" ? now : start);
    const kind = eventKind(event);
    return {
      event,
      start,
      end: Math.max(finished, start + 1),
      kind,
      lane: (kind === "message" ? 1 : 2) as 1 | 2,
      isError: event.status === "failed",
    };
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  if (!raw.length) return null;
  let removedIdle = 0;
  let coveredUntil: number | null = null;
  const offsetById = new Map<string, number>();
  for (const span of raw) {
    if (coveredUntil !== null && span.start > coveredUntil) removedIdle += span.start - coveredUntil;
    offsetById.set(span.event.id, removedIdle);
    coveredUntil = coveredUntil === null ? span.end : Math.max(coveredUntil, span.end);
  }
  const spans = raw.map((span) => {
    const offset = offsetById.get(span.event.id) || 0;
    return { ...span, start: span.start - offset, end: span.end - offset };
  });
  const start = Math.min(...spans.map((span) => span.start));
  const end = Math.max(...spans.map((span) => span.end));
  if (end - start < 50) {
    return {
      start: 0,
      end: spans.length,
      spans: spans.map((span, index) => ({ ...span, start: index, end: index + 1 })),
    };
  }
  return { start, end, spans };
}

export function AgentLogDialog({ scope, api, onClose }: {
  scope: AgentLogScope;
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<AgentLogData | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const base = scope.type === "project" ? `/projects/${scope.id}`
      : scope.type === "thread" ? `/threads/${scope.id}` : `/tasks/${scope.id}`;
    const load = async () => {
      try {
        setData(await api(`${base}/agent-logs`, undefined, undefined, controller.signal));
        setNow(Date.now());
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [scope.type, scope.id]);

  const timeline = useMemo(() => buildTimeline(data?.events || [], now), [data, now]);
  const selected = data?.events.find((event) => event.id === selectedId)
    || (timeline ? timeline.spans.at(-1)?.event : undefined);

  return <dialog ref={dialog} className="agent-log-dialog" aria-labelledby="agent-log-dialog-title" onCancel={onClose}>
    <header className="agent-monitor-header">
      <div>
        <span>DSH 时间概览{data ? ` · ${data.events.length} 条` : ""}</span>
        <h2 id="agent-log-dialog-title">{data?.title || "运行日志"}</h2>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭运行日志" title="关闭">×</button>
    </header>
    <section className="agent-log-timeline" aria-label="轨迹时间线">
      <div className="agent-log-plot">
        <div className="agent-log-labels" aria-hidden="true"><span>输入</span><span>模型</span><span>工具</span></div>
        <div className="agent-log-track">
          {!data && !error && <span className="agent-log-empty">正在读取运行日志…</span>}
          {data && !timeline && <span className="agent-log-empty">无计时数据</span>}
          {timeline?.spans.map((span) => {
            const domain = Math.max(1, timeline.end - timeline.start);
            const left = (span.start - timeline.start) / domain * 100;
            const width = (span.end - span.start) / domain * 100;
            const current = span.event.id === selected?.id;
            return <button
              type="button"
              key={span.event.id}
              className="agent-log-span"
              data-kind={span.kind}
              data-error={span.isError || undefined}
              data-current={current || undefined}
              aria-pressed={current}
              title={`${span.event.action} · ${labelAgentEventStatus(span.event.status)}${span.event.durationMs != null ? ` · ${formatDurationMs(span.event.durationMs)}` : ""}`}
              style={{ "--span-left": `${left}%`, "--span-width": `${width}%`, "--span-lane": span.lane } as React.CSSProperties}
              onClick={() => setSelectedId(span.event.id)}
            />;
          })}
        </div>
      </div>
    </section>
    {selected && <div className="agent-log-detail">
      <strong>{selected.action}</strong>
      <dl>
        <div><dt>执行者</dt><dd>{levelName(selected.agentType)}</dd></div>
        <div><dt>工具</dt><dd>{selected.tool}</dd></div>
        <div><dt>状态</dt><dd>{labelAgentEventStatus(selected.status)}</dd></div>
        <div><dt>开始</dt><dd>{formatTime(selected.createdAt)}</dd></div>
        <div><dt>结束</dt><dd>{selected.finishedAt ? formatTime(selected.finishedAt) : "进行中"}</dd></div>
        <div><dt>耗时</dt><dd>{selected.durationMs != null ? formatDurationMs(selected.durationMs) : "进行中"}</dd></div>
        {selected.taskId && <div><dt>任务</dt><dd>{selected.taskId}</dd></div>}
        {selected.error && <div className="agent-log-detail-error"><dt>错误</dt><dd>{selected.error}</dd></div>}
      </dl>
    </div>}
    {error && <p className="monitor-error" role="alert">{error}</p>}
  </dialog>;
}
