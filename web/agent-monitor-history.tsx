import { useEffect, useRef } from "react";

import {
  DialogClose,
  animateDialogClose,
  onDialogBackdropClick,
  onDialogCancel,
} from "./dialog-fx";
import type { HistoryColumn, HistoryRow, L3Detail } from "./agent-monitor-types";

import { State } from "./agent-monitor-cards";
export function L3TaskDetailDialog({ detail, onClose }: { detail: L3Detail; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="l3-task-detail-dialog"
      aria-labelledby="l3-task-detail-title"
      onCancel={onDialogCancel(onClose)}
      onClick={onDialogBackdropClick(onClose)}
    >
      <header className="agent-monitor-header">
        <div>
          <span>任务详情</span>
          <h2 id="l3-task-detail-title">{detail.title}</h2>
        </div>
        <DialogClose onClick={() => animateDialogClose(dialog.current, onClose)} label="关闭详情" />
      </header>
      <div className="l3-task-detail-body task-detail">
        <header>
          <div>
            <small>{detail.typeLabel}</small>
            <h3>{detail.title}</h3>
          </div>
          <State tone={detail.tone}>{detail.statusLabel}</State>
        </header>
        <dl className="task-detail-meta">
          <div>
            <dt>任务来源</dt>
            <dd>{detail.source}</dd>
          </div>
          <div>
            <dt>责任主体</dt>
            <dd>{detail.target}</dd>
          </div>
          <div>
            <dt>任务执行</dt>
            <dd>{detail.executor}</dd>
          </div>
          <div>
            <dt>时间</dt>
            <dd>{detail.time}</dd>
          </div>
          {detail.artifacts ? (
            <div>
              <dt>产物</dt>
              <dd>{detail.artifacts} 项</dd>
            </div>
          ) : null}
        </dl>
        <section>
          <h4>目标</h4>
          <p>{detail.goal || "暂无"}</p>
        </section>
        {detail.progress ? (
          <section>
            <h4>进展</h4>
            <p>{detail.progress}</p>
          </section>
        ) : null}
        {detail.result ? (
          <section>
            <h4>结果</h4>
            <p>{detail.result}</p>
          </section>
        ) : null}
      </div>
    </dialog>
  );
}
export function L1HistoryDialog({
  title,
  columns,
  rows,
  empty,
  onClose,
}: {
  title: string;
  columns: HistoryColumn[];
  rows: HistoryRow[];
  empty: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const hasActions = rows.some((row) => row.actions);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="l3-task-detail-dialog l1-history-dialog"
      aria-labelledby="l1-history-title"
      onCancel={onDialogCancel(onClose)}
      onClick={onDialogBackdropClick(onClose)}
    >
      <header className="agent-monitor-header">
        <div>
          <span>历史记录</span>
          <h2 id="l1-history-title">{title}</h2>
        </div>
        <DialogClose
          onClick={() => animateDialogClose(dialog.current, onClose)}
          label="关闭历史记录"
        />
      </header>
      <div className="l1-history-body">
        <table className="l1-history-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              {hasActions ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.key === "status" && row.tone ? (
                      <State tone={row.tone}>{row.cells[column.key]}</State>
                    ) : (
                      row.cells[column.key] || ""
                    )}
                  </td>
                ))}
                {hasActions ? <td className="l1-history-actions">{row.actions}</td> : null}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="monitor-empty" colSpan={columns.length + (hasActions ? 1 : 0)}>
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
