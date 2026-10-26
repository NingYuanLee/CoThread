import { useEffect, useState } from "react";
import { TextField } from "./TextField";

type SkillStatus = {
  key: string;
  name: string;
  hint: string;
  configured: boolean;
  updatedAt: string | null;
};

export function SkillSettings({
  api,
}: {
  api: (path: string, body?: unknown, method?: string) => Promise<unknown>;
}) {
  const [skills, setSkills] = useState<SkillStatus[]>([]);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api("/me/skills").then((value) => {
      const list = (value as { skills?: SkillStatus[] }).skills || [];
      setSkills(list);
    });

  useEffect(() => {
    void load().catch((reason: Error) => setError(reason.message));
  }, []);

  const miaowen = skills.find((skill) => skill.key === "miaowen");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/me/skills/miaowen", { token }, "PUT");
      setToken("");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/me/skills/miaowen", {}, "DELETE");
      setToken("");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-skill-panel">
      <p>{miaowen?.hint || "技能钥匙只属于当前登录账号。"}</p>
      <p className="muted">
        {miaowen?.configured ? "当前账号已保存妙问 API KEY。" : "当前账号还没有保存妙问 API KEY。"}
      </p>
      <TextField
        label="妙问 API KEY"
        type="password"
        autoComplete="off"
        value={token}
        disabled={busy}
        placeholder="sk-mw-"
        onChange={(event) => setToken(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
      />
      {error && <p className="error">{error}</p>}
      <div className="dialog-actions">
        <button type="button" disabled={busy || !token.trim()} onClick={() => void save()}>
          保存到当前账号
        </button>
        {miaowen?.configured && (
          <button type="button" className="secondary" disabled={busy} onClick={() => void clear()}>
            清除
          </button>
        )}
      </div>
    </div>
  );
}
