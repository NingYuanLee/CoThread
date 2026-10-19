import { useAgentMonitorResource } from "./use-agent-monitor-resource";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { AgentLogDialog } from "./AgentLogDialog";
import type { AgentLogScope } from "./agent-trajectory";
import { l1TaskLabel } from "../shared/agent-label.js";

import { ProjectMark } from "./ProjectMark";

import { AGENT_LEVEL_LABELS, labelWorkflowStatus } from "./ui-labels";
import { UiIcon } from "./ui-icon";
import {
  DialogClose,
  animateDialogClose,
  onDialogBackdropClick,
  onDialogCancel,
} from "./dialog-fx";
import type { MonitorData, L3Detail, SessionTarget } from "./agent-monitor-types";
import {
  time,
  nextTime,
  pendingLine,
  runStatusLabel,
  archiveHistoryStatus,
  archiveHistoryTone,
  l1RunRows,
  claimedWorkflow,
  poolTone,
  taskSourceName,
  taskExecutorName,
  pendingDetail,
  claimedDetail,
  L1_RUN_COLUMNS,
  ENDED,
  liveExecutor,
  agentState,
  selectMonitorWork,
} from "./agent-monitor-model";
import { State, L3TaskCard, CoordinatorStatusIcon, OverflowTitle } from "./agent-monitor-cards";
import { L3TaskDetailDialog, L1HistoryDialog } from "./agent-monitor-history";
import { TaskSessionDialog } from "./agent-monitor-session";
import { EventLogDialog } from "./agent-monitor-events";
export function AgentMonitor({
  projectId,
  projectName,
  projectImage,
  api,
  onClose,
}: {
  projectId: string;
  projectName: string;
  projectImage?: string | null;
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const {
    data,
    error,
    loading,
    reloading,
    reload: reloadMonitor,
    reportError: setError,
  } = useAgentMonitorResource(projectId, api);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [taskDetail, setTaskDetail] = useState<L3Detail | null>(null);
  const [logScope, setLogScope] = useState<AgentLogScope | null>(null);
  const [eventLogs, setEventLogs] = useState<MonitorData["eventLog"] | null>(null);
  const [historyKind, setHistoryKind] = useState<
    "member" | "document" | "organization" | "archive" | null
  >(null);
  const [sessionTarget, setSessionTarget] = useState<SessionTarget | null>(null);
  const [refreshing, setRefreshing] = useState<
    "member" | "document" | "organization" | "archive" | null
  >(null);
  const [l1Open, setL1Open] = useState(false);

  const {
    activeCoordinators,
    selectedCoordinator,
    people,
    threadPool,
    selectedTasks,
    l3Ids,
    slots,
    selectedAgent,
    selectedAgentState,
    pendingTasks,
    claimedTasks,
  } = useMemo(
    () => selectMonitorWork(data, selectedThreadId, selectedSlot),
    [data, selectedThreadId, selectedSlot],
  );
  const openTaskTrace = (taskId: string) => {
    if ((data?.taskPool || []).some((task) => task.task_id === taskId)) {
      setEventLogs(null);
      setLogScope({ type: "task", id: taskId });
      return;
    }
    setLogScope(null);
    setEventLogs(
      (data?.eventLog || []).filter(
        (event) => event.agent_type === "dsh_l3" && event.message_id === taskId,
      ),
    );
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
  }, []);
  useEffect(() => {
    const available = (data?.coordinators || []).filter((item) => item.status !== "archived");
    setSelectedThreadId((current) =>
      available.some((item) => item.id === current) ? current : available[0]?.id || "",
    );
  }, [data?.coordinators]);

  useEffect(() => {
    const busy = slots.find((item) => item.task && liveExecutor(item.task));
    setSelectedSlot(busy?.slot || 1);
  }, [selectedThreadId]);

  const knowledge = data?.knowledge;
  const openL1Logs = (task: string) => setLogScope({ type: "project", id: projectId, task });
  const sessionButton = (task: string) => (
    <button
      type="button"
      className="monitor-trace-btn"
      onClick={() => setSessionTarget({ kind: "l1", task })}
    >
      <UiIcon name="session" size={12} />
      会话
    </button>
  );
  const latestArchive = knowledge?.archives?.[0];
  const projectOrgJobs = (knowledge?.organizationJobs || []).filter(
    (job) => job.scope === "project",
  );
  const projectOrgBusy = projectOrgJobs.some((job) => ["queued", "running"].includes(job.status));
  const projectOrgLastAt =
    projectOrgJobs
      .map((job) => job.finished_at || job.started_at || job.created_at)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ||
    knowledge?.organizationLastAt ||
    null;
  const knowledgeLast = (() => {
    if (!knowledge) return { label: "暂无", tone: "idle" as const };
    if (knowledge.sessionStatus === "running") {
      const started = time(knowledge.lastStartedAt);
      return {
        label: started === "暂无" ? "正在整理" : `正在整理 · ${started}`,
        tone: "running" as const,
      };
    }
    const at = time(knowledge.lastFinishedAt || knowledge.lastUpdatedAt);
    const failed = knowledge.sessionStatus === "failed" || !!knowledge.lastError;
    const task = l1TaskLabel(knowledge.lastTask);
    if (at === "暂无" && !task) return { label: "暂无", tone: "idle" as const };
    const outcome = failed ? "上次失败" : "上次成功";
    const label = [task, outcome, at === "暂无" ? "" : at].filter(Boolean).join(" · ");
    return { label, tone: failed ? ("failed" as const) : ("idle" as const) };
  })();

  return (
    <>
      <dialog
        ref={dialog}
        className="agent-monitor"
        aria-labelledby="agent-monitor-title"
        onCancel={onDialogCancel(onClose)}
        onClick={onDialogBackdropClick(onClose)}
      >
        <header className="agent-monitor-header">
          <div>
            <span>项目运行状态</span>
            <h2 id="agent-monitor-title">小祥监控</h2>
            <p className="monitor-project-name">
              <ProjectMark name={projectName} image={projectImage} size={16} />
              <span>{projectName}</span>
            </p>
          </div>
          <div className="agent-monitor-header-actions">
            <button
              type="button"
              className="monitor-refresh-btn"
              onClick={() => void reloadMonitor()}
              disabled={reloading || (loading && !data)}
              aria-label="刷新小祥监控"
              title="刷新"
            >
              {reloading ? (
                <>
                  <UiIcon name="refresh" size={13} />
                  刷新中…
                </>
              ) : (
                <>
                  <UiIcon name="refresh" size={13} />
                  刷新
                </>
              )}
            </button>
            <DialogClose
              onClick={() => animateDialogClose(dialog.current, onClose)}
              label="关闭小祥监控"
            />
          </div>
        </header>

        {loading && !data ? (
          <div className="monitor-loading" role="status">
            正在读取运行状态…
          </div>
        ) : (
          <>
            {data && (
              <div className="monitor-models" aria-label="模型路由">
                <span className="monitor-models-label">模型路由</span>
                <span>
                  知识整理（L1）：{data.models.knowledge.model} ·{" "}
                  {data.models.knowledge.reasoningEffort}
                </span>
                <span>
                  调度与子 Agent：{(data.models.runtime || data.models.coordinator).model} ·{" "}
                  {(data.models.runtime || data.models.coordinator).reasoningEffort}
                </span>
              </div>
            )}
            <section className={`monitor-section${l1Open ? "" : " is-collapsed"}`}>
              <span className="monitor-level">{AGENT_LEVEL_LABELS.l1}</span>
              <button
                type="button"
                className="monitor-section-heading monitor-section-toggle"
                aria-expanded={l1Open}
                title={l1Open ? "收起知识整理任务" : "展开知识整理任务"}
                onClick={() => setL1Open((open) => !open)}
              >
                <div className="monitor-section-identity">
                  <img className="monitor-avatar" src="/agent-avatars/grandpa.jpg" alt="" />
                  <span className="monitor-agent-copy">
                    <span className="monitor-agent-title">老翁（项目知识库管理员）</span>
                    <small className={knowledgeLast.tone}>{knowledgeLast.label}</small>
                  </span>
                </div>
                <span className="monitor-section-toggle-meta">
                  <span className="monitor-count">4 项能力</span>
                  <svg
                    className="monitor-section-chevron"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={l1Open ? "m3 7 3-3 3 3" : "m4.5 3 3 3-3 3"} />
                  </svg>
                </span>
              </button>
              {l1Open ? (
                <div className="l1-task-grid">
                  <article className="l1-task-card">
                    <h4>成员发言</h4>
                    <p>说话风格、习惯与本人发言浓缩；同项目多次整理共用一套上下文</p>
                    <p>{pendingLine("member", knowledge?.memberPending || 0)}</p>
                    <p>最近整理：{time(knowledge?.memberLastAt)}</p>
                    <p>
                      预计下次：{nextTime(knowledge?.memberNextAt, knowledge?.memberPending || 0)}
                    </p>
                    <div className="l1-task-actions">
                      {sessionButton("member_memory")}
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        onClick={() => openL1Logs("member_memory")}
                      >
                        <UiIcon name="trajectory" size={12} />
                        轨迹
                      </button>
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        onClick={() => setHistoryKind("member")}
                      >
                        <UiIcon name="history" size={12} />
                        历史记录
                      </button>
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        disabled={refreshing === "member"}
                        onClick={() => void triggerMemory("member")}
                      >
                        {refreshing === "member" ? (
                          <>
                            <UiIcon name="clock" size={12} />
                            排队中…
                          </>
                        ) : (
                          <>
                            <UiIcon name="organize" size={12} />
                            立即整理
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                  <article className="l1-task-card">
                    <h4>文档摘要</h4>
                    <p>正式文件、沙箱产物与对话缓存的事实摘要；同项目多次整理共用一套上下文</p>
                    <p>
                      {pendingLine(
                        "document",
                        knowledge?.documentPending ?? knowledge?.projectDocumentPending ?? 0,
                      )}
                    </p>
                    <p>
                      最近整理：
                      {time(knowledge?.documentLastAt ?? knowledge?.projectDocumentLastAt)}
                    </p>
                    <p>
                      预计下次：
                      {nextTime(
                        knowledge?.documentNextAt ?? knowledge?.projectDocumentNextAt,
                        knowledge?.documentPending ?? knowledge?.projectDocumentPending ?? 0,
                      )}
                    </p>
                    <div className="l1-task-actions">
                      {sessionButton("document_memory")}
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        onClick={() => openL1Logs("document_memory")}
                      >
                        <UiIcon name="trajectory" size={12} />
                        轨迹
                      </button>
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        onClick={() => setHistoryKind("document")}
                      >
                        <UiIcon name="history" size={12} />
                        历史记录
                      </button>
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        disabled={refreshing === "document"}
                        onClick={() => void triggerMemory("document")}
                      >
                        {refreshing === "document" ? (
                          <>
                            <UiIcon name="clock" size={12} />
                            排队中…
                          </>
                        ) : (
                          <>
                            <UiIcon name="organize" size={12} />
                            立即整理
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                  <article className="l1-task-card">
                    <h4>文档整理</h4>
                    <p>归类与命名正式文件区文档；同项目多次整理共用一套上下文</p>
                    <p>最近整理：{time(projectOrgLastAt)}</p>
                    <div className="l1-task-actions">
                      {sessionButton("document_organization")}
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        onClick={() => openL1Logs("document_organization")}
                      >
                        <UiIcon name="trajectory" size={12} />
                        轨迹
                      </button>
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        onClick={() => setHistoryKind("organization")}
                      >
                        <UiIcon name="history" size={12} />
                        历史记录
                      </button>
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        disabled={projectOrgBusy || refreshing === "organization"}
                        onClick={() => void triggerOrganization()}
                      >
                        {refreshing === "organization" || projectOrgBusy ? (
                          <>
                            <UiIcon name="clock" size={12} />
                            排队中…
                          </>
                        ) : (
                          <>
                            <UiIcon name="organize" size={12} />
                            立即整理
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                  <article className="l1-task-card">
                    <h4>迭代归档</h4>
                    <p>总结本次迭代并更新项目长期记忆；同项目多次归档共用一套上下文</p>
                    <p>最近整理：{time(knowledge?.archiveLastAt)}</p>
                    <div className="l1-task-actions">
                      {sessionButton("iteration_archive")}
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        onClick={() => openL1Logs("iteration_archive")}
                      >
                        <UiIcon name="trajectory" size={12} />
                        轨迹
                      </button>
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        onClick={() => setHistoryKind("archive")}
                      >
                        <UiIcon name="history" size={12} />
                        历史记录
                      </button>
                      <button
                        type="button"
                        className="monitor-trace-btn"
                        disabled={!latestArchive || refreshing === "archive"}
                        onClick={() => void triggerArchive(latestArchive?.id)}
                      >
                        {refreshing === "archive" ? (
                          <>
                            <UiIcon name="clock" size={12} />
                            排队中…
                          </>
                        ) : (
                          <>
                            <UiIcon name="organize" size={12} />
                            立即整理
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                </div>
              ) : null}
            </section>

            <section className="monitor-section monitor-coordinators">
              <span className="monitor-level">{AGENT_LEVEL_LABELS.l2}</span>
              <div className="monitor-section-heading">
                <div className="monitor-section-identity">
                  <img className="monitor-avatar" src="/agent-avatars/xiaojingang.jpg" alt="" />
                  <span className="monitor-agent-title">小祥（任务调度员）</span>
                </div>
                <span className="monitor-count">{activeCoordinators.length} 个迭代会话</span>
              </div>
              <div className="coordinator-list">
                {activeCoordinators.map((item) => {
                  const busy = item.running_requests + item.queued_requests > 0;
                  const status = busy ? "工作中" : "空闲";
                  return (
                    <article
                      className={`coordinator-row ${selectedThreadId === item.id ? "selected" : ""}`}
                      key={item.id}
                    >
                      <button
                        type="button"
                        className="coordinator-select"
                        aria-label={`${item.title} ${status}`}
                        aria-pressed={selectedThreadId === item.id}
                        onClick={() => setSelectedThreadId(item.id)}
                      >
                        <CoordinatorStatusIcon busy={busy} archived={false} />
                        <span className="coordinator-copy">
                          <OverflowTitle text={item.title} />
                        </span>
                      </button>
                    </article>
                  );
                })}
                {!activeCoordinators.length && (
                  <p className="monitor-empty">还没有活跃中的迭代。</p>
                )}
              </div>
            </section>

            <section className="monitor-section monitor-executors">
              <span className="monitor-level">{AGENT_LEVEL_LABELS.l3}</span>
              {pendingTasks.length ? (
                <div className="monitor-unassigned">
                  <h4>待指派 {pendingTasks.length} 项</h4>
                  <div className="executor-list">
                    {pendingTasks.map((task) => (
                      <L3TaskCard
                        key={task.task_id}
                        title={task.title}
                        meta={`来源 ${taskSourceName(task, people)} · 执行 ${taskExecutorName(task, l3Ids)}`}
                        tone={poolTone(task)}
                        status={labelWorkflowStatus(task.task_status)}
                        onDetail={() => setTaskDetail(pendingDetail(task, people, l3Ids))}
                        onTrace={() => openTaskTrace(task.task_id)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="monitor-section-heading">
                <div className="monitor-section-identity">
                  {selectedAgent ? (
                    <img
                      className="monitor-avatar"
                      src={`/agent-avatars/${selectedAgent.agent.avatar}`}
                      alt=""
                    />
                  ) : null}
                  <span className="monitor-agent-title">
                    {selectedAgent ? `${selectedAgent.agent.name}（任务执行者）` : "任务执行者"}
                  </span>
                  {selectedAgent ? (
                    <State tone={selectedAgentState.tone}>{selectedAgentState.label}</State>
                  ) : null}
                </div>
                <span className="monitor-count">
                  {selectedCoordinator?.active_executors || 0}/7 工作中
                </span>
              </div>
              <div className="l3-workspace">
                <div className="l3-agent-list" role="listbox" aria-label="子 Agent">
                  {slots.map(({ slot, agent, task }) => {
                    const state = agentState(task);
                    const busy = state.tone === "running";
                    const activeAt = time(
                      task?.last_action_at || task?.finished_at || task?.started_at,
                    );
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedSlot === slot}
                        aria-label={`${agent.name} ${busy ? "工作中" : "空闲"} ${activeAt}`}
                        className={selectedSlot === slot ? "selected" : ""}
                        key={slot}
                        style={{ "--agent-color": agent.color } as React.CSSProperties}
                        onClick={() => setSelectedSlot(slot)}
                      >
                        <CoordinatorStatusIcon busy={busy} archived={false} />
                        <img
                          className="monitor-avatar"
                          src={`/agent-avatars/${agent.avatar}`}
                          alt=""
                        />
                        <span className="l3-agent-copy">
                          <strong>{agent.name}</strong>
                          <small>{activeAt}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="l3-agent-pane">
                  <div className="l3-agent-pane-body">
                    <div className="l3-task-group">
                      <h4>已接过 {claimedTasks.length} 项</h4>
                      <div className="executor-list">
                        {claimedTasks.map((task) => {
                          const pool = threadPool.find((item) => item.task_id === task.task_id);
                          const state = claimedWorkflow(task, pool);
                          const title =
                            pool?.title ||
                            task.progress ||
                            (task.task_type === "assist_l2" ? "辅助任务" : "执行任务");
                          const ended = ENDED.has(pool?.task_status || task.status || "");
                          return (
                            <L3TaskCard
                              key={task.task_id}
                              title={title}
                              meta={`来源 ${taskSourceName({ ...task, source_user_id: task.requested_by }, people)} · 执行 ${taskExecutorName({ ...task, ...pool, executor_id: task.executor_id, executor_type: task.executor_type }, l3Ids)}`}
                              tone={state.tone}
                              status={state.label}
                              settled={ended}
                              style={
                                ended
                                  ? undefined
                                  : ({
                                      "--agent-color": selectedAgent?.agent.color,
                                      "--agent-tint": selectedAgent?.agent.tint,
                                    } as React.CSSProperties)
                              }
                              onDetail={() =>
                                setTaskDetail(claimedDetail(task, pool, people, l3Ids))
                              }
                              onTrace={() => openTaskTrace(task.task_id)}
                              onSession={() =>
                                setSessionTarget({
                                  kind: "l3",
                                  threadId: selectedThreadId,
                                  messageId: task.task_id,
                                  title,
                                })
                              }
                            />
                          );
                        })}
                        {!claimedTasks.length && <p className="monitor-empty">还没有接过任务。</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
        {error && (
          <p className="monitor-error" role="alert">
            {error}
          </p>
        )}
      </dialog>
      {taskDetail ? (
        <L3TaskDetailDialog detail={taskDetail} onClose={() => setTaskDetail(null)} />
      ) : null}
      {logScope ? (
        <AgentLogDialog scope={logScope} api={api} onClose={() => setLogScope(null)} />
      ) : null}
      {sessionTarget ? (
        <TaskSessionDialog
          kicker={sessionTarget.kind === "l1" ? "维护会话" : "任务会话"}
          title={
            sessionTarget.kind === "l1" ? l1TaskLabel(sessionTarget.task) : sessionTarget.title
          }
          emptyIdle={
            sessionTarget.kind === "l1"
              ? "这个维护 Agent 还没有会话内容。"
              : "这个任务还没有会话内容。"
          }
          roleLabel={(role) =>
            role === "assistant"
              ? sessionTarget.kind === "l1"
                ? "维护 Agent"
                : "执行 Agent"
              : role === "system"
                ? "系统"
                : sessionTarget.kind === "l1"
                  ? "任务输入"
                  : "成员 / 上下文"
          }
          path={
            sessionTarget.kind === "l1"
              ? `/projects/${projectId}/l1-sessions/${sessionTarget.task}`
              : `/threads/${sessionTarget.threadId}/replies/${sessionTarget.messageId}/session`
          }
          compactPath={
            sessionTarget.kind === "l1"
              ? `/projects/${projectId}/l1-context/compact`
              : `/threads/${sessionTarget.threadId}/replies/${sessionTarget.messageId}/context/compact`
          }
          compactBody={sessionTarget.kind === "l1" ? { task: sessionTarget.task } : undefined}
          live={
            sessionTarget.kind === "l3"
              ? { threadId: sessionTarget.threadId, messageId: sessionTarget.messageId }
              : undefined
          }
          api={api}
          onClose={() => setSessionTarget(null)}
        />
      ) : null}
      {eventLogs ? <EventLogDialog events={eventLogs} onClose={() => setEventLogs(null)} /> : null}
      {historyKind === "member" ? (
        <L1HistoryDialog
          title="成员发言"
          empty="还没有成员整理记录。"
          columns={L1_RUN_COLUMNS}
          rows={l1RunRows(knowledge?.memberRuns, " 人")}
          onClose={() => setHistoryKind(null)}
        />
      ) : null}
      {historyKind === "document" ? (
        <L1HistoryDialog
          title="文档摘要"
          empty="还没有文档摘要记录。"
          columns={L1_RUN_COLUMNS}
          rows={l1RunRows(
            knowledge?.documentRuns?.length
              ? knowledge.documentRuns
              : knowledge?.projectDocumentRuns,
            " 份",
          )}
          onClose={() => setHistoryKind(null)}
        />
      ) : null}
      {historyKind === "organization" ? (
        <L1HistoryDialog
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
            tone:
              job.status === "failed"
                ? ("failed" as const)
                : job.status === "running"
                  ? ("running" as const)
                  : job.status === "queued"
                    ? ("waiting" as const)
                    : ("idle" as const),
            cells: {
              time: time(job.finished_at || job.started_at || job.created_at),
              scope: job.scope === "project" ? "正式文件" : job.thread_title || "迭代文档",
              count: job.document_count != null ? `${job.document_count} 份` : "—",
              status: runStatusLabel(job.status),
              note: job.error || "",
            },
          }))}
        />
      ) : null}
      {historyKind === "archive" ? (
        <L1HistoryDialog
          title="迭代归档"
          empty="还没有归档方案或归档记录。"
          onClose={() => setHistoryKind(null)}
          columns={[
            { key: "time", label: "时间" },
            { key: "kind", label: "类型" },
            { key: "title", label: "迭代" },
            { key: "note", label: "结论" },
            { key: "status", label: "状态" },
          ]}
          rows={(knowledge?.archiveHistory || []).map((item) => ({
            id: item.id,
            tone: archiveHistoryTone(item.status),
            cells: {
              time: time(item.occurredAt),
              kind: item.kind === "plan" ? "方案" : "记录",
              title: item.title,
              note: (item.error || item.conclusion || "无结论").replace(/\s+/g, " ").slice(0, 160),
              status: archiveHistoryStatus(item.status),
            },
          }))}
        />
      ) : null}
    </>
  );
}
