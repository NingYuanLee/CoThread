/**
 * 会话弹窗内核：记忆作业维护会话与小祥监控的任务会话共用。
 * 版式对齐工作空间里的问老翁：会话和轨迹在同一个弹窗里切换，底栏固定回合/步数、用量与上下文。
 * 只读，没有输入框；调用方用 load 提供数据，用 extras 追加各自的运行态内容。
 */
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ContextUsage } from "../shared/context.js";
import { MessageNavigator } from "./MessageNavigator";
import { SessionUsage } from "./SessionUsage";
import { MessageUsage, type UsageStats } from "./MessageUsage";
import { ContextMeter } from "./ContextMeter";
import type { Thread } from "./workspace-types";
import { DialogHeader } from "./DialogHeader";
import { animateDialogClose, Dialog } from "./dialog-fx";
import { ScrollToLatest } from "./ScrollToLatest";
import { UiIcon } from "./ui-icon";
import { useStickToBottom } from "./use-stick-to-bottom";
import type { AgentLogScope } from "./trajectory-model";

const MessageMarkdown = lazy(() =>
  import("./MessageMarkdown").then((module) => ({ default: module.MessageMarkdown })),
);
const AgentTrajectory = lazy(() =>
  import("./AgentLogDialog").then((module) => ({ default: module.AgentTrajectory })),
);

export type SessionMessage = {
  id: string;
  role: string;
  source: string | null;
  text: string;
  createdAt?: string;
  usage?: UsageStats;
};
export type SessionDialogData = {
  status?: string;
  progress?: string | null;
  running?: boolean;
  error?: string | null;
  contextUsage?: ContextUsage | null;
  messages?: SessionMessage[];
};
export type SessionTotals = {
  turns: number;
  steps: number;
  tokens?: number;
  durationMs?: number;
  modelCalls?: number;
};
export type SessionDialogPayload = {
  data: SessionDialogData;
  /** 轨迹汇总的回合/步数；拿不到时留空，底栏不画这两枚统计。 */
  totals?: SessionTotals | null;
};
export type SessionApi = (
  path: string,
  data?: unknown,
  method?: string,
  signal?: AbortSignal,
) => Promise<any>;

const EMPTY_THREAD = { replies: [], events: [] } as unknown as Thread;

export function MessageTime({ value }: { value?: string }) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime()))
    return <span className="message-action-time">时间未记录</span>;
  return (
    <time className="message-action-time" dateTime={date.toISOString()}>
      {date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })}
    </time>
  );
}

type Group = { trigger?: SessionMessage; notice?: SessionMessage; output: SessionMessage[] };

function groupMessages(messages: SessionMessage[]): Group[] {
  const groups: Group[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      groups.push({ notice: message, output: [] });
      continue;
    }
    if (message.role === "user") groups.push({ trigger: message, output: [] });
    else {
      if (!groups.length) groups.push({ output: [] });
      groups[groups.length - 1].output.push(message);
    }
  }
  return groups;
}

export function SessionConversationDialog({
  title,
  titleId,
  subtitle,
  closeLabel,
  api,
  load,
  sourceKey,
  trajectory = null,
  empty,
  navigatorAuthor,
  triggerAuthor = "触发消息",
  extras,
  context,
  dialogClassName,
  onClose,
}: {
  title: React.ReactNode;
  titleId: string;
  subtitle: React.ReactNode | ((data: SessionDialogData | null) => React.ReactNode);
  closeLabel: string;
  api: SessionApi;
  load: (signal: AbortSignal) => Promise<SessionDialogPayload>;
  /** 切换数据源时重置视图、滚动与汇总；同一会话的轮询不重置。 */
  sourceKey: string;
  trajectory?: AgentLogScope | null;
  empty?: (data: SessionDialogData | null) => React.ReactNode;
  navigatorAuthor: string;
  triggerAuthor?: string;
  extras?: (data: SessionDialogData | null) => React.ReactNode;
  context?: (
    data: SessionDialogData | null,
  ) => { writable: boolean; onCompact?: () => Promise<void> } | null;
  dialogClassName?: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const followConversation = useRef(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const [view, setView] = useState<"chat" | "trajectory">("chat");
  const [data, setData] = useState<SessionDialogData | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [totals, setTotals] = useState<SessionTotals | null>(null);
  const [revision, setRevision] = useState(0);
  const roomKey = view === "chat" ? sourceKey : "";
  useStickToBottom(conversationRef, followConversation, roomKey);
  const messages = data?.messages || [];
  const groups = groupMessages(messages);
  const navigatorMessages = groups.flatMap((group) => [
    ...(group.trigger
      ? [{ id: group.trigger.id, source: "human", body: group.trigger.text, author: triggerAuthor }]
      : []),
    ...group.output
      .filter((message) => message.role === "assistant")
      .slice(-1)
      .map((message) => ({
        id: message.id,
        source: "local_ai",
        body: message.text,
        author: navigatorAuthor,
      })),
  ]);
  const contextConfig = context?.(data) || null;
  const fallbackTurns = groups.filter((group) => !!group.trigger).length;
  const rounds = totals ? totals.turns : fallbackTurns;
  const showRounds = rounds > 0;
  const showFooter = showRounds || !!data?.contextUsage;
  // 底栏用量按本会话消息的用量汇总；消息没有逐条用量时退回轨迹汇总的总量，
  // 避免记忆作业/任务会话固定显示「用量未记录」。
  const usageReplies = messages
    .filter((message) => message.usage)
    .map((message) => ({ usage_stats: message.usage }));
  const fallbackReplies =
    totals && (totals.tokens || totals.durationMs || totals.modelCalls)
      ? [
          {
            usage_stats: {
              totalTokens: totals.tokens || 0,
              executionDurationMs: totals.durationMs || 0,
              steps: totals.steps,
              calls: totals.modelCalls || 0,
            },
          },
        ]
      : [];
  const usageThread = {
    ...EMPTY_THREAD,
    replies: (usageReplies.length ? usageReplies : fallbackReplies) as unknown as Thread["replies"],
    toolDurationMs: totals?.durationMs ?? 0,
  } as Thread;

  useEffect(() => {
    setView("chat");
    setData(null);
    setError("");
    setCopied("");
    followConversation.current = true;
  }, [sourceKey]);

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    setTotals(null);
    const run = async () => {
      try {
        const next = await loadRef.current(controller.signal);
        if (!controller.signal.aborted) {
          setData(next.data);
          setError("");
          setTotals(next.totals || null);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "会话读取失败");
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(run, 4000);
      }
    };
    void run();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [api, sourceKey, revision]);

  const copy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
  };
  const compact = async () => {
    if (!contextConfig?.onCompact) return;
    await contextConfig.onCompact();
    setRevision((value) => value + 1);
  };
  const renderMessage = (message: SessionMessage) => (
    <article key={message.id} className="message own" data-message-id={message.id}>
      <div className="message-content">
        <div className="message-text">
          <Suspense fallback={message.text}>
            <MessageMarkdown body={message.text} />
          </Suspense>
        </div>
        <div className="message-actions">
          <MessageTime value={message.createdAt} />
          <button
            type="button"
            title={copied === message.id ? "已复制" : "复制"}
            aria-label="复制"
            onClick={() => copy(message.id, message.text)}
          >
            <UiIcon name={copied === message.id ? "check" : "copy"} size={14} />
          </button>
        </div>
      </div>
    </article>
  );

  return (
    <Dialog
      onRequestClose={onClose}
      ref={dialog}
      className={`agent-session-dialog dialog-fullscreen${dialogClassName ? ` ${dialogClassName}` : ""}`}
      aria-labelledby={titleId}
    >
      <DialogHeader
        title={<>{title}</>}
        titleId={titleId}
        subtitle={<>{typeof subtitle === "function" ? subtitle(data) : subtitle}</>}
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel={closeLabel}
        fullscreen
      />
      {trajectory ? (
        <div className="agent-session-toolbar">
          <div className="conversation-views" role="tablist" aria-label="会话视图">
            <button
              type="button"
              role="tab"
              className="conversation-view"
              aria-selected={view === "chat"}
              onClick={() => setView("chat")}
            >
              <UiIcon name="human" size={13} />
              会话
            </button>
            <button
              type="button"
              role="tab"
              className="conversation-view"
              aria-selected={view === "trajectory"}
              onClick={() => setView("trajectory")}
            >
              <UiIcon name="trajectory" size={13} />
              轨迹
            </button>
          </div>
        </div>
      ) : null}
      {view === "trajectory" && trajectory ? (
        <section className="conversation-stage conversation-stage-trajectory" aria-label="轨迹">
          <Suspense fallback={<p className="muted">正在加载轨迹…</p>}>
            <AgentTrajectory key={sourceKey} scope={trajectory} api={api} />
          </Suspense>
        </section>
      ) : (
        <section className="conversation-stage elder-stage" aria-label="会话">
          <MessageNavigator
            messages={navigatorMessages}
            container={conversationRef}
            onNavigate={() => {
              followConversation.current = false;
            }}
          />
          <div className="conversation" ref={conversationRef}>
            <div className="conversation-stream">
              <div className="timeline-start" aria-hidden="true">
                <span />
              </div>
              {error ? <p role="alert">{error}</p> : null}
              {!error && !messages.length ? (empty ? empty(data) : null) : null}
              {groups.map((group, groupIndex) => {
                let finalIndex = -1;
                for (let index = group.output.length - 1; index >= 0; index -= 1) {
                  if (group.output[index].role === "assistant") {
                    finalIndex = index;
                    break;
                  }
                }
                const final = finalIndex >= 0 ? group.output[finalIndex] : undefined;
                const process = group.output.filter((_, index) => index !== finalIndex);
                return (
                  <div key={group.trigger?.id || group.notice?.id || `output-${groupIndex}`}>
                    {group.notice && (
                      <div className="elder-mode-notice">
                        <span>{group.notice.text}</span>
                      </div>
                    )}
                    {group.trigger && renderMessage(group.trigger)}
                    {(process.length > 0 || final) && (
                      <article className="message agent-session-turn">
                        <div className="message-content">
                          {process.length > 0 && (
                            <details className="agent-session-process">
                              <summary>输出过程 · {process.length} 条</summary>
                              {process.map((message) => (
                                <div
                                  key={message.id}
                                  className="message-text"
                                  data-message-id={message.id}
                                >
                                  <Suspense fallback={message.text}>
                                    <MessageMarkdown body={message.text} />
                                  </Suspense>
                                  <div className="message-actions">
                                    <button
                                      type="button"
                                      title={copied === message.id ? "已复制" : "复制"}
                                      aria-label="复制"
                                      onClick={() => copy(message.id, message.text)}
                                    >
                                      <UiIcon
                                        name={copied === message.id ? "check" : "copy"}
                                        size={14}
                                      />
                                    </button>
                                    {message.usage ? (
                                      <MessageUsage
                                        record={{ usage_stats: message.usage }}
                                        allowClockFallback={false}
                                      />
                                    ) : null}
                                    <MessageTime value={message.createdAt} />
                                  </div>
                                </div>
                              ))}
                            </details>
                          )}
                          {final && (
                            <div data-message-id={final.id}>
                              <div className="message-text">
                                <Suspense fallback={final.text}>
                                  <MessageMarkdown body={final.text} />
                                </Suspense>
                              </div>
                              <div className="message-actions">
                                <button
                                  type="button"
                                  title={copied === final.id ? "已复制" : "复制"}
                                  aria-label="复制"
                                  onClick={() => copy(final.id, final.text)}
                                >
                                  <UiIcon name={copied === final.id ? "check" : "copy"} size={14} />
                                </button>
                                <MessageUsage
                                  record={{ usage_stats: final.usage }}
                                  allowClockFallback={false}
                                />
                                <MessageTime value={final.createdAt} />
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    )}
                  </div>
                );
              })}
              {extras ? extras(data) : null}
            </div>
          </div>
          <ScrollToLatest
            conversationRef={conversationRef}
            followRef={followConversation}
            token={roomKey}
          />
          {showFooter ? (
            <div className="composer-context agent-session-footer">
              {showRounds ? (
                <SessionUsage
                  thread={usageThread}
                  rounds={rounds}
                  steps={totals?.steps}
                  showWithoutUsage
                />
              ) : null}
              {data?.contextUsage && contextConfig ? (
                <ContextMeter
                  variant="footer"
                  usage={data.contextUsage}
                  writable={contextConfig.writable}
                  onCompact={compact}
                />
              ) : null}
            </div>
          ) : null}
        </section>
      )}
    </Dialog>
  );
}
