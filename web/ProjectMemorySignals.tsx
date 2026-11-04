/**
 * 待处理的项目进程信号：面板上只保留一个计数按钮，点开是只读列表弹窗。
 * 信号由业务事件写入队列，结算成功后自动消失；这里不提供写入或删除操作。
 */
import { useRef, useState } from "react";
import { DialogHeader } from "./DialogHeader";
import { animateDialogClose, Dialog } from "./dialog-fx";

export type ProjectMemorySignal = {
  id: string;
  sourceKind: string;
  hint: string;
  retryCount: number;
  lastError?: string | null;
  lastAttemptAt?: string | null;
  availableAt?: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  milestone: "项目变更",
  iteration_context: "迭代目标背景",
  archive: "迭代归档",
  task: "任务",
  document_version: "文档版本",
};

export function ProjectMemorySignalsButton({
  signals,
  onOpen,
}: {
  signals: ProjectMemorySignal[];
  onOpen: () => void;
}) {
  if (!signals.length) return null;
  return (
    <button type="button" className="wiki-action" onClick={onOpen}>
      待处理信号 {signals.length}
    </button>
  );
}

export function ProjectMemorySignalsDialog({
  signals,
  onClose,
  onIgnore,
}: {
  signals: ProjectMemorySignal[];
  onClose: () => void;
  onIgnore: (queueId: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const ignore = async (queueId: string) => {
    if (busyId) return;
    setBusyId(queueId);
    setError("");
    try {
      await onIgnore(queueId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "忽略失败，请稍后重试");
    } finally {
      setBusyId("");
    }
  };
  return (
    <Dialog
      ref={dialog}
      onRequestClose={onClose}
      className="l1-history-dialog dialog-list project-memory-signals-dialog"
      aria-labelledby="project-memory-signals-title"
    >
      <DialogHeader
        title="待处理的项目进程信号"
        titleId="project-memory-signals-title"
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭待处理信号"
        fullscreen
      />
      <p className="project-memory-signals-note">
        任务变化、迭代与项目变更写入的待结算来源；结算成功后自动消失，失败按 5
        级退避重试。确认真实无用的历史信号可以忽略，忽略后不再重试。
      </p>
      {error ? (
        <p className="project-memory-signals-error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="project-memory-signals-list">
        {signals.map((signal) => (
          <li key={signal.id}>
            <span className="wiki-kind">
              {SOURCE_LABELS[signal.sourceKind] || signal.sourceKind}
            </span>
            <strong>{signal.hint || "未命名信号"}</strong>
            <small>
              重试 {signal.retryCount} 次
              {signal.lastAttemptAt ? ` · 最近尝试 ${signal.lastAttemptAt}` : ""}
              {signal.availableAt ? ` · 下次尝试 ${signal.availableAt}` : ""}
            </small>
            {signal.lastError ? (
              <small className="project-memory-signals-error">{signal.lastError}</small>
            ) : null}
            <div className="project-memory-signals-actions">
              <button
                type="button"
                className="wiki-action"
                disabled={busyId !== ""}
                onClick={() => void ignore(signal.id)}
              >
                {busyId === signal.id ? "忽略中…" : "忽略"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
