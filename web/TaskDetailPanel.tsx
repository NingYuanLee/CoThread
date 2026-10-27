import { useEffect, useRef, useState, type ReactNode } from "react";
import { taskViewModel } from "./task-view-model";
import { showTip } from "./Tip";
import { taskCopyInfo } from "./task-copy";
import { AGENT_MEMBER } from "../shared/agent-member.js";

import { libraryFolderPath } from "./document-library";

import { DialogFooter } from "./DialogFooter";
import { DialogHeader } from "./DialogHeader";
import { ModalBackdrop } from "./dialog-fx";
import { PaginationControl } from "./PaginationControl";
import { SelectField } from "./SelectField";
import { TextAreaField } from "./TextAreaField";
import { labelWorkflowStatus } from "./ui-labels";
import { UiIcon, type UiIconName } from "./ui-icon";
import { api } from "./workspace-api";
import type { AgentTask, AgentTaskDetail, Detail, TaskTimelineKind } from "./workspace-types";
import type { PersonalProfile } from "./ProfileFields";

type TaskActionDialog =
  | ""
  | "timeline"
  | "answer"
  | "accept"
  | "complete"
  | "abandon"
  | "transfer"
  | "redirect"
  | "reopen";

function TaskOpDialog({
  title,
  busy,
  confirmLabel,
  confirmClassName,
  confirmDisabled,
  confirmIcon,
  compact,
  titleId = "task-op-dialog-title",
  fullscreen = true,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  busy: boolean;
  confirmLabel: string;
  confirmClassName?: string;
  confirmDisabled?: boolean;
  confirmIcon?: UiIconName;
  compact?: boolean;
  titleId?: string;
  fullscreen?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <ModalBackdrop onClose={onClose} enabled={!busy}>
      {(close) => (
        <section
          className={`task-op-dialog${compact ? " is-confirm" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader
            title={<>{title}</>}
            titleId={titleId}
            onClose={close}
            disabled={busy}
            closeLabel={`关闭${title}`}
            fullscreen={fullscreen}
          />
          <div className="dialog-form-scroll task-op-dialog-body">{children}</div>
          <DialogFooter>
            <button type="button" disabled={busy} onClick={close}>
              取消
            </button>
            <button
              type="button"
              className={confirmClassName || "primary"}
              disabled={busy || confirmDisabled}
              onClick={onConfirm}
            >
              {confirmIcon ? <UiIcon name={confirmIcon} size={13} /> : null}
              {confirmLabel}
            </button>
          </DialogFooter>
        </section>
      )}
    </ModalBackdrop>
  );
}
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
  const [taskDialog, setTaskDialog] = useState<TaskActionDialog>("");
  const [taskConfirm, setTaskConfirm] = useState<{
    title: string;
    message: string;
    danger?: boolean;
    run: () => void;
  } | null>(null);
  const [taskRedirectGoal, setTaskRedirectGoal] = useState("");
  const [taskRedirectConstraints, setTaskRedirectConstraints] = useState("");
  const [taskRedirectReason, setTaskRedirectReason] = useState("");
  const [taskRedirectTarget, setTaskRedirectTarget] = useState("");

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
  const closeTaskDialog = () => {
    setTaskDialog("");
    setTaskConfirm(null);
  };
  const finishTaskDialog = (action: () => Promise<unknown>, success: string) => {
    void performTaskAction(async () => {
      await action();
      setTaskDialog("");
      setTaskConfirm(null);
    }, success);
  };
  const askTaskConfirm = (title: string, message: string, run: () => void, danger = false) => {
    setTaskConfirm({ title, message, run, danger });
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
                  </header>
                  <div className="task-detail-scroll">
                    <dl className="task-detail-meta task-detail-meta-five">
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
                      <div>
                        <dt>任务状态</dt>
                        <dd>
                          <span className="task-detail-status" data-status={task.status}>
                            {labelWorkflowStatus(task.status)}
                          </span>
                        </dd>
                      </div>
                    </dl>
                    {task.status === "blocked" && (
                      <div className="task-blocked-section" role="group" aria-label="阻塞原因">
                        <h4>阻塞原因</h4>
                        <p>{blockedText || "未记录阻塞原因"}</p>
                        {retryLabel && <small className="task-blocked-retry">{retryLabel}</small>}
                      </div>
                    )}
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
                  </div>
                  <footer className="task-action-dock" aria-label="任务操作">
                    <div className="task-action-dock-bar">
                      <button
                        type="button"
                        className="task-timeline-entry"
                        onClick={() => setTaskDialog("timeline")}
                      >
                        <UiIcon name="history" size={13} />
                        任务时间线
                      </button>
                      {(hasPrimary || hasSecondary || canTransfer) && (
                        <div className="task-action-dock-ops">
                          {hasSecondary && (
                            <>
                              {showAccept && (
                                <button
                                  type="button"
                                  className="task-action-danger"
                                  disabled={taskActionBusy}
                                  onClick={() =>
                                    askTaskConfirm(
                                      "确定拒绝这个任务？",
                                      "拒绝后任务会退回来源方处理。",
                                      () =>
                                        finishTaskDialog(
                                          () => api(`/tasks/${task.id}/reject`, {}, "POST"),
                                          "已拒绝任务",
                                        ),
                                      true,
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
                                    askTaskConfirm(
                                      "确定取消这个任务？",
                                      "取消后，这个待确认任务不会再继续。",
                                      () =>
                                        finishTaskDialog(
                                          () => api(`/tasks/${task.id}/cancel`, {}, "POST"),
                                          "任务已取消",
                                        ),
                                      true,
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
                                  onClick={() => setTaskDialog("abandon")}
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
                                    askTaskConfirm(
                                      "确定将任务改为已忽略？",
                                      "忽略后任务不再继续推进，之后仍可以恢复为已阻塞。",
                                      () =>
                                        finishTaskDialog(
                                          () => api(`/tasks/${task.id}/ignore`, {}, "POST"),
                                          "任务已忽略",
                                        ),
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
                                  disabled={taskActionBusy}
                                  onClick={() => {
                                    setTaskRedirectGoal(task.goal || "");
                                    setTaskRedirectConstraints(task.constraints || "");
                                    setTaskRedirectReason("");
                                    setTaskRedirectTarget("");
                                    setTaskDialog("redirect");
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
                                    askTaskConfirm(
                                      "确定恢复为已阻塞？",
                                      "恢复后任务回到已阻塞，可以再补充内容或改派。",
                                      () =>
                                        finishTaskDialog(
                                          () =>
                                            api(`/tasks/${task.id}/restore-ignored`, {}, "POST"),
                                          "任务已恢复",
                                        ),
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
                                    askTaskConfirm(
                                      "确定已了解拒绝结果？",
                                      "确认后，这条拒绝结果就记为已处理。",
                                      () =>
                                        finishTaskDialog(
                                          () =>
                                            api(
                                              `/tasks/${task.id}/acknowledge-rejection`,
                                              {},
                                              "POST",
                                            ),
                                          "已确认拒绝结果",
                                        ),
                                    )
                                  }
                                >
                                  知道了
                                </button>
                              )}
                            </>
                          )}
                          {showQuestion && openQuestion && (
                            <button
                              type="button"
                              className="primary"
                              disabled={taskActionBusy}
                              onClick={() => setTaskDialog("answer")}
                            >
                              回答
                            </button>
                          )}
                          {showAccept && (
                            <button
                              type="button"
                              className="primary"
                              disabled={taskActionBusy}
                              onClick={() => setTaskDialog("accept")}
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
                              onClick={() => setTaskDialog("complete")}
                            >
                              <UiIcon name="complete" size={13} />
                              完成
                            </button>
                          )}
                          {canReviewRejection && (
                            <button
                              type="button"
                              className="primary"
                              disabled={taskActionBusy}
                              onClick={() => setTaskDialog("reopen")}
                            >
                              修改后重新发起
                            </button>
                          )}
                          {canTransfer && (
                            <button
                              type="button"
                              disabled={taskActionBusy}
                              onClick={() => setTaskDialog("transfer")}
                            >
                              <UiIcon name="transfer" size={13} />
                              转交
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </footer>
                  {taskDialog === "timeline" &&
                    (() => {
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
                      return (
                        <ModalBackdrop onClose={closeTaskDialog}>
                          {(close) => (
                            <section
                              className="task-timeline-dialog"
                              role="dialog"
                              aria-modal="true"
                              aria-labelledby="task-timeline-dialog-title"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <DialogHeader
                                title={<>任务时间线</>}
                                titleId="task-timeline-dialog-title"
                                subtitle={<>{task.title}</>}
                                onClose={close}
                                closeLabel="关闭任务时间线"
                              />
                              <div className="dialog-form-scroll task-timeline-dialog-body">
                                {timeline.length ? (
                                  <>
                                    <div className="task-timeline-header">
                                      <h4>记录</h4>
                                      <div
                                        className="task-timeline-filters"
                                        aria-label="任务时间线筛选"
                                      >
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
                                                <small className="task-timeline-body">
                                                  {item.body}
                                                </small>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="muted task-timeline-empty">
                                        当前筛选条件下暂无记录。
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="muted task-timeline-empty">暂无任务时间线。</p>
                                )}
                              </div>
                              {visibleTimeline.length > 0 && (
                                <DialogFooter pagination>
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
                                </DialogFooter>
                              )}
                            </section>
                          )}
                        </ModalBackdrop>
                      );
                    })()}
                  {taskDialog === "answer" && openQuestion && (
                    <TaskOpDialog
                      title="回答问题"
                      busy={taskActionBusy}
                      confirmLabel="提交回答"
                      confirmDisabled={!taskAnswer.trim()}
                      onClose={closeTaskDialog}
                      onConfirm={() =>
                        finishTaskDialog(async () => {
                          await api(`/task-questions/${openQuestion.id}/answer`, {
                            answer: taskAnswer,
                          });
                          setTaskAnswer("");
                        }, "回答已提交")
                      }
                    >
                      <p className="task-action-note">{openQuestion.question}</p>
                      <TextAreaField
                        aria-label="回答"
                        value={taskAnswer}
                        onChange={(event) => setTaskAnswer(event.target.value)}
                        placeholder="输入回答"
                      />
                    </TaskOpDialog>
                  )}
                  {taskDialog === "accept" && (
                    <TaskOpDialog
                      title="确认任务"
                      busy={taskActionBusy}
                      confirmLabel="确认"
                      confirmIcon="check"
                      onClose={closeTaskDialog}
                      onConfirm={() =>
                        askTaskConfirm(
                          "确定接受这个任务？",
                          !projectConnectorBound || taskExecutionMode === "human_direct"
                            ? "确认后由你本人执行。"
                            : "确认后将下发到本项目的本地执行器。",
                          () =>
                            finishTaskDialog(
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
                            ),
                        )
                      }
                    >
                      {projectConnectorBound ? (
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
                      )}
                    </TaskOpDialog>
                  )}
                  {taskDialog === "complete" && (
                    <TaskOpDialog
                      title="完成任务"
                      busy={taskActionBusy}
                      confirmLabel="完成"
                      confirmIcon="complete"
                      onClose={closeTaskDialog}
                      onConfirm={() => {
                        const summary = taskResult.trim();
                        askTaskConfirm(
                          "确定将任务标为已完成？",
                          summary
                            ? `将保存结果摘要：${summary.length > 80 ? `${summary.slice(0, 80)}…` : summary}`
                            : "未填写结果摘要，将记为「已完成」。",
                          () =>
                            finishTaskDialog(
                              () =>
                                api(
                                  `/tasks/${task.id}`,
                                  { status: "completed", resultSummary: summary || "已完成" },
                                  "PATCH",
                                ),
                              "任务已完成",
                            ),
                        );
                      }}
                    >
                      <TextAreaField
                        label="结果摘要"
                        value={taskResult}
                        onChange={(event) => setTaskResult(event.target.value)}
                        placeholder="结果摘要"
                      />
                    </TaskOpDialog>
                  )}
                  {taskDialog === "abandon" && (
                    <TaskOpDialog
                      title="放弃任务"
                      busy={taskActionBusy}
                      confirmLabel="放弃"
                      confirmClassName="danger"
                      confirmIcon="abandon"
                      compact
                      onClose={closeTaskDialog}
                      onConfirm={() =>
                        askTaskConfirm(
                          "确定放弃这个任务？",
                          "放弃后任务结束，不能再继续执行。",
                          () =>
                            finishTaskDialog(
                              () =>
                                api(
                                  `/tasks/${task.id}`,
                                  {
                                    status: "abandoned",
                                    resultSummary: taskResult.trim() || "已放弃",
                                  },
                                  "PATCH",
                                ),
                              "任务已放弃",
                            ),
                          true,
                        )
                      }
                    >
                      <p className="task-action-note">放弃后任务结束，不能再继续执行。</p>
                      <TextAreaField
                        label="结果摘要"
                        value={taskResult}
                        onChange={(event) => setTaskResult(event.target.value)}
                        placeholder="结果摘要（可选）"
                      />
                    </TaskOpDialog>
                  )}
                  {taskDialog === "transfer" && (
                    <TaskOpDialog
                      title="转交任务"
                      busy={taskActionBusy}
                      confirmLabel="确认转交"
                      confirmIcon="transfer"
                      confirmDisabled={!taskTransferTarget}
                      onClose={closeTaskDialog}
                      onConfirm={() =>
                        finishTaskDialog(
                          () =>
                            api(
                              `/tasks/${task.id}/reassign`,
                              taskTransferTarget === "xiaoxiang"
                                ? { targetType: "xiaoxiang" }
                                : { targetType: "human_member", targetUserId: taskTransferTarget },
                              "POST",
                            ),
                          "任务已转交",
                        )
                      }
                    >
                      <SelectField
                        label="责任主体"
                        value={taskTransferTarget}
                        onChange={setTaskTransferTarget}
                        options={assigneeOptions}
                      />
                    </TaskOpDialog>
                  )}
                  {taskDialog === "redirect" && (
                    <TaskOpDialog
                      title="补充内容后改派"
                      busy={taskActionBusy}
                      confirmLabel="确认改派"
                      confirmIcon="check"
                      confirmDisabled={!taskRedirectGoal.trim() || !taskRedirectTarget}
                      onClose={closeTaskDialog}
                      onConfirm={() =>
                        finishTaskDialog(
                          () =>
                            api(
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
                            ),
                          "任务已补充并改派",
                        )
                      }
                    >
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
                        label="改派责任主体"
                        value={taskRedirectTarget}
                        onChange={setTaskRedirectTarget}
                        options={assigneeOptions}
                      />
                    </TaskOpDialog>
                  )}
                  {taskDialog === "reopen" && (
                    <TaskOpDialog
                      title="修改后重新发起"
                      busy={taskActionBusy}
                      confirmLabel="重新发起"
                      confirmDisabled={!taskReopenGoal.trim()}
                      onClose={closeTaskDialog}
                      onConfirm={() =>
                        finishTaskDialog(
                          () =>
                            api(
                              `/tasks/${task.id}/reopen`,
                              { goal: taskReopenGoal.trim(), constraints: taskReopenConstraints },
                              "POST",
                            ),
                          "任务已重新发起",
                        )
                      }
                    >
                      <p className="task-action-note">
                        {[...task.assignmentHistory]
                          .reverse()
                          .find((event) => event.event_type === "rejected")?.reason ||
                          "目标成员拒绝了这个任务。"}
                      </p>
                      <TextAreaField
                        label="任务目标与验收标准"
                        value={taskReopenGoal}
                        onChange={(event) => setTaskReopenGoal(event.target.value)}
                        placeholder="修改任务目标与验收标准"
                      />
                      <TextAreaField
                        label="约束"
                        value={taskReopenConstraints}
                        onChange={(event) => setTaskReopenConstraints(event.target.value)}
                        placeholder="修改约束（可选）"
                      />
                    </TaskOpDialog>
                  )}
                  {taskConfirm && (
                    <TaskOpDialog
                      title={taskConfirm.title}
                      titleId="task-confirm-dialog-title"
                      busy={taskActionBusy}
                      confirmLabel="确定"
                      confirmClassName={taskConfirm.danger ? "danger" : "primary"}
                      compact
                      fullscreen={false}
                      onClose={() => {
                        if (!taskActionBusy) setTaskConfirm(null);
                      }}
                      onConfirm={taskConfirm.run}
                    >
                      <p className="task-action-note">{taskConfirm.message}</p>
                    </TaskOpDialog>
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
