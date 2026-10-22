/**
 * 工作台左侧栏：品牌区、迭代列表（活跃/归档）、新建迭代面板与账号设置入口。
 * 数据与回调由父组件打包成 props 传入。
 */
/**
 * 工作台左侧栏：品牌区、迭代列表（活跃/归档）、新建迭代面板与账号设置入口。
 * 数据与回调由父组件打包成 props 传入。
 */
import { type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { AGENT_LEVEL_LABELS } from "./ui-labels";
import { SlideSwitch } from "./SlideSwitch";
import { UiIcon } from "./ui-icon";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";
import { CoThreadLogo, PanelIcon, SidebarIcon } from "./workspace-chrome";
import type { Modal } from "./workspace-types";
import type { PersonalProfile } from "./ProfileFields";

export type WorkspaceSidebarProps<T> = {
  leftOpen: boolean;
  setLeftOpen: Dispatch<SetStateAction<boolean>>;
  threadListPane: "active" | "archived" | "create";
  setThreadListPane: Dispatch<SetStateAction<"active" | "archived" | "create">>;
  railCreateRef: RefObject<HTMLButtonElement | null>;
  newThreadInputRef: RefObject<HTMLInputElement | null>;
  newThreadTitle: string;
  setNewThreadTitle: Dispatch<SetStateAction<string>>;
  newThreadBackground: string;
  setNewThreadBackground: Dispatch<SetStateAction<string>>;
  newThreadGoal: string;
  setNewThreadGoal: Dispatch<SetStateAction<string>>;
  openNewThreadPane: () => void;
  cancelNewThread: () => void;
  submitNewThread: () => void;
  busy: boolean;
  projectId: string;
  /** 侧栏只负责遍历渲染，迭代结构由父组件决定，因此对元素类型保持泛型。 */
  activeThreads: T[];
  archivedThreads: T[];
  renderThreadLink: (thread: T) => ReactNode;
  open: (value: Modal) => void;
  setProjectManagementOpen: Dispatch<SetStateAction<boolean>>;
  setMonitorOpen: Dispatch<SetStateAction<boolean>>;
  /** 父组件在渲染侧栏前已用 early return 排除了未登录状态。 */
  user: PersonalProfile;
};

export function WorkspaceSidebar<T>({
  leftOpen,
  setLeftOpen,
  threadListPane,
  setThreadListPane,
  openNewThreadPane,
  railCreateRef,
  activeThreads,
  renderThreadLink,
  archivedThreads,
  newThreadInputRef,
  newThreadTitle,
  setNewThreadTitle,
  submitNewThread,
  cancelNewThread,
  busy,
  newThreadBackground,
  setNewThreadBackground,
  newThreadGoal,
  setNewThreadGoal,
  projectId,
  open,
  setProjectManagementOpen,
  setMonitorOpen,
  user,
}: WorkspaceSidebarProps<T>) {
  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <CoThreadLogo className="sidebar-logo sidebar-brand-mark" title="共序 LOGO" />
          <span className="sidebar-brand-name">
            共序 <small>工作空间</small>
          </span>
          <button
            className={`sidebar-toggle ${leftOpen ? "sidebar-collapse-toggle" : "sidebar-brand-toggle"}`}
            aria-label={leftOpen ? "收起左侧栏" : "展开左侧栏"}
            title={leftOpen ? "收起左侧栏" : "展开左侧栏"}
            aria-expanded={leftOpen}
            onClick={() => setLeftOpen(!leftOpen)}
          >
            <CoThreadLogo className="sidebar-logo sidebar-rail-logo" aria-hidden="true" />
            <span
              className={leftOpen ? "sidebar-collapse-control" : "sidebar-brand-control"}
              aria-hidden="true"
            >
              <PanelIcon side="left" />
            </span>
          </button>
        </div>
        <div className="section-label">
          {leftOpen ? (
            <SlideSwitch
              className="thread-list-capsule sidebar-label"
              size="dense"
              stretch
              reselect
              label="迭代范围"
              value={threadListPane}
              onChange={(next) => {
                if (next === "create") openNewThreadPane();
                else setThreadListPane(next);
              }}
              items={[
                {
                  value: "active",
                  label: (
                    <>
                      <UiIcon name="chat" size={11} />
                      <span>活跃中</span>
                    </>
                  ),
                },
                {
                  value: "archived",
                  label: (
                    <>
                      <UiIcon name="archive" size={11} />
                      <span>已归档</span>
                    </>
                  ),
                },
                {
                  value: "create",
                  title: "新迭代",
                  label: (
                    <>
                      <UiIcon name="send" size={11} />
                      <span className="sidebar-create-label">新迭代</span>
                    </>
                  ),
                },
              ]}
            />
          ) : (
            <button
              ref={railCreateRef}
              type="button"
              className="sidebar-rail-thread-create"
              title="新迭代"
              aria-label="新迭代"
              aria-pressed={threadListPane === "create"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={openNewThreadPane}
            >
              <UiIcon name="send" size={18} />
            </button>
          )}
        </div>
        <div className="thread-viewport" data-thread-list-pane={threadListPane}>
          <div className="thread-track">
            <div
              className="thread-pane thread-pane-active"
              aria-hidden={threadListPane !== "active"}
              inert={threadListPane !== "active" ? true : undefined}
            >
              <nav aria-label="活跃迭代">
                {activeThreads.map(renderThreadLink)}
                {!activeThreads.length && (
                  <p className="muted side-empty">
                    还没有迭代讨论
                    <br />
                    从一次新的需求开始。
                  </p>
                )}
              </nav>
            </div>
            <div
              className="thread-pane thread-pane-archived"
              id="archived-thread-list"
              aria-hidden={threadListPane !== "archived"}
              inert={threadListPane !== "archived" ? true : undefined}
            >
              <nav aria-label="已归档迭代">
                {archivedThreads.map(renderThreadLink)}
                {!archivedThreads.length && <p className="muted side-empty">还没有已归档的迭代</p>}
              </nav>
            </div>
            <div
              className="thread-pane thread-pane-create"
              aria-hidden={threadListPane !== "create"}
              inert={threadListPane !== "create" ? true : undefined}
            >
              <div className="thread-create-pane">
                <div className="thread-create-card" aria-label="发起新迭代">
                  <TextField
                    ref={newThreadInputRef}
                    label="迭代主题"
                    type="text"
                    name="title"
                    aria-label="迭代主题"
                    value={newThreadTitle}
                    onChange={(event) => setNewThreadTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitNewThread();
                      }
                      if (event.key === "Escape") cancelNewThread();
                    }}
                    maxLength={160}
                    placeholder="输入新迭代主题"
                    disabled={busy}
                    autoComplete="off"
                    dense
                  />
                  <TextAreaField
                    label="背景"
                    rows={3}
                    maxLength={20000}
                    placeholder="这次协作的背景与已知约束"
                    value={newThreadBackground}
                    disabled={busy}
                    onChange={(event) => setNewThreadBackground(event.target.value)}
                    dense
                  />
                  <TextAreaField
                    label="目标"
                    rows={2}
                    maxLength={20000}
                    placeholder="本轮希望达成什么"
                    value={newThreadGoal}
                    disabled={busy}
                    onChange={(event) => setNewThreadGoal(event.target.value)}
                    dense
                  />
                  <div className="thread-create-actions">
                    <button type="button" disabled={busy} onClick={cancelNewThread}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={submitNewThread}
                    >
                      {busy ? "正在处理…" : "确认"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="sidebar-bottom">
          <button
            className="sidebar-card sidebar-project-management"
            title={`项目基础信息、人类成员、连接器与 Agent（${AGENT_LEVEL_LABELS.l1} / ${AGENT_LEVEL_LABELS.l2}）`}
            aria-label="项目管理"
            disabled={!projectId}
            onClick={() => setProjectManagementOpen(true)}
          >
            <span className="sidebar-card-icon">
              <SidebarIcon kind="project" />
            </span>
            <span className="sidebar-card-copy">
              项目管理<small>成员、连接器与 Agent</small>
            </span>
            <span className="sidebar-card-action" aria-hidden="true">
              <UiIcon name="next" size={18} />
            </span>
          </button>
          <button
            className="sidebar-card sidebar-monitor"
            title="查看所有小祥的运行状态"
            aria-label="小祥监控"
            disabled={!projectId}
            onClick={() => setMonitorOpen(true)}
          >
            <span className="sidebar-card-icon">
              <SidebarIcon kind="monitor" />
            </span>
            <span className="sidebar-card-copy">
              小祥监控<small>调度、执行与知识整理</small>
            </span>
            <span className="sidebar-card-action" aria-hidden="true">
              <UiIcon name="next" size={18} />
            </span>
          </button>
          <button
            className="sidebar-card sidebar-profile"
            title={`${user.name} · 设置`}
            aria-label={`${user.name} · 设置`}
            onClick={() => open("profile")}
          >
            <span className="avatar">
              {user.avatar ? (
                <img loading="lazy" decoding="async" src={user.avatar} alt="" />
              ) : (
                user.name[0]
              )}
            </span>
            <span className="sidebar-card-copy">
              {user.name}
              <small>{user.motto || user.username}</small>
            </span>
            <span className="sidebar-card-action" aria-hidden="true">
              <UiIcon name="next" size={18} />
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
