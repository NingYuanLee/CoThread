import React, { useEffect, useState } from "react";
import { HumanVerification } from "./HumanVerification";
import { ResendCountdown } from "./ResendCountdown";

export function EmailBinding({ email, api, onBound }: {
  email: string | null;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  onBound: (profile: any) => void;
}) {
  const [challengeId, setChallengeId] = useState("");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [humanProof, setHumanProof] = useState({ humanChallengeId: "", humanAnswer: "" });
  const [humanRefresh, setHumanRefresh] = useState(0);
  const [humanRequired, setHumanRequired] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const refreshHumanStatus = async (refreshChallenge = false) => {
    const result = await api("/human-verification/status?scope=bind");
    setHumanRequired(result.required);
    if (result.required && refreshChallenge) setHumanRefresh((value) => value + 1);
    if (!result.required) setHumanProof({ humanChallengeId: "", humanAnswer: "" });
  };
  useEffect(() => { void refreshHumanStatus(); }, []);
  const act = async () => {
    setBusy(true); setError("");
    try {
      if (!challengeId) {
        const result = await api("/email/bind/request", { email: address, ...(humanRequired ? humanProof : {}) });
        setChallengeId(result.challengeId);
        setSentAt(Date.now());
        await refreshHumanStatus();
      } else {
        onBound(await api("/email/bind/confirm", { challengeId, code }));
        setChallengeId(""); setAddress(""); setCode("");
      }
    } catch (cause) {
      setError((cause as Error).message);
      if (!challengeId) {
        try { await refreshHumanStatus(humanRequired); } catch { /* Keep the original action error visible. */ }
      }
    }
    finally { setBusy(false); }
  };
  return <section className="email-binding">
    <div><strong>{email ? "更换绑定邮箱" : "绑定邮箱"}</strong><small>{email ? `当前邮箱：${email}` : "绑定后可使用邮箱登录和找回密码"}</small></div>
    {!challengeId ? <><label>新邮箱<input type="email" value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="email" /></label>
      {humanRequired && <HumanVerification api={api} purpose="bind" refreshKey={humanRefresh} onChange={setHumanProof} />}</>
      : <div className="email-code-step">
        <p className="auth-notice">收件服务器已接受发往 {address} 的验证码邮件，请在 10 分钟内输入。</p>
        <label>邮箱验证码<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" autoFocus /></label>
        <button type="button" className="text-action" onClick={() => { setChallengeId(""); setCode(""); setAddress(""); void refreshHumanStatus(true); }}>更换邮箱</button>
        <ResendCountdown sentAt={sentAt} onResend={() => { setChallengeId(""); setCode(""); void refreshHumanStatus(true); }} />
      </div>}
    {error && <div className="error" role="alert">{error}</div>}
    <button type="button" disabled={busy || (!challengeId ? !address || (humanRequired && (!humanProof.humanChallengeId || !humanProof.humanAnswer)) : !/^\d{6}$/.test(code))} onClick={() => void act()}>{busy ? "处理中…" : challengeId ? "确认绑定" : "发送邮箱验证码"}</button>
  </section>;
}
