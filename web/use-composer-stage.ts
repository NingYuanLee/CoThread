/**
 * 对话底栏盖在消息上：高度留给正文垫底，滚动条宽度让开，磨砂才不会挡住滚动条。
 * 群聊和问老翁共用，避免一边量了滚动条、另一边把底栏背景关掉。
 */
import { useLayoutEffect, type RefObject } from "react";

export function useComposerStageMetrics(
  composerRef: RefObject<HTMLElement | null>,
  conversationRef: RefObject<HTMLElement | null>,
  token: string,
) {
  useLayoutEffect(() => {
    const composer = composerRef.current;
    const conversation = conversationRef.current;
    const stage = composer?.closest(".conversation-stage");
    if (!(composer instanceof HTMLElement) || !(stage instanceof HTMLElement)) return;
    const sync = () => {
      const hidden = composer.hidden || !composer.offsetParent;
      stage.style.setProperty("--composer-height", `${hidden ? 0 : composer.offsetHeight}px`);
      let gutter = 0;
      if (conversation) {
        gutter = Math.max(0, conversation.offsetWidth - conversation.clientWidth);
        if (!gutter && conversation.scrollHeight > conversation.clientHeight) gutter = 12;
      }
      stage.style.setProperty("--chat-scrollbar", `${gutter}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(composer);
    const mutations = new MutationObserver(sync);
    if (conversation) {
      observer.observe(conversation);
      mutations.observe(conversation, { childList: true });
    }
    return () => {
      observer.disconnect();
      mutations.disconnect();
      stage.style.removeProperty("--composer-height");
      stage.style.removeProperty("--chat-scrollbar");
    };
  }, [token, composerRef, conversationRef]);
}
