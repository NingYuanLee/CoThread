/**
 * 文档库页签栏：打开的文档与 HTML 页签、新建入口与文件树开关。
 * 数据与回调由 Documents 打包成 props 传入。
 */
import { type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from "react";
import { DocumentTabList, type DocumentTabListItem } from "./DocumentTabList";
import { TabContextMenu, type TabMenuItem } from "./document-context-menus";
import { ClosedFolderIcon, OpenFolderIcon } from "./document-icons";
import { START_TAB_ID, type BrowserTab } from "./document-view-internals";
import { UiIcon } from "./ui-icon";

export type DocumentsTabbarProps = {
  openTabs: string[];
  setOpenTabs: Dispatch<SetStateAction<string[]>>;
  browserTabs: BrowserTab[];
  setBrowserTabs: Dispatch<SetStateAction<BrowserTab[]>>;
  startOpen: boolean;
  activeTabId: string | null;
  treeToggleActive: boolean;
  tabMenu: { id: string; x: number; y: number } | null;
  setTabMenu: Dispatch<SetStateAction<{ id: string; x: number; y: number } | null>>;
  tabMenuItems: TabMenuItem[];
  newTabMenu: { x: number; y: number } | null;
  setNewTabMenu: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  contentTabs: DocumentTabListItem[];
  openContentTabContextMenu: (event: ReactMouseEvent, id: string) => void;
  selectContentTab: (id: string) => void;
  closeContentTab: (id: string) => void;
  createBrowserNewTab: () => void;
  openDocumentTree: () => void;
  toggleTree: () => void;
};

export function DocumentsTabbar({
  openTabs,
  browserTabs,
  startOpen,
  activeTabId,
  treeToggleActive,
  tabMenu,
  setTabMenu,
  tabMenuItems,
  newTabMenu,
  setNewTabMenu,
  contentTabs,
  openContentTabContextMenu,
  selectContentTab,
  closeContentTab,
  createBrowserNewTab,
  openDocumentTree,
  toggleTree,
}: DocumentsTabbarProps) {
  return (
    <div
      className="doc-browser-tabbar"
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest(".doc-browser-tab")) return;
        // 空白处右键：优先当前页签，否则退回最后一个页签；一个页签都没有就不弹菜单。
        const fallback =
          openTabs[openTabs.length - 1] ??
          browserTabs[browserTabs.length - 1]?.key ??
          (startOpen ? START_TAB_ID : null);
        const id = activeTabId ?? fallback;
        if (!id) return;
        openContentTabContextMenu(event, id);
      }}
    >
      <DocumentTabList
        ariaLabel="打开的文档与 HTML 页签"
        emptyLabel={null}
        tabs={contentTabs}
        selected={activeTabId}
        onSelect={selectContentTab}
        onClose={closeContentTab}
        onContextMenu={openContentTabContextMenu}
        suffix={
          startOpen ? null : (
            <button
              type="button"
              className="doc-browser-new-tab"
              aria-label={treeToggleActive ? "打开新HTML阅览页" : "新建"}
              aria-haspopup={treeToggleActive ? undefined : "menu"}
              aria-expanded={newTabMenu ? true : undefined}
              title={treeToggleActive ? "打开新HTML阅览页" : "新建"}
              onClick={(event) => {
                if (treeToggleActive) {
                  setNewTabMenu(null);
                  createBrowserNewTab();
                  return;
                }
                setNewTabMenu({ x: event.clientX, y: event.clientY });
              }}
            >
              <UiIcon name="plus" size={16} />
            </button>
          )
        }
      />
      {tabMenu && tabMenuItems.length ? (
        <TabContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          items={tabMenuItems}
          onDismiss={() => setTabMenu(null)}
        />
      ) : null}
      {newTabMenu ? (
        <TabContextMenu
          x={newTabMenu.x}
          y={newTabMenu.y}
          className="doc-browser-new-tab-menu"
          onDismiss={() => setNewTabMenu(null)}
          items={[
            {
              key: "tree",
              label: "打开文件树",
              icon: "folder",
              onRun: openDocumentTree,
            },
            {
              key: "html",
              label: "打开新HTML阅览页",
              icon: "globe",
              onRun: createBrowserNewTab,
            },
          ]}
        />
      ) : null}
      <button
        type="button"
        className={`doc-browser-tree-toggle${treeToggleActive ? " active" : ""}`}
        title={treeToggleActive ? "隐藏文件树" : "显示文件树"}
        aria-label={treeToggleActive ? "隐藏文件树" : "显示文件树"}
        aria-pressed={treeToggleActive}
        onClick={toggleTree}
      >
        {treeToggleActive ? <OpenFolderIcon /> : <ClosedFolderIcon />}
      </button>
    </div>
  );
}
