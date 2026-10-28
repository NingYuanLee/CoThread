/**
 * 打开群聊时把滚动位置放到未读分割线上。
 * 未读超过一屏就停在「以下为新消息」，不再被贴底拽到最新一条；
 * 未读起点不在当前页时，先向前补历史，补到边界或达到页数上限。
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { holdStickToBottom } from "./use-stick-to-bottom";
import {
  entrySequence,
  extendUnreadAnchor,
  freezeUnreadAnchor,
  locateUnreadMarker,
  planUnreadScroll,
  type UnreadAnchor,
} from "./unread-marker";
import type { ThreadMessage } from "./workspace-helpers";
import type { Thread } from "./workspace-types";

const MAX_UNREAD_HISTORY_PAGES = 8;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

type Phase = {
  threadId: string;
  released: boolean;
  aligned: boolean;
  /** 这次进入已经把跟随关掉，避免后续渲染反复把用户拉回分割线。 */
  held: boolean;
  loads: number;
  /** 进入后不久封口，避免停留期间新消息再长出一条分割线。 */
  sealed: boolean;
  /** undefined：还没记下进入时的已读序号。 */
  readCursor: string | undefined;
  /** undefined：还没冻结；null：进入时没有未读。 */
  anchor: UnreadAnchor | null | undefined;
  /** 打开时消息已经齐，并且当时确实没有未读。这时停在里面才把新消息当已读。 */
  openedCaughtUp?: boolean;
};

export function useUnreadEntry({
  threadId,
  threadView,
  thread,
  timeline,
  historyLoading,
  loadHistory,
  conversationRef,
  followConversation,
  holdUnread,
  preserveHistoryScroll,
  onCatchUp,
}: {
  threadId: string;
  threadView: "chat" | "trajectory";
  thread: Thread | null;
  timeline: ThreadMessage[];
  historyLoading: boolean;
  loadHistory: () => Promise<void>;
  conversationRef: RefObject<HTMLDivElement | null>;
  followConversation: RefObject<boolean>;
  holdUnread: RefObject<boolean>;
  preserveHistoryScroll: RefObject<boolean>;
  /** 没有未读，或用户已从分割线往下滚并过了 2 秒时，把整段标成已读。 */
  onCatchUp?: (sequence: string) => void;
}) {
  const [dismissedFor, setDismissedFor] = useState("");
  const dismissed = dismissedFor === threadId;
  const phase = useRef<Phase>({
    threadId: "",
    released: false,
    aligned: false,
    held: false,
    loads: 0,
    sealed: false,
    readCursor: undefined,
    anchor: undefined,
  });
  if (phase.current.threadId !== threadId) {
    phase.current = {
      threadId,
      released: false,
      aligned: false,
      held: false,
      loads: 0,
      sealed: false,
      readCursor: undefined,
      anchor: undefined,
    };
  }
  const entry = phase.current;
  if (thread?.id === threadId && typeof thread.last_read_sequence === "string") {
    const hasSequence = thread.messages.some((message) => entrySequence(message) != null);
    if (entry.readCursor === undefined && hasSequence) {
      entry.readCursor = thread.last_read_sequence;
      entry.anchor = freezeUnreadAnchor(thread.messages, thread.last_read_sequence);
      entry.openedCaughtUp = entry.anchor === null;
    } else if (!entry.sealed && entry.readCursor === thread.last_read_sequence && hasSequence) {
      entry.anchor = extendUnreadAnchor(
        entry.anchor ?? null,
        thread.messages,
        thread.last_read_sequence,
      );
      if (entry.anchor) entry.openedCaughtUp = false;
    }
  }

  const canPage = Boolean(thread?.page?.hasMore && thread.page.before);
  const marker = entry.anchor
    ? locateUnreadMarker(
        timeline,
        thread?.messages || [],
        entry.anchor,
        canPage && entry.loads < MAX_UNREAD_HISTORY_PAGES,
      )
    : { kind: "none" as const };

  if (
    (marker.kind === "before" || marker.kind === "loading") &&
    !entry.released &&
    !entry.aligned &&
    !entry.held
  ) {
    entry.held = true;
    if (holdUnread) holdUnread.current = true;
    if (followConversation) followConversation.current = false;
  } else if (marker.kind === "none" && holdUnread) holdUnread.current = false;

  const loadHistoryRef = useRef(loadHistory);
  loadHistoryRef.current = loadHistory;

  useEffect(() => {
    if (!threadId) return;
    const timer = window.setTimeout(() => {
      if (phase.current.threadId === threadId) phase.current.sealed = true;
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [threadId]);

  useEffect(() => {
    if (threadView !== "chat" || marker.kind !== "loading" || historyLoading || !canPage) return;
    if (phase.current.threadId !== threadId || phase.current.loads >= MAX_UNREAD_HISTORY_PAGES)
      return;
    phase.current.loads += 1;
    if (preserveHistoryScroll) preserveHistoryScroll.current = false;
    void loadHistoryRef.current().finally(() => {
      if (preserveHistoryScroll) preserveHistoryScroll.current = true;
    });
  }, [
    marker.kind,
    historyLoading,
    canPage,
    thread?.page?.before,
    threadId,
    threadView,
    preserveHistoryScroll,
  ]);

  const markerId = !dismissed && marker.kind === "before" ? marker.messageId : "";
  useLayoutEffect(() => {
    if (!markerId || threadView !== "chat") return;
    const container = conversationRef.current;
    if (!container) return;
    let stopped = false;
    const align = () => {
      const current = phase.current;
      if (stopped || current.released || current.threadId !== threadId) return;
      const divider = container.querySelector("[data-unread-divider]");
      if (!(divider instanceof HTMLElement)) return;
      const dividerTop =
        divider.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;
      const decision = planUnreadScroll({
        dividerTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });
      if (!decision) return;
      current.aligned = true;
      // 程序化滚动窗口内，贴底逻辑不能把这次定位当成「人回到了底部」再拽走。
      holdStickToBottom(container);
      if (followConversation) followConversation.current = decision.follow;
      if (holdUnread) holdUnread.current = !decision.follow;
      if (Math.abs(container.scrollTop - decision.top) > 1) container.scrollTop = decision.top;
    };
    align();
    if (phase.current.released) return;
    const content = container.querySelector(":scope > .conversation-stream");
    const sizes = new ResizeObserver(() => align());
    if (content instanceof HTMLElement) sizes.observe(content);
    sizes.observe(container);
    const release = () => {
      stopped = true;
      phase.current.released = true;
      if (holdUnread) holdUnread.current = false;
      sizes.disconnect();
    };
    const onKey = (event: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(event.key)) return;
      const active = document.activeElement;
      if (active instanceof Node && container.contains(active)) release();
    };
    container.addEventListener("wheel", release, { passive: true });
    container.addEventListener("touchmove", release, { passive: true });
    container.addEventListener("pointerdown", release);
    window.addEventListener("keydown", onKey);
    void document.fonts?.ready.then(() => {
      if (!stopped) align();
    });
    return () => {
      stopped = true;
      sizes.disconnect();
      container.removeEventListener("wheel", release);
      container.removeEventListener("touchmove", release);
      container.removeEventListener("pointerdown", release);
      window.removeEventListener("keydown", onKey);
    };
  }, [markerId, threadId, threadView, conversationRef, followConversation, holdUnread]);

  const onCatchUpRef = useRef(onCatchUp);
  onCatchUpRef.current = onCatchUp;
  const caughtUpKey = useRef("");
  useEffect(() => {
    if (threadView !== "chat" || !thread || thread.id !== threadId) return;
    if (dismissed) {
      /* 往下滚过 2 秒，整段已读。 */
    } else if (!(phase.current.openedCaughtUp && phase.current.anchor === null)) return;
    const latest = [...thread.messages]
      .reverse()
      .find((item) => item.sequence && !item.id.startsWith("optimistic:"))?.sequence;
    if (!latest) return;
    const key = threadId + ":" + latest;
    if (caughtUpKey.current === key) return;
    try {
      if (thread.last_read_sequence && BigInt(thread.last_read_sequence) >= BigInt(latest)) {
        caughtUpKey.current = key;
        return;
      }
    } catch {
      return;
    }
    caughtUpKey.current = key;
    onCatchUpRef.current?.(latest);
  }, [
    dismissed,
    threadId,
    threadView,
    thread?.id,
    thread?.last_read_sequence,
    thread?.messages.at(-1)?.id,
    thread,
  ]);

  useEffect(() => {
    if (!markerId || threadView !== "chat") return;
    const container = conversationRef.current;
    if (!container) return;
    let timer = 0;
    let lastTop = container.scrollTop;
    const readyAt = performance.now() + 800;
    const arm = () => {
      if (timer) return;
      timer = window.setTimeout(() => setDismissedFor(threadId), 2000);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) arm();
    };
    const onScroll = () => {
      const next = container.scrollTop;
      const down = next > lastTop + 12;
      lastTop = next;
      if (performance.now() < readyAt) return;
      if (down) arm();
    };
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("scroll", onScroll);
    };
  }, [markerId, threadId, threadView, conversationRef]);

  return markerId;
}
