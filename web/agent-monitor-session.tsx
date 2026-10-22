import { DialogHeader } from "./DialogHeader";
import { useEffect, useRef, useState } from "react";
import { AgentActivity } from "./AgentActivity";

import { contextUsage } from "../shared/context.js";
import { ContextMeter } from "./ContextMeter";

import { StreamingMarkdown } from "./StreamingMarkdown";
import { useAgentLiveOutput } from "./useAgentLiveOutput";

import { Dialog, animateDialogClose } from "./dialog-fx";
import { useTipError } from "./Tip";
import type { TaskSessionData } from "./agent-monitor-types";

export function TaskSessionDialog({
  kicker,
  title,
  emptyIdle,
  roleLabel,
  path,
  compactPath,
  compactBody,
  live,
  api,
  onClose,
}: {
  kicker: string;
  title: string;
  emptyIdle: string;
  roleLabel: (role: string) => string;
  path: string;
  compactPath: string;
  compactBody?: Record<string, string>;
  live?: { threadId: string; messageId: string };
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<TaskSessionData | null>(null);
  const [, setError] = useTipError();
  const liveRows = useAgentLiveOutput(live?.threadId || "", !!live);
  const liveOutput = live ? liveRows[live.messageId] : undefined;
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        setData(await api(path, undefined, undefined, controller.signal));
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 4000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path]);
  useEffect(() => {
    const box = list.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [data?.messages.length, data?.pending?.length, data?.events?.length, liveOutput?.revision]);
  const usage = data?.contextUsage || contextUsage(null, [], []);
  const pending = data?.pending || [];
  const events = data?.events || [];
  return (
    <Dialog
      onRequestClose={onClose}
      ref={dialog}
      className="l3-task-detail-dialog l3-task-session-dialog"
      aria-labelledby="l3-task-session-title"
    >
      <DialogHeader
        title={<>{title}</>}
        titleId="l3-task-session-title"
        subtitle={
          <>
            {kicker}
            {data?.progress ? <small>{data.progress}</small> : null}
          </>
        }
        actions={
          <>
            <div className="l3-task-session-tools">
              <ContextMeter
                usage={usage}
                writable={!data?.running}
                onCompact={async () => {
                  await api(compactPath, compactBody || {});
                  setData(await api(path));
                }}
              />
            </div>
          </>
        }
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭任务会话"
      />
      <div className="l3-task-session-body" ref={list}>
        {!data?.messages.length &&
          !pending.length &&
          !events.length &&
          !liveOutput?.content &&
          !liveOutput?.reasoning && (
            <p className="monitor-empty">{data?.running ? "正在写入原生会话…" : emptyIdle}</p>
          )}
        {data?.messages.map((message) => (
          <article key={message.id} className={`l3-task-session-msg ${message.role}`}>
            <small>{roleLabel(message.role)}</small>
            <div className="message-text">
              <StreamingMarkdown active={false} text={message.text} />
            </div>
          </article>
        ))}
        {!live &&
          (data?.events || [])
            .filter((event) => event.screenshotUrl)
            .map((event) => (
              <article key={`screenshot-${event.id}`} className="l3-task-session-msg assistant">
                <small>视觉验收 · {event.tool}</small>
                <img
                  className="agent-screenshot-preview"
                  src={event.screenshotUrl || undefined}
                  alt="Agent 视觉验收截图"
                  loading="lazy"
                />
              </article>
            ))}
        {pending.map((item) => (
          <article key={item.id} className="l3-task-session-msg pending">
            <small>{item.author} · 待纳入</small>
            <pre>{item.body}</pre>
          </article>
        ))}
        {data && (events.length || liveOutput?.content || liveOutput?.reasoning) ? (
          <div className="l3-task-session-live">
            <AgentActivity
              threadId={live?.threadId || ""}
              messageId={live?.messageId || ""}
              events={events}
              output={liveOutput}
              status={data.status || "running"}
              progress={data.progress}
              hasFinal={data.status === "completed"}
              expanded={!!live}
            />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
