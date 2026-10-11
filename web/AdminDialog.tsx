import { useEffect, useId, useRef, type ReactNode } from "react";
import { DialogClose, ModalBackdrop } from "./dialog-fx";

export function AdminDialog({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      (
        dialog.querySelector("input:not([disabled]), button:not([disabled])") as HTMLElement | null
      )?.focus();
    }
    return () => {
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, []);
  return (
    <ModalBackdrop onClose={onClose} enabled={!busy}>
      {(close) => (
        <section
          ref={dialogRef}
          className="modal admin-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const nodes = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]",
              ),
            );
            const first = nodes[0],
              last = nodes.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <header className="modal-header">
            <h2 id={titleId}>{title}</h2>
            <DialogClose onClick={close} disabled={busy} label="关闭" />
          </header>
          <div className="admin-dialog-body">
            {typeof children === "function" ? children(close) : children}
          </div>
        </section>
      )}
    </ModalBackdrop>
  );
}

export type AdminConfirmation = { title: string; message: string; confirm: () => Promise<void> };

export function AdminConfirmDialog({
  confirmation,
  onClose,
  busy,
  run,
}: {
  confirmation: AdminConfirmation | null;
  onClose: () => void;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
}) {
  return (
    confirmation && (
      <AdminDialog title={confirmation.title} onClose={onClose} busy={busy}>
        {(close) => (
          <>
            <p>{confirmation.message}</p>
            <div className="admin-editor-actions">
              <button disabled={busy} onClick={close}>
                取消
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await confirmation.confirm();
                    onClose();
                  })
                }
              >
                确认
              </button>
            </div>
          </>
        )}
      </AdminDialog>
    )
  );
}
