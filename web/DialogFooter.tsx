import type { ReactNode } from "react";

/** A non-scrolling edge-to-edge action bar. Only its contents have an inset. */
export function DialogFooter({
  children,
  left,
  pagination = false,
}: {
  children: ReactNode;
  left?: ReactNode;
  pagination?: boolean;
}) {
  return (
    <footer className="dialog-footer">
      {left != null && <div className="dialog-footer-left">{left}</div>}
      <div className={pagination ? "dialog-footer-pagination" : "dialog-footer-actions"}>
        {children}
      </div>
    </footer>
  );
}
