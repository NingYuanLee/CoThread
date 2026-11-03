import { lazy, Suspense, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolvePreviewAssetPath } from "../shared/html-preview.mjs";
import { CodePreview } from "./office-preview";

const MermaidPreview = lazy(() =>
  import("./office-preview").then((module) => ({ default: module.MermaidPreview })),
);

export function MarkdownDocumentPreview({
  mode,
  text,
  selected,
  filename,
  nativeSourceFrame,
  onMemoryNavigate,
}: {
  mode: "preview" | "text";
  text: string | null | undefined;
  selected: string | null;
  filename?: string;
  nativeSourceFrame: ReactNode;
  onMemoryNavigate?: (pageId: string) => void;
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
          a: ({ href, children }) => {
            const match = href?.match(/^\/memory-entry\/([0-9a-f-]{36})$/i);
            if (match && onMemoryNavigate) {
              return (
                <a
                  href={href}
                  onClick={(event) => {
                    event.preventDefault();
                    onMemoryNavigate(match[1]);
                  }}
                >
                  {children}
                </a>
              );
            }
            return <a href={href}>{children}</a>;
          },
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
              return (
                <Suspense fallback={<p className="muted">正在加载图表…</p>}>
                  <MermaidPreview key={chart} chart={chart} />
                </Suspense>
              );
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
