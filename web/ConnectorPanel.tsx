import React, { useEffect, useState } from "react";

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
  const [downloadAvailable, setDownloadAvailable] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  useEffect(() => {
    let active = true;
    void api("/connectors/download-availability").then((result) => {
      if (active) setDownloadAvailable(result.available === true);
    }).catch(() => { if (active) setDownloadAvailable(false); });
    return () => { active = false; };
  }, [api]);
  const act = async (fn: () => Promise<void>) => { setBusy(true); setError(""); try { await fn(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } };
  const download = () => void act(async () => {
    setDownloadProgress("准备下载...");
    try {
      const info = await api("/connectors/download-info");
      if (info.type === "external") { window.location.assign(info.url); return; }
      const parts: BlobPart[] = [];
      for (let part = 0; part < info.chunks; part++) {
        setDownloadProgress(`下载中 ${Math.round(part / info.chunks * 100)}%`);
        const response = await fetch(`/api/connector/releases/${info.id}/download/chunks/${part}`);
        if (!response.ok) throw new Error(`下载分片失败（${part + 1}/${info.chunks}）`);
        parts.push(await response.arrayBuffer());
      }
      const url = URL.createObjectURL(new Blob(parts, { type: "application/vnd.microsoft.portable-executable" }));
      const link = document.createElement("a");
      link.href = url; link.download = info.filename || "CoThreadConnector.exe"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } finally { setDownloadProgress(""); }
  });
  return <div className="connector-panel">
    <header><div><small>LOCAL CONNECTOR</small><h2>本地连接器</h2><p>本机 Codex 执行通道</p></div><button type="button" aria-label="关闭" title="关闭" onClick={onClose}>×</button></header>
    {downloadAvailable && <div className="connector-actions">
      <button type="button" className="primary" disabled={busy} onClick={download}>{downloadProgress || "下载 Windows 版"}</button>
    </div>}
    <p className="muted">单文件绿色版，下载后双击运行。连接器会检测 Git 和 Codex CLI，并打开本页完成账号授权。</p>
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
