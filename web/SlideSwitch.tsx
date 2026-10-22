/**
 * 分段滑块：浅色轨道里一块白色滑块平移到当前项。
 * 登录、侧栏、设置和小程序环境共用这一套样式与动画。
 */
import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import "./slide-switch.css";

export type SlideSwitchItem<T extends string = string> = {
  value: T;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
};

export function SlideSwitch<T extends string>({
  label,
  value,
  items,
  onChange,
  size = "default",
  stretch = false,
  reselect = false,
  className,
}: {
  label: string;
  value: T;
  items: readonly SlideSwitchItem<T>[];
  onChange: (value: T) => void;
  size?: "default" | "compact" | "dense";
  stretch?: boolean;
  /** 再次点当前项也回调。登录切换和「新迭代」会据此清空草稿。 */
  reselect?: boolean;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const readyRef = useRef(false);
  const fromKeyboard = useRef(false);

  const measure = useCallback(() => {
    const root = rootRef.current;
    const thumb = thumbRef.current;
    if (!root || !thumb) return;
    const selected = root.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
    if (!selected) return;
    thumb.style.width = `${selected.offsetWidth}px`;
    thumb.style.transform = `translateX(${selected.offsetLeft}px)`;
    if (!readyRef.current) {
      readyRef.current = true;
      requestAnimationFrame(() => root.classList.add("is-ready"));
    }
  }, []);

  useLayoutEffect(() => {
    measure();
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    for (const button of Array.from(root.querySelectorAll("button"))) observer.observe(button);
    return () => observer.disconnect();
  }, [measure, value, items.length]);

  useLayoutEffect(() => {
    if (!fromKeyboard.current) return;
    fromKeyboard.current = false;
    rootRef.current
      ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
      ?.focus();
  }, [value]);

  const move = (direction: 1 | -1) => {
    const enabled = items.filter((item) => !item.disabled);
    if (!enabled.length) return;
    const current = enabled.findIndex((item) => item.value === value);
    const next = enabled[(current + direction + enabled.length) % enabled.length];
    if (next && next.value !== value) onChange(next.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      fromKeyboard.current = true;
      move(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      fromKeyboard.current = true;
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const first = items.find((item) => !item.disabled);
      if (first && first.value !== value) {
        fromKeyboard.current = true;
        onChange(first.value);
      }
    } else if (event.key === "End") {
      event.preventDefault();
      const last = [...items].reverse().find((item) => !item.disabled);
      if (last && last.value !== value) {
        fromKeyboard.current = true;
        onChange(last.value);
      }
    }
  };

  return (
    <div
      ref={rootRef}
      className={["slide-switch", `slide-switch-${size}`, stretch ? "is-stretch" : "", className]
        .filter(Boolean)
        .join(" ")}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
    >
      <span ref={thumbRef} className="slide-switch-thumb" aria-hidden="true" />
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            title={item.title}
            onClick={() => {
              if (item.disabled) return;
              if (!reselect && item.value === value) return;
              onChange(item.value);
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
