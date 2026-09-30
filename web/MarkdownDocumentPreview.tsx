import type { ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolvePreviewAssetPath } from "../shared/html-preview.mjs";
import { CodePreview, MermaidPreview } from "./office-preview";

export function MarkdownDocumentPreview({
  mode,
  text,
  selected,
  filename,
  nativeSourceFrame,
}: {
  mode: "preview" | "text";
  text: string | null | undefined;
  selected: string | null;
  filename?: string;
  nativeSourceFrame: ReactNode;
}) {
  if (mode === "text") {
    return nativeSourceFrame || <CodePreview text={text || ""} filename={filename} />;
  }
  if (nativeSourceFrame) return nativeSourceFrame;
  return (
    <div className="markdown-preview">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => {
            const path = resolvePreviewAssetPath(src || "");
            const assetSrc =
              selected && path ? `/api/versions/${selected}/preview/${encodeURI(path)}` : src;
            return assetSrc ? <img src={assetSrc} alt={alt || ""} loading="lazy" /> : null;
          },
          code: ({ className, children, ...props }) => {
            const language = className?.match(/language-([\w-]+)/)?.[1]?.toLowerCase();
            if (language === "mermaid") {
              const chart = String(children).replace(/\n$/, "");
              return <MermaidPreview key={chart} chart={chart} />;
            }
            return className ? (
              <pre className="markdown-code-block">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="markdown-inline-code" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
