/**
 * 小祥监控里点「会话」打开的任务会话：版式与记忆作业的维护会话一致。
 * 会话 / 轨迹同窗切换，底栏给回合、步数、用量与上下文；另外保留任务独有的
 * 待纳入消息、视觉验收截图和运行中的实时输出。
 */
import { useAgentLiveOutput } from "./useAgentLiveOutput";
import { AgentActivity } from "./AgentActivity";
import { buildTrajectory, type AgentLogData, type AgentLogScope } from "./trajectory-model";
import {
  MessageTime,
  SessionConversationDialog,
  type SessionApi,
} from "./SessionConversationDialog";
import type { TaskSessionData } from "./agent-monitor-types";

function agentLogsPath(scope: AgentLogScope) {
  if (scope.type === "wiki")
    return `/wiki-sessions/agent-logs?scope=${encodeURIComponent(scope.room)}&projectId=${scope.id}`;
  if (scope.type === "project")
    return `/projects/${scope.id}/agent-logs?task=${encodeURIComponent(scope.task)}`;
  if (scope.type === "thread") return `/threads/${scope.id}/agent-logs`;
  return `/tasks/${scope.id}/agent-logs`;
}

export function TaskSessionDialog({
  kicker,
  title,
  emptyIdle,
  path,
  compactPath,
  compactBody,
  live,
  scope = null,
  agentName,
  api,
  onClose,
}: {
  kicker: string;
  title: string;
  emptyIdle: string;
  path: string;
  compactPath: string;
  compactBody?: Record<string, string>;
  live?: { threadId: string; messageId: string };
  /** 轨迹页与回合/步数汇总用；没有对应任务日志时不传，只显示会话。 */
  scope?: AgentLogScope | null;
  agentName?: string;
  api: SessionApi;
  onClose: () => void;
}) {
  const liveRows = useAgentLiveOutput(live?.threadId || "", !!live);
  const liveOutput = live ? liveRows[live.messageId] : undefined;
  const sourceKey = path;
  const load = async (signal: AbortSignal) => {
    const [sessionResult, trajectoryResult] = await Promise.allSettled([
      api(path, undefined, undefined, signal),
      scope ? api(agentLogsPath(scope), undefined, undefined, signal) : Promise.resolve(null),
    ]);
    if (sessionResult.status === "rejected") throw sessionResult.reason;
    return {
      data: sessionResult.value as TaskSessionData,
      totals:
        trajectoryResult.status === "fulfilled" && trajectoryResult.value
          ? buildTrajectory(trajectoryResult.value as AgentLogData, Date.now()).totals
          : null,
    };
  };

  return (
    <SessionConversationDialog
      title={title}
      titleId="child-task-session-title"
      subtitle={(data) => (
        <>
          {kicker}
          {data?.progress ? <small>{data.progress}</small> : null}
        </>
      )}
      closeLabel="关闭任务会话"
      api={api}
      load={load}
      sourceKey={sourceKey}
      trajectory={scope}
      navigatorAuthor={agentName || "执行 Agent"}
      empty={(data) => (
        <p className="monitor-empty">
          {(data as TaskSessionData | null)?.running ? "正在写入原生会话…" : emptyIdle}
        </p>
      )}
      context={(data) => ({
        writable: !(data as TaskSessionData | null)?.running,
        onCompact: async () => {
          await api(compactPath, compactBody || {});
        },
      })}
      extras={(data) => {
        const task = data as TaskSessionData | null;
        const events = task?.events || [];
        const pending = task?.pending || [];
        const screenshots = live ? [] : events.filter((event) => event.screenshotUrl);
        return (
          <>
            {screenshots.map((event) => (
              <article key={`screenshot-${event.id}`} className="message">
                <div className="message-content">
                  <div className="message-actions">
                    <small>视觉验收 · {event.tool}</small>
                  </div>
                  <img
                    className="agent-screenshot-preview"
                    src={event.screenshotUrl || undefined}
                    alt="Agent 视觉验收截图"
                    loading="lazy"
                  />
                </div>
              </article>
            ))}
            {pending.map((item) => (
              <article key={item.id} className="message">
                <div className="message-content">
                  <div className="message-text">
                    <small>{item.author} · 待纳入</small>
                    <pre>{item.body}</pre>
                  </div>
                  <div className="message-actions">
                    <MessageTime value={item.createdAt} />
                  </div>
                </div>
              </article>
            ))}
            {task && (events.length || liveOutput?.content || liveOutput?.reasoning) ? (
              <div className="child-task-session-live">
                <AgentActivity
                  threadId={live?.threadId || ""}
                  messageId={live?.messageId || ""}
                  events={events}
                  output={liveOutput}
                  status={task.status || "running"}
                  progress={task.progress}
                  hasFinal={task.status === "completed"}
                  expanded={!!live}
                />
              </div>
            ) : null}
          </>
        );
      }}
      onClose={onClose}
    />
  );
}
