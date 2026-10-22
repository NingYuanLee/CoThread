import React, { useEffect, useRef, useState } from "react";
import { TextField } from "./TextField";
import { HumanVerification } from "./HumanVerification";
import { ResendCountdown } from "./ResendCountdown";
import { PasswordField } from "./PasswordField";
import { SlideSwitch } from "./SlideSwitch";
import { UiIcon } from "./ui-icon";
import { showTip, useTipError } from "./Tip";
import { AccountSwitchList } from "./AccountSwitchList";
import {
  acceptSessionResult,
  clearSavedAccountToken,
  listSavedAccounts,
  setLoginHint,
  mergeKnownAccounts,
  takeLoginHint,
  takeLoginNotice,
  type SavedAccount,
} from "./saved-accounts";

type Api = (path: string, data?: unknown, method?: string) => Promise<any>;
type Mode = "login" | "register" | "recover";

export function EmailAuth({ api, onLogin }: { api: Api; onLogin: (user: any) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [challengeId, setChallengeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError, setInlineError] = useTipError();
  const [notice, setNotice] = useState("");
  const [humanProof, setHumanProof] = useState({ humanChallengeId: "", humanAnswer: "" });
  const [humanRefresh, setHumanRefresh] = useState(0);
  const [humanRequired, setHumanRequired] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<SavedAccount[]>(() => listSavedAccounts());
  const [loginView, setLoginView] = useState<"quick" | "password">(() =>
    listSavedAccounts().length ? "quick" : "password",
  );
  const loginViewTouched = useRef(false);
  const [identifierDefault, setIdentifierDefault] = useState(
    () => takeLoginHint() || "admin@cothread.local",
  );
  const latestAccount = accounts[0] ?? null;
  const showQuickLogin = mode === "login" && loginView === "quick" && latestAccount != null;
  const showPasswordLogin = () => {
    loginViewTouched.current = true;
    setLoginView("password");
  };
  const showQuickEntry = () => {
    loginViewTouched.current = true;
    setLoginView("quick");
  };
  useEffect(() => {
    const notice = takeLoginNotice();
    if (notice) setInlineError(notice);
    void mergeKnownAccounts(api)
      .then(setAccounts)
      .catch(() => setAccounts(listSavedAccounts()));
  }, []);
  useEffect(() => {
    if (!accounts.length) {
      setLoginView("password");
      return;
    }
    if (!loginViewTouched.current) setLoginView("quick");
  }, [accounts]);
  const refreshHumanStatus = async (refreshChallenge = false) => {
    const result = await api("/human-verification/status?scope=auth");
    setHumanRequired(result.required);
    if (result.required && refreshChallenge) setHumanRefresh((value) => value + 1);
    if (!result.required) setHumanProof({ humanChallengeId: "", humanAnswer: "" });
    return Boolean(result.required);
  };
  useEffect(() => {
    void refreshHumanStatus();
  }, []);
  const switchMode = (next: Mode) => {
    setMode(next);
    setChallengeId("");
    setError("");
    setNotice("");
    setDraft({});
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget),
      value = (key: string) => String(form.get(key) || "");
    try {
      if (mode === "login") {
        const remember = form.get("rememberDevice") === "on";
        onLogin(
          acceptSessionResult(
            await api("/login", {
              identifier: value("identifier"),
              password: value("password"),
              remember,
              ...(humanRequired ? humanProof : {}),
            }),
            remember,
          ),
        );
      } else if (!challengeId) {
        const requestData = {
          email: value("email"),
          password: value("password"),
          ...(humanRequired ? humanProof : {}),
        };
        setDraft(
          Object.fromEntries(
            Object.entries(requestData).filter(
              ([key]) => !key.startsWith("human") && key !== "password",
            ),
          ),
        );
        const result = await api(`/email/${mode}/request`, requestData);
        setChallengeId(result.challengeId);
        setSentAt(Date.now());
        await refreshHumanStatus();
        setNotice(
          [
            result.deliveryStatus === "accepted"
              ? "收件服务器已接受验证码邮件，请在 10 分钟内完成验证。"
              : "如果该邮箱已绑定账号，验证码邮件将会发送，请检查收件箱和垃圾邮件。",
            result.devCode ? `本机验证码：${result.devCode}` : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
        showTip("验证码已发送", "info");
      } else {
        const result = await api(`/email/${mode}/confirm`, { challengeId, code: value("code") });
        onLogin(acceptSessionResult(result));
        return;
      }
    } catch (cause) {
      setError((cause as Error).message);
      if (!challengeId) {
        try {
          await refreshHumanStatus(humanRequired);
        } catch {
          /* Keep the original action error visible. */
        }
      }
    } finally {
      setBusy(false);
    }
  };
  const switchAccount = async (account: SavedAccount) => {
    if (!account.token) {
      setIdentifierDefault(account.email || account.username);
      showPasswordLogin();
      setError("该账号需要重新登录");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const profile = await api("/session/switch", { token: account.token });
      onLogin(acceptSessionResult({ ...profile, sessionToken: account.token }));
    } catch (cause) {
      const status = (cause as { status?: number }).status;
      if (status === 401) {
        clearSavedAccountToken(account.id);
        setAccounts(listSavedAccounts());
        setIdentifierDefault(account.email || account.username);
        setLoginHint(account.email || account.username);
        showPasswordLogin();
        setError("该账号登录已过期，请重新登录");
      } else {
        setError((cause as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="login-card"
      onSubmit={submit}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--spot-x", `${event.clientX - bounds.left}px`);
        event.currentTarget.style.setProperty("--spot-y", `${event.clientY - bounds.top}px`);
      }}
    >
      <span className="eyebrow">工作空间</span>
      <SlideSwitch
        className="auth-mode-tabs"
        stretch
        reselect
        label="账号入口"
        value={mode}
        onChange={switchMode}
        items={[
          {
            value: "login",
            label: (
              <>
                <UiIcon name="login" size={13} />
                登录
              </>
            ),
          },
          {
            value: "register",
            label: (
              <>
                <UiIcon name="userPlus" size={13} />
                注册
              </>
            ),
          },
          {
            value: "recover",
            label: (
              <>
                <UiIcon name="key" size={13} />
                重置密码
              </>
            ),
          },
        ]}
      />
      <h2>
        {mode === "login" ? "回到共同的上下文" : mode === "register" ? "创建共序账号" : "重置密码"}
      </h2>
      {(challengeId || mode !== "login" || !showQuickLogin) && (
        <p>
          {challengeId
            ? "输入邮箱中收到的验证码"
            : mode === "register"
              ? "验证邮箱后完成注册"
              : mode === "recover"
                ? "通过已绑定邮箱重置密码"
                : "使用用户名或邮箱登录"}
        </p>
      )}
      {showQuickLogin && latestAccount && (
        <div className="login-quick">
          <AccountSwitchList
            variant="tiles"
            accounts={[latestAccount]}
            busy={busy}
            onSwitch={(account) => void switchAccount(account)}
          />
          <button
            type="button"
            className="login-switch-account"
            disabled={busy}
            onClick={showPasswordLogin}
          >
            切换其它账号
          </button>
        </div>
      )}
      {mode === "login" && !showQuickLogin && (
        <>
          <TextField
            key={identifierDefault}
            label="用户名或邮箱"
            name="identifier"
            defaultValue={identifierDefault}
            autoComplete="username"
            required
          />
          <TextField
            label="密码"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <label className="remember-device">
            <input type="checkbox" name="rememberDevice" />
            在当前设备记住登录信息
          </label>
        </>
      )}
      {mode === "register" && !challengeId && (
        <>
          <TextField
            label="邮箱"
            name="email"
            defaultValue={draft.email || ""}
            type="email"
            autoComplete="email"
            required
          />
          <PasswordField autoComplete="new-password" required />
        </>
      )}
      {mode === "recover" && !challengeId && (
        <>
          <TextField
            label="已绑定邮箱"
            name="email"
            defaultValue={draft.email || ""}
            type="email"
            autoComplete="email"
            required
          />
          <PasswordField label="新密码" autoComplete="new-password" required />
        </>
      )}
      {humanRequired && !challengeId && !showQuickLogin && (
        <HumanVerification
          api={api}
          purpose="auth"
          refreshKey={humanRefresh}
          onChange={setHumanProof}
        />
      )}
      {challengeId && (
        <>
          <TextField
            label="验证码"
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
          />
          <ResendCountdown
            sentAt={sentAt}
            onResend={() => {
              setChallengeId("");
              setNotice("");
              void refreshHumanStatus(true);
            }}
          />
        </>
      )}
      {notice && (
        <div className="auth-notice" role="status">
          {notice}
        </div>
      )}
      {!showQuickLogin && (
        <button
          className="primary"
          disabled={
            busy ||
            (humanRequired &&
              !challengeId &&
              (!humanProof.humanChallengeId || !humanProof.humanAnswer))
          }
        >
          <UiIcon
            name={busy ? "running" : mode === "login" ? "login" : challengeId ? "check" : "email"}
            size={14}
          />
          {busy
            ? "正在处理…"
            : mode === "login"
              ? "进入工作空间"
              : challengeId
                ? "确认"
                : "发送验证码"}
        </button>
      )}
      {mode === "login" && !showQuickLogin && latestAccount && (
        <button type="button" className="login-switch-quick" onClick={showQuickEntry}>
          切换快捷登录
        </button>
      )}
    </form>
  );
}
