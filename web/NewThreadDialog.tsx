/**
 * 新迭代表单弹窗：侧栏「新迭代」按钮与欢迎页共用同一个入口。
 * 只负责表单呈现与提交回调，草稿与请求由 WorkspaceApp 持有。
 */
import { useEffect, useRef } from "react";
import { DialogBody } from "./DialogBody";
import { DialogFooter } from "./DialogFooter";
import { DialogHeader } from "./DialogHeader";
import { ModalBackdrop } from "./dialog-fx";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";
import { UiIcon } from "./ui-icon";

export function NewThreadDialog({
  title,
  background,
  goal,
  busy,
  onTitleChange,
  onBackgroundChange,
  onGoalChange,
  onClose,
  onSubmit,
}: {
  title: string;
  background: string;
  goal: string;
  busy: boolean;
  onTitleChange: (value: string) => void;
  onBackgroundChange: (value: string) => void;
  onGoalChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = !busy && title.trim().length > 0;
  const titleInputRef = useRef<HTMLInputElement>(null);
  /* 原生 showModal 会把焦点给到第一个可聚焦控件（这里是全屏按钮），挂载后再把光标放回主题。 */
  useEffect(() => {
    titleInputRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <ModalBackdrop className="library-organize-backdrop" onClose={onClose} enabled={!busy}>
      {(close) => (
        <section
          className="library-organize-dialog new-thread-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-thread-title"
        >
          <DialogHeader
            title={<>新迭代</>}
            titleId="new-thread-title"
            subtitle={<>先写主题就能开始，背景与目标可以稍后补充</>}
            onClose={close}
            closeLabel="关闭新迭代表单"
            disabled={busy}
          />
          <DialogBody>
            <div className="new-thread-fields">
              <TextField
                ref={titleInputRef}
                label="迭代主题"
                type="text"
                name="title"
                aria-label="迭代主题"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (canSubmit) onSubmit();
                }}
                maxLength={160}
                placeholder="输入新迭代主题"
                disabled={busy}
                autoComplete="off"
              />
              <TextAreaField
                label="背景"
                rows={3}
                maxLength={20000}
                placeholder="这次协作的背景与已知约束"
                value={background}
                disabled={busy}
                onChange={(event) => onBackgroundChange(event.target.value)}
              />
              <TextAreaField
                label="目标"
                rows={2}
                maxLength={20000}
                placeholder="本轮希望达成什么"
                value={goal}
                disabled={busy}
                onChange={(event) => onGoalChange(event.target.value)}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <button type="button" onClick={close} disabled={busy}>
              取消
            </button>
            <button type="button" className="primary" onClick={onSubmit} disabled={!canSubmit}>
              <UiIcon name="send" size={13} />
              {busy ? "正在处理…" : "确认"}
            </button>
          </DialogFooter>
        </section>
      )}
    </ModalBackdrop>
  );
}
