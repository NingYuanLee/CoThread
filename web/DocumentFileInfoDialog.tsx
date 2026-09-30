import { DialogClose, ModalBackdrop } from "./dialog-fx";

export type DocumentFileInfoRow = {
  label: string;
  value: string;
};

export function DocumentFileInfoDialog({
  rows,
  onClose,
}: {
  rows: DocumentFileInfoRow[];
  onClose: () => void;
}) {
  return (
    <ModalBackdrop className="library-organize-backdrop" onClose={onClose}>
      {(close) => (
        <section
          className="library-organize-dialog document-file-info-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="document-file-info-title"
        >
          <header>
            <h3 id="document-file-info-title">文件信息</h3>
            <DialogClose onClick={close} label="关闭" />
          </header>
          <table className="document-file-info-table">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </ModalBackdrop>
  );
}
