import type { MouseEvent, ReactNode } from "react";

export type DocumentTabListItem = {
  id: string;
  label: string;
  icon: ReactNode;
  title?: string;
};

export function DocumentTabList({
  tabs,
  selected,
  onSelect,
  onClose,
  onContextMenu,
  ariaLabel = "打开的文档",
  emptyLabel = "从文件树选择文档",
  suffix,
}: {
  tabs: DocumentTabListItem[];
  selected: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onContextMenu?: (event: MouseEvent, id: string) => void;
  ariaLabel?: string;
  emptyLabel?: string | null;
  suffix?: ReactNode;
}) {
  return (
    <div className="doc-browser-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <span
          key={tab.id}
          className={`doc-browser-tab${selected === tab.id ? " active" : ""}`}
          role="presentation"
          onContextMenu={onContextMenu ? (event) => onContextMenu(event, tab.id) : undefined}
        >
          <button
            type="button"
            role="tab"
            aria-selected={selected === tab.id}
            className="doc-browser-tab-open"
            title={tab.title || tab.label}
            onClick={() => onSelect(tab.id)}
          >
            {tab.icon}
            <span className="doc-browser-tab-label">{tab.label}</span>
          </button>
          <button
            type="button"
            className="doc-browser-tab-close"
            aria-label={`关闭 ${tab.label}`}
            title="关闭"
            onClick={() => onClose(tab.id)}
          >
            ×
          </button>
        </span>
      ))}
      {!tabs.length && emptyLabel ? (
        <span className="doc-browser-tabs-empty">{emptyLabel}</span>
      ) : null}
      {suffix}
    </div>
  );
}
