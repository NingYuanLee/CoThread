import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DIALOG_OUT_MS = 150;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function animateDialogClose(el: HTMLDialogElement | null, after?: () => void) {
  if (!el) {
    after?.();
    return;
  }
  if (!el.open) {
    after?.();
    return;
  }
  if (el.classList.contains("is-closing")) return;
  if (prefersReducedMotion()) {
    el.close();
    after?.();
    return;
  }
  el.classList.add("is-closing");
  let done = false;
  const finish = (event?: AnimationEvent) => {
    if (done) return;
    if (event && (event.target !== el || !String(event.animationName).includes("dialog-out")))
      return;
    done = true;
    el.removeEventListener("animationend", finish as EventListener);
    window.clearTimeout(timer);
    el.classList.remove("is-closing");
    if (el.open) el.close();
    after?.();
  };
  el.addEventListener("animationend", finish as EventListener);
  const timer = window.setTimeout(() => finish(), DIALOG_OUT_MS + 40);
}

export function onDialogCancel(onClose: () => void) {
  return (event: React.SyntheticEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    animateDialogClose(event.currentTarget, onClose);
  };
}

export function onDialogBackdropClick(onClose: () => void, canClose?: () => boolean) {
  return (event: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = event.currentTarget;
    if (event.target !== dialog) return;
    if (canClose && !canClose()) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    )
      return;
    animateDialogClose(dialog, onClose);
  };
}

export function DialogClose({
  onClick,
  disabled,
  label,
  autoFocus,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className="dialog-close"
      disabled={disabled}
      autoFocus={autoFocus}
      onClick={onClick}
      aria-label={label}
      title="关闭"
    >
      ×
    </button>
  );
}

/**
 * 浮层该挂在谁下面。
 *
 * 原生 `<dialog>` 用 `showModal()` 打开后会进入 top layer，同时把 layer 之外的
 * 内容变成 inert；此时把浮层 portal 到 `document.body`，浮层既画不出来也点不到
 * ——「小程序云开发」里再次打开的弹窗被挡住就是这个原因。所以优先挂进最上层
 * 打开着的 `<dialog>`，只有页面上没有对话框时才用 body。
 */
function modalPortalHost(): HTMLElement {
  const openDialogs = document.querySelectorAll("dialog[open]");
  const top = openDialogs[openDialogs.length - 1];
  return top instanceof HTMLElement ? top : document.body;
}

export function ModalBackdrop({
  onClose,
  children,
  className = "",
  closeOnBackdrop = true,
  enabled = true,
}: {
  onClose: () => void;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  className?: string;
  closeOnBackdrop?: boolean;
  enabled?: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const enabledRef = useRef(enabled);
  onCloseRef.current = onClose;
  enabledRef.current = enabled;
  const finish = () => {
    if (!closingRef.current) return;
    closingRef.current = false;
    onCloseRef.current();
  };
  const requestClose = () => {
    if (!enabledRef.current || closingRef.current) return;
    if (prefersReducedMotion()) {
      onCloseRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
  };
  const nodeRef = useRef<HTMLDivElement>(null);
  // 宿主在挂载时定一次：浮层显示时父对话框已经打开，之后不会换层。
  const hostRef = useRef<HTMLElement | null>(null);
  if (!hostRef.current) hostRef.current = modalPortalHost();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const layers = Array.from(document.querySelectorAll(".modal-backdrop:not(.is-closing)"));
      if (layers.at(-1) !== nodeRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      requestClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(finish, DIALOG_OUT_MS + 40);
    return () => window.clearTimeout(timer);
  }, [closing]);
  return createPortal(
    <div
      ref={nodeRef}
      className={`modal-backdrop ${className} ${closing ? "is-closing" : ""}`.trim()}
      onClick={
        closeOnBackdrop
          ? (event) => {
              if (event.target === event.currentTarget) requestClose();
            }
          : undefined
      }
      onAnimationEnd={(event) => {
        if (!closing || event.target !== event.currentTarget) return;
        if (!String(event.animationName).includes("dialog-backdrop-out")) return;
        finish();
      }}
    >
      {typeof children === "function" ? children(requestClose) : children}
    </div>,
    hostRef.current,
  );
}
