import type { ReactNode } from "react";

/**
 * 项目内容区的外壳：页签栏槽位与内容容器。
 *
 * 从 Documents.tsx（文档库）里拆出来，让"容器"与"文档库内容"分属两个文件。
 * 不持有状态：页签栏内容、文件树、主内容都由 Documents 传入。
 *
 * tabbar 是外壳中间那条页签栏槽位：文档阅览与 HTML 阅览共用同一条页签栏（文档页签在前、
 * HTML 页签在后，末尾依次是新建 HTML 页签的加号、文档操作日志、文件树开合与全屏图标），
 * 由 Documents 成型后整体传入。外壳只负责放在内容区之上。
 */
export function ProjectContentPanel({
  tabbar,
  explorer,
  mainPanel,
}: {
  tabbar: ReactNode;
  explorer: ReactNode;
  mainPanel: ReactNode;
}) {
  return (
    <>
      {tabbar}
      <div className="library-body doc-browser-body">
        {explorer}
        {mainPanel}
      </div>
    </>
  );
}
