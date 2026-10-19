/**
 * 文档树里的代码库根节点。
 * 数据与回调由 Documents 打包成 props 传入。
 */
import {
  type ComponentProps,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from "react";
import { OfficialFolderMenu } from "./document-context-menus";
import { ClosedFolderIcon, TreeDepth, TreeOverflowLabel } from "./document-icons";
import { FolderToggle } from "./document-view-internals";
import {
  CODE_LIBRARY_ROOT_ID,
  CODE_LIBRARY_ROOT_NAME,
  CODE_PLATFORM_ICONS,
  codeLibraryEntries,
} from "./document-labels";
import { UiIcon } from "./ui-icon";

export type CodeLibraryRootProps = {
  collapsed: Set<string>;
  setCollapsed: Dispatch<SetStateAction<Set<string>>>;
  setCodeGuideId: Dispatch<SetStateAction<string | null>>;
  codeEntries: ReturnType<typeof codeLibraryEntries>;
  openCodeFolderMenu: (event: ReactMouseEvent, menuId: string) => void;
  toggleFolder: (id: string) => void;
  codeFolderMenuProps: (menuId: string) => ComponentProps<typeof OfficialFolderMenu>;
};

export function CodeLibraryRoot({
  collapsed,
  setCodeGuideId,
  codeEntries,
  openCodeFolderMenu,
  toggleFolder,
  codeFolderMenuProps,
}: CodeLibraryRootProps) {
  return (
    <div
      key={CODE_LIBRARY_ROOT_ID}
      role="treeitem"
      aria-expanded={!collapsed.has(CODE_LIBRARY_ROOT_ID)}
    >
      <div
        className="tree-folder tree-library-root tree-code-library-root"
        onContextMenu={(event) => openCodeFolderMenu(event, CODE_LIBRARY_ROOT_ID)}
      >
        <FolderToggle
          name={CODE_LIBRARY_ROOT_NAME}
          expanded={!collapsed.has(CODE_LIBRARY_ROOT_ID)}
          onToggle={() => toggleFolder(CODE_LIBRARY_ROOT_ID)}
        />
        <button
          type="button"
          className="tree-name"
          data-tooltip="false"
          aria-label={CODE_LIBRARY_ROOT_NAME}
          onClick={() => toggleFolder(CODE_LIBRARY_ROOT_ID)}
        >
          <TreeOverflowLabel text={CODE_LIBRARY_ROOT_NAME} />
        </button>
        <span className="tree-root-actions tree-row-actions">
          <OfficialFolderMenu
            {...codeFolderMenuProps(CODE_LIBRARY_ROOT_ID)}
            onExplain={() => setCodeGuideId(CODE_LIBRARY_ROOT_ID)}
          />
        </span>
      </div>
      {!collapsed.has(CODE_LIBRARY_ROOT_ID) ? (
        <div role="group">
          {codeEntries.map((entry) =>
            entry.type === "orphan" ? (
              <div key={entry.id} role="treeitem">
                <div
                  className="tree-folder tree-code-source-folder tree-code-leaf"
                  onContextMenu={(event) => openCodeFolderMenu(event, entry.id)}
                >
                  <TreeDepth depth={1} />
                  <span className="tree-code-leaf-icon" aria-hidden="true">
                    <ClosedFolderIcon />
                  </span>
                  <button
                    type="button"
                    className="tree-name"
                    data-tooltip="false"
                    aria-label={entry.name}
                    onClick={() => setCodeGuideId(entry.id)}
                  >
                    <TreeOverflowLabel text={entry.name} />
                  </button>
                  <span className="tree-root-actions tree-row-actions">
                    <OfficialFolderMenu
                      {...codeFolderMenuProps(entry.id)}
                      onExplain={() => setCodeGuideId(entry.id)}
                    />
                  </span>
                </div>
              </div>
            ) : (
              <div key={entry.id} role="treeitem" aria-expanded={!collapsed.has(entry.id)}>
                <div
                  className="tree-folder tree-code-source-folder"
                  onContextMenu={(event) => openCodeFolderMenu(event, entry.id)}
                >
                  <TreeDepth depth={1} />
                  <FolderToggle
                    name={entry.name}
                    expanded={!collapsed.has(entry.id)}
                    onToggle={() => toggleFolder(entry.id)}
                    icon={<UiIcon name={CODE_PLATFORM_ICONS[entry.platform]} size={16} />}
                  />
                  <button
                    type="button"
                    className="tree-name"
                    data-tooltip="false"
                    aria-label={entry.name}
                    onClick={() => toggleFolder(entry.id)}
                  >
                    <TreeOverflowLabel text={entry.name} />
                  </button>
                  <span className="tree-root-actions tree-row-actions">
                    <OfficialFolderMenu
                      {...codeFolderMenuProps(entry.id)}
                      onExplain={() => setCodeGuideId(entry.id)}
                    />
                  </span>
                </div>
                {!collapsed.has(entry.id) ? (
                  <div role="group" className="tree-code-source-notes">
                    {entry.remotes.map((remote) => (
                      <div key={remote.id} role="treeitem">
                        <div
                          className="tree-folder tree-code-source-folder tree-code-leaf"
                          onContextMenu={(event) => openCodeFolderMenu(event, remote.id)}
                        >
                          <TreeDepth depth={2} />
                          <span className="tree-code-leaf-icon" aria-hidden="true">
                            <ClosedFolderIcon />
                          </span>
                          <button
                            type="button"
                            className="tree-name"
                            data-tooltip="false"
                            aria-label={remote.name}
                            onClick={() => setCodeGuideId(remote.id)}
                          >
                            <TreeOverflowLabel text={remote.name} />
                          </button>
                          <span className="tree-root-actions tree-row-actions">
                            <OfficialFolderMenu
                              {...codeFolderMenuProps(remote.id)}
                              onExplain={() => setCodeGuideId(remote.id)}
                            />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
