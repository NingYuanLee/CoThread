import { useEffect } from "react";
import { actionTooltipLabel } from "./workspace-format";

export function useActionTooltips() {
  useEffect(() => {
    const selector = "button, [role=button], a";
    const apply = (root: ParentNode) => {
      const elements: HTMLElement[] = [];
      if (root instanceof HTMLElement && root.matches(selector)) elements.push(root);
      root.querySelectorAll<HTMLElement>(selector).forEach((element) => elements.push(element));
      elements.forEach((element) => {
        if (element.hasAttribute("title") || element.dataset.tooltip === "false") return;
        const label = actionTooltipLabel(element);
        if (label) element.setAttribute("title", label);
      });
    };
    apply(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) apply(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}
