export function DocumentPreviewBreadcrumb({
  sourceLabel,
  filename,
  displayName,
}: {
  sourceLabel: string;
  filename: string;
  displayName: string;
}) {
  return (
    <nav className="doc-browser-preview-header" aria-label="文档路径">
      <span className="doc-browser-preview-path">{sourceLabel}</span>
      <span className="doc-browser-preview-separator" aria-hidden="true">
        /
      </span>
      <strong className="doc-browser-preview-name" title={filename}>
        {displayName}
      </strong>
    </nav>
  );
}
