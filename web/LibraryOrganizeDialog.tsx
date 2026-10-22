import { DialogFooter } from "./DialogFooter";
import { DialogBody } from "./DialogBody";
import { DialogHeader } from "./DialogHeader";
import { ModalBackdrop } from "./dialog-fx";

export function LibraryOrganizeDialog({
  organizing,
  pending,
  canOrganize,
  error,
  onClose,
  onOrganize,
}: {
  organizing: boolean;
  pending: boolean;
  canOrganize: boolean;
  error?: string;
  onClose: () => void;
  onOrganize: () => void;
}) {
  return (
    <ModalBackdrop className="library-organize-backdrop" onClose={onClose}>
      {(close) => (
        <section
          className="library-organize-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-organize-title"
        >
          <DialogHeader
            title={<>正式文件整理</>}
            titleId="library-organize-title"
            onClose={close}
            closeLabel="关闭"
          />
          <DialogBody>
            <p>
              由项目级Agent（L1）在后台归类与命名正式文件；整理期间正式文件区不可上传、另存或修改。
            </p>
            {organizing ? <p className="muted">正在排队或执行中…</p> : null}
            {error ? (
              <div className="error" role="alert">
                {error}
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <button type="button" disabled={pending} onClick={close}>
              关闭
            </button>
            <button
              type="button"
              className="primary"
              disabled={pending || organizing || !canOrganize}
              title={!canOrganize ? "正式文件区没有可整理的文档" : undefined}
              onClick={onOrganize}
            >
              {organizing ? "整理中…" : pending ? "提交中…" : "立即整理"}
            </button>
          </DialogFooter>
        </section>
      )}
    </ModalBackdrop>
  );
}

export function FolderGuideDialog({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  return (
    <ModalBackdrop className="library-organize-backdrop" onClose={onClose}>
      {(close) => (
        <section
          className="library-organize-dialog folder-guide-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="folder-guide-title"
        >
          <DialogHeader
            title={<>{title}</>}
            titleId="folder-guide-title"
            onClose={close}
            closeLabel="关闭文件夹说明"
          />
          <DialogBody>
            <p>{body}</p>
          </DialogBody>
          <DialogFooter>
            <button type="button" className="primary" onClick={close}>
              知道了
            </button>
          </DialogFooter>
        </section>
      )}
    </ModalBackdrop>
  );
}
