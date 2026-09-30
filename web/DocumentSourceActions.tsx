import { UiIcon } from "./ui-icon";

export function DocumentSourceActions({
  sourceId,
  buttonLabel,
  deletedLabel,
  pending,
  onSelect,
}: {
  sourceId?: string;
  buttonLabel: string;
  deletedLabel: string;
  pending: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="doc-browser-source-actions">
      {sourceId ? (
        <button
          type="button"
          className="doc-browser-source-button"
          disabled={pending}
          onClick={() => onSelect(sourceId)}
        >
          <UiIcon name="preview" size={12} />
          {buttonLabel}
        </button>
      ) : (
        <span className="doc-browser-source-button is-disabled">{deletedLabel}</span>
      )}
    </div>
  );
}
