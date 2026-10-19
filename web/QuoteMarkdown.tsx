import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function QuoteMarkdown({ body }: { body: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        img: () => <span>（图片链接）</span>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {body}
    </Markdown>
  );
}
