import type { Project } from "./workspace-types";

/** 页签拖拽顺序只留在这台浏览器，按登录账号分开，不写数据库。 */
const storageKey = (userId: string) => `cothread-project-tab-order:${userId}`;

export type ProjectTabOrder = { pinned: string[]; open: string[] };

const emptyOrder = (): ProjectTabOrder => ({ pinned: [], open: [] });

function readIds(value: unknown) {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

export function readProjectTabOrder(userId: string): ProjectTabOrder {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return emptyOrder();
    const parsed = JSON.parse(raw) as { pinned?: unknown; open?: unknown };
    return { pinned: readIds(parsed.pinned), open: readIds(parsed.open) };
  } catch {
    return emptyOrder();
  }
}

function writeProjectTabOrder(userId: string, order: ProjectTabOrder) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(order));
  } catch {
    /* 隐私模式或配额满时放弃记忆，页签仍按添加时间排。 */
  }
}

export function rememberProjectTabOrder(userId: string, pinned: boolean, projectIds: string[]) {
  const order = readProjectTabOrder(userId);
  if (pinned) order.pinned = projectIds;
  else order.open = projectIds;
  writeProjectTabOrder(userId, order);
  return order;
}

/** 打开、固定或取消固定后，把这个页签挪到对应组的加入位置。 */
export function placeProjectTab(
  userId: string,
  projectId: string,
  action: "open" | "pin" | "unpin",
) {
  const order = readProjectTabOrder(userId);
  order.pinned = order.pinned.filter((id) => id !== projectId);
  order.open = order.open.filter((id) => id !== projectId);
  if (action === "pin") order.pinned.unshift(projectId);
  else order.open.push(projectId);
  writeProjectTabOrder(userId, order);
  return order;
}

function rank(list: string[], id: string) {
  const index = list.indexOf(id);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

/** 固定在前。组内先按浏览器里记住的顺序，没记过的按添加时间排在后面。 */
export function sortVisibleProjects(
  projects: Project[],
  order: ProjectTabOrder,
  compareAdded: (left: Project, right: Project) => number,
) {
  return projects
    .filter((project) => project.tab_visible)
    .sort((left, right) => {
      const leftPinned = left.tab_pinned_at ? 0 : 1;
      const rightPinned = right.tab_pinned_at ? 0 : 1;
      if (leftPinned !== rightPinned) return leftPinned - rightPinned;
      const list = left.tab_pinned_at ? order.pinned : order.open;
      const leftRank = rank(list, left.id);
      const rightRank = rank(list, right.id);
      if (leftRank !== rightRank) return leftRank - rightRank;
      return compareAdded(left, right);
    });
}
