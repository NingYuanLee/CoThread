/**
 * 记忆作业的维护会话：版式对齐工作空间里的问老翁，会话和轨迹在同一个弹窗里切换。
 * 只读，没有输入框。
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ContextUsage } from "../shared/context.js";
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

type SessionMessage = { id: string; role: string; source: string | null; text: string };
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
  const roomKey = view === "chat" ? projectId + ":" + task : "";
  useStickToBottom(conversationRef, followConversation, roomKey);
  const scope: AgentLogScope = { type: "project", id: projectId, task };
  const messages = data?.messages || [];

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    const load = async () => {
      try {
        const next = await api(
          "/projects/" + projectId + "/laoweng-sessions/" + task,
          undefined,
          "GET",
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setData(next);
          setError("");
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
        actions={
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
        }
      />
      {view === "trajectory" ? (
        <section className="conversation-stage conversation-stage-trajectory" aria-label="轨迹">
          <Suspense fallback={<p className="muted">正在加载轨迹…</p>}>
            <AgentTrajectory key={task} scope={scope} api={api} />
          </Suspense>
        </section>
      ) : (
        <section className="conversation-stage elder-stage" aria-label="会话">
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
              {messages.map((message, index) => {
                const text = message.text || "";
                if (message.role === "system") {
                  return (
                    <div className="elder-mode-notice" key={message.id || index}>
                      <span>{text}</span>
                    </div>
                  );
                }
                const own = message.role !== "assistant";
                return (
                  <article
                    key={message.id || index}
                    className={own ? "message own" : "message"}
                    data-message-id={message.id || String(index)}
                  >
                    <div className="message-content">
                      <div className="message-text">
                        <Suspense fallback={text}>
                          <MessageMarkdown body={text} />
                        </Suspense>
                      </div>
                      <div className="message-actions">
                        <button
                          type="button"
                          title={copied === message.id ? "已复制" : "复制"}
                          aria-label="复制"
                          onClick={() => copy(message.id || String(index), text)}
                        >
                          <UiIcon name={copied === message.id ? "check" : "copy"} size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          <ScrollToLatest
            conversationRef={conversationRef}
            followRef={followConversation}
            token={roomKey}
          />
        </section>
      )}
    </Dialog>
  );
}
