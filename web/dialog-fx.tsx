import React, { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { overlayDuration, type OverlayDirection, type OverlayLayoutStyle } from "./overlay-motion";

const stack: HTMLDialogElement[] = [];
const controllers = new WeakMap<HTMLDialogElement, (after?: () => void) => void>();
let previousOverflow = "";
function topDialog() {
  return stack.filter((dialog) => dialog.isConnected && dialog.open).at(-1);
}
function register(dialog: HTMLDialogElement) {
  if (stack.includes(dialog)) return;
  if (!stack.length) {
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
  }
  stack.push(dialog);
}
function unregister(dialog: HTMLDialogElement) {
  const index = stack.indexOf(dialog);
  if (index < 0) return;
  stack.splice(index, 1);
  if (!stack.length) document.documentElement.style.overflow = previousOverflow;
}
function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type DialogProps = Omit<
  React.DialogHTMLAttributes<HTMLDialogElement>,
  "children" | "open" | "onCancel" | "onClose" | "style"
> & {
  style?: OverlayLayoutStyle;
  onRequestClose: () => void;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  enabled?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /** Full viewport wrapper for existing modal panels. */
  shell?: boolean;
  active?: boolean;
  direction?: OverlayDirection;
};

/** One native top-layer, focus, nesting and close lifecycle for every modal. */
export const Dialog = forwardRef<HTMLDialogElement, DialogProps>(function Dialog(
  {
    children,
    onRequestClose,
    enabled = true,
    closeOnBackdrop = true,
    closeOnEscape = true,
    shell = false,
    active = true,
    direction = "up",
    className = "",
    onClick,
    onKeyDown,
    onPointerDown,
    ...props
  },
  forwardedRef,
) {
  const node = useRef<HTMLDialogElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasActive = useRef(false);
  if (active && !wasActive.current) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasActive.current = active;
  const config = useRef({ onRequestClose, enabled, closeOnBackdrop, closeOnEscape });
  config.current = { onRequestClose, enabled, closeOnBackdrop, closeOnEscape };
  const closing = useRef(false);
  const notified = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const backdropStart = useRef(false);
  const finish = useCallback(() => {
    const el = node.current;
    if (!el || notified.current) return;
    notified.current = true;
    window.clearTimeout(timer.current);
    el.classList.remove("is-closing");
    if (el.open) el.close();
    unregister(el);
    (afterClose.current ?? config.current.onRequestClose)();
  }, []);
  const requestClose = useCallback(
    (after?: () => void) => {
      const el = node.current;
      if (!el || !config.current.enabled || closing.current || topDialog() !== el) return;
      closing.current = true;
      afterClose.current = after;
      if (reducedMotion()) return finish();
      el.classList.add("is-closing");
      timer.current = window.setTimeout(finish, overlayDuration());
    },
    [finish],
  );
  const setNode = useCallback(
    (el: HTMLDialogElement | null) => {
      node.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef],
  );
  useLayoutEffect(() => {
    const el = node.current;
    if (!el || !active) return;
    const returnFocus = opener.current;
    notified.current = false;
    closing.current = false;
    afterClose.current = undefined;
    controllers.set(el, requestClose);
    el.showModal();
    register(el);
    el.dataset.dialogDepth = String(stack.length);
    return () => {
      window.clearTimeout(timer.current);
      controllers.delete(el);
      if (el.open) el.close();
      unregister(el);
      const top = topDialog();
      if (returnFocus?.isConnected && (!top || top.contains(returnFocus))) {
        returnFocus.focus({ preventScroll: true });
      }
    };
  }, [requestClose, active]);
  const isBackdrop = (target: EventTarget, x: number, y: number) => {
    const el = node.current;
    if (!el || target !== el) return false;
    if (shell) return true;
    const rect = el.getBoundingClientRect();
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
  };
  return active
    ? createPortal(
        <dialog
          {...props}
          data-overlay={shell ? "dialog-shell" : "dialog"}
          data-direction={direction}
          role={shell ? "presentation" : props.role}
          ref={setNode}
          className={`${className}${shell ? " dialog-shell" : ""}`.trim()}
          onCancel={(event) => {
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            event.stopPropagation();
            if (config.current.closeOnEscape) requestClose();
          }}
          onClose={(event) => {
            if (event.target === event.currentTarget && !notified.current) finish();
          }}
          onAnimationEnd={(event) => {
            props.onAnimationEnd?.(event);
            const ownPanel =
              event.target === event.currentTarget ||
              (shell && (event.target as HTMLElement).parentElement === event.currentTarget);
            if (closing.current && ownPanel && event.animationName === "overlay-out") finish();
          }}
          onPointerDown={(event) => {
            backdropStart.current = isBackdrop(event.target, event.clientX, event.clientY);
            onPointerDown?.(event);
          }}
          onClick={(event) => {
            onClick?.(event);
            if (
              !event.defaultPrevented &&
              backdropStart.current &&
              config.current.closeOnBackdrop &&
              isBackdrop(event.target, event.clientX, event.clientY)
            )
              requestClose();
            backdropStart.current = false;
          }}
          onKeyDown={(event) => {
            if (topDialog() !== event.currentTarget) return;
            onKeyDown?.(event);
            if (event.defaultPrevented) return;
            if (event.key === "Escape") event.stopPropagation();
            if (event.key !== "Tab") return;
            event.stopPropagation();
            const nodes = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]",
              ),
            ).filter(
              (el) => el.tabIndex >= 0 && el.getClientRects().length && !el.closest("[inert]"),
            );
            const first = nodes[0],
              last = nodes.at(-1);
            if (!first) {
              event.preventDefault();
              event.currentTarget.focus();
            } else if (
              event.shiftKey &&
              (document.activeElement === first ||
                !event.currentTarget.contains(document.activeElement))
            ) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          {typeof children === "function" ? children(() => requestClose()) : children}
        </dialog>,
        document.body,
      )
    : null;
});

/** Compatibility entry: existing close buttons use the same controller and busy gate. */
export function animateDialogClose(el: HTMLDialogElement | null, after?: () => void) {
  if (!el) return;
  controllers.get(el)?.(after);
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

/** Compatibility layout adapter; every former custom modal now uses Dialog. */
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
  return (
    <Dialog
      shell
      className={`modal-backdrop ${className}`.trim()}
      onRequestClose={onClose}
      enabled={enabled}
      closeOnBackdrop={closeOnBackdrop}
    >
      {children}
    </Dialog>
  );
}
