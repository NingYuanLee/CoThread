import { UiIcon } from "./ui-icon";

export function DocumentReviewActions({
  showApprove,
  statusLabel,
  canBranch,
  pending,
  onApprove,
  onBranch,
}: {
  showApprove: boolean;
  statusLabel: string;
  canBranch: boolean;
  pending: boolean;
  onApprove: () => void;
  onBranch: () => void;
}) {
  return (
    <div className="library-review-actions">
      {showApprove ? (
        <button
          type="button"
          className="doc-browser-review-button"
          disabled={pending}
          title="确认当前版本"
          onClick={onApprove}
        >
          <UiIcon name="check" size={12} />
          草稿 · 确认
        </button>
      ) : statusLabel !== "已确认" ? (
        <span>{statusLabel}</span>
      ) : null}
      {canBranch ? (
        <button type="button" disabled={pending} title="基于此版本创建新版" onClick={onBranch}>
          <UiIcon name="branch" size={12} />
          改新版
        </button>
      ) : null}
    </div>
  );
}
