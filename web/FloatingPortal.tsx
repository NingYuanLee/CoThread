import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Keep menus interactive above the current native modal without clipping them. */
export function FloatingPortal({ children }: { children: ReactNode }) {
  const [host] = useState(() => {
    const el = document.createElement("div");
    el.className = "floating-layer-host";
    el.setAttribute("popover", "manual");
    return el;
  });
  useLayoutEffect(() => {
    const sync = () => {
      // Keep an existing panel with its owner when a newer modal opens above it.
      // Only newly mounted or orphaned portals select the current modal.
      const current = host.parentElement;
      const parent =
        current instanceof HTMLDialogElement && current.isConnected && current.open
          ? current
          : (Array.from(document.querySelectorAll("dialog:modal")).at(-1) ?? document.body);
      if (host.parentElement !== parent) {
        parent.appendChild(host);
      }
      if (typeof host.showPopover === "function" && !host.matches(":popover-open"))
        host.showPopover();
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => {
      observer.disconnect();
      host.remove();
    };
  }, [host]);
  return createPortal(children, host);
}
