/**
 * 工作台顶栏：项目页签与拖拽排序、项目选择、主题与通知、导入与管理入口。
 * 数据与回调由父组件打包成 props 传入。
 */
/**
 * 工作台顶栏：项目页签与拖拽排序、项目选择、主题与通知、导入与管理入口。
 * 数据与回调由父组件打包成 props 传入。
 */
import React, { type Dispatch, type RefObject, type SetStateAction, useState } from "react";
import { ProjectMark } from "./ProjectMark";
import { Notifications } from "./Notifications";
import { ThemePicker } from "./ThemePicker";
import { DEFAULT_UI_THEME } from "../shared/ui-theme.js";
import { UiIcon } from "./ui-icon";
import { api } from "./workspace-api";
import { PanelIcon, ProjectActionIcon } from "./workspace-chrome";
import type { Project } from "./workspace-types";
import type { PersonalProfile } from "./ProfileFields";
import { projectCopyInfo } from "./project-copy";
import { ProjectTabContextMenu } from "./project-menus";
import { showTip } from "./Tip";

export type WorkspaceTopbarProps = {
  visibleProjects: Project[];
  projectId: string;
  setProjectId: Dispatch<SetStateAction<string>>;
  draggedProject: string;
  setDraggedProject: Dispatch<SetStateAction<string>>;
  projectDrop: {
    id: string;
    after: boolean;
  } | null;
  setProjectDrop: Dispatch<
    SetStateAction<{
      id: string;
      after: boolean;
    } | null>
  >;
  reorderPinnedProject: (source: string, target: string, after: boolean) => void;
  updateProjectTab: (id: string, action: "open" | "close" | "pin" | "unpin") => void;
  showProjectPicker: () => void;
  busy: boolean;
  /** MCP 端点的相对路径；右侧栏未就绪时退回 /mcp，保证复制出来的连接地址仍可用。 */
  mcpEndpoint?: string;
  /** 父组件在渲染顶栏前已用 early return 排除了未登录状态。 */
  user: PersonalProfile;
  acceptProfile: (profile: PersonalProfile | null) => void;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setProjectPickerOpen: Dispatch<SetStateAction<boolean>>;
  setThreadId: Dispatch<SetStateAction<string>>;
  setThreadListPane: Dispatch<SetStateAction<"active" | "archived" | "create">>;
  pendingNotification: RefObject<{
    projectId: string;
    threadId: string | null;
  } | null>;
  contextOpen: boolean;
  setContextOpen: Dispatch<SetStateAction<boolean>>;
  setDocumentFullscreen: Dispatch<SetStateAction<boolean>>;
};

export function WorkspaceTopbar({
  visibleProjects,
  projectId,
  setProjectId,
  draggedProject,
  setDraggedProject,
  projectDrop,
  setProjectDrop,
  reorderPinnedProject,
  updateProjectTab,
  showProjectPicker,
  busy,
  mcpEndpoint,
  user,
  acceptProfile,
  setProjects,
  setProjectPickerOpen,
  setThreadId,
  setThreadListPane,
  pendingNotification,
  contextOpen,
  setContextOpen,
  setDocumentFullscreen,
}: WorkspaceTopbarProps) {
  /** 项目页签右键菜单：记录指针落点与被操作的项目，菜单本身渲染在顶层浮层。 */
  const [tabMenu, setTabMenu] = useState<{ project: Project; x: number; y: number } | null>(null);
  const copyProjectInfo = async (project: Project) => {
    try {
      await navigator.clipboard.writeText(projectCopyInfo({ projectId: project.id, mcpEndpoint }));
      showTip("项目信息已复制");
    } catch {
      showTip("无法自动复制项目信息，请检查剪贴板权限后重试。", "error");
    }
  };
  return (
    <>
      <header className="workspace-topbar">
        <nav className="project-tabs" aria-label="项目页签">
          {visibleProjects.map((p, index) => (
            <React.Fragment key={p.id}>
              {!p.tab_pinned_at && index > 0 && visibleProjects[index - 1].tab_pinned_at && (
                <span
                  className="project-tabs-divider"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="固定项目与普通项目分隔"
                />
              )}
              <div
                className={`project-tab ${projectId === p.id ? "selected" : ""} ${p.tab_pinned_at ? "pinned" : ""} ${draggedProject === p.id ? "dragging" : ""} ${projectDrop?.id === p.id ? (projectDrop.after ? "drop-after" : "drop-before") : ""}`}
                draggable={!!p.tab_pinned_at && !busy}
                onDragStart={(event) => {
                  if (
                    !p.tab_pinned_at ||
                    busy ||
                    (event.target as HTMLElement).closest(".project-tab-actions")
                  ) {
                    event.preventDefault();
                    return;
                  }
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-cothread-project", p.id);
                  setDraggedProject(p.id);
                }}
                onDragOver={(event) => {
                  if (!draggedProject || !p.tab_pinned_at || busy) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  const rect = event.currentTarget.getBoundingClientRect();
                  setProjectDrop(
                    p.id === draggedProject
                      ? null
                      : {
                          id: p.id,
                          after: event.clientX > rect.left + rect.width / 2,
                        },
                  );
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                    setProjectDrop(null);
                }}
                onDrop={(event) => {
                  if (!draggedProject || !p.tab_pinned_at) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  reorderPinnedProject(
                    draggedProject,
                    p.id,
                    event.clientX > rect.left + rect.width / 2,
                  );
                  setDraggedProject("");
                  setProjectDrop(null);
                }}
                onDragEnd={() => {
                  setDraggedProject("");
                  setProjectDrop(null);
                }}
                onContextMenu={(event) => {
                  // 右键只针对这一页签开菜单，不切换当前项目，避免复制对象和页面状态互相牵扯。
                  event.preventDefault();
                  event.stopPropagation();
                  setTabMenu({ project: p, x: event.clientX, y: event.clientY });
                }}
              >
                {p.tab_pinned_at && (
                  <span className="project-tab-pin-mark" title="已固定" aria-hidden="true">
                    <ProjectActionIcon action="pin" />
                  </span>
                )}
                <button
                  aria-current={projectId === p.id ? "page" : undefined}
                  className="project-tab-name"
                  onClick={() => setProjectId(p.id)}
                  title={p.tab_pinned_at ? `${p.name}（拖拽排序，或按 Alt + 左右方向键）` : p.name}
                  onKeyDown={(event) => {
                    if (
                      !p.tab_pinned_at ||
                      !event.altKey ||
                      !["ArrowLeft", "ArrowRight"].includes(event.key)
                    )
                      return;
                    event.preventDefault();
                    const pinned = visibleProjects.filter((project) => project.tab_pinned_at);
                    const right = event.key === "ArrowRight";
                    const target =
                      pinned[pinned.findIndex((project) => project.id === p.id) + (right ? 1 : -1)];
                    if (target) reorderPinnedProject(p.id, target.id, right);
                  }}
                >
                  <ProjectMark name={p.name} image={p.image} size={16} />
                  <span>{p.name}</span>
                </button>
                <div className="project-tab-actions">
                  <button
                    disabled={busy}
                    title={p.tab_pinned_at ? "取消固定" : "固定项目"}
                    aria-label={`${p.tab_pinned_at ? "取消固定" : "固定"} ${p.name}`}
                    onClick={() => updateProjectTab(p.id, p.tab_pinned_at ? "unpin" : "pin")}
                  >
                    <ProjectActionIcon action={p.tab_pinned_at ? "unpin" : "pin"} />
                  </button>
                  {!p.tab_pinned_at && (
                    <button
                      disabled={busy}
                      title="移出页签区（不删除项目）"
                      aria-label={`移出页签区 ${p.name}`}
                      onClick={() => updateProjectTab(p.id, "close")}
                    >
                      <ProjectActionIcon action="close" />
                    </button>
                  )}
                </div>
              </div>
            </React.Fragment>
          ))}
          <button
            className="new-project-tab"
            title="添加项目"
            aria-label="添加项目"
            disabled={busy}
            onClick={showProjectPicker}
          >
            <UiIcon name="plus" size={16} />
          </button>
        </nav>
        <a
          className="sidebar-toggle workspace-help-link"
          href="/about_us.html"
          target="_blank"
          rel="noopener noreferrer"
          title="关于我们"
          aria-label="关于我们"
        >
          <UiIcon name="info" size={20} />
        </a>
        <a
          className="sidebar-toggle workspace-help-link"
          href="/docs.html"
          target="_blank"
          rel="noopener noreferrer"
          title="使用手册"
          aria-label="使用手册"
        >
          <UiIcon name="book" size={20} />
        </a>
        <ThemePicker theme={user.ui_theme || DEFAULT_UI_THEME} api={api} onChange={acceptProfile} />
        <Notifications
          key={user.id}
          api={api}
          onOpen={(target) => {
            setProjects(target.projects);
            setProjectPickerOpen(false);
            if (target.projectId === projectId) {
              if (target.threadId) {
                setThreadId(target.threadId);
                setThreadListPane("archived");
              }
            } else {
              pendingNotification.current = target;
              setProjectId(target.projectId);
            }
          }}
        />
        <a
          className="sidebar-toggle workspace-help-link workspace-space-switch"
          href="/admin"
          title="切换到管理空间"
          aria-label="切换到管理空间"
        >
          <UiIcon name="transfer" size={14} />
          <span>管理空间</span>
        </a>
        <button
          className="sidebar-toggle"
          aria-label={
            !projectId ? "暂无项目，右侧栏不可用" : contextOpen ? "收起右侧栏" : "展开右侧栏"
          }
          title={!projectId ? "导入项目后可使用右侧栏" : contextOpen ? "收起右侧栏" : "展开右侧栏"}
          aria-expanded={contextOpen}
          disabled={!projectId}
          onClick={() => {
            const nextOpen = !contextOpen;
            setContextOpen(nextOpen);
            if (!nextOpen) setDocumentFullscreen(false);
          }}
        >
          <PanelIcon side="right" />
        </button>
      </header>
      {tabMenu ? (
        <ProjectTabContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          onCopyProjectInfo={() => void copyProjectInfo(tabMenu.project)}
          onDismiss={() => setTabMenu(null)}
        />
      ) : null}
    </>
  );
}
