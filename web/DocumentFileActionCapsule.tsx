import { UiIcon } from "./ui-icon";

export function DocumentFileActionCapsule({
  supportsPreview,
  supportsSource,
  isPreviewActive,
  isSourceActive,
  isPlainTextActive,
  onPreview,
  onSource,
  onPlainText,
}: {
  supportsPreview: boolean;
  supportsSource: boolean;
  isPreviewActive: boolean;
  isSourceActive: boolean;
  isPlainTextActive: boolean;
  onPreview: () => void;
  onSource: () => void;
  onPlainText: () => void;
}) {
  return (
    <span className="doc-view-mode" role="group" aria-label="文件操作">
      {supportsPreview ? (
        <button
          type="button"
          className={isPreviewActive ? "active" : ""}
          aria-pressed={isPreviewActive}
          onClick={onPreview}
        >
          <UiIcon name="preview" size={12} />
          预览
        </button>
      ) : null}
      {supportsSource ? (
        <button
          type="button"
          className={isSourceActive ? "active" : ""}
          aria-pressed={isSourceActive}
          onClick={onSource}
        >
          <UiIcon name="code" size={12} />
          源码
        </button>
      ) : null}
      {supportsSource ? (
        <button
          type="button"
          className={isPlainTextActive ? "active" : ""}
          aria-pressed={isPlainTextActive}
          onClick={onPlainText}
        >
          <UiIcon name="list" size={12} />
          纯文本
        </button>
      ) : null}
    </span>
  );
}
