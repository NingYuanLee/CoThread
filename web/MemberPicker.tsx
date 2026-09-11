import React, { useEffect, useState } from "react";

export function MemberPicker({ projectId, api, onClose, onAdded }: {
  projectId: string;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [accounts, setAccounts] = useState<{ id: string; username: string; name: string; email: string | null; avatar?: string | null }[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = () => api(`/users?projectId=${encodeURIComponent(projectId)}`).then(setAccounts);
  useEffect(() => { void load().catch((e) => setError(e.message)); }, [projectId]);
  const visible = accounts.filter((account) => `${account.name} ${account.username} ${account.email || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="modal member-picker" role="dialog" aria-modal="true" aria-labelledby="member-picker-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h2 id="member-picker-title">添加项目成员</h2><button type="button" onClick={onClose} aria-label="关闭">×</button></div>
      <input autoFocus className="member-search" aria-label="搜索系统账号" placeholder="搜索姓名或邮箱" value={search} onChange={(event) => setSearch(event.target.value)} />
      {error && <div className="error" role="alert">{error}</div>}
      <div className="member-picker-list">
        {visible.map((account) => <div className="member" key={account.id}>
          <span className="avatar">{account.avatar ? <img src={account.avatar} alt="" /> : account.name[0]}</span>
          <div><strong>{account.name}</strong><small>账号：{account.username}{account.email ? ` · ${account.email}` : ""}</small></div>
          <button type="button" className="primary" disabled={!!busy} onClick={() => {
            setBusy(account.id); setError("");
            void api(`/projects/${projectId}/members`, { userId: account.id, role: "member" })
              .then(async () => { await onAdded(); await load(); })
              .catch((e) => setError(e.message)).finally(() => setBusy(""));
          }}>{busy === account.id ? "添加中…" : "添加"}</button>
        </div>)}
        {!visible.length && <p className="empty-state">没有可添加的系统账号</p>}
      </div>
    </section>
  </div>;
}
