import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageAnchor } from "./message-link";

export function QuoteMarkdown({ body }: { body: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        img: () => <span>（图片链接）</span>,
        a: ({ href, children }) => <MessageAnchor href={href}>{children}</MessageAnchor>,
      }}
    >
      {body}
    </Markdown>
  );
}
