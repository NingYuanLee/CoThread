import React, { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const openVersion = { current: (_id: string) => {} };

export function bindMessageMarkdownOpener(open: (id: string) => void) {
  openVersion.current = open;
}

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
    return versionId ? (
      <button type="button" className="ref" onClick={() => openVersion.current(versionId)}>
        {children}
      </button>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
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
