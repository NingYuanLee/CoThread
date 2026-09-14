import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  formatActorRef,
  formatDurationMs,
  labelAgentEventStatus,
  labelExecutorType,
  labelReasoningEffort,
  labelWorkflowStatus,
} from "./ui-labels";

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
  humanAgents: { member_id: string; name: string; nodes: { executor_type: "human_self" | "human_connector"; executor_id: string | null; online: boolean; configured?: boolean }[] }[];
  taskPool: {
    task_id: string;
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

function ModelLabel({ model }: { model: MonitorData["models"][keyof MonitorData["models"]] | undefined }) {
  return model ? <small className="monitor-model">{model.model} · {labelReasoningEffort(model.reasoningEffort)}</small> : null;
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
  const [view, setView] = useState<"status" | "logs">("status");
  const activeTasks = useMemo(() => data?.executors.filter((task) => task.execution_active || task.status === "running").length || 0, [data]);
  const selectedCoordinator = data?.coordinators.find((item) => item.id === selectedThreadId);
  const selectedTasks = useMemo(() => data?.executors.filter((task) => task.thread_id === selectedThreadId && task.executor_type === "dsh_l3") || [], [data, selectedThreadId]);
  const slots = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const slot = index + 1;
    const explicit = selectedTasks.find((item) => item.agent_slot === slot);
    const unassigned = selectedTasks.filter((item) => item.agent_slot == null && !selectedTasks.some((candidate) => candidate.agent_slot != null && candidate.task_id === item.task_id));
    const occupiedBefore = Array.from({ length: index }, (_, previous) => selectedTasks.find((item) => item.agent_slot === previous + 1)).filter(Boolean).length;
    return { slot, agent: EXECUTORS[index], task: explicit || unassigned[index - occupiedBefore] || null };
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
  const knowledgeState = knowledge?.sessionStatus === "failed"
    ? { label: "运行失败", tone: "failed" as const }
    : knowledge?.sessionStatus === "running" || !knowledge || knowledge.ready > 0
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

      <div className="monitor-view-tabs" role="tablist" aria-label="监控内容">
        <button type="button" role="tab" aria-selected={view === "status"} onClick={() => setView("status")}>AgentTeam 状态</button>
        <button type="button" role="tab" aria-selected={view === "logs"} onClick={() => setView("logs")}>轨迹</button>
      </div>

      {view === "status" ? <>

      <section className="monitor-section">
        <div className="monitor-section-heading">
          <div><span className="monitor-level">一级</span><img className="monitor-avatar" src="/agent-avatars/grandpa.jpg" alt="" /><span className="monitor-agent-name"><strong>老翁</strong><small>项目知识库管理员</small><ModelLabel model={data?.models.knowledge} /></span></div>
          <State tone={knowledgeState.tone}>{knowledgeState.label}</State>
        </div>
        <div className="knowledge-status">
          <dl><div><dt>成员认识</dt><dd>{knowledge?.memberPending || 0} 项待整理</dd></div><i className="knowledge-divider" aria-hidden="true" /><div><dt>文档摘要</dt><dd>{knowledge?.documentPending || 0} 项待整理</dd></div></dl>
          <p>DSH 会话：{knowledge?.sessionId ? "已建立" : "尚未启动"}{knowledge?.lastTask ? ` · 最近任务：${knowledge.lastTask}` : ""}</p>
          <p>最近整理：{time(knowledge?.lastUpdatedAt)}{knowledge?.nextAt ? ` · 下次可处理：${time(knowledge.nextAt)}` : ""}{knowledge?.lastError ? ` · ${knowledge.lastError}` : ""}</p>
        </div>
      </section>

      <section className="monitor-section monitor-task-pool">
        <div className="monitor-section-heading"><div><span className="monitor-level">项目级</span><h3>任务池</h3></div><span className="monitor-count">{data?.taskPool.length || 0} 项</span></div>
        <div className="executor-list">
          {data?.taskPool.map((task) => <article className="executor-row" key={task.task_id}>
            <div className="executor-title"><span className="executor-name"><strong>{task.title}</strong><small>{task.task_type === "assist_l2" ? "辅助 L2" : "正式任务"} · 来源 {task.source_user_id || labelExecutorType(task.source_type)}</small></span><State tone={task.run_status === "failed" ? "failed" : ["running", "queued"].includes(task.run_status || task.task_status) ? "running" : task.run_status === "waiting" ? "waiting" : "idle"}>{labelWorkflowStatus(task.run_status || task.task_status)}</State></div>
            <p>{task.progress || task.goal}</p>
            <footer><span>创建 {formatActorRef(task.created_by_type, task.created_by_id)} · 责任 {task.target_type ? formatActorRef(task.target_type, task.target_id) : "未指派"}</span><span>认领 {task.claimed_by_type ? formatActorRef(task.claimed_by_type, task.claimed_by_id) : "无"} · 执行 {task.executor_type ? formatActorRef(task.executor_type, task.executor_id) : "未选择"}</span>{task.result_summary ? <span>结果：{task.result_summary.slice(0, 180)}</span> : null}{artifactCount(task.artifact_refs) ? <span>产物 {artifactCount(task.artifact_refs)} 项</span> : null}</footer>
          </article>)}
          {!data?.taskPool.length && <p className="monitor-empty">当前没有项目任务。</p>}
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
                <span className="coordinator-copy"><strong>小祥</strong><ModelLabel model={data?.models.coordinator} /><small>{item.title} · {item.status === "archived" ? "已归档" : `${item.active_executors}/7 工作中 · ${item.convergence_state === "waiting" ? "等待中" : item.convergence_state === "stable" ? "已收敛" : "调整第 " + item.steering_epoch + " 轮"}`} · {time(item.last_activity_at)}</small>{item.react_phase || item.current_action ? <small>阶段 {item.react_phase || "准备"} · {item.current_action || "继续评估"}</small> : null}{item.wait_reason ? <small>等待：{item.wait_reason}</small> : null}{item.recent_message ? <small title={item.recent_message}>最近发言：{item.recent_message}</small> : null}</span>
                <State tone={item.status === "archived" ? "idle" : busy ? "running" : "idle"}>{item.status === "archived" ? "归档" : busy ? "调度中" : "待命"}</State>
              </button>;
            })}
            {!data?.coordinators.length && <p className="monitor-empty">项目还没有迭代。</p>}
          </div>
        </section>

        <section className="monitor-section monitor-humans">
          <div className="monitor-section-heading"><div><span className="monitor-level">三级</span><h3>人类成员子 Agent</h3></div><span className="monitor-count">{data?.humanAgents.length || 0} 人</span></div>
          <div className="executor-list">
            {data?.humanAgents.map((member) => <article className="executor-row human-agent-tree" key={member.member_id}>
              <div className="executor-title"><span className="monitor-avatar" aria-hidden="true" /><span className="executor-name"><strong>{member.name}</strong><small>任务责任主体</small></span><State tone="idle">成员账号</State></div>
              <div className="human-agent-nodes">
                {member.nodes.map((node) => {
                  const task = data?.taskPool.find((item) => item.executor_type === node.executor_type && item.executor_id === node.executor_id && ["queued", "running", "waiting"].includes(item.run_status || item.task_status))
                    || data?.taskPool.find((item) => item.target_type === "human_member" && item.target_id === member.member_id && !item.executor_type && !["completed", "failed", "cancelled", "superseded"].includes(item.task_status));
                  return <div key={node.executor_type}>
                    <span><strong>{node.executor_type === "human_self" ? "成员本人" : "本地 Codex"}</strong><small>{labelExecutorType(node.executor_type)}{task ? ` · ${task.title} · 来源 ${task.source_user_id || labelExecutorType(task.source_type)}` : ""}</small></span>
                    <State tone={!node.online ? "waiting" : task ? "running" : "idle"}>{node.executor_type === "human_connector" && !node.configured ? "未关联" : !node.online ? "离线" : task ? "执行中" : "在线"}</State>
                  </div>;
                })}
              </div>
            </article>)}
            {!data?.humanAgents.length && <p className="monitor-empty">暂无人类成员。</p>}
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
                <div className="executor-title"><img className="monitor-avatar" src={`/agent-avatars/${agent.avatar}`} alt="" /><span className="executor-name"><strong>{agent.name}</strong><ModelLabel model={data?.models.executor} /><small>{slot} 号 DSH L3 · {task ? task.progress || task.goal : "等待任务"}</small></span><State tone={state.tone}>{state.label}</State></div>
                {task ? <>
                  <p>{active ? task.goal : `上次任务：${task.goal}`}</p>
                  <footer><span>来源 {task.requested_by || labelExecutorType(task.source_type)} · 责任 {formatActorRef(task.target_type, task.target_id)}</span><span>执行 {task.executor_type ? formatActorRef(task.executor_type, task.executor_id || "待绑定") : "未选择"}{task.progress ? ` · ${task.progress}` : ""}</span>{task.result_summary ? <span>结果：{task.result_summary.slice(0, 160)}</span> : null}{artifactCount(task.artifact_refs) ? <span>产物 {artifactCount(task.artifact_refs)} 项</span> : null}<time>{time(task.last_action_at || task.finished_at || task.started_at)}</time></footer>
                </> : <p className="executor-idle-copy">当前没有任务</p>}
              </article>;
            })}
          </div>
        </section>
      </div>
      </> : <section className="monitor-section monitor-log-section">
        <div className="monitor-section-heading">
          <div><span className="monitor-level">DSH</span><h3>事件摘要</h3></div>
          <span className="monitor-count">最近 {data?.eventLog.length || 0} 条</span>
        </div>
        <div className="monitor-log-list">
          {data?.eventLog.map((event) => <article className="monitor-log-row" key={event.id}>
            <span className={`monitor-log-icon ${event.status}`} aria-hidden="true" />
            <span className="monitor-log-main">
              <strong>{event.action}</strong>
              <small>{event.agent_type === "l2" ? "二级小祥" : "三级小祥"} · {event.thread_title} · {event.tool}</small>
            </span>
            <span className="monitor-log-meta">
              <State tone={event.status === "failed" ? "failed" : event.status === "running" ? "running" : "idle"}>{labelAgentEventStatus(event.status)}</State>
              <time>{time(event.created_at)}</time>
              {event.duration_ms != null ? <small>{formatDurationMs(event.duration_ms)}</small> : null}
            </span>
          </article>)}
          {!data?.eventLog.length && <p className="monitor-empty">暂无 DSH 运行事件。</p>}
        </div>
        <p className="monitor-log-note">轨迹摘要展示步骤、工具、Agent 层级、状态和耗时。思考正文、完整工具参数与敏感输出在监控器中保持折叠，点开对应轨迹可查看详情。</p>
      </section>}
    </>}
    {error && <p className="monitor-error" role="alert">{error}</p>}
  </dialog>;
}
