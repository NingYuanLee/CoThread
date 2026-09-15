import React, { useEffect, useRef, useState } from "react";

export function ProjectSettings({ name, createdAt, creator, longTermSummary, onSave }: {
  name: string;
  createdAt: string;
  creator: boolean;
  longTermSummary?: { summary: string; updatedAt: string | null; lastThreadTitle: string | null } | null;
  onSave: (name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
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
      <div className="project-settings-agent">
        <span className="project-settings-label">项目长期总结</span>
        <p className="project-settings-value">
          {longTermSummary?.summary
            ? (longTermSummary.lastThreadTitle
              ? `最近由「${longTermSummary.lastThreadTitle}」归档更新`
              : "已有项目级长期记忆")
            : "归档迭代后，会把该轮结论沉淀到这里供后续沿用"}
        </p>
        <button type="button" onClick={() => setSummaryOpen(true)}>查看</button>
      </div>
      <div className="project-settings-archive">
        <button type="button" disabled>归档项目</button>
        <small>暂未开放</small>
      </div>
      {summaryOpen ? <ProjectSummaryDialog summary={longTermSummary} onClose={() => setSummaryOpen(false)} /> : null}
    </section>
  );
}

function ProjectSummaryDialog({ summary, onClose }: {
  summary?: { summary: string; updatedAt: string | null; lastThreadTitle: string | null } | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="l3-task-detail-dialog project-summary-dialog" aria-labelledby="project-summary-title" onCancel={onClose}>
    <header className="agent-monitor-header">
      <div>
        <span>项目记忆</span>
        <h2 id="project-summary-title">项目长期总结</h2>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭项目长期总结" title="关闭">×</button>
    </header>
    <div className="project-summary-body">
      {summary?.lastThreadTitle ? <p className="project-summary-meta">最近更新来源：{summary.lastThreadTitle}</p> : null}
      {summary?.updatedAt ? <p className="project-summary-meta">更新于 {new Date(summary.updatedAt).toLocaleString("zh-CN")}</p> : null}
      {summary?.summary
        ? <p className="project-summary-text">{summary.summary}</p>
        : <p className="monitor-empty">还没有项目长期总结。归档迭代后，一级小祥会把该轮结论沉淀到这里。</p>}
    </div>
  </dialog>;
}
