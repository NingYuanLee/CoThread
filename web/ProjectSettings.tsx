import React, { useEffect, useState } from "react";

export function ProjectSettings({ name, createdAt, creator, onSave }: {
  name: string;
  createdAt: string;
  creator: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(name); }, [name]);
  return (
    <section className="project-settings">
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (saving || !creator || !draft.trim() || draft.trim() === name) return;
        setSaving(true);
        setError("");
        setSaved(false);
        try { await onSave(draft.trim()); setSaved(true); }
        catch (error) { setError((error as Error).message); }
        finally { setSaving(false); }
      }}>
        <label htmlFor="project-settings-name">项目名称</label>
        {creator ? <input id="project-settings-name" value={draft} required maxLength={120}
          disabled={saving} onChange={(event) => { setDraft(event.target.value); setSaved(false); }} />
          : <p className="project-settings-value">{name}</p>}
        <small>仅项目创建人可修改项目名称</small>
        {creator && <button type="submit" disabled={saving || !draft.trim() || draft.trim() === name}>
          {saving ? "保存中…" : "保存名称"}
        </button>}
        {error && <p role="alert" className="project-settings-error">{error}</p>}
        {saved && <p role="status">项目名称已保存</p>}
      </form>
      <div>
        <span className="project-settings-label">创建时间</span>
        <p className="project-settings-value">{createdAt}</p>
      </div>
      <div className="project-settings-archive">
        <button type="button" disabled>归档项目</button>
        <small>暂未开放</small>
      </div>
    </section>
  );
}
