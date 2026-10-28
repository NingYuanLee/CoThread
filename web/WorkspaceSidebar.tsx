/**
 * 工作台左侧栏：品牌区、新迭代入口、迭代列表（活跃/归档）与账号设置入口。
 * 新迭代入口独占一行，表单弹窗由 WorkspaceApp 渲染；数据与回调打包成 props 传入。
 */
import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AGENT_LEVEL_LABELS } from "./ui-labels";
import { SlideSwitch } from "./SlideSwitch";
import { UiIcon } from "./ui-icon";
import { CoThreadLogo, PanelIcon, SidebarIcon } from "./workspace-chrome";
import type { Modal } from "./workspace-types";
import type { MemoryCounts } from "./ProjectMemory";
import type { PersonalProfile } from "./ProfileFields";

export type WorkspaceSidebarProps<T> = {
  leftOpen: boolean;
  setLeftOpen: Dispatch<SetStateAction<boolean>>;
  threadListPane: "active" | "archived";
  setThreadListPane: Dispatch<SetStateAction<"active" | "archived">>;
  /** 打开新迭代弹窗；侧栏不再承载表单本体。 */
  openNewThreadDialog: () => void;
  projectId: string;
  /** 侧栏只负责遍历渲染，迭代结构由父组件决定，因此对元素类型保持泛型。 */
  activeThreads: T[];
  archivedThreads: T[];
  renderThreadLink: (thread: T) => ReactNode;
  open: (value: Modal) => void;
  setProjectManagementOpen: Dispatch<SetStateAction<boolean>>;
  setMemoryOpen: Dispatch<SetStateAction<boolean>>;
  memoryCounts: MemoryCounts | null;
  setMonitorOpen: Dispatch<SetStateAction<boolean>>;
  /** 父组件在渲染侧栏前已用 early return 排除了未登录状态。 */
  user: PersonalProfile;
};

export function WorkspaceSidebar<T>({
  leftOpen,
  setLeftOpen,
  threadListPane,
  setThreadListPane,
  openNewThreadDialog,
  activeThreads,
  renderThreadLink,
  archivedThreads,
  projectId,
  open,
  setProjectManagementOpen,
  setMemoryOpen,
  memoryCounts,
  setMonitorOpen,
  user,
}: WorkspaceSidebarProps<T>) {
  /* 入口小点与弹窗内的提示一致：有草稿、待裁决或上次进入后的更新就提醒。 */
  const memorySignal = Boolean(
    memoryCounts &&
    (memoryCounts.drafts + memoryCounts.disputes > 0 || memoryCounts.updatedSinceEntry > 0),
  );
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
        {/* 新迭代独占一行：和下面的活跃/归档切换分开，避免再被当成第三段。 */}
        <div className="sidebar-create-bar">
          {leftOpen ? (
            <button
              type="button"
              className="sidebar-create-button"
              title="新迭代"
              aria-label="新迭代"
              onClick={openNewThreadDialog}
            >
              <UiIcon name="send" size={14} />
              <span className="sidebar-create-label">新迭代</span>
            </button>
          ) : (
            <button
              type="button"
              className="sidebar-rail-thread-create"
              title="新迭代"
              aria-label="新迭代"
              onClick={openNewThreadDialog}
            >
              <UiIcon name="send" size={18} />
            </button>
          )}
        </div>
        <div className="section-label">
          <SlideSwitch
            className="thread-list-capsule sidebar-label"
            size="dense"
            stretch
            label="迭代范围"
            value={threadListPane}
            onChange={setThreadListPane}
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
            ]}
          />
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
          </div>
        </div>
        <div className="sidebar-bottom">
          <div
            className="sidebar-utility-grid"
            role="group"
            aria-label="关于我们、使用手册、项目记忆与小祥监控"
          >
            <a
              className="sidebar-utility"
              href="/about_us.html"
              target="_blank"
              rel="noopener noreferrer"
              title="关于我们"
              aria-label="关于我们"
            >
              <UiIcon name="info" size={16} />
              <span className="sidebar-utility-label">关于我们</span>
            </a>
            <a
              className="sidebar-utility"
              href="/docs.html"
              target="_blank"
              rel="noopener noreferrer"
              title="使用手册"
              aria-label="使用手册"
            >
              <UiIcon name="book" size={16} />
              <span className="sidebar-utility-label">使用手册</span>
            </a>
            <button
              type="button"
              className="sidebar-utility sidebar-utility-memory"
              title="项目记忆：导读、时间线与记忆条目"
              aria-label="项目记忆"
              disabled={!projectId}
              onClick={() => setMemoryOpen(true)}
            >
              <UiIcon name="library" size={16} />
              <span className="sidebar-utility-label">项目记忆</span>
              {memorySignal ? (
                <span
                  className="sidebar-card-memory-dot"
                  role="img"
                  aria-label="有新的项目记忆"
                  title="有草稿、争议或进入后的更新"
                />
              ) : null}
            </button>
            <button
              type="button"
              className="sidebar-utility"
              title="查看所有小祥的运行状态"
              aria-label="小祥监控"
              disabled={!projectId}
              onClick={() => setMonitorOpen(true)}
            >
              <UiIcon name="monitor" size={16} />
              <span className="sidebar-utility-label">小祥监控</span>
            </button>
          </div>
          <button
            className="sidebar-card sidebar-project-management"
            title={`项目基础信息、人类成员、连接器与 Agent（${AGENT_LEVEL_LABELS.laoweng} / ${AGENT_LEVEL_LABELS.xiaoxiang}）`}
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
