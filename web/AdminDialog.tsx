import { DialogFooter } from "./DialogFooter";
import { DialogHeader, type DialogHeaderProps } from "./DialogHeader";
import { useId, type ReactNode } from "react";
import { ModalBackdrop } from "./dialog-fx";

export function AdminDialog({
  title,
  onClose,
  busy = false,
  children,
  subtitle,
  icon,
  leftExtra,
  actions,
  footer,
  footerPagination = false,
  className = "",
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
  footer?: ReactNode;
  footerPagination?: boolean;
  className?: string;
} & Pick<DialogHeaderProps, "subtitle" | "icon" | "leftExtra" | "actions">) {
  const titleId = useId();

  return (
    <ModalBackdrop onClose={onClose} enabled={!busy}>
      {(close) => {
        const content = typeof children === "function" ? children(close) : children;
        return (
          <section
            className={`modal admin-dialog ${className}`.trim()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <DialogHeader
              subtitle={subtitle}
              icon={icon}
              leftExtra={leftExtra}
              actions={actions}
              title={<>{title}</>}
              titleId={titleId}
              onClose={close}
              disabled={busy}
              closeLabel="关闭"
            />
            <div className="admin-dialog-body">{content}</div>
            {footer != null && <DialogFooter pagination={footerPagination}>{footer}</DialogFooter>}
          </section>
        );
      }}
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
      <AdminDialog
        className="admin-confirm-dialog"
        title={confirmation.title}
        onClose={onClose}
        busy={busy}
      >
        {(close) => (
          <>
            <div className="dialog-form-scroll">
              <p>{confirmation.message}</p>
            </div>
            <DialogFooter>
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
            </DialogFooter>
          </>
        )}
      </AdminDialog>
    )
  );
}
