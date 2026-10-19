import React, { useEffect, useRef, useState } from "react";
import { UiIcon } from "./ui-icon";
import { prepareAvatar } from "./ProfileFields";
import {
  DialogClose,
  animateDialogClose,
  onDialogBackdropClick,
  onDialogCancel,
} from "./dialog-fx";
import { showTip } from "./Tip";

export function ProjectImageField({
  image,
  busy,
  onChange,
}: {
  image: string | null;
  busy?: boolean;
  onChange: (image: string | null) => void;
}) {
  return (
    <div className="project-image-field">
      <div className="profile-avatar-slot">
        <label className="profile-avatar-hit">
          <span className="avatar profile-avatar-preview">
            {image ? <img src={image} alt="" /> : "项"}
            <span className="profile-avatar-mask" aria-hidden="true">
              <UiIcon name="camera" size={20} />
            </span>
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={image ? "更换项目图片" : "上传项目图片"}
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              void prepareAvatar(file)
                .then(onChange)
                .catch((uploadError) => {
                  const detail = (
                    uploadError instanceof Error ? uploadError.message : "无法读取这张图片"
                  ).replaceAll("头像", "项目图片");
                  showTip(detail, "error");
                });
            }}
          />
        </label>
        {image && (
          <button
            type="button"
            className="profile-avatar-remove"
            disabled={busy}
            onClick={() => onChange(null)}
            aria-label="移除项目图片"
            title="移除项目图片"
          >
            <UiIcon name="close" size={11} />
          </button>
        )}
      </div>
      <span className="project-image-field-copy">
        项目图片
        <small>选填，PNG、JPEG 或 WebP</small>
      </span>
    </div>
  );
}

export function ProjectSettings({
  projectId,
  name,
  description,
  image,
  createdAt,
  creatorName,
  canManage,
  longTermSummary,
  onSave,
}: {
  projectId: string;
  name: string;
  description: string;
  image?: string | null;
  createdAt: string;
  creatorName: string;
  canManage: boolean;
  longTermSummary?: {
    summary: string;
    updatedAt: string | null;
    lastThreadTitle: string | null;
  } | null;
  onSave: (input: { name: string; description: string; image?: string | null }) => Promise<void>;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [draftImage, setDraftImage] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const copyTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  useEffect(() => {
    setDraftName(name);
    setDraftDescription(description);
    setDraftImage(undefined);
  }, [name, description, image]);
  const preview = draftImage === undefined ? image || null : draftImage;
  const copyProjectId = async () => {
    try {
      await navigator.clipboard.writeText(projectId);
      setCopiedId(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(false), 1600);
      showTip("项目 ID 已复制");
    } catch {
      showTip("复制失败，请检查剪贴板权限。", "error");
    }
  };
  const nextName = draftName.trim();
  const nextDescription = draftDescription.trim();
  const imageDirty = draftImage !== undefined;
  const dirty =
    canManage &&
    nextName !== "" &&
    (imageDirty || nextName !== name || nextDescription !== (description || "").trim());
  const summaryHint = longTermSummary?.summary
    ? longTermSummary.lastThreadTitle
      ? `最近由「${longTermSummary.lastThreadTitle}」归档更新`
      : "已有项目级长期记忆"
    : "归档迭代后，会把该轮结论沉淀到这里供后续沿用";
  const uploadImage = async (file: File) => {
    try {
      setDraftImage(await prepareAvatar(file));
      setError("");
    } catch (uploadError) {
      const detail = (
        uploadError instanceof Error ? uploadError.message : "无法读取这张图片"
      ).replaceAll("头像", "项目图片");
      setError(detail);
      showTip(detail, "error");
    }
  };

  return (
    <section className="project-settings">
      <form
        className="profile-fields"
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving || !dirty) return;
          setSaving(true);
          setError("");
          try {
            await onSave({
              name: nextName,
              description: nextDescription,
              ...(imageDirty ? { image: draftImage } : {}),
            });
            showTip("项目资料已保存");
          } catch (saveError) {
            const detail = saveError instanceof Error ? saveError.message : "保存失败";
            setError(detail);
            showTip(detail, "error");
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="profile-identity">
          <div className="profile-avatar-slot">
            <label className={canManage ? "profile-avatar-hit" : "profile-avatar-hit is-readonly"}>
              <span className="avatar profile-avatar-preview">
                {preview ? <img src={preview} alt="" /> : name.trim()[0] || "项"}
                {canManage && (
                  <span className="profile-avatar-mask" aria-hidden="true">
                    <UiIcon name="camera" size={20} />
                  </span>
                )}
              </span>
              {canManage && (
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label={preview ? "更换项目图片" : "上传项目图片"}
                  disabled={saving}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void uploadImage(file);
                  }}
                />
              )}
            </label>
            {canManage && preview && (
              <button
                type="button"
                className="profile-avatar-remove"
                disabled={saving}
                onClick={() => setDraftImage(null)}
                aria-label="移除项目图片"
                title="移除项目图片"
              >
                <UiIcon name="close" size={11} />
              </button>
            )}
          </div>
          <div className="profile-identity-fields">
            <span className="profile-email-field profile-id-row">
              <span className="profile-id-label">ID：</span>
              <span className="project-settings-id">{projectId}</span>
              <button
                type="button"
                className="profile-id-copy"
                onClick={() => void copyProjectId()}
              >
                {copiedId ? "已复制" : "复制"}
              </button>
            </span>
            {canManage ? (
              <input
                id="project-settings-name"
                value={draftName}
                required
                maxLength={120}
                disabled={saving}
                aria-label="项目名称"
                placeholder="项目名称"
                onChange={(event) => setDraftName(event.target.value)}
              />
            ) : (
              <p className="project-settings-value">{name}</p>
            )}
            {canManage ? (
              <textarea
                id="project-settings-description"
                value={draftDescription}
                maxLength={4000}
                disabled={saving}
                rows={3}
                aria-label="项目简介"
                placeholder="这个项目要达成什么目标？"
                onChange={(event) => setDraftDescription(event.target.value)}
              />
            ) : (
              <p className="project-settings-value muted">{description.trim() || "暂无项目简介"}</p>
            )}
          </div>
        </div>
        <div className="profile-email-row">
          <span>创建人</span>
          <span className="profile-email-field">
            <span>{creatorName}</span>
          </span>
        </div>
        <div className="profile-email-row">
          <span>创建时间</span>
          <span className="profile-email-field">
            <span>{createdAt}</span>
          </span>
        </div>
        <div className="profile-email-row">
          <span>项目长期总结</span>
          <span className="profile-email-field">
            <span>{summaryHint}</span>
            <button type="button" onClick={() => setSummaryOpen(true)}>
              <UiIcon name="eye" size={13} />
              查看
            </button>
          </span>
          <small>归档迭代后由项目级 Agent 沉淀，供后续迭代沿用</small>
        </div>
        <div className="profile-email-row">
          <span>结项</span>
          <span className="profile-email-field">
            <span>暂未开放</span>
            <button type="button" disabled>
              <UiIcon name="archive" size={13} />
              结项
            </button>
          </span>
          <small>结项后项目进入只读，工作空间不再显示</small>
        </div>
        {canManage && (
          <div className="project-settings-actions">
            <button type="submit" className="primary" disabled={saving || !dirty}>
              <UiIcon name="save" size={13} />
              {saving ? "保存中…" : "保存资料"}
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="project-settings-error">
            {error}
          </p>
        )}
        {!canManage && <small>仅项目主和项目管理可修改</small>}
      </form>
      {summaryOpen ? (
        <ProjectSummaryDialog summary={longTermSummary} onClose={() => setSummaryOpen(false)} />
      ) : null}
    </section>
  );
}

function ProjectSummaryDialog({
  summary,
  onClose,
}: {
  summary?: { summary: string; updatedAt: string | null; lastThreadTitle: string | null } | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="l3-task-detail-dialog project-summary-dialog"
      aria-labelledby="project-summary-title"
      onCancel={onDialogCancel(onClose)}
      onClick={onDialogBackdropClick(onClose)}
    >
      <header className="agent-monitor-header">
        <div>
          <span>项目记忆</span>
          <h2 id="project-summary-title">项目长期总结</h2>
        </div>
        <DialogClose
          onClick={() => animateDialogClose(dialog.current, onClose)}
          label="关闭项目长期总结"
        />
      </header>
      <div className="project-summary-body">
        {summary?.lastThreadTitle ? (
          <p className="project-summary-meta">最近更新来源：{summary.lastThreadTitle}</p>
        ) : null}
        {summary?.updatedAt ? (
          <p className="project-summary-meta">
            更新于 {new Date(summary.updatedAt).toLocaleString("zh-CN")}
          </p>
        ) : null}
        {summary?.summary ? (
          <p className="project-summary-text">{summary.summary}</p>
        ) : (
          <p className="monitor-empty">
            还没有项目长期总结。归档迭代后，项目级Agent（L1）会把该轮结论沉淀到这里。
          </p>
        )}
      </div>
    </dialog>
  );
}
