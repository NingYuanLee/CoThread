import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UiIcon } from "./ui-icon";

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
  if (!value || value === "Windows 连接器") return "本机";
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
}: {
  devices: ConnectorDevice[];
  availability: AvailableConnector[];
  projectId: string;
  currentUserId: string;
  available: boolean;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
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
  useLayoutEffect(() => {
    if (!open || !panel.current || !button.current) return;
    const anchor = button.current.getBoundingClientRect();
    const box = panel.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8)),
      top: anchor.top >= box.height + 16
        ? anchor.top - box.height - 8
        : Math.max(8, Math.min(anchor.bottom + 8, window.innerHeight - box.height - 8)),
    });
  }, [open, rows.length, error, confirmId]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) {
        setConfirmId("");
        setOpen(false);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmId) {
        setConfirmId("");
        return;
      }
      setOpen(false);
      button.current?.focus();
    };
    const dismiss = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) {
        setConfirmId("");
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open, confirmId]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="composer-connector-wrap" ref={root}>
      <button
        ref={button}
        type="button"
        className="composer-connector"
        title={available ? "查看在线连接器" : "运行连接器后在此授权"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            setError("");
            setConfirmId("");
            void onRefresh();
          } else setConfirmId("");
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 12h8M9 8V5m6 3V5M7 8h10v5a5 5 0 0 1-10 0V8Z" />
          <path d="M12 18v3" />
        </svg>
        本地连接器
        {available && <i className="composer-connector-dot" aria-hidden="true" />}
      </button>
      {open && createPortal(
        <div ref={panel} style={position} className="connector-popover" role="dialog" aria-label="在线连接器">
          <header>在线连接器</header>
          {!rows.length && <p className="muted">当前没有在线连接器</p>}
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
                      })}
                    >{busy ? "解除中…" : "确认解除"}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {error && <p className="project-settings-error" role="alert">{error}</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
