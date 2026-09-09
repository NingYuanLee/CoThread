import React, { useEffect, useRef, useState } from "react";
import type { ContextUsage } from "../shared/context.js";

const tokens = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(value % 1_000_000 ? 2 : 0)}M`
    : value >= 1000
      ? `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}K`
      : String(value);

export function ContextMeter({
  usage,
  writable,
  onCompact,
}: {
  usage: ContextUsage;
  writable: boolean;
  onCompact: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const progress = Math.min(100, (usage.used / usage.limit) * 100);
  const composition = usage.categories.reduce(
    (sum, category) => sum + category.tokens,
    0,
  );
  const compacting =
    sending ||
    usage.automaticCompacting ||
    ["queued", "running"].includes(usage.compactStatus);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      <button
        type="button"
        className={`context-meter ${usage.used >= usage.autoCompactAt ? "near-limit" : ""}`}
        aria-label={`查看上下文用量：${tokens(usage.used)} / ${tokens(usage.limit)}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span
          className="context-meter-icon"
          aria-hidden="true"
          style={{
            background: `conic-gradient(currentColor ${progress}%, #e1e8db 0)`,
          }}
        >
          <span />
        </span>
        <span>
          {compacting
            ? "上下文压缩中…"
            : `上下文 ${usage.estimated ? "≈ " : ""}${tokens(usage.used)} / ${tokens(usage.limit)}`}
        </span>
      </button>
      <dialog
        ref={dialog}
        className="context-usage-dialog"
        aria-labelledby="context-usage-title"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              setOpen(false);
          }
        }}
      >
        <div className="context-dialog-heading">
          <div>
            <h2 id="context-usage-title">会话上下文</h2>
            <p>此会话独立使用一套上下文</p>
          </div>
          <button
            type="button"
            aria-label="关闭上下文详情"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="context-total">
          <strong>
            {usage.estimated && "≈ "}
            {tokens(usage.used)}
          </strong>
          <span>/ {tokens(usage.limit)} tokens</span>
          <small>{((usage.used / usage.limit) * 100).toFixed(1)}% 已使用</small>
        </div>
        <div
          className="context-capacity"
          role="progressbar"
          aria-label="上下文已使用比例"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${progress}%` }} />
          <i
            style={{ left: `${(usage.autoCompactAt / usage.limit) * 100}%` }}
          />
        </div>
        <p className="context-threshold">
          达到 {tokens(usage.autoCompactAt)} 时自动压缩 · 容量{" "}
          {tokens(usage.limit)}
        </p>
        <h3>上下文组成</h3>
        <div className="context-composition" aria-hidden="true">
          {usage.categories.map((category) => (
            <span
              key={category.key}
              style={{
                width: `${composition ? (category.tokens / composition) * 100 : 0}%`,
                background: category.color,
              }}
            />
          ))}
        </div>
        <ul className="context-categories">
          {usage.categories.map((category) => (
            <li key={category.key}>
              <span className="context-category-label">
                <i style={{ background: category.color }} />
                {category.label}
              </span>
              <span>≈ {tokens(category.tokens)}</span>
              <strong>
                {composition
                  ? ((category.tokens / composition) * 100).toFixed(1)
                  : "0.0"}
                %
              </strong>
            </li>
          ))}
        </ul>
        <p className="context-explanation">
          组成占比按当前模型上下文估算，与模型计量的总用量可能有差异。文件只在被读取后计入，不包含整个文档库。
        </p>
        {usage.lastCompactedAt && (
          <p className="context-last">
            已压缩 {usage.compactions} 次 · 最近{" "}
            {new Date(usage.lastCompactedAt).toLocaleString("zh-CN")}
          </p>
        )}
        {usage.compactStatus === "completed" && usage.compactResult && (
          <p className="context-result" role="status">
            {usage.compactResult.changed
              ? `压缩完成：${tokens(usage.compactResult.before)} → ${tokens(usage.compactResult.after)}`
              : "当前上下文较短，暂无可进一步压缩的内容。"}
          </p>
        )}
        {(error || usage.compactError) && (
          <p className="error" role="alert">
            {error || usage.compactError}
          </p>
        )}
        <div className="context-dialog-footer">
          <p>保留关键结论与近期内容，聊天记录和文档完整保留。</p>
          <button
            type="button"
            className="primary"
            disabled={!writable || compacting || !usage.used}
            onClick={async () => {
              setSending(true);
              setError("");
              try {
                await onCompact();
              } catch (cause) {
                setError((cause as Error).message);
              } finally {
                setSending(false);
              }
            }}
          >
            {usage.compactStatus === "queued"
              ? "等待当前任务完成…"
              : compacting
                ? "正在压缩…"
                : "立即压缩"}
          </button>
        </div>
      </dialog>
    </>
  );
}
