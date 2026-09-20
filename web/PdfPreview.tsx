import { useEffect, useState } from "react";
export function PdfPreview({
  bytes,
  filename,
}: {
  bytes: Uint8Array;
  filename: string;
}) {
  const [blobUrl, setBlobUrl] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "application/pdf" }));
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bytes]);
  return (
    <div className="pdf-preview">
      {blobUrl ? <iframe className="pdf-preview-frame" title={filename} src={blobUrl} referrerPolicy="no-referrer" /> : <p className="muted pdf-preview-loading">正在加载 PDF…</p>}
    </div>
  );
}
