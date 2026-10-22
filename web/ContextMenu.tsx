import React, { forwardRef } from "react";
import { FloatingPanel, type FloatingPanelProps } from "./FloatingPanel";

/** All application menus share one surface and keyboard navigation. */
export const ContextMenu = forwardRef<HTMLDivElement, FloatingPanelProps>(function ContextMenu(
  { onKeyDown, ...props },
  ref,
) {
  return (
    <FloatingPanel
      {...props}
      ref={ref}
      role="menu"
      data-overlay="menu"
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])',
          ),
        ).filter((el) => el.getClientRects().length > 0);
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      }}
    />
  );
});
