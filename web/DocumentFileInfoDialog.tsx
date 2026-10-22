import { DialogHeader } from "./DialogHeader";
import { ModalBackdrop } from "./dialog-fx";

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
          <DialogHeader
            title={<>文件信息</>}
            titleId="document-file-info-title"
            onClose={close}
            closeLabel="关闭"
          />
          <div className="dialog-scroll-region">
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
          </div>
        </section>
      )}
    </ModalBackdrop>
  );
}
