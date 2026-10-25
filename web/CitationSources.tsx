import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  citationTitle,
  citeGroupId,
  groupCitations,
  inferCitationKind,
  isPublicWebUrl,
} from "../shared/citations.js";
import { showTip } from "./Tip";

export type CiteItem = {
  id: string;
  kind?: string | null;
  label: string;
  target?: string | null;
  pageId?: string | null;
  title?: string | null;
};

const PANEL_GAP = 6;
const PANEL_MARGIN = 8;
const PANEL_MAX_WIDTH = 320;

function itemGroup(item: CiteItem) {
  return citeGroupId(item.kind) || citeGroupId(inferCitationKind(item.label, item.pageId));
}

function canOpen(item: CiteItem) {
  if (item.pageId || item.target) return true;
  return itemGroup(item) === "wiki";
}

function activateCitation(item: CiteItem, onActivate?: (item: CiteItem) => void) {
  if (canOpen(item)) {
    onActivate?.(item);
    return;
  }
  showTip("这是较早的引用，当时没有记下打开位置，所以暂时打不开。", "info");
}

function placePanel(anchor: HTMLElement, panelEl: HTMLElement | null) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - PANEL_MARGIN * 2);
  let left = rect.left;
  if (left + width > window.innerWidth - PANEL_MARGIN)
    left = window.innerWidth - PANEL_MARGIN - width;
  if (left < PANEL_MARGIN) left = PANEL_MARGIN;
  const height = panelEl?.offsetHeight || 0;
  const spaceBelow = window.innerHeight - rect.bottom - PANEL_MARGIN;
  const spaceAbove = rect.top - PANEL_MARGIN;
  let top = rect.bottom + PANEL_GAP;
  if (height > 0 && spaceBelow < height && spaceAbove > spaceBelow)
    top = rect.top - PANEL_GAP - height;
  if (height > 0)
    top = Math.max(PANEL_MARGIN, Math.min(top, window.innerHeight - PANEL_MARGIN - height));
  return { top, left, width };
}

export function CitationSources({
  items,
  onActivate,
}: {
  items: CiteItem[];
  onActivate?: (item: CiteItem) => void;
}) {
  const groups = groupCitations(items);
  const [open, setOpen] = useState<string | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const current = groups.find((group) => group.id === open) || null;

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const button = anchor.current;
      if (!button || !button.isConnected) {
        setOpen(null);
        return;
      }
      setBox(placePanel(button, panel.current));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, current?.items.length]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (root.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!groups.length) return null;
  const collapsed = items.length > 3;
  const direct = (item: CiteItem) => {
    const title = item.title || citationTitle(item.label);
    return (
      <button
        key={item.id}
        type="button"
        className="ref cite-source cite-direct"
        title={title}
        onClick={() => activateCitation(item, onActivate)}
      >
        <span className="cite-line">{title}</span>
      </button>
    );
  };
  return (
    <div className="references cite-sources" ref={root} aria-label="引用">
      {groups.map((group) =>
        !collapsed ? (
          group.items.map(direct)
        ) : (
          <button
            key={group.id}
            type="button"
            className="ref cite-source"
            aria-expanded={open === group.id}
            onClick={(event) => {
              if (open === group.id) {
                setOpen(null);
                return;
              }
              anchor.current = event.currentTarget;
              setBox(placePanel(event.currentTarget, null));
              setOpen(group.id);
            }}
          >
            {group.label}
            <span className="cite-count">{group.items.length}</span>
          </button>
        ),
      )}
      {current &&
        box &&
        createPortal(
          <div
            className="cite-panel"
            ref={panel}
            role="dialog"
            aria-label={current.label}
            style={{ top: box.top, left: box.left, width: box.width }}
          >
            {current.items.map((item, index) => {
              const title = item.title || citationTitle(item.label);
              return (
                <button
                  key={item.id}
                  type="button"
                  title={title}
                  onClick={() => {
                    activateCitation(item, onActivate);
                    setOpen(null);
                  }}
                >
                  <span className="cite-index">{index + 1}</span>
                  <span className="cite-line">{title}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
