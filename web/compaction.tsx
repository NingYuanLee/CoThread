import { useState } from "react";
import { UiIcon } from "./ui-icon";

// 立即压缩在消息流里的那条记录：点下就出现，跑完变成结果文案。
// 问老翁和群聊共用这套行为：开始 → 轮询 → 结果，期间禁用发送与再次压缩。
export type Compaction = {
  id: string;
  after: string | null;
  status: "running" | "completed" | "failed";
  before?: number | null;
  afterTokens?: number | null;
  changed?: boolean;
  reason?: string | null;
  error?: string | null;
  startedAt?: number;
  durationMs?: number;
};

export type CompactionStatus = {
  status: string;
  result?: { before?: number; after?: number; changed?: boolean; reason?: string } | null;
  error?: string | null;
};

export function shortTokens(value?: number | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  return amount >= 1000 ? String(Math.round(amount / 100) / 10) + "K" : String(Math.round(amount));
}

export function compactionLine(item: Compaction) {
  if (item.status === "running") return "正在压缩上下文";
  if (item.status === "failed") return "压缩失败";
  // 摘要提交成功但没变小，也算没压动，别写成“压缩完成”。
  if (
    item.changed &&
    typeof item.before === "number" &&
    typeof item.afterTokens === "number" &&
    item.afterTokens < item.before
  )
    return "压缩完成：" + shortTokens(item.before) + " → " + shortTokens(item.afterTokens);
  if (item.reason === "not_smaller" || item.changed) return "本次压缩未减少用量";
  if (item.reason === "already_small") return "上下文较短，无需压缩";
  return "已是最短，暂无可压缩";
}

export function CompactionRow({
  item,
  open,
  onToggle,
}: {
  item: Compaction;
  open: boolean;
  onToggle: () => void;
}) {
  const detail =
    item.status === "running"
      ? "正在把较早的对话摘要成前情，完成后保留最近一段原文。"
      : item.status === "failed"
        ? item.error || "压缩没有完成，可以再试一次。"
        : item.changed &&
            typeof item.before === "number" &&
            typeof item.afterTokens === "number" &&
            item.afterTokens < item.before
          ? "较早的对话已收成一段摘要，本次释放约 " +
            shortTokens(Math.max(0, item.before - item.afterTokens)) +
            " 词元。"
          : "这段对话已经是摘要，没有更早的内容可以再压缩。";
  return (
    <div className="compaction-run" data-status={item.status}>
      <button
        type="button"
        className="compaction-run-line"
        aria-expanded={open}
        title="点击展开或收起压缩详情"
        onClick={onToggle}
      >
        <span className="compaction-run-icon" aria-hidden="true">
          <UiIcon name="compress" size={13} />
        </span>
        <span className="compaction-run-label">{compactionLine(item)}</span>
        {item.status !== "running" && (
          <small className="compaction-run-hint">
            {item.durationMs
              ? "用时 " + Math.max(1, Math.round(item.durationMs / 1000)) + " 秒"
              : item.status === "failed"
                ? "失败"
                : ""}
          </small>
        )}
        <svg
          className="agent-status-chevron"
          width="0.857rem"
          height="0.857rem"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={open ? "m3 7 3-3 3 3" : "m3 5 3 3 3-3"} />
        </svg>
      </button>
      {open && (
        <div className="compaction-run-detail">
          <span>{detail}</span>
          {item.status !== "running" && (
            <span>
              压缩前 {shortTokens(item.before)} 词元 · 压缩后 {shortTokens(item.afterTokens)} 词元
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function useCompaction({
  start,
  status,
  anchor,
  onUpdate,
}: {
  /** 触发压缩（接口应立刻返回 202）。 */
  start: () => Promise<any>;
  /** 读一次当前压缩状态，返回 null 表示读不到。 */
  status: () => Promise<CompactionStatus | null>;
  /** 这条记录挂在哪个消息/轮次之后。 */
  anchor: () => string | null;
  /** 压缩结束后刷新会话数据。 */
  onUpdate?: () => void;
}) {
  const [rows, setRows] = useState<Compaction[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const running = rows.some((row) => row.status === "running");
  const toggle = (id: string) => setOpen((current) => ({ ...current, [id]: !current[id] }));
  const run = async () => {
    if (running) return;
    const id = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    const startedAt = Date.now();
    setRows((current) => [...current, { id, after: anchor(), status: "running", startedAt }]);
    const patch = (next: Partial<Compaction>) =>
      setRows((current) => current.map((row) => (row.id === id ? { ...row, ...next } : row)));
    try {
      const started = await start();
      if (started && started.changed === false) {
        patch({
          status: "completed",
          changed: false,
          reason: started.reason || null,
          durationMs: Date.now() - startedAt,
        });
        onUpdate?.();
        return;
      }
      let latest = await status();
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const state = latest?.status || "idle";
        if (state !== "running" && state !== "queued") break;
        await new Promise((resolve) => setTimeout(resolve, 1200));
        latest = await status();
      }
      onUpdate?.();
      const result = latest?.result || null;
      patch({
        status: latest?.status === "failed" ? "failed" : "completed",
        before: result?.before ?? null,
        afterTokens: result?.after ?? null,
        changed: result?.changed === true,
        reason: result?.reason || null,
        error: latest?.error || null,
        durationMs: Date.now() - startedAt,
      });
    } catch (reason) {
      patch({
        status: "failed",
        error: (reason as Error)?.message || "压缩失败",
        durationMs: Date.now() - startedAt,
      });
    }
  };
  return { rows, open, running, run, toggle };
}
