import { useEffect, useRef } from "react";

import { formatDurationMs, labelAgentEventStatus } from "./ui-labels";

import {
  DialogClose,
  animateDialogClose,
  onDialogBackdropClick,
  onDialogCancel,
} from "./dialog-fx";
import type { MonitorData } from "./agent-monitor-types";
import { time } from "./agent-monitor-model";
import { State } from "./agent-monitor-cards";
export function EventLogDialog({
  events,
  onClose,
}: {
  events: MonitorData["eventLog"];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="agent-log-dialog l3-event-log-dialog"
      aria-labelledby="l3-event-log-title"
      onCancel={onDialogCancel(onClose)}
      onClick={onDialogBackdropClick(onClose)}
    >
      <header className="agent-monitor-header">
        <div>
          <span>DSH 轨迹</span>
          <h2 id="l3-event-log-title">轨迹</h2>
        </div>
        <DialogClose onClick={() => animateDialogClose(dialog.current, onClose)} label="关闭轨迹" />
      </header>
      <div className="monitor-log-list l3-event-log-body">
        {events.map((event) => (
          <article className="monitor-log-row" key={event.id}>
            <span className={`monitor-log-icon ${event.status}`} aria-hidden="true" />
            <span className="monitor-log-main">
              <strong>{event.action}</strong>
              <small>
                {event.thread_title} · {event.tool}
              </small>
            </span>
            <span className="monitor-log-meta">
              <State
                tone={
                  event.status === "failed"
                    ? "failed"
                    : event.status === "running"
                      ? "running"
                      : "idle"
                }
              >
                {labelAgentEventStatus(event.status)}
              </State>
              <time>{time(event.created_at)}</time>
              {event.duration_ms != null ? (
                <small>{formatDurationMs(event.duration_ms)}</small>
              ) : null}
            </span>
          </article>
        ))}
        {!events.length && <p className="monitor-empty">这个任务还没有轨迹。</p>}
      </div>
    </dialog>
  );
}
