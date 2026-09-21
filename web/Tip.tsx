import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UiIcon, type UiIconName } from "./ui-icon";

export type TipKind = "success" | "error" | "info";

type TipItem = {
  id: number;
  message: string;
  kind: TipKind;
  leaving?: boolean;
};

type TipOptions = {
  kind?: TipKind;
  duration?: number;
};

const MAX_VISIBLE = 4;
const TIP_OUT_MS = 220;
const listeners = new Set<(items: TipItem[]) => void>();
const hideTimers = new Map<number, number>();
const leaveTimers = new Map<number, number>();
let items: TipItem[] = [];
let nextId = 1;

function emit() {
  for (const listener of listeners) listener(items);
}

function subscribe(listener: (next: TipItem[]) => void) {
  listeners.add(listener);
  listener(items);
  return () => { listeners.delete(listener); };
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearTimer(bag: Map<number, number>, id: number) {
  const timer = bag.get(id);
  if (!timer) return;
  window.clearTimeout(timer);
  bag.delete(id);
}

function removeTip(id: number) {
  clearTimer(hideTimers, id);
  clearTimer(leaveTimers, id);
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

export function dismissTip(id: number) {
  const current = items.find((item) => item.id === id);
  if (!current || current.leaving) return;
  clearTimer(hideTimers, id);
  if (prefersReducedMotion()) {
    removeTip(id);
    return;
  }
  items = items.map((item) => item.id === id ? { ...item, leaving: true } : item);
  emit();
  clearTimer(leaveTimers, id);
  leaveTimers.set(id, window.setTimeout(() => removeTip(id), TIP_OUT_MS));
}

export function showTip(message: string, kindOrOptions: TipKind | TipOptions = "success") {
  const text = String(message || "").trim();
  if (!text) return;
  const options = typeof kindOrOptions === "string" ? { kind: kindOrOptions } : kindOrOptions;
  const kind = options.kind || "success";
  const duration = options.duration ?? (kind === "error" ? 5200 : 2800);
  const id = nextId++;
  const leaving = items.filter((item) => item.leaving);
  const active = items.filter((item) => !item.leaving);
  items = [...active, { id, message: text, kind }].slice(-MAX_VISIBLE).concat(leaving);
  emit();
  if (duration > 0) {
    hideTimers.set(id, window.setTimeout(() => dismissTip(id), duration));
  }
}

const ICONS: Record<TipKind, UiIconName> = {
  success: "checkCircle",
  error: "failed",
  info: "info",
};

function TipCard({ tip }: { tip: TipItem }) {
  return (
    <div
      className={`tip-item tip-${tip.kind}${tip.leaving ? " is-leaving" : ""}`}
      role={tip.kind === "error" ? "alert" : "status"}
      onAnimationEnd={(event) => {
        if (event.currentTarget !== event.target) return;
        if (String(event.animationName).includes("tip-out")) removeTip(tip.id);
      }}
    >
      <UiIcon name={ICONS[tip.kind]} size={16} />
      <span>{tip.message}</span>
      <button type="button" className="tip-dismiss" aria-label="关闭提示" onClick={() => dismissTip(tip.id)}>
        <UiIcon name="close" size={12} />
      </button>
    </div>
  );
}

export function TipHost() {
  const [tips, setTips] = useState<TipItem[]>(items);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => subscribe(setTips), []);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      const open = el.matches(":popover-open");
      if (!tips.length) {
        if (open) el.hidePopover();
        return;
      }
      if (!open) el.showPopover();
    } catch {
      try { el.showPopover(); } catch { /* Keep fixed positioning fallback. */ }
    }
  }, [tips]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={host} className="tip-host" popover="manual" aria-live="polite" aria-relevant="additions">
      {tips.map((tip) => <TipCard key={tip.id} tip={tip} />)}
    </div>,
    document.body,
  );
}
