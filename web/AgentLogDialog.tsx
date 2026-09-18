import React, { useEffect, useMemo, useRef, useState } from "react";
import { AGENT_LEVEL_LABELS, formatDurationMs, labelAgentEventStatus } from "./ui-labels";
import { UiIcon } from "./ui-icon";
import { DialogClose, animateDialogClose, onDialogBackdropClick, onDialogCancel } from "./dialog-fx";
import { l1TaskLabel } from "../shared/agent-label.js";
import {
  type AgentLogData,
  type AgentLogEvent,
  type AgentLogScope,
  type LedgerRow,
  type TimelineSpan,
  buildLedger,
  buildTimeline,
  formatClock,
  inspectorTabsFor,
  kindLabel,
  ledgerSummary,
  prettyPayload,
  TIMELINE_LANES,
} from "./agent-trajectory";

function levelName(type: AgentLogEvent["agentType"]) {
  return type === "l1" ? AGENT_LEVEL_LABELS.l1 : type === "l2" ? AGENT_LEVEL_LABELS.l2 : AGENT_LEVEL_LABELS.l3;
}

function clip(text: string, max = 140) {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function AgentTrajectory({ scope, api }: {
  scope: AgentLogScope;
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
}) {
  const track = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const [data, setData] = useState<AgentLogData | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<{ start: number; end: number } | null>(null);
  const [hover, setHover] = useState<{ span: TimelineSpan; x: number; y: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drag = useRef<{ x: number; start: number; picking: boolean } | null>(null);
  const [marquee, setMarquee] = useState<{ left: number; width: number } | null>(null);
  const [tab, setTab] = useState("概述");
  const [detail, setDetail] = useState<{ input?: string; output?: string | null; error?: string } | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const base = scope.type === "project" ? `/projects/${scope.id}`
      : scope.type === "thread" ? `/threads/${scope.id}` : `/tasks/${scope.id}`;
    const query = new URLSearchParams();
    if (scope.type === "project") query.set("task", scope.task);
    const suffix = query.toString() ? `?${query}` : "";
    const load = async () => {
      try {
        setData(await api(`${base}/agent-logs${suffix}`, undefined, undefined, controller.signal));
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
  }, [scope.type, scope.id, scope.type === "project" ? scope.task : ""]);

  const inputs = data?.inputs || [];
  const timeline = useMemo(() => buildTimeline(data?.events || [], inputs, now), [data, inputs, now]);
  const ledger = useMemo(() => buildLedger(data?.events || [], inputs), [data, inputs]);
  const domain = timeline ? { start: view?.start ?? timeline.start, end: view?.end ?? timeline.end } : null;
  const visibleSpans = useMemo(() => {
    if (!timeline || !domain) return [];
    return timeline.spans.filter((span) => span.end >= domain.start && span.start <= domain.end);
  }, [timeline, domain]);

  const selectedRow: LedgerRow | undefined = useMemo(() => {
    const rows = ledger.flatMap((turn) => turn.rows);
    return rows.find((row) => row.id === selectedId) || rows.at(-1);
  }, [ledger, selectedId]);

  useEffect(() => {
    if (!selectedRow) return;
    const node = rowRefs.current.get(selectedRow.id);
    const ledger = node?.closest(".agent-log-ledger");
    if (!node || !(ledger instanceof HTMLElement)) return;
    const nodeRect = node.getBoundingClientRect();
    const ledgerRect = ledger.getBoundingClientRect();
    if (nodeRect.top < ledgerRect.top) ledger.scrollTop -= ledgerRect.top - nodeRect.top;
    else if (nodeRect.bottom > ledgerRect.bottom) ledger.scrollTop += nodeRect.bottom - ledgerRect.bottom;
  }, [selectedRow?.id]);

  useEffect(() => {
    const tabs = inspectorTabsFor(selectedRow?.kind === "header" ? "tool" : (selectedRow?.kind || "tool"), selectedRow?.event?.tool);
    if (!tabs.includes(tab)) setTab("概述");
  }, [selectedRow?.id]);

  useEffect(() => {
    if (!selectedRow?.event || selectedRow.event.agentType === "l1") {
      setDetail(selectedRow?.event?.error ? { error: selectedRow.event.error } : null);
      setDetailError("");
      setDetailLoading(false);
      return;
    }
    const event = selectedRow.event;
    const threadId = event.threadId || (scope.type === "thread" ? scope.id : "");
    const path = threadId
      ? `/threads/${threadId}/events/${event.id}`
      : `/tasks/${scope.id}/events/${event.id}`;
    const controller = new AbortController();
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    api(path, undefined, undefined, controller.signal).then((value) => {
      if (!controller.signal.aborted) {
        setDetail({ input: value.input, output: value.output, error: value.error });
        setDetailLoading(false);
      }
    }).catch((cause) => {
      if (!controller.signal.aborted) {
        setDetailError((cause as Error).message);
        setDetailLoading(false);
      }
    });
    return () => controller.abort();
  }, [selectedRow?.event?.id, selectedRow?.event?.agentType, selectedRow?.event?.threadId, scope.type, scope.id]);

  useEffect(() => {
    const node = track.current;
    if (!node || !timeline) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const focus = (event.clientX - rect.left) / Math.max(1, rect.width);
      const current = view || { start: timeline.start, end: timeline.end };
      const span = Math.max(8, current.end - current.start);
      const nextSpan = event.deltaY > 0 ? Math.min(timeline.end - timeline.start, span * 1.18) : Math.max(8, span / 1.18);
      const center = current.start + span * focus;
      const start = Math.max(timeline.start, Math.min(center - nextSpan * focus, timeline.end - nextSpan));
      setView({ start, end: start + nextSpan });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [timeline, view]);

  const selectSpan = (span: TimelineSpan) => setSelectedId(span.id);

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !timeline || !domain) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { x: event.clientX, start: domain.start + (event.clientX - rect.left) / rect.width * (domain.end - domain.start), picking: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !timeline || !domain) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!drag.current.picking && Math.abs(event.clientX - drag.current.x) > 5) {
      drag.current.picking = true;
    }
    if (drag.current.picking) {
      const left = Math.min(drag.current.x, event.clientX) - rect.left;
      setMarquee({ left, width: Math.abs(event.clientX - drag.current.x) });
    }
  };
  const onTrackPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !timeline || !domain) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (drag.current.picking) {
      const a = drag.current.start;
      const b = domain.start + (event.clientX - rect.left) / rect.width * (domain.end - domain.start);
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      if (end - start > 2) setView({ start, end });
    }
    drag.current = null;
    setMarquee(null);
  };

  const showTooltip = (span: TimelineSpan, event: React.PointerEvent) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setHover({ span, x: event.clientX, y: event.clientY });
    }, 500);
  };
  const hideTooltip = () => {
    clearTimeout(hoverTimer.current);
    setHover(null);
  };

  const tabs = inspectorTabsFor(
    selectedRow?.kind === "header" ? "tool" : (selectedRow?.kind || "tool"),
    selectedRow?.event?.tool,
  );
  const inputText = selectedRow?.input?.preview
    || prettyPayload(detail?.input)
    || selectedRow?.inputText
    || "";
  const outputText = selectedRow?.kind === "message"
    ? ""
    : prettyPayload(detail?.output) || selectedRow?.outputText || "";
  const thinkText = selectedRow?.kind === "message"
    ? (prettyPayload(detail?.output) || selectedRow?.thinkText || "分析请求并准备下一步操作。")
    : "";

  const resetView = () => setView(null);

  return <div className="agent-log-panel">
    <section className="agent-log-timeline" aria-label="时间概览">
      {view && <button type="button" className="agent-log-reset" onClick={resetView}>还原</button>}
      <div className="agent-log-plot">
        <div className="agent-log-labels" aria-hidden="true">{TIMELINE_LANES.map((kind) => <span key={kind}>{kindLabel(kind)}</span>)}</div>
        <div
          ref={track}
          className="agent-log-track"
          title="框选放大，滚轮缩放；点还原或双击看全部"
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={() => { drag.current = null; setMarquee(null); }}
          onDoubleClick={resetView}
          onContextMenu={(event) => { event.preventDefault(); resetView(); }}
        >
          {!data && !error && <span className="agent-log-empty">正在加载轨迹…</span>}
          {data && !timeline && <span className="agent-log-empty">无计时数据</span>}
          {timeline && domain && visibleSpans.map((span) => {
            const widthDomain = Math.max(1, domain.end - domain.start);
            const left = (span.start - domain.start) / widthDomain * 100;
            const width = (span.end - span.start) / widthDomain * 100;
            const current = span.id === selectedRow?.id;
            return <button
              type="button"
              key={span.id}
              className="agent-log-span"
              data-kind={span.kind}
              data-error={span.isError || undefined}
              data-current={current || undefined}
              aria-pressed={current}
              aria-label={span.label}
              style={{ "--span-left": `${left}%`, "--span-width": `${width}%`, "--span-lane": span.lane } as React.CSSProperties}
              onClick={() => selectSpan(span)}
              onPointerEnter={(event) => showTooltip(span, event)}
              onPointerMove={(event) => { if (hover?.span.id === span.id) setHover({ span, x: event.clientX, y: event.clientY }); }}
              onPointerLeave={hideTooltip}
            />;
          })}
          {marquee && <i className="agent-log-marquee" style={{ left: marquee.left, width: marquee.width }} />}
        </div>
      </div>
    </section>
    <div className="agent-log-body">
      <div className="agent-log-ledger" role="table" aria-label="轨迹账本">
        <div className="agent-log-ledger-head" role="row">
          <span>类型</span><span>内容</span><span>状态</span><span>时间</span>
        </div>
        {ledger.map((turn) => <div className="agent-log-turn" key={turn.turn}>
          <div className="agent-log-turn-label">{turn.label}</div>
          {turn.rows.map((row, index) => {
            const stepChanged = index === 0 || row.step !== turn.rows[index - 1].step;
            return <React.Fragment key={row.id}>
              {stepChanged && row.step != null && <div className="agent-log-step">步骤 {row.step}</div>}
              <button
                type="button"
                role="row"
                className="agent-log-row"
                data-kind={row.kind}
                data-status={row.event?.status || undefined}
                data-error={row.isError || undefined}
                data-current={row.id === selectedRow?.id || undefined}
                ref={(node) => { if (node) rowRefs.current.set(row.id, node); else rowRefs.current.delete(row.id); }}
                onClick={() => setSelectedId(row.id)}
              >
                <span data-kind={row.kind}>{row.label}</span>
                <span title={ledgerSummary(row)}>{clip(ledgerSummary(row))}</span>
                <span data-status={row.event?.status || undefined}>{row.event ? labelAgentEventStatus(row.event.status) : "—"}</span>
                <span>{row.durationMs != null ? formatDurationMs(row.durationMs) : formatClock(row.createdAt)}</span>
              </button>
            </React.Fragment>;
          })}
        </div>)}
        {data && !ledger.length && <p className="agent-log-ledger-empty">还没有轨迹记录。</p>}
      </div>
      <aside className="agent-log-inspector" aria-label="记录详情">
        {!selectedRow ? <p className="agent-log-inspector-empty">选择一条记录查看详情</p> : <>
          <header>
            <strong>{selectedRow.input ? "输入" : (selectedRow.kind === "reply" && selectedRow.event?.preview) || selectedRow.event?.action || selectedRow.label}</strong>
            <small>{selectedRow.event ? `${levelName(selectedRow.event.agentType)} · ${labelAgentEventStatus(selectedRow.event.status)}` : "输入"}</small>
          </header>
          <div className="agent-log-tabs" role="tablist">
            {tabs.map((name) => <button type="button" role="tab" key={name} aria-selected={tab === name} onClick={() => setTab(name)}>{name}</button>)}
          </div>
          <div className="agent-log-inspector-body">
            {tab === "概述" && <dl>
              <div><dt>类型</dt><dd>{selectedRow.input ? "输入" : kindLabel(selectedRow.kind === "header" ? "tool" : selectedRow.kind)}</dd></div>
              {selectedRow.event && <div><dt>状态</dt><dd>{labelAgentEventStatus(selectedRow.event.status)}</dd></div>}
              {selectedRow.event && <div><dt>工具</dt><dd>{selectedRow.event.tool}</dd></div>}
              {selectedRow.event && <div><dt>执行者</dt><dd>{levelName(selectedRow.event.agentType)}</dd></div>}
              <div><dt>开始时间</dt><dd>{formatClock(selectedRow.createdAt)}</dd></div>
              <div><dt>总时长</dt><dd>{selectedRow.durationMs != null ? formatDurationMs(selectedRow.durationMs) : selectedRow.event?.status === "running" ? "进行中" : "未记录"}</dd></div>
              {selectedRow.event?.task && <div><dt>维护任务</dt><dd>{l1TaskLabel(selectedRow.event.task)}</dd></div>}
              {selectedRow.event?.taskId && <div><dt>任务</dt><dd>{selectedRow.event.taskId}</dd></div>}
              {(detail?.error || selectedRow.event?.error) && <div className="agent-log-detail-error"><dt>错误</dt><dd>{detail?.error || selectedRow.event?.error}</dd></div>}
            </dl>}
            {tab === "输入" && <pre>{inputText || "无内容"}</pre>}
            {tab === "参数" && <pre>{detailLoading ? "正在读取参数…" : detailError || prettyPayload(detail?.input) || selectedRow.inputText || "未捕获参数"}</pre>}
            {tab === "结果" && <pre>{detailLoading ? "正在读取结果…" : detailError || prettyPayload(detail?.output) || (selectedRow.event?.status === "running" ? "进行中" : "未捕获结果")}</pre>}
            {tab === "输出" && <pre>{detailLoading ? "正在读取输出…" : detailError || outputText || "无输出"}</pre>}
            {tab === "思考" && <pre>{detailLoading ? "正在读取思考…" : thinkText || "无内容"}</pre>}
            {tab === "计时" && <dl>
              <div><dt>开始时间</dt><dd>{formatClock(selectedRow.createdAt)}</dd></div>
              <div><dt>总时长</dt><dd>{selectedRow.durationMs != null ? formatDurationMs(selectedRow.durationMs) : "未记录"}</dd></div>
              <div><dt>计时来源</dt><dd>会话时间戳</dd></div>
            </dl>}
          </div>
        </>}
      </aside>
    </div>
    {hover && <div className="agent-log-tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }} role="tooltip">
      <strong>{hover.span.label}</strong>
      <span>{kindLabel(hover.span.kind)} · {hover.span.event ? labelAgentEventStatus(hover.span.event.status) : "已完成"}</span>
      <span>{hover.span.event?.durationMs != null ? formatDurationMs(hover.span.event.durationMs) : formatClock(hover.span.input?.createdAt || "")}</span>
    </div>}
    {error && <p className="monitor-error" role="alert">{error}</p>}
  </div>;
}

export function AgentLogDialog({ scope, api, onClose }: {
  scope: AgentLogScope;
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="agent-log-dialog" aria-labelledby="agent-log-dialog-title" onCancel={onDialogCancel(onClose)} onClick={onDialogBackdropClick(onClose)}>
    <header className="agent-monitor-header">
      <div>
        <span>DSH 轨迹</span>
        <h2 id="agent-log-dialog-title">轨迹</h2>
      </div>
      <DialogClose onClick={() => animateDialogClose(dialog.current, onClose)} label="关闭轨迹" />
    </header>
    <AgentTrajectory scope={scope} api={api} />
  </dialog>;
}
