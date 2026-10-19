/** 任务列表拥有筛选和选择；详情面板独立管理轮询、操作草稿和提交状态。 */
import { TaskDetailPanel } from "./TaskDetailPanel";
import { useEffect, useState, type ReactNode } from "react";
import { taskViewModel } from "./task-view-model";

import { DialogClose, ModalBackdrop } from "./dialog-fx";

import { TaskCreatedTime } from "./LiveClock";

import { labelWorkflowStatus } from "./ui-labels";
import { UiIcon } from "./ui-icon";

import type { AgentTask, Detail } from "./workspace-types";
import type { PersonalProfile } from "./ProfileFields";

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
  openTaskCreate: (seed?: { refId?: string; folderId?: string }) => void;
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
  const [selectedTaskId, setSelectedTaskId] = useState(selection.taskId);
  useEffect(() => {
    setSelectedTaskId(selection.taskId);
  }, [selection.id]);
  const { scopedTasks, visibleTasks, taskSourceLabel, taskTargetLabel, taskExecutorLabel } =
    taskViewModel(tasks, detail, user, threadId, taskMine, taskListSearch);
  const openTask = (taskId: string) => setSelectedTaskId(taskId);

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
          <header className="task-pool-dialog-header">
            <div>
              <span>当前迭代任务</span>
              <h2 id="task-pool-dialog-title">
                {detail?.threads.find((item) => item.id === threadId)?.title || "未选择迭代"}
              </h2>
            </div>
            <DialogClose autoFocus onClick={close} label="关闭本迭代任务" />
          </header>
          <div className="task-pool-dialog-body">
            <aside className="task-pool-dialog-list">
              <div className="task-pool-list-toolbar">
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
                <div className="task-scope-capsule" role="tablist" aria-label="任务范围">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={taskMine}
                    onClick={() => setTaskMine(true)}
                  >
                    我的
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!taskMine}
                    onClick={() => setTaskMine(false)}
                  >
                    全部
                  </button>
                </div>
              </div>
              <div className="task-pool-list">
                {visibleTasks.map((task) => {
                  return (
                    <button
                      type="button"
                      className="task-pool-item"
                      aria-current={selectedTaskId === task.id ? "true" : undefined}
                      key={task.id}
                      onClick={() => openTask(task.id)}
                    >
                      <span className="task-pool-item-heading">
                        <span>
                          <strong>{task.title}</strong>
                          <small
                            title={`${taskSourceLabel(task)} → ${taskTargetLabel(task)} → ${taskExecutorLabel(task)}`}
                          >
                            {taskSourceLabel(task)} → {taskTargetLabel(task)} →{" "}
                            {taskExecutorLabel(task)}
                          </small>
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
                <button type="button" className="task-create-dock" onClick={() => openTaskCreate()}>
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
            />
          </div>
        </section>
      )}
    </ModalBackdrop>
  );
}
