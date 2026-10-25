/**
 * 底栏上方的「回到最新」按钮：往上翻看历史时浮出来，点一下回到底部并重新跟随新消息。
 * 群聊和问老翁共用；位置跟着量出来的底栏高度走（见 workspace.css 的 .scroll-to-latest），
 * 所以输入框变高、分栏变窄都不会压住输入区。
 */
import type { RefObject } from "react";
import { UiIcon } from "./ui-icon";
import { useAtBottom } from "./use-stick-to-bottom";

export function ScrollToLatest({
  conversationRef,
  followRef,
  token,
  label = "回到最新",
}: {
  conversationRef: RefObject<HTMLDivElement | null>;
  followRef: RefObject<boolean>;
  token: string;
  label?: string;
}) {
  const atBottom = useAtBottom(conversationRef, token);
  if (atBottom) return null;
  return (
    <button
      type="button"
      className="scroll-to-latest"
      onClick={() => {
        const container = conversationRef.current;
        if (!container) return;
        followRef.current = true;
        container.scrollTop = container.scrollHeight;
      }}
    >
      <UiIcon name="chevronDown" size={13} />
      {label}
    </button>
  );
}
