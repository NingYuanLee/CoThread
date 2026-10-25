/**
 * 迭代背景与目标的标准弹窗。
 * 入口是输入框上方的「目标」条；内容复用简报视图，标题栏与其他弹窗一致，可拖动、可全屏、可 Esc/遮罩关闭。
 */
import { ModalBackdrop } from "./dialog-fx";
import { DialogHeader } from "./DialogHeader";
import { ThreadBrief } from "./ThreadBrief";
import type { Thread } from "./workspace-types";

export function ThreadBriefDialog({
  thread,
  writable,
  onClose,
  onSaved,
}: {
  thread: Thread;
  writable: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <ModalBackdrop onClose={onClose}>
      {(close) => (
        <section
          className="thread-brief-page-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="thread-brief-page-title"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader
            title={<>背景与目标</>}
            titleId="thread-brief-page-title"
            subtitle={<>本迭代的目标与变更记录</>}
            onClose={close}
            closeLabel="关闭背景与目标"
            autoFocusClose
          />
          <div className="thread-brief-page-body">
            <ThreadBrief thread={thread} writable={writable} onSaved={onSaved} />
          </div>
        </section>
      )}
    </ModalBackdrop>
  );
}
