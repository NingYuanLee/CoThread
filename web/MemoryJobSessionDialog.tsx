/**
 * 记忆作业的维护会话：版式对齐工作空间里的问老翁，会话和轨迹在同一个弹窗里切换。
 * 只读，没有输入框。
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
import { buildTrajectory, type AgentLogData, type AgentLogScope } from "./trajectory-model";

const MessageMarkdown = lazy(() =>
  import("./MessageMarkdown").then((module) => ({ default: module.MessageMarkdown })),
);
const AgentTrajectory = lazy(() =>
  import("./AgentLogDialog").then((module) => ({ default: module.AgentTrajectory })),
);

type SessionMessage = {
  id: string;
  role: string;
  source: string | null;
  text: string;
  createdAt?: string;
  usage?: UsageStats;
};
function MessageTime({ value }: { value?: string }) {
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
type SessionData = {
  status?: string;
  running?: boolean;
  error?: string | null;
  contextUsage?: ContextUsage | null;
  messages?: SessionMessage[];
};
type MemoryApi = (
  path: string,
  data?: unknown,
  method?: string,
  signal?: AbortSignal,
) => Promise<any>;

export function MemoryJobSessionDialog({
  title,
  projectId,
  task,
  api,
  onClose,
}: {
  title: string;
  projectId: string;
  task: string;
  api: MemoryApi;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const followConversation = useRef(true);
  const [view, setView] = useState<"chat" | "trajectory">("chat");
  const [data, setData] = useState<SessionData | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [trajectoryTotals, setTrajectoryTotals] = useState<{ turns: number; steps: number } | null>(
    null,
  );
  const roomKey = view === "chat" ? projectId + ":" + task : "";
  useStickToBottom(conversationRef, followConversation, roomKey);
  const scope: AgentLogScope = { type: "project", id: projectId, task };
  const messages = data?.messages || [];
  // A trigger starts a turn; assistant messages before the last one are its process.
  const groups: { trigger?: SessionMessage; notice?: SessionMessage; output: SessionMessage[] }[] =
    [];
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
  const navigatorMessages = groups.flatMap((group) => [
    ...(group.trigger
      ? [{ id: group.trigger.id, source: "human", body: group.trigger.text, author: "触发消息" }]
      : []),
    ...group.output
      .filter((message) => message.role === "assistant")
      .slice(-1)
      .map((message) => ({
        id: message.id,
        source: "local_ai",
        body: message.text,
        author: "老翁",
      })),
  ]);

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    setTrajectoryTotals(null);
    const load = async () => {
      try {
        const sessionRequest = api(
          "/projects/" + projectId + "/laoweng-sessions/" + task,
          undefined,
          "GET",
          controller.signal,
        );
        const trajectoryRequest = api(
          `/projects/${projectId}/agent-logs?task=${encodeURIComponent(task)}`,
          undefined,
          undefined,
          controller.signal,
        );
        const [sessionResult, trajectoryResult] = await Promise.allSettled([
          sessionRequest,
          trajectoryRequest,
        ]);
        if (sessionResult.status === "rejected") throw sessionResult.reason;
        const next = sessionResult.value;
        if (!controller.signal.aborted) {
          setData(next);
          setError("");
          setTrajectoryTotals(
            trajectoryResult.status === "fulfilled"
              ? buildTrajectory(trajectoryResult.value as AgentLogData, Date.now()).totals
              : null,
          );
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "会话读取失败");
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(load, 4000);
      }
    };
    void load();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [api, projectId, task]);

  const copy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
  };

  return (
    <Dialog
      onRequestClose={onClose}
      ref={dialog}
      className="memory-job-session-dialog dialog-fullscreen"
      aria-labelledby="memory-job-session-title"
    >
      <DialogHeader
        title={<>{title}</>}
        titleId="memory-job-session-title"
        subtitle={<>维护会话 · 只读</>}
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭维护会话"
        fullscreen
      />
      <div className="memory-job-session-toolbar">
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
      {view === "trajectory" ? (
        <section className="conversation-stage conversation-stage-trajectory" aria-label="轨迹">
          <Suspense fallback={<p className="muted">正在加载轨迹…</p>}>
            <AgentTrajectory key={task} scope={scope} api={api} />
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
              {!error && !messages.length ? (
                <div className="conversation-empty">
                  <h3>还没有会话内容</h3>
                  <p>运行之后，输入和回答会留在这里。不能在这里继续发言。</p>
                </div>
              ) : null}
              {groups.map((group, groupIndex) => {
                const finalIndex = group.output.findLastIndex(
                  (message) => message.role === "assistant",
                );
                const final = finalIndex >= 0 ? group.output[finalIndex] : undefined;
                const process = group.output.filter((_, index) => index !== finalIndex);
                const renderMessage = (message: SessionMessage, own: boolean) => (
                  <article
                    key={message.id}
                    className={own ? "message own" : "message"}
                    data-message-id={message.id}
                  >
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
                  <div key={group.trigger?.id || group.notice?.id || `output-${groupIndex}`}>
                    {group.notice && (
                      <div className="elder-mode-notice">
                        <span>{group.notice.text}</span>
                      </div>
                    )}
                    {group.trigger && renderMessage(group.trigger, true)}
                    {(process.length > 0 || final) && (
                      <article className="message memory-job-agent-turn">
                        <div className="message-content">
                          {process.length > 0 && (
                            <details className="memory-job-process">
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
            </div>
          </div>
          <ScrollToLatest
            conversationRef={conversationRef}
            followRef={followConversation}
            token={roomKey}
          />
          <div className="composer-context memory-job-session-footer">
            {trajectoryTotals && (
              <SessionUsage
                thread={{ replies: [], events: [] } as unknown as Thread}
                rounds={trajectoryTotals.turns}
                steps={trajectoryTotals.steps}
                showWithoutUsage
              />
            )}
            {data?.contextUsage && (
              <ContextMeter
                variant="footer"
                usage={data.contextUsage}
                writable={false}
                onCompact={async () => {}}
              />
            )}
          </div>
        </section>
      )}
    </Dialog>
  );
}
