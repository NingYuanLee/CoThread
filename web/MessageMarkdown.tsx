import { memo, useEffect, useMemo, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitSelfMentions } from "../shared/mentions.js";
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

export type MentionIdentity = {
  name?: string | null;
  email?: string | null;
  username?: string | null;
};

type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
};

function highlightMentions(node: HastNode, user: MentionIdentity, inCode = false) {
  if (!node.children) return;
  const code = inCode || node.tagName === "code" || node.tagName === "pre";
  const next: HastNode[] = [];
  for (const child of node.children) {
    if (!code && child.type === "text" && typeof child.value === "string") {
      const parts = splitSelfMentions(child.value, user);
      if (!parts.some((part) => part.mention)) {
        next.push(child);
        continue;
      }
      for (const part of parts) {
        if (!part.text) continue;
        next.push(
          part.mention
            ? {
                type: "element",
                tagName: "span",
                properties: { className: ["mention-self"] },
                children: [{ type: "text", value: part.text }],
              }
            : { type: "text", value: part.text },
        );
      }
      continue;
    }
    highlightMentions(child, user, code);
    next.push(child);
  }
  node.children = next;
}

function selfMentionPlugin(user: MentionIdentity) {
  return () => (tree: HastNode) => {
    highlightMentions(tree, user);
  };
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

export const MessageMarkdown = memo(function MessageMarkdown({
  body,
  mentionUser,
}: {
  body: string;
  mentionUser?: MentionIdentity | null;
}) {
  const mentionName = mentionUser?.name || "";
  const mentionEmail = mentionUser?.email || "";
  const mentionUsername = mentionUser?.username || "";
  const rehypePlugins = useMemo(
    () =>
      mentionName || mentionEmail || mentionUsername
        ? [
            selfMentionPlugin({
              name: mentionName,
              email: mentionEmail,
              username: mentionUsername,
            }),
          ]
        : [],
    [mentionName, mentionEmail, mentionUsername],
  );
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={components}>
      {body}
    </Markdown>
  );
});

const STREAM_MARKDOWN_MS = 120;

// Parse a growing reply at a fixed cadence. Completed text is parsed immediately.
export function ThrottledMarkdown({
  body,
  active,
  mentionUser,
}: {
  body: string;
  active: boolean;
  mentionUser?: MentionIdentity | null;
}) {
  const [shown, setShown] = useState(body);
  const latest = useRef(body);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nextAt = useRef(0);
  latest.current = body;
  useEffect(() => {
    if (!active) {
      clearTimeout(timer.current);
      timer.current = undefined;
      nextAt.current = 0;
      setShown(body);
      return;
    }
    if (timer.current) return;
    const wait = Math.max(0, nextAt.current - performance.now());
    timer.current = setTimeout(() => {
      timer.current = undefined;
      nextAt.current = performance.now() + STREAM_MARKDOWN_MS;
      setShown(latest.current);
    }, wait);
  }, [body, active]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const text = !active || !body.startsWith(shown) ? body : shown;
  return <MessageMarkdown body={text} mentionUser={mentionUser} />;
}
