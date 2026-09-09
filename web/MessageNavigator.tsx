import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Message = { id: string; source: string; body: string; author: string };

function preview(text: string) {
  const characters = Array.from(text.replace(/\s+/g, " ").trim());
  return characters.slice(0, 10).join("") + (characters.length > 10 ? "…" : "");
}

export const MessageNavigator = memo(function MessageNavigator({ messages, container, onNavigate }: {
  messages: Message[];
  container: React.RefObject<HTMLDivElement | null>;
  onNavigate: () => void;
}) {
  const members = useMemo(() => messages.filter((message) => ["human", "local_ai"].includes(message.source)), [messages]);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ left: number; top: number } | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const ids = new Set(members.map((message) => message.id));
    const current = new Set<string>();
    setVisible(new Set());
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.messageId!;
        if (entry.isIntersecting && entry.intersectionRect.height > 0) current.add(id);
        else current.delete(id);
      }
      setVisible(new Set(current));
    }, { root, threshold: 0 });
    root.querySelectorAll<HTMLElement>("[data-message-id]").forEach((element) => {
      if (ids.has(element.dataset.messageId!)) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [members, container]);

  useEffect(() => {
    if (hovered !== null || focused.current) return;
    const active = rail.current?.querySelector<HTMLElement>('[data-visible="true"]');
    if (active && rail.current) {
      const { offsetTop, offsetHeight } = active;
      const { scrollTop, clientHeight } = rail.current;
      if (offsetTop < scrollTop || offsetTop + offsetHeight > scrollTop + clientHeight)
        rail.current.scrollTop = offsetTop - clientHeight / 2 + offsetHeight / 2;
    }
  }, [visible, hovered]);

  const reveal = (index: number, element: HTMLElement) => {
    setHovered(index);
    const bounds = element.getBoundingClientRect();
    setTooltip({ left: bounds.left + 42, top: bounds.top + bounds.height / 2 });
  };

  if (!members.length) return null;
  return <nav className="message-navigator" aria-label="成员消息导航">
    <div className="message-navigator-rail" ref={rail}
      onMouseLeave={() => { if (!focused.current) { setHovered(null); setTooltip(null); } }}
      onScroll={() => { setHovered(null); setTooltip(null); }}>
      {members.map((message, index) => {
        const distance = hovered === null ? 5 : Math.abs(index - hovered);
        const width = [32, 26, 21, 17, 13][distance] || 9;
        return <button key={message.id} type="button" className="message-navigator-mark"
          aria-label={`跳到${message.author}的消息：${preview(message.body) || "附件"}`}
          aria-current={visible.has(message.id) ? "location" : undefined}
          data-visible={visible.has(message.id)}
          style={{ "--mark-width": `${width}px` } as React.CSSProperties}
          onMouseEnter={(event) => reveal(index, event.currentTarget)}
          onFocus={(event) => {
            focused.current = event.currentTarget.matches(":focus-visible");
            if (focused.current) reveal(index, event.currentTarget);
          }}
          onBlur={() => { focused.current = false; setHovered(null); setTooltip(null); }}
          onClick={() => {
            const root = container.current;
            const target = root?.querySelector<HTMLElement>(`[data-message-id="${message.id}"]`);
            if (!root || !target) return;
            onNavigate();
            root.scrollTo({ top: root.scrollTop + target.getBoundingClientRect().top - root.getBoundingClientRect().top - 32,
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
          }}>
          <span />
        </button>;
      })}
    </div>
    {hovered !== null && tooltip && members[hovered] && createPortal(<span className="message-navigator-preview"
      aria-hidden="true" style={{ left: tooltip.left, top: tooltip.top }}>
      {preview(members[hovered].body) || "附件"}
    </span>, document.body)}
  </nav>;
});
