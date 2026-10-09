import React, { useState } from "react";
import { UiIcon } from "./ui-icon";
import { showTip } from "./Tip";
import { SidebarIcon } from "./workspace-chrome";
import { DialogClose, ModalBackdrop } from "./dialog-fx";

export type ConnectorDevice = {
  id: string; name: string; platform: string; version: string; online: number;
  last_seen_at: string | null; projects: { projectId: string; policy: "unrestricted" | "style_only" | "layout_style"; allowGitPush: boolean }[];
};

export type AvailableConnector = {
  projectId: string;
  id: string;
  name: string;
  platform?: string;
  ownerId: string;
  ownerName: string;
  policy: "unrestricted" | "style_only" | "layout_style";
  allowGitPush: boolean;
};

export function connectorHostLabel(name?: string | null) {
  const value = String(name || "").trim();
  if (!value || value === "Windows 连接器" || value === "Windows 本地执行器") return "本机";
  return value;
}

export function connectorOsLabel(platform?: string | null) {
  const value = String(platform || "").trim();
  if (!value) return "未知系统";
  if (/^windows$/i.test(value)) return "Windows";
  if (/^darwin$|^macos$/i.test(value)) return "macOS";
  if (/^linux$/i.test(value)) return "Linux";
  return value;
}

export function ConnectorPanel({
  devices,
  availability,
  projectId,
  currentUserId,
  available,
  api,
  onRefresh,
  variant = "composer",
}: {
  devices: ConnectorDevice[];
  availability: AvailableConnector[];
  projectId: string;
  currentUserId: string;
  available: boolean;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  onRefresh: () => Promise<void>;
  variant?: "composer" | "sidebar";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const ownById = new Map(devices.map((device) => [device.id, device]));
  const projectOnline = availability.filter((item) => item.projectId === projectId);
  const listedIds = new Set(projectOnline.map((item) => item.id));
  const rows = [
    ...projectOnline.map((item) => {
      const own = ownById.get(item.id);
      return {
        id: item.id,
        name: own?.name || item.name,
        platform: item.platform || own?.platform || "",
        ownerId: item.ownerId,
        ownerName: item.ownerName,
      };
    }),
    ...devices.filter((device) => device.online && !listedIds.has(device.id)).map((device) => ({
      id: device.id,
      name: device.name,
      platform: device.platform,
      ownerId: currentUserId,
      ownerName: "",
    })),
  ];
  const act = async (fn: () => Promise<void>, success?: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (success) showTip(success);
    } catch (cause) {
      const detail = (cause as Error).message;
      setError(detail);
      showTip(detail, "error");
    }
    finally { setBusy(false); }
  };
  const sidebar = variant === "sidebar";
  const closePanel = () => {
    setConfirmId("");
    setOpen(false);
  };
  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setError("");
      setConfirmId("");
      void onRefresh();
    } else setConfirmId("");
  };
  const dialog = open ? (
    <ModalBackdrop className="connector-panel-backdrop" onClose={closePanel} enabled={!busy}>
      {(close) => (
        <section
          className="connector-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="connector-panel-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header>
            <div>
              <small>本地执行器</small>
              <h2 id="connector-panel-title">在线本地执行器</h2>
            </div>
            <DialogClose autoFocus onClick={close} label="关闭本地执行器" />
          </header>
          <section>
            {!rows.length && <p className="muted">当前没有在线本地执行器</p>}
            {rows.map((row) => (
              <div className="connector-device-block" key={row.id}>
                <div className="connector-device">
                  <i className="online" aria-hidden="true" />
                  <span>
                    <strong>{connectorHostLabel(row.name)}</strong>
                    <small>
                      {connectorOsLabel(row.platform)}
                      {row.ownerId !== currentUserId && row.ownerName ? ` · ${row.ownerName}` : ""}
                    </small>
                  </span>
                  {row.ownerId === currentUserId && confirmId !== row.id && (
                    <button
                      type="button"
                      className="connector-unbind"
                      disabled={busy}
                      aria-label="解除绑定"
                      title="解除绑定"
                      onClick={() => { setError(""); setConfirmId(row.id); }}
                    ><UiIcon name="unbound" size={14} /></button>
                  )}
                </div>
                {row.ownerId === currentUserId && confirmId === row.id && (
                  <div className="connector-unbind-confirm">
                    <p>解除后需重新授权才能领取本机任务。</p>
                    <div>
                      <button type="button" disabled={busy} onClick={() => setConfirmId("")}>取消</button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => void act(async () => {
                          await api(`/connectors/${row.id}`, undefined, "DELETE");
                          setConfirmId("");
                          await onRefresh();
                        }, "已解除本地执行器绑定")}
                      >{busy ? "解除中…" : "确认解除"}</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {error && <p className="project-settings-error" role="alert">{error}</p>}
          </section>
        </section>
      )}
    </ModalBackdrop>
  ) : null;
  if (sidebar) {
    return (
      <>
        <button
          type="button"
          className="sidebar-card sidebar-connector"
          title={available ? "查看在线本地执行器" : "运行本地执行器后在此授权"}
          aria-label="本地执行器"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={!projectId}
          onClick={toggleOpen}
        >
          <span className="sidebar-card-icon"><SidebarIcon kind="connector" /></span>
          <span className="sidebar-card-copy">
            本地执行器
            <small>{available ? "本项目已在线" : "运行后在此授权"}</small>
          </span>
          <span className="sidebar-card-action" aria-hidden="true">
            {available ? <i className="composer-connector-dot" /> : "›"}
          </span>
        </button>
        {dialog}
      </>
    );
  }
  return (
    <div className="composer-connector-wrap">
      <button
        type="button"
        className="composer-connector"
        title={available ? "查看在线本地执行器" : "运行本地执行器后在此授权"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 12h8M9 8V5m6 3V5M7 8h10v5a5 5 0 0 1-10 0V8Z" />
          <path d="M12 18v3" />
        </svg>
        本地执行器
        {available && <i className="composer-connector-dot" aria-hidden="true" />}
      </button>
      {dialog}
    </div>
  );
}
