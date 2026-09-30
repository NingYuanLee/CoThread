import type { ReactNode } from "react";
import { CodePreview, formatHtmlSource } from "./office-preview";
import { MarkdownDocumentPreview } from "./MarkdownDocumentPreview";

export function DocumentPreviewContent({
  kind,
  mode,
  text,
  selected,
  filename,
  nativeSourceFrame,
  htmlPreview,
}: {
  kind?: string;
  mode: "preview" | "text";
  text?: string;
  selected?: string;
  filename?: string;
  nativeSourceFrame: ReactNode;
  htmlPreview: ReactNode;
}) {
  return (
    <>
      {kind === "markdown" ? (
        <MarkdownDocumentPreview
          mode={mode}
          text={text ?? null}
          selected={selected ?? null}
          filename={filename}
          nativeSourceFrame={nativeSourceFrame}
        />
      ) : null}
      {kind === "html" && mode === "preview" && selected ? htmlPreview : null}
      {kind === "html" && mode === "text" ? (
        nativeSourceFrame ? (
          nativeSourceFrame
        ) : text == null ? (
          <p className="muted doc-browser-loading">正在读取源码…</p>
        ) : (
          <CodePreview
            text={text.length > 80_000 ? text : formatHtmlSource(text)}
            filename={filename}
          />
        )
      ) : null}
      {kind === "text" ? (
        nativeSourceFrame ? (
          nativeSourceFrame
        ) : (
          <CodePreview text={text || ""} filename={filename} />
        )
      ) : null}
    </>
  );
}
