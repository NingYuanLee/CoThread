import { RIGHT_SIDEBAR_MODE_UI, rightSidebarModeFromDialogue } from "../shared/dialogue-mode.js";
import { UiIcon, type UiIconName } from "./ui-icon";
import type { DialogueMode } from "./dialogue-mode-storage";

export function ContextPanelModeSwitch({
  dialogueMode,
  onSelect,
  documentFullscreen = false,
  onDocumentFullscreenChange,
}: {
  dialogueMode: DialogueMode;
  onSelect: (mode: "standard" | "cloudbase") => void;
  documentFullscreen?: boolean;
  onDocumentFullscreenChange?: (fullscreen: boolean) => void;
}) {
  const active = rightSidebarModeFromDialogue(dialogueMode);
  return (
    <div className="context-panel-mode-bar workspace-top-strip">
      <nav className="conversation-views context-panel-mode-views" role="tablist" aria-label="右侧栏模式">
        <button
          type="button"
          role="tab"
          className="conversation-view"
          aria-selected={active === "standard"}
          onClick={() => onSelect("standard")}
        >
          <UiIcon name={RIGHT_SIDEBAR_MODE_UI.standard.icon as UiIconName} size={13} />
          {RIGHT_SIDEBAR_MODE_UI.standard.label}
        </button>
        <button
          type="button"
          role="tab"
          className="conversation-view"
          aria-selected={active === "cloudbase"}
          onClick={() => onSelect("cloudbase")}
        >
          <UiIcon name={RIGHT_SIDEBAR_MODE_UI.cloudbase.icon as UiIconName} size={13} />
          {RIGHT_SIDEBAR_MODE_UI.cloudbase.label}
        </button>
      </nav>
      {onDocumentFullscreenChange ? (
        <button
          type="button"
          className={`doc-browser-tree-toggle doc-browser-fullscreen-toggle context-panel-fullscreen-toggle${documentFullscreen ? " active" : ""}`}
          aria-pressed={documentFullscreen}
          aria-label={documentFullscreen ? "退出全屏" : "全屏"}
          title={documentFullscreen ? "退出全屏" : "全屏"}
          onClick={() => onDocumentFullscreenChange(!documentFullscreen)}
        >
          <UiIcon name={documentFullscreen ? "compress" : "expand"} size={15} />
        </button>
      ) : null}
    </div>
  );
}
