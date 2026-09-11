import React, { useEffect, useState } from "react";
import { HumanVerification } from "./HumanVerification";
import { ResendCountdown } from "./ResendCountdown";
import { PasswordField } from "./PasswordField";

type Api = (path: string, data?: unknown, method?: string) => Promise<any>;
type Mode = "login" | "register" | "recover";

export function EmailAuth({ api, onLogin }: { api: Api; onLogin: (user: any) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [challengeId, setChallengeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [humanProof, setHumanProof] = useState({ humanChallengeId: "", humanAnswer: "" });
  const [humanRefresh, setHumanRefresh] = useState(0);
  const [humanRequired, setHumanRequired] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const refreshHumanStatus = async (refreshChallenge = false) => {
    const result = await api("/human-verification/status?scope=auth");
    setHumanRequired(result.required);
    if (result.required && refreshChallenge) setHumanRefresh((value) => value + 1);
    if (!result.required) setHumanProof({ humanChallengeId: "", humanAnswer: "" });
    return Boolean(result.required);
  };
  useEffect(() => { void refreshHumanStatus(); }, []);
  const switchMode = (next: Mode) => {
    setMode(next); setChallengeId(""); setError(""); setNotice(""); setDraft({});
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget), value = (key: string) => String(form.get(key) || "");
    try {
      if (mode === "login") onLogin(await api("/login", {
        identifier: value("identifier"), password: value("password"), ...(humanRequired ? humanProof : {}),
      }));
      else if (!challengeId) {
        const requestData = {
          email: value("email"), password: value("password"), ...(humanRequired ? humanProof : {}),
        };
        setDraft(Object.fromEntries(Object.entries(requestData).filter(([key]) => !key.startsWith("human") && key !== "password")));
        const result = await api(`/email/${mode}/request`, requestData);
        setChallengeId(result.challengeId); setSentAt(Date.now());
        await refreshHumanStatus();
        setNotice(result.deliveryStatus === "accepted"
          ? "收件服务器已接受验证码邮件，请在 10 分钟内完成验证。"
          : "如果该邮箱已绑定账号，验证码邮件将会发送，请检查收件箱和垃圾邮件。"
        );
      } else {
        const result = await api(`/email/${mode}/confirm`, { challengeId, code: value("code") });
        onLogin(result);
        return;
      }
    } catch (cause) {
      setError((cause as Error).message);
      if (!challengeId) {
        try { await refreshHumanStatus(humanRequired); } catch { /* Keep the original action error visible. */ }
      }
    }
    finally { setBusy(false); }
  };
  return <form className="login-card" onSubmit={submit} onPointerMove={(event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spot-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--spot-y", `${event.clientY - bounds.top}px`);
  }}>
    <span className="eyebrow">WORKSPACE</span>
    <div className="auth-mode-tabs" role="tablist" aria-label="账号入口">
      {(["login", "register", "recover"] as Mode[]).map((value) => <button key={value} type="button" role="tab"
        aria-selected={mode === value} className={mode === value ? "active" : ""} onClick={() => switchMode(value)}>
        {value === "login" ? "登录" : value === "register" ? "注册" : "重置密码"}
      </button>)}
    </div>
    <h2>{mode === "login" ? "回到共同的上下文" : mode === "register" ? "创建共序账号" : "重置密码"}</h2>
    <p>{challengeId ? "输入邮箱中收到的验证码" : mode === "login" ? "使用账号或已绑定邮箱登录" : mode === "register" ? "验证邮箱后完成注册" : "通过已绑定邮箱重置密码"}</p>
    {mode === "login" && <><label>账号或邮箱<input name="identifier" defaultValue="admin@cothread.local" autoComplete="username" required /></label>
      <label>密码<input name="password" type="password" autoComplete="current-password" required /></label></>}
    {mode === "register" && !challengeId && <>
      <label>邮箱<input name="email" defaultValue={draft.email || ""} type="email" autoComplete="email" required /></label>
      <PasswordField autoComplete="new-password" required />
    </>}
    {mode === "recover" && !challengeId && <>
      <label>已绑定邮箱<input name="email" defaultValue={draft.email || ""} type="email" autoComplete="email" required /></label>
      <PasswordField label="新密码" autoComplete="new-password" required />
    </>}
    {humanRequired && !challengeId && <HumanVerification api={api} purpose="auth" refreshKey={humanRefresh} onChange={setHumanProof} />}
    {challengeId && <>
      <label>验证码<input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required /></label>
      <ResendCountdown sentAt={sentAt} onResend={() => { setChallengeId(""); setNotice(""); void refreshHumanStatus(true); }} />
    </>}
    {notice && <div className="auth-notice" role="status">{notice}</div>}
    {error && <div className="error" role="alert">{error}</div>}
    <button className="primary" disabled={busy || (humanRequired && !challengeId && (!humanProof.humanChallengeId || !humanProof.humanAnswer))}>{busy ? "正在处理…" : mode === "login" ? "进入工作空间 →" : challengeId ? "确认" : "发送验证码"}</button>
  </form>;
}
