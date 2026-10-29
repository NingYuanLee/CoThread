/**
 * 对话底栏盖在消息上：高度留给正文垫底，滚动条宽度让开，磨砂才不会挡住滚动条。
 * 群聊和问老翁共用，避免一边量了滚动条、另一边把底栏背景关掉。
 *
 * 注意：底栏所在的 .conversation-stage 会在「问老翁」开合时整棵重建，
 * 而本 hook 挂在不会重挂的 WorkspaceApp 上。只认挂载时那一个 DOM 的话，
 * 切换后 --composer-height 会退回 0：最后几条消息被底栏压住，滚动也到不了底。
 * 所以每次都按 ref 重新定位 stage，并跟着左右子树的变化重测。
 */
import { useLayoutEffect, type RefObject } from "react";

export function useComposerStageMetrics(
  composerRef: RefObject<HTMLElement | null>,
  conversationRef: RefObject<HTMLElement | null>,
  token: string,
) {
  useLayoutEffect(() => {
    const initial = composerRef.current?.closest(".conversation-stage");
    // 首次进入时对话还在加载，底栏还没挂上。这里不能直接退出，否则之后
    // 底栏出现也不会重测，消息区就留不出底部，切走再回来才会正常。
    const root =
      (initial instanceof HTMLElement ? initial.closest(".main") : null) ??
      document.querySelector(".app-shell > .main") ??
      document.body;

    let frame = 0;
    let stage: HTMLElement | null = initial instanceof HTMLElement ? initial : null;
    let observedComposer: HTMLElement | null = null;
    let observedConversation: HTMLElement | null = null;
    const resize = new ResizeObserver(() => schedule());

    const clear = () => {
      stage?.style.removeProperty("--composer-height");
      stage?.style.removeProperty("--chat-scrollbar");
    };
    const sync = () => {
      frame = 0;
      const composer = composerRef.current;
      const conversation = conversationRef.current;
      const nextStage = composer?.closest(".conversation-stage") ?? null;
      if (!(composer instanceof HTMLElement) || !(nextStage instanceof HTMLElement)) {
        // 底栏暂时不在（轨迹视图或加载中）：清掉旧值，别留着继续压内容。
        clear();
        stage = null;
        return;
      }
      if (composer !== observedComposer) {
        if (observedComposer) resize.unobserve(observedComposer);
        resize.observe(composer);
        observedComposer = composer;
      }
      if (conversation !== observedConversation) {
        if (observedConversation) resize.unobserve(observedConversation);
        if (conversation instanceof HTMLElement) resize.observe(conversation);
        observedConversation = conversation;
      }
      stage = nextStage;
      const box = composer.getBoundingClientRect();
      const stageBox = nextStage.getBoundingClientRect();
      const hidden = composer.hidden || box.height < 1;
      const limit = Math.max(0, stageBox.height - 96);
      const height = hidden ? 0 : Math.min(box.height, limit || box.height);
      stage.style.setProperty("--composer-height", `${Math.round(height)}px`);
      let gutter = 0;
      if (conversation instanceof HTMLElement) {
        gutter = Math.max(0, conversation.offsetWidth - conversation.clientWidth);
        if (!gutter && conversation.scrollHeight > conversation.clientHeight) gutter = 12;
        gutter = Math.min(24, gutter);
      }
      stage.style.setProperty("--chat-scrollbar", `${gutter}px`);
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(sync);
    }

    sync();
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      clear();
    };
  }, [token, composerRef, conversationRef]);
}
