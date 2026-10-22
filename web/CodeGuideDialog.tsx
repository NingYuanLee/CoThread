import { DialogFooter } from "./DialogFooter";
import { DialogBody } from "./DialogBody";
import { DialogHeader } from "./DialogHeader";
import { ModalBackdrop } from "./dialog-fx";

export function CodeGuideDialog({
  title,
  body,
  lines,
  onClose,
}: {
  title: string;
  body?: string | null;
  lines?: string[] | null;
  onClose: () => void;
}) {
  return (
    <ModalBackdrop className="library-organize-backdrop" onClose={onClose}>
      {(close) => (
        <section
          className="library-organize-dialog folder-guide-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="code-guide-title"
        >
          <DialogHeader
            title={<>{title} · 文件夹说明</>}
            titleId="code-guide-title"
            onClose={close}
            closeLabel="关闭文件夹说明"
          />
          <DialogBody>
            {lines ? (
              <ul className="folder-guide-lines">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>{body}</p>
            )}
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
