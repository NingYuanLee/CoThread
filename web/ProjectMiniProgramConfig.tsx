import React, { useEffect, useState } from "react";
import { UiIcon } from "./ui-icon";
import { showTip } from "./Tip";
import "./miniprogram.css";

type EnvironmentKind = "development" | "production";

type CloudbaseEnv = { envId: string; region: string | null };

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
  cloudbaseEnvs: Partial<Record<EnvironmentKind, CloudbaseEnv>>;
  adminDeploy: unknown;
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

type CloudbaseAuthSettings = {
  environment: EnvironmentKind;
  envId: string;
  anonymousLogin: boolean;
  usernameLogin: boolean;
  emailLogin: boolean;
  phoneNumberLogin: boolean;
  requestId: string | null;
};

type CloudbaseAdminAccount = {
  environment: EnvironmentKind;
  envId: string;
  configured: boolean;
  username: string | null;
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
  production: "生产环境",
};

const SECRET_META = {
  wechat_upload_key: {
    label: "微信上传私钥",
    hint: "miniprogram-ci 使用的上传密钥文件内容；仅后端加密保存，不写入项目文件。",
    placeholder: "粘贴 private.<appid>.key 文件内容",
    mode: "single" as const,
  },
  cloudbase_credential: {
    label: "CloudBase 凭据",
    hint: "腾讯云 API 密钥对（控制台「访问管理 → API 密钥管理」）。环境级最小权限凭据；L3 只能通过受控工具使用，不会拿到明文。",
    placeholder: "SecretId",
    mode: "pair" as const,
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
  const [publishableKeys, setPublishableKeys] = useState<Record<EnvironmentKind, string>>({ development: "", production: "" });
  const [savedPublishableKeys, setSavedPublishableKeys] = useState<Record<EnvironmentKind, string>>({ development: "", production: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<VerifyCheck[] | null>(null);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({
    wechat_upload_key: "",
    cloudbase_credential: "",
  });
  // CloudBase 凭据拆成两个字段：控制台给的就是两段独立的值，拼在一起容易出错。
  const [cbPair, setCbPair] = useState({ secretId: "", secretKey: "" });
  const [secretBusy, setSecretBusy] = useState<string | null>(null);
  const [authSettings, setAuthSettings] = useState<Record<EnvironmentKind, CloudbaseAuthSettings | null>>({ development: null, production: null });
  const [adminAccounts, setAdminAccounts] = useState<Record<EnvironmentKind, CloudbaseAdminAccount | null>>({ development: null, production: null });
  const [authBusy, setAuthBusy] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminDraft, setAdminDraft] = useState({ username: "", password: "", confirmPassword: "" });
  const [selectedCloudbaseEnvironment, setSelectedCloudbaseEnvironment] = useState<EnvironmentKind>("development");

  const apply = (next: MiniProgramConfig) => {
    setConfig(next);
    setDraft(next);
  };

  useEffect(() => {
    let alive = true;
    setError("");
    void Promise.all([
      api(`/projects/${projectId}/miniprogram-config`),
      api(`/projects/${projectId}/miniprogram-auth-config?environment=development`),
      api(`/projects/${projectId}/miniprogram-auth-config?environment=production`),
    ])
      .then(async ([value, developmentAuth, productionAuth]) => {
        if (!alive) return;
        apply(value as MiniProgramConfig);
        const keys = {
          development: developmentAuth.miniprogram?.publishableKey || "",
          production: productionAuth.miniprogram?.publishableKey || "",
        };
        setPublishableKeys(keys);
        setSavedPublishableKeys(keys);
        const loadExtra = (path: string) => Promise.race([
          api(path),
          new Promise((_, reject) => setTimeout(() => reject(new Error("CloudBase 配置读取超时")), 8000)),
        ]);
        const extra = await Promise.allSettled([
          loadExtra(`/projects/${projectId}/cloudbase/auth-settings?environment=development`),
          loadExtra(`/projects/${projectId}/cloudbase/auth-settings?environment=production`),
          loadExtra(`/projects/${projectId}/cloudbase/admin-account?environment=development`),
          loadExtra(`/projects/${projectId}/cloudbase/admin-account?environment=production`),
        ]);
        if (!alive) return;
        setAuthSettings({
          development: extra[0].status === "fulfilled" ? extra[0].value : null,
          production: extra[1].status === "fulfilled" ? extra[1].value : null,
        });
        setAdminAccounts({
          development: extra[2].status === "fulfilled" ? extra[2].value : null,
          production: extra[3].status === "fulfilled" ? extra[3].value : null,
        });
      })
      .catch((cause) => {
        if (alive) setError(cause instanceof Error ? cause.message : "配置读取失败");
      });
    return () => {
      alive = false;
    };
  }, [projectId, api]);

  const selectedAuth = authSettings[selectedCloudbaseEnvironment];
  const selectedAdmin = adminAccounts[selectedCloudbaseEnvironment];

  const updateAuthSettings = async (changes: Partial<CloudbaseAuthSettings>) => {
    if (!selectedAuth) return;
    setAuthBusy(true);
    setError("");
    try {
      const next = await api(`/projects/${projectId}/cloudbase/auth-settings`, {
        environment: selectedCloudbaseEnvironment,
        ...changes,
        ...(selectedCloudbaseEnvironment === "production" ? { confirmProduction: true } : {}),
      }, "PUT");
      setAuthSettings((previous) => ({ ...previous, [selectedCloudbaseEnvironment]: next }));
      showTip("CloudBase 登录方式已同步");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CloudBase 登录方式同步失败");
    } finally {
      setAuthBusy(false);
    }
  };

  const saveAdminAccount = async () => {
    if (!adminDraft.username.trim() || adminDraft.password.length < 8 || adminDraft.password !== adminDraft.confirmPassword) {
      setError("请填写账号、至少 8 位密码，并确认两次密码一致");
      return;
    }
    setAdminBusy(true);
    setError("");
    try {
      const next = await api(`/projects/${projectId}/cloudbase/admin-account`, {
        environment: selectedCloudbaseEnvironment,
        username: adminDraft.username.trim(),
        password: adminDraft.password,
        ...(selectedCloudbaseEnvironment === "production" ? { confirmProduction: true } : {}),
      }, "PUT");
      setAdminAccounts((previous) => ({ ...previous, [selectedCloudbaseEnvironment]: next }));
      setAdminDraft({ username: "", password: "", confirmPassword: "" });
      showTip("Admin 首个账号已同步到 CloudBase");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Admin 账号同步失败");
    } finally {
      setAdminBusy(false);
    }
  };

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
    if (!draft || !config) return;
    setBusy(true);
    setError("");
    try {
      const configChanged = ["appId", "appName", "entryPage", "cloudbaseEnvs", "adminDeploy", "wechatCi"]
        .some((field) => JSON.stringify(draft[field as keyof MiniProgramConfig]) !== JSON.stringify(config[field as keyof MiniProgramConfig]));
      if (configChanged) {
        const next = await api(
          `/projects/${projectId}/miniprogram-config`,
          {
            appId: draft.appId,
            appName: draft.appName,
            entryPage: draft.entryPage,
            cloudbaseEnvs: draft.cloudbaseEnvs,
            adminDeploy: draft.adminDeploy,
            wechatCi: draft.wechatCi,
          },
          "PUT",
        );
        apply(next as MiniProgramConfig);
      }
      for (const environment of Object.keys(ENVIRONMENT_LABELS) as EnvironmentKind[]) {
        const key = publishableKeys[environment].trim();
        if (key === savedPublishableKeys[environment]) continue;
        await api(
          `/projects/${projectId}/miniprogram-auth-config/publishable-key`,
          { environment, cloudbasePublishableKey: key || null },
          "PUT",
        );
        setSavedPublishableKeys((previous) => ({ ...previous, [environment]: key }));
      }
      showTip("已保存小程序与云开发配置");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveSecret = async (kind: "wechat_upload_key" | "cloudbase_credential") => {
    const body =
      kind === "cloudbase_credential"
        ? cbPair.secretId.trim() && cbPair.secretKey.trim()
          ? { secretId: cbPair.secretId.trim(), secretKey: cbPair.secretKey.trim() }
          : null
        : secretDrafts[kind]
          ? { value: secretDrafts[kind] }
          : null;
    if (!body) return;
    setSecretBusy(kind);
    setError("");
    try {
      const next = await api(`/projects/${projectId}/miniprogram-secrets/${kind}`, body, "PUT");
      apply(next as MiniProgramConfig);
      setSecretDrafts((previous) => ({ ...previous, [kind]: "" }));
      setCbPair({ secretId: "", secretKey: "" });
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
  const renderSecret = (kind: keyof typeof SECRET_META) => {
    const meta = SECRET_META[kind];
    const state = draft.secrets[kind];
    return (
      <div className="miniprogram-secret" key={kind}>
        <div className="miniprogram-secret-head">
          <span><UiIcon name="key" size={13} /> {meta.label}</span>
          {state.configured ? <small className="miniprogram-secret-on">已保存 {state.hint || ""}</small> : <small className="muted">未配置</small>}
        </div>
        <p className="muted miniprogram-note">{meta.hint}</p>
        {readOnly ? null : meta.mode === "pair" ? (
          <div className="miniprogram-secret-actions miniprogram-secret-pair">
            <input type="text" value={cbPair.secretId} placeholder={state.configured ? "SecretId（重新输入以替换）" : "SecretId"} autoComplete="off" spellCheck={false} onChange={(event) => setCbPair((previous) => ({ ...previous, secretId: event.target.value }))} />
            <input type="password" value={cbPair.secretKey} placeholder={state.configured ? "SecretKey（重新输入以替换）" : "SecretKey"} autoComplete="new-password" onChange={(event) => setCbPair((previous) => ({ ...previous, secretKey: event.target.value }))} />
            <button type="button" disabled={secretBusy === kind || !cbPair.secretId.trim() || !cbPair.secretKey.trim()} onClick={() => void saveSecret(kind)}>{state.configured ? "替换" : "保存"}</button>
            {state.configured ? <button type="button" className="miniprogram-danger" disabled={secretBusy === kind} onClick={() => void clearSecret(kind)}>清除</button> : null}
          </div>
        ) : (
          <div className="miniprogram-secret-actions">
            <input type="password" value={secretDrafts[kind]} placeholder={state.configured ? "重新输入以替换" : meta.placeholder} autoComplete="new-password" onChange={(event) => setSecretDrafts((previous) => ({ ...previous, [kind]: event.target.value }))} />
            <button type="button" disabled={secretBusy === kind || !secretDrafts[kind]} onClick={() => void saveSecret(kind)}>{state.configured ? "替换" : "保存"}</button>
            {state.configured ? <button type="button" className="miniprogram-danger" disabled={secretBusy === kind} onClick={() => void clearSecret(kind)}>清除</button> : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="miniprogram-config">
      <div className="miniprogram-config-head">
        <div>
          <h3>
            <UiIcon name="smartphone" size={15} /> 小程序与云开发
          </h3>
          <p className="muted">
            来源与凭据在此配置；上传私钥和 CloudBase 凭据由后端加密保存，L3 通过受控工具使用。
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
        {renderSecret("wechat_upload_key")}
      </section>

      <section className="miniprogram-config-section">
        <h4>② CloudBase 环境</h4>
        <div className="miniprogram-env-grid miniprogram-env-grid-head" aria-hidden="true">
          <span />
          <span>环境 ID</span>
          <span>Publishable Key</span>
        </div>
        {(Object.keys(ENVIRONMENT_LABELS) as EnvironmentKind[]).map((kind) => (
          <div className="miniprogram-env-grid" key={kind}>
            <span>{ENVIRONMENT_LABELS[kind]}</span>
            <input
              type="text"
              aria-label={`${ENVIRONMENT_LABELS[kind]} ID`}
              value={draft.cloudbaseEnvs[kind]?.envId || ""}
              placeholder={kind === "development" ? "必填" : "留空沿用开发环境"}
              disabled={readOnly}
              autoComplete="off"
              onChange={(event) => setEnv(kind, event.target.value)}
            />
            <input
              type="text"
              aria-label={`${ENVIRONMENT_LABELS[kind]} Publishable Key`}
              value={publishableKeys[kind]}
              maxLength={16384}
              placeholder={kind === "development" ? "粘贴 Publishable Key" : "留空沿用开发环境"}
              disabled={readOnly || busy}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setPublishableKeys((previous) => ({ ...previous, [kind]: event.target.value }))}
            />
          </div>
        ))}
        <p className="muted miniprogram-note">
          开发预览使用开发环境；体验版上传、Admin 与其他正式发布使用生产环境。生产环境的环境 ID 或 Publishable Key 留空时，对应项沿用开发环境。
        </p>
        <p className="muted miniprogram-note">
          真机云函数调用要求此处的微信 AppID 已开通并关联对应云环境，或已获得环境所属小程序的共享授权。腾讯云控制台创建的环境须先与微信小程序绑定；Web 预览登录成功不能证明微信端有调用权限。
        </p>
        {renderSecret("cloudbase_credential")}
      </section>

      <section className="miniprogram-config-section">
        <h4>③ 连接测试</h4>
        <div className="miniprogram-config-actions">
          {readOnly ? null : (
            <button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? "处理中…" : "保存配置"}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => void verify()}>
            <UiIcon name="shield" size={13} /> 连接测试
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
          连接测试会用服务端凭据只读查询 CloudBase 云函数，并向微信请求生成预览码来验证上传私钥；不会上传正式版本，也无法验证当前 AppID 在真机上的云函数调用权限。两项测试通过后，小程序工作区自动开放。
        </p>
      </section>

      <section className="miniprogram-config-section cloudbase-auth-settings">
        <div className="miniprogram-section-heading-row">
          <h4>④ CloudBase 身份认证</h4>
          <select value={selectedCloudbaseEnvironment} disabled={readOnly || authBusy || adminBusy} onChange={(event) => setSelectedCloudbaseEnvironment(event.target.value as EnvironmentKind)}>
            <option value="development">开发环境</option>
            <option value="production">生产环境</option>
          </select>
        </div>
        {selectedAuth ? (
          <>
            <p className="muted miniprogram-note">直接同步到 {selectedAuth.envId}。生产环境修改需要明确确认，密码不会回显或写入源码。</p>
            <div className="cloudbase-auth-switches">
              {([
                ["anonymousLogin", "匿名登录（开发预览静默登录）"],
                ["usernameLogin", "用户名密码登录"],
                ["emailLogin", "邮箱登录"],
                ["phoneNumberLogin", "手机号登录"],
              ] as const).map(([key, label]) => (
                <label key={key} className="cloudbase-auth-switch"><input type="checkbox" checked={Boolean(selectedAuth[key])} disabled={readOnly || authBusy} onChange={(event) => void updateAuthSettings({ [key]: event.target.checked })} /><span>{label}</span></label>
              ))}
            </div>
            <div className="cloudbase-admin-account">
              <div><strong>Admin 首个账号</strong><small>{selectedAdmin?.configured ? `已配置：${selectedAdmin.username}` : "尚未配置"}</small></div>
              {!readOnly ? <div className="cloudbase-admin-fields">
                <input type="text" value={adminDraft.username} placeholder="用户名或邮箱" autoComplete="username" onChange={(event) => setAdminDraft((previous) => ({ ...previous, username: event.target.value }))} />
                <input type="password" value={adminDraft.password} placeholder="新密码（至少 8 位）" autoComplete="new-password" onChange={(event) => setAdminDraft((previous) => ({ ...previous, password: event.target.value }))} />
                <input type="password" value={adminDraft.confirmPassword} placeholder="确认密码" autoComplete="new-password" onChange={(event) => setAdminDraft((previous) => ({ ...previous, confirmPassword: event.target.value }))} />
                <button type="button" disabled={adminBusy} onClick={() => void saveAdminAccount()}>{adminBusy ? "同步中…" : selectedAdmin?.configured ? "重置并同步" : "创建并同步"}</button>
              </div> : null}
            </div>
          </>
        ) : <p className="muted">正在读取 CloudBase 身份配置…</p>}
      </section>
    </div>
  );
}
