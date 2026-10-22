import { DialogFooter } from "./DialogFooter";
import { FileField } from "./FileField";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";
import { RefreshButton } from "./IconButton";
import { DialogBody } from "./DialogBody";
import { DialogHeader } from "./DialogHeader";
import React, { useEffect, useRef, useState } from "react";
import { Dialog, animateDialogClose } from "./dialog-fx";
import { UiIcon } from "./ui-icon";
import { showTip, useTipError } from "./Tip";
import "./miniprogram.css";

type EnvironmentKind = "development" | "production";

type AccountEnvironment = {
  envId: string;
  alias: string | null;
  region: string | null;
  source: string | null;
};

type CloudbaseEnv = { envId: string; region: string | null };

type WechatCi = {
  robotPreview: number;
  robotUpload: number;
  descTemplate: string | null;
};

type SecretState = {
  configured: boolean;
  hint: string | null;
  updatedAt: string | null;
  secretId?: string | null;
};

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
    label: "代码上传密钥",
    hint: "选择微信公众平台下载的上传密钥文件（private.<AppID>.key）。文件内容只在后端加密保存，不写入项目文件。",
    mode: "file" as const,
  },
  cloudbase_credential: {
    label: "腾讯云子用户的API密钥",
    hint: "腾讯云 API 密钥对（控制台「访问管理 → API 密钥管理」）。环境级最小权限凭据；子 Agent 只能通过受控工具使用，不会拿到明文。",
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

function ClearCredentialDialog({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <Dialog
      onRequestClose={() => {
        if (!busy) onClose();
      }}
      enabled={!busy}
      ref={dialog}
      className="miniprogram-confirm-dialog"
      aria-labelledby="clear-credential-title"
    >
      <DialogHeader
        title={<>删除并清空配置</>}
        titleId="clear-credential-title"
        onClose={() => {
          if (!busy) animateDialogClose(dialog.current, onClose);
        }}
        disabled={busy}
        closeLabel="关闭"
      />
      <DialogBody>
        <p>
          确认后删除腾讯云子用户的 API 密钥，并清空已选环境和 Publishable Key。小程序 AppID
          和代码上传密钥不会删除。
        </p>
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          disabled={busy}
          onClick={() => animateDialogClose(dialog.current, onClose)}
        >
          取消
        </button>
        <button type="button" className="miniprogram-danger" disabled={busy} onClick={onConfirm}>
          {busy ? "删除中…" : "确认删除"}
        </button>
      </DialogFooter>
    </Dialog>
  );
}

export function ProjectMiniProgramConfig({
  projectId,
  canManage,
  api,
  section,
  onIdentity,
}: {
  projectId: string;
  canManage: boolean;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  section: "miniprogram" | "cloudbase";
  onIdentity?: (identity: { appId: string | null; appName: string | null }) => void;
}) {
  const [config, setConfig] = useState<MiniProgramConfig | null>(null);
  const [draft, setDraft] = useState<MiniProgramConfig | null>(null);
  const [publishableKeys, setPublishableKeys] = useState<Record<EnvironmentKind, string>>({
    development: "",
    production: "",
  });
  const [savedPublishableKeys, setSavedPublishableKeys] = useState<Record<EnvironmentKind, string>>(
    { development: "", production: "" },
  );
  const [serverApiKeys, setServerApiKeys] = useState<Record<EnvironmentKind, string>>({
    development: "",
    production: "",
  });
  const [serverApiKeyConfigured, setServerApiKeyConfigured] = useState<
    Record<EnvironmentKind, boolean>
  >({
    development: false,
    production: false,
  });
  const [serverApiKeyDirty, setServerApiKeyDirty] = useState<Record<EnvironmentKind, boolean>>({
    development: false,
    production: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useTipError();
  const [checks, setChecks] = useState<VerifyCheck[] | null>(null);
  // 微信上传密钥是公众平台下载的文件，不让用户把内容粘进密码框。
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const keyFileInput = useRef<HTMLInputElement | null>(null);
  // CloudBase 凭据拆成两个字段：控制台给的就是两段独立的值，拼在一起容易出错。
  const [cbPair, setCbPair] = useState({ secretId: "", secretKey: "" });
  const [secretBusy, setSecretBusy] = useState<string | null>(null);
  const [authSettings, setAuthSettings] = useState<
    Record<EnvironmentKind, CloudbaseAuthSettings | null>
  >({ development: null, production: null });
  const [adminAccounts, setAdminAccounts] = useState<
    Record<EnvironmentKind, CloudbaseAdminAccount | null>
  >({ development: null, production: null });
  const [authBusy, setAuthBusy] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminDraft, setAdminDraft] = useState({ username: "", password: "", confirmPassword: "" });
  const [selectedCloudbaseEnvironment, setSelectedCloudbaseEnvironment] =
    useState<EnvironmentKind>("development");
  const [accountEnvs, setAccountEnvs] = useState<AccountEnvironment[]>([]);
  const [accountEnvError, setAccountEnvError] = useState("");
  const [accountEnvBusy, setAccountEnvBusy] = useState(false);
  const [confirmClearCredential, setConfirmClearCredential] = useState(false);
  const [envListReload, setEnvListReload] = useState(0);

  const apply = (next: MiniProgramConfig) => {
    setConfig(next);
    setDraft(next);
    onIdentity?.({ appId: next.appId, appName: next.appName });
  };

  useEffect(() => {
    if (
      section !== "cloudbase" ||
      !draft?.appId ||
      !draft.secrets.cloudbase_credential.configured
    ) {
      return undefined;
    }
    let alive = true;
    setAccountEnvBusy(true);
    setAccountEnvError("");
    api("/projects/" + projectId + "/cloudbase/account-environments")
      .then((value) => {
        if (!alive) return;
        setAccountEnvs(value?.environments || []);
      })
      .catch((cause) => {
        if (!alive) return;
        setAccountEnvs([]);
        setAccountEnvError(cause instanceof Error ? cause.message : "环境列表读取失败");
      })
      .finally(() => {
        if (alive) setAccountEnvBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [
    section,
    projectId,
    api,
    draft?.appId,
    draft?.secrets.cloudbase_credential.configured,
    envListReload,
  ]);

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
        setServerApiKeyConfigured({
          development: Boolean(developmentAuth.miniprogram?.serverApiKeyConfigured),
          production: Boolean(productionAuth.miniprogram?.serverApiKeyConfigured),
        });
        setServerApiKeys({ development: "", production: "" });
        setServerApiKeyDirty({ development: false, production: false });
        const loadExtra = (path: string) =>
          Promise.race([
            api(path),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("CloudBase 配置读取超时")), 8000),
            ),
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
      const next = await api(
        `/projects/${projectId}/cloudbase/auth-settings`,
        {
          environment: selectedCloudbaseEnvironment,
          ...changes,
          ...(selectedCloudbaseEnvironment === "production" ? { confirmProduction: true } : {}),
        },
        "PUT",
      );
      setAuthSettings((previous) => ({ ...previous, [selectedCloudbaseEnvironment]: next }));
      showTip("CloudBase 登录方式已同步");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CloudBase 登录方式同步失败");
    } finally {
      setAuthBusy(false);
    }
  };

  const saveAdminAccount = async () => {
    if (
      !adminDraft.username.trim() ||
      adminDraft.password.length < 8 ||
      adminDraft.password !== adminDraft.confirmPassword
    ) {
      setError("请填写账号、至少 8 位密码，并确认两次密码一致");
      return;
    }
    setAdminBusy(true);
    setError("");
    try {
      const next = await api(
        `/projects/${projectId}/cloudbase/admin-account`,
        {
          environment: selectedCloudbaseEnvironment,
          username: adminDraft.username.trim(),
          password: adminDraft.password,
          ...(selectedCloudbaseEnvironment === "production" ? { confirmProduction: true } : {}),
        },
        "PUT",
      );
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

  const setEnv = (kind: EnvironmentKind, envId: string, region: string | null = null) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const envs = { ...previous.cloudbaseEnvs };
      if (!envId.trim()) delete envs[kind];
      else envs[kind] = { envId, region: region ?? envs[kind]?.region ?? null };
      setServerApiKeys((keys) => ({ ...keys, [kind]: "" }));
      setServerApiKeyConfigured((flags) => ({ ...flags, [kind]: false }));
      setServerApiKeyDirty((flags) => ({ ...flags, [kind]: true }));
      return { ...previous, cloudbaseEnvs: envs };
    });
  };

  const save = async () => {
    if (!draft || !config) return;
    setBusy(true);
    setError("");
    try {
      const configChanged = [
        "appId",
        "appName",
        "entryPage",
        "cloudbaseEnvs",
        "adminDeploy",
        "wechatCi",
      ].some(
        (field) =>
          JSON.stringify(draft[field as keyof MiniProgramConfig]) !==
          JSON.stringify(config[field as keyof MiniProgramConfig]),
      );
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
        const apiKey = serverApiKeys[environment].trim();
        const apiDirty = serverApiKeyDirty[environment];
        if (key === savedPublishableKeys[environment] && !apiDirty) continue;
        await api(
          `/projects/${projectId}/miniprogram-auth-config/publishable-key`,
          {
            environment,
            cloudbasePublishableKey: key || null,
            ...(apiDirty ? { cloudbaseServerApiKey: apiKey || null } : {}),
          },
          "PUT",
        );
        setSavedPublishableKeys((previous) => ({ ...previous, [environment]: key }));
        if (apiDirty) {
          setServerApiKeyConfigured((flags) => ({ ...flags, [environment]: Boolean(apiKey) }));
          setServerApiKeys((keys) => ({ ...keys, [environment]: "" }));
          setServerApiKeyDirty((flags) => ({ ...flags, [environment]: false }));
        }
      }
      showTip("已保存小程序与云开发配置");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveSecret = async (
    kind: "wechat_upload_key" | "cloudbase_credential",
    file?: File | null,
  ) => {
    setError("");
    let body:
      { value: string; fileName?: string } | { secretId: string; secretKey: string } | null = null;
    const picked = file || keyFile;
    if (kind === "cloudbase_credential") {
      body =
        cbPair.secretId.trim() && cbPair.secretKey.trim()
          ? { secretId: cbPair.secretId.trim(), secretKey: cbPair.secretKey.trim() }
          : null;
    } else if (picked) {
      let text = "";
      try {
        text = await picked.text();
      } catch {
        setError("密钥文件读取失败");
        return;
      }
      if (!text.trim()) {
        setError("密钥文件是空的");
        return;
      }
      if (text.includes("\0")) {
        setError("密钥文件不是文本私钥，请选择微信公众平台下载的 .key 文件");
        return;
      }
      if (new TextEncoder().encode(text).byteLength > 64 * 1024) {
        setError("密钥文件超过 64KB");
        return;
      }
      body = { value: text, fileName: picked.name };
    }
    if (!body) return;
    setSecretBusy(kind);
    try {
      const next = await api(`/projects/${projectId}/miniprogram-secrets/${kind}`, body, "PUT");
      apply(next as MiniProgramConfig);
      if (kind === "cloudbase_credential") {
        setConfirmClearCredential(false);
        setPublishableKeys({ development: "", production: "" });
        setSavedPublishableKeys({ development: "", production: "" });
        setAccountEnvs([]);
      }
      setKeyFile(null);
      if (keyFileInput.current) keyFileInput.current.value = "";
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
      if (kind === "cloudbase_credential") {
        setConfirmClearCredential(false);
        setPublishableKeys({ development: "", production: "" });
        setSavedPublishableKeys({ development: "", production: "" });
        setServerApiKeys({ development: "", production: "" });
        setServerApiKeyConfigured({ development: false, production: false });
        setServerApiKeyDirty({ development: false, production: false });
        setAccountEnvs([]);
        showTip("已删除腾讯云子用户的API密钥，并清空环境、Publishable Key 和服务端 API Key");
      } else {
        showTip("已清除" + SECRET_META[kind].label);
      }
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

  if (error && !draft) return <p className="muted">小程序配置读取失败，请稍后重试。</p>;
  if (!draft) return <p className="muted">正在加载小程序配置…</p>;

  const readOnly = !canManage;
  const statusTone = STATUS_TONES[draft.status] || "muted";
  const renderSecret = (kind: keyof typeof SECRET_META) => {
    const meta = SECRET_META[kind];
    const state = draft.secrets[kind];
    if (meta.mode === "file") {
      return (
        <div key={kind}>
          <FileField
            label={meta.label}
            value={state.configured ? state.hint || "已保存" : ""}
            placeholder="未上传"
            accept=".key,.pem,.txt,text/plain"
            title={meta.hint}
            disabled={readOnly}
            busy={secretBusy === kind}
            actionLabel="上传"
            onSelect={(file) => {
              setKeyFile(file);
              void saveSecret(kind, file);
            }}
          />
          <a
            className="miniprogram-field-doc"
            href="https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html"
            target="_blank"
            rel="noreferrer"
            aria-label="miniprogram-ci 官方文档"
            title="miniprogram-ci 官方文档"
          >
            <span className="miniprogram-field-doc-mark" aria-hidden="true">
              ?
            </span>
            miniprogram-ci 官方文档
          </a>
        </div>
      );
    }
    return (
      <div key={kind}>
        {readOnly ? (
          <p className="muted miniprogram-note">
            {state.configured ? "已保存 " + (state.hint || "") : "未配置"}
          </p>
        ) : meta.mode === "pair" ? (
          <div className="miniprogram-secret-rows">
            <TextField
              label="SecretId"
              value={state.configured ? state.secretId || "" : cbPair.secretId}
              autoComplete="off"
              spellCheck={false}
              readOnly={state.configured}
              disabled={state.configured}
              onChange={(event) =>
                setCbPair((previous) => ({ ...previous, secretId: event.target.value }))
              }
            />
            <TextField
              label="SecretKey"
              type="password"
              value={state.configured ? "********" : cbPair.secretKey}
              autoComplete="new-password"
              readOnly={state.configured}
              disabled={state.configured}
              onChange={(event) =>
                setCbPair((previous) => ({ ...previous, secretKey: event.target.value }))
              }
            />
            <div className="miniprogram-field">
              <span className="miniprogram-secret-actions">
                {state.configured ? (
                  <>
                    <button
                      type="button"
                      className="miniprogram-danger"
                      disabled={secretBusy === kind}
                      onClick={() => setConfirmClearCredential(true)}
                    >
                      删除并清空配置
                    </button>
                    <RefreshButton
                      pending={accountEnvBusy}
                      type="button"
                      disabled={accountEnvBusy}
                      onClick={() => setEnvListReload((value) => value + 1)}
                      label="刷新可用环境列表"
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={
                      secretBusy === kind || !cbPair.secretId.trim() || !cbPair.secretKey.trim()
                    }
                    onClick={() => void saveSecret(kind)}
                  >
                    {secretBusy === kind ? "获取中…" : "获取环境并保存"}
                  </button>
                )}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="miniprogram-config">
      {confirmClearCredential ? (
        <ClearCredentialDialog
          busy={secretBusy === "cloudbase_credential"}
          onClose={() => setConfirmClearCredential(false)}
          onConfirm={() => void clearSecret("cloudbase_credential")}
        />
      ) : null}
      <div className="miniprogram-config-head">
        <div className="settings-content-heading">
          <p>
            {section === "cloudbase"
              ? "环境、凭据和登录方式。不配也可以做纯前端小程序；Admin 预览、云数据库、云存储、云函数和静态托管需要这里。"
              : "微信身份、Dimina 预览和体验版上传。不依赖 CloudBase。上传私钥只在后端加密保存。"}
          </p>
        </div>
        <span className={`miniprogram-status ${statusTone}`}>
          {STATUS_LABELS[draft.status] || draft.status}
        </span>
      </div>

      {draft.lastVerifyError ? (
        <p className="miniprogram-config-error">上次验证：{draft.lastVerifyError}</p>
      ) : null}

      {section === "miniprogram" ? (
        <section className="miniprogram-config-section">
          <TextField
            label="AppID"
            value={draft.appId || ""}
            hint="例如 wx1234567890abcdef"
            disabled={readOnly}
            autoComplete="off"
            onChange={(event) => patch({ appId: event.target.value })}
          />
          <TextField
            label="小程序名称"
            value={draft.appName || ""}
            disabled={readOnly}
            autoComplete="off"
            onChange={(event) => patch({ appName: event.target.value })}
          />
          <TextField
            label="默认启动首页"
            value={draft.entryPage || ""}
            hint="例如 pages/index/index"
            disabled={readOnly}
            autoComplete="off"
            onChange={(event) => patch({ entryPage: event.target.value })}
          />
          {renderSecret("wechat_upload_key")}
        </section>
      ) : null}

      {section === "cloudbase" && draft && !draft.appId ? (
        <p className="miniprogram-config-error">
          请先在「小程序」页保存微信 AppID。CloudBase 环境会绑定到那个小程序，不能单独配置。
        </p>
      ) : null}
      {section === "cloudbase" && draft?.appId ? (
        <section className="miniprogram-config-section">
          <div className="miniprogram-key-heading">
            <h4>腾讯云子用户的API密钥</h4>
            <a
              className="miniprogram-field-doc"
              href="https://cloud.tencent.com/document/product/598/13674"
              target="_blank"
              rel="noreferrer"
              aria-label="创建腾讯云子用户"
              title="创建腾讯云子用户"
            >
              <span className="miniprogram-field-doc-mark" aria-hidden="true">
                ?
              </span>
              创建子用户
            </a>
          </div>
          {renderSecret("cloudbase_credential")}
          {draft.secrets.cloudbase_credential.configured ? (
            <>
              <hr className="miniprogram-config-divider" />
              <h4>CloudBase环境</h4>
              <p className="muted miniprogram-note">
                {accountEnvBusy
                  ? "正在读取环境列表…"
                  : accountEnvError ||
                    (accountEnvs.length
                      ? "请选择开发环境和生产环境。生产环境留空则沿用开发环境。"
                      : "这个凭据下没有可用环境。")}
              </p>
              <div className="miniprogram-env-cards">
                {(Object.keys(ENVIRONMENT_LABELS) as EnvironmentKind[]).map((kind) => {
                  const currentEnvId = draft.cloudbaseEnvs[kind]?.envId || "";
                  const orphanEnvId =
                    currentEnvId && !accountEnvs.some((item) => item.envId === currentEnvId)
                      ? currentEnvId
                      : "";
                  const envOptions = [
                    {
                      value: "",
                      label: kind === "production" ? "留空沿用开发环境" : "不使用 CloudBase",
                    },
                    ...(orphanEnvId ? [{ value: orphanEnvId, label: orphanEnvId }] : []),
                    ...accountEnvs.map((item) => ({
                      value: item.envId,
                      label: (item.alias ? item.alias + " · " : "") + item.envId,
                    })),
                  ];
                  return (
                    <div className="miniprogram-env-card" key={kind}>
                      <h4>{ENVIRONMENT_LABELS[kind]}</h4>
                      <SelectField
                        label="云环境"
                        aria-label={ENVIRONMENT_LABELS[kind]}
                        value={currentEnvId}
                        disabled={
                          readOnly ||
                          !draft.secrets.cloudbase_credential.configured ||
                          accountEnvBusy
                        }
                        onChange={(envId) => {
                          const match = accountEnvs.find((item) => item.envId === envId);
                          setEnv(kind, envId, match?.region || null);
                        }}
                        options={envOptions}
                      />
                      <TextField
                        label="Publishable Key"
                        aria-label={`${ENVIRONMENT_LABELS[kind]} Publishable Key`}
                        value={publishableKeys[kind]}
                        maxLength={16384}
                        hint={kind === "development" ? "粘贴 Publishable Key" : "留空沿用开发环境"}
                        disabled={readOnly || busy}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) =>
                          setPublishableKeys((previous) => ({
                            ...previous,
                            [kind]: event.target.value,
                          }))
                        }
                      />
                      <TextField
                        label="服务端 API Key"
                        type="password"
                        aria-label={ENVIRONMENT_LABELS[kind] + " 服务端 API Key"}
                        value={serverApiKeys[kind]}
                        maxLength={16384}
                        hint={
                          !currentEnvId
                            ? "先选择环境"
                            : serverApiKeyConfigured[kind]
                              ? "已保存，留空不修改"
                              : "这个环境的服务端 API Key"
                        }
                        disabled={readOnly || busy || !currentEnvId}
                        autoComplete="new-password"
                        onChange={(event) => {
                          const value = event.target.value;
                          setServerApiKeys((previous) => ({ ...previous, [kind]: value }));
                          setServerApiKeyDirty((previous) => ({ ...previous, [kind]: true }));
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="muted miniprogram-note">
                留空则没有 CloudBase。Admin 预览、云数据库、云存储、云函数和静态托管都不可用。Dimina
                预览和微信上传不受影响。生产环境留空时沿用开发环境。
              </p>
              <p className="muted miniprogram-note">
                真机 CloudBase 云函数调用要求小程序页里的微信 AppID
                已关联这个环境，或已获得同主体的环境共享。不同主体不能共用一个环境。
              </p>
              {readOnly ? null : (
                <div className="miniprogram-config-actions">
                  <button type="button" disabled={busy} onClick={() => void save()}>
                    {busy ? "处理中…" : "保存配置"}
                  </button>
                </div>
              )}
            </>
          ) : null}
        </section>
      ) : null}

      {section === "miniprogram" ? (
        <section className="miniprogram-config-section">
          <h4>微信连接测试</h4>
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
              {checks
                .filter((check) => check.id.startsWith("wechat"))
                .map((check) => (
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
            向微信生成一次预览来核对代码上传密钥和 AppID。这不是体验版，也不上传正式版本。不需要
            CloudBase。
          </p>
        </section>
      ) : null}
      {section === "cloudbase" && draft?.appId && draft.secrets.cloudbase_credential.configured ? (
        <section className="miniprogram-config-section cloudbase-auth-settings">
          <h4>CloudBase 身份认证</h4>
          <SelectField
            label="同步环境"
            value={selectedCloudbaseEnvironment}
            disabled={readOnly || authBusy || adminBusy}
            options={[
              { value: "development", label: "开发环境" },
              { value: "production", label: "生产环境" },
            ]}
            onChange={(value) => setSelectedCloudbaseEnvironment(value as EnvironmentKind)}
          />
          {selectedAuth ? (
            <>
              <p className="muted miniprogram-note">
                直接同步到 {selectedAuth.envId}。生产环境修改需要明确确认，密码不会回显或写入源码。
              </p>
              <div className="cloudbase-auth-switches">
                {(
                  [
                    ["anonymousLogin", "匿名登录（开发预览静默登录）"],
                    ["usernameLogin", "用户名密码登录"],
                    ["emailLogin", "邮箱登录"],
                    ["phoneNumberLogin", "手机号登录"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="cloudbase-auth-switch">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedAuth[key])}
                      disabled={readOnly || authBusy}
                      onChange={(event) => void updateAuthSettings({ [key]: event.target.checked })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="cloudbase-admin-account">
                <div>
                  <strong>Admin 首个账号</strong>
                  <small>
                    {selectedAdmin?.configured ? `已配置：${selectedAdmin.username}` : "尚未配置"}
                  </small>
                </div>
                {!readOnly ? (
                  <>
                    <div className="cloudbase-admin-fields">
                      <TextField
                        label="管理员账号"
                        value={adminDraft.username}
                        hint="用户名或邮箱"
                        autoComplete="username"
                        onChange={(event) =>
                          setAdminDraft((previous) => ({
                            ...previous,
                            username: event.target.value,
                          }))
                        }
                      />
                      <TextField
                        label="新密码"
                        type="password"
                        value={adminDraft.password}
                        hint="至少 8 位"
                        autoComplete="new-password"
                        onChange={(event) =>
                          setAdminDraft((previous) => ({
                            ...previous,
                            password: event.target.value,
                          }))
                        }
                      />
                      <TextField
                        label="确认密码"
                        type="password"
                        value={adminDraft.confirmPassword}
                        hint="再输入一次新密码"
                        autoComplete="new-password"
                        onChange={(event) =>
                          setAdminDraft((previous) => ({
                            ...previous,
                            confirmPassword: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="miniprogram-config-actions">
                      <button
                        type="button"
                        disabled={adminBusy}
                        onClick={() => void saveAdminAccount()}
                      >
                        {adminBusy
                          ? "同步中…"
                          : selectedAdmin?.configured
                            ? "重置并同步"
                            : "创建并同步"}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <p className="muted">正在读取 CloudBase 身份配置…</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
