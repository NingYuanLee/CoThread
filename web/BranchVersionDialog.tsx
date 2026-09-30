import { DialogClose, ModalBackdrop } from "./dialog-fx";
import { UiIcon } from "./ui-icon";

export function BranchVersionDialog({
  target,
  title,
  pending,
  onTargetChange,
  onTitleChange,
  onClose,
  onSubmit,
}: {
  target: "current" | "new";
  title: string;
  pending: boolean;
  onTargetChange: (target: "current" | "new") => void;
  onTitleChange: (title: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <ModalBackdrop className="library-organize-backdrop" onClose={onClose}>
      {(close) => (
        <section
          className="library-organize-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-branch-title"
        >
          <header>
            <h3 id="library-branch-title">改新版</h3>
            <DialogClose onClick={close} label="关闭" />
          </header>
          <p>选择修改目标后，将请求发送给 @小祥 处理。</p>
          <div className="library-branch-targets" role="radiogroup" aria-label="新版归属">
            <label>
              <input
                type="radio"
                name="branch-target"
                checked={target === "current"}
                onChange={() => onTargetChange("current")}
              />
              <span>当前文档</span>
            </label>
            <label>
              <input
                type="radio"
                name="branch-target"
                checked={target === "new"}
                onChange={() => onTargetChange("new")}
              />
              <span>新文档</span>
            </label>
          </div>
          {target === "new" ? (
            <label className="library-branch-title-field">
              <span>文档名称</span>
              <input
                value={title}
                maxLength={160}
                onChange={(event) => onTitleChange(event.target.value)}
                autoFocus
              />
            </label>
          ) : null}
          <div className="library-organize-actions">
            <button type="button" onClick={close} disabled={pending}>
              取消
            </button>
            <button
              type="button"
              className="primary"
              onClick={onSubmit}
              disabled={pending || (target === "new" && !title.trim())}
            >
              <UiIcon name="branch" size={13} />
              发送改新版请求
            </button>
          </div>
        </section>
      )}
    </ModalBackdrop>
  );
}
