import { DialogHeader } from "./DialogHeader";
import React, { useEffect, useRef, useState } from "react";
import { UiIcon } from "./ui-icon";
import { ImageField } from "./ImageField";
import { TextField } from "./TextField";
import { TextAreaField } from "./TextAreaField";
import { prepareAvatar } from "./ProfileFields";
import { Dialog, animateDialogClose } from "./dialog-fx";
import { showTip, useTipError } from "./Tip";
import { projectCopyInfo } from "./project-copy";

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
      <ImageField
        value={image}
        fallbackText="项"
        uploadLabel="上传项目图片"
        changeLabel="更换项目图片"
        removeLabel="移除项目图片"
        disabled={busy}
        onSelect={(file) => {
          void prepareAvatar(file)
            .then(onChange)
            .catch((uploadError) => {
              const detail = (
                uploadError instanceof Error ? uploadError.message : "无法读取这张图片"
              ).replaceAll("头像", "项目图片");
            });
        }}
        onRemove={() => onChange(null)}
      />
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
  mcpEndpoint,
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
  mcpEndpoint?: string;
  onSave: (input: { name: string; description: string; image?: string | null }) => Promise<void>;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [draftImage, setDraftImage] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useTipError();
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
  const copyProjectInfo = async () => {
    try {
      await navigator.clipboard.writeText(projectCopyInfo({ projectId, mcpEndpoint }));
      setCopiedId(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(false), 1600);
      showTip("项目信息已复制");
    } catch {
      showTip("无法自动复制项目信息，请检查剪贴板权限后重试。", "error");
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
    }
  };

  const summaryValue = longTermSummary?.summary
    ? longTermSummary.lastThreadTitle || "已有长期总结"
    : "暂无";
  return (
    <section className="project-settings">
      <form
        className="project-settings-form"
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
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="project-settings-scroll">
          <div className="settings-content-heading">
            <p>维护当前项目的图片、名称和简介。</p>
          </div>
          <div className="profile-fields">
            <div className="profile-identity">
              <ImageField
                value={preview}
                fallbackText={name.trim()[0] || "项"}
                uploadLabel="上传项目图片"
                changeLabel="更换项目图片"
                removeLabel="移除项目图片"
                readOnly={!canManage}
                disabled={saving}
                onSelect={(file) => void uploadImage(file)}
                onRemove={() => setDraftImage(null)}
              />
              <div className="profile-identity-fields">
                <span className="profile-email-field profile-id-row">
                  <span className="profile-id-label">ID：</span>
                  <span className="project-settings-id">{projectId}</span>
                  <button
                    type="button"
                    className="profile-id-copy"
                    title="复制项目信息"
                    aria-label="复制项目信息"
                    onClick={() => void copyProjectInfo()}
                  >
                    {copiedId ? "已复制" : "复制项目信息"}
                  </button>
                </span>
                <TextField
                  id="project-settings-name"
                  label="项目名称"
                  value={draftName}
                  required
                  maxLength={120}
                  readOnly={!canManage}
                  disabled={saving}
                  onChange={(event) => setDraftName(event.target.value)}
                />
              </div>
            </div>
            <TextAreaField
              id="project-settings-description"
              label="项目简介"
              value={draftDescription}
              maxLength={4000}
              readOnly={!canManage}
              disabled={saving}
              rows={3}
              onChange={(event) => setDraftDescription(event.target.value)}
            />
            <TextField label="立项人员" value={creatorName} readOnly />
            <TextField label="立项时间" value={createdAt} readOnly />
            <TextField
              label="项目总结"
              value={summaryValue}
              readOnly
              hint={summaryHint}
              containerClassName="profile-readonly-field"
              action={
                <button
                  type="button"
                  className="profile-field-action"
                  onClick={() => setSummaryOpen(true)}
                >
                  <UiIcon name="eye" size={13} />
                  查看
                </button>
              }
            />
            <TextField
              label="结项时间"
              value="暂未开放"
              readOnly
              containerClassName="profile-readonly-field"
              action={
                <button type="button" className="profile-field-action" disabled>
                  <UiIcon name="archive" size={13} />
                  结项
                </button>
              }
            />
          </div>
        </div>
        <div className="project-settings-footer">
          {canManage ? (
            <button type="submit" className="primary" disabled={saving || !dirty}>
              <UiIcon name="save" size={13} />
              {saving ? "保存中…" : "保存资料"}
            </button>
          ) : (
            <small>仅项目主和项目管理可修改</small>
          )}
        </div>
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
  return (
    <Dialog
      onRequestClose={onClose}
      ref={dialog}
      className="child-task-detail-dialog project-summary-dialog"
      aria-labelledby="project-summary-title"
    >
      <DialogHeader
        title={<>项目长期总结</>}
        titleId="project-summary-title"
        subtitle={<>项目记忆</>}
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭项目长期总结"
      />
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
            还没有项目长期总结。归档迭代后，老翁会把该轮结论沉淀到这里。
          </p>
        )}
      </div>
    </Dialog>
  );
}
