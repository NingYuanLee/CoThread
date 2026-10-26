/** 任务列表项的右键菜单：菜单项按需追加，目前只有「复制任务信息」。 */
import { ContextMenu } from "./ContextMenu";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FloatingPortal } from "./FloatingPortal";
import { UiIcon } from "./ui-icon";

export function TaskItemContextMenu({
  x,
  y,
  onCopyTaskInfo,
  onDismiss,
}: {
  x: number;
  y: number;
  onCopyTaskInfo: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: x, top: y });
  // 菜单挂到顶层浮层再按视口夹取坐标：靠近右侧或底部时向反方向展开，避免被弹窗边缘截断。
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const viewWidth = window.visualViewport?.width ?? document.documentElement.clientWidth;
    const viewHeight = window.visualViewport?.height ?? document.documentElement.clientHeight;
    const offsetLeft = window.visualViewport?.offsetLeft ?? 0;
    const offsetTop = window.visualViewport?.offsetTop ?? 0;
    const left = Math.min(
      Math.max(offsetLeft + 8, x),
      Math.max(offsetLeft + 8, offsetLeft + viewWidth - rect.width - 8),
    );
    const top = Math.min(
      Math.max(offsetTop + 8, y),
      Math.max(offsetTop + 8, offsetTop + viewHeight - rect.height - 8),
    );
    setBox((previous) =>
      previous.left === left && previous.top === top ? previous : { left, top },
    );
  }, [x, y]);
  // 右键菜单是瞬态浮层：点到别处就收起，避免菜单悬在已离开的列表项旁边。
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onDismiss]);
  return (
    <FloatingPortal>
      <ContextMenu
        ref={ref}
        onDismiss={onDismiss}
        className="library-folder-menu task-pool-item-menu"
        role="menu"
        style={{ left: box.left, top: box.top }}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          className="library-folder-menu-item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onCopyTaskInfo();
            onDismiss();
          }}
        >
          <UiIcon name="copy" size={14} />
          <span>复制任务信息</span>
        </button>
      </ContextMenu>
    </FloatingPortal>
  );
}
