import React, { useEffect, useState } from "react";
import { UiIcon } from "./ui-icon";
import { showTip } from "./Tip";
import "./miniprogram.css";

type EnvironmentKind = "development" | "staging" | "production";

type CloudbaseEnv = { envId: string; region: string | null };

type AdminDeploy = {
  target: "cloudbase_static" | "cloudbase_hosted";
  environment: EnvironmentKind;
  hostingPath: string;
  customDomain: string | null;
  buildCommand: string | null;
  distDir: string;
  spaFallback: boolean;
};

type WechatCi = {
  robotPreview: number;
  robotUpload: number;
  descTemplate: string | null;
};

type SecretState = { configured: boolean; hint: string | null; updatedAt: string | null };

type MiniProgramConfig = {
  projectId: string;
  enabled: boolean;
  appId: string | null;
  appName: string | null;
  entryPage: string | null;
  versionPolicy: string;
  cloudbaseEnvs: Partial<Record<EnvironmentKind, CloudbaseEnv>>;
  adminDeploy: AdminDeploy | null;
  wechatCi: WechatCi | null;
  status: string;
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
  updatedAt: string | null;
  secrets: Record<"wechat_upload_key" | "cloudbase_credential", SecretState>;
};

type VerifyCheck = {
  id: string;
  label: string;
  status: "passed" | "failed" | "pending";
  detail: string;
};

const STATUS_LABELS: Record<string, string> = {
  unconfigured: "未配置",
  incomplete: "配置不完整",
  verify_failed: "验证失败",
  verified: "已验证",
  credential_expired: "凭据缺失",
};

const STATUS_TONES: Record<string, string> = {
  unconfigured: "muted",
  incomplete: "warning",
  verify_failed: "failed",
  verified: "ok",
  credential_expired: "warning",
};

const ENVIRONMENT_LABELS: Record<EnvironmentKind, string> = {
  development: "开发环境",
  staging: "预发布环境",
  production: "生产环境",
};

const SECRET_META = {
  wechat_upload_key: {
    label: "微信上传私钥",
    hint: "miniprogram-ci 使用的上传密钥文件内容；仅后端加密保存，不写入项目文件。",
    placeholder: "粘贴 private.<appid>.key 文件内容",
  },
  cloudbase_credential: {
    label: "CloudBase 凭据",
    hint: "环境级最小权限凭据；L3 只能通过受控工具使用，不会拿到明文。",
    placeholder: "粘贴 CloudBase 环境凭据",
  },
} as const;

const CHECK_ICON: Record<VerifyCheck["status"], "checkCircle" | "failed" | "clock"> = {
  passed: "checkCircle",
  failed: "failed",
  pending: "clock",
};

const CHECK_LABEL: Record<VerifyCheck["status"], string> = {
  passed: "通过",
  failed: "失败",
  pending: "待实测",
};

export function ProjectMiniProgramConfig({
  projectId,
  canManage,
  api,
}: {
  projectId: string;
  canManage: boolean;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
}) {
  const [config, setConfig] = useState<MiniProgramConfig | null>(null);
  const [draft, setDraft] = useState<MiniProgramConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<VerifyCheck[] | null>(null);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({
    wechat_upload_key: "",
    cloudbase_credential: "",
  });
  const [secretBusy, setSecretBusy] = useState<string | null>(null);

  const apply = (next: MiniProgramConfig) => {
    setConfig(next);
    setDraft(next);
  };

  useEffect(() => {
    let alive = true;
    setError("");
    void api(`/projects/${projectId}/miniprogram-config`)
      .then((value) => {
        if (alive) apply(value as MiniProgramConfig);
      })
      .catch((cause) => {
        if (alive) setError(cause instanceof Error ? cause.message : "配置读取失败");
      });
    return () => {
      alive = false;
    };
  }, [projectId, api]);

  const patch = (changes: Partial<MiniProgramConfig>) => {
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));
  };

  const setEnv = (kind: EnvironmentKind, envId: string) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const envs = { ...previous.cloudbaseEnvs };
      if (!envId.trim()) delete envs[kind];
      else envs[kind] = { envId, region: envs[kind]?.region ?? null };
      return { ...previous, cloudbaseEnvs: envs };
    });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const next = await api(
        `/projects/${projectId}/miniprogram-config`,
        {
          enabled: draft.enabled,
          appId: draft.appId,
          appName: draft.appName,
          entryPage: draft.entryPage,
          versionPolicy: draft.versionPolicy,
          cloudbaseEnvs: draft.cloudbaseEnvs,
          adminDeploy: draft.adminDeploy,
          wechatCi: draft.wechatCi,
        },
        "PUT",
      );
      apply(next as MiniProgramConfig);
      showTip("已保存小程序与云开发配置");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveSecret = async (kind: "wechat_upload_key" | "cloudbase_credential") => {
    const value = secretDrafts[kind];
    if (!value) return;
    setSecretBusy(kind);
    setError("");
    try {
      const next = await api(
        `/projects/${projectId}/miniprogram-secrets/${kind}`,
        { value },
        "PUT",
      );
      apply(next as MiniProgramConfig);
      setSecretDrafts((previous) => ({ ...previous, [kind]: "" }));
      showTip(`已保存${SECRET_META[kind].label}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "凭据保存失败");
    } finally {
      setSecretBusy(null);
    }
  };

  const clearSecret = async (kind: "wechat_upload_key" | "cloudbase_credential") => {
    setSecretBusy(kind);
    setError("");
    try {
      const next = await api(
        `/projects/${projectId}/miniprogram-secrets/${kind}`,
        undefined,
        "DELETE",
      );
      apply(next as MiniProgramConfig);
      showTip(`已清除${SECRET_META[kind].label}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "凭据清除失败");
    } finally {
      setSecretBusy(null);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError("");
    try {
      const result = (await api(
        `/projects/${projectId}/miniprogram-config/verify`,
        {},
        "POST",
      )) as {
        status: string;
        checks: VerifyCheck[];
        error: string | null;
      };
      setChecks(result.checks);
      const next = (await api(`/projects/${projectId}/miniprogram-config`)) as MiniProgramConfig;
      apply(next);
      showTip(result.status === "verified" ? "配置验证通过" : "配置验证未通过");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验证失败");
    } finally {
      setBusy(false);
    }
  };

  if (error && !draft) return <p className="muted">{error}</p>;
  if (!draft) return <p className="muted">正在加载小程序配置…</p>;

  const readOnly = !canManage;
  const statusTone = STATUS_TONES[draft.status] || "muted";

  return (
    <div className="miniprogram-config">
      <div className="miniprogram-config-head">
        <div>
          <h3>
            <UiIcon name="smartphone" size={15} /> 小程序与云开发
          </h3>
          <p className="muted">
            来源与凭据在此配置；密钥仅后端加密保存，L3 通过受控工具使用，不接触明文。
          </p>
        </div>
        <span className={`miniprogram-status ${statusTone}`}>
          {STATUS_LABELS[draft.status] || draft.status}
        </span>
      </div>

      {error ? <p className="miniprogram-config-error">{error}</p> : null}
      {draft.lastVerifyError ? (
        <p className="miniprogram-config-error">上次验证：{draft.lastVerifyError}</p>
      ) : null}

      <section className="miniprogram-config-section">
        <h4>① 小程序身份</h4>
        <label className="miniprogram-field">
          <span>微信 AppID</span>
          <input
            type="text"
            value={draft.appId || ""}
            placeholder="wx1234567890abcdef"
            disabled={readOnly}
            autoComplete="off"
            onChange={(event) => patch({ appId: event.target.value })}
          />
        </label>
        <label className="miniprogram-field">
          <span>小程序名称</span>
          <input
            type="text"
            value={draft.appName || ""}
            disabled={readOnly}
            autoComplete="off"
            onChange={(event) => patch({ appName: event.target.value })}
          />
        </label>
        <label className="miniprogram-field">
          <span>默认预览页面</span>
          <input
            type="text"
            value={draft.entryPage || ""}
            placeholder="pages/index/index"
            disabled={readOnly}
            autoComplete="off"
            onChange={(event) => patch({ entryPage: event.target.value })}
          />
        </label>
      </section>

      <section className="miniprogram-config-section">
        <h4>② CloudBase 环境</h4>
        {(Object.keys(ENVIRONMENT_LABELS) as EnvironmentKind[]).map((kind) => (
          <label className="miniprogram-field" key={kind}>
            <span>{ENVIRONMENT_LABELS[kind]}</span>
            <input
              type="text"
              value={draft.cloudbaseEnvs[kind]?.envId || ""}
              placeholder={kind === "development" ? "开发环境 ID（必填）" : "留空表示暂不使用"}
              disabled={readOnly}
              autoComplete="off"
              onChange={(event) => setEnv(kind, event.target.value)}
            />
          </label>
        ))}
        <p className="muted miniprogram-note">
          L3 默认只能操作开发环境；预发布与生产环境需要显式授权，生产发布需项目负责人确认。
        </p>
      </section>

      <section className="miniprogram-config-section">
        <h4>③ 发布凭据</h4>
        {(Object.keys(SECRET_META) as Array<keyof typeof SECRET_META>).map((kind) => {
          const meta = SECRET_META[kind];
          const state = draft.secrets[kind];
          return (
            <div className="miniprogram-secret" key={kind}>
              <div className="miniprogram-secret-head">
                <span>
                  <UiIcon name="key" size={13} /> {meta.label}
                </span>
                {state.configured ? (
                  <small className="miniprogram-secret-on">已保存 {state.hint || ""}</small>
                ) : (
                  <small className="muted">未配置</small>
                )}
              </div>
              <p className="muted miniprogram-note">{meta.hint}</p>
              {readOnly ? null : (
                <div className="miniprogram-secret-actions">
                  <input
                    type="password"
                    value={secretDrafts[kind]}
                    placeholder={state.configured ? "重新输入以替换" : meta.placeholder}
                    autoComplete="new-password"
                    onChange={(event) =>
                      setSecretDrafts((previous) => ({ ...previous, [kind]: event.target.value }))
                    }
                  />
                  <button
                    type="button"
                    disabled={secretBusy === kind || !secretDrafts[kind]}
                    onClick={() => void saveSecret(kind)}
                  >
                    {state.configured ? "替换" : "保存"}
                  </button>
                  {state.configured ? (
                    <button
                      type="button"
                      className="miniprogram-danger"
                      disabled={secretBusy === kind}
                      onClick={() => void clearSecret(kind)}
                    >
                      清除
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="miniprogram-config-section">
        <h4>④ Admin 发布目标</h4>
        {draft.adminDeploy ? (
          <>
            <label className="miniprogram-field">
              <span>发布方式</span>
              <select
                value={draft.adminDeploy.target}
                disabled={readOnly}
                onChange={(event) =>
                  patch({
                    adminDeploy: {
                      ...draft.adminDeploy!,
                      target: event.target.value as AdminDeploy["target"],
                    },
                  })
                }
              >
                <option value="cloudbase_static">CloudBase 静态网站托管</option>
                <option value="cloudbase_hosted">CloudBase 云托管</option>
              </select>
            </label>
            <label className="miniprogram-field">
              <span>发布环境</span>
              <select
                value={draft.adminDeploy.environment}
                disabled={readOnly}
                onChange={(event) =>
                  patch({
                    adminDeploy: {
                      ...draft.adminDeploy!,
                      environment: event.target.value as EnvironmentKind,
                    },
                  })
                }
              >
                {(Object.keys(ENVIRONMENT_LABELS) as EnvironmentKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {ENVIRONMENT_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="miniprogram-field">
              <span>托管路径</span>
              <input
                type="text"
                value={draft.adminDeploy.hostingPath}
                disabled={readOnly}
                autoComplete="off"
                onChange={(event) =>
                  patch({
                    adminDeploy: { ...draft.adminDeploy!, hostingPath: event.target.value },
                  })
                }
              />
            </label>
            <label className="miniprogram-field">
              <span>构建命令</span>
              <input
                type="text"
                value={draft.adminDeploy.buildCommand || ""}
                placeholder="npm run build"
                disabled={readOnly}
                autoComplete="off"
                onChange={(event) =>
                  patch({
                    adminDeploy: { ...draft.adminDeploy!, buildCommand: event.target.value },
                  })
                }
              />
            </label>
            <label className="miniprogram-field">
              <span>产物目录</span>
              <input
                type="text"
                value={draft.adminDeploy.distDir}
                disabled={readOnly}
                autoComplete="off"
                onChange={(event) =>
                  patch({
                    adminDeploy: { ...draft.adminDeploy!, distDir: event.target.value },
                  })
                }
              />
            </label>
            {readOnly ? null : (
              <button
                type="button"
                className="miniprogram-secondary"
                onClick={() => patch({ adminDeploy: null })}
              >
                取消 Admin 发布配置
              </button>
            )}
          </>
        ) : (
          <div className="miniprogram-empty">
            <p className="muted">尚未配置 Admin 发布目标。</p>
            {readOnly ? null : (
              <button
                type="button"
                className="miniprogram-secondary"
                onClick={() =>
                  patch({
                    adminDeploy: {
                      target: "cloudbase_static",
                      environment: "development",
                      hostingPath: "/admin/",
                      customDomain: null,
                      buildCommand: "npm run build",
                      distDir: "dist",
                      spaFallback: true,
                    },
                  })
                }
              >
                添加 Admin 发布目标
              </button>
            )}
          </div>
        )}
      </section>

      <section className="miniprogram-config-section">
        <h4>⑤ 发布策略</h4>
        <label className="miniprogram-field">
          <span>版本号策略</span>
          <select
            value={draft.versionPolicy}
            disabled={readOnly}
            onChange={(event) => patch({ versionPolicy: event.target.value })}
          >
            <option value="manual">手动填写</option>
            <option value="timestamp">按时间戳自动生成</option>
          </select>
        </label>
        <label className="miniprogram-field miniprogram-field-check">
          <input
            type="checkbox"
            checked={draft.enabled}
            disabled={readOnly}
            onChange={(event) => patch({ enabled: event.target.checked })}
          />
          <span>启用小程序全栈工作区（启用后「小程序」工具区对外可用）</span>
        </label>
      </section>

      <section className="miniprogram-config-section">
        <h4>⑥ 连接测试</h4>
        <div className="miniprogram-config-actions">
          {readOnly ? null : (
            <button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? "处理中…" : "保存配置"}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => void verify()}>
            <UiIcon name="shield" size={13} /> 验证配置
          </button>
        </div>
        {checks ? (
          <ul className="miniprogram-checks">
            {checks.map((check) => (
              <li key={check.id} data-status={check.status}>
                <span className="miniprogram-check-name">
                  <UiIcon name={CHECK_ICON[check.status]} size={12} /> {check.label}
                </span>
                <span className="miniprogram-check-detail">{check.detail}</span>
                <span className="miniprogram-check-state">{CHECK_LABEL[check.status]}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="muted miniprogram-note">
          「待实测」表示需要真实 CloudBase
          或微信调用才能判定，后续由对应能力接入时校验，不会伪报通过。
        </p>
      </section>
    </div>
  );
}
