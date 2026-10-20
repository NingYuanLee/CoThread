import React, { useState } from "react";
import { UiIcon } from "./ui-icon";
import { showTip } from "./Tip";

export type LocalExecutorDevice = {
  id: string;
  name: string;
  platform: string;
  version: string;
  online: number;
  last_seen_at: string | null;
  projects: {
    projectId: string;
    policy: "unrestricted" | "style_only" | "layout_style";
    allowGitPush: boolean;
  }[];
};

export function localExecutorHostLabel(name?: string | null) {
  const value = String(name || "").trim();
  if (!value || value === "Windows 本地执行器") return "本机";
  return value;
}

export function localExecutorOsLabel(platform?: string | null) {
  const value = String(platform || "").trim();
  if (!value) return "未知系统";
  if (/^windows$/i.test(value)) return "Windows";
  if (/^darwin$|^macos$/i.test(value)) return "macOS";
  if (/^linux$/i.test(value)) return "Linux";
  return value;
}

type Api = (path: string, data?: unknown, method?: string) => Promise<unknown>;

export function LocalExecutorAccountSection({
  devices,
  ready,
  projectId,
  api,
  onChanged,
}: {
  devices: LocalExecutorDevice[];
  ready: boolean;
  projectId: string;
  api: Api;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const rows = [...devices].sort(
    (a, b) =>
      Number(!!b.online) - Number(!!a.online) ||
      localExecutorHostLabel(a.name).localeCompare(localExecutorHostLabel(b.name), "zh-CN"),
  );

  const unbind = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await api(`/local-executors/${id}`, undefined, "DELETE");
      setConfirmId("");
      await onChanged();
      showTip("已解除本地执行器绑定");
    } catch (cause) {
      const detail = (cause as Error).message;
      setError(detail);
      showTip(detail, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mcp-settings-section" aria-label="本地执行器">
      <div className="mcp-settings-heading">
        <div>
          <strong>本地执行器</strong>
          <small>本账号已授权的设备。运行本地执行器后，在弹出的授权页完成绑定。</small>
        </div>
        <UiIcon name="localExecutor" size={18} />
      </div>
      {!ready && <p className="muted">正在读取本地执行器…</p>}
      {ready && !rows.length && <p className="muted">当前没有已授权的本地执行器。</p>}
      {!!rows.length && (
        <div className="mcp-local-executor-list">
          {rows.map((row) => {
            const online = !!row.online;
            const projectCount = row.projects?.length || 0;
            const boundHere =
              !!projectId && row.projects?.some((item) => item.projectId === projectId);
            return (
              <div className="mcp-local-executor" key={row.id}>
                <div className="mcp-local-executor-main">
                  <i className={online ? "online" : ""} aria-hidden="true" />
                  <span className="mcp-local-executor-copy">
                    <strong>{localExecutorHostLabel(row.name)}</strong>
                    <small>
                      {localExecutorOsLabel(row.platform)}
                      {row.version ? ` · ${row.version}` : ""}
                      {projectCount ? ` · 已绑定 ${projectCount} 个项目` : " · 未绑定项目"}
                      {boundHere ? " · 含当前项目" : ""}
                    </small>
                  </span>
                  <span className={`status-badge${online ? "" : " inactive"}`}>
                    {online ? "在线" : "离线"}
                  </span>
                  {confirmId !== row.id && (
                    <button
                      type="button"
                      className="mcp-local-executor-unbind"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setConfirmId(row.id);
                      }}
                    >
                      <UiIcon name="unbound" size={13} />
                      解除绑定
                    </button>
                  )}
                </div>
                {confirmId === row.id && (
                  <div className="mcp-local-executor-confirm">
                    <p>解除后需重新授权才能领取本机任务。</p>
                    <div>
                      <button type="button" disabled={busy} onClick={() => setConfirmId("")}>
                        取消
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => void unbind(row.id)}
                      >
                        {busy ? "解除中…" : "确认解除"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
