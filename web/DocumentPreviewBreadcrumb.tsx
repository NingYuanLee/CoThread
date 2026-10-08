import { UiIcon } from "./ui-icon";

export function DocumentPreviewBreadcrumb({
  sourceLabel,
  filename,
  displayName,
  onReload,
  onShowInfo,
}: {
  sourceLabel: string;
  filename: string;
  displayName: string;
  onReload?: () => void;
  onShowInfo?: () => void;
}) {
  return (
    <nav className="doc-browser-preview-header" aria-label="文档路径">
      {/* 与 HTML 阅览的地址栏同款：左侧刷新、中间只读路径字段、右侧文件信息图标按钮。 */}
      {onReload ? (
        <button
          type="button"
          className="doc-browser-path-action"
          title="刷新"
          aria-label="刷新"
          onClick={onReload}
        >
          <UiIcon name="refresh" size={14} />
        </button>
      ) : null}
      <span className="doc-browser-path-field" title={filename}>
        <UiIcon name="folder" size={13} />
        <span className="doc-browser-preview-path">{sourceLabel}</span>
        <span className="doc-browser-preview-separator" aria-hidden="true">
          /
        </span>
        <strong className="doc-browser-preview-name">{displayName}</strong>
      </span>
      {onShowInfo ? (
        <button
          type="button"
          className="doc-browser-path-action"
          title="文件信息"
          aria-label="文件信息"
          onClick={onShowInfo}
        >
          <UiIcon name="info" size={14} />
        </button>
      ) : null}
    </nav>
  );
}
