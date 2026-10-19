import type { ConversationSelection } from "./use-conversation-selection";
/**
 * 会话舞台：消息列表与归档卡片、历史加载、消息菜单、引用与附件渲染、底部输入区。
 * 数据与回调由父组件打包成 props 传入；只在这里用到的懒加载组件也放在这里。
 */
/**
 * 会话舞台：消息列表与归档卡片、历史加载、消息菜单、引用与附件渲染、底部输入区。
 * 数据与回调由父组件打包成 props 传入；只在这里用到的懒加载组件也放在这里。
 */
/**
 * 会话舞台：消息列表与归档卡片、历史加载、消息菜单、引用与附件渲染、底部输入区。
 * 数据与回调由父组件打包成 props 传入；只在这里用到的懒加载组件也放在这里。
 */
/**
 * 会话舞台：消息列表与归档卡片、历史加载、消息菜单、引用与附件渲染、底部输入区。
 * 数据与回调由父组件打包成 props 传入；只在这里用到的懒加载组件也放在这里。
 */
import React, {
  lazy,
  Suspense,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  coordinatorTurnId,
  continuesCoordinatorTurn,
  isExecutorReply,
  isLastCoordinatorTurnPost,
  liveCoordinatorDraft,
  usageReplyForMessage,
} from "./chat-timeline";
import { MessageNavigator } from "./MessageNavigator";
import { IdentityName } from "./Identity";
import { MessageUsage } from "./MessageUsage";
import { RunElapsed } from "./LiveClock";
import { api } from "./workspace-api";
import { clipQuote } from "./workspace-format";
import { isImageFile } from "../shared/document-name.js";
import { formatTaskThreadNumber } from "../shared/task-thread-number.js";
import { UiIcon } from "./ui-icon";
import type { DialogueMode } from "./dialogue-mode-storage";
import { unreadMention, type ThreadMessage } from "./workspace-helpers";
import { AGENT_MEMBER } from "../shared/agent-member.js";
import type { ComposerController } from "./ChatComposer";
import type { PersonalProfile } from "./ProfileFields";
import type { AgentTask, Detail, MessageQuote, Thread } from "./workspace-types";

const MessageMarkdown = lazy(() =>
  import("./MessageMarkdown").then((module) => ({ default: module.MessageMarkdown })),
);
const StreamingMarkdown = lazy(() =>
  import("./StreamingMarkdown").then((module) => ({ default: module.StreamingMarkdown })),
);
const ChatComposer = lazy(() =>
  import("./ChatComposer").then((module) => ({ default: module.ChatComposer })),
);

export type ConversationStageProps = {
  selection: ConversationSelection;
  onOpenTasks: () => void;
  onOpenArchive: (thread: { id: string; title: string }) => void;
  uploadTarget: RefObject<((files: File[]) => void) | null>;
  refresh: () => Promise<void>;
  applyDialogueMode: (mode: DialogueMode) => void;
  sendOptimisticMessage: (
    targetThreadId: string,
    body: string,
    selectedRefs: string[],
    selectedFolderRefs?: string[],
    selectedQuotes?: MessageQuote[],
  ) => Promise<boolean>;
  threadView: "chat" | "trajectory" | "brief";
  threadId: string;
  historyLoading: boolean;
  user: PersonalProfile;
  copiedMessage: string;
  taskDialogOpen: boolean;
  projectId: string;
  busy: boolean;
  dialogueMode: DialogueMode;
  setMessageMenu: Dispatch<
    SetStateAction<{
      x: number;
      y: number;
      message: ThreadMessage;
      selectedText: string;
    } | null>
  >;
  chatMessages: ThreadMessage[];
  conversationRef: RefObject<HTMLDivElement | null>;
  followConversation: RefObject<boolean>;
  navigationUntil: RefObject<number>;
  composerAreaRef: RefObject<HTMLDivElement | null>;
  navigateMessage: () => void;
  loadHistory: () => Promise<void>;
  registerComposer: (controller: ComposerController | null, mountedThreadId?: string) => void;
  thread: Thread | null;
  timeline: ThreadMessage[];
  detail: Detail | null;
  liveCoordinator: Thread["replies"][number] | undefined;
  latestMyTask: AgentTask | null;
  active: boolean;
  coordinatorDraft: ReturnType<typeof liveCoordinatorDraft>;
  openMessageMenu: (event: ReactMouseEvent, message: ThreadMessage) => void;
  mentionAuthor: (message: ThreadMessage) => void;
  messageAvatar: (message: ThreadMessage) => string | null | undefined;
  messageMotto: (message: ThreadMessage) => string;
  renderAgentRound: (reply: Thread["replies"][number]) => ReactNode;
  renderRef: (ref: string) => ReactNode;
  renderMessageAttachments: (message: { refs?: string[]; folder_refs?: string[] }) => ReactNode;
  time: (text: string) => string;
  copyMessage: (message: MessageQuote, selectedText?: string) => Promise<void>;
  canQuoteMessage: (message: ThreadMessage) => boolean;
  quoteMessage: (message: ThreadMessage, selectedText?: string) => void;
  run: (task: () => Promise<void>) => Promise<void>;
  persistOptimisticMessage: (
    targetThreadId: string,
    optimisticId: string,
    payload: {
      body: string;
      refs: string[];
      folderRefs?: string[];
      quoteIds: string[];
      clientMessageId: string;
      dialogueMode: DialogueMode;
    },
    quotes: MessageQuote[],
  ) => Promise<void>;
};

export function ConversationStage({
  selection,
  onOpenTasks,
  onOpenArchive,
  threadView,
  threadId,
  historyLoading,
  user,
  copiedMessage,
  taskDialogOpen,
  projectId,
  busy,
  dialogueMode,
  setMessageMenu,
  chatMessages,
  conversationRef,
  followConversation,
  navigationUntil,
  composerAreaRef,
  navigateMessage,
  loadHistory,
  registerComposer,
  thread,
  timeline,
  detail,
  liveCoordinator,
  latestMyTask,
  active,
  coordinatorDraft,
  openMessageMenu,
  mentionAuthor,
  messageAvatar,
  messageMotto,
  renderAgentRound,
  renderRef,
  renderMessageAttachments,
  time,
  copyMessage,
  canQuoteMessage,
  quoteMessage,
  run,
  persistOptimisticMessage,
  uploadTarget,
  refresh,
  applyDialogueMode,
  sendOptimisticMessage,
}: ConversationStageProps) {
  const {
    files: refs,
    folders: folderRefs,
    quotes: quotedMessages,
    updateFiles: setRefs,
    updateFolders: setFolderRefs,
    showQuote: setQuotePreview,
  } = selection;

  if (!thread) return null;
  return (
    <>
      <div className="conversation-stage" hidden={threadView !== "chat"}>
        <MessageNavigator
          key={threadId}
          messages={chatMessages}
          container={conversationRef}
          onNavigate={navigateMessage}
        />
        <div
          className="conversation"
          aria-live="polite"
          ref={conversationRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            followConversation.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
            if (
              el.scrollTop < 80 &&
              !followConversation.current &&
              Date.now() > navigationUntil.current
            )
              void loadHistory();
          }}
        >
          {thread.status === "archived" && thread.archive_snapshot && (
            <div className="archive-card">
              <span className="eyebrow">迭代归档</span>
              <h3>本迭代已归档</h3>
              {thread.archive_snapshot.conclusion ? (
                <p>{thread.archive_snapshot.conclusion}</p>
              ) : null}
              <small>讨论、审核与引用的历史版本已固定保存；项目长期总结由知识库管理员整理。</small>
              <button
                type="button"
                onClick={() => onOpenArchive({ id: thread.id, title: thread.title })}
              >
                查看归档与交接记录
              </button>
            </div>
          )}
          {thread.page?.hasMore && (
            <button type="button" disabled={historyLoading} onClick={() => void loadHistory()}>
              <UiIcon name="history" size={13} />
              {historyLoading ? "正在加载历史消息…" : "加载更早的消息"}
            </button>
          )}
          <div className="timeline-start">
            <span>一次迭代，一段共同的上下文</span>
          </div>
          {!thread.messages.length && (
            <div className="conversation-empty">
              <h3>说说这次想解决的问题</h3>
              <p>分享背景、目标或一个还没有答案的问题。</p>
            </div>
          )}
          {timeline.map((m, index) => {
            const continuesTurn = continuesCoordinatorTurn(m, timeline[index - 1], thread.replies);
            const lastOfTurn = isLastCoordinatorTurnPost(m, timeline, thread.replies);
            const usageReply =
              m.source === "assistant" ? usageReplyForMessage(m, thread.replies, timeline) : null;
            return (
              <React.Fragment key={m.render_key || m.id}>
                <article
                  data-message-id={m.id}
                  className={`message ${m.author_id === user.id && m.source !== "assistant" ? "own" : ""} ${continuesTurn ? "turn-continue" : ""} ${unreadMention(m, thread.last_read_sequence, user) ? "mention-unread" : ""}`}
                  key={m.render_key || m.id}
                  onContextMenu={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        ".message-author-hit, .message-avatar-hit, .message-actions, a, button",
                      )
                    )
                      return;
                    openMessageMenu(event, m);
                  }}
                >
                  <span
                    className={`avatar ${m.source === "assistant" ? "ai" : ""} ${m.source === "assistant" || m.author_id !== user.id ? "message-avatar-hit" : ""}`}
                    aria-hidden={continuesTurn || undefined}
                    onContextMenu={(event) => {
                      if (continuesTurn) return;
                      if (m.source !== "assistant" && m.author_id === user.id) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setMessageMenu(null);
                      mentionAuthor(m);
                    }}
                  >
                    {!continuesTurn &&
                      (m.source === "assistant" ? (
                        <img loading="lazy" decoding="async" src={AGENT_MEMBER.avatar} alt="" />
                      ) : messageAvatar(m) ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={messageAvatar(m) || undefined}
                          alt=""
                        />
                      ) : (
                        m.author[0]
                      ))}
                  </span>
                  <div className="message-content">
                    {!continuesTurn && (
                      <div className="message-meta">
                        {unreadMention(m, thread.last_read_sequence, user) && (
                          <span className="mention-flag">未读提及</span>
                        )}
                        <span
                          className={`message-author ${m.source === "assistant" || m.author_id !== user.id ? "message-author-hit" : ""}`}
                          onContextMenu={(event) => {
                            if (m.source !== "assistant" && m.author_id === user.id) return;
                            event.preventDefault();
                            event.stopPropagation();
                            setMessageMenu(null);
                            mentionAuthor(m);
                          }}
                        >
                          <strong>
                            <IdentityName
                              role={
                                m.source === "assistant"
                                  ? AGENT_MEMBER.identity_tags[0]
                                  : m.author_role
                              }
                              name={m.source === "assistant" ? AGENT_MEMBER.name : m.author}
                            />
                          </strong>
                          {messageMotto(m) && (
                            <small>
                              {m.source === "assistant"
                                ? messageMotto(m)
                                : Array.from(messageMotto(m)).slice(0, 15).join("")}
                            </small>
                          )}
                        </span>
                        {m.source === "local_ai" && (
                          <span className="source-label">
                            <UiIcon name="connector" size={11} />
                            通过本地 AI 提交
                          </span>
                        )}
                        {m.source === "system" && (
                          <span className="source-label">
                            <UiIcon name="list" size={11} />
                            协作记录
                          </span>
                        )}
                      </div>
                    )}
                    {m.source === "assistant" &&
                      thread.replies
                        .filter((reply) => {
                          if (isExecutorReply(reply))
                            return m.agent_task_id === reply.message_id || reply.reply_id === m.id;
                          return (
                            reply.status === "failed" && m.id === `agent-task:${reply.message_id}`
                          );
                        })
                        .map((reply) => (
                          <React.Fragment key={reply.message_id}>
                            {renderAgentRound(reply)}
                          </React.Fragment>
                        ))}
                    {!!m.quotes?.length && (
                      <div className="message-quotes">
                        {m.quotes.map((q) => {
                          const imageRefs = (q.refs || []).filter((id) => {
                            const version = detail?.versions.find((item) => item.id === id);
                            return version && isImageFile(version);
                          });
                          return (
                            <div key={q.id} className="message-quote">
                              <button
                                type="button"
                                onClick={() =>
                                  void run(async () => {
                                    const result = await api(
                                      `/threads/${threadId}/messages/${q.id}`,
                                    );
                                    setQuotePreview(result.message);
                                  })
                                }
                              >
                                <strong>
                                  {q.source === "assistant" ? AGENT_MEMBER.name : q.author}
                                </strong>
                                <span title={clipQuote(q.body, 240)}>
                                  {clipQuote(q.body) || (imageRefs.length ? "图片" : "")}
                                </span>
                              </button>
                              {!!imageRefs.length && (
                                <div className="message-quote-thumbs">
                                  {imageRefs.map(renderRef)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="message-text">
                      {thread.updates
                        ?.filter((update) => update.message_id === m.id)
                        .map((update) => (
                          <p className="source-label" key={update.message_id}>
                            {update.delivered_at
                              ? "已更新当前任务"
                              : "已关联到当前任务，等待助手接收"}
                          </p>
                        ))}
                      <Suspense fallback={m.body}>
                        <MessageMarkdown body={m.body} />
                      </Suspense>
                    </div>
                    {renderMessageAttachments(m)}
                    {!!m.body.trim() && !m.id.startsWith("agent-reception:") && (
                      <div className="message-actions">
                        {m.author_id === user.id && m.source !== "assistant" && (
                          <time className="message-action-time">{time(m.created_at)}</time>
                        )}
                        <button
                          type="button"
                          title={copiedMessage === m.id ? "已复制" : "复制"}
                          aria-label={copiedMessage === m.id ? "已复制" : "复制"}
                          onClick={() => void copyMessage(m)}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            {copiedMessage === m.id ? (
                              <path d="m4 10 4 4 8-8" />
                            ) : (
                              <>
                                <rect x="3" y="7" width="11" height="11" rx="4" />
                                <path d="M7 4a4 4 0 0 1 4-3h3a4 4 0 0 1 4 4v5a4 4 0 0 1-2 3.5" />
                              </>
                            )}
                          </svg>
                        </button>
                        <button
                          type="button"
                          title="引用"
                          aria-label="引用"
                          disabled={!canQuoteMessage(m)}
                          onClick={() => quoteMessage(m)}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M8 5H3v6h5V5Zm9 0h-5v6h5V5ZM8 11c0 3-2 4-4 4m13-4c0 3-2 4-4 4" />
                          </svg>
                        </button>
                        {usageReply && (
                          <MessageUsage
                            record={usageReply}
                            finishedAt={usageReply.finished_at || m.created_at}
                            allowClockFallback={isExecutorReply(usageReply)}
                          />
                        )}
                        {(m.author_id !== user.id || m.source === "assistant") &&
                          (!coordinatorTurnId(m, thread.replies) ||
                            (lastOfTurn &&
                              !continuesCoordinatorTurn(
                                {
                                  source: "assistant",
                                  agent_task_id: liveCoordinator?.message_id,
                                },
                                m,
                                thread.replies,
                              ))) && (
                            <time className="message-action-time">{time(m.created_at)}</time>
                          )}
                      </div>
                    )}
                  </div>
                  {m.delivery_status === "sending" && (
                    <span
                      className="message-delivery-control sending"
                      role="status"
                      aria-label="正在发送"
                      title="正在发送"
                    />
                  )}
                  {m.delivery_status === "failed" && (
                    <button
                      type="button"
                      className="message-delivery-control failed"
                      aria-label="重新发送"
                      title={m.delivery_error || "重新发送"}
                      onClick={() =>
                        void persistOptimisticMessage(
                          threadId,
                          m.id,
                          {
                            body: m.body,
                            refs: m.refs,
                            folderRefs: m.folder_refs || [],
                            quoteIds: (m.quotes || []).map((quote) => quote.id),
                            clientMessageId: m.id.slice("optimistic:".length),
                            dialogueMode,
                          },
                          m.quotes || [],
                        )
                      }
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                        <path d="M20 4v7h-7" />
                      </svg>
                    </button>
                  )}
                </article>
              </React.Fragment>
            );
          })}
          {coordinatorDraft &&
            (() => {
              const draftContinues = continuesCoordinatorTurn(
                { source: "assistant", agent_task_id: liveCoordinator?.message_id },
                timeline[timeline.length - 1],
                thread.replies,
              );
              return (
                <article
                  className={`message${draftContinues ? " turn-continue" : ""}`}
                  data-message-id={`live-coordinator:${liveCoordinator?.message_id}`}
                  aria-live="polite"
                >
                  <span className="avatar ai" aria-hidden={draftContinues || undefined}>
                    {!draftContinues && (
                      <img loading="lazy" decoding="async" src={AGENT_MEMBER.avatar} alt="" />
                    )}
                  </span>
                  <div className="message-content">
                    {!draftContinues && (
                      <div className="message-meta">
                        <span className="message-author">
                          <strong>
                            <IdentityName
                              role={AGENT_MEMBER.identity_tags[0]}
                              name={AGENT_MEMBER.name}
                            />
                          </strong>
                        </span>
                      </div>
                    )}
                    <div className="message-text">
                      <Suspense fallback={coordinatorDraft}>
                        <StreamingMarkdown active text={coordinatorDraft} />
                      </Suspense>
                    </div>
                  </div>
                </article>
              );
            })()}
          {thread.runs
            .filter((r) => r.status === "running")
            .map((r) => (
              <div className="run-progress" role="status" key={r.id}>
                <strong>✧ {r.progress || "正在执行"}</strong>
                <span>
                  已用时 <RunElapsed createdAt={r.created_at} /> 秒
                </span>
                <small>你可以继续讨论或刷新页面，任务会在后台运行。</small>
              </div>
            ))}
          {thread.runs[0] && ["failed", "interrupted"].includes(thread.runs[0].status) && (
            <div className="reply-status failed" role="alert">
              {thread.runs[0].output} 可重新发起任务。
            </div>
          )}
        </div>
        <div className="composer-area" ref={composerAreaRef}>
          <div className="composer-toolbar">
            <div className="conversation-task-pool-wrap">
              <button
                type="button"
                className="conversation-task-pool"
                aria-haspopup="dialog"
                aria-expanded={taskDialogOpen}
                aria-label={
                  latestMyTask ? `打开本迭代任务，${latestMyTask.title}` : "打开本迭代任务"
                }
                onClick={() => onOpenTasks()}
              >
                <span className="conversation-task-pool-head">
                  <span className="conversation-task-pool-label">任务</span>
                </span>
                {latestMyTask ? (
                  <span
                    className="conversation-task-preview"
                    data-status={latestMyTask.status}
                    title={latestMyTask.title}
                  >
                    <span className="conversation-task-list-status" aria-hidden="true">
                      <i />
                    </span>
                    <span className="conversation-task-list-main">
                      <span className="conversation-task-list-number">
                        {formatTaskThreadNumber(latestMyTask.thread_number)}
                      </span>
                      <strong>{latestMyTask.title}</strong>
                    </span>
                  </span>
                ) : (
                  <span className="conversation-task-empty">暂无与我有关的任务</span>
                )}
              </button>
            </div>
          </div>
          {active ? (
            <Suspense
              fallback={
                <div className="composer-loading" role="status">
                  正在加载输入框…
                </div>
              }
            >
              {!!quotedMessages.length && (
                <div className="composer-quotes">
                  {quotedMessages.map((q) => (
                    <div key={q.id}>
                      <span title={clipQuote(q.body, 240)}>
                        引用 {q.source === "assistant" ? AGENT_MEMBER.name : q.author}：
                        {clipQuote(q.body)}
                      </span>
                      <button
                        type="button"
                        aria-label="取消引用"
                        onClick={() => selection.removeQuote(q.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <ChatComposer
                key={projectId + ":" + threadId}
                projectId={projectId}
                threadId={threadId}
                onController={registerComposer}
                refs={refs}
                setRefs={setRefs}
                folderRefs={folderRefs}
                setFolderRefs={setFolderRefs}
                versions={detail?.versions || []}
                folders={detail?.folders || []}
                members={detail?.members || []}
                currentUserId={user.id}
                busy={busy}
                uploadTarget={uploadTarget}
                onRefresh={refresh}
                dialogueMode={dialogueMode}
                onDialogueModeChange={applyDialogueMode}
                onSend={async (body) => {
                  const targetThreadId = threadId;
                  const selectedRefs = [...refs];
                  const selectedFolderRefs = [...folderRefs];
                  const selectedQuotes = [...quotedMessages];
                  const accepted = await sendOptimisticMessage(
                    targetThreadId,
                    body,
                    selectedRefs,
                    selectedFolderRefs,
                    selectedQuotes,
                  );
                  if (accepted) {
                    selection.clearDraft();
                  }
                  return accepted;
                }}
              />
            </Suspense>
          ) : (
            <div className="readonly">
              {thread.status === "archived"
                ? "此迭代已归档。历史讨论与文档可以继续查阅，也可以引用到新的迭代。"
                : thread.status === "archiving"
                  ? "此迭代正在归档，消息、任务与背景目标已冻结。"
                  : "你正在以只读成员身份查看此迭代。"}
              {thread.status === "archiving" && (
                <button
                  type="button"
                  onClick={() => onOpenArchive({ id: thread.id, title: thread.title })}
                >
                  审查归档方案
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
