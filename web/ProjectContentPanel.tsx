import React, { type ReactNode } from "react";
import { UiIcon } from "./ui-icon";

/**
 * 项目内容区的外壳：工具切换（文档阅览 / HTML阅览）、全屏按钮与内容容器。
 *
 * 从 Documents.tsx（文档库）里拆出来，让"容器"与"文档库内容"分属两个文件。
 * 不持有状态：工具选择、全屏、页签栏内容都由 Documents 传入；DOM 结构与拆分前一致。
 *
 * tabbar 是外壳中间那条页签栏槽位：文档阅览态传文档页签栏（含右键菜单、文档操作
 * 日志、文件树开合），HTML阅览态传浏览器页签栏。两种状态各自在 Documents 里成型，
 * 外壳只负责放在工具条与内容区之间。
 */
export function ProjectContentPanel({
  activeTool,
  onSelectFiles,
  onSelectBrowser,
  documentFullscreen,
  onToggleFullscreen,
  tabbar,
  explorer,
  mainPanel,
}: {
  activeTool: "files" | "browser";
  onSelectFiles: () => void;
  onSelectBrowser: () => void;
  documentFullscreen: boolean;
  onToggleFullscreen: () => void;
  tabbar: ReactNode;
  explorer: ReactNode;
  mainPanel: ReactNode;
}) {
  return (
    <>
      <nav className="doc-toolbar" aria-label="项目工具区">
        <button
          type="button"
          className={`doc-tool-button${activeTool === "files" ? " active" : ""}`}
          aria-pressed={activeTool === "files"}
          onClick={onSelectFiles}
        >
          <UiIcon name="library" size={14} />
          <span>文档阅览</span>
        </button>
        <button
          type="button"
          className={`doc-tool-button${activeTool === "browser" ? " active" : ""}`}
          aria-pressed={activeTool === "browser"}
          title="打开项目 HTML 浏览器"
          onClick={onSelectBrowser}
        >
          <UiIcon name="globe" size={14} />
          <span>HTML阅览</span>
        </button>
        <span className="doc-toolbar-spacer" aria-hidden="true" />
        <button
          type="button"
          className="doc-tool-button doc-fullscreen-button"
          aria-pressed={documentFullscreen}
          aria-label={documentFullscreen ? "退出全屏" : "全屏"}
          title={documentFullscreen ? "退出全屏" : "全屏"}
          onClick={onToggleFullscreen}
        >
          <UiIcon name={documentFullscreen ? "compress" : "expand"} size={14} />
          <span>{documentFullscreen ? "退出全屏" : "全屏"}</span>
        </button>
      </nav>
      {tabbar}
      <div className="library-body doc-browser-body">
        {explorer}
        {mainPanel}
      </div>
    </>
  );
}
