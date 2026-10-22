import { DialogFooter } from "./DialogFooter";
import { DialogBody } from "./DialogBody";
import { DialogHeader } from "./DialogHeader";
import { ModalBackdrop } from "./dialog-fx";
import { UiIcon } from "./ui-icon";

export function DeleteConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  confirmDisabled,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
  confirmDisabled: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalBackdrop className="library-organize-backdrop" onClose={onClose}>
      {(close) => (
        <section
          className="library-organize-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-delete-title"
        >
          <DialogHeader
            title={<>{title}</>}
            titleId="library-delete-title"
            onClose={close}
            closeLabel="关闭"
          />
          <DialogBody>
            <p>{body}</p>
          </DialogBody>
          <DialogFooter>
            <button type="button" onClick={close}>
              取消
            </button>
            <button
              type="button"
              className={danger ? "danger" : "primary"}
              onClick={onConfirm}
              disabled={confirmDisabled}
            >
              <UiIcon name="trash" size={13} />
              {confirmLabel}
            </button>
          </DialogFooter>
        </section>
      )}
    </ModalBackdrop>
  );
}
