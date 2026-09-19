import React, { useEffect, useMemo, useState } from "react";
import { createMcpInstallGuide } from "../shared/mcp-guide.js";
import { UiIcon } from "./ui-icon";

type Api = (path: string, data?: unknown, method?: string) => Promise<any>;

export function McpSettings({ api, endpoint }: { api: Api; endpoint: string }) {
  const [credential, setCredential] = useState<{ token: string; expiresAt: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void api("/mcp/credential")
      .then((value) => { if (active) setCredential(value); })
      .catch((cause) => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  const guide = useMemo(() => credential
    ? createMcpInstallGuide({ url: `${location.origin}${endpoint}`, token: credential.token })
    : "", [credential, endpoint]);
  const expires = credential?.expiresAt ? new Date(credential.expiresAt).toLocaleString("zh-CN") : "";
  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
      window.setTimeout(() => setNotice(""), 2500);
    } catch { setError("无法写入剪贴板，请检查浏览器权限后重试"); }
  };
  const reset = async () => {
    if (!window.confirm("重置后本账号当前 MCP 令牌会立即失效，已配置的 Cursor、Codex、Claude Code 等客户端需要重新加载配置。确定继续吗？")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      setCredential(await api("/mcp/credential/reset", {}));
      setRevealed(false);
      setNotice("已生成新令牌，旧令牌已立即失效");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  return <div className="mcp-settings">
    <div className="settings-content-heading">
      <h3>MCP 配置</h3>
      <p>为当前账号配置共序 MCP。一个账号始终只有一个有效令牌，连接器和手动配置会共用这一令牌。</p>
    </div>
    <section className="mcp-settings-section">
      <div className="mcp-settings-heading"><div><strong>账号令牌</strong><small>用于 Cursor、Codex、Claude Code 等支持 MCP 的客户端</small></div><UiIcon name="key" size={18} /></div>
      {busy && !credential ? <p className="muted">正在获取账号令牌…</p> : credential && <>
        <div className="mcp-token-row">
          <code>{revealed ? credential.token : `${credential.token.slice(0, 8)}••••••••${credential.token.slice(-4)}`}</code>
          <button type="button" onClick={() => setRevealed((value) => !value)} title={revealed ? "隐藏令牌" : "显示令牌"}><UiIcon name="eye" size={13} />{revealed ? "隐藏" : "显示"}</button>
          <button type="button" onClick={() => void copy(credential.token, "令牌已复制")}><UiIcon name="copy" size={13} />复制</button>
        </div>
        <small className="mcp-expiry">有效期至 {expires}</small>
        <div className="mcp-actions">
          <button type="button" className="primary" onClick={() => void copy(guide, "安装文档已复制")}><UiIcon name="download" size={13} />复制 MCP 安装文档</button>
          <button type="button" disabled={busy} onClick={() => void reset()}><UiIcon name="refresh" size={13} />重置令牌</button>
        </div>
      </>}
      <p className="mcp-warning"><UiIcon name="info" size={13} />重置会让所有旧配置立即失效；连接器会在下一次同步时自动写入新令牌，手动配置的客户端请重新加载安装文档。</p>
    </section>
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
