import { RefreshButton } from "./IconButton";
import { DialogHeader } from "./DialogHeader";
import { showTip } from "./Tip";
import { useAgentMonitorResource } from "./use-agent-monitor-resource";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { AgentLogDialog } from "./AgentLogDialog";
import type { AgentLogScope } from "./trajectory-model";

import { ProjectMark } from "./ProjectMark";

import { labelWorkflowStatus } from "./ui-labels";
import { UiIcon } from "./ui-icon";
import { Dialog, animateDialogClose } from "./dialog-fx";
import type { MonitorData, ChildDetail, SessionTarget } from "./agent-monitor-types";
import {
  runStatusLabel,
  claimedWorkflow,
  poolTone,
  taskSourceName,
  taskExecutorName,
  pendingDetail,
  claimedDetail,
  ENDED,
  liveExecutor,
  selectMonitorWork,
} from "./agent-monitor-model";
import { personaLabel } from "../shared/agent-personas.js";
import { State, ChildTaskCard, CoordinatorStatusIcon } from "./agent-monitor-cards";
import { ChildTaskDetailDialog } from "./agent-monitor-history";
import { TaskSessionDialog } from "./agent-monitor-session";
import { EventLogDialog } from "./agent-monitor-events";
export function AgentMonitor({
  projectId,
  projectName,
  projectImage,
  threadId,
  api,
  onClose,
}: {
  projectId: string;
  projectName: string;
  projectImage?: string | null;
  /** 工作空间左侧栏选中的迭代：监控只跟随它，不再自己切换迭代。 */
  threadId: string;
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
  } = useAgentMonitorResource(projectId, api);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [taskDetail, setTaskDetail] = useState<ChildDetail | null>(null);
  const [logScope, setLogScope] = useState<AgentLogScope | null>(null);
  const [eventLogs, setEventLogs] = useState<MonitorData["eventLog"] | null>(null);
  const [sessionTarget, setSessionTarget] = useState<SessionTarget | null>(null);

  const {
    selectedCoordinator,
    people,
    threadPool,
    childIds,
    slots,
    selectedAgent,
    selectedAgentState,
    pendingTasks,
    claimedTasks,
  } = useMemo(
    () => selectMonitorWork(data, threadId, selectedSlot),
    [data, threadId, selectedSlot],
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
        (event) => event.agent_type === "child_agent" && event.message_id === taskId,
      ),
    );
  };

  useEffect(() => setSelectedSlot(0), [threadId]);

  useEffect(() => {
    if (selectedSlot || !data) return;
    const busy = slots.find((item) => item.task && liveExecutor(item.task));
    setSelectedSlot(busy?.slot || 1);
  }, [data, selectedSlot, slots]);

  return (
    <>
      <Dialog
        onRequestClose={onClose}
        ref={dialog}
        className="agent-monitor"
        aria-labelledby="agent-monitor-title"
      >
        <DialogHeader
          title={<>小祥监控</>}
          titleId="agent-monitor-title"
          subtitle={
            <>
              <ProjectMark name={projectName} image={projectImage} size={16} />
              <span>{projectName}</span>
            </>
          }
          leftExtra={
            <>
              <div>
                <span>项目运行状态</span>
              </div>
            </>
          }
          actions={
            <>
              <div className="agent-monitor-header-actions">
                <RefreshButton
                  pending={reloading}
                  type="button"
                  className="monitor-refresh-btn"
                  onClick={() => void reloadMonitor()}
                  disabled={reloading || (loading && !data)}
                  aria-label="刷新小祥监控"
                  title="刷新"
                  label="刷新小祥监控"
                />
              </div>
            </>
          }
          onClose={() => animateDialogClose(dialog.current, onClose)}
          closeLabel="关闭小祥监控"
        />

        <div className="monitor-scroll">
          {loading && !data ? (
            <div className="monitor-loading" role="status">
              正在读取运行状态…
            </div>
          ) : (
            <>
              <section className="monitor-section monitor-dispatch">
                <div className="monitor-section-heading">
                  <div className="monitor-section-identity">
                    <span className="monitor-agent-title">待派发</span>
                    <span className="monitor-count">{pendingTasks.length} 项</span>
                  </div>
                  <span className="monitor-hint">任务已创建，尚未绑定子 Agent</span>
                </div>
                {pendingTasks.length ? (
                  <div className="executor-list monitor-dispatch-list">
                    {pendingTasks.map((task) => (
                      <ChildTaskCard
                        key={task.task_id}
                        title={task.title}
                        meta={`人设 ${personaLabel(task.persona)} · 来源 ${taskSourceName(task, people)}`}
                        tone={poolTone(task)}
                        status={
                          task.run_status === "queued"
                            ? "等待绑定"
                            : labelWorkflowStatus(task.task_status)
                        }
                        onDetail={() => setTaskDetail(pendingDetail(task, people, childIds))}
                        onTrace={() => openTaskTrace(task.task_id)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="monitor-empty">没有等待派发的任务。</p>
                )}
              </section>

              <section className="monitor-section monitor-executors">
                <div className="monitor-section-heading">
                  <div className="monitor-section-identity">
                    <span className="monitor-agent-title">子 Agent 槽位</span>
                  </div>
                  <span className="monitor-count">
                    {slots.filter((item) => item.running > 0).length}/7 人设工作中
                  </span>
                </div>
                <div className="child-workspace">
                  <div className="child-agent-list" role="listbox" aria-label="子 Agent 槽位">
                    {slots.map(({ slot, agent, task, running }) => {
                      const busy = running > 0;
                      const pool = task
                        ? threadPool.find((item) => item.task_id === task.task_id)
                        : null;
                      const label = pool?.title || task?.progress || (task ? "执行任务" : "空闲");
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedSlot === slot}
                          aria-label={`${agent.name} ${busy ? "工作中" : "空闲"} ${label}`}
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
                          <span className="child-agent-copy">
                            <strong>{agent.name}</strong>
                            <small>
                              {busy
                                ? `${label}${running > 1 ? ` · ${running} 个并行` : ""}`
                                : "空闲"}
                            </small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="child-agent-pane">
                    <div className="child-agent-pane-head">
                      <div className="monitor-section-identity">
                        {selectedAgent ? (
                          <img
                            className="monitor-avatar"
                            src={`/agent-avatars/${selectedAgent.agent.avatar}`}
                            alt=""
                          />
                        ) : null}
                        <span className="monitor-agent-title">
                          {selectedAgent ? `${selectedAgent.agent.name}（固定人设）` : "固定人设"}
                        </span>
                        {selectedAgent ? (
                          <State tone={selectedAgentState.tone}>{selectedAgentState.label}</State>
                        ) : null}
                      </div>
                      <span className="monitor-count">
                        已接过 {claimedTasks.length} 项
                        {claimedTasks.filter((item) => liveExecutor(item)).length
                          ? ` · ${claimedTasks.filter((item) => liveExecutor(item)).length} 个在跑`
                          : ""}
                      </span>
                    </div>
                    <div className="child-agent-pane-body">
                      <div className="executor-list">
                        {claimedTasks.map((task) => {
                          const pool = threadPool.find((item) => item.task_id === task.task_id);
                          const state = claimedWorkflow(task, pool);
                          const title =
                            pool?.title ||
                            task.progress ||
                            (task.task_type === "assist" ? "辅助任务" : "执行任务");
                          const ended = ENDED.has(pool?.task_status || task.status || "");
                          return (
                            <ChildTaskCard
                              key={task.task_id}
                              title={title}
                              meta={`来源 ${taskSourceName({ ...task, source_user_id: task.requested_by }, people)} · ${personaLabel(task.persona || pool?.persona || null)}${task.executor_id ? ` · 会话 ${String(task.executor_id).slice(0, 8)}` : ""}`}
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
                                setTaskDetail(claimedDetail(task, pool, people, childIds))
                              }
                              onTrace={() => openTaskTrace(task.task_id)}
                              onSession={() =>
                                setSessionTarget({
                                  kind: "child_agent",
                                  threadId,
                                  messageId: task.task_id,
                                  title,
                                })
                              }
                            />
                          );
                        })}
                      </div>
                      {!claimedTasks.length && (
                        <p className="monitor-empty">这个槽位还没有接过任务。</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </Dialog>
      {taskDetail ? (
        <ChildTaskDetailDialog detail={taskDetail} onClose={() => setTaskDetail(null)} />
      ) : null}
      {logScope ? (
        <AgentLogDialog scope={logScope} api={api} onClose={() => setLogScope(null)} />
      ) : null}
      {sessionTarget ? (
        <TaskSessionDialog
          kicker="任务会话"
          title={sessionTarget.title}
          emptyIdle="这个任务还没有会话内容。"
          roleLabel={(role) =>
            role === "assistant" ? "执行 Agent" : role === "system" ? "系统" : "成员 / 上下文"
          }
          path={`/threads/${sessionTarget.threadId}/replies/${sessionTarget.messageId}/session`}
          compactPath={`/threads/${sessionTarget.threadId}/replies/${sessionTarget.messageId}/context/compact`}
          live={{ threadId: sessionTarget.threadId, messageId: sessionTarget.messageId }}
          api={api}
          onClose={() => setSessionTarget(null)}
        />
      ) : null}
      {eventLogs ? <EventLogDialog events={eventLogs} onClose={() => setEventLogs(null)} /> : null}
    </>
  );
}
