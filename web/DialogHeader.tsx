import React, { useEffect, useId, useRef, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { IconButton } from "./IconButton";

const DRAG_PAD = 8;

function hasContent(value: React.ReactNode): boolean {
  return React.Children.toArray(value).some((child) => {
    if (typeof child === "string") return child.trim().length > 0;
    if (
      React.isValidElement<{ children?: React.ReactNode }>(child) &&
      child.type === React.Fragment
    )
      return hasContent(child.props.children);
    return true;
  });
}

function dragSurface(header: HTMLElement | null): HTMLElement | null {
  const surface = header?.closest<HTMLElement>('[role="dialog"], dialog') ?? null;
  if (!surface || surface.matches('[data-overlay="dialog-shell"]')) return null;
  return surface;
}

function readDrag(surface: HTMLElement) {
  return {
    x: Number(surface.dataset.dialogDragX || 0),
    y: Number(surface.dataset.dialogDragY || 0),
  };
}

function shellOf(surface: HTMLElement): HTMLElement | null {
  const parent = surface.parentElement;
  return parent?.matches('[data-overlay="dialog-shell"]') ? parent : null;
}

/** Keep a dragged shell from clipping or scrolling the panel that moved out of its layout box. */
function syncShellOverflow(surface: HTMLElement) {
  const shell = shellOf(surface);
  if (!shell) return;
  const dragged = Boolean(surface.dataset.dialogDragX || surface.dataset.dialogDragY);
  shell.style.overflow =
    dragged && !surface.classList.contains("dialog-fullscreen") ? "visible" : "";
}

function writeDrag(surface: HTMLElement, x: number, y: number) {
  const left = Math.round(x);
  const top = Math.round(y);
  if (left) surface.dataset.dialogDragX = String(left);
  else delete surface.dataset.dialogDragX;
  if (top) surface.dataset.dialogDragY = String(top);
  else delete surface.dataset.dialogDragY;
  syncShellOverflow(surface);
  if (surface.classList.contains("dialog-fullscreen")) return;
  surface.style.transform = left || top ? `translate(${left}px, ${top}px)` : "";
}

function restoreDrag(surface: HTMLElement) {
  syncShellOverflow(surface);
  if (surface.classList.contains("dialog-fullscreen")) {
    surface.style.transform = "";
    return;
  }
  const { x, y } = readDrag(surface);
  surface.style.transform = x || y ? `translate(${x}px, ${y}px)` : "";
}

function clampDrag(surface: HTMLElement, bar: HTMLElement) {
  if (surface.classList.contains("dialog-fullscreen")) return;
  const rect = bar.getBoundingClientRect();
  const maxLeft = Math.max(DRAG_PAD, window.innerWidth - rect.width - DRAG_PAD);
  const maxTop = Math.max(DRAG_PAD, window.innerHeight - rect.height - DRAG_PAD);
  let dx = 0;
  let dy = 0;
  if (rect.left < DRAG_PAD) dx = DRAG_PAD - rect.left;
  else if (rect.left > maxLeft) dx = maxLeft - rect.left;
  if (rect.top < DRAG_PAD) dy = DRAG_PAD - rect.top;
  else if (rect.top > maxTop) dy = maxTop - rect.top;
  if (!dx && !dy) return;
  const current = readDrag(surface);
  writeDrag(surface, current.x + dx, current.y + dy);
}

function isDragHandleTarget(header: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Element) || !header.contains(target)) return false;
  return !target.closest(
    "button, a, input, textarea, select, label, summary, [role='button'], [role='tab'], [role='switch'], [role='checkbox'], [contenteditable='true']",
  );
}

export type DialogHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  leftExtra?: React.ReactNode;
  actions?: React.ReactNode;
  titleId?: string;
  onClose: () => void;
  closeLabel?: string;
  disabled?: boolean;
  autoFocusClose?: boolean;
  fullscreen?: boolean;
};

/** One title bar layout for every modal, including compatibility panels. */
export function DialogHeader({
  title,
  subtitle,
  icon,
  leftExtra,
  actions,
  titleId,
  onClose,
  closeLabel = "关闭弹窗",
  disabled = false,
  autoFocusClose,
  fullscreen = true,
}: DialogHeaderProps) {
  const generatedId = useId();
  const header = useRef<HTMLElement>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
    barLeft: number;
    barTop: number;
    barWidth: number;
    barHeight: number;
    surface: HTMLElement;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  /* 初始就带 dialog-fullscreen 的弹窗（项目记忆）要让按钮一上来就是「退出全屏」。 */
  useEffect(() => {
    const surface = header.current?.closest<HTMLElement>('[role="dialog"], dialog');
    if (surface?.classList.contains("dialog-fullscreen")) setExpanded(true);
  }, []);
  const toggleFullscreen = () => {
    const surface = header.current?.closest<HTMLElement>('[role="dialog"], dialog');
    if (!surface) return;
    const next = !surface.classList.contains("dialog-fullscreen");
    surface.classList.toggle("dialog-fullscreen", next);
    setExpanded(next);
    restoreDrag(surface);
    if (!next && header.current) clampDrag(surface, header.current);
    // Canvas and image previews use the same resize path as viewport changes.
    window.dispatchEvent(new Event("resize"));
  };
  useEffect(() => {
    const onResize = () => {
      const bar = header.current;
      const surface = dragSurface(bar);
      if (!bar || !surface) return;
      if (!surface.dataset.dialogDragX && !surface.dataset.dialogDragY) return;
      clampDrag(surface, bar);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      document.documentElement.classList.remove("dialog-dragging");
    };
  }, []);
  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (active && event.pointerId !== active.pointerId) return;
    drag.current = null;
    setDragging(false);
    document.documentElement.classList.remove("dialog-dragging");
    if (active && header.current) clampDrag(active.surface, header.current);
    if (header.current?.hasPointerCapture(event.pointerId)) {
      header.current.releasePointerCapture(event.pointerId);
    }
  };
  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const bar = header.current;
    if (!bar || !isDragHandleTarget(bar, event.target)) return;
    const surface = dragSurface(bar);
    if (!surface || surface.classList.contains("dialog-fullscreen")) return;
    const rect = bar.getBoundingClientRect();
    const origin = readDrag(surface);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      originX: origin.x,
      originY: origin.y,
      barLeft: rect.left,
      barTop: rect.top,
      barWidth: rect.width,
      barHeight: rect.height,
      surface,
    };
    setDragging(true);
    document.documentElement.classList.add("dialog-dragging");
    bar.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const maxLeft = Math.max(DRAG_PAD, window.innerWidth - active.barWidth - DRAG_PAD);
    const maxTop = Math.max(DRAG_PAD, window.innerHeight - active.barHeight - DRAG_PAD);
    const left = Math.min(Math.max(active.barLeft + (event.clientX - active.x), DRAG_PAD), maxLeft);
    const top = Math.min(Math.max(active.barTop + (event.clientY - active.y), DRAG_PAD), maxTop);
    writeDrag(
      active.surface,
      active.originX + (left - active.barLeft),
      active.originY + (top - active.barTop),
    );
  };
  return (
    <header
      ref={header}
      className={`dialog-header${dragging ? " is-dragging" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="dialog-header-left">
        {hasContent(icon) && (
          <span className="dialog-header-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="dialog-header-titles">
          <h2 id={titleId ?? generatedId} className="dialog-header-title">
            {title}
          </h2>
          {hasContent(subtitle) && <div className="dialog-header-subtitle">{subtitle}</div>}
        </div>
        {hasContent(leftExtra) && <div className="dialog-header-extra">{leftExtra}</div>}
      </div>
      <div className="dialog-header-actions">
        {actions && <div className="dialog-header-custom-actions">{actions}</div>}
        {fullscreen && (
          <IconButton
            label={expanded ? "退出全屏" : "全屏"}
            icon={expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            className="dialog-header-control"
            aria-label={expanded ? "退出全屏" : "全屏"}
            title={expanded ? "退出全屏" : "全屏"}
            aria-pressed={expanded}
            onClick={toggleFullscreen}
          />
        )}
        <IconButton
          label={closeLabel}
          icon={<X size={17} />}
          className="dialog-header-control"
          aria-label={closeLabel}
          title="关闭"
          disabled={disabled}
          autoFocus={autoFocusClose}
          onClick={onClose}
        />
      </div>
    </header>
  );
}
