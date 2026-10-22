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
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (!anchorRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
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
          onOpenChange(!open);
        }}
      >
        <ThreadMoreIcon />
      </button>
      {open ? (
        <ContextMenu
          onDismiss={dismiss}
          className="library-folder-menu thread-row-menu"
          role="menu"
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
      ) : null}
    </span>
  );
}
