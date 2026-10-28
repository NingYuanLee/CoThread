/**
 * 工作台顶栏：项目页签与拖拽排序、项目选择、主题与通知、导入与管理入口。
 * 数据与回调由父组件打包成 props 传入。
 */
/**
 * 工作台顶栏：项目页签与拖拽排序、项目选择、主题与通知、导入与管理入口。
 * 数据与回调由父组件打包成 props 传入。
 */
import React, {
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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

/** 布局位置，忽略 transform。量最左/最右页签时不能清掉正在播放的位移动画。 */
function layoutBox(node: HTMLElement) {
  const parent = node.offsetParent as HTMLElement | null;
  const parentLeft = parent ? parent.getBoundingClientRect().left + parent.clientLeft : 0;
  const parentTop = parent ? parent.getBoundingClientRect().top + parent.clientTop : 0;
  const left = parentLeft + node.offsetLeft;
  const top = parentTop + node.offsetTop;
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

type TabDrag = {
  id: string;
  pinned: boolean;
  pointerId: number;
  originX: number;
  lastPointerX: number;
  grabX: number;
  pointerX: number;
  active: boolean;
  origin: string[];
  order: string[];
};

export type WorkspaceTopbarProps = {
  visibleProjects: Project[];
  projectId: string;
  setProjectId: Dispatch<SetStateAction<string>>;
  reorderProjectTab: (source: string, target: string, after: boolean) => void;
  commitProjectTabOrder: (projectIds: string[]) => void;
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
  setThreadListPane: Dispatch<SetStateAction<"active" | "archived">>;
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
  reorderProjectTab,
  commitProjectTabOrder,
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
  const [inboxByProject, setInboxByProject] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    const load = () => {
      void api("/notifications?summary=1")
        .then((page: { projects?: { id: string; chat?: number; task?: number }[] }) => {
          if (!alive) return;
          const next: Record<string, number> = {};
          for (const row of page.projects || []) {
            const total = (row.chat || 0) + (row.task || 0);
            if (total > 0) next[row.id] = total;
          }
          setInboxByProject(next);
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [projectId]);
  const copyProjectInfo = async (project: Project) => {
    try {
      await navigator.clipboard.writeText(projectCopyInfo({ projectId: project.id, mcpEndpoint }));
      showTip("项目信息已复制");
    } catch {
      showTip("无法自动复制项目信息，请检查剪贴板权限后重试。", "error");
    }
  };
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const projectsRef = useRef(visibleProjects);
  projectsRef.current = visibleProjects;
  const drag = useRef<TabDrag | null>(null);
  const flipFrom = useRef<Map<string, number> | null>(null);
  const [liveOrder, setLiveOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState("");
  const shownProjects = liveOrder
    ? liveOrder
        .map((id) => visibleProjects.find((item) => item.id === id))
        .filter((item): item is Project => !!item)
    : visibleProjects;
  const tabs = shownProjects.length === visibleProjects.length ? shownProjects : visibleProjects;

  const placeDragged = () => {
    const current = drag.current;
    if (!current?.active) return;
    const element = nodes.current.get(current.id);
    if (!element) return;
    const layout = layoutBox(element);
    const projects = projectsRef.current;
    const group = current.order.filter(
      (id) => !!projects.find((item) => item.id === id)?.tab_pinned_at === current.pinned,
    );
    let groupLeft = layout.left;
    let groupRight = layout.right;
    for (const id of group) {
      const node = nodes.current.get(id);
      if (!node) continue;
      const box = layoutBox(node);
      groupLeft = Math.min(groupLeft, box.left);
      groupRight = Math.max(groupRight, box.right);
    }
    let desired = current.pointerX - current.grabX;
    const min = groupLeft;
    const max = groupRight - layout.width;
    desired = Math.min(Math.max(desired, Math.min(min, max)), Math.max(min, max));
    element.style.transform = `translate3d(${desired - layout.left}px, 0, 0)`;
  };

  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    if (from) {
      for (const [id, left] of from) {
        const node = nodes.current.get(id);
        if (!node) continue;
        const delta = left - layoutBox(node).left;
        if (Math.abs(delta) < 0.5) continue;
        node.style.transition = "none";
        node.style.transform = `translate3d(${delta}px, 0, 0)`;
        requestAnimationFrame(() => {
          node.style.transition = "transform 140ms ease";
          node.style.transform = "";
        });
      }
    }
    placeDragged();
  });

  const finishDrag = (commit: boolean) => {
    const current = drag.current;
    drag.current = null;
    const dragged = current ? nodes.current.get(current.id) : undefined;
    const from = dragged?.style.transform;
    const settle = dragged && from && from !== "none" ? dragged : null;
    for (const node of nodes.current.values()) {
      if (node === settle) continue;
      node.style.transform = "";
      node.style.transition = "";
    }
    if (settle && current) {
      const settlingId = current.id;
      // 滑回期间保持 is-dragging，避免层级先掉下去被其它页签挡住。
      settle.style.transition = "none";
      let cleared = false;
      const clear = () => {
        if (cleared) return;
        cleared = true;
        settle.style.transition = "";
        settle.removeEventListener("transitionend", clear);
        setDraggingId((id) => (id === settlingId ? "" : id));
      };
      requestAnimationFrame(() => {
        settle.style.transition = "transform 200ms ease";
        settle.style.transform = "";
        settle.addEventListener("transitionend", clear);
        window.setTimeout(clear, 260);
      });
    }
    if (commit && current?.active) {
      const projects = projectsRef.current;
      const group = current.order.filter(
        (id) => !!projects.find((item) => item.id === id)?.tab_pinned_at === current.pinned,
      );
      const origin = current.origin.filter(
        (id) => !!projects.find((item) => item.id === id)?.tab_pinned_at === current.pinned,
      );
      if (group.some((id, index) => id !== origin[index])) commitProjectTabOrder(group);
    }
    setLiveOrder(null);
    if (!settle) setDraggingId("");
  };

  const stopDrag = (commit: boolean) => {
    const current = drag.current;
    if (!current) return;
    const element = nodes.current.get(current.id);
    if (element?.hasPointerCapture(current.pointerId))
      element.releasePointerCapture(current.pointerId);
    finishDrag(commit && current.active);
  };

  const onTabPointerDown = (project: Project, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || busy) return;
    if ((event.target as HTMLElement).closest(".project-tab-actions")) return;
    setProjectId(project.id);
    const rect = event.currentTarget.getBoundingClientRect();
    const ids = visibleProjects.map((item) => item.id);
    drag.current = {
      id: project.id,
      pinned: !!project.tab_pinned_at,
      pointerId: event.pointerId,
      originX: event.clientX,
      lastPointerX: event.clientX,
      grabX: event.clientX - rect.left,
      pointerX: event.clientX,
      active: false,
      origin: ids,
      order: ids,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onTabPointerMove = (projectIdMoved: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== projectIdMoved || event.pointerId !== current.pointerId) return;
    if ((event.buttons & 1) === 0) {
      stopDrag(true);
      return;
    }
    const delta = event.clientX - current.lastPointerX;
    current.lastPointerX = event.clientX;
    current.pointerX = event.clientX;
    if (!current.active && Math.abs(event.clientX - current.originX) < 4) return;
    if (!current.active) {
      current.active = true;
      setDraggingId(current.id);
    }
    const projects = projectsRef.current;
    const group = current.order.filter(
      (id) => !!projects.find((item) => item.id === id)?.tab_pinned_at === current.pinned,
    );
    const dragged = nodes.current.get(current.id);
    const nextGroup = group.slice();
    if (dragged && delta !== 0) {
      const width = layoutBox(dragged).width;
      const leftEdge = current.pointerX - current.grabX;
      const rightEdge = leftEdge + width;
      let index = nextGroup.indexOf(current.id);
      if (delta < 0) {
        while (index > 0) {
          const neighbor = nodes.current.get(nextGroup[index - 1] || "");
          if (!neighbor) break;
          const rect = layoutBox(neighbor);
          if (leftEdge > rect.left + rect.width / 2) break;
          const previous = nextGroup[index - 1];
          nextGroup[index - 1] = nextGroup[index];
          nextGroup[index] = previous;
          index -= 1;
        }
      } else {
        while (index < nextGroup.length - 1) {
          const neighbor = nodes.current.get(nextGroup[index + 1] || "");
          if (!neighbor) break;
          const rect = layoutBox(neighbor);
          if (rightEdge < rect.left + rect.width / 2) break;
          const previous = nextGroup[index + 1];
          nextGroup[index + 1] = nextGroup[index];
          nextGroup[index] = previous;
          index += 1;
        }
      }
    }
    if (nextGroup.some((id, at) => id !== group[at])) {
      const pinnedIds = current.order.filter(
        (id) => projects.find((item) => item.id === id)?.tab_pinned_at,
      );
      const openIds = current.order.filter(
        (id) => !projects.find((item) => item.id === id)?.tab_pinned_at,
      );
      const next = current.pinned ? [...nextGroup, ...openIds] : [...pinnedIds, ...nextGroup];
      const positions = new Map<string, number>();
      for (const id of current.order) {
        if (id === current.id) continue;
        const node = nodes.current.get(id);
        if (node) positions.set(id, layoutBox(node).left);
      }
      flipFrom.current = positions;
      current.order = next;
      setLiveOrder(next);
    }
    placeDragged();
    const element = nodes.current.get(current.id);
    if (!current.active || !element || !drag.current) return;
    const box = element.getBoundingClientRect();
    const outside =
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom;
    if (outside) stopDrag(true);
  };

  const onTabPointerUp = (projectIdMoved: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== projectIdMoved || event.pointerId !== current.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    finishDrag(true);
  };
  return (
    <>
      <header className="workspace-topbar">
        <nav className={`project-tabs${draggingId ? " is-reordering" : ""}`} aria-label="项目页签">
          {tabs.map((p, index) => (
            <React.Fragment key={p.id}>
              {!p.tab_pinned_at && index > 0 && tabs[index - 1].tab_pinned_at && (
                <span
                  className="project-tabs-divider"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="固定项目与普通项目分隔"
                />
              )}
              <div
                ref={(node) => {
                  if (node) nodes.current.set(p.id, node);
                  else nodes.current.delete(p.id);
                }}
                className={`project-tab ${projectId === p.id ? "selected" : ""} ${p.tab_pinned_at ? "pinned" : ""} ${draggingId === p.id ? "is-dragging" : ""}`}
                onPointerDown={(event) => onTabPointerDown(p, event)}
                onPointerMove={(event) => onTabPointerMove(p.id, event)}
                onPointerUp={(event) => onTabPointerUp(p.id, event)}
                onPointerCancel={(event) => onTabPointerUp(p.id, event)}
                onPointerLeave={() => {
                  const current = drag.current;
                  if (!current || current.id !== p.id) return;
                  stopDrag(current.active);
                }}
                onDragStart={(event) => event.preventDefault()}
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
                  aria-label={p.tab_pinned_at ? p.name : undefined}
                  title={`${p.name}（拖拽排序，或按 Alt + 左右方向键）`}
                  onKeyDown={(event) => {
                    if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                    event.preventDefault();
                    const pinned = !!p.tab_pinned_at;
                    const group = visibleProjects.filter(
                      (project) => !!project.tab_pinned_at === pinned,
                    );
                    const right = event.key === "ArrowRight";
                    const target =
                      group[group.findIndex((project) => project.id === p.id) + (right ? 1 : -1)];
                    if (target) reorderProjectTab(p.id, target.id, right);
                  }}
                >
                  <ProjectMark name={p.name} image={p.image} size={16} />
                  <span className="project-tab-label">{p.name}</span>
                  {projectId !== p.id && (inboxByProject[p.id] || 0) > 0 && (
                    <span className="project-tab-unread">{inboxByProject[p.id]}</span>
                  )}
                </button>
                {!p.tab_pinned_at && (
                  <div className="project-tab-actions">
                    <button
                      disabled={busy}
                      title="移出页签区（不删除项目）"
                      aria-label={`移出页签区 ${p.name}`}
                      onClick={() => updateProjectTab(p.id, "close")}
                    >
                      <ProjectActionIcon action="close" />
                    </button>
                  </div>
                )}
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
          pinned={!!tabMenu.project.tab_pinned_at}
          busy={busy}
          onTogglePin={() =>
            updateProjectTab(tabMenu.project.id, tabMenu.project.tab_pinned_at ? "unpin" : "pin")
          }
          onCopyProjectInfo={() => void copyProjectInfo(tabMenu.project)}
          onDismiss={() => setTabMenu(null)}
        />
      ) : null}
    </>
  );
}
