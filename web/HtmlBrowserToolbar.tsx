import { useState } from "react";
import { UiIcon } from "./ui-icon";

export type HtmlDeviceMode = "desktop" | "mobile";
export type HtmlBrowserFile = { id: string; filename: string; address: string };

export function HtmlBrowserToolbar({
  filename,
  files,
  addressQuery,
  onAddressQueryChange,
  onSelectFile,
  onReload,
  onOpenExternal,
  deviceMode,
  onDeviceModeChange,
}: {
  filename?: string;
  files: HtmlBrowserFile[];
  addressQuery: string;
  onAddressQueryChange: (value: string) => void;
  onSelectFile: (id: string) => void;
  onReload?: () => void;
  onOpenExternal?: () => void;
  deviceMode: HtmlDeviceMode;
  onDeviceModeChange: (mode: HtmlDeviceMode) => void;
}) {
  const [focused, setFocused] = useState(false);
  const query = addressQuery;
  const matches = files
    .filter(
      (file) =>
        !query.trim() ||
        `${file.address} ${file.filename} ${file.id}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .slice(0, 10);
  return (
    <div className="doc-html-browser-toolbar-shell">
      <div className="doc-html-browser-toolbar" role="toolbar" aria-label="HTML 浏览器工具栏">
        <button
          type="button"
          className="doc-html-browser-action"
          title="刷新页面"
          aria-label="刷新页面"
          onClick={onReload}
          disabled={!onReload}
        >
          <UiIcon name="refresh" size={14} />
        </button>
        <div className={`doc-html-browser-address-wrap${focused ? " focused" : ""}`}>
          <UiIcon name="search" size={13} />
          <input
            className="doc-html-browser-address-input"
            aria-label="搜索并选择 HTML 文件"
            placeholder="输入或搜索 HTML 文件"
            value={query}
            onFocus={(event) => {
              setFocused(true);
              if (event.currentTarget.value) event.currentTarget.select();
            }}
            onChange={(event) => onAddressQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches[0]) {
                event.preventDefault();
                onSelectFile(matches[0].id);
                setFocused(false);
              }
              if (event.key === "Escape") setFocused(false);
            }}
            title={filename || "搜索 HTML 文件"}
          />
          {focused ? (
            <div
              className="doc-html-browser-address-options"
              role="listbox"
              aria-label="HTML 文件候选"
            >
              {matches.length ? (
                matches.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    role="option"
                    aria-selected={file.address === addressQuery}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onSelectFile(file.id);
                      setFocused(false);
                    }}
                  >
                    <UiIcon name="code" size={13} />
                    <span>{file.address}</span>
                  </button>
                ))
              ) : (
                <span className="doc-html-browser-address-empty">没有匹配的 HTML 文件</span>
              )}
            </div>
          ) : null}
        </div>
        <div className="doc-html-device-controls" role="group" aria-label="预览设备">
          <button
            type="button"
            className={`doc-html-device-button${deviceMode === "desktop" ? " active" : ""}`}
            title="电脑模式"
            aria-label="电脑模式"
            aria-pressed={deviceMode === "desktop"}
            onClick={() => onDeviceModeChange("desktop")}
          >
            <UiIcon name="monitor" size={13} />
          </button>
          <button
            type="button"
            className={`doc-html-device-button${deviceMode === "mobile" ? " active" : ""}`}
            title="手机模式"
            aria-label="手机模式"
            aria-pressed={deviceMode === "mobile"}
            onClick={() => onDeviceModeChange("mobile")}
          >
            <UiIcon name="smartphone" size={13} />
          </button>
        </div>
        <button
          type="button"
          className="doc-html-browser-action"
          title="在电脑浏览器中打开"
          aria-label="在电脑浏览器中打开"
          onClick={onOpenExternal}
          disabled={!onOpenExternal}
        >
          <UiIcon name="share" size={14} />
        </button>
      </div>
    </div>
  );
}
