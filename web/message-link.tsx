import type { ReactNode } from "react";
import { isPublicWebUrl } from "../shared/citations.js";

export function BrowserIcon() {
  return (
    <svg
      className="web-link-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.2 2.4 3.3 5.4 3.3 9S14.2 18.6 12 21" />
      <path d="M12 3C9.8 5.4 8.7 8.4 8.7 12s1.1 6.6 3.3 9" />
    </svg>
  );
}

export function MessageAnchor({
  href,
  children,
  cite = false,
}: {
  href?: string;
  children?: ReactNode;
  cite?: boolean;
}) {
  const web = isPublicWebUrl(href);
  const className =
    [cite ? "cite-mark" : "", web ? "web-link" : ""].filter(Boolean).join(" ") || undefined;
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {web ? <BrowserIcon /> : null}
      {children}
    </a>
  );
}
