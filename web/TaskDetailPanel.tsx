import { useEffect, useRef, useState, type ReactNode } from "react";
import { taskViewModel } from "./task-view-model";
import { showTip } from "./Tip";
import { MCP_TASK_COPY_INSTRUCTION, formatMcpCopyPayload } from "../shared/mcp-guide.js";
import { AGENT_MEMBER } from "../shared/agent-member.js";

import { libraryFolderPath } from "./document-library";

import { PaginationControl } from "./PaginationControl";
import { labelWorkflowStatus } from "./ui-labels";
import { UiIcon } from "./ui-icon";
import { api } from "./workspace-api";
import type { AgentTask, AgentTaskDetail, Detail, TaskTimelineKind } from "./workspace-types";
import type { PersonalProfile } from "./ProfileFields";
export type TaskDetailPanelProps = {
  taskId: string;
  taskCreateOpen: boolean;
  tasks: AgentTask[];
  onChanged: () => Promise<unknown>;
  detail: Detail | null;
  projectId: string;
  threadId: string;
  user: PersonalProfile;
  active: boolean;
  renderRef: (ref: string) => ReactNode;
  projectConnectorBound: boolean;
  time: (text: string) => string;
  mcpEndpoint: string;
};
export function TaskDetailPanel({
  taskId,
  taskCreateOpen,
  tasks,
  onChanged,
  detail,
  projectId,
  threadId,
  user,
  active,
  renderRef,
  projectConnectorBound,
  time,
  mcpEndpoint,
}: TaskDetailPanelProps) {
  const selectedTaskId = taskId;

  const [taskTimelineFilters, setTaskTimelineFilters] = useState<Record<TaskTimelineKind, boolean>>(
    {
      member_update: true,
      status_change: true,
      assignment: true,
      execution: true,
    },
  );
  const [taskTimelinePage, setTaskTimelinePage] = useState(0);
  const [taskTimelinePageSize, setTaskTimelinePageSize] = useState(12);

  const [taskDetail, setTaskDetail] = useState<AgentTaskDetail | null>(null);
  const [taskActionBusy, setTaskActionBusy] = useState(false);
  const [taskActionError, setTaskActionError] = useState("");
  const [copiedTaskId, setCopiedTaskId] = useState("");
  const [taskExecutionMode, setTaskExecutionMode] = useState<
    "auto" | "human_direct" | "member_local_executor"
  >("auto");
  const [taskTransferTarget, setTaskTransferTarget] = useState("");
  const [taskResult, setTaskResult] = useState("");
  const [taskAnswer, setTaskAnswer] = useState("");
  const [taskReopenGoal, setTaskReopenGoal] = useState("");
  const [taskReopenConstraints, setTaskReopenConstraints] = useState("");

  const mounted = useRef(true);
  const selected = useRef(selectedTaskId);
  selected.current = selectedTaskId;
  const operationBusy = useRef(false);
  const detailRevision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const {
    taskDetailTimeline,
    taskSourceLabel,
    taskExecutorLabel,
    executionRunLabel,
    statusActorLabel,
    endedTask,
  } = taskViewModel(tasks, detail, user, threadId);
  const copyTaskInfo = async (task: AgentTask) => {
    if (!projectId || detail?.id !== projectId) return;
    const originThreadId = task.origin_thread_id || threadId;
    const iteration =
      detail?.threads.find((item) => item.id === originThreadId)?.title || undefined;
    const info = formatMcpCopyPayload({
      server: `${location.origin}${mcpEndpoint}`,
      project: detail?.name,
      projectId,
      iteration,
      threadId: originThreadId,
      task: task.title,
      taskId: task.id,
      instruction: MCP_TASK_COPY_INSTRUCTION,
    });
    try {
      await navigator.clipboard.writeText(info);
      setCopiedTaskId(task.id);
      showTip("任务信息已复制");
    } catch {
      setTaskActionError("无法自动复制任务信息，请检查剪贴板权限后重试。");
      showTip("无法自动复制任务信息，请检查剪贴板权限后重试。", "error");
    }
  };
  useEffect(() => {
    if (!copiedTaskId) return;
    const timer = setTimeout(() => setCopiedTaskId(""), 2000);
    return () => clearTimeout(timer);
  }, [copiedTaskId]);
  useEffect(() => {
    if (!selectedTaskId) {
      setTaskDetail(null);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let primed = false;
    const load = async () => {
      const revision = detailRevision.current;
      try {
        const value = await api(
          `/tasks/${selectedTaskId}`,
          undefined,
          undefined,
          controller.signal,
        );
        if (!alive || operationBusy.current || revision !== detailRevision.current) return;
        setTaskDetail(value);
        if (!primed) {
          primed = true;
          setTaskResult(value.result_summary || "");
          setTaskReopenGoal(value.goal || "");
          setTaskReopenConstraints(value.constraints || "");
          setTaskActionError("");
        }
      } catch (cause) {
        if (alive && !operationBusy.current && revision === detailRevision.current)
          setTaskActionError((cause as Error).message);
      } finally {
        if (alive)
          timer = setTimeout(() => {
            void load();
          }, 5000);
      }
    };
    void load();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedTaskId]);

  const performTaskAction = async (action: () => Promise<unknown>, success = "操作成功") => {
    if (operationBusy.current) return;
    if (!active) {
      setTaskActionError("当前迭代只读，任务暂不能变更");
      return;
    }
    operationBusy.current = true;
    detailRevision.current++;
    setTaskActionBusy(true);
    setTaskActionError("");
    const taskId = selectedTaskId;
    try {
      await action();
      if (!mounted.current) return;
      if (success) showTip(success);
      try {
        const [, nextDetail] = await Promise.all([
          onChanged(),
          taskId ? api(`/tasks/${taskId}`) : Promise.resolve(null),
        ]);
        if (!mounted.current || selected.current !== taskId) return;
        setTaskDetail(nextDetail);
        if (nextDetail) {
          setTaskResult(nextDetail.result_summary || "");
          setTaskReopenGoal(nextDetail.goal || "");
          setTaskReopenConstraints(nextDetail.constraints || "");
        }
      } catch {
        if (mounted.current) showTip("操作已完成，任务刷新失败，请稍后重试", "error");
      }
    } catch (cause) {
      if (mounted.current) {
        const message = (cause as Error).message;
        setTaskActionError(message);
        showTip(message, "error");
      }
    } finally {
      detailRevision.current++;
      operationBusy.current = false;
      if (mounted.current) setTaskActionBusy(false);
    }
  };

  return (
    <div className="task-pool-dialog-detail">
      {selectedTaskId ? (
        (() => {
          const task = taskDetail;
          const isTarget =
            active && task?.target_type === "human_member" && task.target_id === user.id;
          const isSource =
            active &&
            !!task &&
            (task.source_user_id === user.id ||
              (task.created_by_type === "human_member" && task.created_by_id === user.id));
          const canTransfer =
            !!task &&
            isTarget &&
            [
              "awaiting_acceptance",
              "assigned",
              "pending_assignment",
              "pending_start",
              "queued",
              "waiting",
              "blocked",
            ].includes(task.status);
          const openQuestion = task?.questions.find(
            (question) => question.status === "open" && question.source_user_id === user.id,
          );
          const canReviewRejection =
            active &&
            !!task &&
            task.status === "rejected" &&
            task.rejectionReview.rejected &&
            !task.rejectionReview.resolved &&
            task.rejectionReview.reviewer_type === "human_member" &&
            task.rejectionReview.reviewer_id === user.id;
          const targetName =
            detail?.members.find((member) => member.id === task?.target_id)?.name ||
            (task?.target_type === "l2_session" ? "小祥" : "未指派");
          return (
            <div className="task-detail">
              {!task || task.id !== selectedTaskId ? (
                <p className="muted">正在读取任务详情…</p>
              ) : (
                <>
                  <header>
                    <div className="task-detail-title">
                      <h3>{task.title}</h3>
                      <div className="task-detail-id">
                        <span>
                          任务 ID：<code>{task.id}</code>
                        </span>
                        <button
                          type="button"
                          title={copiedTaskId === task.id ? "已复制" : "复制任务信息"}
                          aria-label={copiedTaskId === task.id ? "已复制任务信息" : "复制任务信息"}
                          onClick={() => void copyTaskInfo(task)}
                        >
                          <UiIcon name={copiedTaskId === task.id ? "check" : "copy"} size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="task-detail-header-actions">
                      <span data-status={task.status}>{labelWorkflowStatus(task.status)}</span>
                    </div>
                  </header>
                  <dl className="task-detail-meta">
                    <div>
                      <dt>任务来源</dt>
                      <dd>{taskSourceLabel(task)}</dd>
                    </div>
                    <div>
                      <dt>任务类型</dt>
                      <dd>{task.task_type === "assist_l2" ? "辅助任务" : "正式任务"}</dd>
                    </div>
                    <div>
                      <dt>责任主体</dt>
                      <dd>{targetName}</dd>
                    </div>
                    <div>
                      <dt>任务执行</dt>
                      <dd>{taskExecutorLabel(task)}</dd>
                    </div>
                  </dl>
                  <section>
                    <h4>任务目标</h4>
                    <p>{task.goal}</p>
                    {task.constraints && (
                      <>
                        <h4>约束</h4>
                        <p>{task.constraints}</p>
                      </>
                    )}
                    {(() => {
                      const parseIds = (value: string[] | string | null | undefined) => {
                        if (Array.isArray(value))
                          return value.filter((id) => typeof id === "string" && id);
                        if (typeof value === "string") {
                          try {
                            const parsed = JSON.parse(value);
                            return Array.isArray(parsed)
                              ? parsed.filter((id) => typeof id === "string" && id)
                              : [];
                          } catch {
                            return [];
                          }
                        }
                        return [];
                      };
                      const refs = parseIds(task.document_refs);
                      const folderRefs = parseIds(task.folder_refs);
                      return refs.length || folderRefs.length ? (
                        <>
                          {folderRefs.length ? (
                            <>
                              <h4>引用文件夹</h4>
                              <div className="references">
                                {folderRefs.map((id) => {
                                  const folder = detail?.folders.find((item) => item.id === id);
                                  return (
                                    <span className="ref" key={id}>
                                      {folder
                                        ? libraryFolderPath(id, detail?.folders || []) ||
                                          folder.name
                                        : id}
                                    </span>
                                  );
                                })}
                              </div>
                            </>
                          ) : null}
                          {refs.length ? (
                            <>
                              <h4>引用文档</h4>
                              <div className="references">{refs.map(renderRef)}</div>
                            </>
                          ) : null}
                        </>
                      ) : null;
                    })()}
                  </section>
                  {active && openQuestion && (
                    <section className="task-question">
                      <h4>需要你回答</h4>
                      <p>{openQuestion.question}</p>
                      <textarea
                        value={taskAnswer}
                        onChange={(event) => setTaskAnswer(event.target.value)}
                        placeholder="输入回答"
                      />
                      <button
                        type="button"
                        className="primary"
                        disabled={taskActionBusy || !taskAnswer.trim()}
                        onClick={() =>
                          void performTaskAction(async () => {
                            await api(`/task-questions/${openQuestion.id}/answer`, {
                              answer: taskAnswer,
                            });
                            setTaskAnswer("");
                          }, "回答已提交")
                        }
                      >
                        提交回答
                      </button>
                    </section>
                  )}
                  {isTarget && task.status === "awaiting_acceptance" && (
                    <section className="task-actions-section">
                      <h4>确认任务</h4>
                      {projectConnectorBound ? (
                        <select
                          value={
                            taskExecutionMode === "auto"
                              ? "member_local_executor"
                              : taskExecutionMode
                          }
                          onChange={(event) =>
                            setTaskExecutionMode(event.target.value as typeof taskExecutionMode)
                          }
                        >
                          <option value="member_local_executor">下发本地执行器</option>
                          <option value="human_direct">由本人执行</option>
                        </select>
                      ) : (
                        <p className="muted">当前账号未连接本项目本地执行器，确认后由本人执行。</p>
                      )}
                      <div className="task-action-buttons">
                        <button
                          type="button"
                          disabled={taskActionBusy}
                          onClick={() =>
                            void performTaskAction(
                              () => api(`/tasks/${task.id}/reject`, {}, "POST"),
                              "已拒绝任务",
                            )
                          }
                        >
                          <UiIcon name="reject" size={13} />
                          拒绝
                        </button>
                        <button
                          type="button"
                          className="primary"
                          disabled={taskActionBusy}
                          onClick={() =>
                            void performTaskAction(
                              () =>
                                api(
                                  `/tasks/${task.id}/accept`,
                                  {
                                    mode: projectConnectorBound
                                      ? taskExecutionMode === "human_direct"
                                        ? "human_direct"
                                        : "member_local_executor"
                                      : "human_direct",
                                  },
                                  "POST",
                                ),
                              "已确认任务",
                            )
                          }
                        >
                          <UiIcon name="check" size={13} />
                          确认
                        </button>
                      </div>
                    </section>
                  )}
                  {isSource && task.status === "awaiting_acceptance" && (
                    <section className="task-actions-section">
                      <h4>来源操作</h4>
                      <button
                        type="button"
                        disabled={taskActionBusy}
                        onClick={() =>
                          void performTaskAction(
                            () => api(`/tasks/${task.id}/cancel`, {}, "POST"),
                            "任务已取消",
                          )
                        }
                      >
                        <UiIcon name="close" size={13} />
                        取消
                      </button>
                    </section>
                  )}
                  {canReviewRejection && (
                    <section className="task-actions-section task-rejection-review">
                      <h4>任务已被拒绝</h4>
                      <p>
                        {[...task.assignmentHistory]
                          .reverse()
                          .find((event) => event.event_type === "rejected")?.reason ||
                          "目标成员拒绝了这个任务。"}
                      </p>
                      <textarea
                        value={taskReopenGoal}
                        onChange={(event) => setTaskReopenGoal(event.target.value)}
                        placeholder="修改任务目标与验收标准"
                      />
                      <textarea
                        value={taskReopenConstraints}
                        onChange={(event) => setTaskReopenConstraints(event.target.value)}
                        placeholder="修改约束（可选）"
                      />
                      <div className="task-action-buttons">
                        <button
                          type="button"
                          disabled={taskActionBusy}
                          onClick={() =>
                            void performTaskAction(
                              () => api(`/tasks/${task.id}/acknowledge-rejection`, {}, "POST"),
                              "已确认拒绝结果",
                            )
                          }
                        >
                          知道了
                        </button>
                        <button
                          type="button"
                          className="primary"
                          disabled={taskActionBusy || !taskReopenGoal.trim()}
                          onClick={() =>
                            void performTaskAction(
                              () =>
                                api(
                                  `/tasks/${task.id}/reopen`,
                                  {
                                    goal: taskReopenGoal.trim(),
                                    constraints: taskReopenConstraints,
                                  },
                                  "POST",
                                ),
                              "任务已重新发起",
                            )
                          }
                        >
                          修改后重新发起
                        </button>
                      </div>
                    </section>
                  )}
                  {canTransfer && (
                    <section className="task-actions-section">
                      <h4>转交任务</h4>
                      <select
                        value={taskTransferTarget}
                        onChange={(event) => setTaskTransferTarget(event.target.value)}
                      >
                        <option value="">选择新的责任主体</option>
                        <option value="l2_session">小祥</option>
                        {detail?.members
                          .filter(
                            (member) =>
                              member.id !== user.id &&
                              member.kind !== "l1" &&
                              member.kind !== "l2" &&
                              member.id !== AGENT_MEMBER.id &&
                              member.role !== "viewer",
                          )
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={taskActionBusy || !taskTransferTarget}
                        onClick={() =>
                          void performTaskAction(
                            () =>
                              api(
                                `/tasks/${task.id}/reassign`,
                                taskTransferTarget === "l2_session"
                                  ? { targetType: "l2_session" }
                                  : {
                                      targetType: "human_member",
                                      targetUserId: taskTransferTarget,
                                    },
                                "POST",
                              ),
                            "任务已转交",
                          )
                        }
                      >
                        <UiIcon name="transfer" size={13} />
                        确认转交
                      </button>
                    </section>
                  )}
                  {isTarget &&
                    task.execution_agent_type === "human_self" &&
                    !endedTask(task.status) &&
                    task.status !== "awaiting_acceptance" && (
                      <section className="task-actions-section">
                        <h4>进度与结果</h4>
                        <textarea
                          value={taskResult}
                          onChange={(event) => setTaskResult(event.target.value)}
                          placeholder="结果摘要"
                        />
                        <div className="task-status-actions">
                          <button
                            type="button"
                            disabled={taskActionBusy}
                            onClick={() =>
                              void performTaskAction(
                                () =>
                                  api(
                                    `/tasks/${task.id}`,
                                    {
                                      status: "abandoned",
                                      resultSummary: taskResult || "已放弃",
                                    },
                                    "PATCH",
                                  ),
                                "任务已放弃",
                              )
                            }
                          >
                            <UiIcon name="abandon" size={13} />
                            放弃
                          </button>
                          <button
                            type="button"
                            className="primary"
                            disabled={taskActionBusy}
                            onClick={() =>
                              void performTaskAction(
                                () =>
                                  api(
                                    `/tasks/${task.id}`,
                                    {
                                      status: "completed",
                                      resultSummary: taskResult || "已完成",
                                    },
                                    "PATCH",
                                  ),
                                "任务已完成",
                              )
                            }
                          >
                            <UiIcon name="complete" size={13} />
                            完成
                          </button>
                        </div>
                      </section>
                    )}
                  {(() => {
                    const timeline = taskDetailTimeline(task);
                    const visibleTimeline = timeline.filter(
                      (item) => taskTimelineFilters[item.kind],
                    );
                    const pageSize = taskTimelinePageSize;
                    const pageCount = Math.max(1, Math.ceil(visibleTimeline.length / pageSize));
                    const page = Math.min(taskTimelinePage, pageCount - 1);
                    const pageItems = visibleTimeline.slice(page * pageSize, (page + 1) * pageSize);
                    const filterLabels: { kind: TaskTimelineKind; label: string }[] = [
                      { kind: "member_update", label: "成员动态" },
                      { kind: "status_change", label: "状态变化" },
                      { kind: "assignment", label: "指派变更" },
                      { kind: "execution", label: "执行轮次" },
                    ];
                    return timeline.length ? (
                      <section className="task-timeline-section">
                        <div className="task-timeline-header">
                          <h4>任务时间线</h4>
                          <div className="task-timeline-filters" aria-label="任务时间线筛选">
                            {filterLabels.map(({ kind, label }) => (
                              <label key={kind}>
                                <input
                                  type="checkbox"
                                  checked={taskTimelineFilters[kind]}
                                  onChange={(event) => {
                                    setTaskTimelineFilters((current) => ({
                                      ...current,
                                      [kind]: event.target.checked,
                                    }));
                                    setTaskTimelinePage(0);
                                  }}
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                        {pageItems.length ? (
                          <div className="task-history task-change-log task-timeline-list">
                            {pageItems.map((item, index) => (
                              <div
                                className={`task-change-item task-timeline-item-${item.kind}${index === 0 && page === 0 ? " is-latest" : ""}`}
                                key={item.key}
                              >
                                <i className="task-change-marker" aria-hidden="true" />
                                <div className="task-change-content">
                                  <div className="task-change-heading">
                                    <strong>{item.title}</strong>
                                    <span>
                                      {item.kind === "execution"
                                        ? executionRunLabel(
                                            {
                                              executor_type: item.actorType,
                                              executor_id: item.actorId,
                                              executor_label: item.actorName,
                                              status: "",
                                              progress: null,
                                              result_summary: null,
                                              error: null,
                                              created_at: item.at,
                                              id: item.key,
                                            },
                                            task,
                                          )
                                        : statusActorLabel(
                                            {
                                              actor_type: item.actorType,
                                              actor_id: item.actorId,
                                              actor_name: item.actorName,
                                            },
                                            task,
                                          )}{" "}
                                      · {time(item.at)}
                                    </span>
                                  </div>
                                  {item.body && (
                                    <small className="task-timeline-body">{item.body}</small>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="muted task-timeline-empty">当前筛选条件下暂无记录。</p>
                        )}
                        {visibleTimeline.length > 0 && (
                          <PaginationControl
                            className="task-timeline-pagination"
                            total={visibleTimeline.length}
                            currentPage={page + 1}
                            pageSize={pageSize}
                            pageSizeOptions={[10, 12, 20, 50]}
                            onPageChange={(next) => setTaskTimelinePage(next - 1)}
                            onPageSizeChange={(next) => {
                              setTaskTimelinePageSize(next);
                              setTaskTimelinePage(0);
                            }}
                            ariaLabel="任务时间线分页"
                          />
                        )}
                      </section>
                    ) : null;
                  })()}
                </>
              )}
              {taskActionError && !taskCreateOpen && (
                <p className="project-settings-error" role="alert">
                  {taskActionError}
                </p>
              )}
            </div>
          );
        })()
      ) : (
        <p className="panel-empty">选择左侧任务，查看详情和操作。</p>
      )}
    </div>
  );
}
