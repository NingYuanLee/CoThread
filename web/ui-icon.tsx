import React from "react";

export type UiIconName =
  | "abandon"
  | "archive"
  | "blocked"
  | "book"
  | "chat"
  | "check"
  | "checkCircle"
  | "clock"
  | "close"
  | "code"
  | "complete"
  | "compress"
  | "connector"
  | "copy"
  | "detail"
  | "download"
  | "edit"
  | "email"
  | "expand"
  | "eye"
  | "failed"
  | "filter"
  | "folder"
  | "history"
  | "human"
  | "inbox"
  | "info"
  | "iteration"
  | "key"
  | "layers"
  | "layout"
  | "library"
  | "list"
  | "lock"
  | "login"
  | "logout"
  | "megaphone"
  | "members"
  | "mention"
  | "next"
  | "offline"
  | "online"
  | "organize"
  | "palette"
  | "pause"
  | "play"
  | "plugin"
  | "plus"
  | "prev"
  | "preview"
  | "project"
  | "refresh"
  | "reject"
  | "restore"
  | "running"
  | "save"
  | "search"
  | "send"
  | "server"
  | "session"
  | "settings"
  | "shield"
  | "skill"
  | "sparkle"
  | "star"
  | "stop"
  | "task"
  | "trajectory"
  | "transfer"
  | "trash"
  | "unbound"
  | "upload"
  | "userPlus"
  | "waiting"
  | "warning"
  | "zoomIn"
  | "zoomOut";

const GLYPHS: Record<UiIconName, string[]> = {
  abandon: ["M5 4v16", "M5 5h9l-1.5 4L14 13H5"],
  archive: ["M3 7h18v3H3z", "M5 10v10h14V10", "M10 14h4"],
  blocked: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m8 8 8 8"],
  book: ["M4 5h7v14H5a1 1 0 0 1-1-1V5Z", "M20 5h-7v14h6a1 1 0 0 0 1-1V5Z"],
  chat: ["M4 5h16v10H8l-4 4V5Z"],
  check: ["m5 12 5 5 9-10"],
  checkCircle: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m8 12 3 3 5-6"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 7v5l3 2"],
  close: ["m6 6 12 12M6 18 18 6"],
  code: ["m8 8-4 4 4 4", "m16 8 4 4-4 4"],
  complete: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m8 12 3 3 5-6"],
  compress: ["M8 4H4v4", "M16 4h4v4", "M8 20H4v-4", "M16 20h4v-4", "M9 9h6v6H9z"],
  connector: ["M8 12h8M9 8V5m6 3V5M7 8h10v5a5 5 0 0 1-10 0V8Z", "M12 18v3"],
  copy: ["M8 8h11v11H8z", "M5 16V5h11"],
  detail: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9Z", "M14 3v6h6", "M9 13h6M9 17h4"],
  download: ["M12 4v12", "m7 12 5 5 5-5", "M5 20h14"],
  edit: ["M4 20h7", "M14.5 5.5 18.5 9.5 8 20H4v-4Z"],
  email: ["M4 6h16v12H4z", "m4 7 8 6 8-6"],
  expand: ["M9 4H4v5", "M15 4h5v5", "M9 20H4v-5", "M15 20h5v-5"],
  eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
  failed: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m9 9 6 6m0-6-6 6"],
  filter: ["M4 6h16l-6 7v5l-4 2v-7L4 6Z"],
  folder: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"],
  history: ["M12 8v5l3 2", "M21 12a9 9 0 1 1-2.6-6.35", "M21 4v6h-6"],
  human: ["M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z", "M5 20a7 7 0 0 1 14 0"],
  inbox: ["M4 8h16v12H4z", "M4 14h4l1.5 2h5L16 14h4"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 11v6M12 8h.01"],
  iteration: ["M7 7h11v11H7z", "M5 5h11v11"],
  key: ["M13 13a5 5 0 1 0-2.8 1L14 18h3v-3h2v-2l-6-0Z"],
  layers: ["M12 3 3 8l9 5 9-5-9-5Z", "M3 14l9 5 9-5"],
  layout: ["M4 5h16v14H4z", "M10 5v14M4 11h16"],
  library: ["M4 5h3v15H4z", "M9 5h3v15H9z", "M14 7l6-1v15l-6 1V7Z"],
  list: ["M8 7h12M8 12h12M8 17h12", "M4 7h.01M4 12h.01M4 17h.01"],
  lock: ["M8 11V8a4 4 0 0 1 8 0v3", "M6 11h12v10H6z"],
  login: ["M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4", "M10 17l5-5-5-5", "M15 12H3"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  megaphone: ["M4 10v4h3l6 4V6L7 10H4Z", "M16.5 8.5a4 4 0 0 1 0 7"],
  members: ["M16 12a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 16 12Z", "M8.5 13a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z", "M2.5 20a5 5 0 0 1 10 0", "M13 20a5.5 5.5 0 0 1 8.5 0"],
  mention: ["M16.5 12a4.5 4.5 0 1 1-1.3-3.2", "M16.5 12v1.2a1.8 1.8 0 0 0 3.6 0V12a8 8 0 1 0-3.2 6.4"],
  next: ["m9 6 6 6-6 6"],
  offline: ["M8 12h8M9 8V5m6 3V5M7 8h10v5a5 5 0 0 1-10 0V8Z", "M12 18v3", "m5 5 14 14"],
  online: ["M8 12h8M9 8V5m6 3V5M7 8h10v5a5 5 0 0 1-10 0V8Z", "M12 18v3"],
  organize: ["M12 3.5 13.5 8.5 18.5 10 13.5 11.5 12 16.5 10.5 11.5 5.5 10 10.5 8.5Z", "M18 15.5 18.7 17.4 20.6 18.1 18.7 18.8 18 20.7 17.3 18.8 15.4 18.1 17.3 17.4Z"],
  palette: ["M12 3a9 9 0 0 0 0 18h.5a2.5 2.5 0 0 0 2.4-3.2 2 2 0 0 1 1.8-2.8H17a5 5 0 0 0 0-10 9 9 0 0 0-5-2Z", "M8 10.5h.01M10.5 7.5h.01M14.5 7.5h.01M7.5 13.5h.01"],
  pause: ["M8 6h3v12H8zM13 6h3v12h-3z"],
  play: ["M8 6v12l10-6Z"],
  plugin: ["M9 4v3H6a2 2 0 0 0-2 2v3h3v2H4v3a2 2 0 0 0 2 2h3v-3h2v3h3a2 2 0 0 0 2-2v-3h-3v-2h3V9a2 2 0 0 0-2-2h-3V4H9Z"],
  plus: ["M12 5v14M5 12h14"],
  prev: ["m15 6-6 6 6 6"],
  preview: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
  project: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z", "M3 11h18"],
  refresh: ["M21 12a9 9 0 1 1-2.6-6.35", "M21 4v6h-6"],
  reject: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m9 9 6 6m0-6-6 6"],
  restore: ["M4 12a8 8 0 1 0 2.3-5.7", "M4 4v6h6"],
  running: ["M12 3a9 9 0 1 1-9 9", "M12 7v5l3 2"],
  save: ["M5 4h11l3 3v13H5z", "M8 4v5h8V4", "M8 13h8v7H8z"],
  search: ["M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z", "m16 16 4 4"],
  send: ["M22 2 11 13", "M22 2 15 22 11 13 2 9Z"],
  server: ["M4 5h16v6H4z", "M4 13h16v6H4z", "M8 8h.01M8 16h.01"],
  session: ["M4 5h16v10H8l-4 4V5Z", "M8 10h8"],
  settings: ["M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "M19.4 15a7.8 7.8 0 0 0 .1-2l2-1.1-2-3.5-2.2.5a7.7 7.7 0 0 0-1.7-1L15 5h-6l-.6 2.4a7.7 7.7 0 0 0-1.7 1L8.5 8.4l-2 3.5 2 1.1a7.8 7.8 0 0 0 .1 2l-2 1.1 2 3.5 2.2-.5a7.7 7.7 0 0 0 1.7 1L9 19h6l.6-2.4a7.7 7.7 0 0 0 1.7-1l2.2.5 2-3.5Z"],
  shield: ["M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z"],
  skill: ["M12 3 13.6 8.4 19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6Z"],
  sparkle: ["M12 3 13.6 8.4 19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6Z", "M19 15l.7 1.8L21.5 17.5 19.7 18.2 19 20l-.7-1.8L16.5 17.5l1.8-.7Z"],
  star: ["M12 3 14.5 9.5 21.5 10.2 16.3 14.8 18 21.5 12 18 6 21.5 7.7 14.8 2.5 10.2 9.5 9.5Z"],
  stop: ["M7 7h10v10H7z"],
  task: ["M9 6h11v14H4V6h3", "M8 4h4v3H8z", "m8 13 2 2 5-5"],
  trajectory: ["M3 12h5l2.5-7 4 14 2.5-7H21"],
  transfer: ["M7 8H3l4-4", "M3 8h12a5 5 0 0 1 5 5", "M17 16h4l-4 4", "M21 16H9a5 5 0 0 1-5-5"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M7 7l1 13h8l1-13"],
  unbound: ["M9 8H7a4 4 0 0 0 0 8h2", "M15 8h2a4 4 0 0 1 0 8h-2", "m6 6 12 12"],
  upload: ["M12 16V4", "M8 8l4-4 4 4", "M5 20h14"],
  userPlus: ["M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z", "M4 20a8 8 0 0 1 10-7.7", "M17 14v6M14 17h6"],
  waiting: ["M8 6h3v12H8zM13 6h3v12h-3z"],
  warning: ["M12 4 3 20h18L12 4Z", "M12 10v5M12 17h.01"],
  zoomIn: ["M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z", "m21 21-4.35-4.35", "M10.5 7.5v6M7.5 10.5h6"],
  zoomOut: ["M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z", "m21 21-4.35-4.35", "M7.5 10.5h6"],
};

const ROLE_ICONS: Record<string, UiIconName> = {
  管理: "shield",
  运营: "megaphone",
  设计: "palette",
  产品: "layers",
  前端: "layout",
  后端: "server",
  L1: "book",
  项目知识库: "library",
  创建人: "star",
  只读: "eye",
  在线: "online",
  离线: "offline",
  未绑定本项目: "unbound",
};

const WORKFLOW_ICONS: Record<string, UiIconName> = {
  pending_assignment: "clock",
  awaiting_acceptance: "waiting",
  pending_start: "play",
  assigned: "human",
  queued: "clock",
  waiting: "pause",
  blocked: "blocked",
  running: "running",
  completed: "checkCircle",
  failed: "failed",
  cancelled: "close",
  rejected: "reject",
  abandoned: "abandon",
  superseded: "transfer",
  awaiting_approval: "clock",
  paused: "pause",
  stopped_pending_approval: "pause",
  completed_pending_notification: "checkCircle",
  failed_pending_notification: "failed",
  interrupted: "warning",
};

export function roleIcon(role: string): UiIconName | null {
  return ROLE_ICONS[role] || null;
}

export function workflowIcon(status: string): UiIconName {
  return WORKFLOW_ICONS[status] || "info";
}

export function UiIcon({
  name,
  size = 14,
  className,
}: {
  name: UiIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `ui-icon ${className}` : "ui-icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
