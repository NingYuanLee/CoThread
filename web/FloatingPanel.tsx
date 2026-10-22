import React, { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import { overlayDuration, type OverlayDirection, type OverlayLayoutStyle } from "./overlay-motion";
const dismissStack: HTMLDivElement[] = [];

export type FloatingPanelProps = Omit<React.HTMLAttributes<HTMLDivElement>, "style"> & {
  style?: OverlayLayoutStyle;
  direction?: OverlayDirection;
  onDismiss?: () => void;
};

/** Shared non-modal surface. Callers retain their anchoring and content layout. */
export const FloatingPanel = forwardRef<HTMLDivElement, FloatingPanelProps>(function FloatingPanel(
  { direction = "down", className = "", onDismiss, ...props },
  ref,
) {
  const node = useRef<HTMLDivElement | null>(null);
  const rect = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    const opener = document.activeElement as HTMLElement | null;
    let owner = el.closest("dialog");
    const focusFrame = window.requestAnimationFrame(() => {
      owner = el.closest("dialog");
      if (el.dataset.overlay === "menu" && el.isConnected)
        el.querySelector<HTMLElement>(
          '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])',
        )?.focus({
          preventScroll: true,
        });
    });
    const measure = () => {
      rect.current = el.getBoundingClientRect();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      observer.disconnect();
      if (
        (document.activeElement === document.body || el.contains(document.activeElement)) &&
        opener?.isConnected
      )
        opener.focus({ preventScroll: true });
      if (owner && (!owner.open || owner.classList.contains("is-closing"))) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const box = el.isConnected ? el.getBoundingClientRect() : rect.current;
      if (!box?.width || !box.height) return;
      // A non-interactive snapshot preserves exit motion even for conditional callers.
      const host = document.createElement("div");
      host.className = "overlay-exit-host";
      host.setAttribute("popover", "manual");
      host.setAttribute("aria-hidden", "true");
      host.inert = true;
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("id");
      ghost.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
      ghost.classList.add("overlay-exiting");
      Object.assign(ghost.style, {
        position: "fixed",
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        margin: "0",
        transform: "none",
      });
      host.appendChild(ghost);
      (
        Array.from(document.querySelectorAll("dialog:modal:not(.is-closing)")).at(-1) ??
        document.body
      ).appendChild(host);
      try {
        host.showPopover?.();
      } catch {
        /* The owner may close in the same commit. */
      }
      window.setTimeout(() => host.remove(), overlayDuration());
    };
  }, []);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const el = node.current;
    if (!onDismiss || !el) return;
    dismissStack.push(el);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || dismissStack.at(-1) !== el) return;
      const modal = Array.from(document.querySelectorAll("dialog:modal")).at(-1);
      if (modal && !modal.contains(el)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dismiss.current?.();
    };
    document.addEventListener("keydown", escape, true);
    return () => {
      dismissStack.splice(dismissStack.indexOf(el), 1);
      document.removeEventListener("keydown", escape, true);
    };
  }, [!!onDismiss]);
  return (
    <div
      data-overlay="panel"
      {...props}
      ref={(el) => {
        node.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      data-direction={direction}
      className={className}
    />
  );
});
