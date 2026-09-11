import React, { useEffect, useRef, useState } from "react";

type Authorization = {
  id: string; name: string; platform: string; version: string;
  approved_at: string | null; denied_at: string | null; consumed_at: string | null;
};

export function ConnectorAuthorization({ id, api, onDone }: {
  id: string;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  onDone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    void api(`/connector-authorizations/${id}`).then(setAuthorization).catch((cause) => setError((cause as Error).message));
  }, [id, api]);
  const decide = async (approved: boolean) => {
    setBusy(true); setError("");
    try {
      await api(`/connector-authorizations/${id}/decision`, { approved });
      if (approved) setAuthorization((current) => current && ({ ...current, approved_at: new Date().toISOString() }));
      else onDone();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="connector-authorization-dialog" onCancel={(event) => event.preventDefault()}>
    <header><div><small>LOCAL CONNECTOR</small><h2>授权本地连接器</h2></div></header>
    {authorization?.approved_at ? <section className="connector-authorization-result">
      <strong>授权完成</strong><p>可以返回连接器选择项目和本地目录。</p>
      <button type="button" className="primary" onClick={onDone}>完成</button>
    </section> : <>
      <dl>
        <div><dt>应用</dt><dd>Windows 连接器</dd></div>
        <div><dt>平台</dt><dd>{authorization ? `${authorization.platform} · v${authorization.version}` : "-"}</dd></div>
        <div><dt>权限</dt><dd>查看账号项目；仅在你为项目选择本地目录后领取任务</dd></div>
      </dl>
      {error && <p className="project-settings-error" role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={() => void decide(false)}>拒绝</button>
        <button type="button" className="primary" disabled={busy || !authorization} onClick={() => void decide(true)}>{busy ? "正在授权…" : "确认授权"}</button></footer>
    </>}
  </dialog>;
}
