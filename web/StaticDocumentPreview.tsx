import { DocxPreview, PptxPreview, XlsxPreview } from "./office-preview";
import { PdfPreview } from "./PdfPreview";

type PreviewVersion = { id: string; filename: string };

export function StaticDocumentPreview({
  kind,
  bytes,
  version,
  url,
  onOpenImage,
}: {
  kind: string;
  bytes?: Uint8Array;
  version?: PreviewVersion | null;
  url?: string;
  onOpenImage: (source: { id: string; title: string; filename: string; src?: string }) => void;
}) {
  if (kind === "docx" && bytes) return <DocxPreview bytes={bytes} />;
  if (kind === "xlsx" && bytes) return <XlsxPreview bytes={bytes} />;
  if (kind === "pptx" && bytes) return <PptxPreview bytes={bytes} />;
  if (kind === "image" && version) {
    return (
      <button
        type="button"
        className="doc-image-open"
        title="打开预览"
        onClick={() =>
          onOpenImage({
            id: version.id,
            title: version.filename,
            filename: version.filename,
            src: url,
          })
        }
      >
        <img src={url} alt={version.filename} />
      </button>
    );
  }
  if (kind === "pdf" && version && bytes)
    return <PdfPreview bytes={bytes} filename={version.filename} />;
  if (kind === "download")
    return <p>文件已安全保存在项目中。此格式暂不支持在线预览，请下载原文件查看。</p>;
  return null;
}
