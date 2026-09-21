import React, { useEffect, useMemo, useRef, useState } from "react";
import { createMcpInstallGuide } from "../shared/mcp-guide.js";
import { MCP_CAPABILITIES } from "../shared/mcp-capabilities.js";
import { UiIcon, type UiIconName } from "./ui-icon";

type Api = (path: string, data?: unknown, method?: string) => Promise<any>;
export function McpSettings({ api, endpoint }: { api: Api; endpoint: string }) {
  const [credential, setCredential] = useState<{ token: string; expiresAt: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState<"token" | "guide" | "">("");
  const copyTimer = useRef(0);

  useEffect(() => {
    let active = true;
    void api("/mcp/credential")
      .then((value) => { if (active) setCredential(value); })
      .catch((cause) => { if (active) setError((cause as Error).message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; window.clearTimeout(copyTimer.current); };
  }, []);

  const guide = useMemo(() => credential
    ? createMcpInstallGuide({ url: `${location.origin}${endpoint}`, token: credential.token })
    : "", [credential, endpoint]);
  const expires = credential?.expiresAt ? new Date(credential.expiresAt).toLocaleString("zh-CN") : "";
  // The UI manifest is the current build's source of truth. Do not let a stale
  // credential response from an older server process overwrite the labels.
  const capabilities = MCP_CAPABILITIES;
  const groups = [...new Set(capabilities.map(({ group }) => group))];
  const groupStats = (group: string) => {
    const items = capabilities.filter((capability) => capability.group === group);
    return `${items.length} 项 · ${items.filter((item) => item.access === "read").length} 只读 · ${items.filter((item) => item.access === "write").length} 写入`;
  };
  const copy = async (kind: "token" | "guide", value: string, message: string) => {
    setError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setNotice(message);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => { setCopied(""); setNotice(""); }, 2500);
    } catch { setError("无法写入剪贴板，请检查浏览器权限后重试"); }
  };
  const reset = async () => {
    if (!window.confirm("重置后本账号当前 MCP 令牌会立即失效，已配置的 Cursor、Codex、Claude Code 等客户端需要重新加载配置。确定继续吗？")) return;
    setBusy(true); setError(""); setNotice(""); setCopied("");
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
          <button type="button" title={copied === "token" ? "令牌已复制" : "复制令牌"} aria-label={copied === "token" ? "令牌已复制" : "复制令牌"} onClick={() => void copy("token", credential.token, "令牌已复制")}><UiIcon name={copied === "token" ? "check" : "copy"} size={13} />{copied === "token" ? "已复制" : "复制"}</button>
        </div>
        <small className="mcp-expiry">有效期至 {expires}</small>
        <div className="mcp-actions">
          <button type="button" className="primary" title={copied === "guide" ? "安装文档已复制" : "复制 MCP 安装文档"} aria-label={copied === "guide" ? "安装文档已复制" : "复制 MCP 安装文档"} onClick={() => void copy("guide", guide, "安装文档已复制")}><UiIcon name={copied === "guide" ? "check" : "copy"} size={13} />{copied === "guide" ? "已复制" : "复制 MCP 安装文档"}</button>
          <button type="button" disabled={busy} onClick={() => void reset()}><UiIcon name="refresh" size={13} />重置令牌</button>
        </div>
        {notice && <p className="success" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </>}
      <p className="mcp-warning"><UiIcon name="info" size={13} />复制的是纯文本配置。若本机 IDM 等下载器监视剪贴板，可能把其中的服务地址当成下载链接并弹窗，直接取消即可。重置会使旧配置立即失效；连接器下次同步会写入新令牌，手动配置请重新复制安装文档。</p>
    </section>
    <section className="mcp-settings-section mcp-capabilities-section">
      <div className="mcp-settings-heading"><div><strong>MCP 能力清单</strong><small>{capabilities.length} 项工具，权限仍受账号和项目成员身份限制</small></div><UiIcon name="plugin" size={18} /></div>
      <div className="mcp-capability-groups">
        {groups.map((group) => <div className="mcp-capability-group" key={group}>
          <h4>{group}<small>{groupStats(group)}</small></h4>
          <div className="mcp-capability-list">
            {capabilities.filter((capability) => capability.group === group).map((capability) => <div className="mcp-capability" key={capability.name}>
              <span className="mcp-capability-icon"><UiIcon name={capability.icon as UiIconName} size={14} /></span>
              <span className="mcp-capability-copy"><strong>{capability.title}</strong><small>{capability.description}</small><code>{capability.name}</code></span>
              <span className={`mcp-access mcp-access-${capability.access}`}>{capability.access === "read" ? "只读" : "写入"}</span>
            </div>)}
          </div>
        </div>)}
      </div>
    </section>
    {!credential && error && <p className="error" role="alert">{error}</p>}
  </div>;
}
