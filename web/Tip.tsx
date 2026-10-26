import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { overlayDuration, type OverlayDirection } from "./overlay-motion";
import { Check, CircleCheck, CircleX, Copy, Info, Timer, TriangleAlert, X } from "lucide-react";
import { designPxToRem } from "../shared/ui-scale.js";

export type TipKind = "success" | "error" | "warning" | "info";
export type TipOptions = {
  direction?: OverlayDirection;
  width?: number | string;
  kind?: TipKind;
  /** Milliseconds until dismissal. 0 keeps the tip until manually dismissed. */
  duration?: number;
  /** true copies the message; a string copies full details. Errors enable this by default. */
  copyText?: boolean | string;
  /** Preserve line breaks and wrap text; enables copying by default. */
  multiline?: boolean;
};
export type DelayedTipOptions = {
  direction?: OverlayDirection;
  width?: number | string;
  /** Wait before actually executing the action; defaults to 5000ms. */
  delay?: number;
  onExecute: () => unknown | Promise<unknown>;
};
type TipItem = {
  direction?: OverlayDirection;
  width?: number | string;
  id: number;
  message: string;
  kind: TipKind;
  persistent: boolean;
  copyText?: string;
  multiline?: boolean;
  leaving?: boolean;
  action?: { deadline: number; status: "pending" | "running" };
};
const listeners = new Set<(items: TipItem[]) => void>();
const hideTimers = new Map<number, number>();
const leaveTimers = new Map<number, number>();
const actionTimers = new Map<number, number>();
let items: TipItem[] = [];
let nextId = 1;

function emit() {
  for (const listener of listeners) listener(items);
}
function clearTimer(bag: Map<number, number>, id: number) {
  const timer = bag.get(id);
  if (timer !== undefined) window.clearTimeout(timer);
  bag.delete(id);
}
function removeTip(id: number) {
  clearTimer(hideTimers, id);
  clearTimer(leaveTimers, id);
  clearTimer(actionTimers, id);
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}
export function dismissTip(id: number) {
  const current = items.find((item) => item.id === id);
  if (!current || current.leaving) return;
  // Once execution starts, dismissal cannot promise to cancel a running operation.
  if (current.action?.status === "running") return;
  clearTimer(actionTimers, id);
  clearTimer(hideTimers, id);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    removeTip(id);
    return;
  }
  items = items.map((item) => (item.id === id ? { ...item, leaving: true } : item));
  emit();
  leaveTimers.set(
    id,
    window.setTimeout(() => removeTip(id), overlayDuration("tip")),
  );
}

/** Close visible feedback and cancel pending delayed commands. Running commands stay visible. */
export function dismissAllTips() {
  for (const tip of [...items]) dismissTip(tip.id);
}

/**
 * Global feedback, oldest first. Every tip has a close button.
 * showTip("已保存");
 * showTip("上传失败", { kind: "error", copyText: "完整错误信息" });
 * showTip("需要处理后才能继续", { kind: "warning", duration: 0 });
 * Returns an id for dismissTip(id); blank messages are ignored.
 */
export function showTip(message: string, kindOrOptions: TipKind | TipOptions = "success") {
  const text = String(message || "").trim();
  if (!text || typeof window === "undefined") return;
  const options = typeof kindOrOptions === "string" ? { kind: kindOrOptions } : kindOrOptions;
  const kind = options.kind || "success";
  const fallback = { success: 1800, error: 0, warning: 3000, info: 2800 }[kind];
  const duration = Number.isFinite(options.duration) ? Math.max(0, options.duration!) : fallback;
  const copyText =
    typeof options.copyText === "string"
      ? options.copyText
      : (options.copyText ?? (kind === "error" || options.multiline))
        ? text
        : undefined;
  // One visible card per message: several components can report the same failure at once.
  const duplicate = items.find(
    (item) => !item.leaving && item.message === text && item.kind === kind,
  );
  if (duplicate) return duplicate.id;
  const id = nextId++;
  // No truncation: a manual tip must never disappear because another one arrives.
  items = [
    ...items,
    {
      id,
      message: text,
      kind,
      copyText,
      multiline: options.multiline,
      persistent: duration === 0,
      direction: options.direction,
      width: options.width,
    },
  ];
  emit();
  if (duration > 0)
    hideTimers.set(
      id,
      window.setTimeout(() => dismissTip(id), duration),
    );
  return id;
}

/** Execute only after the grace period. Undo/close/dismissTip cancels the pending action. */
export function showDelayedTip(message: string, options: DelayedTipOptions) {
  const id = showTip(message, {
    kind: "info",
    duration: 0,
    direction: options.direction,
    width: options.width,
  });
  if (id === undefined) return;
  const delay = Math.min(
    2_147_483_647,
    Math.max(0, Number.isFinite(options.delay) ? options.delay! : 5000),
  );
  items = items.map((item) =>
    item.id === id
      ? { ...item, action: { deadline: Date.now() + delay, status: "pending" } }
      : item,
  );
  emit();
  actionTimers.set(
    id,
    window.setTimeout(async () => {
      actionTimers.delete(id);
      if (
        !items.some((item) => item.id === id && !item.leaving && item.action?.status === "pending")
      )
        return;
      items = items.map((item) =>
        item.id === id ? { ...item, action: { ...item.action!, status: "running" } } : item,
      );
      emit();
      let failure: unknown;
      let failed = false;
      try {
        await options.onExecute();
      } catch (cause) {
        failed = true;
        failure = cause;
      }
      // A retired host must not resurrect feedback after its operation settles.
      if (!items.some((item) => item.id === id)) return;
      items = items.map((item) => (item.id === id ? { ...item, action: undefined } : item));
      dismissTip(id);
      if (failed)
        showTip(failure instanceof Error ? failure.message : "延迟操作执行失败，请重试", {
          kind: "error",
          duration: 0,
        });
    }, delay),
  );
  return id;
}

/** Keep existing error state/guards while routing each failed action to the global host. */
export function useTipError(options: Omit<TipOptions, "kind"> = {}) {
  const [error, setValue] = useState("");
  const value = useRef("");
  const lastTip = useRef<
    | {
        id: number | undefined;
        message: string;
        copyText: TipOptions["copyText"];
        multiline: TipOptions["multiline"];
      }
    | undefined
  >(undefined);
  const duration = options.duration;
  const copyText = options.copyText;
  const multiline = options.multiline;
  const setError = useCallback<React.Dispatch<React.SetStateAction<string>>>(
    (update) => {
      const next = typeof update === "function" ? update(value.current) : update;
      value.current = next;
      setValue(next);
      if (next) {
        const previous = lastTip.current;
        if (
          previous?.message === next &&
          previous.copyText === copyText &&
          previous.multiline === multiline &&
          items.some((item) => item.id === previous.id && !item.leaving)
        )
          return;
        lastTip.current = {
          id: showTip(next, { kind: "error", duration, copyText, multiline }),
          message: next,
          copyText,
          multiline,
        };
      }
    },
    [duration, copyText, multiline],
  );
  // Content-only state, such as a login notice. Query and polling failures use setError.
  const setInlineError = useCallback<React.Dispatch<React.SetStateAction<string>>>((update) => {
    const next = typeof update === "function" ? update(value.current) : update;
    value.current = next;
    setValue(next);
  }, []);
  return [error, setError, setInlineError] as const;
}

const ICONS = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
};
function TipCard({ tip }: { tip: TipItem }) {
  const card = useRef<HTMLDivElement>(null);
  const entranceAnimation = useRef<Animation | undefined>(undefined);
  const [height, setHeight] = useState<number>();
  const [now, setNow] = useState(Date.now);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const copyVersion = useRef(0);
  useEffect(
    () => () => {
      copyVersion.current++;
    },
    [],
  );
  useEffect(() => {
    if (copyState !== "copied" && copyState !== "failed") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);
  const copy = async () => {
    if (!tip.copyText || copyState === "copying") return;
    const version = ++copyVersion.current;
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(tip.copyText);
      if (copyVersion.current === version) setCopyState("copied");
    } catch {
      if (copyVersion.current === version) setCopyState("failed");
    }
  };
  const copyLabel =
    copyState === "copied"
      ? "已复制"
      : copyState === "failed"
        ? "复制失败，点击重试"
        : tip.kind === "error"
          ? "复制报错信息"
          : "复制文本";
  const pending = tip.action?.status === "pending";
  const running = tip.action?.status === "running";
  const Icon = tip.action ? Timer : ICONS[tip.kind];
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Run once per card, rather than restarting a CSS animation when the portal
    // moves out of a closing native dialog or its popover is shown again.
    const surface = card.current;
    if (!surface) return;
    const material = getComputedStyle(surface);
    const entrance = surface.animate(
      [
        {
          opacity: 0,
          transform: `translate3d(${material.getPropertyValue("--overlay-x").trim() || "32px"}, ${material.getPropertyValue("--overlay-y").trim() || "0px"}, 0)`,
        },
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
      ],
      { duration: overlayDuration("tip"), easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    entranceAnimation.current = entrance;
    return () => entrance?.cancel();
  }, []);
  useLayoutEffect(() => {
    if (tip.leaving) entranceAnimation.current?.cancel();
  }, [tip.leaving]);
  useEffect(() => {
    if (!pending) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [pending]);
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const measure = () => setHeight(el.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className={`tip-slot${tip.leaving ? " is-leaving" : ""}`}
      style={{ height: tip.leaving ? 0 : height, marginBottom: tip.leaving ? 0 : undefined }}
    >
      <div
        ref={card}
        data-overlay="tip"
        data-direction={tip.direction ?? "right"}
        style={{ width: tip.width }}
        className={`tip-item tip-${tip.kind}${tip.multiline ? " is-multiline" : ""}${tip.leaving ? " is-leaving" : ""}`}
        role={tip.kind === "error" ? "alert" : "status"}
        aria-atomic="true"
      >
        <Icon className="tip-icon" size={designPxToRem(18)} strokeWidth={1.8} aria-hidden="true" />
        <span className="tip-message" title={tip.multiline ? undefined : tip.message}>
          {tip.message}
        </span>
        {tip.copyText && (
          <button
            type="button"
            className={`tip-copy${copyState === "failed" ? " is-failed" : ""}`}
            aria-label={copyLabel}
            title={copyLabel}
            disabled={tip.leaving || copyState === "copying"}
            onClick={() => void copy()}
          >
            {copyState === "copied" ? (
              <Check size={designPxToRem(14)} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <Copy size={designPxToRem(14)} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
        )}
        {pending && !tip.leaving && (
          <>
            <span className="tip-countdown" aria-hidden="true">
              {Math.max(0, Math.ceil((tip.action!.deadline - now) / 1000))}s
            </span>
            <button type="button" className="tip-undo" onClick={() => dismissTip(tip.id)}>
              撤销
            </button>
          </>
        )}
        {running && <span className="tip-countdown">执行中</span>}
        <button
          type="button"
          className="tip-dismiss"
          aria-label={pending ? "取消操作并关闭提示" : "关闭提示"}
          title={pending ? "取消操作并关闭提示" : "关闭提示"}
          disabled={tip.leaving || running}
          onClick={() => dismissTip(tip.id)}
        >
          <X size={designPxToRem(14)} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function TipHost() {
  const [tips, setTips] = useState(items);
  const showCloseAll =
    tips.filter((tip) => tip.persistent && !tip.leaving && !tip.action).length > 6;
  const [host] = useState(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.className = "tip-host";
    el.setAttribute("popover", "manual");
    el.setAttribute("aria-label", "全局提示");
    return el;
  });
  const tipsRef = useRef(tips);
  tipsRef.current = tips;
  useEffect(() => {
    listeners.add(setTips);
    setTips(items);
    return () => {
      listeners.delete(setTips);
      if (!listeners.size) {
        for (const id of hideTimers.keys()) clearTimer(hideTimers, id);
        for (const id of leaveTimers.keys()) clearTimer(leaveTimers, id);
        for (const id of actionTimers.keys()) clearTimer(actionTimers, id);
        items = [];
      }
    };
  }, []);
  const syncLayer = useCallback(() => {
    if (!host) return;
    // A body portal becomes inert under showModal(). Move the stable portal container
    // inside the active dialog, then promote it to the top layer with a popover.
    const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog:modal"));
    const parent = dialogs.at(-1) ?? document.body;
    const moved = host.parentElement !== parent;
    if (moved) parent.appendChild(host);
    if (typeof host.showPopover !== "function") return;
    try {
      if (!tipsRef.current.length) {
        if (host.matches(":popover-open")) host.hidePopover();
      } else {
        if (moved && host.matches(":popover-open")) host.hidePopover();
        if (!host.matches(":popover-open")) host.showPopover();
      }
    } catch {
      /* Fixed-position fallback for browsers without popover support. */
    }
  }, [host]);
  useLayoutEffect(() => {
    syncLayer();
    const observer = new MutationObserver(syncLayer);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => {
      observer.disconnect();
      host?.remove();
    };
  }, [host, syncLayer]);
  useLayoutEffect(syncLayer, [tips, syncLayer]);
  return host
    ? createPortal(
        <>
          <div
            className={`tip-toolbar${showCloseAll ? " is-visible" : ""}`}
            aria-hidden={!showCloseAll}
          >
            {showCloseAll && (
              <button type="button" className="tip-close-all" onClick={dismissAllTips}>
                全部关闭
              </button>
            )}
          </div>
          {tips.map((tip) => (
            <TipCard key={tip.id} tip={tip} />
          ))}
        </>,
        host,
      )
    : null;
}
