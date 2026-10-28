import { DialogHeader } from "./DialogHeader";
/** 任务列表拥有筛选和选择；详情面板独立管理轮询、操作草稿和提交状态。 */
import { TaskDetailPanel } from "./TaskDetailPanel";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { taskViewModel } from "./task-view-model";

import { ModalBackdrop } from "./dialog-fx";

import { TaskCreatedTime } from "./LiveClock";

import { labelWorkflowStatus } from "./ui-labels";
import { TASK_STATUS_GROUPS } from "../shared/work-status.js";
import { showTip } from "./Tip";
import { taskCopyInfo } from "./task-copy";
import { TaskItemContextMenu } from "./task-menus";
import { UiIcon } from "./ui-icon";

import type { TaskCreateCopy, TaskDraftEdit } from "./TaskCreateDialog";
import type { AgentTask, Detail } from "./workspace-types";
import type { PersonalProfile } from "./ProfileFields";

function TaskStatusFilter({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const filterRef = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState(value);
  const options = TASK_STATUS_GROUPS.map((group) => group.id);
  const labelOf = (id: string) => TASK_STATUS_GROUPS.find((group) => group.id === id)?.label || id;
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const details = filterRef.current;
      if (!details?.open || details.contains(event.target as Node)) return;
      details.open = false;
      onChange(draft);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [draft, onChange]);
  const toggle = (id: string) =>
    setDraft((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  return (
    <details
      ref={filterRef}
      className="project-memory-subtype-filter project-memory-multi-filter"
      onToggle={(event) => {
        if (event.currentTarget.open) setDraft(value);
        else onChange(draft);
      }}
    >
      <summary className="project-memory-multi-filter-input" aria-label="任务状态">
        <span className="project-memory-multi-filter-value">
          {value.length ? `已选 ${value.length} 项` : "全部"}
        </span>
        <UiIcon name="chevronDown" size={16} className="project-memory-multi-filter-arrow" />
      </summary>
      <div className="project-memory-subtype-options" role="group" aria-label="任务状态">
        <div className="project-memory-subtype-batch-actions">
          <label>
            <input type="checkbox" checked={draft.length === 0} onChange={() => setDraft([])} />
            <span>全部</span>
          </label>
          <button
            type="button"
            className="project-memory-subtype-action"
            onClick={() =>
              setDraft(draft.length === 0 ? options : options.filter((id) => !draft.includes(id)))
            }
          >
            <span aria-hidden="true">⇄</span>
            <span>反选</span>
          </button>
        </div>
        {options.map((id) => (
          <label key={id}>
            <input type="checkbox" checked={draft.includes(id)} onChange={() => toggle(id)} />
            <span>{labelOf(id)}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export type TaskListDialogProps = {
  selection: { id: number; taskId: string };
  tasks: AgentTask[];
  taskCreateOpen: boolean;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
  detail: Detail | null;
  projectId: string;
  threadId: string;
  user: PersonalProfile;
  active: boolean;
  openTaskCreate: (seed?: {
    refId?: string;
    folderId?: string;
    copyFrom?: TaskCreateCopy;
    draftEdit?: TaskDraftEdit;
  }) => void;
  renderRef: (ref: string) => ReactNode;
  projectConnectorBound: boolean;
  time: (text: string) => string;
  mcpEndpoint: string;
};
export function TaskListDialog({
  selection,
  tasks,
  taskCreateOpen,
  onClose,
  onChanged,
  detail,
  projectId,
  threadId,
  user,
  active,
  openTaskCreate,
  renderRef,
  projectConnectorBound,
  time,
  mcpEndpoint,
}: TaskListDialogProps) {
  const [taskMine, setTaskMine] = useState(true);
  const [taskListSearch, setTaskListSearch] = useState("");
  const [taskStatuses, setTaskStatuses] = useState<string[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState(selection.taskId);
  /** 列表项右键菜单：记录指针落点与被操作的任务，菜单本身渲染在弹窗内。 */
  const [taskMenu, setTaskMenu] = useState<{ task: AgentTask; x: number; y: number } | null>(null);
  useEffect(() => {
    setSelectedTaskId(selection.taskId);
  }, [selection.id]);
  const { scopedTasks, visibleTasks, taskSourceLabel, taskTargetLabel, taskExecutorLabel } =
    taskViewModel(tasks, detail, user, threadId, taskMine, taskListSearch, taskStatuses);
  const openTask = (taskId: string) => setSelectedTaskId(taskId);
  const copyTaskInfo = async (task: AgentTask) => {
    if (!projectId) return;
    try {
      await navigator.clipboard.writeText(taskCopyInfo({ projectId, threadId, mcpEndpoint }, task));
      showTip("任务信息已复制");
    } catch {
      showTip("无法自动复制任务信息，请检查剪贴板权限后重试。", "error");
    }
  };

  return (
    <ModalBackdrop onClose={onClose} enabled={!taskCreateOpen}>
      {(close) => (
        <section
          className="task-pool-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-pool-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader
            title={
              <>{detail?.threads.find((item) => item.id === threadId)?.title || "未选择迭代"}</>
            }
            titleId="task-pool-dialog-title"
            subtitle={<>当前迭代任务</>}
            onClose={close}
            closeLabel="关闭本迭代任务"
            autoFocusClose
          />
          <div className="task-pool-dialog-body">
            <aside className="task-pool-dialog-list">
              <div className="task-pool-list-toolbar">
                <div className="task-pool-list-filters">
                  <TaskStatusFilter value={taskStatuses} onChange={setTaskStatuses} />
                  <label className="task-pool-search">
                    <UiIcon name="search" size={13} />
                    <input
                      type="search"
                      value={taskListSearch}
                      placeholder="搜索任务"
                      aria-label="搜索任务编号、标题或成员"
                      autoComplete="off"
                      onChange={(event) => setTaskListSearch(event.target.value)}
                    />
                  </label>
                </div>
                <label className="task-pool-mine">
                  <input
                    type="checkbox"
                    checked={taskMine}
                    onChange={(event) => setTaskMine(event.target.checked)}
                  />
                  <span>只看与我有关的</span>
                </label>
              </div>
              <div className="task-pool-list">
                {visibleTasks.map((task) => {
                  const subtitle =
                    task.status === "blocked" && task.blocked_reason?.trim()
                      ? task.blocked_reason.trim()
                      : `${taskSourceLabel(task)} → ${taskTargetLabel(task)} → ${taskExecutorLabel(task)}`;
                  return (
                    <button
                      type="button"
                      className="task-pool-item"
                      aria-current={selectedTaskId === task.id ? "true" : undefined}
                      key={task.id}
                      onClick={() => openTask(task.id)}
                      onContextMenu={(event) => {
                        // 右键先选中该任务，菜单里的复制对象始终和右侧详情一致。
                        event.preventDefault();
                        event.stopPropagation();
                        // 键盘菜单键触发时没有指针坐标，退回贴住列表项左上角。
                        const box = event.currentTarget.getBoundingClientRect();
                        setSelectedTaskId(task.id);
                        setTaskMenu({
                          task,
                          x: event.clientX || box.left + 12,
                          y: event.clientY || box.top + 12,
                        });
                      }}
                    >
                      <span className="task-pool-item-heading">
                        <span>
                          <strong>{task.title}</strong>
                          <small title={subtitle}>{subtitle}</small>
                        </span>
                        <span className="task-pool-item-side">
                          <i data-status={task.status}>{labelWorkflowStatus(task.status)}</i>
                          <TaskCreatedTime value={task.created_at} />
                        </span>
                      </span>
                    </button>
                  );
                })}
                {!scopedTasks.length && (
                  <p className="panel-empty">
                    {taskMine ? "暂无与我有关的任务。" : "当前迭代暂无任务。"}
                  </p>
                )}
                {!!scopedTasks.length && !visibleTasks.length && (
                  <p className="panel-empty">没有匹配的任务。</p>
                )}
              </div>
              {active && (
                <button
                  type="button"
                  className="task-create-dock primary"
                  onClick={() => openTaskCreate()}
                >
                  <UiIcon name="plus" size={12} />
                  新建任务
                </button>
              )}
            </aside>
            <TaskDetailPanel
              key={selectedTaskId}
              taskId={selectedTaskId}
              taskCreateOpen={taskCreateOpen}
              tasks={tasks}
              onChanged={onChanged}
              detail={detail}
              projectId={projectId}
              threadId={threadId}
              user={user}
              active={active}
              renderRef={renderRef}
              projectConnectorBound={projectConnectorBound}
              time={time}
              mcpEndpoint={mcpEndpoint}
              onCopyCreate={(copy) => openTaskCreate({ copyFrom: copy })}
              onEditDraft={(edit) => openTaskCreate({ draftEdit: edit })}
            />
          </div>
          {taskMenu ? (
            <TaskItemContextMenu
              x={taskMenu.x}
              y={taskMenu.y}
              onCopyTaskInfo={() => void copyTaskInfo(taskMenu.task)}
              onDismiss={() => setTaskMenu(null)}
            />
          ) : null}
        </section>
      )}
    </ModalBackdrop>
  );
}
