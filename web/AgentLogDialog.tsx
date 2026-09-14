import React, { useEffect, useRef, useState } from "react";

type AgentLogScope = { type: "project" | "thread" | "task"; id: string };
type AgentLogData = {
  title: string;
  events: {
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
  }[];
};

function formatTime(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z")
    .toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function levelName(type: AgentLogData["events"][number]["agentType"]) {
  return type === "l1" ? "一级小祥" : type === "l2" ? "二级小祥" : "三级小祥";
}

export function AgentLogDialog({ scope, api, onClose }: {
  scope: AgentLogScope;
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<AgentLogData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const base = scope.type === "project" ? `/projects/${scope.id}`
      : scope.type === "thread" ? `/threads/${scope.id}` : `/tasks/${scope.id}`;
    const load = async () => {
      try { setData(await api(`${base}/agent-logs`, undefined, undefined, controller.signal)); setError(""); }
      catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
      finally { if (!controller.signal.aborted) timer = setTimeout(load, 5000); }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [scope.type, scope.id]);

  return <dialog ref={dialog} className="agent-log-dialog" aria-labelledby="agent-log-dialog-title" onCancel={onClose}>
    <header className="agent-monitor-header">
      <div><span>DSH 事件摘要</span><h2 id="agent-log-dialog-title">{data?.title || "运行日志"}</h2></div>
      <button type="button" onClick={onClose} aria-label="关闭运行日志" title="关闭">×</button>
    </header>
    <section className="monitor-section monitor-log-section">
      <div className="monitor-section-heading"><div><h3>最近事件</h3></div><span className="monitor-count">{data?.events.length || 0} 条</span></div>
      <div className="monitor-log-list">
        {data?.events.map((event) => <article className="monitor-log-row" key={event.id}>
          <span className={`monitor-log-icon ${event.status}`} aria-hidden="true" />
          <span className="monitor-log-main"><strong>{event.action}</strong><small>{levelName(event.agentType)} · {event.tool}{event.error ? ` · ${event.error}` : ""}</small></span>
          <span className="monitor-log-meta">
            <span className={`monitor-state ${event.status === "failed" ? "failed" : event.status === "running" ? "running" : "idle"}`}><i aria-hidden="true" />{event.status}</span>
            <time>{formatTime(event.createdAt)}</time>
            {event.durationMs != null ? <small>{event.durationMs < 1000 ? `${event.durationMs} ms` : `${(event.durationMs / 1000).toFixed(1)} s`}</small> : <small>进行中</small>}
          </span>
        </article>)}
        {!data && !error && <p className="monitor-empty">正在读取运行日志…</p>}
        {data && !data.events.length && <p className="monitor-empty">当前作用域暂无运行事件。</p>}
      </div>
      <p className="monitor-log-note">仅展示阶段、工具、状态和耗时。隐藏思考正文、完整参数与原始输出不会显示。</p>
    </section>
    {error && <p className="monitor-error" role="alert">{error}</p>}
  </dialog>;
}
