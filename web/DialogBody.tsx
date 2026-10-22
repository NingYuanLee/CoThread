import type { ReactNode } from "react";

/** Opt-in inset for plain content; structured panes keep their existing layout. */
export function DialogBody({ children }: { children: ReactNode }) {
  return <div className="dialog-plain-body">{children}</div>;
}
