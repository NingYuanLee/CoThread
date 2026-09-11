import React, { useEffect, useState } from "react";

type Proof = { humanChallengeId: string; humanAnswer: string };

export function HumanVerification({ api, purpose, refreshKey, onChange }: {
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  purpose: "auth" | "bind";
  refreshKey: number;
  onChange: (proof: Proof) => void;
}) {
  const [challengeId, setChallengeId] = useState("");
  const [image, setImage] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    setAnswer("");
    onChange({ humanChallengeId: "", humanAnswer: "" });
    try {
      const result = await api(`/human-verification?purpose=${purpose}`);
      setChallengeId(result.challengeId);
      setImage(result.image);
    } catch (cause) {
      setChallengeId("");
      setImage("");
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [purpose, refreshKey]);

  const update = (value: string) => {
    const next = value.replace(/\s/g, "").slice(0, 6);
    setAnswer(next);
    onChange({ humanChallengeId: challengeId, humanAnswer: next });
  };

  return <div className="human-verification">
    <label>人类验证
      <div className="human-verification-row">
        <input value={answer} onChange={(event) => update(event.target.value)} maxLength={6}
          autoComplete="off" spellCheck={false} placeholder="输入图片字符" required />
        <button type="button" className="captcha-image" onClick={() => void load()} title="刷新验证码" disabled={loading}>
          {image ? <img src={image} alt="图片验证码" /> : <span>{loading ? "加载中" : "重新加载"}</span>}
        </button>
      </div>
    </label>
    {error && <small className="captcha-error" role="alert">{error}</small>}
  </div>;
}
