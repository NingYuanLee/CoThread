import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useComposerStageMetrics } from "./use-composer-stage";
import { AGENT_LAOWENG_PROFILE } from "../shared/agent-member.js";
import { MessageNavigator } from "./MessageNavigator";
import { ScrollToLatest } from "./ScrollToLatest";
import { useStickToBottom } from "./use-stick-to-bottom";
import { AgentToolIcon } from "./AgentToolIcon";
import type { PersonalProfile } from "./ProfileFields";
import type { ContextUsage } from "../shared/context.js";
import type { Detail, Thread } from "./workspace-types";
import { ContextMeter } from "./ContextMeter";
import { UiIcon } from "./ui-icon";
import { CompactionRow, type Compaction, useCompaction } from "./compaction";
import { MessageUsage } from "./MessageUsage";
import { StreamingStatus } from "./StreamingStatus";
import { SessionUsage } from "./SessionUsage";
import { CitationSources, type CiteItem } from "./CitationSources";
import {
  annotateWebCitations,
  citeGroupId,
  inferCitationKind,
  isPublicWebUrl,
} from "../shared/citations.js";

const MessageMarkdown = lazy(() =>
  import("./MessageMarkdown").then((module) => ({ default: module.MessageMarkdown })),
);
const ChatComposer = lazy(() =>
  import("./ChatComposer").then((module) => ({ default: module.ChatComposer })),
);
const AgentTrajectory = lazy(() =>
  import("./AgentLogDialog").then((module) => ({ default: module.AgentTrajectory })),
);

async function readElderStream(
  path: string,
  body: unknown,
  onProgress: (progress: {
    text: string;
    trace?: TraceStep[];
    usage?: Record<string, number> | null;
    contextUsage?: ContextUsage | null;
  }) => void,
) {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) throw new Error((await response.text()) || "老翁没有答上");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const event = part.match(/^event: (.+)$/m)?.[1] || "message";
      const data = part
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      const payload = data ? JSON.parse(data) : {};
      if (event === "error") throw new Error(payload.message || "老翁没有答上");
      if (event === "progress") onProgress(payload);
    }
  }
}

type TraceStep = {
  tool: string;
  label: string;
  status: string;
  input?: string;
  output?: string;
  text?: string;
};
type Turn = {
  id: string;
  body: string;
  createdAt: string;
  answer: {
    id: string;
    body: string;
    trace?: TraceStep[];
    citations: {
      id: string;
      label: string;
      pageId?: string | null;
      kind?: string;
      target?: string | null;
    }[];
    usage?: Record<string, unknown> | null;
  } | null;
};

function roundUsage(usage?: Record<string, unknown> | null) {
  if (!usage) return null;
  const duration = usage.executionDurationMs;
  if (usage.totalTokens == null && typeof duration !== "number") return null;
  return usage;
}

function withoutUnderstandingLabel(text: string) {
  return text.replace(/^(?:\s*我理解\s*[:：]\s*)+/, "");
}

function prefaceSteps(answer: Turn["answer"]) {
  const body = withoutUnderstandingLabel(answer?.body || "").trim();
  return (answer?.trace || []).filter((step) => {
    if (step.tool !== "understanding" && step.tool !== "assistant_text") return false;
    const text = withoutUnderstandingLabel(step.text || "").trim();
    if (!text) return false;
    if (!body) return true;
    return !body.includes(text) && !text.includes(body);
  });
}

function clock(text: string) {
  const value = new Date(text.replace(" ", "T") + (text.endsWith("Z") ? "" : "Z"));
  const today = new Date();
  const day = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((day(today) - day(value)) / 86400000);
  const time = value.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (daysAgo === 0) {
    const second = value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
    const period =
      second < 5 * 3600
        ? "凌晨"
        : second < 8 * 3600
          ? "早上"
          : second < 11 * 3600
            ? "上午"
            : second < 14 * 3600
              ? "中午"
              : second < 18 * 3600
                ? "下午"
                : second < 23 * 3600
                  ? "晚上"
                  : "深夜";
    return period + " " + time;
  }
  if (daysAgo === 1) return "昨天 " + time;
  if (daysAgo === 2) return "前天 " + time;
  return value.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) + " " + time;
}

export function ElderChat({
  api,
  projectId,
  user,
  members,
  versions,
  folders,
  view,
  threadId = "",
  onOpenThread,
  onOpenDocument,
  onOpenWiki,
}: {
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  projectId: string;
  user: PersonalProfile;
  members: Detail["members"];
  versions: Detail["versions"];
  folders: Detail["folders"];
  view: "chat" | "trajectory";
  threadId?: string;
  onOpenThread?: (id: string) => void;
  onOpenDocument?: (id: string) => void;
  onOpenWiki?: (id: string) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [openTrace, setOpenTrace] = useState<Record<string, boolean>>({});
  // 切换范围时在消息流里留一条小字提示（只在前端展示，不写库）。
  const [modeNotices, setModeNotices] = useState<
    { id: string; after: string | null; text: string }[]
  >([]);
  // 记住上次选的询问范围：重新打开问老翁不回到「当前项目」。
  const [scope, setScope] = useState<"project" | "company" | "web">(() => {
    const saved =
      typeof window === "undefined" ? null : window.localStorage.getItem("cothread-elder-scope");
    return saved === "company" || saved === "web" ? saved : "project";
  });
  const chooseScope = (next: "project" | "company" | "web") => {
    const labels = { project: "当前项目", company: "所属全部", web: "全网检索" } as const;
    if (next !== scope) {
      setModeNotices((previous) => [
        ...previous,
        {
          id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())) as string,
          after: turns.at(-1)?.id ?? null,
          text: `已切换到「${labels[next]}」`,
        },
      ]);
    }
    setScope(next);
    try {
      window.localStorage.setItem("cothread-elder-scope", next);
    } catch {
      /* 隐私模式下写不进去就算了 */
    }
  };
  const [pending, setPending] = useState("");
  const [live, setLive] = useState<{
    text: string;
    trace?: TraceStep[];
    usage?: Record<string, number> | null;
    contextUsage?: ContextUsage | null;
  } | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  // 底部统计的轮次取「有轨迹记录的提问数」，和轨迹页一致。
  const [rounds, setRounds] = useState<number | null>(null);
  const [steps, setSteps] = useState<number | null>(null);
  const [usage, setUsage] = useState<{
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    modelMs: number;
  } | null>(null);
  const [refs, setRefs] = useState<string[]>([]);
  const [folderRefs, setFolderRefs] = useState<string[]>([]);
  const uploadTarget = useRef<((files: File[]) => void) | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const composerAreaRef = useRef<HTMLDivElement>(null);
  useComposerStageMetrics(composerAreaRef, conversationRef, view);
  const followConversation = useRef(true);
  const followedRoom = useRef("");
  const roomKey = projectId + ":" + scope + ":" + view;
  if (followedRoom.current !== roomKey) {
    followedRoom.current = roomKey;
    followConversation.current = true;
  }
  useStickToBottom(conversationRef, followConversation, view === "chat" ? roomKey : "");

  // 三种范围共用同一段对话：带上 projectId，服务端按「人 + 项目」取会话。
  const roomPath =
    scope === "company"
      ? "/company/wiki-questions?projectId=" + encodeURIComponent(projectId)
      : scope === "web"
        ? "/network/wiki-questions?projectId=" + encodeURIComponent(projectId)
        : "/projects/" + projectId + "/wiki-questions";
  const applyRoom = (room: any) => {
    if (!room) return;
    setTurns(room.turns || []);
    setContextUsage(room.contextUsage || null);
    setUsage(room.usage || null);
    setRounds(typeof room.rounds === "number" ? room.rounds : null);
    setSteps(typeof room.steps === "number" ? room.steps : null);
  };
  const load = async () => {
    applyRoom(await api(roomPath));
  };
  useEffect(() => {
    let alive = true;
    // 范围切换共用同一段对话：不清空列表，避免切换时闪一下。
    load().catch((reason) => {
      if (alive) setError(reason?.message || "老翁这边没有打开");
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // 消息流里的压缩记录：点下就出现，轮询到结束再刷新；期间禁用发送与再次压缩。
  const compaction = useCompaction({
    start: () => api("/wiki-sessions/compact", { scope, projectId }, "POST"),
    status: async () => {
      const room = await api(roomPath);
      applyRoom(room);
      return {
        status: room?.contextUsage?.compactStatus || "idle",
        result: room?.contextUsage?.compactResult || null,
        error: room?.contextUsage?.compactError || null,
      };
    },
    anchor: () => turns.at(-1)?.id ?? null,
    onUpdate: () => void load(),
  });
  const compactingFromServer = ["queued", "running"].includes(contextUsage?.compactStatus || "");
  const compactRunning = compactingFromServer || compaction.running;
  // 刷新页面时压缩还在后台跑：用服务端状态补一条“压缩中”，别看起来像没点过。
  const serverCompaction: Compaction | null =
    !compaction.running && compactingFromServer
      ? { id: "server-compaction", after: turns.at(-1)?.id ?? null, status: "running" }
      : null;

  return (
    <section
      className={
        view === "trajectory"
          ? "conversation-stage conversation-stage-trajectory elder-stage"
          : "conversation-stage elder-stage"
      }
      aria-label="问老翁"
    >
      {view === "trajectory" ? (
        <Suspense fallback={<p className="muted">正在加载轨迹…</p>}>
          <AgentTrajectory
            key={projectId}
            scope={{ type: "wiki", id: projectId, room: scope }}
            api={api}
          />
        </Suspense>
      ) : (
        <>
          <MessageNavigator
            messages={turns.flatMap((turn) => [
              { id: turn.id, source: "human", body: turn.body, author: user.name },
              ...(turn.answer
                ? [
                    {
                      id: turn.answer.id,
                      source: "local_ai",
                      body: turn.answer.body,
                      author: AGENT_LAOWENG_PROFILE.nickname,
                    },
                  ]
                : []),
            ])}
            container={conversationRef}
            onNavigate={() => {
              followConversation.current = false;
            }}
          />
          <div className="conversation" aria-live="polite" ref={conversationRef}>
            <div className="conversation-stream">
              <div className="timeline-start">
                <span>
                  {scope === "company"
                    ? "包含你所在项目里的只读内容，并查公司公开指南"
                    : scope === "web"
                      ? "包含所属全部，并联网搜索和阅读"
                      : "只读查当前项目的项目记忆、文档、迭代、消息、任务和成员"}
                </span>
              </div>
              {error && <p role="alert">{error}</p>}
              {!turns.length && !pending && (
                <div className="conversation-empty">
                  <h3>
                    {scope === "company"
                      ? "问问你所在项目的记忆、项目文档和公司公开指南"
                      : scope === "web"
                        ? "在所属全部上再检索公开网页"
                        : "问问当前项目的记忆和项目文档"}
                  </h3>
                  <p>老翁会先说出理解，再边查边说。思考和查阅留在回答上面。</p>
                </div>
              )}
              {turns.map((turn) => (
                <div key={turn.id}>
                  <article className="message own" data-message-id={turn.id}>
                    <div className="message-content">
                      <div className="message-text">
                        <Suspense fallback={turn.body}>
                          <MessageMarkdown body={turn.body} />
                        </Suspense>
                      </div>
                      <div className="message-actions">
                        <time className="message-action-time">{clock(turn.createdAt)}</time>
                        <button
                          type="button"
                          title={copied === turn.id ? "已复制" : "复制"}
                          aria-label="复制"
                          onClick={() => {
                            void navigator.clipboard.writeText(turn.body);
                            setCopied(turn.id);
                          }}
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
                            {copied === turn.id ? (
                              <path d="m4 10 4 4 8-8" />
                            ) : (
                              <>
                                <rect x="3" y="7" width="11" height="11" rx="4" />
                                <path d="M7 4a4 4 0 0 1 4-3h3a4 4 0 0 1 4 4v5a4 4 0 0 1-2 3.5" />
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                    </div>
                  </article>
                  {turn.answer && (
                    <article className="message" data-message-id={turn.answer.id}>
                      <div className="message-content">
                        {prefaceSteps(turn.answer).map((step, index) => (
                          <div className="message-text" key={"say-" + index}>
                            <Suspense fallback={withoutUnderstandingLabel(step.text || "")}>
                              <MessageMarkdown body={withoutUnderstandingLabel(step.text || "")} />
                            </Suspense>
                          </div>
                        ))}
                        {!!turn.answer.trace?.some(
                          (step) =>
                            step.tool !== "understanding" &&
                            step.tool !== "assistant_text" &&
                            step.tool !== "thinking",
                        ) && (
                          <div className="agent-round">
                            <div
                              className="agent-trace"
                              data-open={openTrace[turn.answer.id] ? "true" : "false"}
                            >
                              <button
                                className="agent-status-line"
                                type="button"
                                aria-expanded={!!openTrace[turn.answer.id]}
                                title="点击展开或收起过程"
                                onClick={() =>
                                  setOpenTrace((current) => ({
                                    ...current,
                                    [turn.answer!.id]: !current[turn.answer!.id],
                                  }))
                                }
                              >
                                <span className="agent-current-step">已完成</span>
                                <svg
                                  className="agent-status-chevron"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 12 12"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path
                                    d={openTrace[turn.answer.id] ? "m3 7 3-3 3 3" : "m3 5 3 3 3-3"}
                                  />
                                </svg>
                              </button>
                              {openTrace[turn.answer.id] && (
                                <div className="agent-activity-items">
                                  {turn.answer.trace
                                    .filter(
                                      (step) =>
                                        step.tool !== "understanding" &&
                                        step.tool !== "assistant_text",
                                    )
                                    .map((step, index) =>
                                      step.tool === "thinking" ? (
                                        <div className="agent-phase thinking" key={index}>
                                          <div className="message-text">
                                            <Suspense fallback={step.text || ""}>
                                              <MessageMarkdown body={step.text || ""} />
                                            </Suspense>
                                          </div>
                                        </div>
                                      ) : (
                                        <details key={index}>
                                          <summary>
                                            <AgentToolIcon
                                              category="项目文档"
                                              status={
                                                step.status === "completed"
                                                  ? "completed"
                                                  : step.status
                                              }
                                            />
                                            <span className="agent-action-label">{step.label}</span>
                                            <small>
                                              {step.status === "completed" ? "完成" : step.status}
                                            </small>
                                          </summary>
                                          {step.input && <pre>{step.input}</pre>}
                                          {step.output && <pre>{step.output}</pre>}
                                        </details>
                                      ),
                                    )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="message-text">
                          <Suspense fallback={withoutUnderstandingLabel(turn.answer.body)}>
                            <MessageMarkdown
                              body={annotateWebCitations(
                                withoutUnderstandingLabel(turn.answer.body),
                                turn.answer.citations,
                              )}
                            />
                          </Suspense>
                        </div>
                        <CitationSources
                          items={turn.answer.citations || []}
                          onActivate={(item: CiteItem) => {
                            const group =
                              citeGroupId(item.kind) ||
                              citeGroupId(inferCitationKind(item.label, item.pageId));
                            if (item.target && isPublicWebUrl(item.target))
                              window.open(item.target, "_blank", "noopener,noreferrer");
                            else if (group === "thread" && item.target) onOpenThread?.(item.target);
                            else if ((group === "document" || group === "folder") && item.target)
                              onOpenDocument?.(item.target);
                            else if (item.pageId || group === "wiki")
                              onOpenWiki?.(item.pageId || item.target || "");
                            else if (item.target) onOpenDocument?.(item.target);
                          }}
                        />
                        <div className="message-actions">
                          <button
                            type="button"
                            title={copied === turn.answer.id ? "已复制" : "复制"}
                            aria-label="复制"
                            onClick={() => {
                              void navigator.clipboard.writeText(
                                withoutUnderstandingLabel(turn.answer?.body || ""),
                              );
                              setCopied(turn.answer!.id);
                            }}
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
                              {copied === turn.answer.id ? (
                                <path d="m4 10 4 4 8-8" />
                              ) : (
                                <>
                                  <rect x="3" y="7" width="11" height="11" rx="4" />
                                  <path d="M7 4a4 4 0 0 1 4-3h3a4 4 0 0 1 4 4v5a4 4 0 0 1-2 3.5" />
                                </>
                              )}
                            </svg>
                          </button>
                          {roundUsage(turn.answer.usage) && (
                            <MessageUsage
                              record={{ usage_stats: turn.answer.usage }}
                              allowClockFallback={false}
                            />
                          )}
                          <time className="message-action-time">{clock(turn.createdAt)}</time>
                        </div>
                      </div>
                    </article>
                  )}
                  {modeNotices
                    .filter((notice) => notice.after === turn.id)
                    .map((notice) => (
                      <div className="elder-mode-notice" key={notice.id}>
                        <span>{notice.text}</span>
                      </div>
                    ))}
                  {compaction.rows
                    .filter((item) => item.after === turn.id)
                    .map((item) => (
                      <CompactionRow
                        key={item.id}
                        item={item}
                        open={!!compaction.open[item.id]}
                        onToggle={() => compaction.toggle(item.id)}
                      />
                    ))}
                </div>
              ))}
              {modeNotices
                .filter((notice) => notice.after === null)
                .map((notice) => (
                  <div className="elder-mode-notice" key={notice.id}>
                    <span>{notice.text}</span>
                  </div>
                ))}
              {compaction.rows
                .filter((item) => item.after === null)
                .map((item) => (
                  <CompactionRow
                    key={item.id}
                    item={item}
                    open={!!compaction.open[item.id]}
                    onToggle={() => compaction.toggle(item.id)}
                  />
                ))}
              {serverCompaction && (
                <CompactionRow
                  key={serverCompaction.id}
                  item={serverCompaction}
                  open={!!compaction.open[serverCompaction.id]}
                  onToggle={() => compaction.toggle(serverCompaction.id)}
                />
              )}
              {pending && (
                <div>
                  <article className="message own">
                    <div className="message-content">
                      <div className="message-text">{pending}</div>
                    </div>
                  </article>
                  <article className="message">
                    <div className="message-content">
                      <div className="message-text">
                        <Suspense
                          fallback={
                            withoutUnderstandingLabel(live?.text || "") ||
                            "我先理解这个问题，然后边查边说。"
                          }
                        >
                          <MessageMarkdown
                            body={
                              withoutUnderstandingLabel(live?.text || "") ||
                              "我先理解这个问题，然后边查边说。"
                            }
                          />
                        </Suspense>
                      </div>
                      <StreamingStatus />
                    </div>
                  </article>
                </div>
              )}
            </div>
          </div>
          <div className="composer-area" ref={composerAreaRef}>
            <Suspense
              fallback={
                <div className="composer-loading" role="status">
                  正在加载输入框…
                </div>
              }
            >
              <ChatComposer
                projectId={projectId}
                threadId={"elder:" + projectId}
                refs={refs}
                setRefs={setRefs}
                folderRefs={folderRefs}
                setFolderRefs={setFolderRefs}
                versions={versions as never}
                folders={folders as never}
                members={members}
                currentUserId={user.id}
                busy={!!pending || compactRunning}
                uploadTarget={uploadTarget}
                onRefresh={load}
                modes={[
                  {
                    id: "project",
                    icon: "library",
                    accent: "#426b4b",
                    surface: "#e7f0df",
                    label: "当前项目",
                    summary: "只读查项目记忆、文档、迭代、消息、任务和成员",
                  },
                  {
                    id: "company",
                    icon: "organize",
                    accent: "#2a7fd4",
                    surface: "#e8f3fc",
                    label: "所属全部",
                    summary: "包含你所在项目里的这些内容，并查公司公开指南",
                  },
                  {
                    id: "web",
                    icon: "globe",
                    accent: "#e8590c",
                    surface: "#fff1e6",
                    label: "全网检索",
                    summary: "包含所属全部，并联网搜索和阅读",
                  },
                ]}
                mode={scope}
                onModeChange={(next) => {
                  if (next === "project" || next === "company" || next === "web") chooseScope(next);
                }}
                mentions={false}
                onSend={async (body) => {
                  followConversation.current = true;
                  setPending(body);
                  setLive(null);
                  setError("");
                  void readElderStream(
                    roomPath,
                    scope === "project"
                      ? { body, ...(threadId ? { threadId } : {}) }
                      : { body, organization: true, projectId, ...(threadId ? { threadId } : {}) },
                    setLive,
                  )
                    .then(() => load())
                    .catch((reason) => setError(reason?.message || "老翁没有答上"))
                    .finally(() => {
                      setPending("");
                      setLive(null);
                    });
                  return true;
                }}
              />
            </Suspense>
            {(live?.contextUsage || contextUsage) && (
              <div className="composer-context">
                <SessionUsage
                  thread={
                    {
                      replies: usage ? [{ usage_stats: usage }] : [],
                      events: [],
                      toolDurationMs: usage?.modelMs ?? null,
                    } as unknown as Thread
                  }
                  rounds={rounds ?? turns.length}
                  steps={steps ?? (usage as { calls?: number } | null)?.calls ?? undefined}
                />
                <ContextMeter
                  variant="footer"
                  usage={(live?.contextUsage || contextUsage) as ContextUsage}
                  writable
                  onCompact={compaction.run}
                />
              </div>
            )}
          </div>
          <ScrollToLatest
            conversationRef={conversationRef}
            followRef={followConversation}
            token={view === "chat" ? roomKey : ""}
          />
        </>
      )}
    </section>
  );
}
