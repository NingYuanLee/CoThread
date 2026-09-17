import React, { useState } from "react";

export type ConnectorDevice = {
  id: string; name: string; platform: string; version: string; online: number;
  last_seen_at: string | null; projects: { projectId: string; policy: "unrestricted" | "style_only" | "layout_style"; allowGitPush: boolean }[];
};

export function ConnectorPanel({ devices, api, onRefresh, onClose }: {
  devices: ConnectorDevice[];
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async (fn: () => Promise<void>) => { setBusy(true); setError(""); try { await fn(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } };
  return <div className="connector-panel">
    <header><div><small>本地连接器</small><h2>本地连接器</h2><p>本机 Agent 执行通道</p></div><button type="button" aria-label="关闭" title="关闭" onClick={onClose}>×</button></header>
    <p className="muted">连接器应用程序由独立渠道分发。运行后会检测 Git 与 Cursor Agent / Codex CLI / Claude Code，并打开本页完成账号授权。任务在本机以交互式 Agent 会话执行，可随时追问与打断；授权后连接器会自动为已检测到的 Agent 写入共序 MCP 配置，无需手抄令牌。</p>
    <section><h3>已连接设备</h3>
      {!devices.length && <p className="muted">暂无设备</p>}
      {devices.map((device) => <div className="connector-device" key={device.id}>
        <i className={device.online ? "online" : ""} aria-hidden="true" />
        <span><strong>Windows 连接器</strong><small>{device.online ? "在线" : "离线"} · v{device.version}</small></span>
        <button type="button" disabled={busy} aria-label="解除连接器" title="解除绑定" onClick={() => void act(async () => { await api(`/connectors/${device.id}`, undefined, "DELETE"); await onRefresh(); })}>×</button>
      </div>)}
    </section>
    {error && <p className="project-settings-error" role="alert">{error}</p>}
  </div>;
}
