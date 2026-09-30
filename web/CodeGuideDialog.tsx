import { DialogClose, ModalBackdrop } from "./dialog-fx";

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
          <header>
            <h3 id="code-guide-title">{title} · 文件夹说明</h3>
            <DialogClose onClick={close} label="关闭文件夹说明" />
          </header>
          {lines ? (
            <ul className="folder-guide-lines">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p>{body}</p>
          )}
          <div className="library-organize-actions">
            <button type="button" className="primary" onClick={close}>
              知道了
            </button>
          </div>
        </section>
      )}
    </ModalBackdrop>
  );
}
