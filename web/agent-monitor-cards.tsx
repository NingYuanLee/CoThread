import React, { useLayoutEffect, useRef, useState } from "react";

import { UiIcon } from "./ui-icon";

import type { WorkflowTone } from "./agent-monitor-types";

export function State({ tone, children }: { tone: WorkflowTone; children: React.ReactNode }) {
  return (
    <span className={`monitor-state ${tone}`}>
      <UiIcon
        name={
          tone === "running"
            ? "running"
            : tone === "waiting"
              ? "pause"
              : tone === "failed"
                ? "failed"
                : tone === "blocked"
                  ? "blocked"
                  : "clock"
        }
        size={12}
      />
      {children}
    </span>
  );
}
export function L3TaskCard({
  title,
  meta,
  tone,
  status,
  settled,
  style,
  onDetail,
  onTrace,
  onSession,
}: {
  title: string;
  meta: string;
  tone: WorkflowTone;
  status: string;
  settled?: boolean;
  style?: React.CSSProperties;
  onDetail: () => void;
  onTrace: () => void;
  onSession?: () => void;
}) {
  return (
    <article className={`executor-row l3-task-card${settled ? " is-settled" : ""}`} style={style}>
      <div className="executor-title">
        <span className="executor-name">
          <strong title={title}>{title}</strong>
          <small>{meta}</small>
        </span>
        <State tone={tone}>{status}</State>
      </div>
      <div className="l3-task-actions">
        <button type="button" onClick={onDetail}>
          <UiIcon name="detail" size={12} />
          详情
        </button>
        <button type="button" onClick={onTrace}>
          <UiIcon name="trajectory" size={12} />
          轨迹
        </button>
        {onSession ? (
          <button type="button" onClick={onSession}>
            <UiIcon name="session" size={12} />
            会话
          </button>
        ) : null}
      </div>
    </article>
  );
}
export function CoordinatorStatusIcon({ busy, archived }: { busy: boolean; archived: boolean }) {
  const label = archived ? "已归档" : busy ? "工作中" : "空闲";
  return (
    <svg
      className={`coordinator-status${archived ? " is-archived" : busy ? " is-busy" : " is-idle"}`}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      {archived ? (
        <>
          <rect
            x="3"
            y="5"
            width="8"
            height="6.5"
            rx="1.2"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M5 5V4.2A2 2 0 0 1 7 2.2 2 2 0 0 1 9 4.2V5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </>
      ) : busy ? (
        <>
          <circle
            cx="7"
            cy="7"
            r="5"
            stroke="currentColor"
            strokeOpacity="0.22"
            strokeWidth="1.6"
          />
          <path
            d="M7 2a5 5 0 0 1 5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      ) : (
        <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.4" />
      )}
      <title>{label}</title>
    </svg>
  );
}
export function OverflowTitle({ text }: { text: string }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const measure = () => {
    const box = wrap.current;
    const label = inner.current;
    if (!box || !label) return;
    const maxWidth = label.style.maxWidth;
    label.style.maxWidth = "none";
    const extra = Math.ceil(label.scrollWidth - box.clientWidth);
    label.style.maxWidth = maxWidth;
    setOverflow(extra > 1 ? extra : 0);
  };
  useLayoutEffect(measure, [text]);
  return (
    <strong
      ref={wrap}
      className={`coordinator-title${overflow ? " is-overflow" : ""}`}
      style={
        overflow
          ? ({
              "--scroll-distance": `-${overflow}px`,
              "--scroll-duration": `${Math.min(8, Math.max(1.2, overflow / 42))}s`,
            } as React.CSSProperties)
          : undefined
      }
      onMouseEnter={measure}
    >
      <span ref={inner}>{text}</span>
    </strong>
  );
}
