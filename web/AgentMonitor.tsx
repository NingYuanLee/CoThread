import React, { useEffect, useMemo, useRef, useState } from "react";

type MonitorData = {
  generatedAt: string;
  models: Record<"knowledge" | "coordinator" | "executor", {
    provider: string;
    model: string;
    reasoningEffort: string;
  }>;
  knowledge: {
    memberPending: number;
    documentPending: number;
    ready: number;
    nextAt: string | null;
    lastUpdatedAt: string | null;
  };
  coordinators: {
    id: string;
    title: string;
    status: string;
    queued_requests: number;
    running_requests: number;
    active_executors: number;
    last_activity_at: string;
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

function State({ tone, children }: { tone: "idle" | "running" | "waiting" | "failed"; children: React.ReactNode }) {
  return <span className={`monitor-state ${tone}`}><i aria-hidden="true" />{children}</span>;
}

function ModelLabel({ model }: { model: MonitorData["models"][keyof MonitorData["models"]] | undefined }) {
  return model ? <small className="monitor-model">{model.model} · {model.reasoningEffort}</small> : null;
}

const taskState = (task: MonitorData["executors"][number]) => {
  if (task.execution_active || task.status === "running") return { label: "执行中", tone: "running" as const };
  if (task.status === "queued") return { label: "等待开始", tone: "waiting" as const };
  if (task.status === "completed") return { label: "空闲", tone: "idle" as const };
  if (task.status === "cancelled") return { label: "空闲", tone: "idle" as const };
  return { label: "执行失败", tone: "failed" as const };
};

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
  const activeTasks = useMemo(() => data?.executors.filter((task) => task.execution_active || task.status === "running").length || 0, [data]);
  const selectedCoordinator = data?.coordinators.find((item) => item.id === selectedThreadId);
  const selectedTasks = useMemo(() => data?.executors.filter((task) => task.thread_id === selectedThreadId) || [], [data, selectedThreadId]);
  const slots = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const slot = index + 1;
    return { slot, agent: EXECUTORS[index], task: selectedTasks.find((item) => item.agent_slot === slot) || null };
  }), [selectedTasks]);

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

  const knowledge = data?.knowledge;
  const knowledgeState = !knowledge || knowledge.ready > 0
    ? { label: "正在整理", tone: "running" as const }
    : knowledge.memberPending + knowledge.documentPending > 0
      ? { label: "等待定时整理", tone: "waiting" as const }
      : { label: "空闲", tone: "idle" as const };

  return <dialog ref={dialog} className="agent-monitor" aria-labelledby="agent-monitor-title" onCancel={onClose}>
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
          <div><span className="monitor-level">一级</span><img className="monitor-avatar" src="/agent-avatars/grandpa.jpg" alt="" /><span className="monitor-agent-name"><strong>老翁</strong><small>项目知识库管理员</small><ModelLabel model={data?.models.knowledge} /></span></div>
          <State tone={knowledgeState.tone}>{knowledgeState.label}</State>
        </div>
        <div className="knowledge-status">
          <dl><div><dt>成员认识</dt><dd>{knowledge?.memberPending || 0} 项待整理</dd></div><i className="knowledge-divider" aria-hidden="true" /><div><dt>文档摘要</dt><dd>{knowledge?.documentPending || 0} 项待整理</dd></div></dl>
          <p>最近整理：{time(knowledge?.lastUpdatedAt)}{knowledge?.nextAt ? ` · 下次可处理：${time(knowledge.nextAt)}` : ""}</p>
        </div>
      </section>

      <div className="monitor-workspace">
        <section className="monitor-section monitor-coordinators">
          <div className="monitor-section-heading">
            <div><span className="monitor-level">二级</span><h3>任务调度员</h3></div>
            <span className="monitor-count">{data?.coordinators.length || 0} 个</span>
          </div>
          <div className="coordinator-list">
            {data?.coordinators.map((item) => {
              const busy = item.running_requests + item.queued_requests > 0;
              return <button type="button" className={`coordinator-row ${selectedThreadId === item.id ? "selected" : ""}`} key={item.id} aria-pressed={selectedThreadId === item.id} onClick={() => setSelectedThreadId(item.id)}>
                <img className="monitor-avatar" src="/agent-avatars/xiaojingang.jpg" alt="" />
                <span className="coordinator-copy"><strong>小祥</strong><ModelLabel model={data?.models.coordinator} /><small>{item.title} · {item.status === "archived" ? "已归档" : `${item.active_executors}/7 工作中`} · {time(item.last_activity_at)}</small></span>
                <State tone={item.status === "archived" ? "idle" : busy ? "running" : "idle"}>{item.status === "archived" ? "归档" : busy ? "调度中" : "待命"}</State>
              </button>;
            })}
            {!data?.coordinators.length && <p className="monitor-empty">项目还没有迭代。</p>}
          </div>
        </section>

        <section className="monitor-section monitor-executors">
          <div className="monitor-section-heading">
            <div><span className="monitor-level">三级</span><h3>{selectedCoordinator?.title || "任务执行者"}</h3></div>
            <span className="monitor-count">{selectedCoordinator?.active_executors || 0}/7 工作中</span>
          </div>
          <div className="executor-list">
            {slots.map(({ slot, agent, task }) => {
              const state = task ? taskState(task) : { label: "空闲", tone: "idle" as const };
              const active = !!task && (task.execution_active || task.status === "running" || task.status === "queued");
              return <article className={`executor-row ${active ? "active" : ""}`} key={slot} style={{ "--agent-color": agent.color, "--agent-tint": agent.tint } as React.CSSProperties}>
                <div className="executor-title"><img className="monitor-avatar" src={`/agent-avatars/${agent.avatar}`} alt="" /><span className="executor-name"><strong>{agent.name}</strong><ModelLabel model={data?.models.executor} /><small>{slot} 号执行者 · {task ? task.progress || task.goal : "等待任务"}</small></span><State tone={state.tone}>{state.label}</State></div>
                {task ? <>
                  <p>{active ? task.goal : `上次任务：${task.goal}`}</p>
                  <footer><span>{task.requested_by} 发起{task.update_count ? ` · ${task.update_count} 次补充` : ""}</span><time>{time(task.last_action_at || task.finished_at || task.started_at)}</time></footer>
                </> : <p className="executor-idle-copy">当前没有任务</p>}
              </article>;
            })}
          </div>
        </section>
      </div>
    </>}
    {error && <p className="monitor-error" role="alert">{error}</p>}
  </dialog>;
}
