import { DialogFooter } from "./DialogFooter";
import { TextField } from "./TextField";
import { DialogBody } from "./DialogBody";
import { DialogHeader } from "./DialogHeader";
import { ModalBackdrop } from "./dialog-fx";
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
          <DialogHeader
            title={<>改新版</>}
            titleId="library-branch-title"
            onClose={close}
            closeLabel="关闭"
          />
          <DialogBody>
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
              <TextField
                label="文档名称"
                value={title}
                maxLength={160}
                onChange={(event) => onTitleChange(event.target.value)}
                autoFocus
              />
            ) : null}
          </DialogBody>
          <DialogFooter>
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
          </DialogFooter>
        </section>
      )}
    </ModalBackdrop>
  );
}
