export function CoThreadLogo({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden={title ? undefined : true} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <rect width="64" height="64" rx="13" fill="currentColor" />
      <path d="M44 19H29C20.7 19 14 25.7 14 34s6.7 15 15 15h15" stroke="var(--logo-ink, #F3F6EC)" strokeWidth="6" strokeLinecap="round" />
      <path d="M22 15v17c0 7.2 5.8 13 13 13s13-5.8 13-13V22" stroke="var(--logo-accent, #B7D295)" strokeWidth="6" strokeLinecap="round" />
      <path d="M18.5 23.3A15 15 0 0 1 29 19h8" stroke="var(--logo-ink, #F3F6EC)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="48" cy="16" r="3" fill="var(--logo-accent, #B7D295)" />
    </svg>
  );
}

export function PanelIcon({ side }: { side: "left" | "right" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={side === "left" ? "M9 4v16" : "M15 4v16"} />
    </svg>
  );
}

export function SidebarIcon({ kind }: { kind: "plus" | "monitor" | "project" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "monitor" ? (
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      ) : kind === "project" ? (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      ) : (
        <path d="M12 5v14M5 12h14" />
      )}
    </svg>
  );
}

export function ProjectActionIcon({
  action,
}: {
  action: "pin" | "unpin" | "import" | "close";
}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {action === "import" ? (
        <>
          <path d="M3 12h12m-4-4 4 4-4 4" />
          <path d="M10 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-9" />
        </>
      ) : action === "close" ? (
        <path d="m6 6 12 12M6 18 18 6" />
      ) : (
        <>
          <path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v6" />
          {action === "unpin" && <path d="m3 3 18 18" />}
        </>
      )}
    </svg>
  );
}
