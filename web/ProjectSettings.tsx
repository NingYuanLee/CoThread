import React, { useEffect, useRef, useState } from "react";
import { UiIcon } from "./ui-icon";
import { DialogClose, animateDialogClose, onDialogBackdropClick, onDialogCancel } from "./dialog-fx";
import { showTip } from "./Tip";

export function ProjectSettings({ projectId, name, description, createdAt, creator, longTermSummary, onSave }: {
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
  creator: boolean;
  longTermSummary?: { summary: string; updatedAt: string | null; lastThreadTitle: string | null } | null;
  onSave: (input: { name: string; description: string }) => Promise<void>;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const copyTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  const copyProjectId = async () => {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(projectId);
      setCopiedId(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(false), 2000);
      showTip("项目 ID 已复制");
    } catch {
      setCopyError("无法自动复制项目 ID，请检查剪贴板权限后重试。");
      showTip("无法自动复制项目 ID，请检查剪贴板权限后重试。", "error");
    }
  };
  useEffect(() => { setDraftName(name); setDraftDescription(description); }, [name, description]);
  const nextName = draftName.trim();
  const nextDescription = draftDescription.trim();
  const dirty = creator && nextName !== "" && (nextName !== name || nextDescription !== (description || "").trim());
  const summaryHint = longTermSummary?.summary
    ? (longTermSummary.lastThreadTitle
      ? `最近由「${longTermSummary.lastThreadTitle}」归档更新`
      : "已有项目级长期记忆")
    : "归档迭代后，会把该轮结论沉淀到这里供后续沿用";

  return (
    <section className="project-settings">
      <form className="project-settings-block" onSubmit={async (event) => {
        event.preventDefault();
        if (saving || !dirty) return;
        setSaving(true);
        setError("");
        setSaved(false);
        try {
          await onSave({ name: nextName, description: nextDescription });
          setSaved(true);
          showTip("项目信息已保存");
        }
        catch (error) {
          const detail = (error as Error).message;
          setError(detail);
          showTip(detail, "error");
        }
        finally { setSaving(false); }
      }}>
        <div className="project-settings-head">
          <label htmlFor="project-settings-name">项目名称</label>
          <small>{creator ? "仅创建人可改" : "仅项目创建人可修改"}</small>
        </div>
        {creator ? (
          <input
            id="project-settings-name"
            value={draftName}
            required
            maxLength={120}
            disabled={saving}
            onChange={(event) => { setDraftName(event.target.value); setSaved(false); }}
          />
        ) : (
          <p className="project-settings-value">{name}</p>
        )}
        <label htmlFor="project-settings-description">项目简介</label>
        {creator ? (
          <textarea
            id="project-settings-description"
            value={draftDescription}
            maxLength={4000}
            disabled={saving}
            rows={4}
            placeholder="这个项目要达成什么目标？"
            onChange={(event) => { setDraftDescription(event.target.value); setSaved(false); }}
          />
        ) : (
          <p className="project-settings-value muted">{description.trim() || "暂无项目简介"}</p>
        )}
        {creator && (
          <div className="project-settings-actions">
            <button type="submit" className={dirty ? "primary" : undefined} disabled={saving || !dirty}>
              <UiIcon name="save" size={13} />
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        )}
        {error && <p role="alert" className="project-settings-error">{error}</p>}
        {saved && <p role="status" className="project-settings-ok">项目信息已保存</p>}
      </form>

      <div className="project-settings-block">
        <div className="project-settings-head">
          <span className="project-settings-label">项目 ID</span>
          <button
            type="button"
            className="project-settings-ghost"
            title={copiedId ? "项目 ID 已复制" : "复制项目 ID"}
            aria-label={copiedId ? "项目 ID 已复制" : "复制项目 ID"}
            onClick={() => void copyProjectId()}
          >
            <UiIcon name={copiedId ? "check" : "copy"} size={13} />
            {copiedId ? "已复制" : "复制"}
          </button>
        </div>
        <p className="project-settings-value"><code className="project-settings-id">{projectId}</code></p>
        <small>MCP 上传正式文件时使用此 ID</small>
        {copyError && <p role="alert" className="project-settings-error">{copyError}</p>}
      </div>

      <div className="project-settings-block">
        <div className="project-settings-head">
          <span className="project-settings-label">项目长期总结</span>
          <button type="button" className="project-settings-ghost" onClick={() => setSummaryOpen(true)}>
            <UiIcon name="eye" size={13} />查看
          </button>
        </div>
        <p className="project-settings-value muted">{summaryHint}</p>
      </div>

      <div className="project-settings-block project-settings-meta">
        <span className="project-settings-label">创建时间</span>
        <p className="project-settings-value">{createdAt}</p>
      </div>

      <div className="project-settings-footer">
        <div>
          <span className="project-settings-label">归档项目</span>
          <small>暂未开放</small>
        </div>
        <button type="button" disabled>
          <UiIcon name="archive" size={13} />归档
        </button>
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
  return <dialog ref={dialog} className="l3-task-detail-dialog project-summary-dialog" aria-labelledby="project-summary-title" onCancel={onDialogCancel(onClose)} onClick={onDialogBackdropClick(onClose)}>
    <header className="agent-monitor-header">
      <div>
        <span>项目记忆</span>
        <h2 id="project-summary-title">项目长期总结</h2>
      </div>
      <DialogClose onClick={() => animateDialogClose(dialog.current, onClose)} label="关闭项目长期总结" />
    </header>
    <div className="project-summary-body">
      {summary?.lastThreadTitle ? <p className="project-summary-meta">最近更新来源：{summary.lastThreadTitle}</p> : null}
      {summary?.updatedAt ? <p className="project-summary-meta">更新于 {new Date(summary.updatedAt).toLocaleString("zh-CN")}</p> : null}
      {summary?.summary
        ? <p className="project-summary-text">{summary.summary}</p>
        : <p className="monitor-empty">还没有项目长期总结。归档迭代后，项目级Agent（L1）会把该轮结论沉淀到这里。</p>}
    </div>
  </dialog>;
}
