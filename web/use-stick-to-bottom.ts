/**
 * 对话区贴底：刷新后 Markdown 和输入框会比占位更高，只在数据到达时滚一次会停在半路。
 * 跟随开启时，内容高度或输入框让出的底边距再变，就再贴一次。人主动离开底部后不再拽回去。
 */
import { useLayoutEffect, useRef, type RefObject } from "react";

const NEAR_BOTTOM = 100;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

function gapBelow(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

export function useStickToBottom(
  containerRef: RefObject<HTMLElement | null>,
  followRef: RefObject<boolean>,
  token: string,
  onScroll?: (element: HTMLElement) => void,
) {
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;
  useLayoutEffect(() => {
    if (!token) return;
    const container = containerRef.current;
    const content = container?.querySelector(":scope > .conversation-stream");
    if (!container || !(content instanceof HTMLElement)) return;

    let alive = true;
    let frame = 0;
    let ignoreScroll = false;
    let userActive = false;
    let userUntil = 0;
    const userIntent = () => userActive || performance.now() < userUntil;
    const pin = () => {
      if (!alive || !followRef.current || userActive || gapBelow(container) <= 1) return;
      ignoreScroll = true;
      container.scrollTop = container.scrollHeight;
      requestAnimationFrame(() => {
        ignoreScroll = false;
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(pin);
    };
    const markUser = () => {
      userUntil = performance.now() + 700;
    };
    const handleScroll = () => {
      if (ignoreScroll) return;
      const gap = gapBelow(container);
      if (gap < NEAR_BOTTOM) followRef.current = true;
      else if (userIntent()) followRef.current = false;
      else if (followRef.current) {
        pin();
        return;
      }
      onScrollRef.current?.(container);
    };
    const markScrollbar = (event: PointerEvent) => {
      if (event.target !== container) return;
      userActive = true;
      markUser();
    };
    const releasePointer = () => {
      if (!userActive) return;
      userActive = false;
      markUser();
      schedule();
    };
    const markKeys = (event: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(event.key)) return;
      const active = document.activeElement;
      if (active instanceof Node && container.contains(active)) markUser();
    };

    pin();
    const sizes = new ResizeObserver(schedule);
    sizes.observe(content);
    const stage = container.closest(".conversation-stage");
    const styles = new MutationObserver(schedule);
    if (stage instanceof HTMLElement)
      styles.observe(stage, { attributes: true, attributeFilter: ["style"] });
    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", markUser, { passive: true });
    container.addEventListener("touchmove", markUser, { passive: true });
    container.addEventListener("pointerdown", markScrollbar);
    window.addEventListener("pointerup", releasePointer);
    window.addEventListener("pointercancel", releasePointer);
    window.addEventListener("keydown", markKeys);
    void document.fonts?.ready.then(() => {
      if (alive) schedule();
    });

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      sizes.disconnect();
      styles.disconnect();
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", markUser);
      container.removeEventListener("touchmove", markUser);
      container.removeEventListener("pointerdown", markScrollbar);
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
      window.removeEventListener("keydown", markKeys);
    };
  }, [token, containerRef, followRef]);
}
