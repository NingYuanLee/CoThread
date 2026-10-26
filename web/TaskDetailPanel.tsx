import { useEffect, useRef, useState, type ReactNode } from "react";
import { taskViewModel } from "./task-view-model";
import { showTip } from "./Tip";
import { taskCopyInfo } from "./task-copy";
import { AGENT_MEMBER } from "../shared/agent-member.js";

import { libraryFolderPath } from "./document-library";

import { PaginationControl } from "./PaginationControl";
import { SelectField } from "./SelectField";
import { TextAreaField } from "./TextAreaField";
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
  const [taskRedirectOpen, setTaskRedirectOpen] = useState(false);
  const [taskRedirectGoal, setTaskRedirectGoal] = useState("");
  const [taskRedirectConstraints, setTaskRedirectConstraints] = useState("");
  const [taskRedirectReason, setTaskRedirectReason] = useState("");
  const [taskRedirectTarget, setTaskRedirectTarget] = useState("");
  const [dockMoreOpen, setDockMoreOpen] = useState(false);

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
    try {
      await navigator.clipboard.writeText(taskCopyInfo({ projectId, threadId, mcpEndpoint }, task));
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

  const assigneeOptions = [
    { value: "", label: "选择新的责任主体" },
    { value: "xiaoxiang", label: "小祥" },
    ...(detail?.members ?? [])
      .filter(
        (member) =>
          member.id !== user.id &&
          member.kind !== "laoweng" &&
          member.kind !== "xiaoxiang" &&
          member.id !== AGENT_MEMBER.id &&
          member.role !== "viewer",
      )
      .map((member) => ({ value: member.id, label: member.name })),
  ];
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
            (task?.target_type === "xiaoxiang" ? "小祥" : "未指派");
          const blockedText =
            task?.status === "blocked"
              ? (task.blocked_reason || task.resume_condition || task.progress || "").trim()
              : "";
          const retryCount = typeof task?.retry_count === "number" ? task.retry_count : null;
          const maxRetryCount =
            typeof task?.max_retry_count === "number" ? task.max_retry_count : null;
          const retryLabel =
            retryCount === null
              ? ""
              : maxRetryCount === null
                ? `已重试 ${retryCount} 次`
                : `已重试 ${retryCount}/${maxRetryCount} 次`;
          const showQuestion = Boolean(active && openQuestion);
          const showAccept = Boolean(isTarget && task?.status === "awaiting_acceptance");
          const showSourceOps = Boolean(
            isSource && task && ["awaiting_acceptance", "blocked", "ignored"].includes(task.status),
          );
          const showProgress = Boolean(
            isTarget &&
            task &&
            task.execution_agent_type === "human_self" &&
            !endedTask(task.status) &&
            task.status !== "awaiting_acceptance",
          );
          const hasPrimary =
            showQuestion || showAccept || showProgress || Boolean(canReviewRejection);
          const hasSecondary =
            showAccept || showSourceOps || showProgress || Boolean(canReviewRejection);
          const hasDock = hasPrimary || hasSecondary || Boolean(canTransfer);
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
                      <dd>{task.task_type === "assist" ? "辅助任务" : "正式任务"}</dd>
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
                  <div className="task-detail-scroll">
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
                    {task.status === "blocked" && (
                      <div className="task-blocked-section" role="group" aria-label="阻塞原因">
                        <h4>阻塞原因</h4>
                        <p>{blockedText || "未记录阻塞原因"}</p>
                        {retryLabel && <small className="task-blocked-retry">{retryLabel}</small>}
                      </div>
                    )}
                    {(() => {
                      const timeline = taskDetailTimeline(task);
                      const visibleTimeline = timeline.filter(
                        (item) => taskTimelineFilters[item.kind],
                      );
                      const pageSize = taskTimelinePageSize;
                      const pageCount = Math.max(1, Math.ceil(visibleTimeline.length / pageSize));
                      const page = Math.min(taskTimelinePage, pageCount - 1);
                      const pageItems = visibleTimeline.slice(
                        page * pageSize,
                        (page + 1) * pageSize,
                      );
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
                  </div>
                  {hasDock && task && (
                    <footer
                      className={`task-action-dock${hasPrimary && hasSecondary ? " can-collapse" : ""}`}
                      aria-label="任务操作"
                    >
                      {(showQuestion ||
                        canReviewRejection ||
                        showAccept ||
                        showProgress ||
                        canTransfer ||
                        (showSourceOps && task.status === "blocked" && taskRedirectOpen)) && (
                        <div className="task-action-dock-forms">
                          {showQuestion && openQuestion && (
                            <div className="task-action-form">
                              <p className="task-action-kicker">需要你回答</p>
                              <p className="task-action-note">{openQuestion.question}</p>
                              <TextAreaField
                                aria-label="回答"
                                value={taskAnswer}
                                onChange={(event) => setTaskAnswer(event.target.value)}
                                placeholder="输入回答"
                              />
                            </div>
                          )}
                          {canReviewRejection && (
                            <div className="task-action-form">
                              <p className="task-action-kicker">任务已被拒绝</p>
                              <p className="task-action-note">
                                {[...task.assignmentHistory]
                                  .reverse()
                                  .find((event) => event.event_type === "rejected")?.reason ||
                                  "目标成员拒绝了这个任务。"}
                              </p>
                              <TextAreaField
                                aria-label="任务目标与验收标准"
                                value={taskReopenGoal}
                                onChange={(event) => setTaskReopenGoal(event.target.value)}
                                placeholder="修改任务目标与验收标准"
                              />
                              <TextAreaField
                                aria-label="任务约束"
                                value={taskReopenConstraints}
                                onChange={(event) => setTaskReopenConstraints(event.target.value)}
                                placeholder="修改约束（可选）"
                              />
                            </div>
                          )}
                          {showAccept &&
                            (projectConnectorBound ? (
                              <SelectField
                                aria-label="任务执行方式"
                                value={
                                  taskExecutionMode === "auto"
                                    ? "member_local_executor"
                                    : taskExecutionMode
                                }
                                onChange={(next) =>
                                  setTaskExecutionMode(next as typeof taskExecutionMode)
                                }
                                options={[
                                  { value: "member_local_executor", label: "下发本地执行器" },
                                  { value: "human_direct", label: "由本人执行" },
                                ]}
                              />
                            ) : (
                              <p className="task-action-note">
                                当前账号未连接本项目本地执行器，确认后由本人执行。
                              </p>
                            ))}
                          {showProgress && (
                            <TextAreaField
                              aria-label="结果摘要"
                              value={taskResult}
                              onChange={(event) => setTaskResult(event.target.value)}
                              placeholder="结果摘要"
                            />
                          )}
                          {canTransfer && (
                            <div className="task-action-transfer">
                              <SelectField
                                aria-label="责任主体"
                                value={taskTransferTarget}
                                onChange={setTaskTransferTarget}
                                options={assigneeOptions}
                              />
                              <button
                                type="button"
                                disabled={taskActionBusy || !taskTransferTarget}
                                onClick={() =>
                                  void performTaskAction(
                                    () =>
                                      api(
                                        `/tasks/${task.id}/reassign`,
                                        taskTransferTarget === "xiaoxiang"
                                          ? { targetType: "xiaoxiang" }
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
                            </div>
                          )}
                          {showSourceOps && task.status === "blocked" && taskRedirectOpen && (
                            <div className="task-redirect-panel" id="task-redirect-panel">
                              <TextAreaField
                                label="任务目标"
                                value={taskRedirectGoal}
                                onChange={(event) => setTaskRedirectGoal(event.target.value)}
                                placeholder="任务目标与验收标准"
                              />
                              <TextAreaField
                                label="约束"
                                value={taskRedirectConstraints}
                                onChange={(event) => setTaskRedirectConstraints(event.target.value)}
                                placeholder="约束（可选）"
                              />
                              <TextAreaField
                                label="补充说明"
                                value={taskRedirectReason}
                                onChange={(event) => setTaskRedirectReason(event.target.value)}
                                placeholder="补充给执行方的说明"
                              />
                              <SelectField
                                aria-label="改派责任主体"
                                value={taskRedirectTarget}
                                onChange={setTaskRedirectTarget}
                                options={assigneeOptions}
                              />
                              <div className="task-action-buttons">
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={
                                    taskActionBusy ||
                                    !taskRedirectGoal.trim() ||
                                    !taskRedirectTarget
                                  }
                                  onClick={() =>
                                    void performTaskAction(async () => {
                                      await api(
                                        `/tasks/${task.id}/redirect`,
                                        {
                                          goal: taskRedirectGoal.trim(),
                                          constraints: taskRedirectConstraints,
                                          reason: taskRedirectReason.trim(),
                                          ...(taskRedirectTarget === "xiaoxiang"
                                            ? { targetType: "xiaoxiang" }
                                            : {
                                                targetType: "human_member",
                                                targetUserId: taskRedirectTarget,
                                              }),
                                        },
                                        "POST",
                                      );
                                      setTaskRedirectOpen(false);
                                    }, "任务已补充并改派")
                                  }
                                >
                                  <UiIcon name="check" size={13} />
                                  确认改派
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {(hasPrimary || hasSecondary) && (
                        <div className="task-action-dock-bar">
                          <div className="task-action-dock-side">
                            {hasPrimary && hasSecondary && (
                              <button
                                type="button"
                                className="task-action-more"
                                aria-expanded={dockMoreOpen}
                                aria-controls="task-action-secondary"
                                onClick={() => setDockMoreOpen((current) => !current)}
                              >
                                更多
                                <UiIcon
                                  name={dockMoreOpen ? "chevronUp" : "chevronDown"}
                                  size={13}
                                />
                              </button>
                            )}
                            <div
                              className={`task-action-dock-secondary${dockMoreOpen ? " is-open" : ""}`}
                              id="task-action-secondary"
                            >
                              {showAccept && (
                                <button
                                  type="button"
                                  className="task-action-danger"
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
                              )}
                              {showSourceOps && task.status === "awaiting_acceptance" && (
                                <button
                                  type="button"
                                  className="task-action-danger"
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
                              )}
                              {showProgress && (
                                <button
                                  type="button"
                                  className="task-action-danger"
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
                              )}
                              {showSourceOps && task.status === "blocked" && (
                                <button
                                  type="button"
                                  disabled={taskActionBusy}
                                  onClick={() =>
                                    void performTaskAction(
                                      () => api(`/tasks/${task.id}/ignore`, {}, "POST"),
                                      "任务已忽略",
                                    )
                                  }
                                >
                                  <UiIcon name="eyeOff" size={13} />
                                  改为已忽略
                                </button>
                              )}
                              {showSourceOps && task.status === "blocked" && (
                                <button
                                  type="button"
                                  aria-expanded={taskRedirectOpen}
                                  aria-controls="task-redirect-panel"
                                  disabled={taskActionBusy}
                                  onClick={() => {
                                    if (!taskRedirectOpen) {
                                      setTaskRedirectGoal(task.goal || "");
                                      setTaskRedirectConstraints(task.constraints || "");
                                      setTaskRedirectReason("");
                                      setTaskRedirectTarget("");
                                    }
                                    setTaskRedirectOpen((current) => !current);
                                  }}
                                >
                                  <UiIcon name="transfer" size={13} />
                                  补充内容后改派
                                </button>
                              )}
                              {showSourceOps && task.status === "ignored" && (
                                <button
                                  type="button"
                                  disabled={taskActionBusy}
                                  onClick={() =>
                                    void performTaskAction(
                                      () => api(`/tasks/${task.id}/restore-ignored`, {}, "POST"),
                                      "任务已恢复",
                                    )
                                  }
                                >
                                  <UiIcon name="restore" size={13} />
                                  恢复为已阻塞
                                </button>
                              )}
                              {canReviewRejection && (
                                <button
                                  type="button"
                                  disabled={taskActionBusy}
                                  onClick={() =>
                                    void performTaskAction(
                                      () =>
                                        api(`/tasks/${task.id}/acknowledge-rejection`, {}, "POST"),
                                      "已确认拒绝结果",
                                    )
                                  }
                                >
                                  知道了
                                </button>
                              )}
                            </div>
                          </div>
                          {hasPrimary && (
                            <div className="task-action-dock-primary">
                              {showQuestion && openQuestion && (
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
                              )}
                              {showAccept && (
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
                              )}
                              {showProgress && (
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
                              )}
                              {canReviewRejection && (
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
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </footer>
                  )}
                </>
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
