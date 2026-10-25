import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageAnchor } from "./message-link";
import { openVersion } from "./message-markdown-opener";

export { bindMessageMarkdownOpener } from "./message-markdown-opener";

function versionIdFromHref(href?: string) {
  try {
    const url = new URL(href || "", location.origin);
    if (url.origin !== location.origin) return undefined;
    return url.pathname.match(/^\/api\/versions\/([\da-f-]+)(?:\/download)?\/?$/i)?.[1];
  } catch {
    return undefined;
  }
}

const components: Components = {
  img: () => <span>（图片链接）</span>,
  a: ({ href, children }) => {
    const versionId = versionIdFromHref(href);
    const text = Array.isArray(children)
      ? children.join("")
      : typeof children === "string" || typeof children === "number"
        ? String(children)
        : "";
    const cite = !versionId && /^\d+$/.test(text.trim());
    return versionId ? (
      <button type="button" className="ref" onClick={() => openVersion.current(versionId)}>
        {children}
      </button>
    ) : (
      <MessageAnchor href={href} cite={cite}>
        {children}
      </MessageAnchor>
    );
  },
};

export const MessageMarkdown = memo(function MessageMarkdown({ body }: { body: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={components}>
      {body}
    </Markdown>
  );
});
