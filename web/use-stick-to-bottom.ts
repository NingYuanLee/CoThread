/**
 * 对话区贴底：刷新后 Markdown 和输入框会比占位更高，只在数据到达时滚一次会停在半路。
 * 跟随开启时，内容高度或输入框让出的底边距再变，就再贴一次。人主动离开底部后不再拽回去。
 * 程序化跳转（左侧缩略条定位某条消息）先 holdStickToBottom 开一个窗口：窗口内不按
 * 「离底部不足 100px」重新武装跟随，否则平滑滚动刚起步就会被 pin() 拽回底部。
 * 键盘向上同理：一次只滚几十像素，阈值内若重新 follow，紧接着的 pin() 会拽回最底。
 */
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { decideFollow, NEAR_BOTTOM, PROGRAMMATIC_MS } from "./scroll-follow";

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
const UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

function isTextEntry(node: Element | null) {
  if (!(node instanceof Element)) return false;
  const field = node.closest("input, textarea, select, [contenteditable]");
  if (field instanceof HTMLInputElement) {
    if (
      ["button", "checkbox", "radio", "submit", "reset", "file", "color", "range"].includes(
        field.type,
      )
    )
      return false;
    return !field.disabled;
  }
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)
    return !field.disabled;
  return node instanceof HTMLElement && node.isContentEditable;
}

function isScrollableY(element: HTMLElement) {
  if (element.scrollHeight <= element.clientHeight + 1) return false;
  const overflow = getComputedStyle(element).overflowY;
  return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
}

/** 方向键会滚到这块对话，而不是停在输入框或另一块已经能滚的容器里。 */
function keyMayScrollConversation(active: Element | null, container: HTMLElement) {
  if (isTextEntry(active)) return false;
  let node = active instanceof HTMLElement ? active : null;
  if (!node || node === document.body || node === document.documentElement) return true;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node === container) return true;
    if (isScrollableY(node)) return false;
    node = node.parentElement;
  }
  return true;
}

function gapBelow(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

// 记在容器元素上，跳转入口和 hook 不必互相传参。
const programmaticUntil = new WeakMap<HTMLElement, number>();
// 窗口结束时的收尾判定由当前挂载的 hook 实例注册，避免跳转期间没人把跟随重新打开。
const settleHooks = new WeakMap<HTMLElement, () => void>();

/** 程序化滚动前调用（如点左侧缩略条跳消息）：窗口内禁止自动贴底把位置拽回去。 */
export function holdStickToBottom(container: HTMLElement | null | undefined) {
  if (!container) return;
  programmaticUntil.set(container, performance.now() + PROGRAMMATIC_MS);
  settleHooks.get(container)?.();
}

function jumping(element: HTMLElement) {
  return performance.now() < (programmaticUntil.get(element) ?? 0);
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
    let settle = 0;
    let ignoreScroll = false;
    let userActive = false;
    let userUntil = 0;
    let departingUntil = 0;
    let upwardGesture = false;
    let lastTop = container.scrollTop;
    const heldKeys = new Set<string>();
    const userIntent = () => userActive || heldKeys.size > 0 || performance.now() < userUntil;
    const userDeparting = () => performance.now() < departingUntil;
    const pin = () => {
      if (
        !alive ||
        !followRef.current ||
        userActive ||
        userDeparting() ||
        jumping(container) ||
        gapBelow(container) <= 1
      )
        return;
      ignoreScroll = true;
      container.scrollTop = container.scrollHeight;
      lastTop = container.scrollTop;
      requestAnimationFrame(() => {
        ignoreScroll = false;
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(pin);
    };
    // 跳转窗口结束后再定一次去留：落到接近底部就继续跟随，否则保持不跟随。
    const settleFollow = (): void => {
      clearTimeout(settle);
      const remaining = Math.max(0, (programmaticUntil.get(container) ?? 0) - performance.now());
      settle = window.setTimeout(() => {
        settle = 0;
        if (!alive) return;
        if (jumping(container)) {
          settleFollow();
          return;
        }
        const upKeyHeld = [...heldKeys].some((key) => UP_KEYS.has(key));
        if (!userActive && !userDeparting() && !upKeyHeld && gapBelow(container) <= NEAR_BOTTOM)
          followRef.current = true;
      }, remaining + 24);
    };
    const markUser = () => {
      userUntil = performance.now() + 700;
    };
    const markDeparting = () => {
      departingUntil = performance.now() + 700;
      markUser();
    };
    const handleScroll = () => {
      if (ignoreScroll) {
        lastTop = container.scrollTop;
        return;
      }
      const top = container.scrollTop;
      const movedUp = top < lastTop - 0.5;
      lastTop = top;
      const upKey = [...heldKeys].some((key) => UP_KEYS.has(key));
      const departing = movedUp && (upKey || userActive || upwardGesture);
      upwardGesture = false;
      if (heldKeys.size || userActive) markUser();
      if (departing) markDeparting();
      const decision = decideFollow({
        gap: gapBelow(container),
        jumping: jumping(container),
        userIntent: userIntent() || departing,
        following: followRef.current,
        departing,
      });
      if (decision === "follow") followRef.current = true;
      else if (decision === "leave") followRef.current = false;
      else if (decision === "pin") {
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
    const markWheel = (event: WheelEvent) => {
      markUser();
      if (event.deltaY < 0) upwardGesture = true;
    };
    const markTouch = () => {
      markUser();
      upwardGesture = true;
    };
    const markKeys = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !SCROLL_KEYS.has(event.key)) return;
      const active = document.activeElement instanceof Element ? document.activeElement : null;
      if (!keyMayScrollConversation(active, container)) return;
      heldKeys.add(event.key);
      const focusedHere = active instanceof Node && container.contains(active);
      if (!focusedHere) return;
      if (UP_KEYS.has(event.key) && container.scrollTop > 0) {
        followRef.current = false;
        markDeparting();
        return;
      }
      markUser();
    };
    const releaseKey = (event: KeyboardEvent) => {
      heldKeys.delete(event.key);
    };
    const releaseKeys = () => {
      heldKeys.clear();
    };

    pin();
    settleHooks.set(container, settleFollow);
    const sizes = new ResizeObserver(schedule);
    sizes.observe(content);
    const stage = container.closest(".conversation-stage");
    const styles = new MutationObserver(schedule);
    if (stage instanceof HTMLElement)
      styles.observe(stage, { attributes: true, attributeFilter: ["style"] });
    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", markWheel, { passive: true });
    container.addEventListener("touchmove", markTouch, { passive: true });
    container.addEventListener("pointerdown", markScrollbar);
    window.addEventListener("pointerup", releasePointer);
    window.addEventListener("pointercancel", releasePointer);
    window.addEventListener("keydown", markKeys);
    window.addEventListener("keyup", releaseKey);
    window.addEventListener("blur", releaseKeys);
    void document.fonts?.ready.then(() => {
      if (alive) schedule();
    });

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      if (settleHooks.get(container) === settleFollow) settleHooks.delete(container);
      sizes.disconnect();
      styles.disconnect();
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", markWheel);
      container.removeEventListener("touchmove", markTouch);
      container.removeEventListener("pointerdown", markScrollbar);
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
      window.removeEventListener("keydown", markKeys);
      window.removeEventListener("keyup", releaseKey);
      window.removeEventListener("blur", releaseKeys);
    };
  }, [token, containerRef, followRef]);
}

/**
 * 是否贴着底部：给「回到最新」按钮用。离开底部超过阈值就浮出来，滚回底部就收起。
 * 阈值和贴底逻辑保持一致，避免按钮和自动跟随互相打架。
 */
export function useAtBottom(containerRef: RefObject<HTMLElement | null>, token: string) {
  const [atBottom, setAtBottom] = useState(true);
  useLayoutEffect(() => {
    if (!token) return;
    const container = containerRef.current;
    if (!(container instanceof HTMLElement)) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setAtBottom(gapBelow(container) <= NEAR_BOTTOM);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const content = container.querySelector(":scope > .conversation-stream");
    const sizes = new ResizeObserver(schedule);
    sizes.observe(container);
    if (content instanceof HTMLElement) sizes.observe(content);
    container.addEventListener("scroll", schedule, { passive: true });
    void document.fonts?.ready.then(() => {
      schedule();
    });
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      container.removeEventListener("scroll", schedule);
    };
  }, [token, containerRef]);
  return atBottom;
}
