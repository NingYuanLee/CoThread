import { ContextMenu } from "./ContextMenu";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FloatingPortal } from "./FloatingPortal";
import { UiIcon } from "./ui-icon";

export function MessageContextMenu({
  x,
  y,
  canQuote,
  onCopy,
  onQuote,
  onDismiss,
}: {
  x: number;
  y: number;
  canQuote: boolean;
  onCopy: () => void;
  onQuote: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewWidth = window.visualViewport?.width ?? document.documentElement.clientWidth;
    const viewHeight = window.visualViewport?.height ?? document.documentElement.clientHeight;
    const offsetLeft = window.visualViewport?.offsetLeft ?? 0;
    const offsetTop = window.visualViewport?.offsetTop ?? 0;
    let left = x;
    if (x + rect.width > offsetLeft + viewWidth - 8) left = x - rect.width;
    let top = y;
    if (y + rect.height > offsetTop + viewHeight - 8) top = y - rect.height;
    left = Math.min(
      Math.max(offsetLeft + 8, left),
      Math.max(offsetLeft + 8, offsetLeft + viewWidth - rect.width - 8),
    );
    top = Math.min(
      Math.max(offsetTop + 8, top),
      Math.max(offsetTop + 8, offsetTop + viewHeight - rect.height - 8),
    );
    setBox((previous) =>
      previous.left === left && previous.top === top ? previous : { left, top },
    );
  }, [x, y]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onDismiss]);
  const run = (action: () => void) => {
    action();
    onDismiss();
  };
  return (
    <FloatingPortal>
      <ContextMenu
        onDismiss={onDismiss}
        ref={ref}
        className="library-folder-menu doc-browser-tab-menu message-context-menu"
        role="menu"
        style={{ left: box.left, top: box.top }}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          className="library-folder-menu-item"
          onClick={() => run(onCopy)}
        >
          <span>复制</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="library-folder-menu-item"
          disabled={!canQuote}
          title={canQuote ? undefined : "当前消息不可引用"}
          onClick={() => {
            if (!canQuote) return;
            run(onQuote);
          }}
        >
          <span>引用</span>
        </button>
      </ContextMenu>
    </FloatingPortal>
  );
}

function ThreadMoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

export function ThreadIterationMenu({
  open,
  onOpenChange,
  showArchive,
  showArchivedActions,
  showReviewArchive,
  busy,
  copyLabel,
  onArchive,
  onCopy,
  onRestore,
  onDelete,
  onReviewArchive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showArchive: boolean;
  showArchivedActions: boolean;
  showReviewArchive: boolean;
  busy: boolean;
  copyLabel: string;
  onArchive: () => void;
  onCopy: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onReviewArchive: () => void;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuBox, setMenuBox] = useState<{ left: number; top: number } | null>(null);
  /** 右键打开时的落点（相对卡片左上角），让菜单出现在鼠标位置。 */
  const [pointerOrigin, setPointerOrigin] = useState<{ x: number; y: number } | null>(null);
  const openMenuRef = useRef(onOpenChange);
  openMenuRef.current = onOpenChange;
  // 卡片右键打开同一个菜单：拦掉浏览器默认菜单，并记录卡片内相对落点，
  // 这样列表滚动时菜单仍贴着卡片移动。
  useEffect(() => {
    const row = anchorRef.current?.closest<HTMLElement>(".thread-row");
    if (!row) return;
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const box = row.getBoundingClientRect();
      setPointerOrigin({ x: event.clientX - box.left, y: event.clientY - box.top });
      openMenuRef.current(true);
    };
    row.addEventListener("contextmenu", onContextMenu);
    return () => row.removeEventListener("contextmenu", onContextMenu);
  }, []);
  // 卡片外层有列表滚动容器等多层 overflow 裁剪，菜单必须挂到顶层浮层，
  // 再按视口夹取坐标：下方放不下就翻到卡片上方，避免被侧栏边缘截断。
  useLayoutEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;
    const place = () => {
      const menu = menuRef.current;
      const box = anchor.getBoundingClientRect();
      const rowBox = anchor.closest(".thread-row")?.getBoundingClientRect() ?? box;
      const width = menu?.offsetWidth ?? 0;
      const height = menu?.offsetHeight ?? 0;
      const viewWidth = window.visualViewport?.width ?? document.documentElement.clientWidth;
      const viewHeight = window.visualViewport?.height ?? document.documentElement.clientHeight;
      const offsetLeft = window.visualViewport?.offsetLeft ?? 0;
      const offsetTop = window.visualViewport?.offsetTop ?? 0;
      const gap = 6;
      const edge = 8;
      let left: number;
      let top: number;
      if (pointerOrigin) {
        // 右键入口：以鼠标位置为锚点，放不下时向反方向展开。
        const originX = rowBox.left + pointerOrigin.x;
        const originY = rowBox.top + pointerOrigin.y;
        left = originX;
        top = originY;
        if (originX + width > offsetLeft + viewWidth - edge) left = originX - width;
        if (originY + height > offsetTop + viewHeight - edge) top = originY - height;
      } else {
        const fitsBelow = box.bottom + gap + height <= offsetTop + viewHeight - edge;
        const fitsAbove = box.top - gap - height >= offsetTop + edge;
        top = fitsBelow || !fitsAbove ? box.bottom + gap : box.top - gap - height;
        left = box.right - width;
      }
      const next = {
        left: Math.min(
          Math.max(offsetLeft + edge, left),
          Math.max(offsetLeft + edge, offsetLeft + viewWidth - width - edge),
        ),
        top: Math.min(
          Math.max(offsetTop + edge, top),
          Math.max(offsetTop + edge, offsetTop + viewHeight - height - edge),
        ),
      };
      setMenuBox((previous) =>
        previous && previous.left === next.left && previous.top === next.top ? previous : next,
      );
    };
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open, pointerOrigin]);
  useEffect(() => {
    if (!open) return;
    const row = anchorRef.current?.closest(".thread-row");
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      // 右键同一张卡片时交给 contextmenu 重新定位，不先关闭，避免关闭再打开闪一下。
      if (event.button !== 0 && row?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, onOpenChange]);
  const dismiss = () => onOpenChange(false);
  return (
    <span className="thread-row-menu-anchor" ref={anchorRef}>
      <button
        type="button"
        className={`tree-menu-trigger thread-menu-trigger${open ? " active" : ""}`}
        title="迭代操作"
        aria-label="迭代操作"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setPointerOrigin(null);
          onOpenChange(!open);
        }}
      >
        <ThreadMoreIcon />
      </button>
      {open ? (
        <FloatingPortal>
          <ContextMenu
            ref={menuRef}
            onDismiss={dismiss}
            className={`library-folder-menu thread-row-menu${menuBox ? "" : " is-positioning"}`}
            role="menu"
            style={{
              position: "fixed",
              left: menuBox?.left ?? 0,
              top: menuBox?.top ?? 0,
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {showReviewArchive ? (
              <button
                type="button"
                role="menuitem"
                className="library-folder-menu-item"
                onClick={() => {
                  onReviewArchive();
                  dismiss();
                }}
              >
                <UiIcon name="preview" size={14} />
                <span>审查归档方案</span>
              </button>
            ) : null}
            {showArchive ? (
              <button
                type="button"
                role="menuitem"
                className="library-folder-menu-item"
                disabled={busy}
                onClick={() => {
                  onArchive();
                  dismiss();
                }}
              >
                <UiIcon name="archive" size={14} />
                <span>归档迭代</span>
              </button>
            ) : null}
            {showArchivedActions ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="library-folder-menu-item"
                  disabled={busy}
                  onClick={() => {
                    onRestore();
                    dismiss();
                  }}
                >
                  <UiIcon name="restore" size={14} />
                  <span>恢复迭代</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="library-folder-menu-item danger"
                  disabled={busy}
                  onClick={() => {
                    onDelete();
                    dismiss();
                  }}
                >
                  <UiIcon name="trash" size={14} />
                  <span>删除迭代</span>
                </button>
              </>
            ) : null}
            {!showArchivedActions ? (
              <button
                type="button"
                role="menuitem"
                className="library-folder-menu-item"
                onClick={() => {
                  void onCopy();
                  dismiss();
                }}
              >
                <UiIcon name="copy" size={14} />
                <span>{copyLabel}</span>
              </button>
            ) : null}
          </ContextMenu>
        </FloatingPortal>
      ) : null}
    </span>
  );
}
