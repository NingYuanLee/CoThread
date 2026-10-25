import { FloatingPanel } from "./FloatingPanel";
import { FloatingPortal } from "./FloatingPortal";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sessionUsage } from "../shared/session-usage.js";
import { sessionUsageRecords } from "./chat-timeline";
import type { Thread } from "./workspace-types";

const duration = (ms: number | null) => {
  if (ms == null || !Number.isFinite(ms)) return "未记录";
  if (ms <= 0) return "0秒";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}秒`;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) return `${minutes}分${rest}秒`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分${rest}秒`;
};

const exactTokens = (value: number) => `${Math.round(value).toLocaleString("zh-CN")} 词元`;

const compactTokens = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1000
      ? `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}K`
      : String(Math.round(value));

function StatIcon({ kind }: { kind: "time" | "usage" }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "usage" ? (
        <>
          <ellipse cx="10" cy="4" rx="6" ry="2.5" />
          <path d="M4 4v6c0 3.3 12 3.3 12 0V4M4 10v6c0 3.3 12 3.3 12 0v-6" />
        </>
      ) : (
        <>
          <circle cx="10" cy="10" r="8" />
          <path d="M10 5v5l3 2" />
        </>
      )}
    </svg>
  );
}

const eventDurationMs = (events: Thread["events"]) => {
  let total = 0;
  for (const event of events) {
    if (event.tool === "thinking" || !event.finished_at) continue;
    const start = Date.parse(event.created_at.replace(" ", "T") + "Z");
    const end = Date.parse(event.finished_at.replace(" ", "T") + "Z");
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) total += end - start;
  }
  return total;
};

export function SessionUsage({
  thread,
  rounds,
  steps,
}: {
  thread: Thread;
  /** 老翁这类「整段会话一个累计用量」的场景：轮次与步数由调用方给，不能靠 replies 计数。 */
  rounds?: number;
  steps?: number;
}) {
  // 小祥自己跑过的每一轮都算（含子 Agent 完工唤醒），不含子 Agent 自己的执行用量。
  const stats = sessionUsage(
    sessionUsageRecords(thread.replies || [], thread.turnUsage || []),
    thread.toolDurationMs ?? eventDurationMs(thread.events),
  );
  // 轮次口径与轨迹页一致：有事件记录的触发消息数，而不是「有用途量记录的回复数」。
  const shownRounds = rounds ?? (thread.trajectoryRounds || stats.rounds);
  const shownSteps = steps ?? stats.steps;
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState<"time" | "usage" | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const visible = stats.hasUsage || (stats.toolMs != null && stats.toolMs > 0);
  useLayoutEffect(() => {
    if (!open || !panel.current || !anchor.current) return;
    const anchorBox = anchor.current.getBoundingClientRect();
    const panelBox = panel.current.getBoundingClientRect();
    const left = anchorBox.left + anchorBox.width / 2 - panelBox.width / 2;
    setPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - panelBox.width - 8)),
      top:
        anchorBox.top >= panelBox.height + 16
          ? anchorBox.top - panelBox.height - 8
          : Math.max(8, Math.min(anchorBox.bottom + 8, window.innerHeight - panelBox.height - 8)),
    });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) setOpen(null);
    };
    const scroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", scroll);
    };
  }, [open]);
  if (!visible) return null;
  const speed = stats.tps == null ? "未记录" : `${Math.round(stats.tps)} 词元/秒`;
  const timeLabel = [
    `${shownRounds} 轮`,
    shownSteps ? `${shownSteps} 步` : "",
    stats.tps == null ? "" : `${Math.round(stats.tps)} 词元/秒`,
  ]
    .filter(Boolean)
    .join(" · ");
  const usageLabel = [
    `${compactTokens(stats.totalTokens)} 词元`,
    stats.cacheHit == null ? "" : `缓存命中 ${Math.round(stats.cacheHit * 100)}%`,
  ]
    .filter(Boolean)
    .join(" · ");
  const usageRows = [
    ["缓存命中", stats.cacheHit == null ? "未记录" : `${Math.round(stats.cacheHit * 100)}%`],
    ["未缓存输入", exactTokens(stats.inputTokens)],
    ["缓存读取", exactTokens(stats.cacheReadTokens)],
    ...(stats.cacheWriteTokens ? [["缓存写入", exactTokens(stats.cacheWriteTokens)]] : []),
    ["输出", exactTokens(stats.outputTokens)],
  ];
  const timeRows = [
    ["模型用时", stats.modelMs > 0 ? duration(stats.modelMs) : "未记录"],
    ["工具调用用时", duration(stats.toolMs)],
    ["首 token 平均 (TTFT)", duration(stats.ttftMsAvg)],
    ["输出速度 (TPS)", speed],
  ];
  return (
    <div className="composer-session-usage" ref={root}>
      {(
        [
          ["time", timeLabel, "查看会话统计"],
          ["usage", usageLabel, "查看 Token 用量"],
        ] as const
      ).map(([kind, label, name]) => (
        <button
          key={kind}
          type="button"
          className="composer-footer-chip"
          aria-label={name}
          aria-expanded={open === kind}
          aria-haspopup="dialog"
          onClick={(event) => {
            anchor.current = event.currentTarget;
            setOpen(open === kind ? null : kind);
          }}
        >
          <StatIcon kind={kind} />
          <span>{label}</span>
        </button>
      ))}
      {open && (
        <FloatingPortal>
          <FloatingPanel
            onDismiss={() => setOpen(null)}
            ref={panel}
            direction="up"
            style={position}
            className="composer-stat-popover"
            role="dialog"
            aria-label={open === "time" ? "会话统计" : "Token 用量"}
          >
            <header>
              <span>
                <StatIcon kind={open} />
                {open === "time" ? "会话统计" : "Token 用量"}
              </span>
              {open === "usage" && <strong>{exactTokens(stats.totalTokens)}</strong>}
            </header>
            <dl>
              {(open === "time" ? timeRows : usageRows).map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </FloatingPanel>
        </FloatingPortal>
      )}
    </div>
  );
}
